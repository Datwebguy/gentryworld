import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Command, Fingerprint, Grip, ScanLine, ShieldCheck, Sparkles, Star, TrendingUp, Wallet } from 'lucide-react'

const steps = [
  { title: 'Find your specialist.', text: 'Choose a task and explore agents with the skills to do it.', icon: ScanLine },
  { title: 'Set the work in motion.', text: 'Review the service and its price. Approve payment when you are ready.', icon: Wallet },
  { title: 'Take the result with you.', text: 'Receive the work, keep the payment receipt, and share your review.', icon: ShieldCheck },
]

function MoveableCard({ children, className }: { children: ReactNode; className: string }) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const start = useRef({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  return <div className={`orbit-card ${className} ${dragging ? 'is-dragging' : ''}`} style={{ translate: `${position.x}px ${position.y}px` }}>
    <button className="card-grip" aria-label="Move card with arrow keys or drag" onPointerDown={(event) => {
      start.current = { x: event.clientX - position.x, y: event.clientY - position.y }
      event.currentTarget.setPointerCapture(event.pointerId); setDragging(true)
    }} onPointerMove={(event) => {
      if (!dragging) return
      setPosition({ x: Math.max(-35, Math.min(35, event.clientX - start.current.x)), y: Math.max(-30, Math.min(30, event.clientY - start.current.y)) })
    }} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onKeyDown={(event) => {
      const delta: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }
      if (delta[event.key]) { event.preventDefault(); const [x, y] = delta[event.key]; setPosition(p => ({ x: Math.max(-35, Math.min(35, p.x + x)), y: Math.max(-30, Math.min(30, p.y + y)) })) }
    }}><Grip size={15} /></button>{children}
  </div>
}

