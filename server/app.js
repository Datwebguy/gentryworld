import 'dotenv/config'
import express from 'express'
import { createHash, createPrivateKey, randomBytes, sign as signEd25519 } from 'node:crypto'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import { paymentMiddleware } from '@x402/express'
import { createPublicClient, formatEther, formatUnits, http, isAddress, parseAbi, parseUnits } from 'viem'
import { fileURLToPath } from 'node:url'

const app = express()
app.set('trust proxy', true)
// HyperRPC is used for indexed event queries. Contract reads stay on Monad's
// official RPC because the HyperSync JSON-RPC surface does not expose eth_call.
const rpcUrl = 'https://testnet-rpc.monad.xyz'
const network = 'eip155:10143'
const usdcAddress = '0x534b2f3A21130d7a60830c2Df862319e593943A3'
const facilitatorUrl = 'https://x402-facilitator.molandak.org'
const payTo = process.env.GENTRY_AGENT_PAY_TO || ''
const price = process.env.GENTRY_AGENT_PRICE_USDC || ''
const publicUrl = process.env.GENTRY_PUBLIC_URL?.replace(/\/$/, '')
const allowedOrigin = process.env.GENTRY_ALLOWED_ORIGIN || '*'
const root = fileURLToPath(new URL('../dist/', import.meta.url))
const identityAddress = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const reputationAddress = '0x8004B663056A597Dffe9eCcC1965A193B7388713'
const identityAbi = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const reputationAbi = parseAbi([
  'function getClients(uint256 agentId) view returns (address[])',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
])
const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
])
const monad = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
}
const publicClient = createPublicClient({ chain: monad, transport: http(rpcUrl, { retryCount: 4, retryDelay: 700 }) })

app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', allowedOrigin)
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type, payment-signature, payment-identifier, access-control-expose-headers, x-payment')
  res.setHeader('access-control-expose-headers', 'payment-required, payment-response, x-payment-response')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.post('/api/rpc', express.text({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const upstream = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: req.body })
    res.status(upstream.status).type('application/json').send(await upstream.text())
  } catch {
    res.status(502).json({ error: 'Monad Testnet is unavailable.' })
  }
})

app.use(express.json({ limit: '16kb' }))

app.get('/api/health', (_req, res) => res.json({ status: 'ok', network: 'Monad Testnet' }))

// Perpl credentials are accepted only for the current request, used in memory,
// and never logged or persisted. The browser talks to this same-origin proxy
// because Perpl's authenticated API does not allow browser CORS preflights.
function perplCredentials(body) {
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
  const secret = typeof body?.privateKey === 'string' ? body.privateKey.replace(/^0x/i, '').trim() : ''
  if (!apiKey || !/^[a-f\d]{64}$/i.test(secret)) throw new Error('Enter a valid Perpl API key and 32-byte private key.')
  const derPrefix = Buffer.from('302e020100300506032b657004220420', 'hex')
  const key = createPrivateKey({ key: Buffer.concat([derPrefix, Buffer.from(secret, 'hex')]), format: 'der', type: 'pkcs8' })
  return { apiKey, key }
}

