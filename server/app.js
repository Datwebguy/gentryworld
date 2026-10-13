import 'dotenv/config'
import express from 'express'
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

const marketSnapshot = { value: null, updatedAt: 0, promise: null }
app.get('/api/markets', async (_req, res) => {
  try {
    if (!marketSnapshot.value || Date.now() - marketSnapshot.updatedAt > 15_000) {
      if (!marketSnapshot.promise) marketSnapshot.promise = fetch('https://testnet.perpl.xyz/api/v1/pub/context', { signal: AbortSignal.timeout(8000) })
        .then((response) => { if (!response.ok) throw new Error('Perpl market context unavailable'); return response.json() })
        .then((context) => {
          const markets = Array.isArray(context.markets) ? context.markets.map((market) => {
            const decimals = Number(market.config?.price_decimals || 0)
            const scale = 10 ** decimals
            const mid = Number(market.state?.mid || 0) / scale
            const previous = Number(market.state?.prv || 0) / scale
            return { id: market.id, symbol: market.symbol, name: market.name, mark: mid, previous, changePct: previous ? ((mid - previous) / previous) * 100 : 0, fundingRate: Number(market.funding?.rate || 0), open: Boolean(market.config?.is_open), updatedAt: market.state?.at?.t || null }
          }).filter((market) => market.open && market.mark > 0) : []
          marketSnapshot.value = { network: 'Monad Testnet', source: 'Perpl public market context', markets }
          marketSnapshot.updatedAt = Date.now()
          return marketSnapshot.value
        }).finally(() => { marketSnapshot.promise = null })
      else await marketSnapshot.promise
    }
    res.setHeader('cache-control', 'public, max-age=10, stale-while-revalidate=30')
    res.json({ ...marketSnapshot.value, updatedAt: marketSnapshot.updatedAt })
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
    if (!/\b(BTC|ETH|SOL|MON|ZEC|LIT|PUMP|NEAR)\b/i.test(task)) return res.status(400).json({ error: 'Name a supported market symbol.' })
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
    const symbol = task.match(/\b(BTC|ETH|SOL|MON|ZEC|LIT|PUMP|NEAR)\b/i)?.[1]?.toUpperCase()
    if (!symbol) return res.status(400).json({ error: 'Name a supported market symbol.' })
    try {
      const response = await fetch('https://testnet.perpl.xyz/api/v1/pub/context', { signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('market context unavailable')
      const context = await response.json()
      const market = context.markets?.find((item) => item.symbol === symbol && item.config?.is_open)
      if (!market) return res.status(404).json({ error: 'That market is not currently available.' })
      const decimals = Number(market.config?.price_decimals || 0)
      const scale = 10 ** decimals
      const mark = Number(market.state?.mid || 0) / scale
      const previous = Number(market.state?.prv || 0) / scale
      res.json({ network: 'Monad Testnet', market: market.name, symbol, markPrice: mark, previousPrice: previous, movementPercent: previous ? ((mark - previous) / previous) * 100 : 0, fundingRate: Number(market.funding?.rate || 0), source: 'Perpl public market context', observedAt: market.state?.at?.t || null })
    } catch { res.status(502).json({ error: 'Live market data is temporarily unavailable.' }) }
  })
} else {
  console.warn('Paid agent endpoint is inactive. Configure GENTRY_AGENT_PAY_TO and GENTRY_AGENT_PRICE_USDC.')
}

app.use(express.static(root))
app.get(/.*/, (_req, res) => res.sendFile(`${root}/index.html`))

export default app