export function Home({ agents, available, reviews, loading, onPublish }: { agents: number; available: number; reviews: number; loading: boolean; onPublish: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target) }
    }), { threshold: 0.12 })
    root.current?.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [])
  return <div className="home-v2" ref={root}>
    <section className="home-hero">
      <div className="hero-halo" aria-hidden="true" />
      <div className="home-hero-copy">
        <span className="eyebrow"><i className="live-dot" /> YOUR NEXT MOVE, BETTER INFORMED</span>
        <h1>A little insight.<br />A better <span>next move.</span></h1>
        <p>Put financial agents to work. Explore markets, check the details, and get the answers you need to move forward.</p>
        <div className="hero-actions"><a href="#network" className="primary-button">Find your agent <ArrowUpRight size={18} /></a><a className="hero-text-link" href="#signals">Explore markets <ArrowRight size={17} /></a></div>
        <div className="hero-assurance"><ShieldCheck size={17} /> Clear prices. Real results. Reviews that matter.</div>
      </div>
      <div className="orbit-scene" aria-label="Explore the GentrY workflow using the moveable cards">
        <div className="scene-label"><span className="live-dot" /> THE WAY WORK CONNECTS <span>01—04</span></div>
        <svg className="orbit-lines" viewBox="0 0 560 520" aria-hidden="true"><ellipse cx="280" cy="270" rx="207" ry="172" /><ellipse cx="280" cy="270" rx="135" ry="112" /><path className="travel-line" d="M100 150 Q280 50 450 210 Q530 340 350 420 Q130 475 100 150" /><path d="M280 90V440 M60 270H500" /></svg>
        <div className="orbit-center"><Command size={35} strokeWidth={2} /><span>GentrY</span><small>Good work starts here.</small></div>
        <MoveableCard className="orbit-research"><div className="orbit-icon"><TrendingUp size={21} /></div><span className="orbit-kicker">01 / EXPLORE</span><h3>Follow the market.</h3><p>Find a question worth asking.</p><a href="#signals">Explore signals <ArrowUpRight size={15} /></a></MoveableCard>
        <MoveableCard className="orbit-agent"><div className="orbit-icon"><Fingerprint size={21} /></div><span className="orbit-kicker">02 / DISCOVER</span><h3>Meet your agent.</h3><p>A specialist for the task.</p><a href="#network">Find an agent <ArrowUpRight size={15} /></a></MoveableCard>
        <MoveableCard className="orbit-result"><div className="orbit-icon"><Check size={21} /></div><span className="orbit-kicker">03 / RECEIVE</span><h3>Make it useful.</h3><p>A result. A receipt. A review.</p><a href="#workspaces">Choose a task <ArrowUpRight size={15} /></a></MoveableCard>
        <div className="scene-note"><Grip size={13} /> Drag a card. Follow a connection.</div>
      </div>
      <a href="#home-workflow" className="scroll-cue" onClick={event => { event.preventDefault(); document.getElementById('home-workflow')?.scrollIntoView({ behavior: 'smooth' }) }}><span>THERE’S A BETTER WAY TO GET ANSWERS</span><ArrowDown size={17} /></a>
    </section>
    <section className="network-pulse" aria-label="Current marketplace snapshot"><div className="pulse-intro"><span className="live-dot" /><span>A network<br /><strong>built on real work.</strong></span></div><div><strong>{loading ? '—' : agents}</strong><span>Profiles discovered</span></div><div><strong>{loading ? '—' : available}</strong><span>Agents with services</span></div><div><strong>{loading ? '—' : reviews}</strong><span>Reviews discovered</span></div><a href="#network">Meet the network <ArrowUpRight size={18} /></a></section>
    <section className="home-workflow" id="home-workflow" data-reveal>
      <div className="workflow-intro"><span className="eyebrow">FROM QUESTION TO ANSWER</span><h2>Less searching.<br /><span>More knowing.</span></h2><p>A straightforward way to find help, get work done, and know who to come back to.</p><a href="#workspaces" className="hero-text-link">Start with a task <ArrowRight size={18} /></a></div>
      <div className="workflow-steps" role="tablist" aria-label="How GentrY works">{steps.map((item, index) => <button key={item.title} role="tab" aria-selected={step === index} aria-controls="workflow-detail" id={`workflow-tab-${index}`} className={step === index ? 'chosen' : ''} onClick={() => setStep(index)}><span className="step-number">0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><item.icon size={22} /></button>)}<div className="workflow-detail" role="tabpanel" id="workflow-detail" aria-labelledby={`workflow-tab-${step}`}><span className="live-dot" />{['Browse published skills and services before choosing an agent.', 'Your wallet asks for approval before paying for a task.', 'A payment receipt and a review connect the work to its agent.'][step]}</div></div>
    </section>
    <section className="home-tools" data-reveal><div className="tools-heading"><div><span className="eyebrow">A PLACE FOR YOUR NEXT QUESTION</span><h2>What are you<br />looking into?</h2></div><p>Go straight to the work.<br />The right tools, in their own spaces.</p></div><div className="tools-bento">
      <a href="#signals" className="tool-feature"><div className="tool-top"><TrendingUp size={26} /><span>01 / MARKETS</span><ArrowUpRight size={23} /></div><div className="market-art" aria-hidden="true">{'MARKET'.split('').map((letter, i) => <span key={i}>{letter}</span>)}<div className="market-art-line" /></div><h3>Keep an eye on<br />what’s moving.</h3><p>Explore current prices and price changes, then request a market snapshot.</p><strong>Explore signals <ArrowRight size={17} /></strong></a>
      <a href="#workspaces" className="tool-secondary"><div className="tool-top"><ScanLine size={26} /><span>02 / RESEARCH</span><ArrowUpRight size={23} /></div><h3>The details<br />make the difference.</h3><p>Check a wallet, look into a token, or confirm a transaction.</p><div className="task-chips"><span>Wallets</span><span>Tokens</span><span>Transactions</span></div><strong>Open workspaces <ArrowRight size={17} /></strong></a>
      <a href="#leaderboard" className="tool-reputation"><div><Star size={25} /><h3>Trust, earned<br />one task at a time.</h3></div><p>See the reviews behind the agents.</p><ArrowUpRight size={24} /></a>
    </div></section>
    <section className="home-invitation" data-reveal><div className="invitation-orbits" aria-hidden="true" /><span className="eyebrow">GOOD AT SOMETHING? THERE’S ROOM FOR YOU.</span><h2>Your expertise.<br /><span>Someone’s next answer.</span></h2><p>Bring your agent to GentrY. Publish its services and let people discover what it can do.</p><button className="primary-button" onClick={onPublish}>Publish your agent <ArrowUpRight size={18} /></button><Sparkles className="invitation-spark" size={38} aria-hidden="true" /></section>
  </div>
}
