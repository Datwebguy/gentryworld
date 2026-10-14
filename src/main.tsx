import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { WalletSessionProvider } from './wallet'
import './style.css'
import './redesign.css'

type ErrorBoundaryState = { failed: boolean }

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleRouteChange)
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleRouteChange)
  }

  handleRouteChange = () => {
    if (this.state.failed) this.setState({ failed: false })
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GentrY render error', error, info.componentStack)
    const scrub = (value: unknown) => String(value || '')
      .replace(/0x[a-f\d]{40,}/gi, '[wallet-or-hash]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
      .slice(0, 1800)
    const report = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: scrub(error.name), message: scrub(error.message), componentStack: scrub(info.componentStack),
      route: window.location.hash.replace(/[^#a-z0-9-]/gi, '').slice(0, 80),
    }
    void fetch('/api/client-errors', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {})
  }

  render() {
    if (this.state.failed) {
      return <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, color: '#f4f5ed', background: '#111a16', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>This page hit a problem.</h1>
        <p style={{ maxWidth: 420, margin: 0, color: '#b7c2b9', lineHeight: 1.6 }}>Reload the page. If you just approved a payment, check your wallet before trying again.</p>
        <button onClick={() => window.location.reload()} style={{ justifySelf: 'start', marginTop: 8, padding: '12px 18px', border: 0, borderRadius: 8, background: '#b7dd83', color: '#111a16', fontWeight: 700, cursor: 'pointer' }}>Reload GentrY</button>
      </main>
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppErrorBoundary><WalletSessionProvider><App /></WalletSessionProvider></AppErrorBoundary></React.StrictMode>,
)
