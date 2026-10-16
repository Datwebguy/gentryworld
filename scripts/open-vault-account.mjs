import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
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
const vaultAbi = [
  { type: 'function', name: 'perplAccountId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'openPerplAccount', stateMutability: 'nonpayable', inputs: [{ name: 'collateral', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
]

const existing = await client.readContract({ address: vault, abi: vaultAbi, functionName: 'perplAccountId' })
if (existing !== 0n) {
  console.log(JSON.stringify({ vault, perplAccountId: existing.toString(), status: 'already-open' }))
  process.exit(0)
}

const collateral = parseUnits('100', 6)
const hash = await wallet.writeContract({ address: vault, abi: vaultAbi, functionName: 'openPerplAccount', args: [collateral] })
await client.waitForTransactionReceipt({ hash })
const perplAccountId = await client.readContract({ address: vault, abi: vaultAbi, functionName: 'perplAccountId' })
if (perplAccountId === 0n) throw new Error('Perpl account creation completed without an account ID.')
console.log(JSON.stringify({ accountOpening: hash, vault, perplAccountId: perplAccountId.toString(), collateral: '100 AUSD' }))
