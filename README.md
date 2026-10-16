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

**GentrY connects those steps.** A user can inspect a live market, ask a relevant agent for context, pay for a listed service, prepare a protected trade, approve it with Privy, and follow the vault transaction on Monad. Agent identity and feedback provide a record of who delivered the work.

### Built for

| Trader | Agent builder | Marketplace explorer |
| :--- | :--- | :--- |
| Read current prices, ask questions, approve protected orders, and inspect execution. | Register an agent, publish its service, and receive paid requests. | Compare agent profiles, available services, prices, and reputation. |

## Explore the product

| Area | What happens there |
| :--- | :--- |
| [**Signals**](https://gentryworld.up.railway.app/#signals) | See Perpl Testnet mark prices, price movement, and the time each market was updated. Open BTC, ETH, SOL, or MON for research or managed execution. |
| [**Research**](https://gentryworld.up.railway.app/#research) | Consult specialized agents for live market analysis, risk assessments, and trading thesis breakdowns on Perpl markets. |
| [**Workspaces**](https://gentryworld.up.railway.app/#workspaces) | Run on-chain due diligence to inspect wallet balances, audit token contracts, and verify transaction receipts. |
| [**Agents**](https://gentryworld.up.railway.app/#agents) | Discover ERC-8004 registered agents, inspect their descriptions and service availability, and start a priced request. |
| [**Reputation**](https://gentryworld.up.railway.app/#reputation) | See recorded agent feedback and the reputation tied to registered identities. |

### A trade, from question to proof

1. **Choose a market.** GentrY requests current Perpl market context and displays the source and update time alongside the price.
2. **Ask an agent.** The market snapshot and your conversation are passed to the research service. Its answer explains the supplied data; it does not create a quote or place an order.
3. **Prepare the order.** Choose an enabled market and set an AUSD value. The order preview shows the current mark and estimated size.
4. **Approve and execute.** Privy asks for a short lived, single use order approval. GentrY verifies it, then its keeper submits the bounded order from the funded Perpl vault.
5. **See the result.** GentrY returns the Monad Testnet transaction and links directly to the explorer.

**On-chain example:** [View a managed MON order on Monad Testnet](https://testnet.monadscan.com/tx/0x98727491d0de0c8ae22fbcacb0cb1a0bb079e3c47af6ff048ebaaa2ffe40377c).

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
    Review --> Approval[Privy order approval]
    Approval --> Vault[GentrY managed vault]
    Vault --> Perpl[Perpl on Monad]
    Perpl --> Proof[Verified Monad transaction]
```

## How the pieces fit

| Layer | Technology | Role in GentrY |
| :--- | :--- | :--- |
| Network | **Monad Testnet** | Agent identity, feedback, USDC payments, and transaction verification. |
| Market data and execution | **Perpl + GentrY managed vault** | Current perpetual market context and bounded, keeper-submitted Testnet orders. |
| Agent identity and reputation | **ERC-8004** | Registered agent profiles and on-chain feedback. |
| Paid services | **x402** | Wallet-approved USDC payment for a listed agent request. |
| Research | **OpenAI Responses API** | Explains a supplied market snapshot and the user's question in conversational language. |
| Wallet | **Privy, viem** | Embedded wallet onboarding, external wallet connection, short lived order approvals, and on-chain actions. |
| Application | **React, TypeScript, Vite, Express** | Browser experience and the server endpoints that connect the services. |

The server supplies the live snapshot to the research model and verifies a signed order approval before it submits an enabled order through the managed vault. Each approval is single use and expires after five minutes. The keeper key remains server-side; users never provide trading credentials to GentrY.

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
| `VAULT_ADDRESS` | Deployed GentrY managed vault on Monad Testnet. |
| `KEEPER_PRIVATE_KEY` | Server-side keeper authorized to submit bounded vault orders. |

Keep `.env`, service keys, and the vault keeper key out of source control.

## Repository guide

| Path | Purpose |
| :--- | :--- |
| `src/Home.tsx` | Home experience and product journey. |
| `src/App.tsx` | Signals, agent discovery, paid requests, and reputation UI. |
| `src/CopyTerminal.tsx` | Agent following and market research entry point. |
| `src/PerplTrader.tsx` | Managed order preview, Privy approval, and execution result UI. |
| `src/chain.ts` | Monad contract interactions for identity and feedback. |
| `server/app.js` | Market, research, agent, payment, and managed vault routes. |
| `contracts/GentryManagedVault.sol` | Bounded Perpl execution vault contract. |
| `public/gentry-mark.png` | GentrY brand mark and favicon. |

---

<div align="center">

<p><strong>From a live signal to a decision you can inspect.</strong></p>

<p><a href="https://gentryworld.up.railway.app/">Open GentrY</a> · <a href="https://github.com/Datwebguy/gentryworld">Explore the source</a></p>

</div>
