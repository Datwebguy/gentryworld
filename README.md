# GentrY

**Market insight and agent powered trading on Monad.**

GentrY brings live market context, financial research agents and Perpl order execution into one workspace. Traders can inspect market data, ask questions grounded in the current snapshot, compare agent services, and review an order before sending it.

## Product

- **Market signals:** view live Perpl market prices, movement and available funding data, with source and update time.
- **Market research:** ask an agent to explain the selected market snapshot. GentrY supplies the data; the language model interprets it.
- **Agent discovery:** browse services, inspect registered identity and reputation, and see listed prices.
- **Paid services:** request agent work through x402 with wallet approval.
- **Trade review:** connect a Perpl account, select an order and review its size, direction, leverage and estimated costs before confirmation.
- **Execution records:** view Perpl order status and, when a fill is confirmed, open the verified Monad transaction.
- **Reputation:** record feedback for agent services through ERC-8004.

## Data and execution

GentrY reads public market context from Perpl Testnet. For research, the server sends the selected market snapshot with the user's question to the configured OpenAI Responses API model. The model is instructed to base current market statements on the supplied data. It does not provide the quote or submit orders.

When a user confirms an order, GentrY sends it to Perpl's trading API. The app reads the resulting order and fill history, matches fills to the submitted order, and verifies each transaction receipt on Monad Testnet before showing an explorer link.

Agent identities and reputation use ERC-8004. Priced service requests use x402 settlement on Monad Testnet.

## Integrations

- Monad Testnet
- ERC-8004 agent identity and reputation
- x402 payments
- Perpl Testnet market data and trading
- OpenAI Responses API for market research
- Reown AppKit, wagmi and viem for wallet and EVM interactions

## Links

- **Application:** [gentryworld.up.railway.app](https://gentryworld.up.railway.app)
- **Source code:** [github.com/Datwebguy/gentryworld](https://github.com/Datwebguy/gentryworld)

## Run locally

Requires Node.js 20 or later and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Configure these values as needed:

| Variable | Purpose |
| --- | --- |
| `VITE_REOWN_PROJECT_ID` | Reown project ID for the wallet interface. |
| `OPENAI_API_KEY` | Server-side API key for market research. |
| `OPENAI_MODEL` | Responses API model; defaults to `gpt-6-luna`. |
| `GENTRY_PUBLIC_URL` | Public application URL used in service metadata. |
| `GENTRY_ALLOWED_ORIGIN` | Browser origin allowed for payment flows. |
| `GENTRY_AGENT_ID` | ERC-8004 reference agent ID; defaults to `2280`. |
| `GENTRY_AGENT_PAY_TO` | Monad Testnet address that receives service payments. |
| `GENTRY_AGENT_PRICE_USDC` | Service price in decimal USDC, such as `0.001`. |

Perpl API credentials are entered in the order panel and used for the requested account action. They are not stored in the repository or configured as server variables. Keep `.env` and all signing keys out of source control.

## Build and run

```bash
npm run build
npm start
```

The Express server serves the Vite build and API routes. `npm run dev` starts the web app and API server together.
