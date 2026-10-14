import { useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, LoaderCircle, LockKeyhole, X } from 'lucide-react'

type Market = {
  id: number; symbol: string; mark: number; sizeDecimals?: number; maxLeverage?: number | null; maxSlippageBps?: number
}
export type TradeIntent = { direction?: 'long' | 'short'; notional?: string; leverage?: string }
type PerplAccount = { id: number; forwarding: boolean; lastRequestId: number; balance?: string; equity?: string }
type Position = { id: number; accountId: number; marketId: number; symbol: string; side: 'long' | 'short'; size: number; entryPrice: number; mark: number; notional: number; leverage: number }
type Props = { market: Market; intent?: TradeIntent; walletAddress: string; onConnect: () => void | Promise<void>; onClose: () => void; onNotice: (message: string) => void }
type OrderResult = {
  accepted: boolean; requestId: number; market: string; direction: string; mark: number; size: number; notional: number;
  leverage: number; estimatedCollateral: number; estimatedTakerFee: number; slippageBps: number;
  status: null | { code: number; reason: number; filledSize: number; averageFillPrice: number; orderId: number; requestId: number };
  onchainTransactions?: { hash: string; blockNumber: string }[]
}

const statusNames: Record<number, string> = { 1: 'Pending', 2: 'Open', 3: 'Partially filled', 4: 'Filled', 5: 'Canceled', 6: 'Expired', 7: 'Could not be placed', 8: 'Waiting for trigger', 9: 'Triggered', 10: 'Executed' }
const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export function PerplTrader({ market, intent, walletAddress, onConnect, onClose, onNotice }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [accounts, setAccounts] = useState<PerplAccount[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [accountId, setAccountId] = useState('')
  const [action, setAction] = useState<'open' | 'close'>('open')
  const [positionId, setPositionId] = useState('')
  const [direction, setDirection] = useState<'long' | 'short'>(intent?.direction || 'long')
  const [notional, setNotional] = useState(intent?.notional || '')
  const [leverage, setLeverage] = useState(intent?.leverage || '1')
  const [busy, setBusy] = useState<'account' | 'order' | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<OrderResult | null>(null)
  const maxLeverage = Math.max(1, Math.floor(market.maxLeverage || 1))
  const selectedPosition = positions.find((position) => String(position.id) === positionId)
  const estimate = useMemo(() => {
    const amount = Number(notional)
    const lev = Number(leverage)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(lev) || lev < 1) return null
    return { size: amount / market.mark, collateral: amount / lev }
  }, [notional, leverage, market.mark])

  async function loadAccount(event?: FormEvent) {
    event?.preventDefault()
    setBusy('account'); setError(''); setAccounts([])
    try {
      if (!walletAddress) { await onConnect(); setError('Connect your Monad wallet, then check your Perpl account again.'); return }
      const response = await fetch('/api/perpl/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey, privateKey }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not link your Perpl account.')
      if (String(payload.address).toLowerCase() !== walletAddress.toLowerCase()) throw new Error('Your connected wallet does not match this Perpl account.')
      const rows = Array.isArray(payload.accounts) ? payload.accounts : []
      if (!rows.length) throw new Error('No Perpl trading account is linked to this wallet yet.')
      setPositions(Array.isArray(payload.positions) ? payload.positions : [])
      setAccounts(rows)
      const selected = rows.find((item: PerplAccount) => item.forwarding)
      setAccountId(String((selected || rows[0]).id))
      if (!selected) setError('Account linked. Turn on Order Forwarding in Perpl before placing an order.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not link your Perpl account.') }
    finally { setBusy(null) }
  }

  async function placeOrder(event: FormEvent) {
    event.preventDefault()
    setBusy('order'); setError(''); setResult(null)
    try {
      if (!walletAddress) throw new Error('Connect your Monad wallet first.')
      const response = await fetch('/api/perpl/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        apiKey, privateKey, address: walletAddress, marketId: market.id, accountId, direction, action, positionId: Number(positionId), notional: Number(notional), leverage: Number(leverage),
      }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Perpl could not place the order.')
      setResult(payload)
      setPrivateKey('')
      onNotice(payload.status ? `Perpl order status: ${statusNames[payload.status.code] || 'Updated'}.` : 'Perpl accepted the request. Order status is still being confirmed.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Perpl could not place the order.') }
    finally { setBusy(null) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="modal perpl-trader-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title">
      <button className="close-button" aria-label="Close order panel" disabled={busy !== null} onClick={onClose}><X size={19} /></button>
      <span className="modal-kicker">PERPL · MONAD TESTNET</span>
      <h2 id="trade-title">Review a {market.symbol} order.</h2>
      <p>See the live order details, then choose whether to send it to Perpl.</p>

      {!walletAddress && <button className="primary-button wide" onClick={() => void onConnect()}>Connect Monad wallet</button>}

      {!accounts.length && <form className="perpl-link-form" onSubmit={(event) => void loadAccount(event)}>
        <label htmlFor="perpl-api-key">Perpl API key</label>
        <input id="perpl-api-key" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your Perpl API key" required />
        <label htmlFor="perpl-signing-key">Perpl signing key</label>
        <input id="perpl-signing-key" type="password" autoComplete="new-password" value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder="Paste your Perpl signing key" required />
        <div className="perpl-privacy"><LockKeyhole size={15} /><span>Used only to sign this request. GentrY does not save it. Use a trade-enabled key from Perpl.</span></div>
        <button className="secondary-button wide" disabled={busy !== null || !apiKey || !privateKey || !walletAddress}>{busy === 'account' ? <LoaderCircle className="spin" size={16} /> : null}Link Perpl account</button>
        <a className="perpl-help-link" href="https://testnet.perpl.xyz/apikeys" target="_blank" rel="noreferrer">Open Perpl account settings <ArrowUpRight size={13} /></a>
      </form>}

      {accounts.length > 0 && !result && <form className="perpl-order-form" onSubmit={(event) => void placeOrder(event)}>
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

      {result && <div className="order-result"><div className="success-icon"><Check size={22} /></div><h3>{result.status ? statusNames[result.status.code] || 'Order updated' : 'Request accepted'}</h3><p>{result.status ? `${result.status.filledSize} ${result.market} filled at ${money(result.status.averageFillPrice)}.` : 'Perpl accepted the request. The exchange has not returned the final status yet.'}</p><div className="order-review"><div><span>Request number</span><strong>{result.requestId}</strong></div><div><span>Order value</span><strong>{money(result.notional)}</strong></div><div><span>Estimated fee</span><strong>{money(result.estimatedTakerFee)}</strong></div></div>{result.onchainTransactions?.length ? <div className="perpl-tx-proof"><strong>Confirmed on Monad</strong>{result.onchainTransactions.map((transaction) => <a key={transaction.hash} href={`https://testnet.monadscan.com/tx/${transaction.hash}`} target="_blank" rel="noreferrer">View transaction · block {Number(transaction.blockNumber).toLocaleString()} <ArrowUpRight size={14} /></a>)}</div> : null}<button className="secondary-button wide" onClick={onClose}>Done</button></div>}

      {error && <div className="perpl-inline-error" role="alert">{error}{error.includes('Order Forwarding') && <> <a href="https://testnet.perpl.xyz" target="_blank" rel="noreferrer">Open Perpl <ArrowUpRight size={12} /></a></>}</div>}
      <p className="perpl-network-note">Monad Testnet · No order is sent until you select Place order.</p>
    </section>
  </div>
}