async function signedPerplRequest(credentials, method, target, body = '') {
  const timestamp = Date.now().toString()
  const nonce = randomBytes(16).toString('base64url')
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const canonical = [10143, method, target, timestamp, nonce, bodyHash].join('\n')
  const signature = signEd25519(null, Buffer.from(canonical), credentials.key).toString('base64url')
  return fetch(`https://testnet.perpl.xyz/api${target}`, {
    method,
    headers: {
      'X-API-Key': credentials.apiKey,
      'X-API-Timestamp': timestamp,
      'X-API-Nonce': nonce,
      'X-API-Signature': signature,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(10_000),
  })
}

app.post('/api/perpl/account', async (req, res) => {
  try {
    const credentials = perplCredentials(req.body)
    const response = await signedPerplRequest(credentials, 'GET', '/v1/trading/wallet')
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return res.status(response.status).json({ error: response.status === 401 ? 'Perpl could not verify these credentials.' : response.status === 403 ? 'This Perpl key cannot read account details.' : response.status === 404 ? 'No Perpl trading account is linked to this wallet yet.' : 'Perpl account details are unavailable.' })
    const accounts = Array.isArray(payload.as) ? payload.as : []
    const [positionsResponse, contextResponse] = await Promise.all([
      signedPerplRequest(credentials, 'GET', '/v1/trading/positions'),
      fetch('https://testnet.perpl.xyz/api/v1/pub/context', { signal: AbortSignal.timeout(8000) }),
    ])
    const positionsPayload = positionsResponse.ok ? await positionsResponse.json().catch(() => ({})) : {}
    const context = contextResponse.ok ? await contextResponse.json().catch(() => ({})) : {}
    const markets = new Map((context.markets || []).map((market) => [Number(market.id), market]))
    const positions = (positionsPayload.d || []).filter((position) => Number(position.st) === 1)
      .map((position) => {
        const market = markets.get(Number(position.mkt))
        const sizeDecimals = Number(market?.config?.size_decimals || 0)
        const priceDecimals = Number(market?.config?.price_decimals || 0)
        const mark = Number(market?.state?.mrk || market?.state?.mid || 0) / (10 ** priceDecimals)
        const size = Number(position.s || 0) / (10 ** sizeDecimals)
        return { id: Number(position.pid), accountId: Number(position.acc), marketId: Number(position.mkt), symbol: market?.symbol || `Market ${position.mkt}`, side: Number(position.sd) === 1 ? 'long' : 'short', size, entryPrice: Number(position.ep || 0) / (10 ** priceDecimals), mark, notional: size * mark, leverage: Number(position.lv || 100) / 100 }
      })
    res.json({ address: payload.addr, block: payload.sn, accounts: accounts.map((account) => ({ id: account.id, forwarding: Boolean(account.fw), lastRequestId: Number(account.lfr || 0), balance: account.b, equity: account.eq })), positions })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error && error.message.startsWith('Enter a valid') ? error.message : 'Could not read the Perpl account.' })
  }
})

