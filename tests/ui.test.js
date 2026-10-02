import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
let vite, HistoryChart, NewsList, Fields, StockTable, StockDetails, ResourceState, MarketSnapshot
before(async () => {
  vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' })
  HistoryChart = (await vite.ssrLoadModule('/src/components/HistoryChart.jsx')).default
  NewsList = (await vite.ssrLoadModule('/src/components/NewsList.jsx')).default
  Fields = (await vite.ssrLoadModule('/src/components/DataView.jsx')).Fields
  ResourceState = (await vite.ssrLoadModule('/src/components/DataView.jsx')).ResourceState
  MarketSnapshot = (await vite.ssrLoadModule('/src/components/MarketOverview.jsx')).MarketSnapshot
  StockTable = (await vite.ssrLoadModule('/src/components/MarketComponents.jsx')).StockTable
  StockDetails = (await vite.ssrLoadModule('/src/screens/StockDetails.jsx')).default
})
after(async () => { await vite?.close() })
const render = (Component, props) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  try { return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(Component, props))) }
  finally { client.clear() }
}
test('history renders actual price dates and matched volumes without invented OHLC', () => {
  const html = render(HistoryChart, { data: { datasets: [{ metric: 'Price', label: 'Price on NSE', values: [['2024-01-01', '100'], ['2024-01-02', '120']] }, { metric: 'Volume', values: [['2024-01-01', 1234]] }] } })
  assert.match(html, /2024-01-01/)
  assert.match(html, /₹120/)
  assert.match(html, /1,234/)
  assert.doesNotMatch(html, /<th>OPEN|<th>HIGH|<th>LOW|<th>CLOSE/)
  assert.match(html, /role="img"/)
})
test('empty history has a clear state; zero price and volume remain valid', () => {
  assert.match(render(HistoryChart, { data: { datasets: [] } }), /No price history available/)
  const html = render(HistoryChart, { data: { datasets: [{ metric: 'Price', values: [['2024-01-01', 0]] }, { metric: 'Volume', values: [['2024-01-01', 0]] }] } })
  assert.match(html, /₹0/)
  assert.doesNotMatch(html, /NaN|Infinity/)
})
test('historical period selector exposes only the seven verified v1 periods', () => {
  const html = render(StockDetails, { name: 'Test' })
  for (const period of ['1m', '6m', '1yr', '3yr', '5yr', '10yr', 'max']) assert.match(html, new RegExp(`value="${period}"`))
  assert.doesNotMatch(html, /value="1D"|value="1W"/)
})
test('news uses available titles, image, source and link; absent fields stay absent', () => {
  const html = render(NewsList, { data: [{ title: 'Test story', source: 'Test publisher', published_at: '2024-01-01', image_url: 'https://example.test/news.png', url: 'https://example.test/story' }] })
  assert.match(html, /Test story/)
  assert.match(html, /Test publisher/)
  assert.match(html, /src="https:\/\/example.test\/news.png"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(render(NewsList, { data: [] }), /No news available/)
  const minimal = render(NewsList, { data: [{ title: 'Only a title' }] })
  assert.doesNotMatch(minimal, /Read the story|<img|Published/)
})
test('untrusted text and URLs do not turn into executable markup', () => {
  const html = render(Fields, { data: { text: '<script>alert(1)</script>', link: 'javascript:alert(1)' } })
  assert.doesNotMatch(html, /<script>|href="javascript:/)
  assert.match(html, /&lt;script&gt;/)
  const news = render(NewsList, { data: [{ title: '<img onerror=alert(1)>', url: 'javascript:alert(1)', image: 'javascript:alert(1)' }] })
  assert.doesNotMatch(news, /href="javascript:|src="javascript:|<img onerror/)
})
test('stock movement signs are accessible without relying on color alone', () => {
  const html = render(StockTable, { rows: [{ company: 'Up', ticker: 'UP', price: 10, percent_change: 1 }, { company: 'Down', ticker: 'DOWN', price: 20, percent_change: -1 }] })
  assert.match(html, /↗ \+1%/)
  assert.match(html, /↘ -1%/)
  assert.match(html, /#\/stock\/Up/)
})
test('market summary uses actual provider rows and does not invent unavailable values', () => {
  const empty = render(MarketSnapshot, { resource: { loading: false, error: new Error('No data') } })
  assert.match(empty, /Awaiting market data/)
  assert.doesNotMatch(empty, /0%/)
  const html = render(MarketSnapshot, { resource: { data: { trending_stocks: {
    top_gainers: [{ company: 'Best', percent_change: 4 }, { company: 'Other', percent_change: 2 }],
    top_losers: [{ company: 'Worst', percent_change: -3 }],
  } } } })
  assert.match(html, /\+4%/)
  assert.match(html, /-3%/)
  assert.match(html, /Best/)
  assert.match(html, /Worst/)
})
test('long histories and market tables render bounded numbers of rows', () => {
  const values = Array.from({ length: 1000 }, (_, index) => [new Date(Date.UTC(2023, 0, index + 1)).toISOString().slice(0, 10), index])
  const history = render(HistoryChart, { data: { datasets: [{ metric: 'Price', values }] } })
  assert.equal((history.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) || []).length, 25)
  assert.match(history, /Page 1 of 40/)
  const stocks = render(StockTable, { rows: Array.from({ length: 1000 }, (_, index) => ({ company: `Stock ${index}`, price: index })) })
  assert.equal((stocks.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) || []).length, 25)
  assert.match(stocks, /1–25 of 1000 stocks/)
})
test('a failed background refresh leaves previous data visible with a clear notice', () => {
  const html = render(ResourceState, { resource: { data: [1], error: new Error('Failed') }, children: React.createElement('p', null, 'Previous quote') })
  assert.match(html, /Showing previously loaded data/)
  assert.match(html, /Previous quote/)
  assert.doesNotMatch(html, /Data unavailable/)
})
