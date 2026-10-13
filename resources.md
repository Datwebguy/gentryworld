# GentrY — Resources

All addresses and URLs are from official Monad documentation and the ERC-8004 contracts repository.

## Metropolis

- Homepage: https://monad.xyz/metropolis
- Developer page: https://monad.xyz/developers/hackathons/metropolis
- Portal: https://hackathon.monad.xyz/
- Discord: https://discord.gg/monaddev

## Monad documentation

- Docs home: https://docs.monad.xyz
- ERC-8004 on Monad: https://docs.monad.xyz/guides/erc-8004
- x402 on Monad: https://docs.monad.xyz/guides/x402
- Agentic payments: https://docs.monad.xyz/tooling-and-infra/agentic-payments
- Network information: https://docs.monad.xyz/developer-essentials/network-information
- Testnet: https://docs.monad.xyz/developer-essentials/testnet

## Network

| Network | Chain ID | RPC | Explorer |
|---|---:|---|---|
| Monad Mainnet | 143 | https://rpc.monad.xyz | https://monadscan.com |
| Monad Testnet | 10143 | https://testnet-rpc.monad.xyz | https://testnet.monadscan.com |

Testnet faucet: https://faucet.monad.xyz  
Testnet app hub: https://testnet.monad.xyz

## ERC-8004 Registries

### Mainnet (chain ID 143)

- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

### Testnet (chain ID 10143)

- Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Reputation Registry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- Validation Registry: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`

Contracts repository: https://github.com/erc-8004/erc-8004-contracts

## x402

- Monad Facilitator: https://x402-facilitator.molandak.org
- Guide: https://docs.monad.xyz/guides/x402
- API Hub: https://app.monad.xyz/agents/api-hub
- Testnet USDC: `0x534b2f3A21130d7a60830c2Df862319e593943A3`

## GentrY implementation map

The full Metropolis resource list contains many ecosystem options. GentrY uses them in this order:

### Keep as the source of truth

- Monad Testnet RPC and explorer
- ERC-8004 Identity, Reputation, and Validation registries
- Monad x402 facilitator
- Official Monad guides for ERC-8004, x402, indexers, and network behavior

All identities, feedback, payment receipts, and displayed agent claims must be verifiable against these sources.

### Discovery and live data

- Trust8004: normalized ERC-8004 discovery and trust data. Use as a read index only; verify important records against the registries.
- Envio HyperIndex: candidate indexer for agent events, payment events, and signal history.
- QuickNode Streams or BlockVision: optional event delivery when polling the public RPC becomes too slow.
- Zerion API: optional wallet and portfolio enrichment after the core testnet loop is stable.

### Signal and execution track

- Kuru: reference for live order-book and execution-aware interfaces on Monad.
- 0x: optional routing and swap execution layer when a real execution agent is available.
- `kuru-terminal`: reference for real-time market activity and no-pending-state UX.
- Morpho, Aave, Euler, and Curvance: protocol-specific agent types to add only after the general marketplace loop works.

### Product pages derived from the reference builds

1. Home: explain the network and show verified live proof.
2. Agents: discover and hire registered agents.
3. Signals: show only signals returned by real registered research agents.
4. Agent profile: services, evidence, reputation, and verified history.
5. Copy or execution: risk limits, amount limits, expiry, and settlement status where a real execution endpoint exists.
6. Portfolio: positions and activity from indexed on-chain data.
7. Data: wallet, token, transaction, and other payable intelligence services.
8. Reputation: feedback and performance evidence from ERC-8004 and chain receipts.

### Sponsor tools to claim

- QuickNode Build Plan
- Tenderly Pro for simulation and debugging
- Zerion API Builder tier
- BlockVision Lite
- Spectrum Nodes Business plan
- Dwellir Developer plan

These are development accelerators, not sources for invented product data. They should be added only when a concrete latency, indexing, simulation, or wallet-data problem requires them.

## Bounty-aligned build target

The strongest coherent GentrY submission is:

**Research signal → risk check → execution → indexed result → portable reputation**

### Highest-fit bounties

- **Best Use of Envio:** index agent registrations, signal publications, x402 settlements, execution receipts, and feedback into the activity and reputation views.
- **Kuru — next consumer trading product:** route a focused spot execution flow through Kuru after a registered agent publishes a signal.
- **Kuru — new assets and markets:** only pursue this if GentrY can introduce a real agent-created market or asset with deployable contracts and live liquidity.
- **Perpl API:** add a perpetuals signal and risk workspace only if Perpl testnet access and API credentials are available.
- **Alchemy:** use one Alchemy service for production RPC, wallet, or transaction infrastructure and document the integration.
- **Dynamic:** consider embedded or agent wallets only if the wallet flow materially improves execution.
- **Best Community Team Project:** package the open agent standard, forkable adapters, and contributor workflow clearly.

### Lower priority for the first submission

Agora mobile payments, Cleansverse CVA verification, and Chainlink CRE are possible extensions but would split the product story before the signal-to-execution loop is complete.
