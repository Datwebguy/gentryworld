import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const rawKey = String(process.env.KEEPER_PRIVATE_KEY || '').trim().replace(/^['"]|['"]$/g, '')
const key = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
if (!/^0x[\da-fA-F]{64}$/.test(key)) throw new Error('KEEPER_PRIVATE_KEY must be a 32-byte EVM private key.')
const vault = process.env.VAULT_ADDRESS
if (!/^0x[\da-fA-F]{40}$/.test(vault || '')) throw new Error('VAULT_ADDRESS is not configured.')
const account = privateKeyToAccount(key)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } }
const transport = http('https://testnet-rpc.monad.xyz')
const client = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })
const abi = [{ type: 'function', name: 'setMaxHedgeLots', stateMutability: 'nonpayable', inputs: [{ name: 'marketId', type: 'uint256' }, { name: 'lots', type: 'uint256' }], outputs: [] }]

// Caps are raw Perpl lot units and deliberately small for Testnet demonstrations.
const caps = [[16n, 100n], [32n, 10n], [48n, 100n], [64n, 500n]]
const transactions = []
for (const [marketId, lots] of caps) {
  const hash = await wallet.writeContract({ address: vault, abi, functionName: 'setMaxHedgeLots', args: [marketId, lots] })
  await client.waitForTransactionReceipt({ hash })
  transactions.push(hash)
}
console.log(JSON.stringify({ vault, caps: caps.map(([marketId, lots]) => ({ marketId: marketId.toString(), lots: lots.toString() })), transactions }))
