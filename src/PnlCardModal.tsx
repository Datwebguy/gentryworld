import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, Download, Twitter, X } from 'lucide-react'
import type { VaultPosition } from './PerplTrader'

interface PnlCardModalProps {
  position: VaultPosition
  walletAddress?: string
  onClose: () => void
}

export function PnlCardModal({ position, walletAddress, onClose }: PnlCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const isLong = position.side === 'long'
  const isClosed = position.status === 'closed'
  const pnl = Number(isClosed ? (position.realizedPnl ?? position.unrealizedPnl ?? 0) : (position.unrealizedPnl ?? 0))
  const roe = Number(isClosed ? (position.realizedRoePct ?? position.roePct ?? position.pnlPct ?? 0) : (position.roePct ?? position.pnlPct ?? 0))
  const isProfit = roe >= 0
  const leverage = position.leverage || 10
  const entryPrice = Number(position.entryPrice || 0)
  const currentPrice = Number(isClosed ? (position.closePrice || position.currentMark || entryPrice) : (position.currentMark || entryPrice))

  // Render high-res 1200x675 card onto HTML5 canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = 1200
    const height = 675
    canvas.width = width
    canvas.height = height

    // 1. Dark futuristic background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height)
    bgGradient.addColorStop(0, '#090d16')
    bgGradient.addColorStop(0.5, '#0d1322')
    bgGradient.addColorStop(1, '#05070c')
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    // 2. Radial glow accent (green for profit, red for loss)
    const glowColor = isProfit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'
    const radial = ctx.createRadialGradient(width * 0.8, height * 0.3, 10, width * 0.8, height * 0.3, 500)
    radial.addColorStop(0, glowColor)
    radial.addColorStop(1, 'transparent')
    ctx.fillStyle = radial
    ctx.fillRect(0, 0, width, height)

    // Subtle Monad purple ambient glow on top left
    const purpleGlow = ctx.createRadialGradient(150, 150, 10, 150, 150, 400)
    purpleGlow.addColorStop(0, 'rgba(131, 56, 236, 0.12)')
    purpleGlow.addColorStop(1, 'transparent')
    ctx.fillStyle = purpleGlow
    ctx.fillRect(0, 0, width, height)

    // 3. Grid lines / subtle tech pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
    ctx.lineWidth = 1
    for (let x = 60; x < width; x += 60) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 60; y < height; y += 60) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // 4. Outer border with rounded rectangle
    ctx.strokeStyle = isProfit ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
    ctx.lineWidth = 2
    ctx.strokeRect(30, 30, width - 60, height - 60)

    // Corner accents
    const accentLen = 40
    ctx.strokeStyle = isProfit ? '#10b981' : '#ef4444'
    ctx.lineWidth = 4
    // Top-left
    ctx.beginPath(); ctx.moveTo(30, 30 + accentLen); ctx.lineTo(30, 30); ctx.lineTo(30 + accentLen, 30); ctx.stroke()
    // Top-right
    ctx.beginPath(); ctx.moveTo(width - 30 - accentLen, 30); ctx.lineTo(width - 30, 30); ctx.lineTo(width - 30, 30 + accentLen); ctx.stroke()
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(30, height - 30 - accentLen); ctx.lineTo(30, height - 30); ctx.lineTo(30 + accentLen, height - 30); ctx.stroke()
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(width - 30 - accentLen, height - 30); ctx.lineTo(width - 30, height - 30); ctx.lineTo(width - 30, height - 30 - accentLen); ctx.stroke()

    // 5. Header: Logo & Branding
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 36px "Inter", "Segoe UI", sans-serif'
    ctx.fillText('GentrY', 70, 95)

    ctx.fillStyle = '#8338ec'
    ctx.font = 'bold 18px "Inter", "Segoe UI", sans-serif'
    ctx.fillText('MONAD TESTNET · PERPL PERP DEX', 210, 93)

    // Side Badge & Leverage Badge
    const badgeX = 70
    const badgeY = 145
    const badgeColor = isLong ? '#10b981' : '#ef4444'
    const badgeBg = isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'

    // Side Pill
    ctx.fillStyle = badgeBg
    ctx.fillRect(badgeX, badgeY, 130, 42)
    ctx.strokeStyle = badgeColor
    ctx.lineWidth = 1.5
    ctx.strokeRect(badgeX, badgeY, 130, 42)

    ctx.fillStyle = badgeColor
    ctx.font = 'bold 20px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(`${position.side.toUpperCase()} ${leverage}X`, badgeX + 16, badgeY + 28)

    // Symbol Header
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 34px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(`${position.symbol} / AUSD Perpetual`, badgeX + 155, badgeY + 31)

    // Status pill (Open / Closed)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    const statusText = isClosed ? 'REALIZED' : 'LIVE POSITION'
    const statusW = ctx.measureText(statusText).width + 30
    ctx.fillRect(width - 70 - statusW, badgeY, statusW, 42)
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '600 16px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(statusText, width - 70 - statusW + 15, badgeY + 27)

    // 6. Hero ROE Section
    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 22px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(isClosed ? 'REALIZED ROE' : 'UNREALIZED ROE', 70, 240)

    const roeSign = roe >= 0 ? '+' : ''
    const roeText = `${roeSign}${roe.toFixed(2)}%`
    ctx.fillStyle = isProfit ? '#10b981' : '#ef4444'
    ctx.font = '900 96px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(roeText, 70, 340)

    // PnL in USD
    const pnlSign = pnl >= 0 ? '+' : ''
    const pnlText = `(${pnlSign}$${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD)`
    ctx.fillStyle = isProfit ? '#34d399' : '#f87171'
    ctx.font = 'bold 32px "Inter", "Segoe UI", sans-serif'
    const roeWidth = ctx.measureText(roeText).width
    ctx.fillText(pnlText, 70 + roeWidth + 30, 335)

    // 7. Metrics Grid (Cards)
    const metricsY = 390
    const cardWidth = 320
    const cardHeight = 110
    const gap = 30

    // Metric 1: Entry Price
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(70, metricsY, cardWidth, cardHeight)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.strokeRect(70, metricsY, cardWidth, cardHeight)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '16px "Inter", "Segoe UI", sans-serif'
    ctx.fillText('ENTRY PRICE', 90, metricsY + 38)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(`$${entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}`, 90, metricsY + 80)

    // Metric 2: Mark / Close Price
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(70 + cardWidth + gap, metricsY, cardWidth, cardHeight)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.strokeRect(70 + cardWidth + gap, metricsY, cardWidth, cardHeight)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '16px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(isClosed ? 'CLOSE PRICE' : 'LAST MARK PRICE', 90 + cardWidth + gap, metricsY + 38)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(`$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}`, 90 + cardWidth + gap, metricsY + 80)

    // Metric 3: Position Size
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(70 + (cardWidth + gap) * 2, metricsY, cardWidth, cardHeight)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.strokeRect(70 + (cardWidth + gap) * 2, metricsY, cardWidth, cardHeight)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '16px "Inter", "Segoe UI", sans-serif'
    ctx.fillText('POSITION SIZE', 90 + (cardWidth + gap) * 2, metricsY + 38)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px "Inter", "Segoe UI", sans-serif'
    ctx.fillText(`${Number(position.size || 0).toFixed(4)} ${position.symbol}`, 90 + (cardWidth + gap) * 2, metricsY + 80)

    // 8. Footer Bar
    const footerY = 545
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.beginPath()
    ctx.moveTo(70, footerY)
    ctx.lineTo(width - 70, footerY)
    ctx.stroke()

    ctx.fillStyle = '#64748b'
    ctx.font = '16px "Inter", "Segoe UI", sans-serif'
    const traderInfo = walletAddress ? `Trader: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} · AI-Vault` : 'AI-Managed Trading Vault'
    ctx.fillText(`${traderInfo} · Monad Testnet`, 70, footerY + 50)

    ctx.fillStyle = '#e2e8f0'
    ctx.font = '600 18px "Inter", "Segoe UI", sans-serif'
    ctx.fillText('https://gentryworld.up.railway.app', width - 410, footerY + 50)
  }, [position, isLong, isClosed, pnl, roe, isProfit, leverage, entryPrice, currentPrice, walletAddress])

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setDownloading(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `GentrY-${position.symbol}-${position.side}-${roe.toFixed(2)}pct-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      setTimeout(() => setDownloading(false), 800)
    }
  }

  const handleShareTwitter = () => {
    const text = isProfit
      ? `Locked in ${roe >= 0 ? '+' : ''}${roe.toFixed(2)}% on $${position.symbol} ${position.side.toUpperCase()} with @GentrYWorld on @monad_xyz Testnet! 🚀\n\nTrade AI-powered perps on Monad:`
      : `Trading $${position.symbol} ${position.side.toUpperCase()} on @GentrYWorld via @monad_xyz Testnet! ⚡\n\nCheck live perps & AI agents:`
    const url = 'https://gentryworld.up.railway.app'
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=Monad,GentrY,PerpDEX`
    window.open(tweetUrl, '_blank', 'noopener,noreferrer')
  }

  const handleCopyLink = async () => {
    const text = `GentrY PnL: ${position.symbol} ${position.side.toUpperCase()} ${leverage}x | ROE: ${roe >= 0 ? '+' : ''}${roe.toFixed(2)}% (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}) | Entry: $${entryPrice} -> Mark: $${currentPrice} | https://gentryworld.up.railway.app`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* Fallback */ }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal pnl-share-modal" role="dialog" aria-modal="true">
        <button className="close-button" onClick={onClose} aria-label="Close share card"><X size={19} /></button>
        <span className="modal-kicker">BYBIT / BINANCE STYLE · PNL CARD</span>
        <h2>Share Your {position.symbol} Position</h2>
        <p>Show off your trading performance. Download your high-resolution card or share directly to X (Twitter).</p>

        {/* Live Canvas Preview */}
        <div className="pnl-canvas-wrapper">
          <canvas ref={canvasRef} className="pnl-card-canvas" />
        </div>

        {/* Quick Actions */}
        <div className="pnl-modal-actions">
          <button className="primary-button share-action-btn" onClick={handleDownload} disabled={downloading}>
            <Download size={17} />
            {downloading ? 'Exporting image…' : 'Download Card Image'}
          </button>
          <button className="twitter-button share-action-btn" onClick={handleShareTwitter}>
            <Twitter size={17} />
            Share on X
          </button>
          <button className="secondary-button share-action-btn" onClick={handleCopyLink}>
            {copied ? <Check size={17} style={{ color: '#10b981' }} /> : <Copy size={17} />}
            {copied ? 'Copied PnL' : 'Copy Summary'}
          </button>
        </div>

        {position.transaction && (
          <div className="pnl-tx-proof-row">
            <span>Verified Monad Testnet Settlement:</span>
            <a href={`https://testnet.monadscan.com/tx/${position.transaction}`} target="_blank" rel="noreferrer">
              {position.transaction.slice(0, 10)}…{position.transaction.slice(-8)} <ArrowUpRight size={13} />
            </a>
          </div>
        )}
      </section>
    </div>
  )
}
