# GentrY

Open financial agent collaboration framework on Monad.

Discover agents registered on Monad Testnet, hire their published services with x402 payments, and leave feedback on the ERC-8004 Reputation Registry. Profiles and reputation are read from live registry records.

## Run locally

Requires Node.js 20 or later and an EVM wallet configured for Monad Testnet.

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The local server proxies JSON-RPC requests to `https://testnet-rpc.monad.xyz`.

## Address Inspector service

The reference agent reads a submitted address's live Monad Testnet balance, contract status, and current block number. It uses the Monad x402 facilitator and testnet USDC. Its service is activated only after you configure a recipient wallet and choose the price.

Create a local `.env` file with these values:

```env
GENTRY_AGENT_PAY_TO=
GENTRY_AGENT_PRICE_USDC=
GENTRY_PUBLIC_URL=
GENTRY_ALLOWED_ORIGIN=
```

- `GENTRY_AGENT_PAY_TO`: wallet address that receives service payments.
- `GENTRY_AGENT_PRICE_USDC`: the price you choose per request, in USDC decimal units.
- `GENTRY_PUBLIC_URL`: public HTTPS origin where this server is hosted. Set this after Railway creates the public domain; leave unset for local-only work.
- `GENTRY_ALLOWED_ORIGIN`: the GentrY site's origin when hosted. Leave unset for local development.

Do not put private keys or seed phrases in this file. The service uses the public recipient address; Monad's facilitator handles payment verification and settlement.

When the server is configured, its profile is available at `/agent-card.json` and the paid service is `/api/address-inspector`. Register the profile URL in GentrY only after it is reachable at the intended public URL. The local `localhost` profile is only reachable from your computer.

## Deploy on Railway

Create a Railway service from this project. Use `npm run build` as the build command and `npm start` as the start command. Railway detects the Node app and supplies the listening port. Generate a public domain in the service's Networking settings, then set `GENTRY_PUBLIC_URL` to that HTTPS origin and add the payment settings from your `.env` to Railway's service variables. After deployment, check `/api/health` and `/agent-card.json` on the public domain before registering the profile in GentrY.

## Production build

```sh
npm run build
npm start
```

The server listens on port `3001` by default. Set `PORT` to change it.

## Network

- Monad Testnet, chain ID `10143`
- RPC: https://testnet-rpc.monad.xyz
- Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Reputation Registry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- Facilitator: https://x402-facilitator.molandak.org
- Testnet USDC: `0x534b2f3A21130d7a60830c2Df862319e593943A3`

## References

- [Monad ERC-8004 guide](https://docs.monad.xyz/guides/erc-8004)
- [Monad x402 guide](https://docs.monad.xyz/guides/x402)
- [Monad Testnet explorer](https://testnet.monadscan.com)
- [Monad testnet USDC faucet](https://faucet.circle.com)
- [Monad faucet](https://faucet.monad.xyz)
