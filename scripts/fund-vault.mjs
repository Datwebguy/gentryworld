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
const ausd = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC'
const faucet = '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C'
const faucetAbi = [{ type: 'function', name: 'requestFunds', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }], outputs: [] }]
const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
]
const claim = await wallet.writeContract({ address: faucet, abi: faucetAbi, functionName: 'requestFunds', args: [account.address] })
await client.waitForTransactionReceipt({ hash: claim })
const available = await client.readContract({ address: ausd, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })
const allocation = parseUnits('500', 6)
if (available < allocation) throw new Error('Faucet claim did not provide enough AUSD.')
const transfer = await wallet.writeContract({ address: ausd, abi: erc20Abi, functionName: 'transfer', args: [vault, allocation] })
await client.waitForTransactionReceipt({ hash: transfer })
console.log(JSON.stringify({ faucetClaim: claim, vaultFunding: transfer, allocation: '500 AUSD', vault }))
