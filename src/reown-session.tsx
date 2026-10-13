import { useEffect, type ReactNode } from 'react'
import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { defineChain } from 'viem'
import { WalletContext, type Eip1193Provider } from './wallet'

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || ''
const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monadscan', url: 'https://testnet.monadscan.com' } },
  testnet: true,
})
const queryClient = new QueryClient()
const wagmiAdapter = new WagmiAdapter({ networks: [monadTestnet], projectId, ssr: true })
createAppKit({
  adapters: [wagmiAdapter],
  networks: [monadTestnet],
  projectId,
  metadata: {
    name: 'GentrY',
    description: 'Financial agents, working for you.',
    url: window.location.origin,
    icons: [`${window.location.origin}/favicon.svg`],
  },
  features: { analytics: false },
})

function ConnectedSession({ children, activate }: { children: ReactNode; activate: boolean }) {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<Eip1193Provider>('eip155')
  useEffect(() => { if (activate) void open() }, [activate, open])
  return <WalletContext.Provider value={{ address: isConnected ? address : undefined, provider: walletProvider, ready: true, openWallet: async () => { await open() } }}>{children}</WalletContext.Provider>
}

export function ReownSession({ children, activate }: { children: ReactNode; activate: boolean }) {
  return <WagmiProvider config={wagmiAdapter.wagmiConfig}><QueryClientProvider client={queryClient}><ConnectedSession activate={activate}>{children}</ConnectedSession></QueryClientProvider></WagmiProvider>
}
