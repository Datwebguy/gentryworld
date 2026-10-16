import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, LoaderCircle, Share2, ShieldCheck, X } from 'lucide-react'
import { useWalletSession } from './wallet'
import { PnlCardModal } from './PnlCardModal'

type Market = { id: number; symbol: string; mark: number; sizeDecimals?: number }
export type TradeIntent = { direction?: 'long' | 'short'; notional?: string; leverage?: string }
type Props = { market: Market; intent?: TradeIntent; walletAddress: string; onConnect: () => void | Promise<void>; onClose: () => void; onNotice: (message: string) => void }
type Execution = { market: string; side?: 'long' | 'short'; notional: number; size: number; transaction: string; perplAccountId: string }

export type VaultPosition = {
  id: string
  address: string
  marketId: number
  symbol: string
  side: 'long' | 'short'
  leverage?: number
  size: number
  lots: string
  notional: number
  initialMargin?: number
  entryPrice: number
  openedAt: number
  transaction: string
  status: 'open' | 'closed'
  currentMark: number
  currentNotional: number
  unrealizedPnl: number
  roePct?: number
  pnlPct: number
  liquidationPrice?: number
  realizedPnl?: number
  realizedRoePct?: number
  closePrice?: number
  closedAt?: number
  closeTransaction?: string
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export function PerplTrader({ market, intent, walletAddress, onConnect, onClose, onNotice }: Props) {
  const { provider: walletProvider } = useWalletSession()
  const [side, setSide] = useState<'long' | 'short'>(intent?.direction || 'long')
  const [notional, setNotional] = useState(intent?.notional || '10')
  const [leverage, setLeverage] = useState<number>(Number(intent?.leverage || 10))
  const [busy, setBusy] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Execution | null>(null)
  const [ready, setReady] = useState<boolean | null>(null)
  const [positions, setPositions] = useState<VaultPosition[]>([])
  const [pnlCardPosition, setPnlCardPosition] = useState<VaultPosition | null>(null)
  const [walletBalances, setWalletBalances] = useState<{ mon: string; ausd: string } | null>(null)
  const [claimingFaucet, setClaimingFaucet] = useState(false)

  useEffect(() => {
    if (intent?.direction) setSide(intent.direction)
    if (intent?.notional) setNotional(intent.notional)
    if (intent?.leverage) setLeverage(Number(intent.leverage))
  }, [intent])

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return
    try {
      const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(walletAddress)}`)
      if (res.ok) {
        const data = await res.json()
        setWalletBalances({ mon: `${data.mon} MON`, ausd: `$${data.ausd.toFixed(2)} AUSD` })
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  useEffect(() => {
    void fetchBalances()
  }, [fetchBalances])

  async function claimFaucet() {
    if (!walletAddress) return
    setClaimingFaucet(true)
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      })
      if (res.ok) {
        onNotice('Claimed 500 AUSD from faucet to your wallet!')
        void fetchBalances()
      } else {
        const err = await res.json()
        setError(err.error || 'Could not claim faucet tokens.')
      }
    } catch {
      setError('Faucet claim request failed.')
    } finally {
      setClaimingFaucet(false)
    }
  }

  useEffect(() => {
    let active = true
    void fetch('/api/vault/status')
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return
        setReady(Boolean(payload.ready))
      })
      .catch(() => { if (active) setReady(false) })
    return () => { active = false }
  }, [])

  const fetchPositions = useCallback(async () => {
    if (!walletAddress) return
    try {
      const response = await fetch(`/api/vault/positions?address=${encodeURIComponent(walletAddress)}`)
      if (response.ok) {
        const payload = await response.json()
        setPositions(Array.isArray(payload.positions) ? payload.positions : [])
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  useEffect(() => {
    void fetchPositions()
    const interval = setInterval(() => void fetchPositions(), 3000)
    return () => clearInterval(interval)
  }, [fetchPositions])

  const estimate = useMemo(() => {
    const amount = Number(notional)
    if (!Number.isFinite(amount) || amount <= 0 || !(market.mark > 0)) return null
    return { size: amount / market.mark, amount }
  }, [notional, market.mark])

  const presets = ['10', '25', '50', '100', '250', '500']
  const available = true

  async function execute(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!walletAddress) { await onConnect(); return }
    if (!walletProvider) { setError('Your Privy wallet is still getting ready. Try again in a moment.'); return }
    if (!estimate || estimate.amount <= 0) { setError('Enter a valid order value.'); return }
    setBusy(true)
    try {
      const amount = Number(notional)
      const nonce = crypto.randomUUID()
      const issuedAt = Date.now()
      const message = `GentrY Testnet vault order\nWallet: ${walletAddress.toLowerCase()}\nMarket: ${market.id}\nSide: ${side}\nNotional: ${amount}\nIssued at: ${issuedAt}\nNonce: ${nonce}`
      const signature = await walletProvider.request({ method: 'personal_sign', params: [message, walletAddress] }) as string
      const response = await fetch('/api/vault/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marketId: market.id, side, notional: amount, leverage, address: walletAddress, nonce, issuedAt, signature })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not execute the managed order.')
      setResult(payload)
      onNotice(`${payload.market} ${side.toUpperCase()} order submitted through the GentrY vault.`)
      void fetchPositions()
      void fetchBalances()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not execute the managed order.')
    } finally { setBusy(false) }
  }

  async function closePosition(pos: VaultPosition) {
    if (!walletAddress) { await onConnect(); return }
    if (!walletProvider) { setError('Your Privy wallet is still getting ready. Try again in a moment.'); return }
    setError('')
    setClosingId(pos.id)
    try {
      const nonce = crypto.randomUUID()
      const issuedAt = Date.now()
      const message = `GentrY Testnet close position\nWallet: ${walletAddress.toLowerCase()}\nPosition: ${pos.id}\nIssued at: ${issuedAt}\nNonce: ${nonce}`
      const signature = await walletProvider.request({ method: 'personal_sign', params: [message, walletAddress] }) as string
      const response = await fetch('/api/vault/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positionId: pos.id, address: walletAddress, nonce, issuedAt, signature })
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not close this position.')
      onNotice(`Closed ${pos.side.toUpperCase()} ${pos.symbol} position with ${Number(payload.realizedPnl || 0) >= 0 ? '+' : ''}$${Number(payload.realizedPnl || 0).toFixed(2)} PnL.`)
      void fetchPositions()
      void fetchBalances()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close this position.')
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !closingId) onClose() }}>
      <section className="modal perpl-trader-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title">
        <button className="close-button" aria-label="Close order panel" disabled={busy || Boolean(closingId)} onClick={onClose}><X size={19} /></button>
        <span className="modal-kicker">GENTRY VAULT · PERPL · MONAD TESTNET</span>
        <h2 id="trade-title">Trade {market.symbol} Perpetual</h2>
        <p>Review the order, then GentrY submits it through its funded Perpl vault. Your Privy wallet signs you in; no separate trading credentials are required.</p>

        {/* User Connected Wallet Balance in simplicity */}
        {walletAddress && walletBalances && (
          <div className="wallet-balance-bar" style={{ marginBottom: 12 }}>
            <div className="wallet-balance-item">
              <span className="wallet-balance-dot" />
              <span>{walletBalances.mon}</span>
            </div>
            <span style={{ color: 'var(--line)' }}>|</span>
            <div className="wallet-balance-item">
              <span>{walletBalances.ausd}</span>
            </div>
            <button
              type="button"
              className="faucet-claim-pill"
              disabled={claimingFaucet}
              onClick={() => void claimFaucet()}
            >
              {claimingFaucet ? 'Claiming…' : '+ Claim 500 AUSD'}
            </button>
          </div>
        )}

        {!result && <>
          <div className="perpl-privacy"><ShieldCheck size={15} /><span>Vault account is funded in test AUSD and each order stays inside its onchain market cap. Privy asks for a signature before GentrY submits it.</span></div>
          {!available && <div className="perpl-inline-error">This market is not enabled in the managed vault yet. Choose BTC, ETH, SOL, or MON.</div>}
          {ready === false && <div className="perpl-inline-error">Managed execution is reconnecting. Try again shortly.</div>}
          <form className="perpl-order-form" onSubmit={(event) => void execute(event)}>
            <div className="trade-direction">
              <button
                type="button"
                className={side === 'long' ? 'active long' : ''}
                onClick={() => setSide('long')}
              >
                Buy / Long
              </button>
              <button
                type="button"
                className={side === 'short' ? 'active short' : ''}
                onClick={() => setSide('short')}
              >
                Sell / Short
              </button>
            </div>

            {/* Leverage Selector */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Leverage</label>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{leverage}x</span>
              </div>
              <div className="trade-leverage-group">
                {[2, 5, 10, 20].map((lev) => (
                  <button
                    type="button"
                    key={lev}
                    className={`trade-leverage-btn ${leverage === lev ? 'active' : ''}`}
                    onClick={() => setLeverage(lev)}
                  >
                    {lev}x
                  </button>
                ))}
              </div>
            </div>

            <div className="trade-fields">
              <label htmlFor="trade-notional">
                Order value (AUSD)
                <input id="trade-notional" type="number" min="0.01" step="any" inputMode="decimal" placeholder="Enter amount (e.g. 100)" value={notional} onChange={(event) => setNotional(event.target.value)} required />
                <div className="trade-preset-pills">
                  {presets.map((value) => <button type="button" key={value} onClick={() => setNotional(value)}>${value}</button>)}
                </div>
              </label>
            </div>

            <div className="order-review">
              <div><span>Market</span><strong>{market.symbol} Perpetual</strong></div>
              <div><span>Side</span><strong style={{ color: side === 'long' ? '#087b51' : '#bb443a' }}>{side === 'long' ? `BUY / LONG (${leverage}x)` : `SELL / SHORT (${leverage}x)`}</strong></div>
              <div><span>Mark price</span><strong>{money(market.mark)}</strong></div>
              <div><span>Approx. size</span><strong>{estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : '—'}</strong></div>
              <div><span>Initial Margin</span><strong>{money(estimate ? estimate.amount / leverage : 0)}</strong></div>
              <div><span>Execution account</span><strong>GentrY vault</strong></div>
            </div>
            <button className="primary-button wide" disabled={busy || !available || ready !== true || !estimate}>{busy ? <><LoaderCircle className="spin" size={16} />Submitting on Monad…</> : `Approve & execute ${side.toUpperCase()} order`}</button>
          </form>
        </>}

        {result && <div className="order-result">
          <div className="success-icon"><Check size={22} /></div>
          <h3>Order submitted</h3>
          <p>{result.size.toFixed(market.sizeDecimals ?? 4)} {result.market} ({result.side?.toUpperCase() || side.toUpperCase()}) was submitted from the GentrY vault.</p>
          <div className="order-review">
            <div><span>Order value</span><strong>{money(result.notional)}</strong></div>
            <div><span>Side</span><strong style={{ color: (result.side || side) === 'long' ? '#087b51' : '#bb443a' }}>{(result.side || side).toUpperCase()} ({leverage}x)</strong></div>
            <div><span>Perpl account</span><strong>#{result.perplAccountId}</strong></div>
          </div>
          <div className="perpl-tx-proof">
            <strong>Confirmed on Monad Testnet</strong>
            <a href={`https://testnet.monadscan.com/tx/${result.transaction}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14} /></a>
          </div>
          <button className="primary-button wide" onClick={() => setResult(null)}>Trade again</button>
          <button className="secondary-button wide" onClick={onClose}>Done</button>
        </div>}

        {/* Active Positions in modal */}
        {walletAddress && positions.length > 0 && !result && (
          <div className="modal-positions-section">
            <h4>
              <span>Active Vault Positions ({positions.length})</span>
              <small style={{ color: 'var(--muted)', fontWeight: 500 }}>Live PnL</small>
            </h4>
            <div className="modal-positions-list">
              {positions.map((pos) => (
                <div className="modal-position-row" key={pos.id}>
                  <span className={`pos-side-pill ${pos.side}`}>{pos.side.toUpperCase()} {pos.leverage || 10}x</span>
                  <div className="modal-position-info">
                    <strong>{pos.symbol} · {Number(pos.size || 0).toFixed(4)}</strong>
                    <span>Entry: ${Number(pos.entryPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} · Mark: ${Number(pos.currentMark || pos.entryPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  </div>
                  <div className="modal-position-pnl">
                    <strong className={Number(pos.unrealizedPnl || 0) >= 0 ? 'signal-up' : 'signal-down'}>
                      {Number(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}${Number(pos.unrealizedPnl || 0).toFixed(2)}
                    </strong>
                    <span className={Number(pos.roePct ?? pos.pnlPct ?? 0) >= 0 ? 'signal-up' : 'signal-down'}>
                      ({Number(pos.roePct ?? pos.pnlPct ?? 0) >= 0 ? '+' : ''}{Number(pos.roePct ?? pos.pnlPct ?? 0).toFixed(2)}% ROE)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="pos-share-btn"
                      onClick={() => setPnlCardPosition(pos)}
                      title="Share PnL Card"
                    >
                      <Share2 size={12} />
                    </button>
                    <button
                      type="button"
                      className="pos-close-btn"
                      disabled={closingId === pos.id}
                      onClick={() => void closePosition(pos)}
                    >
                      {closingId === pos.id ? <><LoaderCircle className="spin" size={12} /> Closing…</> : 'Close'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="perpl-inline-error" role="alert">{error}</div>}
        <p className="perpl-network-note">Monad Testnet · Perpl orderbook execution with onchain settlement.</p>
      </section>

      {/* Shareable PnL Card Modal */}
      {pnlCardPosition && (
        <PnlCardModal
          position={pnlCardPosition}
          walletAddress={walletAddress}
          onClose={() => setPnlCardPosition(null)}
        />
      )}
    </div>
  )
}
