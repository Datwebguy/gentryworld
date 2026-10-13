import 'dotenv/config'

const apiKey = process.env.ALCHEMY_API_KEY
const rpcUrl = process.env.ALCHEMY_RPC_URL

if (!apiKey || !rpcUrl) {
  console.error('Set ALCHEMY_API_KEY and ALCHEMY_RPC_URL in your environment.')
  process.exit(1)
}

const response = await fetch(`${rpcUrl}/${apiKey}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getLogs',
    params: [{ fromBlock: 'latest', toBlock: 'latest' }],
  }),
})

const payload = await response.json()
if (!response.ok || payload.error) {
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(payload, null, 2))
