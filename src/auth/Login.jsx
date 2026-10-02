import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { authConfigOptions } from '../api/queryClient'
import Icon, { Logo } from '../components/Icon'

let googleScript
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!googleScript) googleScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => { googleScript = null; script.remove(); reject(new Error('Google sign-in took too long to load. Please try again.')) }, 15000)
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true
    script.onload = () => { clearTimeout(timer); resolve() }; script.onerror = () => { clearTimeout(timer); googleScript = null; script.remove(); reject(new Error('Unable to connect to Google. Check your internet connection and try again.')) }
    document.head.appendChild(script)
  })
  return googleScript
}
export default function Login({ onLogin }) {
  const mount = useRef(null), signing = useRef(false), [googleStatus, setGoogleStatus] = useState('loading'), [scriptError, setScriptError] = useState('')
  const config = useQuery(authConfigOptions())
  const guest = useMutation({ mutationFn: () => api('/api/auth/guest', { method: 'POST', body: '{}' }), onSuccess: result => onLogin(result.user) })
  const google = useMutation({ mutationFn: credential => api('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }), onSuccess: result => onLogin(result.user) })
  const signInGoogle = google.mutateAsync
  const readyConfig = config.data
  useEffect(() => {
    if (!readyConfig?.clientId) return
    let active = true
    loadGoogle().then(() => {
      if (!active) return
      window.google.accounts.id.initialize({ client_id: readyConfig.clientId, nonce: readyConfig.nonce, auto_select: false,
        callback: async ({ credential }) => {
          if (signing.current || !active) return
          signing.current = true
          try { await signInGoogle(credential) } catch { /* Mutation exposes the error in the form. */ }
          finally { signing.current = false }
        } })
      window.google.accounts.id.renderButton(mount.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 320 })
      setGoogleStatus('ready')
    }).catch(error => { if (active) { setScriptError(error.message); setGoogleStatus('error') } })
    return () => { active = false }
  }, [readyConfig, signInGoogle])
  const signingIn = guest.isPending || google.isPending
  async function loginGuest() {
    if (signing.current || signingIn) return
    signing.current = true
    try { await guest.mutateAsync() } catch { /* Mutation exposes the error in the form. */ }
    finally { signing.current = false }
  }
  const error = config.error?.message || scriptError || google.error?.message
  const status = config.isFetching ? 'loading' : config.error ? 'error' : !config.data?.clientId ? 'unconfigured' : googleStatus
  function retryGoogle() { setScriptError(''); setGoogleStatus('loading'); google.reset(); void config.refetch() }
  return <main className="login-page">
    <section className="login-story"><Logo/><div className="login-copy"><span className="eyebrow light">A CLEARER EDGE IN THE INDIAN MARKET</span><h1>Find your<br/>next <em>perspective.</em></h1><p>A considered workspace for Indian equities. Follow the movement, explore the data, and see the bigger picture.</p><div className="login-features">{[['01', 'The market, in focus', 'Movers, activity, and new highs.'], ['02', 'Every detail matters', 'Company research and interactive price history.'], ['03', 'A broader perspective', 'Market news, mutual funds, and IPOs.']].map(([n, title, text]) => <div key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div><Icon name="arrow" size={18}/></div>)}</div></div><div className="login-bottom"><span>RESEARCH WITH INTENTION</span><span>INDIA <span className="india-dot"/> NSE · BSE</span></div></section>
    <section className="login-form-side"><div className="login-top">YOUR MARKET. YOUR PERSPECTIVE.</div><div className="login-form"><span className="welcome-symbol"><Icon name="chart" size={29}/></span><span className="eyebrow">WELCOME TO YOUR WORKSPACE</span><h2>Make your next<br/>move a clearer one.</h2><p>Sign in to Trovan and explore<br/>the Indian stock market.</p><div className="google-signin" inert={signingIn}><div ref={mount} hidden={status !== 'ready'} aria-label="Continue with Google"/>{status !== 'ready' && <button className="google-button" disabled={status === 'loading' || signingIn} onClick={() => { if (status === 'unconfigured') setScriptError('Google sign-in is not configured yet. You can explore as a guest.'); else retryGoogle() }}><span className="google-letter">G</span>{status === 'loading' ? 'Preparing sign-in…' : status === 'error' ? 'Try Google sign-in again' : 'Continue with Google'}</button>}</div>{google.isPending && <p role="status">Signing you in…</p>}{error && <p className="login-error" role="alert">{error}{google.error && <button className="text-link" onClick={retryGoogle}>Prepare sign-in again</button>}</p>}<div className="login-divider"><span/>OR EXPLORE FIRST<span/></div><button className="button guest-button" onClick={loginGuest} disabled={signingIn}>{guest.isPending ? 'Opening your workspace…' : 'Continue as guest'}<Icon name="arrow" size={16}/></button>{guest.error && <p className="login-error" role="alert">{guest.error.message}</p>}<div className="privacy-note"><Icon name="shield" size={19}/><p>Secure sign-in with Google.<br/>No account needed to explore as a guest.</p></div></div><footer className="login-footer"><span>© {new Date().getFullYear()} Trovan</span><span>Clarity is an advantage.</span></footer></section>
  </main>
}
