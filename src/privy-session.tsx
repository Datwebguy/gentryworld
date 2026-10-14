import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PrivyProvider, useConnectOrCreateWallet, usePrivy, useWallets, type ConnectedWallet } from '@privy-io/react-auth'
import { defineChain } from 'viem'
import { WalletContext, type Eip1193Provider } from './wallet'

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' } },
  testnet: true,
})

function PrivyWalletSession({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy()
  const { connectOrCreateWallet } = useConnectOrCreateWallet()
  const { ready: walletsReady, wallets } = useWallets()
  const [activeWallet, setActiveWallet] = useState<ConnectedWallet>()
  const [provider, setProvider] = useState<Eip1193Provider>()

  useEffect(() => {
    if (!walletsReady || !authenticated || wallets.length === 0) {
      setActiveWallet(undefined)
      setProvider(undefined)
      return
    }
    let cancelled = false
    const wallet = wallets.find((item) => item.walletClientType === 'privy' && item.linked) || wallets.find((item) => item.linked) || wallets[0]
    void wallet.getEthereumProvider().then((nextProvider) => {
      if (cancelled) return
      setActiveWallet(wallet)
      setProvider(nextProvider)
    }).catch(() => {
      if (!cancelled) { setActiveWallet(wallet); setProvider(undefined) }
    })
    return () => { cancelled = true }
  }, [authenticated, wallets, walletsReady])

  const identity = user?.email?.address || user?.phone?.number || user?.google?.email || user?.twitter?.username || undefined
  const session = useMemo(() => ({
    address: authenticated && provider ? activeWallet?.address : undefined,
    provider,
    ready: ready && walletsReady,
    authenticated,
    identity,
    openWallet: connectOrCreateWallet,
    logout,
  }), [activeWallet, authenticated, connectOrCreateWallet, identity, logout, provider, ready, walletsReady])

  return <WalletContext.Provider value={session}>{children}</WalletContext.Provider>
}

export function PrivySession({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: 'light', accentColor: '#5145e5', logo: 'https://gentryworld.up.railway.app/gentry-login.png' },
        loginMethods: ['email', 'google', 'wallet'],
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      }}
    >
      <PrivyWalletSession>{children}</PrivyWalletSession>
    </PrivyProvider>
  )
}
