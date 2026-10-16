import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { useWalletSession } from './wallet'

type Market = { id: number; symbol: string; mark: number; sizeDecimals?: number }
export type TradeIntent = { direction?: 'long' | 'short'; notional?: string; leverage?: string }
type Props = { market: Market; intent?: TradeIntent; walletAddress: string; onConnect: () => void | Promise<void>; onClose: () => void; onNotice: (message: string) => void }
type Execution = { market: string; notional: number; size: number; transaction: string; perplAccountId: string }

const supportedMarkets = new Set([16, 32, 48, 64])
const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export function PerplTrader({ market, intent, walletAddress, onConnect, onClose, onNotice }: Props) {
  const { provider: walletProvider } = useWalletSession()
  const [notional, setNotional] = useState(intent?.notional || '10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Execution | null>(null)
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    void fetch('/api/vault/status').then((response) => response.json()).then((payload) => { if (active) setReady(Boolean(payload.ready)) }).catch(() => { if (active) setReady(false) })
    return () => { active = false }
  }, [])

  const estimate = useMemo(() => {
    const amount = Number(notional)
    if (!Number.isFinite(amount) || amount <= 0 || !(market.mark > 0)) return null
    return { size: amount / market.mark, amount }
  }, [notional, market.mark])

  async function execute(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!walletAddress) { await onConnect(); return }
    if (!walletProvider) { setError('Your Privy wallet is still getting ready. Try again in a moment.'); return }
    setBusy(true)
    try {
      const amount = Number(notional)
      const nonce = crypto.randomUUID()
      const message = `GentrY Testnet vault order\nWallet: ${walletAddress.toLowerCase()}\nMarket: ${market.id}\nNotional: ${amount}\nNonce: ${nonce}`
      const signature = await walletProvider.request({ method: 'personal_sign', params: [message, walletAddress] }) as string
      const response = await fetch('/api/vault/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ marketId: market.id, notional: amount, address: walletAddress, nonce, signature }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not execute the managed order.')
      setResult(payload)
      onNotice(`${payload.market} order submitted through the GentrY vault.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not execute the managed order.')
    } finally { setBusy(false) }
  }

  const available = supportedMarkets.has(market.id)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="modal perpl-trader-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title">
      <button className="close-button" aria-label="Close order panel" disabled={busy} onClick={onClose}><X size={19} /></button>
      <span className="modal-kicker">GENTRY VAULT · PERPL · MONAD TESTNET</span>
      <h2 id="trade-title">Trade {market.symbol} Perpetual</h2>
      <p>Review the order, then GentrY submits it through its funded Perpl vault. Your Privy wallet signs you in; no separate trading credentials are required.</p>

      {!result && <>
        <div className="perpl-privacy"><ShieldCheck size={15} /><span>Vault account is funded in test AUSD and each order stays inside its onchain market cap.</span></div>
        {!available && <div className="perpl-inline-error">This market is not enabled in the managed vault yet. Choose BTC, ETH, SOL, or MON.</div>}
        {ready === false && <div className="perpl-inline-error">Managed execution is reconnecting. Try again shortly.</div>}
        <form className="perpl-order-form" onSubmit={(event) => void execute(event)}>
          <div className="trade-direction"><button type="button" className="active long">Buy / Long</button></div>
          <div className="trade-fields"><label htmlFor="trade-notional">Order value (AUSD)<input id="trade-notional" type="number" min="0.01" max="100" step="any" inputMode="decimal" value={notional} onChange={(event) => setNotional(event.target.value)} required /><div className="trade-preset-pills">{['5', '10', '25', '50', '100'].map((value) => <button type="button" key={value} onClick={() => setNotional(value)}>${value}</button>)}</div></label></div>
          <div className="order-review"><div><span>Market</span><strong>{market.symbol} Perpetual</strong></div><div><span>Mark price</span><strong>{money(market.mark)}</strong></div><div><span>Approx. size</span><strong>{estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : '—'}</strong></div><div><span>Execution account</span><strong>GentrY vault</strong></div></div>
          <button className="primary-button wide" disabled={busy || !available || ready !== true || !estimate}>{busy ? <><LoaderCircle className="spin" size={16} />Submitting on Monad…</> : 'Execute protected order'}</button>
        </form>
      </>}

      {result && <div className="order-result"><div className="success-icon"><Check size={22} /></div><h3>Order submitted</h3><p>{result.size.toFixed(market.sizeDecimals ?? 4)} {result.market} was submitted from the GentrY vault.</p><div className="order-review"><div><span>Order value</span><strong>{money(result.notional)}</strong></div><div><span>Perpl account</span><strong>#{result.perplAccountId}</strong></div></div><div className="perpl-tx-proof"><strong>Confirmed on Monad Testnet</strong><a href={`https://testnet.monadscan.com/tx/${result.transaction}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14} /></a></div><button className="primary-button wide" onClick={() => setResult(null)}>Trade again</button><button className="secondary-button wide" onClick={onClose}>Done</button></div>}
      {error && <div className="perpl-inline-error" role="alert">{error}</div>}
      <p className="perpl-network-note">Monad Testnet · Perpl orderbook execution with onchain settlement.</p>
    </section>
  </div>
}
