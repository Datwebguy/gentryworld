import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, LoaderCircle, Share2, ShieldCheck, X } from 'lucide-react'
import { useWalletSession } from './wallet'
import { PnlCardModal } from './PnlCardModal'
import { DepositWithdrawModal, type UserVaultBalance } from './DepositWithdrawModal'

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
  const [vaultBalance, setVaultBalance] = useState<UserVaultBalance | null>(null)
  const [showDepositModal, setShowDepositModal] = useState(false)
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

  const fetchVaultBalance = useCallback(async () => {
    if (!walletAddress) {
      setVaultBalance(null)
      return
    }
    try {
      const res = await fetch(`/api/vault/user-balance?address=${encodeURIComponent(walletAddress)}`)
      if (res.ok) {
        const data = await res.json()
        setVaultBalance(data)
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  useEffect(() => {
    void fetchBalances()
    void fetchVaultBalance()
  }, [fetchBalances, fetchVaultBalance])

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
        void fetchVaultBalance()
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
      const response = await fetch(`/api/vault/positions?address=${encodeURIComponent(walletAddress)}&_t=${Date.now()}`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        setPositions(Array.isArray(payload.positions) ? payload.positions : [])
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  useEffect(() => {
    void fetchPositions()
    const interval = setInterval(() => {
      void fetchPositions()
      void fetchVaultBalance()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchPositions, fetchVaultBalance])

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

      // Cache new position immediately
      const newPos: VaultPosition = {
        id: payload.positionId || `pos_${Date.now()}`,
        address: walletAddress.toLowerCase(),
        marketId: market.id,
        symbol: payload.market || market.symbol,
        side,
        leverage,
        size: payload.size,
        lots: payload.lots || '0',
        notional: payload.notional || amount,
        initialMargin: payload.initialMargin || (amount / leverage),
        entryPrice: payload.entryPrice || market.mark,
        openedAt: Date.now(),
        transaction: payload.transaction,
        status: 'open',
        currentMark: payload.entryPrice || market.mark,
        currentNotional: payload.notional || amount,
        unrealizedPnl: 0,
        roePct: 0,
        pnlPct: 0
      }
      try {
        const key = `gentry:positions:${walletAddress.toLowerCase()}`
        const raw = localStorage.getItem(key)
        const current: VaultPosition[] = raw ? JSON.parse(raw) : []
        localStorage.setItem(key, JSON.stringify([newPos, ...current.filter((p) => p.id !== newPos.id)]))
      } catch {}

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

      try {
        const cleanAddr = walletAddress.toLowerCase()
        const keyPos = `gentry:positions:${cleanAddr}`
        const keyHist = `gentry:history:${cleanAddr}`
        const rawPos = localStorage.getItem(keyPos)
        const currentPos: VaultPosition[] = rawPos ? JSON.parse(rawPos) : []
        const remaining = currentPos.filter((p) => p.id !== pos.id)
        localStorage.setItem(keyPos, JSON.stringify(remaining))

        const rawHist = localStorage.getItem(keyHist)
        const currentHist: VaultPosition[] = rawHist ? JSON.parse(rawHist) : []
        const closedEntry: VaultPosition = {
          ...pos,
          status: 'closed',
          closedAt: Date.now(),
          closePrice: payload.closePrice || pos.currentMark || pos.entryPrice,
          closeTransaction: payload.transaction || pos.transaction,
          realizedPnl: Number(payload.realizedPnl || 0),
          realizedRoePct: Number(payload.realizedRoePct || 0),
        }
        localStorage.setItem(keyHist, JSON.stringify([closedEntry, ...currentHist.filter((h) => h.id !== pos.id)]))
      } catch {}

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

        {/* User Connected Wallet & Vault Balances */}
        {walletAddress && (
          <div className="wallet-balance-bar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div className="wallet-balance-item">
              <span className="wallet-balance-dot" />
              <span>{walletBalances?.mon || '—'}</span>
            </div>
            <span style={{ color: 'var(--line)' }}>|</span>
            <div className="wallet-balance-item" title="Personal Wallet AUSD on Monad Testnet">
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>Wallet:</span>
              <span>{walletBalances?.ausd || '—'}</span>
            </div>
            <span style={{ color: 'var(--line)' }}>|</span>
            <div className="wallet-balance-item" title="Available Margin in GentrY Vault">
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>Vault Avail:</span>
              <strong style={{ color: '#10b981' }}>${(vaultBalance?.availableBalance ?? 0).toFixed(2)}</strong>
            </div>
            <button
              type="button"
              className="faucet-claim-pill"
              style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981', fontWeight: 600 }}
              onClick={() => setShowDepositModal(true)}
            >
              + Deposit
            </button>
            <button
              type="button"
              className="faucet-claim-pill"
              disabled={claimingFaucet}
              onClick={() => void claimFaucet()}
            >
              {claimingFaucet ? 'Claiming…' : '+ 500 Faucet'}
            </button>
          </div>
        )}

        {!result && <>
          <div className="perpl-privacy"><ShieldCheck size={15} /><span>Orders execute through the GentrY vault with your available margin backing the position. Privy wallet signs every trade intent.</span></div>
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

            {(() => {
              const reqMargin = estimate ? estimate.amount / leverage : 0
              const availMargin = vaultBalance?.availableBalance ?? 0
              const hasEnoughMargin = availMargin >= reqMargin

              return (
                <>
                  <div className="order-review">
                    <div><span>Market</span><strong>{market.symbol} Perpetual</strong></div>
                    <div><span>Side</span><strong style={{ color: side === 'long' ? '#087b51' : '#bb443a' }}>{side === 'long' ? `BUY / LONG (${leverage}x)` : `SELL / SHORT (${leverage}x)`}</strong></div>
                    <div><span>Mark price</span><strong>{money(market.mark)}</strong></div>
                    <div><span>Approx. size</span><strong>{estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : '—'}</strong></div>
                    <div><span>Initial Margin</span><strong>{money(reqMargin)}</strong></div>
                    <div><span>Available Vault Margin</span><strong style={{ color: hasEnoughMargin ? '#10b981' : '#ef4444' }}>${availMargin.toFixed(2)}</strong></div>
                    <div><span>Execution account</span><strong>GentrY vault</strong></div>
                  </div>

                  {!hasEnoughMargin && estimate && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      margin: '10px 0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8
                    }}>
                      <span style={{ color: '#ef4444', fontSize: 12 }}>
                        Available margin (${availMargin.toFixed(2)}) is less than required margin (${reqMargin.toFixed(2)}).
                      </span>
                      <button
                        type="button"
                        className="faucet-claim-pill"
                        style={{ background: '#10b981', color: '#fff', borderColor: '#10b981', fontWeight: 600, flexShrink: 0 }}
                        onClick={() => setShowDepositModal(true)}
                      >
                        + Deposit AUSD
                      </button>
                    </div>
                  )}

                  {!hasEnoughMargin && estimate ? (
                    <button
                      type="button"
                      className="primary-button wide"
                      style={{ background: '#10b981', color: '#ffffff' }}
                      onClick={() => setShowDepositModal(true)}
                    >
                      Deposit AUSD to Trade (${(reqMargin - availMargin).toFixed(2)} needed)
                    </button>
                  ) : (
                    <button className="primary-button wide" disabled={busy || !available || ready !== true || !estimate}>
                      {busy ? <><LoaderCircle className="spin" size={16} />Submitting on Monad…</> : `Approve & execute ${side.toUpperCase()} order`}
                    </button>
                  )}
                </>
              )
            })()}
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

      {/* Deposit & Withdraw Modal */}
      {showDepositModal && (
        <DepositWithdrawModal
          walletAddress={walletAddress}
          initialTab="deposit"
          onClose={() => setShowDepositModal(false)}
          onSuccess={() => { void fetchBalances(); void fetchVaultBalance() }}
          onNotice={onNotice}
        />
      )}
    </div>
  )
}