app.post('/api/perpl/order', async (req, res) => {
  try {
    const { apiKey, privateKey, address, marketId, direction, action = 'open', positionId, notional, leverage } = req.body || {}
    if (!/^0x[a-f\d]{40}$/i.test(String(address || '')) || !Number.isInteger(Number(marketId)) || !['long', 'short'].includes(direction) || !['open', 'close'].includes(action) || !Number.isFinite(Number(notional)) || Number(notional) <= 0 || !Number.isFinite(Number(leverage))) {
      return res.status(400).json({ error: 'Review the wallet, market, size, direction, and leverage.' })
    }
    const credentials = perplCredentials({ apiKey, privateKey })
    const walletResponse = await signedPerplRequest(credentials, 'GET', '/v1/trading/wallet')
    const wallet = await walletResponse.json().catch(() => ({}))
    if (!walletResponse.ok) return res.status(walletResponse.status).json({ error: walletResponse.status === 401 ? 'Perpl could not verify these credentials.' : walletResponse.status === 403 ? 'This Perpl key cannot read account details.' : 'Perpl account details are unavailable.' })
    if (String(wallet.addr || '').toLowerCase() !== address.toLowerCase()) return res.status(403).json({ error: 'The connected wallet does not match this Perpl API key.' })
    const account = (wallet.as || []).find((item) => Number(item.id) === Number(req.body.accountId))
    if (!account) return res.status(400).json({ error: 'Choose an account returned by Perpl.' })
    if (!account.fw) return res.status(409).json({ error: 'Order forwarding is off for this Perpl account. Turn it on in Perpl before placing an order.' })
    const contextResponse = await fetch('https://testnet.perpl.xyz/api/v1/pub/context', { signal: AbortSignal.timeout(8000) })
    if (!contextResponse.ok) throw new Error('Market context unavailable')
    const context = await contextResponse.json()
    const market = context.markets?.find((item) => Number(item.id) === Number(marketId) && item.config?.is_open)
    if (!market) return res.status(400).json({ error: 'This Perpl market is not open.' })
    const mark = Number(market.state?.mrk || market.state?.mid || 0) / (10 ** Number(market.config.price_decimals || 0))
    if (!(mark > 0)) return res.status(503).json({ error: 'A live market price is not available.' })
    const lev = Number(leverage)
    const maxLeverage = Number(market.config.initial_margin) > 0 ? 10_000 / Number(market.config.initial_margin) : 0
    if (lev < 1 || lev > maxLeverage || lev > 100) return res.status(400).json({ error: `Leverage must be between 1x and ${Math.floor(maxLeverage)}x for this market.` })
    const decimals = Number(market.config.size_decimals || 0)
    const scale = 10 ** decimals
    let scaledSize = Math.floor((Number(notional) / mark) * scale)
    let orderType = direction === 'long' ? 1 : 2
    if (action === 'close') {
      const positionsResponse = await signedPerplRequest(credentials, 'GET', '/v1/trading/positions')
      const positions = positionsResponse.ok ? await positionsResponse.json().catch(() => ({})) : {}
      const position = (positions.d || []).find((item) => Number(item.pid) === Number(positionId) && Number(item.acc) === Number(account.id) && Number(item.mkt) === Number(market.id) && Number(item.st) === 1)
      if (!position) return res.status(409).json({ error: 'That position has changed or is already closed. Refresh positions and try again.' })
      const positionSize = Number(position.s || 0)
      if (!Number.isSafeInteger(scaledSize) || scaledSize <= 0 || scaledSize > positionSize) return res.status(400).json({ error: 'Close size exceeds the selected open position.' })
      orderType = Number(position.sd) === 1 ? 3 : 4
    }
    if (!Number.isSafeInteger(scaledSize) || scaledSize <= 0) return res.status(400).json({ error: 'Order size is below this market’s supported precision.' })
    const actualSize = scaledSize / scale
    const actualNotional = actualSize * mark
    const accountFeeTier = Number(account.ft || 0)
    const takerFees = Array.isArray(market.config.taker_fees) ? market.config.taker_fees : []
    const feeMicros = Number(takerFees[accountFeeTier] ?? market.config.taker_fee ?? 0)
    const requestId = Math.max(Number(account.lfr || 0), 0) + 1
    const spec = { rq: requestId, mkt: Number(market.id), acc: Number(account.id), t: orderType, p: 0, s: scaledSize, ms: Number(market.order_max_market_slippage_bps || 0), fl: 4, lv: Math.round(lev * 100), lb: 0 }
    const body = JSON.stringify({ d: [spec] })
    const submittedAt = Date.now()
    const submitResponse = await signedPerplRequest(credentials, 'POST', '/v1/trading/orders', body)
    const acknowledgment = await submitResponse.json().catch(() => ({}))
    if (!submitResponse.ok) return res.status(submitResponse.status).json({ error: submitResponse.status === 403 ? 'This Perpl API key needs trading access.' : submitResponse.status === 401 ? 'Perpl could not verify these credentials.' : acknowledgment.status?.error || 'Perpl did not accept the order request.' })
    const orderStatus = acknowledgment.statuses?.[0]
    if (acknowledgment.status?.code !== 0 || !orderStatus || orderStatus.code !== 0) return res.status(422).json({ error: orderStatus?.error || acknowledgment.status?.error || 'Perpl declined the order.' })
    let order = null
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 700))
      const [historyResponse, fillsResponse] = await Promise.all([
        signedPerplRequest(credentials, 'GET', '/v1/trading/order-history?count=50'),
        signedPerplRequest(credentials, 'GET', '/v1/trading/fills?count=50'),
      ])
      if (historyResponse.ok) {
        const history = await historyResponse.json().catch(() => ({}))
        order = history.d?.find((item) => Number(item.rq) === requestId && Number(item.acc) === Number(account.id) && Number(item.mkt) === Number(market.id)) || null
      }
      // Perpl may publish the fill before its order-history view catches up.
      // A fill carries no request ID, so only associate a recent fill matching
      // this account, market, side, and the requested size, within this request's
      // short settlement window.
      if (!order && fillsResponse.ok) {
        const fills = await fillsResponse.json().catch(() => ({}))
        const recent = (fills.d || []).filter((item) => Number(item.acc) === Number(account.id) && Number(item.mkt) === Number(market.id) && Number(item.t) === spec.t && Number(item.at?.t) >= submittedAt - 1000 && Number(item.at?.t) <= submittedAt + 15_000)
        if (recent.length) {
          const orderId = Number(recent[0].oid)
          const sameOrder = recent.filter((item) => Number(item.oid) === orderId)
          const filledSize = sameOrder.reduce((sum, item) => sum + Number(item.s || 0), 0)
          const averagePrice = filledSize ? sameOrder.reduce((sum, item) => sum + Number(item.p || 0) * Number(item.s || 0), 0) / filledSize : 0
          order = { st: filledSize >= scaledSize ? 4 : 3, sr: 0, fs: filledSize, fp: averagePrice, oid: orderId, rq: requestId }
        }
      }
    }
    res.json({ accepted: true, requestId, market: market.symbol, direction: action === 'close' ? `close-${direction}` : direction, action, mark, size: actualSize, notional: actualNotional, leverage: lev, estimatedCollateral: actualNotional / lev, estimatedTakerFee: actualNotional * feeMicros / 1_000_000, slippageBps: spec.ms, status: order ? { code: Number(order.st), reason: Number(order.sr), filledSize: Number(order.fs || 0) / scale, averageFillPrice: Number(order.fp || 0) / (10 ** Number(market.config.price_decimals || 0)), orderId: Number(order.oid || 0), requestId: Number(order.rq) } : null })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error && error.message.startsWith('Enter a valid') ? error.message : 'Perpl could not complete this request.' })
  }
})

