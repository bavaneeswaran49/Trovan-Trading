import Icon from './Icon'
import { label, safeUrl } from '../utils/format'
export function Skeleton() { return <div className="skeleton-wrap" role="status" aria-label="Loading market data">{[1, 2, 3, 4].map(n => <div className="skeleton-row" key={n}><i/><span/><b/></div>)}<span className="sr-only">Loading…</span></div> }
export function Empty({ title = 'No data available', message = 'The provider has no data for this selection right now.' }) { return <div className="empty"><span className="empty-icon"><Icon name="chart" size={26}/></span><h3>{title}</h3><p>{message}</p></div> }
export function ResourceState({ resource, children }) {
  if (resource.loading) return <Skeleton/>
  if (resource.error && resource.data == null) return <div className="error-state" role="alert"><Icon name="globe" size={25}/><h3>{resource.error.code === 'RATE_LIMITED' ? 'A little breather' : 'Data unavailable'}</h3><p>{resource.error.message}</p>{resource.error.retryAfter && <small>Try again in {resource.error.retryAfter} seconds.</small>}<button className="button secondary" onClick={resource.retry}><Icon name="refresh" size={16}/>Try again</button></div>
  if (resource.data === undefined || resource.data === null) return <Empty/>
  return <>{resource.refreshing && <div className="resource-refresh" role="status">Updating market data…</div>}{resource.error && <div className="stale-warning" role="status">Showing previously loaded data. Refresh failed. <button onClick={resource.retry}>Try again</button></div>}{children}</>
}
export function Fields({ data, depth = 0 }) {
  if (data === null || data === undefined || data === '') return null
  if (typeof data !== 'object') {
    const url = typeof data === 'string' ? safeUrl(data) : null
    return url ? <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">Open source <Icon name="arrow" size={14}/></a> : <span className="field-value">{String(data)}</span>
  }
  if (depth > 6) return <p>Additional information is available from the data provider.</p>
  const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (!entries.length) return <Empty/>
  return <div className={Array.isArray(data) ? 'record-list' : 'fields'}>{entries.map(([key, value]) => typeof value === 'object' ? <details key={key} className="data-detail" open={depth === 0 && entries.length < 4}><summary>{Array.isArray(data) ? `Record ${Number(key) + 1}` : label(key)}</summary><Fields data={value} depth={depth + 1}/></details> : <div className="field" key={key}><dt>{Array.isArray(data) ? `Value ${Number(key) + 1}` : label(key)}</dt><dd><Fields data={value} depth={depth + 1}/></dd></div>)}</div>
}
export function DataPanel({ title, resource }) { return <section className="panel"><div className="panel-heading"><h2>{title}</h2><button className="icon-button" aria-label={`Refresh ${title}`} onClick={resource.retry}><Icon name="refresh" size={16}/></button></div><ResourceState resource={resource}><Fields data={resource.data}/></ResourceState></section> }
