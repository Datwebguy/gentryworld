import { Home } from './Home'
import { CopyTerminal } from './CopyTerminal'
import { PerplTrader, type TradeIntent, type VaultPosition } from './PerplTrader'
import { ChatErrorBoundary } from './ChatErrorBoundary'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, ArrowUpRightFromSquare, Check, Moon, Sun,
  CircleHelp, Coins, Command, Fingerprint, LoaderCircle, Network, RefreshCw,
  Copy, FileCheck2, ScanLine, Search, Share2, Star, Trophy, Wallet, X,
} from 'lucide-react'
import { ExactEvmScheme } from '@x402/evm'
import { x402Client } from '@x402/core/client'
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch'
import { checkUsdcBalance, connectWallet, loadAgents, registerAgent, submitFeedback, usdcAddress, type Agent } from './chain'
import { useWalletSession } from './wallet'
import { PnlCardModal } from './PnlCardModal'
import { DepositWithdrawModal, type UserVaultBalance } from './DepositWithdrawModal'

type AgentEndpoint = {
  name?: string
  endpoint?: string
  url?: string
  description?: string
  skills?: unknown[]
  pricing?: { amount?: string; currency?: string; network?: string }
}

type HireResult = {
  agent: Agent
  endpoint: string
  result: unknown
  paymentTx?: string
  feedbackTx?: string
  market?: Market
  request?: string
}
type ChatMessage = { role: 'user' | 'agent'; text: string; result?: unknown; paymentTx?: string }
type ChatSession = { agent: Agent; endpoint: AgentEndpoint; market: Market }

const explorer = 'https://testnet.monadscan.com'
const identityRegistry = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const agentSnapshotKey = 'gentry:monad-testnet:agents:v2'

type Route = 'home' | 'agents' | 'workspaces' | 'signals' | 'reputation' | 'publish' | 'profile' | 'research'
type Market = { id: number; symbol: string; name: string; mark: number; previous: number; changePct: number; fundingRate: number; open: boolean; updatedAt?: number; sizeDecimals?: number; priceDecimals?: number; maxLeverage?: number | null; maxSlippageBps?: number }

function routeFromHash(hash: string): Route {
  const value = hash.replace('#', '')
  if (value === 'agents' || value === 'network' || value === 'market') return 'agents'
  if (value === 'workspaces') return 'workspaces'
  if (value === 'signals' || value === 'markets') return 'signals'
  if (value === 'research' || value === 'copy-trading' || value === 'copy') return 'research'
  if (value.startsWith('agent-')) return 'profile'
  if (value === 'reputation' || value === 'leaderboard') return 'reputation'
  if (value === 'publish' || value === 'builders') return 'publish'
  return 'home'
}

function endpointsOf(agent: Agent): AgentEndpoint[] {
  if (agent.card?.x402Support === false || !Array.isArray(agent.card?.endpoints)) return []
  return agent.card.endpoints.filter((item: AgentEndpoint) => item && typeof (item.endpoint || item.url) === 'string')
}

function marketResearchEndpoint(agent: Agent): AgentEndpoint | undefined {
  const endpoints = endpointsOf(agent)
  const isInspector = (ep: AgentEndpoint) => {
    const text = [ep.name, ep.endpoint, ep.url].join(' ').toLowerCase()
    return text.includes('token-inspector') || text.includes('address-inspector') || text.includes('transaction-inspector') ||
      text.includes('inspect a token') || text.includes('inspect an address') || text.includes('verify a transaction')
  }

  const specific = endpoints.find((ep) => {
    if (isInspector(ep)) return false
    const text = [ep.name, ep.endpoint, ep.url].join(' ').toLowerCase()
    return text.includes('market-signal') || text.includes('market signal') || text.includes('signal analyst') || text.includes('market research')
  })
  if (specific) return specific

  return endpoints.find((ep) => {
    if (isInspector(ep)) return false
    const text = [ep.name, ep.endpoint, ep.url, ep.description, ...(Array.isArray(ep.skills) ? ep.skills : [])].join(' ').toLowerCase()
    return /market[- ]signal|market[- ]research|perpl|market[- ]price|funding review/i.test(text)
  })
}

