import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Copy, KeyRound, LoaderCircle, LockKeyhole, Zap, X } from 'lucide-react'

type Market = {
  id: number; symbol: string; mark: number; sizeDecimals?: number; priceDecimals?: number; maxLeverage?: number | null; maxSlippageBps?: number
}
export type TradeIntent = { direction?: 'long' | 'short'; notional?: string; leverage?: string }
type PerplAccount = { id: number; forwarding: boolean; lastRequestId: number; balance?: string; equity?: string }
type Position = { id: number; accountId: number; marketId: number; symbol: string; side: 'long' | 'short'; size: number; entryPrice: number; mark: number; notional: number; leverage: number }
type PerplFill = { orderId: number; accountId: number; marketId: number; symbol: string; type: number; size: number; price: number; timestamp: number; transaction: { hash: string; blockNumber: string } | null }
type Props = { market: Market; intent?: TradeIntent; walletAddress: string; onConnect: () => void | Promise<void>; onClose: () => void; onNotice: (message: string) => void }
type OrderResult = {
  accepted: boolean; requestId: number; market: string; direction: string; mark: number; size: number; notional: number;
  leverage: number; estimatedCollateral: number; estimatedTakerFee: number; slippageBps: number;
  status: null | { code: number; reason: number; filledSize: number; averageFillPrice: number; orderId: number; requestId: number };
  onchainTransactions?: { hash: string; blockNumber: string }[]
}

const statusNames: Record<number, string> = { 1: 'Pending', 2: 'Open', 3: 'Partially filled', 4: 'Filled', 5: 'Canceled', 6: 'Expired', 7: 'Could not be placed', 8: 'Waiting for trigger', 9: 'Triggered', 10: 'Executed' }
const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

const SAVED_API_KEY = 'gentry:perpl:apiKey'
const SAVED_PRIVATE_KEY = 'gentry:perpl:privateKey'

