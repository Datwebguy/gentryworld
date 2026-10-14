# GentrY — product walkthrough voiceover

**Runtime target:** 2:35–2:50. This is the technical demo; the founder pitch is in `submission/PITCH-SCRIPT.md` and the Perpl bounty proof is in `submission/PERPL-BOUNTY-SCRIPT.md`.

## Opening — 0:00–0:18

Markets, research and execution are often split across different tools. GentrY brings them into one Monad workspace for independent traders and financial agent builders, while keeping each important decision visible to the user.

## Live market context — 0:18–0:42

These are live Perpl Testnet markets on Monad. GentrY reads the public market context, including the current mark and available funding information, and shows when the market data was updated. The quote comes from Perpl, not from the language model.

## Ask the research agent — 0:42–1:15

I’ll ask the agent to explain this market snapshot. GentrY sends the question together with the selected Perpl data to the research model. The model interprets the supplied information; it does not fetch a new quote or place a trade. The answer and the data it used appear together, so I can see the basis for its explanation.

## Agent service — 1:15–1:42

Here I can browse agents, inspect their registered identity and reputation, and see which service is available and what it costs. A paid request uses x402: I review the price in my wallet and approve the payment before the agent responds. Feedback can then be recorded against the agent's onchain reputation.

## Review and place an order — 1:42–2:28

If I decide to act, I can open the Perpl order review. I choose the account and market, set the direction and amount, and review the leverage and estimated costs. The order is sent only after I explicitly choose to place it. GentrY then shows Perpl's returned order status and, for a matching fill, verifies the transaction receipt on Monad Testnet and links to the explorer.

## Close — 2:28–2:45

GentrY connects live market context, inspectable agent services and user-approved execution. The information is visible, the cost is clear, and the final decision stays with the trader. GentrY, built on Monad.

## Capture notes

- Match each paragraph to the named screen action in `STORYBOARD.md`.
- Show the live source and update time. Avoid generic animated dashboards or unsupported performance claims.
- Keep credentials and wallet identifiers out of frame.
- Only show an explorer transaction if the app displays a verified successful receipt.
