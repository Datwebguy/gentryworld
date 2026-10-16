import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'

dotenv.config()

const vault = '0x36838e1c1c091f18f8519104ee3c6d3aa5b7a660'
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } }
const client = createPublicClient({ chain, transport: http('https://testnet-rpc.monad.xyz') })
const rawKey = String(process.env.KEEPER_PRIVATE_KEY || '0x01442633cb57851cce1cb8ed6757d9e7cb7e4b58bd4c684d1dd4026abb1ab188').trim().replace(/^['"]|['"]$/g, '')
const key = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
const account = privateKeyToAccount(key)
const wallet = createWalletClient({ account, chain, transport: http('https://testnet-rpc.monad.xyz') })

const abi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'setMaxHedgeLots', stateMutability: 'nonpayable', inputs: [{ name: 'marketId', type: 'uint256' }, { name: 'lots', type: 'uint256' }], outputs: [] }
]

const owner = await client.readContract({ address: vault, abi, functionName: 'owner' })
console.log('Vault owner:', owner, 'Keeper address:', account.address)

const caps = [
  [16n, 10_000_000n], // BTC
  [32n, 10_000_000n], // ETH
  [48n, 10_000_000n], // SOL
  [64n, 100_000_000n] // MON
]

for (const [mkt, lots] of caps) {
  const hash = await wallet.writeContract({ address: vault, abi, functionName: 'setMaxHedgeLots', args: [mkt, lots] })
  console.log(`Market ${mkt} set to ${lots} lots. Tx: ${hash}`)
  await client.waitForTransactionReceipt({ hash })
}
console.log('Successfully set all onchain market caps to unrestricted high limits!')
