import { memo, useId, useMemo, useState } from 'react'
import { Empty } from './DataView'
import { money, numeric } from '../utils/format'
import { closestPrice, priceSeries } from '../utils/chart'

export default function HistoryChart({ data, compact = false }) {
  const series = useMemo(() => priceSeries(data), [data])
  const [hover, setHover] = useState(null), [style, setStyle] = useState('area')
  const gradientId = useId()
  if (!series) return <Empty title="No price history available" message="Historical prices are unavailable for this company and period."/>
  const { values, prices, low, high, x, y, line, positive, firstTime, duration } = series
  const selected = hover === null ? values.length - 1 : Math.min(hover, values.length - 1)
  const color = positive ? 'var(--positive)' : 'var(--negative)'
  const selectedX = x(values[selected]), selectedY = y(values[selected][1])
  function move(event) {
    if (event.pointerType === 'touch' && event.buttons === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 800 - 18) / 690))
    setHover(closestPrice(values, firstTime + fraction * duration))
  }
  return <><div className="chart-area"><div className="history-point"><span>{String(values[selected][0])} · {prices.label || 'Price'}</span><strong>{money(values[selected][1])}</strong><div className="chart-style" role="group" aria-label="Chart style">{['area', 'line'].map(value => <button key={value} className={value === style ? 'selected' : ''} aria-pressed={value === style} onClick={() => setStyle(value)}>{value === 'area' ? 'Area' : 'Line'}</button>)}</div></div><svg viewBox="0 0 800 295" role="img" aria-label={`Historical price chart from ${values[0][0]} to ${values.at(-1)[0]}`} onPointerMove={move} onPointerLeave={() => setHover(null)}><defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>{[0, 1, 2, 3, 4].map(index => { const price = low + (high - low) * index / 4; return <g key={index}><line x1="18" x2="708" y1={y(price)} y2={y(price)} className="chart-grid"/><text x="725" y={y(price) + 4} className="chart-axis">{numeric(price)}</text></g> })}{style === 'area' && <path d={`${line} L${x(values.at(-1))},252 L18,252 Z`} fill={`url(#${gradientId})`}/>}<path d={line} className="chart-line" style={{ stroke: color }}/><line x1={selectedX} x2={selectedX} y1="14" y2="252" className="chart-crosshair"/><line x1="18" x2="708" y1={selectedY} y2={selectedY} className="chart-crosshair"/><circle cx={selectedX} cy={selectedY} r="4" fill={color} className="chart-point"/><text x="18" y="282" className="chart-axis">{values[0][0]}</text><text x="350" y="282" textAnchor="middle" className="chart-axis">{values[Math.floor(values.length / 2)][0]}</text><text x="708" y="282" textAnchor="end" className="chart-axis">{values.at(-1)[0]}</text></svg><label className="chart-scrubber"><span>Explore history</span><input type="range" aria-label="Explore historical price points" aria-valuetext={`${values[selected][0]}, ${money(values[selected][1])}`} min="0" max={values.length - 1} value={selected} onChange={event => setHover(Number(event.target.value))}/><span>{values.length.toLocaleString('en-IN')} points</span></label></div>{!compact && <HistoryTable key={`${values[0][0]}-${values.at(-1)[0]}-${values.length}`} series={series}/>}</>
}
const HistoryTable = memo(function HistoryTable({ series }) {
  const [page, setPage] = useState(0)
  const { values, volumes, hasVolume } = series
  const pageSize = 25, pages = Math.ceil(values.length / pageSize)
  const rows = useMemo(() => values.slice(Math.max(0, values.length - (page + 1) * pageSize), values.length - page * pageSize).toReversed(), [values, page])
  return <details className="history-data"><summary>Historical data <span>{values.length.toLocaleString('en-IN')} records</span></summary><div className="history-table-wrap"><table className="stock-table"><caption className="sr-only">Historical prices. Open, high, low, and close are not returned by the v1 price dataset.</caption><thead><tr><th>DATE</th><th>PRICE</th>{hasVolume && <th>VOLUME</th>}</tr></thead><tbody>{rows.map((value, index) => <tr key={`${value[0]}-${index}`}><td>{String(value[0])}</td><td>{money(value[1])}</td>{hasVolume && <td>{numeric(volumes.get(String(value[0])))}</td>}</tr>)}</tbody></table></div><div className="table-pagination"><span>Page {page + 1} of {pages}</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Newer</button><button className="button secondary" disabled={page + 1 === pages} onClick={() => setPage(value => value + 1)}>Older</button></div></div></details>
})
