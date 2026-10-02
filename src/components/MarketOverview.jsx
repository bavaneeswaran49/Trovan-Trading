import { lazy, Suspense, useState } from 'react'
import { useResource } from '../hooks/useResource'
import { stocks } from '../api/services'
import { Change, Tabs } from './MarketComponents'
import { ResourceState } from './DataView'
import Icon from './Icon'
import { money, number, numeric, stockRow } from '../utils/format'

const HistoryChart = lazy(() => import('./HistoryChart'))
const periods = [['1m', '1M'], ['6m', '6M'], ['1yr', '1Y'], ['3yr', '3Y'], ['5yr', '5Y'], ['max', 'ALL']]

export function MarketSnapshot({ resource }) {
  const gainers = resource.data?.trending_stocks?.top_gainers || []
  const losers = resource.data?.trending_stocks?.top_losers || []
  const best = gainers.map(stockRow).filter(row => number(row.change) !== null).sort((a, b) => number(b.change) - number(a.change))[0]
  const worst = losers.map(stockRow).filter(row => number(row.change) !== null).sort((a, b) => number(a.change) - number(b.change))[0]
  const ready = Boolean(resource.data)
  return <section className="market-snapshot" aria-label="Trending stock snapshot">
    <Snapshot label="Trending gainers" value={ready ? numeric(gainers.length) : '—'} detail="Stocks in the provider's gainers list" tone="positive" icon="ipo" loading={resource.loading}/>
    <Snapshot label="Trending decliners" value={ready ? numeric(losers.length) : '—'} detail="Stocks in the provider's losers list" tone="negative" icon="chart" loading={resource.loading}/>
    <Snapshot label="Leading gainer" value={best ? `+${numeric(best.change)}%` : '—'} detail={best?.name || 'Awaiting market data'} tone="positive" loading={resource.loading}/>
    <Snapshot label="Leading decliner" value={worst ? `${number(worst.change) > 0 ? '+' : ''}${numeric(worst.change)}%` : '—'} detail={worst?.name || 'Awaiting market data'} tone={number(worst?.change) > 0 ? 'positive' : 'negative'} loading={resource.loading}/>
  </section>
}
function Snapshot({ label, value, detail, tone, icon = 'arrow', loading }) {
  return <article className={`snapshot-card ${loading ? 'snapshot-loading' : ''}`}><div className="snapshot-label">{label}<Icon name={icon} size={16}/></div><strong className={tone}>{value}</strong><p title={detail}>{detail}</p></article>
}
export function QuoteStrip({ resource }) {
  const rows = (resource.data?.trending_stocks?.top_gainers || []).slice(0, 5).map(stockRow)
  if (!rows.length) return <div className="quote-strip quote-strip-empty"><span className="exchange-label">NSE / BSE</span><span>Indian equities</span><span className="quote-disclaimer">Provider snapshots · Prices may be delayed</span></div>
  // return <div className="quote-strip" aria-label="Trending stock quotes"><span className="exchange-label">MARKET PULSE</span><div className="quote-items">{rows.map((row, i) => <a href={`#/stock/${encodeURIComponent(row.name || row.symbol || '')}`} key={`${row.symbol || row.name}-${i}`}><b>{row.symbol || row.name}</b><span>{money(row.price)}</span><Change value={row.change}/></a>)}</div></div>
}
export function FeaturedChart({ resource }) {
  const rows = (resource.data?.trending_stocks?.top_gainers || []).slice(0, 8).map(stockRow).filter(row => row.name || row.symbol)
  const [selected, setSelected] = useState(''), [period, setPeriod] = useState('1yr')
  const row = rows.find(row => (row.name || row.symbol) === selected) || rows[0]
  const name = row?.name || row?.symbol
  const history = useResource(name ? stocks.history(name, period) : null)
  return <section className="panel featured-chart"><div className="panel-heading"><div><span className="eyebrow">CHART WORKSPACE</span><h2>See the bigger picture</h2></div><a href={name ? `#/stock/${encodeURIComponent(name)}` : '#/search'} className="text-link">Full analysis <Icon name="arrow" size={14}/></a></div><ResourceState resource={resource}><div className="chart-instrument"><div><label className="sr-only" htmlFor="chart-stock">Chart stock</label><select id="chart-stock" value={name || ''} onChange={event => setSelected(event.target.value)}>{rows.map((row, i) => <option value={row.name || row.symbol} key={`${row.name}-${i}`}>{row.name || row.symbol}</option>)}</select><span className="stock-symbol">{row?.symbol || 'INDIAN EQUITIES'} · PRICE HISTORY</span></div><div className="chart-quote"><strong>{money(row?.price)}</strong><Change value={row?.change}/></div></div><div className="chart-toolbar"><span><span className="status-dot"/>Historical prices</span><Tabs values={periods} selected={period} setSelected={setPeriod}/></div>{name ? <ResourceState resource={history}><Suspense fallback={<div className="chart-loading" role="status">Preparing chart…</div>}><HistoryChart data={history.data} compact/></Suspense></ResourceState> : <div className="empty"><p>Select a stock to see its price history.</p></div>}</ResourceState><div className="panel-foot"><Icon name="shield" size={12}/>Actual provider data · Historical performance</div></section>
}
