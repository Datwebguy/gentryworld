import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PrivyProvider, useConnectOrCreateWallet, usePrivy, useSignTypedData, useWallets, type ConnectedWallet } from '@privy-io/react-auth'
import { defineChain } from 'viem'
import { WalletContext, type Eip1193Provider, type TypedDataRequest } from './wallet'

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
  const { signTypedData: signEmbeddedTypedData } = useSignTypedData()
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
  const signPaymentAuthorization = useCallback(async (data: TypedDataRequest) => {
    if (activeWallet?.walletClientType !== 'privy') throw new Error('Embedded wallet is not ready to sign.')
    const rawValue = data.message.value
    let amount = 'the listed amount'
    if ((typeof rawValue === 'string' && /^\d+$/.test(rawValue)) || typeof rawValue === 'bigint' || (typeof rawValue === 'number' && Number.isSafeInteger(rawValue) && rawValue >= 0)) {
      const units = BigInt(rawValue)
      const whole = units / 1_000_000n
      const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
      amount = fraction ? `${whole}.${fraction}` : String(whole)
    }
    const { signature } = await signEmbeddedTypedData(data as any, {
      address: activeWallet.address,
      uiOptions: {
        title: 'Confirm agent payment',
        description: `Authorize ${amount} USDC for this request on Monad Testnet. The payment settles after approval; signing itself does not charge gas.`,
        buttonText: 'Authorize payment',
        isCancellable: true,
      },
    })
    return signature
  }, [activeWallet, signEmbeddedTypedData])
  const session = useMemo(() => ({
    address: authenticated && provider ? activeWallet?.address : undefined,
    provider,
    ready: ready && walletsReady,
    authenticated,
    identity,
    signTypedData: activeWallet?.walletClientType === 'privy' ? signPaymentAuthorization : undefined,
    openWallet: connectOrCreateWallet,
    logout,
  }), [activeWallet, authenticated, connectOrCreateWallet, identity, logout, provider, ready, signPaymentAuthorization, walletsReady])

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
