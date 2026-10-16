import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { parseUnits, formatUnits, maxUint256, type Address } from 'viem'
import { useWalletSession } from './wallet'
import { ausdAddress, managedVaultAddress, ausdAbi, vaultAbi, publicClient, connectWallet } from './chain'

export type UserVaultBalance = {
  address: string
  deposited: number
  withdrawn: number
  realizedPnl: number
  totalBalance: number
  lockedMargin: number
  availableBalance: number
  vaultAddress?: string
  openPositionsCount?: number
}

type Props = {
  initialTab?: 'deposit' | 'withdraw'
  walletAddress: string
  onClose: () => void
  onSuccess?: () => void
  onNotice: (message: string) => void
}

export function DepositWithdrawModal({ initialTab = 'deposit', walletAddress, onClose, onSuccess, onNotice }: Props) {
  const { provider: walletProvider } = useWalletSession()
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initialTab)
  const [amount, setAmount] = useState('')
  const [walletAusdRaw, setWalletAusdRaw] = useState<bigint>(0n)
  const [vaultBalance, setVaultBalance] = useState<UserVaultBalance | null>(null)
  const [allowance, setAllowance] = useState<bigint>(0n)
  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState(false)
  const [claimingFaucet, setClaimingFaucet] = useState(false)
  const [error, setError] = useState('')
  const [successTx, setSuccessTx] = useState<{ hash: string; type: 'deposit' | 'withdraw'; amount: number } | null>(null)

  const walletAusd = Number(formatUnits(walletAusdRaw, 6))

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return
    try {
      // 1. Read on-chain AUSD balance and allowance
      const [bal, allow] = await Promise.all([
        publicClient.readContract({
          address: ausdAddress,
          abi: ausdAbi,
          functionName: 'balanceOf',
          args: [walletAddress as Address]
        }).catch(() => 0n),
        publicClient.readContract({
          address: ausdAddress,
          abi: ausdAbi,
          functionName: 'allowance',
          args: [walletAddress as Address, managedVaultAddress]
        }).catch(() => 0n)
      ])
      setWalletAusdRaw(bal)
      setAllowance(allow)

      // 2. Fetch server-tracked vault balance
      const res = await fetch(`/api/vault/user-balance?address=${encodeURIComponent(walletAddress)}`)
      if (res.ok) {
        const data = await res.json()
        setVaultBalance(data)
      }
    } catch (err) {
      console.error('Failed to fetch deposit/withdraw balances:', err)
    }
  }, [walletAddress])

  useEffect(() => {
    void fetchBalances()
    const interval = setInterval(() => void fetchBalances(), 4000)
    return () => clearInterval(interval)
  }, [fetchBalances])

  async function claimFaucet() {
    if (!walletAddress) return
    setClaimingFaucet(true)
    setError('')
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      })
      if (res.ok) {
        onNotice('Claimed 500 AUSD from faucet to your wallet!')
        await fetchBalances()
      } else {
        const err = await res.json()
        setError(err.error || 'Could not claim test tokens.')
      }
    } catch {
      setError('Faucet claim request failed.')
    } finally {
      setClaimingFaucet(false)
    }
  }

  async function handleApprove() {
    if (!walletProvider || !walletAddress) return
    setApproving(true)
    setError('')
    try {
      const { wallet } = await connectWallet(walletProvider, walletAddress)
      const hash = await wallet.writeContract({
        address: ausdAddress,
        abi: ausdAbi,
        functionName: 'approve',
        args: [managedVaultAddress, maxUint256],
        account: walletAddress as Address
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setAllowance(maxUint256)
      onNotice('AUSD approved for vault deposits.')
    } catch (err) {
      console.error('Approval error:', err)
      setError(err instanceof Error ? err.message : 'Could not approve AUSD.')
    } finally {
      setApproving(false)
    }
  }

  async function handleDeposit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const num = Number(amount)
    if (!Number.isFinite(num) || num <= 0) {
      setError('Please enter a valid deposit amount.')
      return
    }
    if (num > walletAusd) {
      setError(`Insufficient wallet balance. You only have $${walletAusd.toFixed(2)} AUSD.`)
      return
    }
    if (!walletProvider || !walletAddress) {
      setError('Wallet provider is not ready.')
      return
    }

    const units = parseUnits(num.toFixed(6), 6)
    if (allowance < units) {
      await handleApprove()
      return
    }

    setBusy(true)
    try {
      const { wallet } = await connectWallet(walletProvider, walletAddress)
      const hash = await wallet.writeContract({
        address: managedVaultAddress,
        abi: vaultAbi,
        functionName: 'deposit',
        args: [units],
        account: walletAddress as Address
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Deposit transaction reverted on Monad Testnet.')

      // Notify backend to sync and credit ledger
      await fetch('/api/vault/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, txHash: hash })
      })

      setSuccessTx({ hash, type: 'deposit', amount: num })
      setAmount('')
      onNotice(`Deposited $${num.toFixed(2)} AUSD to your GentrY vault!`)
      await fetchBalances()
      onSuccess?.()
    } catch (err) {
      console.error('Deposit error:', err)
      setError(err instanceof Error ? err.message : 'Failed to deposit AUSD.')
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw(e: FormEvent) {
    e.preventDefault()
    setError('')
    const num = Number(amount)
    if (!Number.isFinite(num) || num <= 0) {
      setError('Please enter a valid withdrawal amount.')
      return
    }
    const avail = vaultBalance?.availableBalance ?? 0
    if (num > avail) {
      setError(`Withdrawal amount exceeds your available balance ($${avail.toFixed(2)}).`)
      return
    }
    if (!walletProvider || !walletAddress) {
      setError('Wallet provider is not ready.')
      return
    }

    setBusy(true)
    try {
      const nonce = crypto.randomUUID()
      const issuedAt = Date.now()
      const message = `GentrY Testnet vault withdrawal\nWallet: ${walletAddress.toLowerCase()}\nAmount: ${num}\nIssued at: ${issuedAt}\nNonce: ${nonce}`
      const signature = await walletProvider.request({
        method: 'personal_sign',
        params: [message, walletAddress]
      }) as string

      const res = await fetch('/api/vault/withdraw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: num, nonce, issuedAt, signature })
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Could not process withdrawal.')

      setSuccessTx({ hash: payload.transaction, type: 'withdraw', amount: num })
      setAmount('')
      onNotice(`Withdrew $${num.toFixed(2)} AUSD to your wallet on Monad Testnet!`)
      await fetchBalances()
      onSuccess?.()
    } catch (err) {
      console.error('Withdraw error:', err)
      setError(err instanceof Error ? err.message : 'Failed to withdraw AUSD.')
    } finally {
      setBusy(false)
    }
  }

  const numAmount = Number(amount || 0)
  const unitsAmount = Number.isFinite(numAmount) && numAmount > 0 ? parseUnits(numAmount.toFixed(6), 6) : 0n
  const needsApproval = tab === 'deposit' && unitsAmount > 0n && allowance < unitsAmount

  const applyPercent = (pct: number) => {
    if (tab === 'deposit') {
      const val = (walletAusd * (pct / 100))
      setAmount(val > 0 ? (pct === 100 ? walletAusd.toString() : val.toFixed(2)) : '')
    } else {
      const avail = vaultBalance?.availableBalance ?? 0
      const val = (avail * (pct / 100))
      setAmount(val > 0 ? (pct === 100 ? avail.toString() : val.toFixed(2)) : '')
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy && !approving) onClose() }}>
      <section className="modal perpl-trader-modal" role="dialog" aria-modal="true" style={{ maxWidth: 480 }}>
        <button className="close-button" aria-label="Close" disabled={busy || approving} onClick={onClose}>
          <X size={19} />
        </button>

        <span className="modal-kicker">GENTRY VAULT · MONAD TESTNET</span>
        <h2>Vault Collateral & Margin</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 16px' }}>
          Deposit AUSD from your personal wallet to trade with leverage. Withdraw your free balance and realized profits to your wallet at any time.
        </p>

        {/* Tab switch */}
        <div className="vault-positions-tabs" style={{ display: 'flex', width: '100%', marginBottom: 16 }}>
          <button
            type="button"
            className={`vault-tab-btn ${tab === 'deposit' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', justifyContent: 'center', padding: '10px 0' }}
            onClick={() => { setTab('deposit'); setAmount(''); setError(''); setSuccessTx(null) }}
          >
            <ArrowDownLeft size={16} style={{ marginRight: 6 }} /> Deposit AUSD
          </button>
          <button
            type="button"
            className={`vault-tab-btn ${tab === 'withdraw' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', justifyContent: 'center', padding: '10px 0' }}
            onClick={() => { setTab('withdraw'); setAmount(''); setError(''); setSuccessTx(null) }}
          >
            <ArrowUpRight size={16} style={{ marginRight: 6 }} /> Withdraw AUSD
          </button>
        </div>

        {/* Balance Breakdown Summary Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Wallet Balance
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              ${walletAusd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style={{ fontSize: 11, color: 'var(--muted)' }}>AUSD</small>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Vault Available Margin
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
              ${(vaultBalance?.availableBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style={{ fontSize: 11, color: 'var(--muted)' }}>AUSD</small>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Locked in Trades</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              ${(vaultBalance?.lockedMargin ?? 0).toFixed(2)} AUSD
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Realized PnL</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: (vaultBalance?.realizedPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(vaultBalance?.realizedPnl ?? 0) >= 0 ? '+' : ''}${(vaultBalance?.realizedPnl ?? 0).toFixed(2)} AUSD
            </div>
          </div>
        </div>

        {/* Success Alert */}
        {successTx && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10
          }}>
            <Check size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              <strong>
                {successTx.type === 'deposit' ? 'Deposit Confirmed' : 'Withdrawal Completed'}
              </strong>
              <p style={{ margin: '2px 0 6px', color: 'var(--muted)', fontSize: 12 }}>
                ${successTx.amount.toFixed(2)} AUSD was settled on Monad Testnet.
              </p>
              <a
                href={`https://testnet.monadscan.com/tx/${successTx.hash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
              >
                View on MonadScan <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
        )}

        {/* Deposit Form */}
        {tab === 'deposit' && (
          <form onSubmit={(e) => void handleDeposit(e)}>
            <div className="trade-fields">
              <label htmlFor="deposit-amount">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span>Deposit Amount</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Max: ${walletAusd.toFixed(2)}
                  </span>
                </div>
                <input
                  id="deposit-amount"
                  type="number"
                  min="0.01"
                  step="any"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <div className="trade-preset-pills" style={{ marginTop: 8 }}>
                  <button type="button" onClick={() => applyPercent(25)}>25%</button>
                  <button type="button" onClick={() => applyPercent(50)}>50%</button>
                  <button type="button" onClick={() => applyPercent(75)}>75%</button>
                  <button type="button" onClick={() => applyPercent(100)}>Max</button>
                </div>
              </label>
            </div>

            {walletAusd === 0 && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px dashed var(--line)',
                borderRadius: 12,
                padding: '12px 14px',
                margin: '12px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Need testnet funds to deposit?
                </div>
                <button
                  type="button"
                  className="faucet-claim-pill"
                  disabled={claimingFaucet}
                  onClick={() => void claimFaucet()}
                >
                  {claimingFaucet ? 'Claiming…' : '+ Claim 500 AUSD'}
                </button>
              </div>
            )}

            <div style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span>Transfers real AUSD on Monad Testnet into your GentrY vault shares.</span>
            </div>

            {needsApproval ? (
              <button
                type="button"
                className="primary-button wide"
                disabled={approving || busy}
                onClick={() => void handleApprove()}
              >
                {approving ? <><LoaderCircle className="spin" size={16} /> Approving AUSD…</> : 'Step 1: Approve AUSD'}
              </button>
            ) : (
              <button
                type="submit"
                className="primary-button wide"
                disabled={busy || approving || !Number(amount)}
              >
                {busy ? <><LoaderCircle className="spin" size={16} /> Depositing on Monad…</> : 'Deposit AUSD to Vault'}
              </button>
            )}
          </form>
        )}

        {/* Withdraw Form */}
        {tab === 'withdraw' && (
          <form onSubmit={(e) => void handleWithdraw(e)}>
            <div className="trade-fields">
              <label htmlFor="withdraw-amount">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span>Withdraw Amount</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Available: ${(vaultBalance?.availableBalance ?? 0).toFixed(2)}
                  </span>
                </div>
                <input
                  id="withdraw-amount"
                  type="number"
                  min="0.01"
                  step="any"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <div className="trade-preset-pills" style={{ marginTop: 8 }}>
                  <button type="button" onClick={() => applyPercent(25)}>25%</button>
                  <button type="button" onClick={() => applyPercent(50)}>50%</button>
                  <button type="button" onClick={() => applyPercent(75)}>75%</button>
                  <button type="button" onClick={() => applyPercent(100)}>Max</button>
                </div>
              </label>
            </div>

            <div style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span>Settles directly on Monad Testnet to your connected personal wallet.</span>
            </div>

            <button
              type="submit"
              className="primary-button wide"
              disabled={busy || !Number(amount) || Number(amount) > (vaultBalance?.availableBalance ?? 0)}
            >
              {busy ? <><LoaderCircle className="spin" size={16} /> Settling on Monad…</> : 'Sign & Withdraw AUSD'}
            </button>
          </form>
        )}

        {error && <div className="perpl-inline-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      </section>
    </div>
  )
}
