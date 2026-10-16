import fs from 'node:fs'
import solc from 'solc'
import { createPublicClient, createWalletClient, http, parseUnits, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import 'dotenv/config'

const rawKey = String(process.env.KEEPER_PRIVATE_KEY || '0x01442633cb57851cce1cb8ed6757d9e7cb7e4b58bd4c684d1dd4026abb1ab188').trim().replace(/^['"]|['"]$/g, '')
const key = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
const account = privateKeyToAccount(key)
const chain = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } }
const transport = http('https://testnet-rpc.monad.xyz')
const client = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })

console.log('Deployer / Keeper address:', account.address);

// 1. Compile contract
console.log('Compiling GentryManagedVault.sol...');
const source = fs.readFileSync(new URL('../contracts/GentryManagedVault.sol', import.meta.url), 'utf8')
const compiled = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { 'GentryManagedVault.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
})))
if (compiled.errors?.some((item) => item.severity === 'error')) throw new Error(compiled.errors.map((item) => item.formattedMessage).join('\n'))
const artifact = compiled.contracts['GentryManagedVault.sol'].GentryManagedVault

// 2. Resolve perpl and collateral
const perpl = '0x1964C32f0bE608E7D29302AFF5E61268E72080cc'
const usdc = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC' // AUSD collateral token for Perpl
const faucet = '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C'

// 3. Deploy
console.log('Deploying new GentryManagedVault...');
const gasPrice = await client.getGasPrice()
const deployHash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [usdc, perpl, account.address, account.address],
  gas: 4_500_000n,
  gasPrice,
})
console.log('Deploy tx hash:', deployHash)
const receipt = await client.waitForTransactionReceipt({ hash: deployHash })
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Vault deployment failed: ${deployHash}`)
const vaultAddress = receipt.contractAddress
console.log('New Vault Address deployed at:', vaultAddress)

// 4. Fund from faucet
console.log('Funding vault with AUSD from faucet...');
const faucetAbi = [{ type: 'function', name: 'requestFunds', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }], outputs: [] }]
const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
]
const claimHash = await wallet.writeContract({ address: faucet, abi: faucetAbi, functionName: 'requestFunds', args: [account.address] })
await client.waitForTransactionReceipt({ hash: claimHash })
const allocation = parseUnits('500', 6)
const transferHash = await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: 'transfer', args: [vaultAddress, allocation] })
await client.waitForTransactionReceipt({ hash: transferHash })
console.log('Transferred 500 AUSD to vault.')

// 5. Open Perpl Account
console.log('Opening Perpl account for vault...');
const vaultAbi = artifact.abi
const openCollateral = parseUnits('100', 6)
const openHash = await wallet.writeContract({ address: vaultAddress, abi: vaultAbi, functionName: 'openPerplAccount', args: [openCollateral] })
await client.waitForTransactionReceipt({ hash: openHash })
const perplAccountId = await client.readContract({ address: vaultAddress, abi: vaultAbi, functionName: 'perplAccountId' })
console.log('Perpl Account opened with ID:', perplAccountId.toString())

// 6. Configure lot caps
console.log('Setting risk caps for BTC, ETH, SOL, MON...');
const caps = [[16n, 100n], [32n, 10n], [48n, 100n], [64n, 500n]]
for (const [marketId, lots] of caps) {
  const capHash = await wallet.writeContract({ address: vaultAddress, abi: vaultAbi, functionName: 'setMaxHedgeLots', args: [marketId, lots] })
  await client.waitForTransactionReceipt({ hash: capHash })
}
console.log('All caps set successfully!')

console.log('SETUP COMPLETE! New Vault Address:', vaultAddress, 'Perpl Account:', perplAccountId.toString())
