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
function payable(agent: Agent) { return agent.card?.x402Support !== false && Array.isArray(agent.card?.endpoints) && agent.card.endpoints.some((endpoint: any) => typeof (endpoint?.endpoint || endpoint?.url) === 'string') }
function price(agent: Agent) {
  const endpoint = agent.card?.endpoints?.find((item: any) => item?.pricing?.amount)
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
  const available = useMemo(() => agents.filter(payable), [agents])
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
    <div className="copy-hero"><div><span className="copy-eyebrow"><i /> AGENT IDEAS · MONAD TESTNET</span><h1 id="copy-title">Follow the thinking.<br /><em>Choose every trade.</em></h1><p>Follow real agents from the network. Ask one about a live Perpl market, then review any order yourself before it is placed.</p></div><div className="copy-hero-mark" aria-hidden="true"><Bookmark size={32} /></div></div>
    <div className="copy-toolbar"><div className="copy-tabs" role="tablist" aria-label="Agent list"><button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>Discover</button><button role="tab" aria-selected={tab === 'following'} className={tab === 'following' ? 'active' : ''} onClick={() => setTab('following')}>Following <span>{followed.length}</span></button></div><label className="copy-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an agent or skill" /></label><select className="copy-market-select" aria-label="Market to discuss" value={chosenMarket ? String(chosenMarket.id) : ''} onChange={(event) => setMarketId(event.target.value)} disabled={!markets.length}><option value="">Choose market</option>{markets.map((market) => <option key={market.id} value={market.id}>{market.symbol} · ${market.mark.toLocaleString(undefined, { maximumFractionDigits: 4 })}</option>)}</select></div>
    {!markets.length && <div className="copy-empty"><div><strong>Live markets are loading</strong><p>Try again in a moment to ask an agent about current Monad market data.</p></div></div>}
    {visible.length === 0 && markets.length > 0 && <div className="copy-empty"><div><strong>{tab === 'following' ? 'Follow an agent to begin' : 'No payable agents are listed yet'}</strong><p>Only registered agents with a live paid service can appear here.</p></div></div>}
    {visible.length > 0 && <div className="copy-trader-grid">{visible.map((agent) => {
      const id = agent.id.toString()
      const isFollowed = followed.includes(id)
      return <article className="copy-trader-card copy-agent-card" key={id}><div className="copy-card-head"><span className="copy-rank">#{id}</span><span className="copy-avatar copy-avatar-fallback">{String(agent.card?.name || '?').slice(0, 1).toUpperCase()}</span><span className="copy-trader-name">{agent.card?.name || `Agent ${id}`}</span><span className="copy-following-pill"><i /> Available</span></div><p className="copy-agent-description">{agent.card?.description || 'This agent has not added a description.'}</p><div className="copy-agent-tags">{skills(agent).map((tag: string) => <span key={tag}>{tag}</span>)}</div><div className="copy-agent-meta"><span>Listed price</span><strong>{price(agent)}</strong><span>Reputation</span><strong>{agent.summary ? <><Star size={13} /> {Number(agent.summary.value) / (10 ** agent.summary.decimals)} · {agent.summary.count.toString()} reviews</> : 'No reviews yet'}</strong></div><div className="copy-agent-actions"><button className="copy-track-button" onClick={() => toggle(agent)}>{isFollowed ? <Check size={15} /> : <Bookmark size={15} />}{isFollowed ? 'Following' : 'Follow agent'}</button><button className="primary-button" disabled={!chosenMarket} onClick={() => chosenMarket && onAsk(agent, chosenMarket)}>Ask about {chosenMarket?.symbol || 'market'} <ArrowRight size={14} /></button></div></article>
    })}</div>}
    <p className="copy-note">Following saves your agent list on this device. Every agent message is paid separately; every trade stays yours to review and approve.</p>
  </section>
}