const marketSnapshot = { value: null, updatedAt: 0, promise: null }
app.get('/api/markets', async (_req, res) => {
  try {
    if (!marketSnapshot.value || Date.now() - marketSnapshot.updatedAt > 15_000) {
      if (!marketSnapshot.promise) marketSnapshot.promise = fetch('https://testnet.perpl.xyz/api/v1/pub/context', { signal: AbortSignal.timeout(8000) })
        .then((response) => { if (!response.ok) throw new Error('Perpl market context unavailable'); return response.json() })
        .then((context) => {
          if (!Array.isArray(context.markets)) throw new Error('Perpl market context has no market list')
          const markets = context.markets.map((market) => {
            const decimals = Number(market.config?.price_decimals || 0)
            const scale = 10 ** decimals
            const mark = Number(market.state?.mrk || market.state?.mid || 0) / scale
            const previous = Number(market.state?.prv || 0) / scale
            return {
              id: market.id,
              symbol: market.symbol,
              name: market.name,
              mark,
              previous,
              changePct: previous ? ((mark - previous) / previous) * 100 : 0,
              fundingRate: Number(market.funding?.rate || 0),
              sizeDecimals: Number(market.config?.size_decimals || 0),
              priceDecimals: Number(market.config?.price_decimals || 0),
              maxLeverage: Number(market.config?.initial_margin || 0) > 0 ? 10_000 / Number(market.config.initial_margin) : null,
              maxSlippageBps: Number(market.order_max_market_slippage_bps || 0),
              open: Boolean(market.config?.is_open),
              updatedAt: Number(market.state?.at?.t || 0) || null,
            }
          }).filter((market) => market.open && Number.isFinite(market.mark) && market.mark > 0)
          marketSnapshot.value = { network: 'Monad Testnet', source: 'Perpl public market context', markets }
          marketSnapshot.updatedAt = Date.now()
          return marketSnapshot.value
        }).catch((error) => {
          if (marketSnapshot.value) return marketSnapshot.value
          throw error
        }).finally(() => { marketSnapshot.promise = null })
      await marketSnapshot.promise
    }
    res.setHeader('cache-control', 'public, max-age=10, stale-while-revalidate=30')
    res.json({ ...marketSnapshot.value, updatedAt: marketSnapshot.updatedAt, stale: Date.now() - marketSnapshot.updatedAt > 15_000 })
  } catch (error) {
    console.error('Market snapshot failed:', error)
    res.status(502).json({ error: 'Live market data is unavailable right now.' })
  }
})

