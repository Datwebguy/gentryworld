import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const rawKey = String(process.env.KEEPER_PRIVATE_KEY || '').trim().replace(/^['"]|['"]$/g, '')
const key = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
if (!/^0x[\da-fA-F]{64}$/.test(key)) throw new Error('KEEPER_PRIVATE_KEY must be a 32-byte EVM private key.')
const vault = process.env.VAULT_ADDRESS
if (!/^0x[\da-fA-F]{40}$/.test(vault || '')) throw new Error('VAULT_ADDRESS is not configured.')
const context = await fetch('https://testnet.perpl.xyz/api/v1/pub/context').then((response) => response.json())
const mon = context.markets?.find((market) => Number(market.id) === 64 && market.config?.is_open)
const limitPrice = BigInt(mon?.state?.orl || 0)
if (!limitPrice) throw new Error('MON market oracle price is unavailable.')
const account = privateKeyToAccount(key)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } }
const transport = http('https://testnet-rpc.monad.xyz')
const client = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })
const abi = [{ type: 'function', name: 'hedge', stateMutability: 'nonpayable', inputs: [{ name: 'marketId', type: 'uint256' }, { name: 'open', type: 'bool' }, { name: 'lots', type: 'uint256' }, { name: 'limitPrice', type: 'uint256' }], outputs: [] }]
const hash = await wallet.writeContract({ address: vault, abi, functionName: 'hedge', args: [64n, true, 1n, limitPrice] })
const receipt = await client.waitForTransactionReceipt({ hash })
console.log(JSON.stringify({ vault, market: 'MON', lots: '1', limitPrice: limitPrice.toString(), hash, status: receipt.status }))
