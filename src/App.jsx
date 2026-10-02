import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useIsFetching, useMutation, useQuery } from '@tanstack/react-query'
import './App.css'
import { api } from './api/client'
import { marketKey, queryClient, resetSession, sessionKey } from './api/queryClient'
import Icon, { Logo } from './components/Icon'
import { Empty, Skeleton } from './components/DataView'

const Login = lazy(() => import('./auth/Login'))
const screens = () => import('./screens/Screens')
const Dashboard = lazy(() => screens().then(m => ({ default: m.Dashboard })))
const MarketScreen = lazy(() => screens().then(m => ({ default: m.MarketScreen })))
const SearchScreen = lazy(() => screens().then(m => ({ default: m.SearchScreen })))
const NewsScreen = lazy(() => screens().then(m => ({ default: m.NewsScreen })))
const FundsScreen = lazy(() => screens().then(m => ({ default: m.FundsScreen })))
const FundDetails = lazy(() => screens().then(m => ({ default: m.FundDetails })))
const SimpleScreen = lazy(() => screens().then(m => ({ default: m.SimpleScreen })))
const StockDetails = lazy(() => import('./screens/StockDetails'))
const navigation = [['/', 'Overview', 'grid'], ['/market', 'Markets', 'chart'], ['/search', 'Discover stocks', 'search'], ['/news', 'Market news', 'news'], ['/funds', 'Mutual funds', 'fund'], ['/ipo', 'IPOs', 'ipo'], ['/commodities', 'Commodities', 'commodity']]
const subscribe = callback => { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback) }
const snapshot = () => window.location.hash.slice(1) || '/'
function initialTheme() { try { return localStorage.getItem('trovan-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } }

export default function App() {
  const session = useQuery({ queryKey: sessionKey, queryFn: ({ signal }) => api('/api/auth/session', { signal }), retry: false, staleTime: 120_000 })
  const user = session.data?.user
  const [mobile, setMobile] = useState(false), [search, setSearch] = useState(''), [theme, setTheme] = useState(initialTheme)
  const searchRef = useRef(null)
  const fetching = useIsFetching({ queryKey: marketKey })
  const route = useSyncExternalStore(subscribe, snapshot), url = new URL(route, 'https://trovan.local'), pathname = url.pathname
  const onLogin = useCallback(async user => { await resetSession(user); window.location.hash = '/' }, [])
  const logout = useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST', body: '{}' }),
    onSuccess: async () => { await resetSession(); window.google?.accounts?.id?.disableAutoSelect(); window.location.hash = '/' },
  })
  useEffect(() => {
    const expire = () => { void resetSession(); window.google?.accounts?.id?.disableAutoSelect() }
    window.addEventListener('session-expired', expire)
    return () => window.removeEventListener('session-expired', expire)
  }, [])
  useEffect(() => {
    if (session.error?.status === 401 && user) void resetSession()
  }, [session.error, user])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('trovan-theme', theme) } catch { /* Device preferences are optional. */ }
  }, [theme])
  useEffect(() => {
    const shortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'Escape') setMobile(false)
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  function submitSearch(event) { event.preventDefault(); if (search.trim()) { window.location.hash = `/search?q=${encodeURIComponent(search.trim())}`; setMobile(false) } }
  if (session.isPending) return <div className="boot"><Logo/><Skeleton/></div>
  if (!user) return <ScreenBoundary><Suspense fallback={<div className="boot"><Logo/><Skeleton/></div>}>{session.error && session.error.status !== 401 && <div className="connection-banner" role="alert">{session.error.message}<button className="text-link" onClick={() => session.refetch()}>Reconnect</button></div>}<Login onLogin={onLogin}/></Suspense></ScreenBoundary>
  const activeRoute = pathname.startsWith('/stock') ? '/search' : pathname.startsWith('/fund/') ? '/funds' : pathname
  const title = navigation.find(([path]) => path === activeRoute)?.[1] || 'Profile'
  let screen
  if (pathname === '/') screen = <Dashboard user={user}/>
  else if (pathname === '/market') screen = <MarketScreen/>
  else if (pathname === '/search') screen = <SearchScreen initialQuery={url.searchParams.get('q') || ''} key={url.search}/>
  else if (pathname.startsWith('/stock/')) screen = <StockDetails name={decodePath(pathname.slice(7))} key={pathname}/>
  else if (pathname === '/news') screen = <NewsScreen/>
  else if (pathname === '/funds') screen = <FundsScreen/>
  else if (pathname.startsWith('/fund/')) screen = <FundDetails name={decodePath(pathname.slice(6))} key={pathname}/>
  else if (pathname === '/ipo') screen = <SimpleScreen type="ipo"/>
  else if (pathname === '/commodities') screen = <SimpleScreen type="commodities"/>
  else if (pathname === '/profile') screen = <><div className="page-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Your profile</h1><p>A familiar face behind your market perspective.</p></div></div><section className="panel profile-panel"><Avatar user={user} large/><h2>{user.name}</h2><p>{user.isGuest ? 'Exploring without an account.' : user.email}</p><span className="badge"><Icon name="shield" size={14}/>{user.isGuest ? 'Guest session' : 'Signed in with Google'}</span><button className="button secondary" onClick={() => logout.mutate()} disabled={logout.isPending}><Icon name="logout" size={16}/>Sign out</button></section></>
  else screen = <Empty title="Page not found" message="Choose a page from the navigation to continue."/>
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>{mobile && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside className={`sidebar ${mobile ? 'is-open' : ''}`}><a className="brand-link" href="#/" onClick={() => setMobile(false)} aria-label="Trovan overview"><Logo/></a><span className="nav-label">YOUR TERMINAL</span><nav aria-label="Main navigation">{navigation.map(([path, title, icon]) => <a href={`#${path}`} key={path} className={activeRoute === path ? 'active' : ''} aria-current={activeRoute === path ? 'page' : undefined} onClick={() => setMobile(false)}><Icon name={icon}/><span>{title}</span>{activeRoute === path && <i/>}</a>)}</nav><div className="sidebar-note"><span className="badge"><span className="status-dot"/>INDIAN MARKETS</span><h3>A sharper view.<br/>A clearer decision.</h3><p>Company research, market activity, and price history in one workspace.</p><a href="#/search" onClick={() => setMobile(false)}>Explore a company <Icon name="arrow" size={15}/></a></div><div className="sidebar-bottom"><a href="#/profile" onClick={() => setMobile(false)}><Avatar user={user}/><span><strong>{user.name}</strong><small>{user.isGuest ? 'Guest workspace' : 'Personal workspace'}</small></span></a><button className="icon-button" onClick={() => logout.mutate()} disabled={logout.isPending} aria-label="Sign out"><Icon name="logout" size={18}/></button></div></aside>
    <div className="app-main"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobile} onClick={() => setMobile(v => !v)}><Icon name="menu"/></button><span>Workspace <Icon name="chevron" size={13}/> <strong>{title}</strong></span></div><form className="global-search" onSubmit={submitSearch}><Icon name="search" size={17}/><input ref={searchRef} aria-label="Search stocks" placeholder="Search company or symbol" value={search} maxLength={160} onChange={event => setSearch(event.target.value)}/><kbd>Ctrl K</kbd><button type="submit" aria-label="Search"><Icon name="arrow" size={16}/></button></form><div className="topbar-actions"><button className={`icon-button ${fetching ? 'is-refreshing' : ''}`} aria-label="Refresh market data" disabled={Boolean(fetching)} onClick={() => queryClient.invalidateQueries({ queryKey: marketKey })}><Icon name="refresh" size={18}/></button><button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18}/></button><a href="#/profile" className="topbar-avatar" aria-label="Your profile"><Avatar user={user}/></a></div></header><main id="main-content" tabIndex={-1} className="content">{logout.error && <div className="inline-error" role="alert">{logout.error.message}</div>}<ScreenBoundary key={pathname}><Suspense fallback={<Skeleton/>}>{screen}</Suspense></ScreenBoundary><footer className="app-footer"><span><span className="status-dot"/>Market data powered by Indian API</span><span>INR · NSE / BSE · Prices may be delayed</span></footer></main></div></div>
}
function Avatar({ user, large = false }) { return user.picture && /^https:\/\//.test(user.picture) ? <img referrerPolicy="no-referrer" className={`avatar ${large ? 'large' : ''}`} src={user.picture} alt=""/> : <span className={`avatar ${large ? 'large' : ''}`}>{user.name?.slice(0, 1).toUpperCase()}</span> }
function decodePath(value) { try { return decodeURIComponent(value) } catch { return value } }
class ScreenBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <div className="error-state" role="alert"><h3>This view could not load</h3><p>Reload to get the latest version of Trovan.</p><button className="button" onClick={() => window.location.reload()}>Reload workspace</button></div> : this.props.children }
}
