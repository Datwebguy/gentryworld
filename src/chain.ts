import { createPublicClient, createWalletClient, custom, http, parseAbi, type Address, type Hex } from 'viem'

export const chainId = 10143
export const identityAddress = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address
export const reputationAddress = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as Address
export const usdcAddress = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address

export const identityAbi = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function register(string agentURI) returns (uint256 agentId)',
  'function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256 agentId)',
])

export const reputationAbi = parseAbi([
  'function getClients(uint256 agentId) view returns (address[])',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
])

export const publicClient = createPublicClient({
  chain: {
    id: chainId, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['/api/rpc'] } },
  },
  transport: http('/api/rpc', { retryCount: 5, retryDelay: 1_000 }),
})

export type Agent = {
  id: bigint
  uri: string
  owner?: Address
  card: Record<string, any> | null
  summary?: { count: bigint; value: bigint; decimals: number }
}

const resolveUri = (uri: string) => {
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`
  if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice(5)}`
  return uri
}

async function metadata(uri: string): Promise<Record<string, any> | null> {
  try {
    const response = await fetch(resolveUri(uri), { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const value = await response.json()
    return value && typeof value === 'object' ? value : null
  } catch { return null }
}

export async function loadAgents(onProgress?: (count: number) => void): Promise<Agent[]> {
  try {
    const response = await fetch('/api/agents', { signal: AbortSignal.timeout(12_000) })
    if (response.ok) {
      const payload = await response.json()
      if (Array.isArray(payload.agents)) {
        const indexed = payload.agents.map((row: any): Agent => ({
          ...row,
          id: BigInt(row.id),
          summary: row.summary ? {
            count: BigInt(row.summary.count),
            value: BigInt(row.summary.value),
            decimals: Number(row.summary.decimals),
          } : undefined,
        }))
        onProgress?.(indexed.length)
        return indexed
      }
    }
  } catch { /* Fall back to direct registry reads if the index is unavailable. */ }

  async function ownerOfIfRegistered(agentId: bigint): Promise<Address | null> {
    try {
      return await publicClient.readContract({ address: identityAddress, abi: identityAbi, functionName: 'ownerOf', args: [agentId] })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : String(cause).toLowerCase()
      if (message.includes('revert') || message.includes('nonexistenttoken') || message.includes('invalid token')) return null
      throw cause
    }
  }

  // ERC-8004 assigns token IDs sequentially from zero. Probe the live registry
  // to find the last minted ID, then read each current URI and owner directly.
  if (!await ownerOfIfRegistered(0n)) return []
  let lastKnown = 0n
  let firstMissing = 1n
  while (await ownerOfIfRegistered(firstMissing)) {
    lastKnown = firstMissing
    firstMissing *= 2n
  }
  while (lastKnown + 1n < firstMissing) {
    const middle = (lastKnown + firstMissing) / 2n
    if (await ownerOfIfRegistered(middle)) lastKnown = middle
    else firstMissing = middle
  }

  const agents: Agent[] = []
  const latestCount = 12n
  const firstAgent = lastKnown + 1n > latestCount ? lastKnown + 1n - latestCount : 0n
  const batchSize = 3n
  for (let start = firstAgent; start <= lastKnown; start += batchSize) {
    const end = start + batchSize > lastKnown + 1n ? lastKnown + 1n : start + batchSize
    const ids = Array.from({ length: Number(end - start) }, (_, index) => start + BigInt(index))
    const base = await Promise.all(ids.map(async (id) => {
      const [uri, clients] = await Promise.all([
        publicClient.readContract({ address: identityAddress, abi: identityAbi, functionName: 'tokenURI', args: [id] }),
        publicClient.readContract({ address: reputationAddress, abi: reputationAbi, functionName: 'getClients', args: [id] }).catch(() => []),
      ])
      return { id, uri, clients }
    }))
    const batch = await Promise.all(base.map(async ({ id, uri, clients }) => {
      const agent: Agent = { id, uri, card: null }
      const card = uri ? await metadata(uri) : null
      agent.card = card
      const summary = clients.length
        ? await publicClient.readContract({ address: reputationAddress, abi: reputationAbi, functionName: 'getSummary', args: [id, clients, '', ''] }).catch(() => null)
        : null
      if (summary && summary[0] > 0n) agent.summary = { count: summary[0], value: summary[1], decimals: summary[2] }
      return agent
    }))
    agents.push(...batch)
    onProgress?.(Number(end - firstAgent))
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return agents.filter((agent) => agent.card && typeof agent.card.name === 'string')
}

declare global {
  interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> } }
}

export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<any> }

export async function connectWallet(provider?: Eip1193Provider | null, knownAddress?: string) {
  const walletProvider = provider || window.ethereum
  if (!walletProvider) throw new Error('Connect a wallet to continue.')
  const accounts = (knownAddress ? [knownAddress] : await walletProvider.request({ method: 'eth_requestAccounts' })) as Address[]
  if (!accounts[0]) throw new Error('No wallet account was found.')
  const currentChain = await walletProvider.request({ method: 'eth_chainId' }) as string
  if (Number(currentChain) !== chainId) {
    try {
      await walletProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] })
    } catch (error) {
      if ((error as { code?: number })?.code !== 4902) throw error
      await walletProvider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: '0x279f', chainName: 'Monad Testnet',
        nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
        rpcUrls: ['https://testnet-rpc.monad.xyz'], blockExplorerUrls: ['https://testnet.monadscan.com'],
      }] })
    }
  }
  const wallet = createWalletClient({ chain: {
    id: chainId, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  }, transport: custom(walletProvider as any) })
  return { address: accounts[0], wallet }
}

export async function submitFeedback(agent: Agent, rating: number, endpoint: string, provider?: Eip1193Provider | null, knownAddress?: string) {
  const { address, wallet } = await connectWallet(provider, knownAddress)
  if (agent.owner && agent.owner.toLowerCase() === address.toLowerCase()) {
    throw new Error('The agent owner cannot rate their own agent. Connect a different wallet to record feedback.')
  }
  const hash = await wallet.writeContract({
    address: reputationAddress, abi: reputationAbi, functionName: 'giveFeedback',
    args: [agent.id, BigInt(rating), 0, 'hire', 'completed', endpoint, '', `0x${'0'.repeat(64)}` as Hex],
    account: address,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

export async function registerAgent(uri: string, provider?: Eip1193Provider | null, knownAddress?: string) {
  const { address, wallet } = await connectWallet(provider, knownAddress)
  const hash = await wallet.writeContract({ address: identityAddress, abi: identityAbi, functionName: 'register', args: [uri], account: address })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}