const agentIndex = { agents: [], updatedAt: 0, latestId: null, promise: null }
const resolveProfileUri = (uri) => uri.startsWith('ipfs://')
  ? `https://ipfs.io/ipfs/${uri.slice(7)}`
  : uri.startsWith('ar://') ? `https://arweave.net/${uri.slice(5)}` : uri

async function registeredOwner(id) {
  try {
    return await publicClient.readContract({ address: identityAddress, abi: identityAbi, functionName: 'ownerOf', args: [id] })
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('revert') || message.includes('nonexistent') || message.includes('invalid token')) return null
    throw error
  }
}

async function findLatestAgentId() {
  if (agentIndex.latestId !== null && await registeredOwner(agentIndex.latestId + 1n) === null) return agentIndex.latestId
  if (!await registeredOwner(0n)) return null
  let found = agentIndex.latestId ?? 0n
  let missing = found > 0n ? found + 1n : 1n
  while (await registeredOwner(missing)) {
    found = missing
    missing *= 2n
  }
  while (found + 1n < missing) {
    const middle = (found + missing) / 2n
    if (await registeredOwner(middle)) found = middle
    else missing = middle
  }
  agentIndex.latestId = found
  return found
}

async function fetchProfile(uri) {
  if (!uri) return null
  try {
    const response = await fetch(resolveProfileUri(uri), { signal: AbortSignal.timeout(6000) })
    if (!response.ok) return null
    const profile = await response.json()
    return profile && typeof profile === 'object' ? profile : null
  } catch { return null }
}

async function refreshAgentIndex() {
  if (agentIndex.promise) return agentIndex.promise
  agentIndex.promise = (async () => {
    const latestId = await findLatestAgentId()
    if (latestId === null) return []
    // Keep a useful recent window while allowing the GentrY reference agent
    // to remain discoverable as new registrations arrive.
    const count = 48n
    const firstId = latestId + 1n > count ? latestId + 1n - count : 0n
    const ids = Array.from({ length: Number(latestId - firstId + 1n) }, (_, index) => firstId + BigInt(index))
    await new Promise((resolve) => setTimeout(resolve, 1100))
    // Pace reads beneath the official public RPC's 15 requests/second limit.
    const base = []
    for (const id of ids) {
      const uri = await publicClient.readContract({ address: identityAddress, abi: identityAbi, functionName: 'tokenURI', args: [id] })
      await new Promise((resolve) => setTimeout(resolve, 90))
      const owner = await registeredOwner(id)
      await new Promise((resolve) => setTimeout(resolve, 90))
      const clients = await publicClient.readContract({ address: reputationAddress, abi: reputationAbi, functionName: 'getClients', args: [id] }).catch(() => [])
      await new Promise((resolve) => setTimeout(resolve, 90))
      base.push({ id, uri, owner, clients })
    }
    const summaryById = new Map()
    for (const row of base.filter((item) => item.clients.length)) {
      const summary = await publicClient.readContract({
        address: reputationAddress, abi: reputationAbi, functionName: 'getSummary', args: [row.id, row.clients, '', ''],
      }).catch(() => null)
      summaryById.set(row.id.toString(), summary)
      await new Promise((resolve) => setTimeout(resolve, 90))
    }
    const rows = await Promise.all(base.map(async ({ id, uri, owner }) => {
      const card = await fetchProfile(uri)
      const summary = summaryById.get(id.toString())
      return {
        id: id.toString(), uri, owner, card,
        summary: summary && summary[0] > 0n ? { count: summary[0].toString(), value: summary[1].toString(), decimals: summary[2] } : null,
      }
    }))
    agentIndex.agents = rows.filter((row) => row.card && typeof row.card.name === 'string')
    agentIndex.updatedAt = Date.now()
    return agentIndex.agents
  })().finally(() => { agentIndex.promise = null })
  return agentIndex.promise
}

