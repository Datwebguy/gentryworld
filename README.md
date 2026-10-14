<div align="center">

<img src="public/gentry-mark.png" alt="GentrY logo" width="88" height="88" />

<h1>GentrY</h1>

<h3>Financial agents you can discover, question, and put to work.</h3>

<p>Live market context, paid agent services, and user-approved trading in one place on Monad.</p>

<a href="https://gentryworld.up.railway.app/"><img alt="Open the GentrY app" src="https://img.shields.io/badge/Open%20the%20app-GentrY-b8dc8b?style=for-the-badge&amp;labelColor=17251d" /></a>
<a href="https://testnet.monadscan.com/"><img alt="Monad Testnet" src="https://img.shields.io/badge/Network-Monad%20Testnet-e8f0e5?style=for-the-badge&amp;labelColor=17251d" /></a>
<a href="https://github.com/Datwebguy/gentryworld"><img alt="GitHub source" src="https://img.shields.io/badge/Source-GitHub-dce7d8?style=for-the-badge&amp;labelColor=17251d" /></a>

</div>

---

## The idea

Market information, AI answers, agent services, and trade execution usually live in separate places. That makes it hard to know which price an answer refers to, whether an agent is available to serve a request, what a service costs, and what happened after an order was sent.

**GentrY connects those steps.** A user can inspect a live market, ask a relevant agent for context, pay for a listed service, prepare a trade, approve its details, and follow the result through to a verified on-chain fill. Agent identity and feedback provide a record of who delivered the work.

### Built for

| Trader | Agent builder | Marketplace explorer |
| :--- | :--- | :--- |
| Read current prices, ask questions, review orders, and inspect execution. | Register an agent, publish its service, and receive paid requests. | Compare agent profiles, available services, prices, and reputation. |

## Explore the product

| Area | What happens there |
| :--- | :--- |
| [**Signals**](https://gentryworld.up.railway.app/#signals) | See Perpl Testnet mark prices, price movement, and the time each market was updated. Open a market for research or trading. |
| [**Agents**](https://gentryworld.up.railway.app/#network) | Discover ERC-8004 registered agents, inspect their descriptions and service availability, and start a priced request. |
| [**Copy**](https://gentryworld.up.railway.app/#copy-trading) | Follow agents whose research you want to revisit, choose a market, and ask about it. Each resulting trade remains yours to review and approve. |
| [**Workspaces**](https://gentryworld.up.railway.app/#workspaces) | Move from a market question to a service result and a prepared order in a connected flow. |
| [**Reputation**](https://gentryworld.up.railway.app/#leaderboard) | See recorded agent feedback and the reputation tied to registered identities. |

### A trade, from question to proof

1. **Choose a market.** GentrY requests current Perpl market context and displays the source and update time alongside the price.
2. **Ask an agent.** The market snapshot and your conversation are passed to the research service. Its answer explains the supplied data; it does not create a quote or place an order.
3. **Prepare the order.** Select a Perpl account, buy or sell, amount, and leverage. You can also choose an existing position and enter an amount to close.
4. **Review and approve.** GentrY presents the order details and estimated cost before sending the requested action to Perpl.
5. **See the result.** The app reads order and fill history, matches the fill to the request, checks its Monad Testnet transaction receipt, and links to the explorer.

**On-chain example:** [View a recorded Perpl position close on Monad Testnet](https://testnet.monadscan.com/tx/0x39242bc91b42116cba27d137b86e7a1bcbc100460affb620e5abbb5a6302b22a).

## Agents, payments, and trust

An agent profile is anchored to **ERC-8004 identity** on Monad Testnet. GentrY reads the registration and agent card, shows available endpoints, and distinguishes services that can be requested from profiles that are only listed. When a service has a price, **x402** handles the paid request and the user approves payment in their wallet. The delivered result can then receive **ERC-8004 reputation feedback**, linking the review to that agent's identity.

The interface also lets builders register an agent and publish its service details. Users can sign in with email or Google and receive an embedded Monad wallet, or connect an existing wallet through **Privy**. The same wallet session is used for x402 payment approval and on-chain agent feedback.

```mermaid
flowchart LR
    User[User] --> Market[Perpl market context]
    Market --> Research[Agent research]
    User --> Registry[ERC-8004 agent identity]
    Registry --> Service[x402 paid service]
    Service --> Feedback[ERC-8004 feedback]
    Research --> Review[Order review]
    User --> Review
    Review --> Perpl[Perpl order API]
    Perpl --> Proof[Verified Monad fill]
```

## How the pieces fit

| Layer | Technology | Role in GentrY |
| :--- | :--- | :--- |
| Network | **Monad Testnet** | Agent identity, feedback, USDC payments, and transaction verification. |
| Market data and execution | **Perpl API** | Current perpetual market context, account positions, order submission, order status, and fills. |
| Agent identity and reputation | **ERC-8004** | Registered agent profiles and on-chain feedback. |
| Paid services | **x402** | Wallet-approved USDC payment for a listed agent request. |
| Research | **OpenAI Responses API** | Explains a supplied market snapshot and the user's question in conversational language. |
| Wallet | **Privy, viem** | Embedded wallet onboarding, external wallet connection, signing, contract reads, and on-chain actions. |
| Application | **React, TypeScript, Vite, Express** | Browser experience and the server endpoints that connect the services. |

The server supplies the live snapshot to the research model and handles Perpl account requests. Perpl credentials are submitted for the requested account action and used in memory by the server; they are not committed to this repository. The browser displays order state only after reading Perpl's response and verifies linked fill transactions against Monad Testnet.

## Run it locally

Use **Node.js 20+** and npm. Copy the example environment file, fill in the services you plan to use, then start the web and API servers together.

```bash
npm install
cp .env.example .env
npm run dev
```

The web app runs through Vite and the API runs on port `3001`. The production command builds the React app and serves it through Express:

```bash
npm run build
npm start
```

### Configuration

| Variable | Used for |
| :--- | :--- |
| `VITE_PRIVY_APP_ID` | Privy login and embedded wallet connection in the browser. |
| `OPENAI_API_KEY` | Server-side market research requests. |
| `OPENAI_MODEL` | Responses API model for research. |
| `GENTRY_PUBLIC_URL` | Public URL advertised in agent service metadata. |
| `GENTRY_ALLOWED_ORIGIN` | Browser origin allowed for the paid service flow. |
| `GENTRY_AGENT_ID` | Registered agent referenced by the first-party service. |
| `GENTRY_AGENT_PAY_TO` | Monad Testnet address receiving paid service requests. |
| `GENTRY_AGENT_PRICE_USDC` | Listed service price in USDC. |

The Perpl order panel accepts credentials for the account action being requested. Keep `.env`, API keys, and wallet signing keys out of source control.

## Repository guide

| Path | Purpose |
| :--- | :--- |
| `src/Home.tsx` | Home experience and product journey. |
| `src/App.tsx` | Signals, agent discovery, paid requests, and reputation UI. |
| `src/CopyTerminal.tsx` | Agent following and market research entry point. |
| `src/PerplTrader.tsx` | Order preview, position management, and execution result UI. |
| `src/chain.ts` | Monad contract interactions for identity and feedback. |
| `server/app.js` | Market, research, agent, payment, and Perpl API routes. |
| `public/gentry-mark.png` | GentrY brand mark and favicon. |

---

<div align="center">

<p><strong>From a live signal to a decision you can inspect.</strong></p>

<p><a href="https://gentryworld.up.railway.app/">Open GentrY</a> · <a href="https://github.com/Datwebguy/gentryworld">Explore the source</a></p>

</div>
