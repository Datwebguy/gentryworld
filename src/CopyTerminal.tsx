import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, ArrowUpRight, BadgeCheck, Bookmark, Check, CircleHelp, LoaderCircle, RefreshCw, Search, X } from 'lucide-react'
import './copy-terminal.css'

type Trader = {
  rank: number
  user_id: string
  pnl: number
  volume: number
  user_name?: string
  profile_image?: string
  x_username?: string
  verified?: boolean
}

type Position = {
  token_id: string
  title: string
  outcome: string
  status: string
  current_value: number
  total_pnl: number
  percent_pnl: number
  icon?: string
}

type Trade = {
  token_id: string
  side: string
  size: number
  price: number
  timestamp: number
  title: string
  outcome: string
  transaction_hash: string
}

type TraderDetail = { positions: Position[]; trades: Trade[]; updatedAt: number; stale: boolean }

const trackedKey = 'gentry:copy:tracked-wallets:v1'

function readTracked(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(trackedKey) || '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && /^0x[a-fA-F0-9]{40}$/.test(item)) : []
  } catch { return [] }
}

function money(value: number, compact = false) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 0 }).format(value)
}

function shortWallet(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}` }

export function CopyTerminal() {
  const [period, setPeriod] = useState('MONTH')
  const [category, setCategory] = useState('OVERALL')
  const [tab, setTab] = useState<'ranked' | 'following'>('ranked')
  const [search, setSearch] = useState('')
  const [traders, setTraders] = useState<Trader[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(0)
  const [stale, setStale] = useState(false)
  const [tracked, setTracked] = useState<string[]>(readTracked)
  const [selected, setSelected] = useState<Trader | null>(null)
  const [detail, setDetail] = useState<TraderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  async function loadRankings() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ period, category })
      const response = await fetch(`/api/copy-trading/leaderboard?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Trader rankings are unavailable right now.')
      setTraders(Array.isArray(payload.traders) ? payload.traders : [])
      setUpdatedAt(payload.updatedAt || Date.now())
      setStale(Boolean(payload.stale))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Trader rankings are unavailable right now.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadRankings() }, [period, category])

  useEffect(() => {
    try { localStorage.setItem(trackedKey, JSON.stringify(tracked)) } catch { /* Tracking remains available for this visit. */ }
  }, [tracked])

  useEffect(() => {
    if (!selected) { setDetail(null); setDetailError(''); return }
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError('')
    setDetail(null)
    fetch(`/api/copy-trading/trader?wallet=${encodeURIComponent(selected.user_id)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'This trader’s activity is unavailable right now.')
        setDetail(payload)
      })
      .catch((cause) => { if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : 'This trader’s activity is unavailable right now.') })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [selected?.user_id])

  const visible = useMemo(() => traders.filter((trader) => {
    if (tab === 'following' && !tracked.includes(trader.user_id.toLowerCase())) return false
    const query = search.trim().toLowerCase()
    return !query || [trader.user_name, trader.x_username, trader.user_id].some((value) => String(value || '').toLowerCase().includes(query))
  }), [traders, tab, tracked, search])

  function toggleTracked(wallet: string) {
    const normalized = wallet.toLowerCase()
    setTracked((current) => current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized])
  }

  return <section className="copy-terminal" aria-labelledby="copy-title">
    <div className="copy-hero">
      <div>
        <span className="copy-eyebrow"><i /> PREDICTION MARKETS</span>
        <h1 id="copy-title">Follow the moves.<br /><em>Set your own limits.</em></h1>
        <p>Discover active Polymarket traders, check their current positions and recent trades, then build a list to follow.</p>
      </div>
      <div className="copy-hero-mark" aria-hidden="true"><Activity size={33} /></div>
    </div>

    <div className="copy-toolbar">
      <div className="copy-tabs" role="tablist" aria-label="Trader list">
        <button role="tab" aria-selected={tab === 'ranked'} className={tab === 'ranked' ? 'active' : ''} onClick={() => setTab('ranked')}>Top traders</button>
        <button role="tab" aria-selected={tab === 'following'} className={tab === 'following' ? 'active' : ''} onClick={() => setTab('following')}>Following <span>{tracked.length}</span></button>
      </div>
      <label className="copy-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search traders or wallet" /></label>
      <button className="copy-refresh" onClick={() => void loadRankings()} disabled={loading} aria-label="Refresh trader rankings">{loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}<span>Refresh</span></button>
    </div>

    <div className="copy-filters">
      <div className="copy-filter-group" aria-label="Time period">{[['DAY', '24H'], ['WEEK', '7D'], ['MONTH', '30D'], ['ALL', 'All time']].map(([value, label]) => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div>
      <select aria-label="Market category" value={category} onChange={(event) => setCategory(event.target.value)}>
        {['OVERALL', 'POLITICS', 'SPORTS', 'ESPORTS', 'CRYPTO', 'CULTURE', 'MENTIONS', 'WEATHER', 'ECONOMICS', 'TECH', 'FINANCE'].map((item) => <option value={item} key={item}>{item === 'OVERALL' ? 'All markets' : item[0] + item.slice(1).toLowerCase()}</option>)}
      </select>
      <div className="copy-source">{updatedAt > 0 ? <><i /> {stale ? 'Showing recent data' : 'Live Polymarket data'} <span>· {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></> : <><i /> Polymarket data</>}</div>
    </div>

    {error && traders.length === 0 && <div className="copy-empty"><CircleHelp size={20} /><div><strong>Trader rankings could not be loaded</strong><p>{error}</p><button onClick={() => void loadRankings()}>Try again <ArrowRight size={14} /></button></div></div>}
    {loading && traders.length === 0 && <div className="copy-trader-grid">{[0, 1, 2, 3, 4, 5].map((index) => <div className="copy-trader-card copy-skeleton" key={index} />)}</div>}
    {!loading && !error && visible.length === 0 && <div className="copy-empty"><Bookmark size={20} /><div><strong>{tab === 'following' ? 'No traders followed yet' : 'No traders found'}</strong><p>{tab === 'following' ? 'Save a trader to keep their positions and activity close.' : 'Try a different name, wallet, or market category.'}</p></div></div>}

    {visible.length > 0 && <div className="copy-trader-grid">{visible.map((trader) => {
      const isTracked = tracked.includes(trader.user_id.toLowerCase())
      return <article className="copy-trader-card" key={trader.user_id}>
        <button className="copy-open-card" onClick={() => setSelected(trader)} aria-label={`View ${trader.user_name || shortWallet(trader.user_id)}`}>
          <div className="copy-card-head">
            <span className="copy-rank">#{trader.rank.toString().padStart(2, '0')}</span>
            {trader.profile_image ? <img className="copy-avatar" src={trader.profile_image} alt="" /> : <span className="copy-avatar copy-avatar-fallback">{(trader.user_name || trader.user_id).slice(0, 1).toUpperCase()}</span>}
            <span className="copy-trader-name">{trader.user_name || shortWallet(trader.user_id)}{trader.verified && <BadgeCheck size={15} aria-label="Verified profile" />}</span>
            <ArrowUpRight size={16} className="copy-card-arrow" />
          </div>
          <span className="copy-wallet">{shortWallet(trader.user_id)}</span>
          <div className="copy-card-stats"><div><span>P&L · {period === 'DAY' ? '24H' : period === 'WEEK' ? '7D' : period === 'MONTH' ? '30D' : 'ALL'}</span><strong className={trader.pnl >= 0 ? 'positive' : 'negative'}>{money(trader.pnl, true)}</strong></div><div><span>Volume</span><strong>{money(trader.volume, true)}</strong></div></div>
          <div className="copy-card-footer"><span>View positions and trades</span><ArrowRight size={15} /></div>
        </button>
        <button className={`copy-track-button${isTracked ? ' is-tracked' : ''}`} onClick={() => toggleTracked(trader.user_id)} aria-label={isTracked ? 'Stop following this trader' : 'Follow this trader'}>{isTracked ? <Check size={15} /> : <Bookmark size={15} />}{isTracked ? 'Following' : 'Follow'}</button>
      </article>
    })}</div>}

    <p className="copy-note">Rankings and activity come from Polymarket. Past performance can change; following a trader does not place trades.</p>

    {selected && <div className="copy-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
      <section className="copy-drawer" aria-label="Trader activity">
        <button className="copy-close" aria-label="Close trader details" onClick={() => setSelected(null)}><X size={19} /></button>
        <span className="copy-drawer-kicker">TRADER PROFILE</span>
        <div className="copy-drawer-title"><div className="copy-drawer-avatar">{(selected.user_name || selected.user_id).slice(0, 1).toUpperCase()}</div><div><h2>{selected.user_name || shortWallet(selected.user_id)}{selected.verified && <BadgeCheck size={18} />}</h2><a href={`https://polymarket.com/profile/${selected.user_id}`} target="_blank" rel="noreferrer">{shortWallet(selected.user_id)} <ArrowUpRight size={13} /></a></div></div>
        <div className="copy-drawer-stats"><div><span>{period} P&L</span><strong className={selected.pnl >= 0 ? 'positive' : 'negative'}>{money(selected.pnl, true)}</strong></div><div><span>Volume</span><strong>{money(selected.volume, true)}</strong></div></div>
        <button className={`copy-track-wide${tracked.includes(selected.user_id.toLowerCase()) ? ' is-tracked' : ''}`} onClick={() => toggleTracked(selected.user_id)}>{tracked.includes(selected.user_id.toLowerCase()) ? <Check size={16} /> : <Bookmark size={16} />}{tracked.includes(selected.user_id.toLowerCase()) ? 'Following this trader' : 'Follow this trader'}</button>
        {detailLoading && <div className="copy-detail-loading"><LoaderCircle size={17} className="spin" /> Loading current activity</div>}
        {detailError && <div className="copy-detail-error"><CircleHelp size={17} />{detailError}</div>}
        {detail && <>
          <div className="copy-detail-section"><div className="copy-section-title"><h3>Open positions</h3><span>{detail.positions.length}</span></div>{detail.positions.length ? <div className="copy-position-list">{detail.positions.map((position) => <article key={position.token_id}><div className="copy-position-main">{position.icon && <img src={position.icon} alt="" />}<div><strong>{position.title}</strong><span>{position.outcome} · {position.status.toLowerCase()}</span></div></div><div className="copy-position-value"><strong>{money(position.current_value, true)}</strong><span className={position.total_pnl >= 0 ? 'positive' : 'negative'}>{money(position.total_pnl, true)} · {position.percent_pnl.toFixed(1)}%</span></div></article>)}</div> : <p className="copy-no-items">No open positions returned.</p>}</div>
          <div className="copy-detail-section"><div className="copy-section-title"><h3>Recent trades</h3><span>{detail.trades.length}</span></div>{detail.trades.length ? <div className="copy-trade-list">{detail.trades.map((trade) => <article key={`${trade.transaction_hash}:${trade.token_id}:${trade.timestamp}`}><div><strong>{trade.title}</strong><span>{trade.side} · {trade.outcome} · {new Date(trade.timestamp * 1000).toLocaleString()}</span></div><b>{money(trade.size * trade.price, true)}</b></article>)}</div> : <p className="copy-no-items">No recent trades returned.</p>}</div>
          <a className="copy-profile-link" href={`https://polymarket.com/profile/${selected.user_id}`} target="_blank" rel="noreferrer">Open Polymarket profile <ArrowUpRight size={14} /></a>
        </>}
      </section>
    </div>}
  </section>
}
