import { useMemo, useState } from 'react'
import { ArrowRight, Bookmark, Check, Search, Star } from 'lucide-react'
import type { Agent } from './chain'
import './copy-terminal.css'

type Market = { id: number; symbol: string; name: string; mark: number; previous: number; changePct: number; fundingRate: number; open: boolean; updatedAt?: number; sizeDecimals?: number; priceDecimals?: number; maxLeverage?: number | null; maxSlippageBps?: number }
type Props = { agents: Agent[]; markets: Market[]; onAsk: (agent: Agent, market: Market) => void }
const followedKey = 'gentry:followed-agents:v1'

function readFollowed(): string[] {
  try { const value = JSON.parse(localStorage.getItem(followedKey) || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [] } catch { return [] }
}
function marketEndpoint(agent: Agent) {
  if (agent.card?.x402Support === false || !Array.isArray(agent.card?.endpoints)) return undefined
  const endpoints = agent.card.endpoints.filter((item: any) => item && typeof (item.endpoint || item.url) === 'string')
  const isInspector = (ep: any) => {
    const text = [ep.name, ep.endpoint, ep.url].join(' ').toLowerCase()
    return text.includes('token-inspector') || text.includes('address-inspector') || text.includes('transaction-inspector') ||
      text.includes('inspect a token') || text.includes('inspect an address') || text.includes('verify a transaction')
  }

  const specific = endpoints.find((ep: any) => {
    if (isInspector(ep)) return false
    const text = [ep.name, ep.endpoint, ep.url].join(' ').toLowerCase()
    return text.includes('market-signal') || text.includes('market signal') || text.includes('signal analyst') || text.includes('market research')
  })
  if (specific) return specific

  return endpoints.find((ep: any) => {
    if (isInspector(ep)) return false
    const text = [ep.name, ep.endpoint, ep.url, ep.description, ...(Array.isArray(ep.skills) ? ep.skills : [])].join(' ').toLowerCase()
    return /market[- ]signal|market[- ]research|perpl|market[- ]price|funding review/i.test(text)
  })
}
function price(agent: Agent) {
  const endpoint = marketEndpoint(agent)
  return endpoint?.pricing ? `${endpoint.pricing.amount} ${endpoint.pricing.currency || 'USDC'}` : 'Price shown at payment'
}
function skills(agent: Agent) {
  const list = agent.card?.capabilities || agent.card?.skills || []
  return Array.isArray(list) ? list.slice(0, 3).map((item: any) => typeof item === 'string' ? item : item?.name || item?.id).filter(Boolean) : []
}

export function CopyTerminal({ agents, markets, onAsk }: Props) {
  const [followed, setFollowed] = useState<string[]>(readFollowed)
  const [tab, setTab] = useState<'discover' | 'following'>('discover')
  const [query, setQuery] = useState('')
  const [marketId, setMarketId] = useState('')
  const available = useMemo(() => agents.filter((agent) => marketEndpoint(agent)), [agents])
  const visible = useMemo(() => available.filter((agent) => {
    if (tab === 'following' && !followed.includes(agent.id.toString())) return false
    const text = query.trim().toLowerCase()
    return !text || [agent.card?.name, agent.card?.description, ...skills(agent)].some((value) => String(value || '').toLowerCase().includes(text))
  }), [available, followed, query, tab])
  const chosenMarket = markets.find((market) => String(market.id) === marketId) || markets[0]

  function toggle(agent: Agent) {
    const id = agent.id.toString()
    setFollowed((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      try { localStorage.setItem(followedKey, JSON.stringify(next)) } catch { /* Saved for this visit. */ }
      return next
    })
  }

  return <section className="copy-terminal" aria-labelledby="copy-title">
    <div className="copy-hero"><div><span className="copy-eyebrow"><i /> AGENT MARKET RESEARCH · MONAD TESTNET</span><h1 id="copy-title">Ask the right agent.<br /><em>Make your next move.</em></h1><p>Choose a live Perpl market, ask a registered specialist for research, and review their thesis before deciding what to do.</p></div><div className="copy-hero-mark" aria-hidden="true"><Bookmark size={32} /></div></div>
    <div className="copy-toolbar"><div className="copy-tabs" role="tablist" aria-label="Agent list"><button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>Discover specialists</button><button role="tab" aria-selected={tab === 'following'} className={tab === 'following' ? 'active' : ''} onClick={() => setTab('following')}>Saved <span>{followed.length}</span></button></div><label className="copy-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a specialist or skill" /></label><select className="copy-market-select" aria-label="Market to discuss" value={chosenMarket ? String(chosenMarket.id) : ''} onChange={(event) => setMarketId(event.target.value)} disabled={!markets.length}><option value="">Choose market</option>{markets.map((market) => <option key={market.id} value={market.id}>{market.symbol} · ${market.mark.toLocaleString(undefined, { maximumFractionDigits: 4 })}</option>)}</select></div>
    {!markets.length && <div className="copy-empty"><div><strong>Live markets are loading</strong><p>Try again in a moment to ask an agent about current Monad market data.</p></div></div>}
    {visible.length === 0 && markets.length > 0 && <div className="copy-empty"><div><strong>{tab === 'following' ? 'Save an agent to find it here' : 'No payable market research agents found'}</strong><p>Only registered agents with a live market analysis service appear here.</p></div></div>}
    {visible.length > 0 && <div className="copy-trader-grid">{visible.map((agent) => {
      const id = agent.id.toString()
      const isFollowed = followed.includes(id)
      const endpoint = marketEndpoint(agent)!
      return <article className="copy-trader-card copy-agent-card" key={id}><div className="copy-card-head"><span className="copy-rank">#{id}</span><span className="copy-avatar copy-avatar-fallback">{String(endpoint.name || agent.card?.name || '?').slice(0, 1).toUpperCase()}</span><span className="copy-trader-name">{endpoint.name || agent.card?.name || `Agent ${id}`}</span><span className="copy-following-pill"><i /> Available</span></div><p className="copy-agent-description">{endpoint.description || `Market research from ${agent.card?.name || `registered agent #${id}`}. Uses current Perpl market data and explains relevant risk.`}</p><div className="copy-agent-tags">{(endpoint.skills || skills(agent)).slice(0, 3).map((tag: any) => <span key={typeof tag === 'string' ? tag : tag?.name || tag?.id}>{typeof tag === 'string' ? tag : tag?.name || tag?.id}</span>)}</div><div className="copy-agent-meta"><span>Listed price</span><strong>{price(agent)}</strong><span>Reputation</span><strong>{agent.summary ? <><Star size={13} /> {Number(agent.summary.value) / (10 ** agent.summary.decimals)} · {agent.summary.count.toString()} reviews</> : 'No reviews yet'}</strong></div><div className="copy-agent-actions"><button className="copy-track-button" onClick={() => toggle(agent)}>{isFollowed ? <Check size={15} /> : <Bookmark size={15} />}{isFollowed ? 'Saved' : 'Save agent'}</button><button className="primary-button" disabled={!chosenMarket} onClick={() => chosenMarket && onAsk(agent, chosenMarket)}>Ask about {chosenMarket?.symbol || 'market'} <ArrowRight size={14} /></button></div></article>
    })}</div>}
    <p className="copy-note">Bookmarked agents stay on this device. Each query is approved and settled via x402. Trades are never placed automatically.</p>
  </section>
}
