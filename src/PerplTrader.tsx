import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, KeyRound, LoaderCircle, LockKeyhole, X } from 'lucide-react'
import { bytesToHex, hashTypedData, hexToBytes } from 'viem'
import { useWalletSession } from './wallet'

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

// Perpl signing credentials are intentionally held only in this running tab.
// Privy retains the user's GentrY login. Perpl credentials are a separate
// trading authorization and must not be persisted in browser storage.
let activePerplSession: { apiKey: string; privateKey: string } | undefined

export function PerplTrader({ market, intent, walletAddress: _walletAddress, onClose, onNotice }: Props) {
  const { address: connectedAddress, authenticated, provider, signTypedData, openWallet } = useWalletSession()
  const [apiKey, setApiKey] = useState(() => activePerplSession?.apiKey || '')
  const [privateKey, setPrivateKey] = useState(() => activePerplSession?.privateKey || '')
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

  // Reconnect only from the active tab session. Nothing is read from localStorage.
  useEffect(() => {
    if (apiKey.trim() && privateKey.trim() && !accounts.length) {
      void loadAccount()
    }
  }, [])

  function forgetCredentials() {
    setApiKey('')
    setPrivateKey('')
    setAccounts([])
    setPositions([])
    setLinkedAddress('')
    setResult(null)
    activePerplSession = undefined
    setError('')
  }

  async function loadAccount(event?: FormEvent) {
    event?.preventDefault()
    return linkAccount({ apiKey: apiKey.trim(), privateKey: privateKey.trim() })
  }

  async function linkAccount(credentials: { apiKey: string; privateKey: string }) {
    setBusy('account'); setError(''); setAccounts([]); setPositions([]); setFills([])
    try {
      const trimmedKey = credentials.apiKey.trim()
      const trimmedSecret = credentials.privateKey.trim()
      const response = await fetch('/api/perpl/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmedKey, privateKey: trimmedSecret }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not link your Perpl account.')
      const rows = Array.isArray(payload.accounts) ? payload.accounts : []
      if (!rows.length) throw new Error('No Perpl trading account is linked to this key yet.')
      setLinkedAddress(String(payload.address || ''))
      setPositions(Array.isArray(payload.positions) ? payload.positions : [])
      setFills(Array.isArray(payload.fills) ? payload.fills : [])
      setAccounts(rows)
      const selected = rows.find((item: PerplAccount) => item.forwarding)
      setAccountId(String((selected || rows[0]).id))
      if (!selected) setError('Account linked. Note: turn on Order Forwarding in Perpl before placing orders.')

      activePerplSession = { apiKey: trimmedKey, privateKey: trimmedSecret }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not link your Perpl account.') }
    finally { setBusy(null) }
  }

  function responseMessage(payload: unknown, fallback: string) {
    if (!payload || typeof payload !== 'object') return fallback
    const record = payload as Record<string, unknown>
    return String(record.error || record.message || record.detail || fallback)
  }

  async function pairWithPrivyWallet() {
    if (!authenticated || !connectedAddress) {
      await openWallet()
      return
    }
    if (!window.crypto?.subtle) {
      setError('This browser cannot create the Perpl signing key. Open GentrY in a current Chrome, Edge, or Safari browser.')
      return
    }
    setBusy('account'); setError(''); setAccounts([]); setPositions([]); setFills([])
    try {
      const pair = await window.crypto.subtle.generateKey({ name: 'Ed25519' } as AlgorithmIdentifier, true, ['sign', 'verify']) as CryptoKeyPair
      const rawPublic = new Uint8Array(await window.crypto.subtle.exportKey('raw', pair.publicKey))
      const privatePkcs8 = new Uint8Array(await window.crypto.subtle.exportKey('pkcs8', pair.privateKey))
      const privateSeed = privatePkcs8.slice(-32)
      if (rawPublic.length !== 32 || privateSeed.length !== 32) throw new Error('Could not create a valid Perpl signing key.')

      const payloadResponse = await fetch('https://testnet.perpl.xyz/api/v1/api-key/payload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chain_id: 10143,
          address: connectedAddress,
          public_key: bytesToHex(rawPublic),
          scope_mask: 3,
          label: 'GentrY trading session',
        }),
      })
      const payload = await payloadResponse.json().catch(() => null)
      if (!payloadResponse.ok || !payload?.typed_data || !payload?.mac) throw new Error(responseMessage(payload, 'Perpl could not prepare the wallet authorization.'))
      const typedData = payload.typed_data as { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }
      const signature = signTypedData
        ? await signTypedData({ ...typedData, uiOptions: { title: 'Authorize Perpl trading key', description: 'Authorize a scoped GentrY trading key for your Perpl account on Monad Testnet. This does not place an order or move funds.', buttonText: 'Authorize key' } })
        : await provider?.request({ method: 'eth_signTypedData_v4', params: [connectedAddress, JSON.stringify(typedData)] })
      if (!signature || typeof signature !== 'string') throw new Error('Wallet authorization was cancelled.')
      const { EIP712Domain: _domainType, ...types } = typedData.types
      const digest = hashTypedData({ domain: typedData.domain as any, types: types as any, primaryType: typedData.primaryType as any, message: typedData.message as any })
      const digestBytes = new Uint8Array(Array.from(hexToBytes(digest)))
      const popSignature = bytesToHex(new Uint8Array(await window.crypto.subtle.sign({ name: 'Ed25519' } as AlgorithmIdentifier, pair.privateKey, digestBytes)))
      const enrollResponse = await fetch('https://testnet.perpl.xyz/api/v1/api-key/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chain_id: 10143, address: connectedAddress, typed_data: typedData, mac: payload.mac, signature, pop_signature: popSignature }),
      })
      const enrolled = await enrollResponse.json().catch(() => null)
      const token = enrolled?.api_key?.api_key || enrolled?.api_key
      if (!enrollResponse.ok || typeof token !== 'string') throw new Error(responseMessage(enrolled, 'Perpl could not enroll the GentrY trading key.'))
      const nextCredentials = { apiKey: token, privateKey: bytesToHex(privateSeed) }
      setApiKey(nextCredentials.apiKey)
      setPrivateKey(nextCredentials.privateKey)
      await linkAccount(nextCredentials)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perpl pairing did not complete.')
      setBusy(null)
    }
  }

  async function placeOrder(event: FormEvent) {
    event.preventDefault()
    setBusy('order'); setError(''); setResult(null)
    try {
      if (!linkedAddress) throw new Error('Link your Perpl account first.')
      const submittedAt = Date.now()
      const trimmedKey = apiKey.trim()
      const trimmedSecret = privateKey.trim()
      const response = await fetch('/api/perpl/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        apiKey: trimmedKey, privateKey: trimmedSecret, address: linkedAddress, marketId: market.id, accountId, direction, action, positionId: Number(positionId), notional: Number(notional), leverage: Number(leverage),
      }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Perpl could not place the order.')
      const acceptedResult = payload as OrderResult
      setResult(acceptedResult)
      onNotice(payload.status ? `Perpl order status: ${statusNames[payload.status.code] || 'Updated'}.` : 'Order placed on Perpl. Checking confirmation…')

      void (async () => {
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, attempt ? 1200 : 400))
          const statusResponse = await fetch('/api/perpl/order-status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: trimmedKey, privateKey: trimmedSecret, requestId: acceptedResult.requestId, accountId, marketId: market.id, sizeDecimals: market.sizeDecimals || 0, priceDecimals: market.priceDecimals || 0 }) }).catch(() => null)
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
          const accountResponse = await fetch('/api/perpl/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: trimmedKey, privateKey: trimmedSecret }) }).catch(() => null)
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

  const isConnected = accounts.length > 0

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="modal perpl-trader-modal" role="dialog" aria-modal="true" aria-labelledby="trade-title">
      <button className="close-button" aria-label="Close order panel" disabled={busy !== null} onClick={onClose}><X size={19} /></button>
      <span className="modal-kicker">PERPL TRADING ENGINE · MONAD TESTNET</span>
      <h2 id="trade-title">{isConnected ? `Trade ${market.symbol} Perpetual` : 'Connect Perpl Account'}</h2>
      <p>
        {isConnected
          ? `Execute real-time perpetual orders directly inside GentrY on Monad Testnet.`
          : `GentrY submits orders to Perpl’s high-speed orderbook on Monad. Pair the API credentials for the Perpl smart-contract account you want to trade from.`}
      </p>

      {/* When Connected: Show Connected Account Banner */}
      {isConnected && <div className="perpl-connected-badge">
        <span><KeyRound size={14} /> Connected: Account #{accountId} {linkedAddress ? `(${linkedAddress.slice(0, 6)}…${linkedAddress.slice(-4)})` : ''}</span>
        <button type="button" onClick={forgetCredentials}>Disconnect key</button>
      </div>}

      {/* Screen 1: One-Time Connection Form if Not Connected */}
      {!isConnected && <>
        <div className="perpl-connect-guide">
          <p>Set up your Perpl account:</p>
          <ol>
            <li>Open your <a href="https://testnet.perpl.xyz/apikeys" target="_blank" rel="noreferrer">Perpl Account Settings <ArrowUpRight size={11} style={{ display: 'inline' }} /></a> in a new tab.</li>
            <li>Create a Perpl smart-contract account, then turn on <strong>Order Forwarding</strong>.</li>
            <li>Create an API key for GentrY’s origin and paste the key plus its signing key below.</li>
          </ol>
        </div>

        <button className="primary-button wide" type="button" disabled={busy !== null} onClick={() => void pairWithPrivyWallet()}>
          {busy === 'account' ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
          {!authenticated ? 'Sign in to pair your Perpl account' : busy === 'account' ? 'Pairing with Perpl…' : 'Pair with my Privy wallet'}
        </button>
        <p className="perpl-divider"><span>or use an existing Perpl API key</span></p>

        <form className="perpl-link-form" onSubmit={(event) => void loadAccount(event)}>
          <label htmlFor="perpl-api-key">Perpl API key</label>
          <input
            id="perpl-api-key"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste your Perpl API key"
            required
          />

          <label htmlFor="perpl-signing-key">Perpl signing key (private key)</label>
          <input
            id="perpl-signing-key"
            type="password"
            autoComplete="new-password"
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
            placeholder="Paste your 32-byte signing key"
            required
          />

          <div className="perpl-privacy">
            <LockKeyhole size={15} />
            <span>Used only to sign orders from this tab. Your GentrY login remains connected through Privy; the Perpl signing key is never written to browser storage.</span>
          </div>

          <button className="primary-button wide" disabled={busy !== null || !apiKey.trim() || !privateKey.trim()}>
            {busy === 'account' ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            {busy === 'account' ? 'Connecting to Perpl…' : 'Connect & Start Trading'}
          </button>
        </form>
      </>}

      {/* Screen 2: Live In-App Trading Terminal */}
      {isConnected && !result && <form className="perpl-order-form" onSubmit={(event) => void placeOrder(event)}>
        {accounts.length > 1 && <>
          <label htmlFor="perpl-account">Perpl Trading Account</label>
          <select id="perpl-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                Account {account.id}{account.forwarding ? '' : ' · forwarding off'}
              </option>
            ))}
          </select>
        </>}

        {!accounts.find((account) => String(account.id) === accountId)?.forwarding && (
          <div className="perpl-privacy">Order Forwarding is off in Perpl. Turn it on in Perpl settings to execute trades.</div>
        )}

        <div className="trade-direction">
          <button type="button" className={action === 'open' ? 'active long' : ''} onClick={() => setAction('open')}>Open position</button>
          <button type="button" className={action === 'close' ? 'active short' : ''} onClick={() => setAction('close')}>Close position</button>
        </div>

        {action === 'close' && <>
          {positions.filter((position) => position.accountId === Number(accountId) && position.marketId === market.id).length > 0 ? <>
            <label htmlFor="perpl-position">Select Open {market.symbol} Position</label>
            <select
              id="perpl-position"
              value={positionId}
              onChange={(event) => {
                const value = event.target.value
                setPositionId(value)
                const position = positions.find((item) => String(item.id) === value)
                if (position) {
                  setDirection(position.side)
                  setNotional(position.notional.toFixed(2))
                  setLeverage(String(Math.max(1, Math.floor(position.leverage))))
                }
              }}
            >
              <option value="">Choose open position…</option>
              {positions.filter((position) => position.accountId === Number(accountId) && position.marketId === market.id).map((position) => (
                <option key={position.id} value={position.id}>
                  {position.side === 'long' ? 'Long' : 'Short'} · {position.size.toFixed(market.sizeDecimals ?? 4)} {market.symbol} · {money(position.notional)}
                </option>
              ))}
            </select>
          </> : <div className="perpl-privacy">No open {market.symbol} position was found for this account.</div>}
        </>}

        {action === 'open' && (
          <div className="trade-direction">
            <button type="button" className={direction === 'long' ? 'active long' : ''} onClick={() => setDirection('long')}>Buy / Long</button>
            <button type="button" className={direction === 'short' ? 'active short' : ''} onClick={() => setDirection('short')}>Sell / Short</button>
          </div>
        )}

        <div className="trade-fields">
          <label htmlFor="trade-notional">
            {action === 'close' ? 'Close Value (USD)' : 'Order Value (USD)'}
            <input
              id="trade-notional"
              type="number"
              min="0.01"
              max={action === 'close' ? selectedPosition?.notional : undefined}
              step="any"
              inputMode="decimal"
              value={notional}
              onChange={(event) => setNotional(event.target.value)}
              placeholder="e.g. 100"
              required
            />
            {action === 'open' && <div className="trade-preset-pills">
              {['25', '50', '100', '250', '500'].map((val) => (
                <button type="button" key={val} onClick={() => setNotional(val)}>${val}</button>
              ))}
            </div>}
          </label>
          <label htmlFor="trade-leverage">
            Leverage
            <select id="trade-leverage" value={leverage} onChange={(event) => setLeverage(event.target.value)}>
              {Array.from({ length: maxLeverage }, (_, i) => i + 1).filter((v) => v <= 10 || v % 5 === 0).map((value) => (
                <option key={value} value={value}>{value}×</option>
              ))}
            </select>
          </label>
        </div>

        <div className="order-review">
          <div><span>Market</span><strong>{market.symbol} Perpetual</strong></div>
          <div><span>Mark price</span><strong>{money(market.mark)}</strong></div>
          <div><span>Approx. size</span><strong>{estimate ? `${estimate.size.toFixed(market.sizeDecimals ?? 4)} ${market.symbol}` : '—'}</strong></div>
          <div><span>Required collateral</span><strong>{estimate ? money(estimate.collateral) : '—'}</strong></div>
          <div><span>Est. liquidation</span><strong>{estimate ? `~${estimate.liqMovePct.toFixed(1)}% move (${money(estimate.estLiquidation)})` : '—'}</strong></div>
          <div><span>Max slippage limit</span><strong>{market.maxSlippageBps ?? 50} bps</strong></div>
        </div>

        <button
          className="primary-button wide"
          disabled={busy !== null || !estimate || !accountId || !accounts.find((account) => String(account.id) === accountId)?.forwarding || (action === 'close' && !positionId)}
        >
          {busy === 'order' ? <LoaderCircle className="spin" size={16} /> : null}
          {busy === 'order'
            ? 'Placing order on Perpl…'
            : action === 'close'
            ? `Close ${direction} position`
            : `Place ${direction === 'long' ? 'Buy / Long' : 'Sell / Short'} Order`}
        </button>
      </form>}

      {/* Screen 3: Order Fill Result & Onchain Proof */}
      {result && <div className="order-result">
        <div className="success-icon"><Check size={22} /></div>
        <h3>{result.status ? statusNames[result.status.code] || 'Order updated' : 'Order submitted'}</h3>
        <p>{result.status ? `${result.status.filledSize} ${result.market} filled at ${money(result.status.averageFillPrice)}.` : 'Perpl received your order. Checking confirmation on Monad.'}</p>
        <div className="order-review">
          <div><span>Request number</span><strong>#{result.requestId}</strong></div>
          <div><span>Order value</span><strong>{money(result.notional)}</strong></div>
          <div><span>Estimated fee</span><strong>{money(result.estimatedTakerFee)}</strong></div>
          <div><span>Leverage</span><strong>{result.leverage}×</strong></div>
        </div>
        {result.onchainTransactions?.length ? (
          <div className="perpl-tx-proof">
            <strong>Confirmed on Monad Testnet</strong>
            {result.onchainTransactions.map((transaction) => (
              <a key={transaction.hash} href={`https://testnet.monadscan.com/tx/${transaction.hash}`} target="_blank" rel="noreferrer">
                View transaction · block {Number(transaction.blockNumber).toLocaleString()} <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
        ) : null}
        <button className="primary-button wide" onClick={() => setResult(null)}>Trade again</button>
        <button className="secondary-button wide" onClick={onClose}>Done</button>
      </div>}

      {/* Open Positions List */}
      {isConnected && positions.length > 0 && !result && (
        <div className="perpl-recent-fills" style={{ marginTop: 14 }}>
          <strong>Your Open Positions</strong>
          {positions.map((pos) => (
            <div className="perpl-recent-fill" key={pos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{pos.symbol} · {pos.side.toUpperCase()} · {pos.size.toFixed(4)} @ {money(pos.entryPrice)}</span>
              <button
                type="button"
                className="text-button"
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}
                onClick={() => {
                  setAction('close')
                  setPositionId(String(pos.id))
                  setDirection(pos.side)
                  setNotional(pos.notional.toFixed(2))
                  setLeverage(String(Math.max(1, Math.floor(pos.leverage))))
                }}
              >
                Close
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent Fills List */}
      {fills.length > 0 && !result && (
        <div className="perpl-recent-fills">
          <strong>Recent Fills</strong>
          {fills.slice(0, 3).map((fill) => (
            <div className="perpl-recent-fill" key={`${fill.orderId}-${fill.timestamp}`}>
              <span>{fill.symbol} · {fill.type === 1 || fill.type === 3 ? 'Long' : 'Short'} · {fill.size} @ {money(fill.price)}</span>
              {fill.transaction ? (
                <a href={`https://testnet.monadscan.com/tx/${fill.transaction.hash}`} target="_blank" rel="noreferrer">
                  Confirmed on Monad <ArrowUpRight size={13} />
                </a>
              ) : <span>Verifying on Monad…</span>}
            </div>
          ))}
        </div>
      )}

      {error && <div className="perpl-inline-error" role="alert">{error}</div>}
      <p className="perpl-network-note">Monad Testnet · Trades are executed directly via Perpl's offchain orderbook with onchain settlement.</p>
    </section>
  </div>
}
