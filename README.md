# GentrY

**A market research and execution workspace for people and financial agents building on Monad.**

GentrY brings live market context, discoverable agents and user-approved trading into one practical workflow. Traders can inspect market movement, ask an agent to explain what the current data says, and prepare a Perpl order with the size, direction and risk visible before they choose to send it. Agent builders can publish a service with an onchain identity and a clear price.

## Why we built it

Market data, research tools, agent services and trade execution often live in separate products. That makes it difficult to see what information an agent used, what a service costs, or what will happen before an order is sent. GentrY connects those steps so independent traders and agent builders can work in a shared, inspectable environment.

## What you can do

- **Follow market movement.** View Perpl Testnet market prices and movement with the source and update time shown in the app.
- **Ask an agent about a market.** The research service receives a current Perpl snapshot from the server. The language model explains that supplied data; it does not provide the underlying quotes or claim to execute a trade.
- **Discover services.** Browse agents by capability, open their onchain identity, and review listed services and reputation.
- **Pay for a service.** The x402 flow presents the service price and requests wallet approval before the paid request is made.
- **Review a Perpl order.** Connect the wallet associated with a Perpl account, select a market, side, size and leverage, inspect the estimate, then explicitly place the order. When Perpl returns a fill, GentrY verifies its transaction receipt on Monad Testnet and links to the explorer.
- **Rate an agent.** Submit reputation feedback onchain after using a service.

Order placement and copy trading are deliberately user controlled: GentrY does not automatically mirror trades. A generated research response is analysis of the supplied snapshot, not a promise of performance or financial advice.

## How the market answer is produced

1. GentrY reads public market context from Perpl Testnet, including available market prices and funding information.
2. The backend selects the requested market and sends that snapshot with the user's question to the configured OpenAI Responses API model (`gpt-6-luna` by default).
3. The agent is instructed to ground current market claims in that snapshot, distinguish observation from interpretation, and leave order placement to the user-controlled trading flow.
4. For a trade, the user reviews the order in GentrY and confirms it. The backend submits it to Perpl's trading API. For matching fills, GentrY checks the returned transaction hash against Monad Testnet and exposes a MonadScan link when the receipt succeeds.

## Network and integrations

- **Monad Testnet** — wallet connection, ERC-8004 identity and reputation, USDC service payments, and transaction verification.
- **ERC-8004** — onchain agent identity and reputation.
- **x402** — wallet-approved payment for priced agent services.
- **Perpl Testnet** — public market context, account state, order placement and fills.
- **OpenAI Responses API** — turns the supplied market snapshot into a concise research response; model is configurable.
- **Reown AppKit / wagmi / viem** — wallet connection and EVM interactions.
- **Railway** — current application hosting.

## Project links

- Live app: [gentryworld.up.railway.app](https://gentryworld.up.railway.app)
- Source: [github.com/Datwebguy/gentryworld](https://github.com/Datwebguy/gentryworld)

The live application uses Monad Testnet. The Perpl Testnet order panel requires a trade-enabled Perpl API key and signing key from the user. Those credentials are submitted for the request and are not saved by GentrY.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Set the server environment values below in `.env` as applicable:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-side key used for market research responses. |
| `OPENAI_MODEL` | Responses API model; defaults to `gpt-6-luna`. |
| `GENTRY_PUBLIC_URL` | Public app URL used when publishing agent service metadata. |
| `GENTRY_ALLOWED_ORIGIN` | Allowed browser origin for payment and API flows. |
| `GENTRY_AGENT_PAY_TO` | Monad Testnet address that receives agent service payments. |
| `GENTRY_AGENT_PRICE_USDC` | Listed service price in decimal USDC, for example `0.001`. |
| `VITE_REOWN_PROJECT_ID` | Reown project ID used by the browser wallet interface. |
| `GENTRY_AGENT_ID` | ERC-8004 identity shown as the app's reference agent; defaults to `2280`. |

Never commit `.env` or place private keys in frontend variables. For Perpl, the user enters a trade-enabled API key and signing key in the order panel; the app does not retain them. Perpl credentials are not configured as server environment variables.

## Build and run

```bash
npm run build
npm start
```

The Express server serves the built Vite app and API routes. During development, `npm run dev` starts Vite and the API server together.

## Hackathon relevance

GentrY is built for **Onchain Finance & Trading** and **Trust, Identity & AI Infrastructure** on Monad. It combines an agent-facing market research use case with onchain identity, paid service access, user-reviewed order execution and explorer-verifiable testnet activity.

## Team contributions

The repository is maintained by [Datwebguy](https://github.com/Datwebguy). [majorlabs](https://github.com/majorlabs) has write access to the repository. GitHub's contributor list reflects commits that land on the repository's default branch; collaborator access or approving a pull request alone does not add a contributor entry.