export function PerplTrader({ market, intent, walletAddress, onClose, onNotice }: Props) {
  const [mode, setMode] = useState<'direct' | 'api'>('direct')
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem(SAVED_API_KEY) || '' } catch { return '' }
  })
  const [privateKey, setPrivateKey] = useState(() => {
    try { return localStorage.getItem(SAVED_PRIVATE_KEY) || '' } catch { return '' }
  })
  const [rememberKeys, setRememberKeys] = useState(true)
  const [copiedPlan, setCopiedPlan] = useState(false)
  const [accounts, setAccounts] = useState<PerplAccount[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [fills, setFills] = useState<PerplFill[]>([])
  const [linkedAddress, setLinkedAddress] = useState('')
  const [accountId, setAccountId] = useState('')
  const [action, setAction] = useState<'open' | 'close'>('open')
  const [positionId, setPositionId] = useState('')
  const [direction, setDirection] = useState<'long' | 'short'>(intent?.direction || 'long')
  const [notional, setNotional] = useState(intent?.notional || '100')
  const [leverage, setLeverage] = useState(intent?.leverage || '5')
  const [busy, setBusy] = useState<'account' | 'order' | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<OrderResult | null>(null)
  const maxLeverage = Math.max(1, Math.floor(market.maxLeverage || 50))
  const selectedPosition = positions.find((position) => String(position.id) === positionId)

  const estimate = useMemo(() => {
    const amount = Number(notional)
    const lev = Number(leverage)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(lev) || lev < 1 || !(market.mark > 0)) return null
    const size = amount / market.mark
    const collateral = amount / lev
    const liqMovePct = Math.min(95, (0.9 / lev) * 100)
    const estLiquidation = direction === 'long'
      ? market.mark * (1 - liqMovePct / 100)
      : market.mark * (1 + liqMovePct / 100)
    return { size, collateral, liqMovePct, estLiquidation }
  }, [notional, leverage, market.mark, direction])

  useEffect(() => {
    if (apiKey && privateKey && !accounts.length && mode === 'api') {
      void loadAccount()
    }
  }, [mode])

  function forgetCredentials() {
    setApiKey('')
    setPrivateKey('')
    setAccounts([])
    setPositions([])
    setLinkedAddress('')
    try {
      localStorage.removeItem(SAVED_API_KEY)
      localStorage.removeItem(SAVED_PRIVATE_KEY)
    } catch { /* Storage not accessible */ }
    setError('')
  }

  async function copyPlan() {
    const lev = Number(leverage) || 1
    const sizeStr = estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : ''
    const text = `GentrY Trade Plan: ${market.symbol} ${direction.toUpperCase()} | Sizing: $${notional} (${sizeStr}) | Leverage: ${lev}x | Mark: ${money(market.mark)}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPlan(true)
      setTimeout(() => setCopiedPlan(false), 2000)
    } catch {
      onNotice('Trade plan: ' + text)
    }
  }

  async function loadAccount(event?: FormEvent) {
    event?.preventDefault()
    setBusy('account'); setError(''); setAccounts([]); setPositions([]); setFills([])
    try {
      const response = await fetch('/api/perpl/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey, privateKey }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not link your Perpl account.')
      const rows = Array.isArray(payload.accounts) ? payload.accounts : []
      if (!rows.length) throw new Error('No Perpl trading account is linked to this wallet yet.')
      setLinkedAddress(String(payload.address || ''))
      setPositions(Array.isArray(payload.positions) ? payload.positions : [])
      setFills(Array.isArray(payload.fills) ? payload.fills : [])
      setAccounts(rows)
      const selected = rows.find((item: PerplAccount) => item.forwarding)
      setAccountId(String((selected || rows[0]).id))
      if (!selected) setError('Account linked. Turn on Order Forwarding in Perpl before placing an order.')

      if (rememberKeys) {
        try {
          localStorage.setItem(SAVED_API_KEY, apiKey)
          localStorage.setItem(SAVED_PRIVATE_KEY, privateKey)
        } catch { /* Storage not accessible */ }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not link your Perpl account.') }
    finally { setBusy(null) }
  }

  async function placeOrder(event: FormEvent) {
    event.preventDefault()
    setBusy('order'); setError(''); setResult(null)
    try {
      if (!linkedAddress) throw new Error('Link your Perpl account first.')
      const submittedAt = Date.now()
      const response = await fetch('/api/perpl/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        apiKey, privateKey, address: linkedAddress, marketId: market.id, accountId, direction, action, positionId: Number(positionId), notional: Number(notional), leverage: Number(leverage),
      }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Perpl could not place the order.')
      const acceptedResult = payload as OrderResult
      setResult(acceptedResult)
      onNotice(payload.status ? `Perpl order status: ${statusNames[payload.status.code] || 'Updated'}.` : 'Order sent to Perpl. Checking status and receipt.')
      void (async () => {
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, attempt ? 1200 : 400))
          const statusResponse = await fetch('/api/perpl/order-status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey, privateKey, requestId: acceptedResult.requestId, accountId, marketId: market.id, sizeDecimals: market.sizeDecimals || 0, priceDecimals: market.priceDecimals || 0 }) }).catch(() => null)
          if (!statusResponse?.ok) continue
          const statusPayload = await statusResponse.json().catch(() => ({}))
          if (!statusPayload.status) continue
          const status = statusPayload.status as NonNullable<OrderResult['status']>
          setResult((current) => current && current.requestId === acceptedResult.requestId ? { ...current, status } : current)
          if ([2, 3, 4, 5, 6, 7, 10].includes(status.code)) break
        }
      })()
      void (async () => {
        let recentFills: PerplFill[] = []
        for (let attempt = 0; attempt < 5 && !recentFills.some((fill) => fill.transaction); attempt++) {
          if (attempt) await new Promise((resolve) => setTimeout(resolve, 900))
          const accountResponse = await fetch('/api/perpl/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey, privateKey }) }).catch(() => null)
          if (!accountResponse?.ok) continue
          const accountPayload = await accountResponse.json().catch(() => ({}))
          const expectedType = action === 'close' ? direction === 'long' ? 3 : 4 : direction === 'long' ? 1 : 2
          recentFills = (Array.isArray(accountPayload.fills) ? accountPayload.fills : []).filter((fill: PerplFill) => fill.accountId === Number(accountId) && fill.marketId === market.id && fill.type === expectedType && fill.timestamp >= submittedAt - 1000 && fill.timestamp <= Date.now() + 1000)
        }
        setFills((previous) => [...recentFills, ...previous.filter((fill) => !recentFills.some((recent) => recent.orderId === fill.orderId && recent.timestamp === fill.timestamp))].slice(0, 25))
        const totalFilled = recentFills.reduce((sum, fill) => sum + fill.size, 0)
        const averagePrice = totalFilled ? recentFills.reduce((sum, fill) => sum + fill.price * fill.size, 0) / totalFilled : 0
        const transactions = [...new Map(recentFills.map((fill) => fill.transaction).filter((item): item is NonNullable<PerplFill['transaction']> => Boolean(item)).map((item) => [item.hash, item])).values()]
        setResult((current) => current && current.requestId === acceptedResult.requestId ? {
          ...current,
          status: current.status || (recentFills.length ? { code: totalFilled >= acceptedResult.size ? 4 : 3, reason: 0, filledSize: totalFilled, averageFillPrice: averagePrice, orderId: recentFills[0].orderId, requestId: acceptedResult.requestId } : null),
          onchainTransactions: transactions.length ? transactions : current.onchainTransactions,
        } : current)
      })()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Perpl could not place the order.') }
    finally { setBusy(null) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="modal perpl-trader-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title">
      <button className="close-button" aria-label="Close order panel" disabled={busy !== null} onClick={onClose}><X size={19} /></button>
      <span className="modal-kicker">PERPL · MONAD TESTNET</span>
      <h2 id="trade-title">{mode === 'direct' ? `Trade ${market.symbol} on Perpl.` : `Review a ${market.symbol} order.`}</h2>
      <p>{mode === 'direct' ? 'Plan your position with live market sizing, then open directly on Perpl DEX.' : 'Submit an automated order using your trade-enabled Perpl API key.'}</p>

      <div className="perpl-mode-tabs" role="tablist">
        <button type="button" className={mode === 'direct' ? 'active' : ''} onClick={() => setMode('direct')}>
          <Zap size={13} style={{ display: 'inline', marginRight: 5 }} /> Quick Trade (No Keys)
        </button>
        <button type="button" className={mode === 'api' ? 'active' : ''} onClick={() => setMode('api')}>
          <KeyRound size={13} style={{ display: 'inline', marginRight: 5 }} /> In-Terminal API
        </button>
      </div>

      {mode === 'direct' && <div className="perpl-direct-flow">
        <div className="trade-direction" style={{ marginBottom: 14 }}>
          <button type="button" className={direction === 'long' ? 'active long' : ''} onClick={() => setDirection('long')}>Buy / Long</button>
          <button type="button" className={direction === 'short' ? 'active short' : ''} onClick={() => setDirection('short')}>Sell / Short</button>
        </div>

        <div className="trade-fields">
          <label htmlFor="direct-notional">
            Order Value (USD)
            <input
              id="direct-notional"
              type="number"
              min="1"
              step="any"
              inputMode="decimal"
              value={notional}
              onChange={(e) => setNotional(e.target.value)}
              placeholder="e.g. 100"
            />
            <div className="trade-preset-pills">
              {['25', '50', '100', '250', '500'].map((val) => (
                <button type="button" key={val} onClick={() => setNotional(val)}>${val}</button>
              ))}
            </div>
          </label>
          <label htmlFor="direct-leverage">
            Leverage
            <select id="direct-leverage" value={leverage} onChange={(e) => setLeverage(e.target.value)}>
              {[1, 2, 3, 5, 10, 20, 25, Math.min(50, maxLeverage)].filter((v, i, a) => v <= maxLeverage && a.indexOf(v) === i).map((val) => (
                <option key={val} value={val}>{val}×</option>
              ))}
            </select>
          </label>
        </div>

        <div className="order-review" style={{ marginTop: 14 }}>
          <div><span>Market</span><strong>{market.symbol} Perpetual</strong></div>
          <div><span>Mark price</span><strong>{money(market.mark)}</strong></div>
          <div><span>Approx. size</span><strong>{estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : '—'}</strong></div>
          <div><span>Required collateral</span><strong>{estimate ? money(estimate.collateral) : '—'}</strong></div>
          <div><span>Est. liquidation buffer</span><strong>{estimate ? `~${estimate.liqMovePct.toFixed(1)}% move (${money(estimate.estLiquidation)})` : '—'}</strong></div>
          <div><span>Max slippage limit</span><strong>{market.maxSlippageBps ?? 50} bps</strong></div>
        </div>

        <a
          className="perpl-launch-button"
          href={`https://testnet.perpl.xyz/trade/${market.symbol}`}
          target="_blank"
          rel="noreferrer"
        >
          Open & Trade {market.symbol} on Perpl DEX <ArrowUpRight size={17} />
        </a>

        <button
          type="button"
          className="secondary-button wide"
          style={{ marginTop: 10 }}
          onClick={() => void copyPlan()}
        >
          {copiedPlan ? <><Check size={14} /> Plan copied to clipboard!</> : <><Copy size={14} /> Copy trade parameters</>}
        </button>

        <p className="perpl-network-note">
          Opens Perpl with your wallet in 1 click. Zero API keys, signing keys, or permissions required.
        </p>
      </div>}

      {mode === 'api' && <>
        {!walletAddress && <p className="perpl-network-note">Link your Perpl account with its trade-enabled key. Monad wallet connection is optional for Perpl orders.</p>}

        {!accounts.length && <form className="perpl-link-form" onSubmit={(event) => void loadAccount(event)}>
          <label htmlFor="perpl-api-key">Perpl API key</label>
          <input id="perpl-api-key" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your Perpl API key" required />
          <label htmlFor="perpl-signing-key">Perpl signing key</label>
          <input id="perpl-signing-key" type="password" autoComplete="new-password" value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder="Paste your Perpl signing key" required />

          <label className="perpl-remember-row">
            <input type="checkbox" checked={rememberKeys} onChange={(e) => setRememberKeys(e.target.checked)} />
            <span>Remember API key on this browser</span>
          </label>

          <div className="perpl-privacy"><LockKeyhole size={15} /><span>Used only to sign this request. GentrY does not send your key to third parties. Use a trade-enabled key from Perpl.</span></div>
          <button className="secondary-button wide" disabled={busy !== null || !apiKey || !privateKey}>{busy === 'account' ? <LoaderCircle className="spin" size={16} /> : null}Link Perpl account</button>
          <a className="perpl-help-link" href="https://testnet.perpl.xyz/apikeys" target="_blank" rel="noreferrer">Open Perpl account settings <ArrowUpRight size={13} /></a>
        </form>}

        {accounts.length > 0 && !result && <form className="perpl-order-form" onSubmit={(event) => void placeOrder(event)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="perpl-network-note" style={{ margin: 0 }}>Perpl account · {linkedAddress ? `${linkedAddress.slice(0, 6)}…${linkedAddress.slice(-4)}` : 'linked'}</p>
            <button type="button" className="text-button" style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }} onClick={forgetCredentials}>Disconnect key</button>
          </div>

          <label htmlFor="perpl-account">Trading account</label>
          <select id="perpl-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>Account {account.id}{account.forwarding ? '' : ' · forwarding off'}</option>)}</select>
          {!accounts.find((account) => String(account.id) === accountId)?.forwarding && <div className="perpl-privacy">Turn on Order Forwarding in Perpl account settings before continuing.</div>}
          <div className="trade-direction"><button type="button" className={action === 'open' ? 'active long' : ''} onClick={() => setAction('open')}>Open position</button><button type="button" className={action === 'close' ? 'active short' : ''} onClick={() => setAction('close')}>Close position</button></div>
          {action === 'close' && <>{positions.filter((position) => position.accountId === Number(accountId) && position.marketId === market.id).length > 0 ? <><label htmlFor="perpl-position">Open {market.symbol} position</label><select id="perpl-position" value={positionId} onChange={(event) => { const value = event.target.value; setPositionId(value); const position = positions.find((item) => String(item.id) === value); if (position) { setDirection(position.side); setNotional(position.notional.toFixed(2)); setLeverage(String(Math.max(1, Math.floor(position.leverage)))) } }}>{positions.filter((position) => position.accountId === Number(accountId) && position.marketId === market.id).map((position) => <option key={position.id} value={position.id}>{position.side === 'long' ? 'Long' : 'Short'} · {position.size.toFixed(market.sizeDecimals ?? 4)} {market.symbol} · about {money(position.notional)}</option>)}</select><p className="perpl-network-note">Closing sells down this position. The amount can be partial, up to its current value.</p></> : <div className="perpl-privacy">No open {market.symbol} position was found for this account.</div>}</>}
          {action === 'open' && <div className="trade-direction"><button type="button" className={direction === 'long' ? 'active long' : ''} onClick={() => setDirection('long')}>Buy / Long</button><button type="button" className={direction === 'short' ? 'active short' : ''} onClick={() => setDirection('short')}>Sell / Short</button></div>}
          <div className="trade-fields"><label htmlFor="trade-notional">{action === 'close' ? 'Close value (USD)' : 'Order value (USD)'}<input id="trade-notional" type="number" min="0.01" max={action === 'close' ? selectedPosition?.notional : undefined} step="any" inputMode="decimal" value={notional} onChange={(event) => setNotional(event.target.value)} placeholder="Enter amount" required /></label><label htmlFor="trade-leverage">Leverage<select id="trade-leverage" value={leverage} onChange={(event) => setLeverage(event.target.value)}>{Array.from({ length: maxLeverage }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></div>
          <div className="order-review"><div><span>Market</span><strong>{market.symbol} perpetual</strong></div><div><span>Mark price</span><strong>{money(market.mark)}</strong></div><div><span>Approx. size</span><strong>{estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : '—'}</strong></div><div><span>Estimated collateral</span><strong>{estimate ? money(estimate.collateral) : '—'}</strong></div><div><span>Market slippage limit</span><strong>{market.maxSlippageBps ?? 0} bps</strong></div></div>
          <p className="trade-risk-note">Perpetuals can lose your collateral. The final fill price may differ from the mark price. Review the amount and direction before continuing.</p>
          <button className="primary-button wide" disabled={busy !== null || !estimate || !accountId || !accounts.find((account) => String(account.id) === accountId)?.forwarding || (action === 'close' && !positionId)}>{busy === 'order' ? <LoaderCircle className="spin" size={16} /> : null}{action === 'close' ? `Close ${direction} position` : `Place ${direction === 'long' ? 'buy / long' : 'sell / short'} order`}</button>
        </form>}

        {result && <div className="order-result"><div className="success-icon"><Check size={22} /></div><h3>{result.status ? statusNames[result.status.code] || 'Order updated' : 'Order submitted'}</h3><p>{result.status ? `${result.status.filledSize} ${result.market} filled at ${money(result.status.averageFillPrice)}.` : 'Perpl received your order. Its status will appear here.'}</p><div className="order-review"><div><span>Request number</span><strong>{result.requestId}</strong></div><div><span>Order value</span><strong>{money(result.notional)}</strong></div><div><span>Estimated fee</span><strong>{money(result.estimatedTakerFee)}</strong></div></div>{result.onchainTransactions?.length ? <div className="perpl-tx-proof"><strong>Confirmed on Monad</strong>{result.onchainTransactions.map((transaction) => <a key={transaction.hash} href={`https://testnet.monadscan.com/tx/${transaction.hash}`} target="_blank" rel="noreferrer">View transaction · block {Number(transaction.blockNumber).toLocaleString()} <ArrowUpRight size={14} /></a>)}</div> : null}<button className="secondary-button wide" onClick={onClose}>Done</button></div>}

        {fills.length > 0 && !result && <div className="perpl-recent-fills"><strong>Recent fills</strong>{fills.slice(0, 4).map((fill) => <div className="perpl-recent-fill" key={`${fill.orderId}-${fill.timestamp}`}><span>{fill.symbol} · {fill.type === 1 || fill.type === 3 ? 'Long' : 'Short'} · {fill.size} @ {money(fill.price)}</span>{fill.transaction ? <a href={`https://testnet.monadscan.com/tx/${fill.transaction.hash}`} target="_blank" rel="noreferrer">Confirmed on Monad <ArrowUpRight size={13} /></a> : <span>Verifying transaction…</span>}</div>)}</div>}

        {error && <div className="perpl-inline-error" role="alert">{error}{error.includes('Order Forwarding') && <> <a href="https://testnet.perpl.xyz" target="_blank" rel="noreferrer">Open Perpl <ArrowUpRight size={12} /></a></>}</div>}
        <p className="perpl-network-note">Monad Testnet · {result ? 'Order details from Perpl.' : 'Your confirmation sends the order to Perpl.'}</p>
      </>}
    </section>
  </div>
}
