import { useEffect, useRef, useState, useMemo } from 'react'
import { Check, Copy, Download, Palette, Share2, Sparkles, X } from 'lucide-react'
import type { VaultPosition } from './PerplTrader'
import { CHARACTER_OPTIONS, getCharacterImagePath, type CharacterId } from './pnl-characters'

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

  // Authentic position calculation: locked, NOT user-editable
  const roe = Number(
    position?.status === 'closed'
      ? (position.realizedRoePct ?? position.roePct ?? position.pnlPct ?? 0)
      : (position?.roePct ?? position?.pnlPct ?? 0)
  )
  const pnlUsd = Number(
    position?.status === 'closed'
      ? (position.realizedPnl ?? 0)
      : (position?.unrealizedPnl ?? 0)
  )
  const isWin = position ? (roe >= 0 || pnlUsd >= 0) : true

  // Mode: '%' ROE vs '$' USD
  const [valueMode, setValueMode] = useState<'roe' | 'usd'>('roe')

  // Compute authentic display PNL string
  const displayPnl = useMemo(() => {
    if (valueMode === 'usd') {
      const val = Math.abs(pnlUsd)
      return isWin ? `+$${val.toFixed(2)}` : `-$${val.toFixed(2)}`
    } else {
      const val = Math.abs(roe)
      return isWin ? `+${val.toFixed(2)}%` : `-${val.toFixed(2)}%`
    }
  }, [valueMode, roe, pnlUsd, isWin])

  // Compute authentic date range: locked, NOT user-editable
  const dateRange = useMemo(() => {
    const fmt = (ts: number | undefined) => {
      if (!ts) return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    if (position?.openedAt) {
      const openStr = fmt(position.openedAt)
      if (position.status === 'closed' && position.closedAt) {
        return `${openStr} – ${fmt(position.closedAt)}`
      }
      return `${openStr} · Live Trade`
    }
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }, [position])

  // Customization: Character and Username
  const [character, setCharacter] = useState<CharacterId>('bull')
  const [username, setUsername] = useState<string>(() => {
    if (walletAddress) {
      return `@${walletAddress.slice(0, 5)}...${walletAddress.slice(-3)}`
    }
    return '@trader'
  })

  // Color customization
  const initialThemeIdx = isWin ? 0 : 2
  const [selectedThemeIdx, setSelectedThemeIdx] = useState<number>(initialThemeIdx)
  const [colors, setColors] = useState<ColorTheme>(COLOR_THEMES[initialThemeIdx])
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false)

  const selectTheme = (idx: number) => {
    setSelectedThemeIdx(idx)
    setColors(COLOR_THEMES[idx])
  }

  // Render high-res PnL Card on Canvas
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

    // --- TOP LEFT: Logo + User Avatar + Username ---
    const topX = 72
    const topY = 64

    // GentrY Brand Mark
    ctx.fillStyle = colors.text
    ctx.font = '900 28px "Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('GentrY', topX, topY + 22)

    // Subtle Monad perp badge
    const brandWidth = ctx.measureText('GentrY').width
    ctx.fillStyle = colors.cardBg
    ctx.beginPath()
    ctx.roundRect(topX + brandWidth + 14, topY + 3, 134, 26, 6)
    ctx.fill()
    ctx.fillStyle = colors.accent
    ctx.font = '700 11px "Inter", monospace, sans-serif'
    ctx.fillText('MONAD PERP', topX + brandWidth + 26, topY + 20)

    // Divider line between logo and user
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.moveTo(topX + brandWidth + 164, topY + 4)
    ctx.lineTo(topX + brandWidth + 164, topY + 28)
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // Small User Avatar
    const avatarX = topX + brandWidth + 184
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
    const initialChar = username.replace('@', '').charAt(0).toUpperCase() || 'T'
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
    ctx.letterSpacing = '3px'
    ctx.fillText('PROFIT & LOSS', topX, contentY)
    ctx.letterSpacing = '0px'

    // Massive Bold PNL Number (Authentic, not editable)
    const pnlY = contentY + 110
    ctx.fillStyle = colors.accent
    ctx.font = '900 108px "Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(displayPnl, topX - 4, pnlY)

    // Position / Trade Tag (if available)
    let tagY = pnlY + 42
    if (position) {
      const tagText = `${position.symbol} PERPETUAL · ${position.leverage || 10}X ${position.side.toUpperCase()}`
      ctx.fillStyle = colors.cardBg
      const tagW = ctx.measureText(tagText).width * 0.22 + 40
      ctx.beginPath()
      ctx.roundRect(topX, tagY - 20, Math.max(tagW, 210), 32, 6)
      ctx.fill()

      ctx.fillStyle = isWin ? colors.accent : colors.muted
      ctx.font = '700 12px "Inter", monospace, sans-serif'
      ctx.fillText(tagText, topX + 14, tagY + 1)
      tagY += 44
    }

    // Date Range under the number (Authentic, not editable)
    ctx.fillStyle = colors.muted
    ctx.font = '500 17px "Inter", -apple-system, sans-serif'
    ctx.fillText(dateRange, topX, tagY + 12)

    // --- BOTTOM LEFT: Platform Branding (No Referral Code) ---
    const bottomY = 595
    ctx.fillStyle = colors.muted
    ctx.font = '600 13px "Inter", monospace, sans-serif'
    ctx.letterSpacing = '1px'
    ctx.fillText('GENTRY · PERPETUAL DEX', topX, bottomY)
    ctx.letterSpacing = '0px'

    ctx.fillStyle = colors.muted
    ctx.font = '400 12px "Inter", sans-serif'
    ctx.fillText('gentryworld.up.railway.app · Monad Testnet', topX, bottomY + 22)

    // --- RIGHT SIDE: High-Resolution 3D Character Illustration ---
    const imgPath = getCharacterImagePath(character, isWin)
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      // 3D Portrait dimensions on right side with strong negative space
      const charWidth = 510
      const charHeight = 560
      const charX = width - charWidth - 60
      const charY = (height - charHeight) / 2 + 10

      ctx.save()
      // Modern sleek rounded frame for the 3D character
      ctx.beginPath()
      ctx.roundRect(charX, charY, charWidth, charHeight, 24)
      ctx.clip()

      // Render 3D artwork
      ctx.drawImage(img, charX, charY, charWidth, charHeight)

      // Subtle atmospheric fade on the left edge to blend seamlessly into negative space
      const fadeGrad = ctx.createLinearGradient(charX, charY, charX + 140, charY)
      fadeGrad.addColorStop(0, colors.bg)
      fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = fadeGrad
      ctx.fillRect(charX, charY, 140, charHeight)

      // Soft top and bottom fade
      const topFade = ctx.createLinearGradient(charX, charY, charX, charY + 50)
      topFade.addColorStop(0, colors.bg + '66')
      topFade.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = topFade
      ctx.fillRect(charX, charY, charWidth, 50)

      ctx.restore()

      // Sleek subtle frame accent outline
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(charX, charY, charWidth, charHeight, 24)
      ctx.strokeStyle = colors.accent + '33'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }

    img.src = imgPath
  }, [character, isWin, valueMode, displayPnl, username, dateRange, colors, position])

  // Download High-Res PNG
  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setDownloading(true)
    try {
      const link = document.createElement('a')
      link.download = `gentry-pnl-${position?.symbol || 'perp'}-${Date.now()}.png`
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
      setCopied(false)
    }
  }

  // Share to X / Twitter with @gentryworld, @monad, and #signals link
  const handleShareTwitter = () => {
    const signalUrl = `${window.location.origin}${window.location.pathname}#signals`
    const symbol = position?.symbol ? `$${position.symbol}` : 'Crypto'
    const tweetText = isWin
      ? `Trading perpetuals on @gentryworld on @monad! 🚀 Locked in ${displayPnl} on ${symbol}.\n\nTrade onchain with real-time AI signals on GentrY:\n${signalUrl}`
      : `Managing risk on @gentryworld perpetuals on @monad 🛡️ Position result: ${displayPnl} on ${symbol}.\n\nFollow live crypto signals on GentrY:\n${signalUrl}`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank')
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal pnl-card-modal-container" role="dialog" aria-modal="true" style={{ maxWidth: 880, width: '96vw' }}>
        <button className="close-button" aria-label="Close" onClick={onClose}>
          <X size={19} />
        </button>

        <span className="modal-kicker">3D SHAREABLE CARD · SOCIAL READY</span>
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
            style={{ minWidth: 130, justifyContent: 'center', background: 'rgba(255, 255, 255, 0.08)', fontWeight: 600 }}
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
          {/* Row 1: 3D Character Selector + Outcome Indicator Badge */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                3D Character Render
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CHARACTER_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`vault-tab-btn ${character === c.id ? 'active' : ''}`}
                    style={{
                      fontSize: 12,
                      padding: '8px 6px',
                      textAlign: 'center',
                      justifyContent: 'center',
                      fontWeight: 600
                    }}
                    onClick={() => setCharacter(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Outcome Status (Locked)
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: isWin ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${isWin ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: isWin ? '#10b981' : '#ef4444',
                fontSize: 12,
                fontWeight: 700
              }}>
                <Sparkles size={14} />
                <span>{isWin ? 'VICTORY / PROFIT (3D Win Pose)' : 'RESILIENT / DEFENSIVE (3D Loss Pose)'}</span>
              </div>
            </div>
          </div>

          {/* Row 2: Username & PNL Unit Toggle (No Fake Inputs) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Username / Handle
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)'
                }}
                placeholder="@username"
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                PNL Unit Display
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: valueMode === 'roe' ? 'var(--accent)' : 'var(--surface)',
                    color: valueMode === 'roe' ? '#ffffff' : 'var(--muted)',
                    border: '1px solid var(--line)'
                  }}
                  onClick={() => setValueMode('roe')}
                >
                  % Percentage Return
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: valueMode === 'usd' ? 'var(--accent)' : 'var(--surface)',
                    color: valueMode === 'usd' ? '#ffffff' : 'var(--muted)',
                    border: '1px solid var(--line)'
                  }}
                  onClick={() => setValueMode('usd')}
                >
                  $ Dollar Amount
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Recorded Trade Date (Locked)
              </label>
              <div style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--line)',
                fontSize: 13,
                color: 'var(--text)',
                fontWeight: 600
              }}>
                {dateRange}
              </div>
            </div>
          </div>

          {/* Row 3: Coherent Color Theme Palette Selection */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Color Themes
              </label>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer'
                }}
                onClick={() => setShowColorPicker(!showColorPicker)}
              >
                <Palette size={12} /> {showColorPicker ? 'Hide Custom Colors' : 'Customize Colors'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              {COLOR_THEMES.map((t, idx) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => selectTheme(idx)}
                  style={{
                    background: t.cardBg,
                    border: `1px solid ${selectedThemeIdx === idx ? t.accent : 'var(--line)'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    boxShadow: selectedThemeIdx === idx ? `0 0 0 1px ${t.accent}` : 'none'
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Color Overrides Drawer */}
            {showColorPicker && (
              <div style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--line)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                gap: 10
              }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Accent</label>
                  <input
                    type="color"
                    value={colors.accent}
                    onChange={(e) => setColors((c) => ({ ...c, accent: e.target.value }))}
                    style={{ width: '100%', height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Background</label>
                  <input
                    type="color"
                    value={colors.bg}
                    onChange={(e) => setColors((c) => ({ ...c, bg: e.target.value }))}
                    style={{ width: '100%', height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Text</label>
                  <input
                    type="color"
                    value={colors.text}
                    onChange={(e) => setColors((c) => ({ ...c, text: e.target.value }))}
                    style={{ width: '100%', height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Card Fill</label>
                  <input
                    type="color"
                    value={colors.cardBg}
                    onChange={(e) => setColors((c) => ({ ...c, cardBg: e.target.value }))}
                    style={{ width: '100%', height: 30, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent' }}
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
