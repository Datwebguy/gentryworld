import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Palette, Share2, X } from 'lucide-react'
import type { VaultPosition } from './PerplTrader'
import { CHARACTER_OPTIONS, getCharacterSvg, type CharacterId } from './pnl-characters'

interface PnlCardModalProps {
  position?: VaultPosition | null
  walletAddress?: string
  onClose: () => void
}

interface ColorTheme {
  name: string
  bg: string
  text: string
  accent: string
  muted: string
  cardBg: string
}

const COLOR_THEMES: ColorTheme[] = [
  {
    name: 'Obsidian Emerald',
    bg: '#0a0d12',
    text: '#ffffff',
    accent: '#10b981',
    muted: '#64748b',
    cardBg: '#131822',
  },
  {
    name: 'Monad Cyber',
    bg: '#0c0a17',
    text: '#f8fafc',
    accent: '#8338ec',
    muted: '#7a7299',
    cardBg: '#17142b',
  },
  {
    name: 'Crimson Edge',
    bg: '#0d080a',
    text: '#ffffff',
    accent: '#ef4444',
    muted: '#856972',
    cardBg: '#1a1014',
  },
  {
    name: 'Neon Cyan',
    bg: '#070f18',
    text: '#f0fdfa',
    accent: '#06b6d4',
    muted: '#647e94',
    cardBg: '#0e1d2c',
  },
  {
    name: 'Stealth Onyx',
    bg: '#0f0f11',
    text: '#ffffff',
    accent: '#e2e8f0',
    muted: '#71717a',
    cardBg: '#18181b',
  },
  {
    name: 'Swiss Light',
    bg: '#f8fafc',
    text: '#0f172a',
    accent: '#059669',
    muted: '#64748b',
    cardBg: '#f1f5f9',
  },
]