app.get('/api/agents', async (_req, res) => {
  try {
    const stale = Date.now() - agentIndex.updatedAt > 90_000
    if (stale && agentIndex.agents.length) void refreshAgentIndex().catch(() => {})
    const agents = agentIndex.agents.length ? agentIndex.agents : await refreshAgentIndex()
    res.setHeader('cache-control', 'public, max-age=15, stale-while-revalidate=90')
    res.json({ network: 'Monad Testnet', registry: identityAddress, updatedAt: agentIndex.updatedAt, agents })
  } catch (error) {
    console.error('Agent index refresh failed:', error)
    if (agentIndex.agents.length) return res.json({ network: 'Monad Testnet', registry: identityAddress, updatedAt: agentIndex.updatedAt, agents: agentIndex.agents })
    res.status(502).json({ error: 'Agent information is unavailable right now.' })
  }
})

void refreshAgentIndex().catch((error) => console.error('Initial agent index refresh failed:', error))

const configured = Boolean(payTo && price && isAddress(payTo, false) && /^\d+(\.\d{1,6})?$/.test(price) && Number(price) > 0)
const publicBase = (req) => {
  if (publicUrl) return publicUrl
  const host = req.get('x-forwarded-host') || req.get('host')
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  return `${localHost ? 'http' : 'https'}://${host}`
}

app.get('/agent-card.json', (req, res) => {
  const base = publicBase(req)
  res.json({
    name: 'Monad Address Inspector',
    description: 'Live wallet and token due diligence for Monad Testnet.',
    capabilities: ['Wallet intelligence', 'Token intelligence', 'Transaction verification'],
    skills: ['Native balance lookup', 'Contract detection', 'Token supply analysis', 'Receipt analysis'],
    endpoints: configured ? [{
      name: 'Inspect an address',
      endpoint: `${base}/api/address-inspector`,
      skills: ['Native balance lookup', 'Contract detection'],
      pricing: { amount: price, currency: 'USDC', network: 'Monad Testnet' },
    }, {
      name: 'Inspect a token',
      endpoint: `${base}/api/token-inspector`,
      skills: ['Token metadata', 'Supply analysis', 'Contract verification'],
      pricing: { amount: price, currency: 'USDC', network: 'Monad Testnet' },
    }, {
      name: 'Verify a transaction',
      endpoint: `${base}/api/transaction-inspector`,
      skills: ['Transaction verification', 'Receipt analysis', 'Transfer review'],
      pricing: { amount: price, currency: 'USDC', network: 'Monad Testnet' },
    }, {
      name: 'Analyze a market signal',
      endpoint: `${base}/api/market-signal`,
      skills: ['Live market price', 'Movement analysis', 'Funding review'],
      pricing: { amount: price, currency: 'USDC', network: 'Monad Testnet' },
    }] : [],
    payment: configured ? { protocol: 'x402', amount: price, currency: 'USDC', network: 'Monad Testnet' } : undefined,
  })
})

