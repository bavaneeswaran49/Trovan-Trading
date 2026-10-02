import { useMemo, useState } from 'react'
import Icon from './Icon'
import { Empty, ResourceState } from './DataView'
import { money, number, numeric, stockRow } from '../utils/format'

export function Heading({ eyebrow = 'YOUR MARKET, AT A GLANCE', title, description, children }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="heading-aside">{children}</div></div> }
export function Change({ value }) { const n = number(value); return n === null ? <span>—</span> : <span className={`movement ${n >= 0 ? 'positive' : 'negative'}`}>{n >= 0 ? '↗ +' : '↘ '}{numeric(n)}%</span> }
export function StockTable({ rows = [], extra, limit }) {
  const [sort, setSort] = useState({ key: null, direction: 'descending' }), [page, setPage] = useState(0)
  const ordered = useMemo(() => {
    const normalized = rows.map(stockRow)
    if (!sort.key) return normalized
    return normalized.toSorted((a, b) => {
      const aValue = number(a[sort.key]), bValue = number(b[sort.key])
      if (aValue === null) return bValue === null ? 0 : 1
      if (bValue === null) return -1
      return (aValue - bValue) * (sort.direction === 'ascending' ? 1 : -1)
    })
  }, [rows, sort])
  if (!rows.length) return <Empty title="No stocks to show" message="There are no stocks in this group right now. Market data can be empty outside trading hours."/>
  const pageSize = limit || 25, pages = Math.ceil(ordered.length / pageSize), currentPage = limit ? 0 : Math.min(page, pages - 1)
  function sortBy(key) { setPage(0); setSort(previous => ({ key, direction: previous.key === key && previous.direction === 'descending' ? 'ascending' : 'descending' })) }
  function column(title, key) {
    return <th aria-sort={sort.key === key ? sort.direction : 'none'}><button className="table-sort" onClick={() => sortBy(key)} aria-label={`Sort by ${title.toLowerCase()}, ${sort.key === key && sort.direction === 'descending' ? 'ascending' : 'descending'}`}>{title}<span aria-hidden="true">{sort.key === key ? sort.direction === 'ascending' ? '↑' : '↓' : '↕'}</span></button></th>
  }
  return <><div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>COMPANY</th>{column('PRICE', 'price')}{column(extra === 'high' ? '52W HIGH' : extra === 'low' ? '52W LOW' : 'CHANGE', extra === 'high' ? 'high' : extra === 'low' ? 'low' : 'change')}{extra === 'volume' && column('VOLUME', 'volume')}</tr></thead><tbody>{ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row, index) => <tr key={`${row.symbol || row.name}-${index}`}><td><a href={`#/stock/${encodeURIComponent(row.name || row.symbol || '')}`} className="stock-company"><span className="company-initial">{String(row.symbol || row.name || 'S').slice(0, 2).toUpperCase()}</span><span><span className="stock-name">{row.name || row.symbol || 'Unnamed stock'}</span>{row.symbol && <span className="stock-symbol">{row.symbol}</span>}</span></a></td><td>{money(row.price)}</td><td>{extra === 'high' ? money(row.high) : extra === 'low' ? money(row.low) : <Change value={row.change}/>}</td>{extra === 'volume' && <td>{numeric(row.volume)}</td>}</tr>)}</tbody></table></div>{!limit && pages > 1 && <div className="table-pagination"><span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, ordered.length)} of {ordered.length} stocks</span><div><button className="button secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="button secondary" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}</>
}
export function StockPanel({ title, resource, rows, extra, limit, children }) { return <section className="panel" aria-busy={resource.loading || resource.refreshing}><div className="panel-heading"><h2>{title}</h2>{children || <button className="icon-button" aria-label={`Refresh ${title}`} disabled={resource.refreshing} onClick={resource.retry}><Icon name="refresh" size={15}/></button>}</div><ResourceState resource={resource}><StockTable rows={rows || (Array.isArray(resource.data) ? resource.data : [])} extra={extra} limit={limit}/></ResourceState>{resource.meta?.fetchedAt && <div className="panel-foot"><span className="status-dot"/>Fetched {new Date(resource.meta.fetchedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST · Indian API</div>}</section> }
export function Tabs({ values, selected, setSelected, className = 'tabs' }) { return <div className={className} role="group" aria-label="Choose data view">{values.map(([key, title]) => <button key={key} className={key === selected ? 'selected' : ''} aria-pressed={key === selected} onClick={() => setSelected(key)}>{title}</button>)}</div> }
