import fs from 'node:fs'
import solc from 'solc'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const source = fs.readFileSync(new URL('../contracts/GentryManagedVault.sol', import.meta.url), 'utf8')
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'GentryManagedVault.sol': { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })))
if (compiled.errors?.some((item) => item.severity === 'error')) throw new Error(compiled.errors.map((item) => item.formattedMessage).join('\n'))
const artifact = compiled.contracts['GentryManagedVault.sol'].GentryManagedVault
const rawKey = String(process.env.KEEPER_PRIVATE_KEY || '').trim().replace(/^['"]|['"]$/g, '')
const key = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
if (!/^0x[\da-fA-F]{64}$/.test(key)) throw new Error('KEEPER_PRIVATE_KEY must be a 32-byte EVM private key.')
const account = privateKeyToAccount(key)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } }
const transport = http('https://testnet-rpc.monad.xyz')
const client = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })
// Perpl's official Monad Testnet collateral token. Floorline's AUSD vault is
// mainnet-specific; Kuru's test USDC is not accepted by Perpl's Testnet DEX.
const usdc = '0xdf5b718d8fcc173335185a2a1513ee8151e3c027'
const perpl = '0x1964C32f0bE608E7D29302AFF5E61268E72080cc'
const gasPrice = await client.getGasPrice()
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [usdc, perpl, account.address, account.address],
  gas: 4_000_000n,
  gasPrice,
})
const receipt = await client.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Vault deployment failed: ${hash}`)
console.log(JSON.stringify({ vaultAddress: receipt.contractAddress, transactionHash: hash, keeperAddress: account.address }))