if (configured) {
  const monadScheme = new ExactEvmScheme()
  monadScheme.registerMoneyParser(async (value, requestedNetwork) => {
    if (requestedNetwork !== network) return null
    return {
      amount: parseUnits(String(value), 6).toString(),
      asset: usdcAddress,
      extra: { name: 'USDC', version: '2' },
    }
  })

  const resourceServer = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: facilitatorUrl }),
  ).register(network, monadScheme)

  app.post('/api/address-inspector', (req, res, next) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const candidate = task.match(/0x[a-fA-F0-9]{40}/)?.[0]
    if (!candidate || !isAddress(candidate, false)) {
      return res.status(400).json({ error: 'Enter a valid Monad address before continuing.' })
    }
    next()
  })

  app.post('/api/token-inspector', async (req, res, next) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const candidate = task.match(/0x[a-fA-F0-9]{40}/)?.[0]
    if (!candidate || !isAddress(candidate, false)) return res.status(400).json({ error: 'Enter a valid token address before continuing.' })
    try {
      const code = await publicClient.getCode({ address: candidate })
      if (!code || code === '0x') return res.status(400).json({ error: 'This address is not a token contract.' })
      await publicClient.readContract({ address: candidate, abi: erc20Abi, functionName: 'decimals' })
      next()
    } catch { res.status(400).json({ error: 'This contract does not expose standard token information.' }) }
  })

  app.post('/api/transaction-inspector', async (req, res, next) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const candidate = task.match(/0x[a-fA-F0-9]{64}/)?.[0]
    if (!candidate) return res.status(400).json({ error: 'Enter a valid Monad transaction hash before continuing.' })
    try {
      const transaction = await publicClient.getTransaction({ hash: candidate })
      if (!transaction) return res.status(400).json({ error: 'That transaction was not found on Monad Testnet.' })
      next()
    } catch { res.status(400).json({ error: 'That transaction could not be read from Monad Testnet.' }) }
  })

  app.post('/api/market-signal', (req, res, next) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    if (!/\b[A-Z0-9]{2,12}\b/i.test(task)) return res.status(400).json({ error: 'Name the market symbol you want to review.' })
    next()
  })

  app.use(paymentMiddleware({
    'POST /api/address-inspector': {
      accepts: {
        scheme: 'exact',
        network,
        payTo,
        price: `$${price}`,
      },
      resource: publicUrl ? `${publicUrl}/api/address-inspector` : undefined,
      description: 'Live Monad Testnet balance and contract status for an address.',
      mimeType: 'application/json',
      serviceName: 'Monad Address Inspector',
    },
    'POST /api/token-inspector': {
      accepts: { scheme: 'exact', network, payTo, price: `$${price}` },
      resource: publicUrl ? `${publicUrl}/api/token-inspector` : undefined,
      description: 'Live Monad Testnet token metadata and supply information.',
      mimeType: 'application/json',
      serviceName: 'Monad Token Inspector',
    },
    'POST /api/transaction-inspector': {
      accepts: { scheme: 'exact', network, payTo, price: `$${price}` },
      resource: publicUrl ? `${publicUrl}/api/transaction-inspector` : undefined,
      description: 'Live Monad Testnet transaction and receipt verification.',
      mimeType: 'application/json',
      serviceName: 'Monad Transaction Inspector',
    },
    'POST /api/market-signal': {
      accepts: { scheme: 'exact', network, payTo, price: `$${price}` },
      resource: publicUrl ? `${publicUrl}/api/market-signal` : undefined,
      description: 'Live Monad Testnet market movement and funding analysis.',
      mimeType: 'application/json',
      serviceName: 'Monad Market Signal Analyst',
    },
  }, resourceServer))

  app.post('/api/address-inspector', async (req, res) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const candidate = task.match(/0x[a-fA-F0-9]{40}/)?.[0]
    if (!candidate || !isAddress(candidate, false)) {
      return res.status(400).json({ error: 'Enter a valid Monad address to inspect.' })
    }

    try {
      const address = candidate
      const [balance, bytecode, blockNumber] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.getCode({ address }),
        publicClient.getBlockNumber(),
      ])
      res.json({
        network: 'Monad Testnet',
        address,
        balanceMON: formatEther(balance),
        isContract: Boolean(bytecode && bytecode !== '0x'),
        blockNumber: blockNumber.toString(),
      })
    } catch {
      res.status(502).json({ error: 'Monad Testnet data is temporarily unavailable.' })
    }
  })

  app.post('/api/token-inspector', async (req, res) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const candidate = task.match(/0x[a-fA-F0-9]{40}/)?.[0]
    if (!candidate || !isAddress(candidate, false)) return res.status(400).json({ error: 'Enter a valid token address.' })
    try {
      const [name, symbol, decimals, totalSupply, blockNumber] = await Promise.all([
        publicClient.readContract({ address: candidate, abi: erc20Abi, functionName: 'name' }),
        publicClient.readContract({ address: candidate, abi: erc20Abi, functionName: 'symbol' }),
        publicClient.readContract({ address: candidate, abi: erc20Abi, functionName: 'decimals' }),
        publicClient.readContract({ address: candidate, abi: erc20Abi, functionName: 'totalSupply' }),
        publicClient.getBlockNumber(),
      ])
      res.json({
        network: 'Monad Testnet', token: candidate, name, symbol,
        decimals: Number(decimals), totalSupply: formatUnits(totalSupply, decimals),
        blockNumber: blockNumber.toString(),
      })
    } catch { res.status(502).json({ error: 'Token information is temporarily unavailable.' }) }
  })

  app.post('/api/transaction-inspector', async (req, res) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const candidate = task.match(/0x[a-fA-F0-9]{64}/)?.[0]
    if (!candidate) return res.status(400).json({ error: 'Enter a valid transaction hash.' })
    try {
      const transaction = await publicClient.getTransaction({ hash: candidate })
      const receipt = await publicClient.getTransactionReceipt({ hash: candidate })
      res.json({
        network: 'Monad Testnet', hash: candidate, status: receipt.status,
        from: transaction.from, to: transaction.to, valueMON: formatEther(transaction.value),
        blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(),
      })
    } catch { res.status(502).json({ error: 'Transaction information is temporarily unavailable.' }) }
  })

  app.post('/api/market-signal', async (req, res) => {
    const task = typeof req.body?.task === 'string' ? req.body.task : ''
    const requestedSymbols = new Set([...task.matchAll(/\b[A-Z0-9]{2,12}\b/gi)].map((match) => match[0].toUpperCase()))
    try {
      const response = await fetch('https://testnet.perpl.xyz/api/v1/pub/context', { signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('market context unavailable')
      const context = await response.json()
      const market = context.markets?.find((item) => requestedSymbols.has(String(item.symbol).toUpperCase()) && item.config?.is_open)
      if (!market) return res.status(404).json({ error: 'That market is not currently available.' })
      const symbol = market.symbol
      const decimals = Number(market.config?.price_decimals || 0)
      const scale = 10 ** decimals
      const mark = Number(market.state?.mrk || market.state?.mid || 0) / scale
      const previous = Number(market.state?.prv || 0) / scale
      const bid = Number(market.state?.bid || 0) / scale
      const ask = Number(market.state?.ask || 0) / scale
      const fundingMicros = Number(market.funding?.rate || 0)
      const spreadBps = mark > 0 && ask >= bid ? ((ask - bid) / mark) * 10_000 : null
      res.json({
        network: 'Monad Testnet',
        market: market.name,
        symbol,
        markPrice: mark,
        change24hPercent: previous ? ((mark - previous) / previous) * 100 : null,
        bestBid: bid || null,
        bestAsk: ask || null,
        spreadBps,
        fundingRatePercent: fundingMicros / 10_000,
        fundingIntervalMinutes: Math.round(Number(market.funding_interval_sec || 0) / 60),
        fundingAppliesAt: market.funding?.at?.t || null,
        observedAt: market.state?.at?.t || null,
        source: 'Perpl public market data',
        note: 'Past price movement is not a forecast. Perpetual positions can lose collateral; review leverage and liquidation risk before placing an order.',
      })
    } catch { res.status(502).json({ error: 'Live market data is temporarily unavailable.' }) }
  })
} else {
  console.warn('Paid agent endpoint is inactive. Configure GENTRY_AGENT_PAY_TO and GENTRY_AGENT_PRICE_USDC.')
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'This service is not available.' }))

app.use(express.static(root))
app.get(/.*/, (_req, res) => res.sendFile(`${root}/index.html`))

export default app