export function PnlCardModal({ position, walletAddress, onClose }: PnlCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Initial computation from position
  const initialRoe = Number(
    position?.status === 'closed'
      ? (position.realizedRoePct ?? position.roePct ?? position.pnlPct ?? 42.5)
      : (position?.roePct ?? position?.pnlPct ?? 42.5)
  )
  const initialIsProfit = initialRoe >= 0

  // Customization States
  const [character, setCharacter] = useState<CharacterId>('ronin')
  const [isWin, setIsWin] = useState<boolean>(initialIsProfit)
  const [valueMode, setValueMode] = useState<'roe' | 'usd'>('roe')
  const [pnlValue, setPnlValue] = useState<string>(
    initialIsProfit ? `+${Math.abs(initialRoe).toFixed(2)}%` : `-${Math.abs(initialRoe).toFixed(2)}%`
  )
  const [username, setUsername] = useState<string>(
    walletAddress ? `@${walletAddress.slice(0, 5)}...${walletAddress.slice(-3)}` : '@trader'
  )
  const [dateRange, setDateRange] = useState<string>(() => {
    const now = new Date()
    const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${fmt(past)} – ${fmt(now)}`
  })
  const [referralCode, setReferralCode] = useState<string>('GENTRY')
  const [showReferral, setShowReferral] = useState<boolean>(true)
  const [selectedThemeIdx, setSelectedThemeIdx] = useState<number>(initialIsProfit ? 0 : 2)

  // Color customization overrides
  const [colors, setColors] = useState<ColorTheme>(COLOR_THEMES[initialIsProfit ? 0 : 2])
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false)

  // Select a preset theme
  const selectTheme = (idx: number) => {
    setSelectedThemeIdx(idx)
    setColors(COLOR_THEMES[idx])
  }

  // Handle Win/Loss Toggle
  const toggleWinState = (win: boolean) => {
    setIsWin(win)
    // If sign doesn't match, update pnlValue sign
    setPnlValue((prev) => {
      const clean = prev.replace(/[+\-%$]/g, '').trim()
      const suffix = valueMode === 'roe' ? '%' : ''
      const prefix = valueMode === 'usd' ? '$' : ''
      return win ? `+${prefix}${clean}${suffix}` : `-${prefix}${clean}${suffix}`
    })
    // Auto-switch theme to emerald for win, crimson for loss if using default presets
    if (win && selectedThemeIdx === 2) selectTheme(0)
    if (!win && selectedThemeIdx === 0) selectTheme(2)
  }

  // Render the high-resolution clean PnL Card on Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 1200x675 standard Twitter/Social resolution (crisp 16:9)
    const width = 1200
    const height = 675
    canvas.width = width
    canvas.height = height

    // 1. Clean Solid Background (NO generic AI gradients/particles/noise/circles)
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, width, height)

    // 2. High-Contrast Negative Space
    // Clean, minimalist typography & layout

    // --- TOP LEFT: Logo + User Avatar + Username ---
    const topX = 80
    const topY = 70

    // GentrY Brand Mark
    ctx.fillStyle = colors.text
    ctx.font = '900 28px "Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('GentrY', topX, topY + 22)

    // Subtle Monad testnet pill
    const brandWidth = ctx.measureText('GentrY').width
    ctx.fillStyle = colors.cardBg
    ctx.beginPath()
    ctx.roundRect(topX + brandWidth + 14, topY + 3, 130, 26, 6)
    ctx.fill()
    ctx.fillStyle = colors.accent
    ctx.font = '700 11px "Inter", monospace, sans-serif'
    ctx.fillText('MONAD PERP', topX + brandWidth + 26, topY + 20)

    // Divider line between logo and user
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.moveTo(topX + brandWidth + 160, topY + 4)
    ctx.lineTo(topX + brandWidth + 160, topY + 28)
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // Small User Avatar
    const avatarX = topX + brandWidth + 180
    ctx.fillStyle = colors.cardBg
    ctx.beginPath()
    ctx.arc(avatarX + 13, topY + 16, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = colors.accent
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Avatar Initial
    ctx.fillStyle = colors.text
    ctx.font = 'bold 12px "Inter", sans-serif'
    ctx.textAlign = 'center'
    const initialChar = username.replace('@', '').charAt(0).toUpperCase() || 'U'
    ctx.fillText(initialChar, avatarX + 13, topY + 20)
    ctx.textAlign = 'left'

    // Username
    ctx.fillStyle = colors.text
    ctx.font = '600 16px "Inter", -apple-system, sans-serif'
    ctx.fillText(username, avatarX + 38, topY + 22)

    // --- LEFT / CENTER: "PROFIT & LOSS" + VERY LARGE BOLD PNL NUMBER ---
    const contentY = 220

    // Label: "PROFIT & LOSS"
    ctx.fillStyle = colors.muted
    ctx.font = '700 14px "Inter", -apple-system, sans-serif'
    // Tracked letter spacing
    ctx.letterSpacing = '3px'
    ctx.fillText('PROFIT & LOSS', topX, contentY)
    ctx.letterSpacing = '0px'

    // Massive Bold PNL Number
    const pnlY = contentY + 110
    ctx.fillStyle = colors.accent
    ctx.font = '900 112px "Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(pnlValue, topX - 4, pnlY)

    // Position / Trade Tag (if available)
    let tagY = pnlY + 42
    if (position) {
      const tagText = `${position.symbol} PERPETUAL · ${position.leverage || 10}X ${position.side.toUpperCase()}`
      ctx.fillStyle = colors.cardBg
      const tagW = ctx.measureText(tagText).width * 0.22 + 40
      ctx.beginPath()
      ctx.roundRect(topX, tagY - 20, Math.max(tagW, 200), 30, 6)
      ctx.fill()

      ctx.fillStyle = isWin ? colors.accent : colors.muted
      ctx.font = '700 12px "Inter", monospace, sans-serif'
      ctx.fillText(tagText, topX + 12, tagY)
      tagY += 40
    }

    // Date Range under the number
    ctx.fillStyle = colors.muted
    ctx.font = '500 17px "Inter", -apple-system, sans-serif'
    ctx.fillText(dateRange, topX, tagY + 12)

    // --- BOTTOM LEFT: Referral Code (optional) ---
    const bottomY = 595
    if (showReferral && referralCode.trim()) {
      ctx.fillStyle = colors.muted
      ctx.font = '600 13px "Inter", monospace, sans-serif'
      ctx.letterSpacing = '1.5px'
      ctx.fillText('REF CODE:', topX, bottomY)
      ctx.letterSpacing = '0px'

      ctx.fillStyle = colors.text
      ctx.font = '800 15px "Inter", monospace, sans-serif'
      ctx.fillText(referralCode.toUpperCase(), topX + 85, bottomY)

      ctx.fillStyle = colors.muted
      ctx.font = '400 12px "Inter", sans-serif'
      ctx.fillText('gentryworld.up.railway.app', topX, bottomY + 22)
    }

    // --- RIGHT SIDE: Character Illustration (Clean, High-Quality Vector) ---
    const charSvg = getCharacterSvg({ id: character, accent: colors.accent, isWin })
    const img = new Image()
    const svgBlob = new Blob([charSvg], { type: 'image/svg+xml;charset=utf-8' })
    const URL = window.URL || window.webkitURL || window
    const blobURL = URL.createObjectURL(svgBlob)

    img.onload = () => {
      // Draw character cleanly on the right half with strong negative space
      const charW = 490
      const charH = 600
      const charX = width - charW - 40
      const charY = height - charH
      ctx.drawImage(img, charX, charY, charW, charH)
      URL.revokeObjectURL(blobURL)
    }
    img.src = blobURL
  }, [character, isWin, valueMode, pnlValue, username, dateRange, referralCode, showReferral, colors, position])

  // Download High-Res PNG
  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setDownloading(true)
    try {
      const link = document.createElement('a')
      link.download = `gentry-pnl-${Date.now()}.png`
      link.href = canvas.toDataURL('image/png', 1.0)
      link.click()
    } finally {
      setDownloading(false)
    }
  }

  // Copy Image to Clipboard
  const handleCopyImage = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      }, 'image/png')
    } catch {
      // Fallback
      setCopied(false)
    }
  }

  // Share to X / Twitter
  const handleShareTwitter = () => {
    const text = `Just recorded ${pnlValue} on my ${position?.symbol || 'Crypto'} perpetual position using @GentrY on Monad Testnet!\n\nRef: ${referralCode}\nhttps://gentryworld.up.railway.app`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal pnl-card-modal-container" role="dialog" aria-modal="true" style={{ maxWidth: 880, width: '96vw' }}>
        <button className="close-button" aria-label="Close" onClick={onClose}>
          <X size={19} />
        </button>

        <span className="modal-kicker">SHAREABLE CARD · HIGH RESOLUTION</span>
        <h2 style={{ margin: '4px 0 12px' }}>Profit & Loss Card</h2>

        {/* Live Canvas Preview */}
        <div className="pnl-canvas-wrapper" style={{
          background: '#05070a',
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          position: 'relative',
          marginBottom: 16
        }}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              aspectRatio: '1200 / 675'
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <button
            type="button"
            className="primary-button"
            style={{ flex: 1, minWidth: 150, justifyContent: 'center' }}
            disabled={downloading}
            onClick={handleDownload}
          >
            <Download size={15} style={{ marginRight: 6 }} /> Download PNG (1200x675)
          </button>
          <button
            type="button"
            className="secondary-button"
            style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}
            onClick={() => void handleCopyImage()}
          >
            {copied ? <><Check size={15} style={{ color: '#10b981', marginRight: 6 }} /> Copied to Clipboard!</> : <><Copy size={15} style={{ marginRight: 6 }} /> Copy Image</>}
          </button>
          <button
            type="button"
            className="secondary-button"
            style={{ minWidth: 130, justifyContent: 'center' }}
            onClick={handleShareTwitter}
          >
            <Share2 size={15} style={{ marginRight: 6 }} /> Share to X
          </button>
        </div>

        {/* Customization Tray */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {/* Row 1: Character Selector + Outcome Toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Character Illustration
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {CHARACTER_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`vault-tab-btn ${character === c.id ? 'active' : ''}`}
                    style={{ fontSize: 11, padding: '7px 4px', textAlign: 'center', justifyContent: 'center' }}
                    onClick={() => setCharacter(c.id)}
                  >
                    {c.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Outcome Pose
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                <button
                  type="button"
                  className={`vault-tab-btn ${isWin ? 'active' : ''}`}
                  style={{
                    fontSize: 12,
                    padding: '7px 8px',
                    justifyContent: 'center',
                    background: isWin ? '#10b981' : undefined,
                    color: isWin ? '#ffffff' : undefined
                  }}
                  onClick={() => toggleWinState(true)}
                >
                  Win / Victory
                </button>
                <button
                  type="button"
                  className={`vault-tab-btn ${!isWin ? 'active' : ''}`}
                  style={{
                    fontSize: 12,
                    padding: '7px 8px',
                    justifyContent: 'center',
                    background: !isWin ? '#ef4444' : undefined,
                    color: !isWin ? '#ffffff' : undefined
                  }}
                  onClick={() => toggleWinState(false)}
                >
                  Loss / Resilient
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Editable Inputs (Username, PnL Value, Date Range, Referral) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="@username"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                  PNL Number
                </label>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button
                    type="button"
                    style={{
                      background: valueMode === 'roe' ? 'var(--accent)' : 'transparent',
                      color: valueMode === 'roe' ? '#ffffff' : 'var(--muted)',
                      border: '1px solid var(--line)',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setValueMode('roe')
                      const num = Math.abs(parseFloat(pnlValue.replace(/[^0-9.]/g, '')) || 0)
                      setPnlValue(isWin ? `+${num.toFixed(2)}%` : `-${num.toFixed(2)}%`)
                    }}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    style={{
                      background: valueMode === 'usd' ? 'var(--accent)' : 'transparent',
                      color: valueMode === 'usd' ? '#ffffff' : 'var(--muted)',
                      border: '1px solid var(--line)',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setValueMode('usd')
                      const num = Math.abs(parseFloat(pnlValue.replace(/[^0-9.]/g, '')) || 0)
                      setPnlValue(isWin ? `+$${num.toFixed(2)}` : `-$${num.toFixed(2)}`)
                    }}
                  >
                    $
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={pnlValue}
                onChange={(e) => setPnlValue(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)', fontWeight: 700 }}
                placeholder="+150.00%"
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Date Range
              </label>
              <input
                type="text"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Oct 10 – Oct 17, 2026"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Referral Code</label>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', padding: 0 }}
                  onClick={() => setShowReferral(!showReferral)}
                >
                  {showReferral ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type="text"
                value={referralCode}
                disabled={!showReferral}
                onChange={(e) => setReferralCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  opacity: showReferral ? 1 : 0.5
                }}
                placeholder="GENTRY"
              />
            </div>
          </div>

          {/* Row 3: Coherent Theme Presets + Color Overrides */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Color Themes
              </label>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setShowColorPicker(!showColorPicker)}
              >
                <Palette size={13} /> {showColorPicker ? 'Hide Custom Colors' : 'Custom Colors'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
              {COLOR_THEMES.map((th, idx) => (
                <button
                  key={th.name}
                  type="button"
                  onClick={() => selectTheme(idx)}
                  style={{
                    background: th.bg,
                    border: `1.5px solid ${selectedThemeIdx === idx ? th.accent : 'var(--line)'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: th.accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: th.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {th.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Color Overrides Drawer */}
            {showColorPicker && (
              <div style={{
                marginTop: 12,
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 10,
                border: '1px solid var(--line)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10
              }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Background</label>
                  <input
                    type="color"
                    value={colors.bg}
                    onChange={(e) => setColors({ ...colors, bg: e.target.value })}
                    style={{ width: '100%', height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Accent / Highlight</label>
                  <input
                    type="color"
                    value={colors.accent}
                    onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                    style={{ width: '100%', height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Main Text</label>
                  <input
                    type="color"
                    value={colors.text}
                    onChange={(e) => setColors({ ...colors, text: e.target.value })}
                    style={{ width: '100%', height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Secondary / Muted</label>
                  <input
                    type="color"
                    value={colors.muted}
                    onChange={(e) => setColors({ ...colors, muted: e.target.value })}
                    style={{ width: '100%', height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
