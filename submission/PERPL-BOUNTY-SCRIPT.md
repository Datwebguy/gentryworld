# Perpl bounty — trading system proof

**Form requirement:** a video of up to 2 minutes showing the Perpl trading automation system with demonstrated real onchain activity. This is a focused screen recording, separate from the founder pitch.

**Trading system URL:** https://gentryworld.up.railway.app

| Time | Screen action | Spoken line |
| --- | --- | --- |
| 0:00–0:10 | Show GentrY and open a live Perpl market. | “This is GentrY's Perpl trading workflow on Monad Testnet. It connects live market context to an order that the user reviews and confirms.” |
| 0:10–0:25 | Show the market, price, source and update time. | “The market view reads Perpl's public Testnet context. The trading flow uses Perpl for account state, order submission and fills.” |
| 0:25–0:50 | Open the order panel. Connect the wallet and link the Perpl account. Keep credentials hidden. Select the market and a small testnet order. | “I link the Perpl account associated with my connected Monad wallet. I choose the market and order size, and GentrY shows the direction, leverage and estimated costs before I send anything.” |
| 0:50–1:05 | Pause on the review, then click Place order. Show the wallet or app state without exposing secrets. | “I review the order and explicitly confirm it. GentrY sends the request to Perpl's trading API; it does not copy or place trades automatically.” |
| 1:05–1:35 | Show actual returned Perpl order/fill status, then click the MonadScan link. Show successful receipt and transaction hash. | “Perpl returned this fill. GentrY matched the Perpl fill record to its transaction hash and verified the successful receipt on Monad Testnet. This explorer page is the onchain activity for the demonstrated trade.” |
| 1:35–1:50 | Show the trade status again and the app URL. | “The app keeps the order status beside the verifiable transaction. GentrY combines Perpl execution with a clear review step, so the user remains in control.” |

## Proof checklist

- Show an actual Perpl Testnet fill and a successful Monad Testnet transaction receipt. A submitted order alone does not satisfy the bounty wording.
- Keep the order small and intentional; do not expose account secrets or private keys in the recording.
- Keep the MonadScan URL visible long enough to read the transaction and network.
- The bounty form's two URL fields are: the public video link for the first field and `https://gentryworld.up.railway.app` for the trading system field.
- Do not submit the demo recording link until the video is hosted on a public URL that judges can open.
