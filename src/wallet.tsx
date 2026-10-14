import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from 'react'

export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<any> }
type WalletSession = {
  address?: string
  provider?: Eip1193Provider
  ready: boolean
  authenticated: boolean
  identity?: string
  openWallet: () => void | Promise<void>
  logout: () => void | Promise<void>
}
export const WalletContext = createContext<WalletSession>({ ready: false, authenticated: false, openWallet: () => undefined, logout: () => undefined })
const appId = import.meta.env.VITE_PRIVY_APP_ID || ''
const PrivySession = lazy(() => import('./privy-session').then((module) => ({ default: module.PrivySession })))

export function useWalletSession() { return useContext(WalletContext) }

function InjectedWalletSession({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>()
  const provider = typeof window !== 'undefined' ? window.ethereum : undefined
  const openWallet = async () => {
    if (!provider) throw new Error('Wallet setup is in progress. Please try again shortly.')
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
    setAddress(accounts[0])
  }
  return <WalletContext.Provider value={{ address, provider, ready: Boolean(provider), authenticated: Boolean(address), openWallet, logout: () => setAddress(undefined) }}>{children}</WalletContext.Provider>
}

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  if (!appId) return <InjectedWalletSession>{children}</InjectedWalletSession>
  return <Suspense fallback={<WalletContext.Provider value={{ ready: false, authenticated: false, openWallet: () => undefined, logout: () => undefined }}>{children}</WalletContext.Provider>}><PrivySession appId={appId}>{children}</PrivySession></Suspense>
}