function uniquePayableProfiles(agents: Agent[]) {
  const seen = new Set<string>()
  return [...agents].sort((a, b) => a.id > b.id ? -1 : a.id < b.id ? 1 : 0).filter((agent) => {
    const endpoints = endpointsOf(agent)
    if (!endpoints.length) return false
    const owner = (agent.owner || agent.card?.owner || '').toLowerCase()
    const key = `${owner}|${agent.uri}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasProtectedService(agent: Agent) {
  return agent.card?.x402Support === false && Array.isArray(agent.card?.services) && agent.card.services.some((service: any) =>
    service && typeof service.endpoint === 'string' && /^https?:\/\//i.test(service.endpoint),
  )
}

function capabilityNames(agent: Agent): string[] {
  const endpointSkills = Array.isArray(agent.card?.endpoints)
    ? agent.card.endpoints.flatMap((endpoint: any) => Array.isArray(endpoint?.skills) ? endpoint.skills : [])
    : []
  const source = agent.card?.capabilities || agent.card?.skills || []
  const values = [...(Array.isArray(source) ? source : []), ...endpointSkills]
  return [...new Set(values.map((item: any) => typeof item === 'string' ? item : item?.name || item?.id)
    .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0))]
}

function readSnapshot(): Agent[] {
  try {
    const rows = JSON.parse(localStorage.getItem(agentSnapshotKey) || '[]')
    if (!Array.isArray(rows)) return []
    return rows.map((row: any) => ({
      ...row, id: BigInt(row.id),
      summary: row.summary ? { ...row.summary, count: BigInt(row.summary.count), value: BigInt(row.summary.value) } : undefined,
    }))
  } catch { return [] }
}

function scoreOf(agent: Agent) {
  if (!agent.summary) return null
  return (Number(agent.summary.value) / (10 ** agent.summary.decimals)).toFixed(agent.summary.decimals)
}

function paymentOf(agent: Agent, endpoint?: AgentEndpoint) {
  const payment = endpoint?.pricing || agent.card?.payment
  if (!payment?.amount) return null
  return `${payment.amount} ${payment.currency || 'USDC'}`
}

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : ''
}

function tradeIntentFromRequest(request?: string, result?: unknown): TradeIntent | undefined {
  const mentionsShort = /\b(sell|short)\b/i.test(request || '')
  const mentionsLong = /\b(buy|long)\b/i.test(request || '')
  const requestDirection = mentionsShort === mentionsLong ? undefined : mentionsShort ? 'short' : 'long'
  const amountMatch = request?.match(/\$\s*(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:usd|usdc|dollars?)\b/i)
  const requestAmount = amountMatch ? (amountMatch[1] || amountMatch[2]) : undefined
  const leverageMatch = request?.match(/\b(\d+(?:\.\d+)?)\s*[x×]\b/i)
  const flat: Record<string, unknown> = {}
  function collect(value: unknown) { if (!value || typeof value !== 'object') return; for (const [key, item] of Object.entries(value)) { if (item && typeof item === 'object') collect(item); else flat[key.toLowerCase().replace(/[^a-z]/g, '')] = item } }
  collect(result)
  const valueText = (keys: string[]) => keys.map((key) => flat[key]).find((value) => value !== undefined)
  const agentSide = String(valueText(['direction', 'side', 'action', 'signal']) || '').toLowerCase()
  const agentDirection = /short|sell/.test(agentSide) ? 'short' : /long|buy/.test(agentSide) ? 'long' : undefined
  const agentAmount = valueText(['notional', 'amountusd', 'usdamount', 'ordervalue', 'suggestedsizeusd', 'sizeusd', 'suggestednotional'])
  const agentLeverage = valueText(['leverage', 'leveragex'])
  const direction = requestDirection || agentDirection
  const notional = requestAmount || (agentAmount !== undefined && Number(agentAmount) > 0 ? String(agentAmount).replace(/[^\d.]/g, '') : undefined)
  const leverage = leverageMatch?.[1] || (agentLeverage !== undefined ? String(agentLeverage).replace(/[^\d.]/g, '') : undefined)
  if (!direction && !notional && !leverage) return undefined
  return { direction, notional, leverage }
}

function logoOf(agent: Agent) {
  const value = agent.card?.image || agent.card?.logo || agent.card?.icon || agent.card?.avatar
  if (typeof value !== 'string' || !value.trim()) return ''
  if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice(7)}`
  if (value.startsWith('ar://')) return `https://arweave.net/${value.slice(5)}`
  return value
}

function AgentAvatar({ agent, large = false }: { agent: Agent; large?: boolean }) {
  const src = logoOf(agent)
  const [failed, setFailed] = useState(false)
  return <div className={`agent-avatar${large ? ' large' : ''}${src && !failed ? ' has-logo' : ''}`}>
    {src && !failed ? <img src={src} alt={`${agent.card?.name || 'Agent'} logo`} onError={() => setFailed(true)} /> : String(agent.card?.name || '?').slice(0, 1)}
  </div>
}

function needsAddress(name?: string) {
  const value = name?.toLowerCase() || ''
  return value.includes('address') || value.includes('token')
}

function needsHash(name?: string) {
  const value = name?.toLowerCase() || ''
  return value.includes('transaction') || value.includes('receipt')
}

function ResultView({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return <pre className="result-raw">{String(value)}</pre>
  const entries = Object.entries(value as Record<string, unknown>)
  const answer = (value as Record<string, unknown>).answer
  const fields = entries.filter(([key]) => key !== 'answer')
  const grid = <div className="result-grid">{fields.map(([key, item]) => <div className="result-item" key={key}>
    <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</span>
    <strong>{typeof item === 'boolean' ? (item ? 'Yes' : 'No') : String(item)}</strong>
  </div>)}</div>
  return typeof answer === 'string' ? <div className="research-result"><p className="research-answer">{answer}</p><details><summary>Live data used</summary>{grid}</details></div> : grid
}

function loadCachedPositions(address?: string): VaultPosition[] {
  if (!address) return []
  try {
    const raw = localStorage.getItem(`gentry:positions:${address.toLowerCase()}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadCachedHistory(address?: string): VaultPosition[] {
  if (!address) return []
  try {
    const raw = localStorage.getItem(`gentry:history:${address.toLowerCase()}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCachedPositions(address: string, positions: VaultPosition[], history: VaultPosition[]) {
  if (!address) return
  try {
    localStorage.setItem(`gentry:positions:${address.toLowerCase()}`, JSON.stringify(positions))
    localStorage.setItem(`gentry:history:${address.toLowerCase()}`, JSON.stringify(history))
  } catch { /* Quota */ }
}

export default function App() {
  const { address: connectedAddress, provider: walletProvider, authenticated, identity, signTypedData: signEmbeddedTypedData, openWallet, logout } = useWalletSession()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { const saved = localStorage.getItem('gentry:theme'); if (saved === 'dark' || saved === 'light') return saved } catch { /* Storage may be restricted. */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111a16' : '#f7f8f2')
    try { localStorage.setItem('gentry:theme', theme) } catch { /* Theme still works without persistence. */ }
  }, [theme])
  const snapshot = useRef(readSnapshot())
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [agents, setAgents] = useState<Agent[]>(snapshot.current)
  const [loading, setLoading] = useState(snapshot.current.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'payable' | 'services'>('payable')
  const [walletAddress, setWalletAddress] = useState('')
  const [accountMenu, setAccountMenu] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)
  const [claimingAusd, setClaimingAusd] = useState(false)
  useEffect(() => {
    setWalletAddress(connectedAddress || '')
    if (connectedAddress) {
      try { localStorage.setItem('gentry:last_wallet', connectedAddress.toLowerCase()) } catch {}
      const cachedPos = loadCachedPositions(connectedAddress)
      const cachedHist = loadCachedHistory(connectedAddress)
      if (cachedPos.length > 0) setVaultPositions(cachedPos)
      if (cachedHist.length > 0) setVaultHistory(cachedHist)
    }
  }, [connectedAddress])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [hireRequest, setHireRequest] = useState<{ agent: Agent; endpoint: AgentEndpoint } | null>(null)
  const [hireInput, setHireInput] = useState('')
  const [hireResult, setHireResult] = useState<HireResult | null>(null)
  const [chatSession, setChatSession] = useState<ChatSession | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatLastResult, setChatLastResult] = useState<{ result: unknown; paymentTx?: string; request: string } | null>(null)
  const [rating, setRating] = useState<number | ''>('')
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [metadataUri, setMetadataUri] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketsLoading, setMarketsLoading] = useState(false)
  const [marketsError, setMarketsError] = useState('')
  const [marketsUpdatedAt, setMarketsUpdatedAt] = useState<number | null>(null)
  const [marketsStale, setMarketsStale] = useState(false)
  const [marketsRetry, setMarketsRetry] = useState(0)
  const [tradeMarket, setTradeMarket] = useState<Market | null>(null)
  const [tradeIntent, setTradeIntent] = useState<TradeIntent | undefined>(undefined)
  const [signalMarket, setSignalMarket] = useState<Market | null>(null)
  const [vaultPositions, setVaultPositions] = useState<VaultPosition[]>(() => {
    try {
      const lastAddr = localStorage.getItem('gentry:last_wallet') || ''
      return lastAddr ? loadCachedPositions(lastAddr) : []
    } catch { return [] }
  })
  const [vaultHistory, setVaultHistory] = useState<VaultPosition[]>(() => {
    try {
      const lastAddr = localStorage.getItem('gentry:last_wallet') || ''
      return lastAddr ? loadCachedHistory(lastAddr) : []
    } catch { return [] }
  })
  const [positionsTab, setPositionsTab] = useState<'open' | 'history'>('open')
  const [pnlCardPosition, setPnlCardPosition] = useState<VaultPosition | null>(null)
  const [walletBalances, setWalletBalances] = useState<{ mon: string; ausd: string } | null>(null)
  const [vaultBalance, setVaultBalance] = useState<UserVaultBalance | null>(null)
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [depositModalTab, setDepositModalTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [claimingHeaderFaucet, setClaimingHeaderFaucet] = useState(false)
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null)

  const fetchVaultPositions = useCallback(async () => {
    if (!walletAddress) {
      setVaultPositions([])
      setVaultHistory([])
      return
    }
    const cleanAddr = walletAddress.toLowerCase()
    try {
      const response = await fetch(`/api/vault/positions?address=${encodeURIComponent(cleanAddr)}&_t=${Date.now()}`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        const srvPositions = Array.isArray(payload.positions) ? payload.positions : []
        const srvHistory = Array.isArray(payload.history) ? payload.history : []
        const cachedPos = loadCachedPositions(cleanAddr)
        const cachedHist = loadCachedHistory(cleanAddr)

        // Auto-restore after server restart/redeploy if client has cached positions
        if (srvPositions.length === 0 && cachedPos.length > 0) {
          try {
            const syncRes = await fetch('/api/vault/sync', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                address: cleanAddr,
                positions: cachedPos,
                history: cachedHist
              })
            })
            if (syncRes.ok) {
              const syncData = await syncRes.json()
              const syncedPos = Array.isArray(syncData.positions) ? syncData.positions : cachedPos
              const syncedHist = Array.isArray(syncData.history) ? syncData.history : cachedHist
              setVaultPositions(syncedPos)
              setVaultHistory(syncedHist)
              saveCachedPositions(cleanAddr, syncedPos, syncedHist)
              return
            }
          } catch { /* Fallback to cached */ }
        }

        setVaultPositions(srvPositions)
        setVaultHistory(srvHistory)
        saveCachedPositions(cleanAddr, srvPositions, srvHistory)
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  const fetchWalletBalances = useCallback(async () => {
    if (!walletAddress) {
      setWalletBalances(null)
      return
    }
    try {
      const response = await fetch(`/api/wallet/balance?address=${encodeURIComponent(walletAddress)}&_t=${Date.now()}`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        setWalletBalances({ mon: `${payload.mon} MON`, ausd: `$${payload.ausd.toFixed(2)} AUSD` })
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  const fetchVaultBalance = useCallback(async () => {
    if (!walletAddress) {
      setVaultBalance(null)
      return
    }
    try {
      const response = await fetch(`/api/vault/user-balance?address=${encodeURIComponent(walletAddress)}&_t=${Date.now()}`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        setVaultBalance(payload)
      }
    } catch { /* Silent */ }
  }, [walletAddress])

  useEffect(() => {
    void fetchVaultPositions()
    void fetchWalletBalances()
    void fetchVaultBalance()
    const posInterval = setInterval(() => void fetchVaultPositions(), 3000)
    const balInterval = setInterval(() => {
      void fetchWalletBalances()
      void fetchVaultBalance()
    }, 4000)
    return () => {
      clearInterval(posInterval)
      clearInterval(balInterval)
    }
  }, [fetchVaultPositions, fetchWalletBalances, fetchVaultBalance])

  async function claimHeaderFaucet() {
    if (!walletAddress) return
    setClaimingHeaderFaucet(true)
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setNotice(`Claimed ${data.amount || '500 AUSD'} from faucet directly to your wallet!`)
        void fetchWalletBalances()
        setTimeout(() => void fetchWalletBalances(), 1200)
        setTimeout(() => void fetchWalletBalances(), 3000)
      } else {
        setNotice(data.error || 'Faucet claim could not be completed.')
      }
    } catch {
      setNotice('Faucet claim request failed.')
    } finally {
      setClaimingHeaderFaucet(false)
    }
  }

  useEffect(() => {
    const normalizeHash = () => {
      const h = window.location.hash
      if (h === '#copy-trading' || h === '#copy') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#research`)
      } else if (h === '#network' || h === '#market') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#agents`)
      } else if (h === '#leaderboard') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#reputation`)
      } else if (h === '#builders') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#publish`)
      }
    }
    normalizeHash()
    const onHashChange = () => { normalizeHash(); setRoute(routeFromHash(window.location.hash)) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [route])

  useEffect(() => {
    if (route !== 'profile') { setSelected(null); return }
    const value = window.location.hash.replace('#agent-', '')
    const agent = agents.find((item) => item.id.toString() === value)
    if (agent) setSelected(agent)
  }, [agents, route])

  const refresh = useCallback(async () => {
    setRefreshing(true); setError('')
    try {
      const latest = await loadAgents()
      setAgents(latest)
      if (latest.length) {
        snapshot.current = latest
        localStorage.setItem(agentSnapshotKey, JSON.stringify(latest, (_key, value) => typeof value === 'bigint' ? value.toString() : value))
      }
    } catch {
      if (!snapshot.current.length) setError('Agent information is unavailable right now. Please try again.')
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (route !== 'signals' && route !== 'research') return
    let active = true
    let first = true
    const load = async () => {
      if (first && markets.length === 0) setMarketsLoading(true)
      try {
        const response = await fetch(`/api/markets?view=signals&ts=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error('Market request failed')
        const payload = await response.json()
        const rows = Array.isArray(payload.markets) ? payload.markets.filter((item: Market) => Number.isFinite(item.mark) && item.mark > 0) : []
        if (!rows.length) throw new Error('No current markets')
        if (active) {
          setMarkets(rows)
          setMarketsError('')
          setMarketsUpdatedAt(Number(payload.updatedAt) || Date.now())
          setMarketsStale(Boolean(payload.stale))
        }
      } catch {
        if (active) {
          setMarketsError('Could not load live prices. We’ll keep trying automatically.')
          setMarketsStale(true)
        }
      } finally {
        if (active && first) { setMarketsLoading(false); first = false }
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [route, marketsRetry])

  const filtered = useMemo(() => (filter === 'payable' ? uniquePayableProfiles(agents) : agents).filter((agent) => {
    if (filter === 'payable' && !endpointsOf(agent).length) return false
    if (filter === 'services' && !endpointsOf(agent).length && !hasProtectedService(agent)) return false
    const term = query.trim().toLowerCase()
    return !term || [agent.card?.name, agent.card?.description, ...capabilityNames(agent)]
      .some((value) => String(value || '').toLowerCase().includes(term))
  }), [agents, filter, query])

  const payableCount = uniquePayableProfiles(agents).length
  const feedbackCount = agents.reduce((total, agent) => total + Number(agent.summary?.count || 0n), 0)
  const payableProfiles = uniquePayableProfiles(agents)
  const featured = payableProfiles.find((agent) => agent.id === 2280n) || payableProfiles[0]
  const marketResearchAgent = payableProfiles.find((agent) => marketResearchEndpoint(agent))
  const leaderboard = useMemo(() => [...agents].filter((agent) => agent.summary).sort((a, b) => {
    const scoreDifference = Number(scoreOf(b)) - Number(scoreOf(a))
    return scoreDifference || Number((b.summary?.count || 0n) - (a.summary?.count || 0n))
  }).slice(0, 5), [agents])

  function openWorkspace(kind: 'address' | 'token' | 'transaction') {
    if (!featured) return setNotice('No payable intelligence agent is available right now.')
    const endpoint = endpointsOf(featured).find((item) => item.name?.toLowerCase().includes(kind))
    if (!endpoint) return setNotice(`The ${kind} workspace is not available yet.`)
    setHireRequest({ agent: featured, endpoint }); setHireInput('')
  }

  function openAgent(agent: Agent) {
    window.location.hash = `agent-${agent.id.toString()}`
    setSelected(agent)
  }

  function closeAgent() {
    setSelected(null)
    if (route === 'profile') window.location.hash = 'agents'
  }

  function requestSignal(market: Market, selectedAgent = marketResearchAgent) {
    if (!selectedAgent) return setNotice('No payable market research agent is available right now.')
    const endpoint = marketResearchEndpoint(selectedAgent)
    if (!endpoint) return setNotice('This agent does not offer a market research service.')
    setNotice('')
    setSignalMarket(market)
    setHireResult(null); setRating(''); setFeedbackDone(false)
    setChatMessages([]); setChatLastResult(null); setChatInput(`What is your read on ${market.symbol} right now? Include the key risks and what would change your view.`)
    setChatSession({ agent: selectedAgent, endpoint, market })
  }

  function closeChat() {
    if (chatSession && chatLastResult) setHireResult({ agent: chatSession.agent, endpoint: chatSession.endpoint.endpoint || chatSession.endpoint.url || '', result: chatLastResult.result, paymentTx: chatLastResult.paymentTx, market: chatSession.market, request: chatLastResult.request })
    setChatSession(null); setChatInput(''); setChatMessages([]); setChatLastResult(null)
  }

  async function sendChatMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!chatSession || !chatInput.trim() || chatBusy) return
    const userText = chatInput.trim()
    setChatBusy(true); setNotice('')
    try {
      if (!connectedAddress || !walletProvider) {
        if (authenticated) { setNotice('Your GentrY wallet is still getting ready. Wait a moment, then try again.'); return }
        await openWallet(); return
      }
      const { address, wallet } = await connectWallet(walletProvider, connectedAddress)
      setWalletAddress(address)
      const balance = await checkUsdcBalance(address)
      if (balance === 0n) {
        setNotice('Your wallet has 0 USDC on Monad Testnet. Get testnet USDC from the faucet before paying for agent research.')
        setChatBusy(false)
        return
      }
      const signer = { address, signTypedData: async (message: any) => signEmbeddedTypedData
        ? signEmbeddedTypedData(message)
        : wallet.signTypedData({ account: address, domain: message.domain, types: message.types, primaryType: message.primaryType, message: message.message } as any) }
      const client = new x402Client().register('eip155:10143', new ExactEvmScheme(signer as any)).registerPolicy((_version, requirements) => requirements.filter((requirement) => requirement.scheme === 'exact' && requirement.network === 'eip155:10143' && requirement.asset.toLowerCase() === usdcAddress.toLowerCase()))
      const transcript = chatMessages.map((message) => `${message.role === 'user' ? 'User' : 'Agent'}: ${message.text}`).join('\n')
      const task = `${transcript ? `Conversation so far:\n${transcript}\n\n` : ''}User: ${userText}\nAgent: Reply to the user’s latest message. Use the current ${chatSession.market.symbol} Monad Testnet perpetual market context when relevant.`
      const url = chatSession.endpoint.endpoint || chatSession.endpoint.url || ''
      const response = await wrapFetchWithPayment(fetch, client)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, marketSymbol: chatSession.market.symbol }) })
      if (!response.ok) {
        let errMessage = ''
        try {
          const errPayload = await response.json()
          errMessage = errPayload?.error || errPayload?.message || ''
        } catch {
          errMessage = await response.text().catch(() => '')
        }
        throw new Error(errMessage || `Request failed with status ${response.status}`)
      }
      const receipt = response.headers.get('payment-response') || response.headers.get('x-payment-response')
      if (!receipt) throw new Error('missing settlement')
      const settlement = decodePaymentResponseHeader(receipt) as any
      if (!settlement.success || settlement.network !== 'eip155:10143') throw new Error('unconfirmed settlement')
      const raw = await response.text()
      let result: unknown = raw
      try { result = JSON.parse(raw) } catch { /* Plain text replies remain readable. */ }
      const answer = typeof result === 'string' ? result : result && typeof result === 'object' && 'answer' in result && typeof result.answer === 'string' ? result.answer : JSON.stringify(result, null, 2)
      const paymentTx = settlement.transaction || settlement.txHash
      setChatMessages((current) => [...current, { role: 'user', text: userText }, { role: 'agent', text: answer, result, paymentTx }])
      setChatLastResult({ result, paymentTx, request: userText })
      setChatInput('')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause || '')
      const lower = message.toLowerCase()
      setNotice(lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected by user')
        ? 'Payment approval was cancelled in your wallet. No payment was sent.'
        : lower.includes('insufficient') || lower.includes('exceeds balance') || lower.includes('balance')
        ? 'Your wallet has insufficient testnet USDC to pay for this request. Top up from the Monad testnet faucet.'
        : lower.includes('unconfirmed') || lower.includes('settlement')
        ? 'Payment could not be settled on Monad Testnet. Verify that your wallet has testnet USDC and MON.'
        : message && !lower.includes('request failed with status 500') && !lower.includes('request failed with status 502')
        ? message
        : 'The request did not finish. Check your wallet activity and testnet USDC balance before retrying.')
    } finally { setChatBusy(false) }
  }

  async function onConnect() {
    if (!connectedAddress) {
      if (authenticated) return setNotice('Your GentrY wallet is still getting ready. Wait a moment, then try again.')
      try { await openWallet() } catch (cause) {
        const message = cause instanceof Error ? cause.message.toLowerCase() : ''
        setNotice(message.includes('user rejected') || message.includes('user denied') ? 'Wallet connection was cancelled.' : 'Could not open wallet sign-in. Please try again.')
      }
      return
    }
    if (!walletProvider) return setNotice('Your GentrY wallet is still getting ready. Wait a moment, then try again.')
    try { setWalletAddress((await connectWallet(walletProvider, connectedAddress)).address) }
    catch { setNotice('Switch to Monad Testnet in your wallet and try again.') }
  }

  async function closeVaultPosition(pos: VaultPosition) {
    if (!walletAddress || !walletProvider) {
      await onConnect()
      return
    }
    setClosingPositionId(pos.id)
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
      if (!response.ok) throw new Error(payload.error || 'Could not close position.')
      setNotice(`Closed ${pos.side.toUpperCase()} ${pos.symbol} position with ${Number(payload.realizedPnl || 0) >= 0 ? '+' : ''}$${Number(payload.realizedPnl || 0).toFixed(2)} PnL.`)

      const cleanAddr = walletAddress.toLowerCase()
      const remaining = vaultPositions.filter((p) => p.id !== pos.id)
      const closedEntry: VaultPosition = {
        ...pos,
        status: 'closed',
        closedAt: Date.now(),
        closePrice: payload.closePrice || pos.currentMark || pos.entryPrice,
        closeTransaction: payload.transaction || pos.transaction,
        realizedPnl: Number(payload.realizedPnl || 0),
        realizedRoePct: Number(payload.realizedRoePct || 0),
      }
      const updatedHistory = [closedEntry, ...vaultHistory.filter((h) => h.id !== pos.id)]
      setVaultPositions(remaining)
      setVaultHistory(updatedHistory)
      saveCachedPositions(cleanAddr, remaining, updatedHistory)

      await Promise.all([fetchVaultPositions(), fetchVaultBalance(), fetchWalletBalances()])
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not close position.')
    } finally {
      setClosingPositionId(null)
    }
  }

  async function copyWalletAddress() {
    if (!walletAddress) return
    try {
      await navigator.clipboard.writeText(walletAddress)
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 1800)
    } catch {
      const input = document.createElement('textarea')
      input.value = walletAddress
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      const copied = document.execCommand('copy')
      input.remove()
      setAddressCopied(copied)
      window.setTimeout(() => setAddressCopied(false), 1800)
      if (!copied) setNotice('Could not copy the wallet address. Select and copy it manually.')
    }
  }

  async function claimTestAusd() {
    if (claimingAusd) return
    const targetAddr = walletAddress || connectedAddress
    if (!targetAddr) {
      await onConnect()
      return
    }
    setClaimingAusd(true)
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: targetAddr })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setNotice(`Claimed ${data.amount || '500 test AUSD'} directly to your personal wallet on Monad Testnet!`)
        void fetchWalletBalances()
        setTimeout(() => void fetchWalletBalances(), 1200)
        setTimeout(() => void fetchWalletBalances(), 3000)
      } else {
        setNotice(data.error || 'Could not claim test tokens.')
      }
    } catch {
      setNotice('Faucet claim request failed.')
    } finally {
      setClaimingAusd(false)
    }
  }

  async function hire(event: React.FormEvent) {
    event.preventDefault()
    if (!hireRequest) return
    const { agent, endpoint } = hireRequest
    const url = endpoint.endpoint || endpoint.url || ''
    const input = hireInput.trim()
    const addressRequest = needsAddress(endpoint.name)
    const hashRequest = needsHash(endpoint.name)
    if (addressRequest && !/^0x[a-fA-F0-9]{40}$/.test(input)) return setNotice('Enter a valid Monad address. No payment was requested.')
    if (hashRequest && !/^0x[a-fA-F0-9]{64}$/.test(input)) return setNotice('Enter a valid Monad transaction hash. No payment was requested.')
    if (!input) return
    setBusy('hire'); setNotice(''); setFeedbackDone(false)
    try {
      if (!connectedAddress || !walletProvider) {
        if (authenticated) { setNotice('Your GentrY wallet is still getting ready. Wait a moment, then try again.'); return }
        await openWallet(); return
      }
      const { address, wallet } = await connectWallet(walletProvider, connectedAddress)
      setWalletAddress(address)
      const balance = await checkUsdcBalance(address)
      if (balance === 0n) {
        setNotice('Your wallet has 0 USDC on Monad Testnet. Get testnet USDC from the faucet before paying for this request.')
        setBusy(null)
        return
      }
      const signer = {
        address,
        signTypedData: async (message: any) => signEmbeddedTypedData
          ? signEmbeddedTypedData(message)
          : wallet.signTypedData({
            account: address, domain: message.domain, types: message.types,
            primaryType: message.primaryType, message: message.message,
          } as any),
      }
      const client = new x402Client().register('eip155:10143', new ExactEvmScheme(signer as any))
        .registerPolicy((_version, requirements) => requirements.filter((requirement) =>
          requirement.scheme === 'exact' && requirement.network === 'eip155:10143' &&
          requirement.asset.toLowerCase() === usdcAddress.toLowerCase(),
        ))
      const response = await wrapFetchWithPayment(fetch, client)(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: input }),
      })
      if (!response.ok) {
        let errMessage = ''
        try {
          const errPayload = await response.json()
          errMessage = errPayload?.error || errPayload?.message || ''
        } catch {
          errMessage = await response.text().catch(() => '')
        }
        throw new Error(errMessage || `Request failed with status ${response.status}`)
      }
      const receipt = response.headers.get('payment-response') || response.headers.get('x-payment-response')
      if (!receipt) throw new Error('missing settlement')
      const settlement = decodePaymentResponseHeader(receipt) as any
      if (!settlement.success || settlement.network !== 'eip155:10143') throw new Error('unconfirmed settlement')
      const text = await response.text()
      let result: unknown = text
      try { result = JSON.parse(text) } catch { /* Plain text responses remain readable. */ }
      setHireResult({ agent, endpoint: url, result, paymentTx: settlement.transaction || settlement.txHash, market: signalMarket || undefined, request: input })
      setHireRequest(null); setSelected(null); setHireInput('')
      setSignalMarket(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause || '')
      const lower = message.toLowerCase()
      setNotice(lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected by user')
        ? 'Payment was cancelled.'
        : lower.includes('insufficient') || lower.includes('exceeds balance') || lower.includes('balance')
        ? 'Your wallet has insufficient testnet USDC to pay for this request. Top up from the Monad testnet faucet.'
        : lower.includes('unconfirmed') || lower.includes('settlement')
        ? 'Payment could not be settled on Monad Testnet. Verify that your wallet has testnet USDC and MON.'
        : message && !lower.includes('request failed with status 500') && !lower.includes('request failed with status 502')
        ? message
        : 'The request could not be completed. Check your wallet activity and testnet USDC balance before retrying.')
    } finally { setBusy(null) }
  }

  async function sendFeedback() {
    if (!hireResult || rating === '') return
    setBusy('feedback'); setNotice('')
    try {
      const feedbackTx = await submitFeedback(hireResult.agent, rating, hireResult.endpoint, walletProvider, connectedAddress)
      setHireResult({ ...hireResult, feedbackTx })
      setFeedbackDone(true)
      setNotice('Feedback recorded on Monad Testnet.')
      void refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setNotice(message || 'Your feedback could not be saved. Please try again.')
    }
    finally { setBusy(null) }
  }

  async function onRegister(event: React.FormEvent) {
    event.preventDefault(); setBusy('register'); setNotice('')
    try {
      const hash = await registerAgent(metadataUri.trim(), walletProvider, connectedAddress)
      setNotice(`Agent registered. Transaction ${shortAddress(hash)}`)
      setMetadataUri(''); setShowRegister(false); void refresh()
    } catch { setNotice('Your agent could not be registered. Please try again.') }
    finally { setBusy(null) }
  }

  return <div className="app-shell" id="top">
    <header className="topbar">
      <div className="topbar-main">
        <a className="brand" href="#top"><span className="brand-mark"><Command size={18} strokeWidth={2.5} /></span><span>GentrY</span></a>
        <nav className="desktop-nav"><a className={route === 'signals' ? 'active' : ''} href="#signals">Signals</a><a className={route === 'research' ? 'active' : ''} href="#research">Research</a><a className={route === 'workspaces' ? 'active' : ''} href="#workspaces">Workspaces</a><a className={route === 'agents' ? 'active' : ''} href="#agents">Agents</a><a className={route === 'reputation' ? 'active' : ''} href="#reputation">Reputation</a></nav>
        <div className="top-actions">
          {walletAddress && (
            <div className="wallet-balance-bar desktop-only">
              <div className="wallet-balance-item" title="Gas balance on Monad Testnet">
                <span className="wallet-balance-dot" />
                <span>{walletBalances?.mon || '0 MON'}</span>
              </div>
              <span className="balance-sep">·</span>
              <div className="wallet-balance-item" title="Available Trading Margin in GentrY Vault">
                <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 500 }}>Vault:</span>
                <strong style={{ color: '#10b981', fontWeight: 700 }}>${(vaultBalance?.availableBalance ?? 0).toFixed(2)}</strong>
              </div>
              <button
                type="button"
                className="faucet-claim-pill"
                style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981', fontWeight: 600 }}
                onClick={() => { setDepositModalTab('deposit'); setDepositModalOpen(true) }}
                title="Deposit AUSD from your wallet to trade"
              >
                + Deposit
              </button>
              <button
                type="button"
                className="faucet-claim-pill"
                disabled={claimingHeaderFaucet}
                onClick={() => void claimHeaderFaucet()}
                title="Claim 500 test AUSD directly to your wallet"
              >
                {claimingHeaderFaucet ? <LoaderCircle className="spin" size={12} /> : '+ 500 AUSD'}
              </button>
            </div>
          )}
          <button className="theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
          <button className="wallet-button" aria-label={walletAddress ? `Account ${walletAddress}` : 'Sign in or connect wallet'} onClick={() => walletAddress ? setAccountMenu((open) => !open) : void onConnect()}>
            <Wallet size={15} />
            {walletAddress ? shortAddress(walletAddress) : 'Connect'}
          </button>
          {accountMenu && authenticated && (
            <div className="wallet-account-menu">
              <div className="wallet-menu-header">
                <span>GentrY Account</span>
                <strong>{identity || 'Wallet account'}</strong>
                <div className="wallet-address-row">
                  <small title={walletAddress}>{walletAddress}</small>
                  <button className="wallet-copy-button" onClick={() => void copyWalletAddress()} aria-label="Copy wallet address">
                    {addressCopied ? <Check size={14} /> : <Copy size={14} />}
                    {addressCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Wallet Balances (Onchain) */}
              <div className="wallet-menu-section">
                <span className="wallet-menu-section-title">WALLET CASH (MONAD TESTNET)</span>
                <div className="wallet-menu-balance-grid">
                  <div className="wallet-menu-bal-card">
                    <span>MON Gas</span>
                    <strong>{walletBalances?.mon || '0 MON'}</strong>
                  </div>
                  <div className="wallet-menu-bal-card">
                    <span>Personal AUSD</span>
                    <strong>{walletBalances?.ausd || '$0.00 AUSD'}</strong>
                  </div>
                </div>
              </div>

              {/* Vault Trading Account */}
              <div className="wallet-menu-section">
                <span className="wallet-menu-section-title">GENTRY TRADING VAULT</span>
                <div className="wallet-menu-balance-grid">
                  <div className="wallet-menu-bal-card">
                    <span>Total Balance</span>
                    <strong>${(vaultBalance?.totalBalance ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="wallet-menu-bal-card">
                    <span>Available Margin</span>
                    <strong style={{ color: '#10b981' }}>${(vaultBalance?.availableBalance ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="wallet-menu-bal-card">
                    <span>Locked Margin</span>
                    <strong>${(vaultBalance?.lockedMargin ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="wallet-menu-bal-card">
                    <span>Realized PnL</span>
                    <strong style={{ color: (vaultBalance?.realizedPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {(vaultBalance?.realizedPnl ?? 0) >= 0 ? '+' : ''}${(vaultBalance?.realizedPnl ?? 0).toFixed(2)}
                    </strong>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                  <button
                    type="button"
                    className="wallet-action-btn primary"
                    onClick={() => { setAccountMenu(false); setDepositModalTab('deposit'); setDepositModalOpen(true) }}
                  >
                    <ArrowDownLeft size={13} /> Deposit AUSD
                  </button>
                  <button
                    type="button"
                    className="wallet-action-btn secondary"
                    onClick={() => { setAccountMenu(false); setDepositModalTab('withdraw'); setDepositModalOpen(true) }}
                  >
                    <ArrowUpRight size={13} /> Withdraw
                  </button>
                </div>
              </div>

              {/* Faucets */}
              <div className="wallet-setup-card">
                <span><i /> Test AUSD Faucet</span>
                <p>Claim 500 test AUSD directly to this wallet.</p>
                <button className="wallet-faucet-button" disabled={claimingAusd} onClick={() => void claimTestAusd()}>
                  {claimingAusd ? <LoaderCircle className="spin" size={13} /> : <Coins size={13} />}
                  {claimingAusd ? 'Claiming AUSD…' : 'Claim 500 test AUSD'}
                </button>
              </div>

              <div className="wallet-setup-card">
                <span><i /> Monad Testnet Gas</span>
                <p>Need MON tokens for transaction network fees?</p>
                <a href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">
                  Open Monad faucet <ArrowUpRight size={13} />
                </a>
              </div>

              <button className="wallet-signout-button" onClick={() => { setAccountMenu(false); setWalletAddress(''); void logout() }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <nav className="mobile-nav-bar mobile-only" aria-label="Mobile Navigation">
        <a className={route === 'home' ? 'active' : ''} href="#top">Home</a>
        <a className={route === 'signals' ? 'active' : ''} href="#signals">Signals</a>
        <a className={route === 'research' ? 'active' : ''} href="#research">Research</a>
        <a className={route === 'workspaces' ? 'active' : ''} href="#workspaces">Workspaces</a>
        <a className={route === 'agents' ? 'active' : ''} href="#agents">Agents</a>
        <a className={route === 'reputation' ? 'active' : ''} href="#reputation">Reputation</a>
      </nav>
    </header>

    <main className={route === 'home' ? 'home-main' : 'app-main'} id="main-content">
      {route === 'home' && <Home agents={agents.length} available={payableCount} reviews={feedbackCount} loading={loading} onPublish={() => setShowRegister(true)} />}

      {route === 'research' && <CopyTerminal agents={agents} markets={markets} onAsk={(agent, market) => requestSignal(market, agent)} />}

      {route === 'workspaces' && <section className="workspace-section" id="workspaces">
        <div className="workspace-heading"><div><span>ON-CHAIN DUE DILIGENCE</span><h2>Inspect before you act.</h2><p>Check live balances, verify token contracts, and audit transaction receipts with on-chain proof.</p></div><Activity size={34} /></div>
        <div className="workspace-grid">
          <article className="workspace-card wallet-workspace"><div className="workspace-icon"><ScanLine size={23} /></div><span>WALLET DUE DILIGENCE</span><h3>Know what an address is before you act.</h3><p>Check live MON balance, account type, contract status, and the exact block used for the result.</p><ul><li>Current wallet information</li><li>A clear, readable result</li><li>Reviews from past work</li></ul><button onClick={() => openWorkspace('address')}>Inspect a wallet <ArrowRight size={16} /></button></article>
          <article className="workspace-card token-workspace"><div className="workspace-icon"><Coins size={23} /></div><span>TOKEN DUE DILIGENCE</span><h3>Verify a token contract and its supply.</h3><p>Read the token name, symbol, decimals, total supply, and confirmation block directly from Monad.</p><ul><li>Checked before payment</li><li>Current token information</li><li>Payment and feedback proof</li></ul><button onClick={() => openWorkspace('token')}>Inspect a token <ArrowRight size={16} /></button></article>
          <article className="workspace-card transaction-workspace"><div className="workspace-icon"><FileCheck2 size={23} /></div><span>TRANSACTION VERIFICATION</span><h3>Confirm what actually settled.</h3><p>Read the sender, recipient, value, status, block, and gas used from a Monad receipt.</p><ul><li>Checked before payment</li><li>Settlement status</li><li>A record you can verify</li></ul><button onClick={() => openWorkspace('transaction')}>Verify a transaction <ArrowRight size={16} /></button></article>
          <aside className="workspace-rail"><span>HOW A JOB MOVES</span>{[['01', 'Choose a live task'], ['02', 'Review and approve the price'], ['03', 'Receive your result'], ['04', 'Leave a review']].map(([number, label]) => <div key={number}><b>{number}</b><p>{label}</p></div>)}</aside>
        </div>
      </section>}

      {route === 'signals' && <section className="signals-section" id="signals">
        <div className="workspace-heading">
          <div>
            <span>LIVE MARKET SIGNALS</span>
            <h2>See what is moving.</h2>
            <p>Follow prices and market changes. Choose a market to trade or get a closer research look.</p>
          </div>
          <button className="refresh-button" disabled={marketsLoading} onClick={() => setMarketsRetry((value) => value + 1)}>
            {marketsLoading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Refresh
          </button>
        </div>

        {/* Vault Account Summary Card (Visible when connected) */}
        {walletAddress && (
          <div className="vault-summary-card">
            <div className="vault-summary-top">
              <div className="vault-avail-box">
                <span className="vault-avail-label">Available Trading Margin</span>
                <div className="vault-avail-val">
                  ${(vaultBalance?.availableBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <small>AUSD</small>
                </div>
              </div>
              <div className="vault-summary-actions">
                <button
                  type="button"
                  className="vault-action-btn primary"
                  onClick={() => { setDepositModalTab('deposit'); setDepositModalOpen(true) }}
                >
                  <ArrowDownLeft size={14} /> Deposit
                </button>
                <button
                  type="button"
                  className="vault-action-btn secondary"
                  onClick={() => { setDepositModalTab('withdraw'); setDepositModalOpen(true) }}
                >
                  <ArrowUpRight size={14} /> Withdraw
                </button>
                <button
                  type="button"
                  className="vault-action-btn faucet"
                  disabled={claimingHeaderFaucet}
                  onClick={() => void claimHeaderFaucet()}
                >
                  {claimingHeaderFaucet ? <LoaderCircle className="spin" size={13} /> : <Coins size={13} />}
                  <span>+ 500 AUSD</span>
                </button>
              </div>
            </div>

            <div className="vault-summary-stats">
              <div className="vault-stat-item">
                <span>Total Vault Balance</span>
                <strong>${(vaultBalance?.totalBalance ?? 0).toFixed(2)}</strong>
              </div>
              <div className="vault-stat-item">
                <span>Locked in Trades</span>
                <strong>${(vaultBalance?.lockedMargin ?? 0).toFixed(2)}</strong>
              </div>
              <div className="vault-stat-item">
                <span>Realized PnL</span>
                <strong style={{ color: (vaultBalance?.realizedPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {(vaultBalance?.realizedPnl ?? 0) >= 0 ? '+' : ''}${(vaultBalance?.realizedPnl ?? 0).toFixed(2)}
                </strong>
              </div>
              <div className="vault-stat-item">
                <span>Personal Wallet</span>
                <strong>{walletBalances?.ausd || '$0.00'}</strong>
              </div>
            </div>
          </div>
        )}

        {(vaultPositions.length > 0 || vaultHistory.length > 0) && (
          <div className="vault-positions-panel">

            <div className="vault-positions-header">
              <div>
                <span>MANAGED VAULT POSITIONS</span>
                <h3>Your Vault Positions ({vaultPositions.length} active)</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="vault-positions-tabs">
                  <button
                    type="button"
                    className={`vault-tab-btn ${positionsTab === 'open' ? 'active' : ''}`}
                    onClick={() => setPositionsTab('open')}
                  >
                    Open Positions ({vaultPositions.length})
                  </button>
                  <button
                    type="button"
                    className={`vault-tab-btn ${positionsTab === 'history' ? 'active' : ''}`}
                    onClick={() => setPositionsTab('history')}
                  >
                    Trade History ({vaultHistory.length})
                  </button>
                </div>
                <span className="vault-account-tag"><i /> Monad Testnet Vault</span>
              </div>
            </div>

            {positionsTab === 'open' && (
              <div className="vault-positions-grid">
                {vaultPositions.length === 0 && (
                  <div style={{ padding: '24px', color: 'var(--muted)', textAlign: 'center', gridColumn: '1 / -1' }}>
                    No open positions right now. Select a market below to open a Long or Short position.
                  </div>
                )}
                {vaultPositions.map((pos) => (
                  <article className="vault-position-card" key={pos.id}>
                    <div className="pos-card-head">
                      <div>
                        <strong>{pos.symbol} Perpetual</strong>
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{pos.leverage || 10}x</span>
                      </div>
                      <span className={`pos-side-pill ${pos.side}`}>{pos.side.toUpperCase()}</span>
                    </div>
                    <div className="pos-card-metrics">
                      <div>
                        <span>Size</span>
                        <strong>{Number(pos.size || 0).toFixed(4)} {pos.symbol}</strong>
                      </div>
                      <div>
                        <span>Current value</span>
                        <strong>${Number(pos.currentNotional || pos.notional || 0).toFixed(2)}</strong>
                      </div>
                      <div>
                        <span>Entry price</span>
                        <strong>${Number(pos.entryPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      </div>
                      <div>
                        <span>Current mark</span>
                        <strong>${Number(pos.currentMark || pos.entryPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      </div>
                      <div>
                        <span>Initial Margin</span>
                        <strong>${Number(pos.initialMargin || ((pos.notional || 0) / (pos.leverage || 10))).toFixed(2)}</strong>
                      </div>
                      <div>
                        <span>Est. Liq Price</span>
                        <strong>${Number(pos.liquidationPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      </div>
                      <div>
                        <span>Unrealized PnL ($)</span>
                        <strong className={Number(pos.unrealizedPnl || 0) >= 0 ? 'signal-up' : 'signal-down'}>
                          {Number(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}${Number(pos.unrealizedPnl || 0).toFixed(2)}
                        </strong>
                      </div>
                      <div>
                        <span>ROE (%)</span>
                        <strong className={Number(pos.roePct ?? pos.pnlPct ?? 0) >= 0 ? 'signal-up' : 'signal-down'}>
                          {Number(pos.roePct ?? pos.pnlPct ?? 0) >= 0 ? '+' : ''}{Number(pos.roePct ?? pos.pnlPct ?? 0).toFixed(2)}%
                        </strong>
                      </div>
                    </div>
                    <div className="pos-card-actions">
                      <button
                        type="button"
                        className="pos-share-btn"
                        onClick={() => setPnlCardPosition(pos)}
                        title="Share Bybit/Binance-style PnL Card"
                      >
                        <Share2 size={13} /> Share Card
                      </button>
                      <button
                        className="pos-close-btn"
                        disabled={closingPositionId === pos.id}
                        onClick={() => void closeVaultPosition(pos)}
                      >
                        {closingPositionId === pos.id ? <><LoaderCircle className="spin" size={13} /> Closing on Monad…</> : 'Close Position'}
                      </button>
                      <a
                        href={`https://testnet.monadscan.com/tx/${pos.transaction}`}
                        target="_blank"
                        rel="noreferrer"
                        className="pos-tx-link"
                      >
                        Tx on Monad <ArrowUpRight size={13} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {positionsTab === 'history' && (
              <div className="vault-positions-grid">
                {vaultHistory.length === 0 && (
                  <div style={{ padding: '24px', color: 'var(--muted)', textAlign: 'center', gridColumn: '1 / -1' }}>
                    No closed positions in history yet. Your completed trades will appear here.
                  </div>
                )}
                {vaultHistory.map((pos) => (
                  <article className="vault-position-card" key={pos.id} style={{ opacity: 0.95 }}>
                    <div className="pos-card-head">
                      <div>
                        <strong>{pos.symbol} Perpetual</strong>
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{pos.leverage || 10}x</span>
                      </div>
                      <span className={`pos-side-pill ${pos.side}`}>{pos.side.toUpperCase()}</span>
                    </div>
                    <div className="pos-card-metrics">
                      <div>
                        <span>Size</span>
                        <strong>{Number(pos.size || 0).toFixed(4)} {pos.symbol}</strong>
                      </div>
                      <div>
                        <span>Entry price</span>
                        <strong>${Number(pos.entryPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      </div>
                      <div>
                        <span>Close price</span>
                        <strong>${Number(pos.closePrice || pos.entryPrice || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      </div>
                      <div>
                        <span>Realized PnL ($)</span>
                        <strong className={Number(pos.realizedPnl || 0) >= 0 ? 'signal-up' : 'signal-down'}>
                          {Number(pos.realizedPnl || 0) >= 0 ? '+' : ''}${Number(pos.realizedPnl || 0).toFixed(2)}
                        </strong>
                      </div>
                      <div>
                        <span>Realized ROE</span>
                        <strong className={Number(pos.realizedRoePct ?? 0) >= 0 ? 'signal-up' : 'signal-down'}>
                          {Number(pos.realizedRoePct ?? 0) >= 0 ? '+' : ''}{Number(pos.realizedRoePct ?? 0).toFixed(2)}%
                        </strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong style={{ color: 'var(--muted)' }}>CLOSED</strong>
                      </div>
                    </div>
                    <div className="pos-card-actions">
                      <button
                        type="button"
                        className="pos-share-btn"
                        onClick={() => setPnlCardPosition(pos)}
                        title="Share Realized PnL Card"
                      >
                        <Share2 size={13} /> Share Card
                      </button>
                      <a
                        href={`https://testnet.monadscan.com/tx/${pos.closeTransaction || pos.transaction}`}
                        target="_blank"
                        rel="noreferrer"
                        className="pos-tx-link"
                      >
                        Close Tx <ArrowUpRight size={13} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {marketsError && markets.length === 0 && <div className="state-panel"><CircleHelp size={20} /><div><strong>Prices are taking a moment</strong><p>{marketsError}</p><button className="text-button" onClick={() => setMarketsRetry((value) => value + 1)}>Try again <ArrowRight size={14} /></button></div></div>}
        {marketsLoading && markets.length === 0 && <div className="signal-grid skeleton-grid">{[0, 1, 2].map((item) => <div className="signal-card skeleton" key={item} />)}</div>}
        {markets.length > 0 && <><div className="signal-feed-status"><span><i /> {marketsStale ? 'Showing last received prices' : 'Live Monad Testnet prices'}</span><span>{marketsUpdatedAt ? `Received ${new Date(marketsUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}{marketsError ? ' · reconnecting' : ''}</span></div><div className="signal-grid">{markets.map((market) => <article className="signal-card" key={market.id}><div className="signal-card-top"><span>{market.symbol} / AUSD</span><span className={market.changePct >= 0 ? 'signal-up' : 'signal-down'}>{market.changePct >= 0 ? '+' : ''}{market.changePct.toFixed(2)}%</span></div><h3>${market.mark.toLocaleString(undefined, { maximumFractionDigits: 6 })}</h3><div className="signal-meta"><span>Mark price</span><span>Perpl · Testnet</span></div><div className="signal-observed">{market.updatedAt ? `Market updated ${new Date(market.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Market update time unavailable'}</div><div className="signal-actions"><button type="button" className="signal-ask-btn" onClick={() => requestSignal(market)}>Ask Agent</button><button type="button" className="signal-trade-btn long" onClick={() => { setTradeIntent({ direction: 'long' }); setTradeMarket(market) }}>Long</button><button type="button" className="signal-trade-btn short" onClick={() => { setTradeIntent({ direction: 'short' }); setTradeMarket(market) }}>Short</button></div></article>)}</div></>}
      </section>}

      {(route === 'agents' || route === 'profile') && <section className="market" id="agents">
        <div className="market-heading"><div><span>LIVE AGENT MARKETPLACE</span><h2>Find the right agent.</h2></div><button className="refresh-button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Refresh</button></div>
        <div className="market-tools"><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, skills, or capabilities" /></label><div className="filter-tabs">{(['payable', 'all', 'services'] as const).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All profiles' : value === 'payable' ? 'Ready to hire' : 'Access required'}</button>)}</div></div>

        {error && <div className="state-panel"><CircleHelp size={20} /><div><strong>Agents could not be loaded</strong><p>{error}</p></div></div>}
        {!error && loading && <div className="agent-grid skeleton-grid">{[0, 1, 2].map((item) => <div className="agent-card skeleton" key={item} />)}</div>}
        {!error && !loading && filtered.length === 0 && <div className="state-panel"><Network size={20} /><div><strong>No matching agents</strong><p>Try another search or filter.</p></div></div>}
        {!error && !loading && filtered.length > 0 && <div className="agent-grid">{filtered.map((agent) => {
          const endpoint = endpointsOf(agent)[0]
          const score = scoreOf(agent)
          return <article className="agent-card" key={agent.id.toString()} onClick={() => openAgent(agent)}>
            <div className="card-top"><AgentAvatar agent={agent} /><span className={endpoint ? 'available-pill' : 'listed-pill'}><i /> {endpoint ? 'Ready to hire' : hasProtectedService(agent) ? 'Access required' : 'Profile only'}</span></div>
            <div className="agent-number">AGENT #{agent.id.toString()}</div><h3>{agent.card?.name}</h3><p>{agent.card?.description || 'No description published.'}</p>
            <div className="card-tags">{capabilityNames(agent).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="card-metrics"><div><span>Reputation</span><strong>{score ? `${score} / 5` : 'No reviews'}</strong></div><div><span>Service</span><strong>{endpoint ? paymentOf(agent, endpoint) || 'Price at checkout' : hasProtectedService(agent) ? 'Access required' : 'Profile only'}</strong></div></div>
            <button className="open-agent" onClick={(event) => { event.stopPropagation(); openAgent(agent) }}>View agent <ArrowRight size={15} /></button>
          </article>
        })}</div>}
      </section>}

      {route === 'reputation' && <section className="leaderboard-section" id="reputation"><div className="leaderboard-copy"><span>AGENT REPUTATION & REVIEWS</span><h2>Trust, built through work.</h2><p>Explore the feedback recorded for agents in the network.</p><a href={`${explorer}/address/${identityRegistry}`} target="_blank" rel="noreferrer">View public records <ArrowUpRight size={13} /></a></div>{leaderboard.length > 0 ? <div className="leaderboard-list"><div className="leaderboard-head"><span>Rank / agent</span><span>Reviews</span><span>Score</span></div>{leaderboard.map((agent, index) => <button key={agent.id.toString()} onClick={() => openAgent(agent)}><b>{String(index + 1).padStart(2, '0')}</b><div className="mini-avatar">{String(agent.card?.name || '?').slice(0, 1)}</div><div><strong>{agent.card?.name}</strong><small>Agent #{agent.id.toString()}</small></div><span>{agent.summary?.count.toString()}</span><em><Trophy size={13} /> {scoreOf(agent)}</em></button>)}</div> : <div className="state-panel"><Star size={20} /><div><strong>{loading ? 'Loading reviews' : 'No reviews yet'}</strong><p>{loading ? 'Checking agent feedback.' : 'Reviews will appear as people complete tasks and share their experience.'}</p></div></div>}</section>}

      {route === 'publish' && <section className="builder-section" id="publish"><div><span>PUT YOUR SKILLS TO WORK</span><h2>Bring your own agent.</h2><p>Give your agent a profile, publish its services, and make it easy for people to find and hire.</p></div><div className="builder-actions"><button className="primary-button" onClick={() => setShowRegister(true)}>Register an agent <ArrowRight size={17} /></button><a href="https://docs.monad.xyz/guides/erc-8004" target="_blank" rel="noreferrer">Publishing guide <ArrowUpRightFromSquare size={14} /></a></div></section>}
    </main>

    <footer className="site-footer">
      <div className="footer-upper"><div className="footer-about"><a className="brand" href="#top"><span className="brand-mark"><Command size={18} strokeWidth={2.5} /></span><span>GentrY</span></a><p>Good questions.<br />Better connections.</p><span>Financial agents, working for you.</span></div>
      <div className="footer-links"><strong>Explore</strong><a href="#signals">Signals</a><a href="#research">Agent research</a><a href="#workspaces">Workspaces</a><a href="#agents">Find an agent</a><a href="#reputation">Reputation</a></div>
      <div className="footer-links"><strong>Create</strong><a href="#publish">Publish an agent</a><a href="https://github.com/Datwebguy/gentryworld" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a><a href="https://monad.xyz" target="_blank" rel="noreferrer">Built on Monad <ArrowUpRight size={12} /></a></div>
      </div><div className="footer-bottom"><span>GentrY. Open collaboration, real work.</span><span className="network-badge"><i /> Monad Testnet</span><a href="#top">Back to home <ArrowUpRight size={14} /></a></div>
    </footer>

    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}

    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAgent() }}><section className="agent-drawer">
      <button className="close-button" aria-label="Close agent" onClick={closeAgent}><X size={19} /></button>
      <div className="drawer-head"><AgentAvatar agent={selected} large /><div><span>AGENT #{selected.id.toString()}</span><h2>{selected.card?.name}</h2></div></div>
      <p className="drawer-description">{selected.card?.description || 'No description published.'}</p>
      <div className="identity-panel"><div><Fingerprint size={17} /><span>Verified identity</span></div><strong>{shortAddress(selected.owner)}</strong><a href={`${explorer}/token/${identityRegistry}?a=${selected.id}`} target="_blank" rel="noreferrer">View public record <ArrowUpRight size={13} /></a></div>
      <div className="drawer-section"><span>SKILLS</span><div className="drawer-tags">{capabilityNames(selected).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      <div className="drawer-section"><span>REPUTATION</span><div className="reputation-box"><Star size={20} /><strong>{scoreOf(selected) || '—'}</strong><p>{selected.summary ? `${selected.summary.count.toString()} recorded review${selected.summary.count === 1n ? '' : 's'}` : 'No feedback has been recorded yet.'}</p></div></div>
      <div className="drawer-section"><span>SERVICES</span>{endpointsOf(selected).length ? endpointsOf(selected).map((endpoint, index) => <div className="service-row" key={endpoint.endpoint || endpoint.url || index}><div><strong>{endpoint.name || 'Hire agent'}</strong><small>Review the price before you pay</small></div><div><b>{paymentOf(selected, endpoint) || 'Price at checkout'}</b><button onClick={() => { setHireRequest({ agent: selected, endpoint }); setHireInput('') }}>Hire <ArrowRight size={14} /></button></div></div>) : <div className="service-empty">{hasProtectedService(selected) ? 'This provider requires access before its service can be used.' : 'This profile has not published a payable service.'}</div>}</div>
      <a className="profile-link" href={selected.uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${selected.uri.slice(7)}` : selected.uri} target="_blank" rel="noreferrer">Open published profile <ArrowUpRightFromSquare size={14} /></a>
    </section></div>}

    {hireRequest && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) { setHireRequest(null); setSignalMarket(null) } }}><section className="modal hire-modal"><button className="close-button" aria-label="Close request" disabled={busy !== null} onClick={() => { setHireRequest(null); setSignalMarket(null) }}><X size={19} /></button><span className="modal-kicker">PAID REQUEST</span><h2>{hireRequest.endpoint.name || `Hire ${hireRequest.agent.card?.name}`}</h2><p>{hireRequest.endpoint.name?.toLowerCase().includes('token') ? 'Enter a Monad token contract. The agent will verify it before requesting payment, then return live supply information.' : needsAddress(hireRequest.endpoint.name) ? 'Enter a Monad address. The agent will return its live balance and contract status.' : `Describe the work for ${hireRequest.agent.card?.name}. You can include a market, Buy or Sell, and an amount; you will review any order before it is placed.`}</p><form onSubmit={(event) => void hire(event)}><label htmlFor="hire-input">{needsAddress(hireRequest.endpoint.name) ? 'Monad address' : 'Your request'}</label><input id="hire-input" value={hireInput} onChange={(event) => setHireInput(event.target.value)} placeholder={needsAddress(hireRequest.endpoint.name) ? '0x…' : 'e.g. Review BTC; sell $25 if momentum weakens'} autoFocus required /><div className="payment-summary"><div><Coins size={17} /><span>Payment</span></div><strong>{paymentOf(hireRequest.agent, hireRequest.endpoint) || 'Shown by your wallet'}</strong></div><button className="primary-button wide" disabled={busy !== null || !hireInput.trim()}>{busy === 'hire' ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />} Review and pay</button></form></section></div>}

    {hireResult && !chatSession && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) setHireResult(null) }}><section className="modal result-modal"><button className="close-button" aria-label="Close result" onClick={() => setHireResult(null)}><X size={19} /></button><div className="success-icon"><Check size={23} /></div><span className="modal-kicker">WORK DELIVERED</span><h2>Request complete.</h2><p>{hireResult.agent.card?.name} returned a result after the payment settled.</p><ResultView value={hireResult.result} />{hireResult.market && <div className="feedback-box"><div><strong>Want to trade this market?</strong><span>{tradeIntentFromRequest(hireResult.request, hireResult.result) ? 'We picked up your requested direction or amount. Check the draft and change anything before placing it.' : 'Choose Buy or Sell and set any amount. Review the order before sending it to Perpl.'}</span></div><button className="primary-button wide" onClick={() => { setTradeIntent(tradeIntentFromRequest(hireResult.request, hireResult.result)); setTradeMarket(hireResult.market!) }}>Prepare an order <ArrowRight size={16} /></button></div>}{hireResult.paymentTx && <a className="proof-link" href={`${explorer}/tx/${hireResult.paymentTx}`} target="_blank" rel="noreferrer"><Check size={14} /> Payment confirmed on Monad <ArrowUpRight size={13} /></a>}{!feedbackDone ? <div className="feedback-box"><div><strong>How was the result?</strong><span>Your review helps others choose the right agent.</span></div><div className="stars">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={rating && value <= rating ? 'active' : ''} onClick={() => setRating(value)} aria-label={`${value} stars`}><Star size={21} fill="currentColor" /></button>)}</div><button className="primary-button wide" disabled={rating === '' || busy !== null} onClick={() => void sendFeedback()}>{busy === 'feedback' ? <LoaderCircle className="spin" size={16} /> : null}Record feedback</button></div> : <div className="feedback-complete"><Check size={17} /><div><strong>Reputation updated</strong>{hireResult.feedbackTx && <a href={`${explorer}/tx/${hireResult.feedbackTx}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={12} /></a>}</div></div>}<button className="secondary-button wide" style={{ marginTop: '16px' }} onClick={() => setHireResult(null)}>Done</button></section></div>}

    {chatSession && <ChatErrorBoundary onClose={() => { setChatSession(null); setChatInput(''); setChatMessages([]); setChatLastResult(null) }}><div className="modal-backdrop"><section className="modal agent-chat-modal" aria-label={`Chat with ${chatSession.endpoint.name || 'market research agent'}`}><button className="close-button" disabled={chatBusy} onClick={closeChat}><X size={19} /></button><span className="modal-kicker">AGENT RESEARCH · {chatSession.market.symbol}</span><h2>{chatSession.endpoint.name || 'Market Research Specialist'}.</h2><p>Click “Send message and pay” to approve the x402 payment in Privy. The agent analyzes live {chatSession.market.symbol} market context and risk, then answers below.</p><div className="agent-chat-messages">{chatMessages.length === 0 && <div className="agent-chat-empty">Start with a question about {chatSession.market.symbol}. You can ask follow-up questions, too.</div>}{chatMessages.map((message, index) => <article className={`agent-chat-message ${message.role}`} key={`${index}-${message.role}`}><span>{message.role === 'user' ? 'You' : chatSession.endpoint.name || 'Market research agent'}</span>{message.role === 'agent' && message.result && typeof message.result === 'object' && !Array.isArray(message.result) ? <ResultView value={message.result} /> : <p>{message.text}</p>}{message.role === 'agent' && <div className="agent-trade-action"><button type="button" onClick={() => { const isShort = /bearish|short|downside|decline|sell/i.test(message.text); setTradeIntent({ direction: isShort ? 'short' : 'long', notional: '10', leverage: '5' }); setTradeMarket(chatSession.market) }}>Trade {chatSession.market.symbol} on Perpl <ArrowRight size={13} /></button></div>}{message.paymentTx && <a className="proof-link" href={`${explorer}/tx/${message.paymentTx}`} target="_blank" rel="noreferrer">Payment confirmed <ArrowUpRight size={12} /></a>}</article>)}</div>{notice && <p className="chat-notice" role="status">{notice}</p>}<form className="agent-chat-form" onSubmit={(event) => void sendChatMessage(event)}><label htmlFor="agent-chat-input">Your message</label><textarea id="agent-chat-input" rows={3} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={`Ask about ${chatSession.market.symbol}…`} required /><div className="agent-chat-price">Listed price: {paymentOf(chatSession.agent, chatSession.endpoint) || 'Shown in your wallet'} per message · Privy asks you to approve before the agent runs.</div><button className="primary-button wide" disabled={chatBusy || !chatInput.trim()}>{chatBusy ? <><LoaderCircle className="spin" size={16} />Check Privy for approval…</> : <><ArrowRight size={16} />Send message and pay</>}</button></form><p className="perpl-network-note">Any trade remains a draft until you review and place it.</p></section></div></ChatErrorBoundary>}

    {tradeMarket && <PerplTrader market={tradeMarket} intent={tradeIntent} walletAddress={walletAddress} onConnect={onConnect} onClose={() => { setTradeMarket(null); setTradeIntent(undefined); void fetchVaultPositions(); void fetchVaultBalance(); void fetchWalletBalances() }} onNotice={setNotice} />}

    {showRegister && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) setShowRegister(false) }}><section className="modal"><button className="close-button" aria-label="Close publish modal" onClick={() => setShowRegister(false)}><X size={19} /></button><span className="modal-kicker">PUBLISH AN AGENT</span><h2>Join the network.</h2><p>Provide a public profile containing the agent’s name, description, capabilities, and available services.</p><form onSubmit={(event) => void onRegister(event)}><label htmlFor="profile-uri">Profile link</label><input id="profile-uri" type="url" value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} placeholder="https://…" required /><div className="identity-note"><Fingerprint size={18} /><span>Approve registration in your wallet to publish your agent.</span></div><button className="primary-button wide" disabled={!metadataUri.trim() || busy !== null}>{busy === 'register' ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />}Connect and register</button></form></section></div>}

    {pnlCardPosition && (
      <PnlCardModal
        position={pnlCardPosition}
        walletAddress={walletAddress}
        onClose={() => setPnlCardPosition(null)}
      />
    )}

    {depositModalOpen && walletAddress && (
      <DepositWithdrawModal
        initialTab={depositModalTab}
        walletAddress={walletAddress}
        onClose={() => setDepositModalOpen(false)}
        onSuccess={() => {
          void fetchVaultPositions()
          void fetchVaultBalance()
          void fetchWalletBalances()
        }}
        onNotice={setNotice}
      />
    )}
  </div>
}
