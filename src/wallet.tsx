import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from 'react'

export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<any> }
type WalletSession = { address?: string; provider?: Eip1193Provider; ready: boolean; openWallet: () => void | Promise<void> }
export const WalletContext = createContext<WalletSession>({ ready: false, openWallet: () => undefined })
const ReownSession = lazy(() => import('./reown-session').then((module) => ({ default: module.ReownSession })))
const hasReownId = Boolean(import.meta.env.VITE_REOWN_PROJECT_ID)

export function useWalletSession() { return useContext(WalletContext) }

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const [showReown, setShowReown] = useState(false)
  const [injectedAddress, setInjectedAddress] = useState<string>()
  const injectedProvider = typeof window !== 'undefined' ? window.ethereum : undefined
  const openWallet = async () => {
    if (hasReownId) { setShowReown(true); return }
    if (injectedProvider) {
      const accounts = await injectedProvider.request({ method: 'eth_requestAccounts' }) as string[]
      setInjectedAddress(accounts[0])
    }
  }
  if (showReown) return <Suspense fallback={<>{children}</>}><ReownSession activate>{children}</ReownSession></Suspense>
  return <WalletContext.Provider value={{ address: injectedAddress, provider: injectedProvider, ready: hasReownId || Boolean(injectedProvider), openWallet }}>{children}</WalletContext.Provider>
}
