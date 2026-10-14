# GentrY — technical product demo

**Submission limit:** up to 3 minutes. Keep the app full screen. Capture the live product, not slides or source code.

| Time | Screen action | Spoken line |
| --- | --- | --- |
| 0:00–0:15 | Open the GentrY home page. Show the separate Signals, Workspaces, Agents and Reputation routes. | “This is GentrY, a Monad workspace for traders and financial agent builders. It connects market research, paid agent services and a trade flow that stays under the user's control.” |
| 0:15–0:40 | Open Signals. Show loaded Perpl market cards, source and refresh time. Open one market. | “These prices and market details come from Perpl's public Monad Testnet market context. GentrY fetches the snapshot and shows when it was read. The model does not supply or make up the market price.” |
| 0:40–1:10 | Open the market research agent. Ask: “Summarize the latest BTC Perp snapshot. Separate observed data from interpretation and state what information you used.” Show the response and its data-used section. | “I can ask the research agent a follow-up. The server sends my question with the selected market snapshot to the configured language model. The answer is grounded in those supplied fields, and the data-used section lets me inspect its basis.” |
| 1:10–1:35 | Navigate to Agents. Open a registered agent and show identity, service and price. Show reputation. | “Agent profiles show their registered identity, available service and price. ERC-8004 provides the onchain identity and reputation records. When I request a paid service, x402 presents the payment for wallet approval.” |
| 1:35–2:25 | Open Perpl order review. Connect the test wallet if needed. Link the test account. Select a small testnet order, show market/side/value/leverage/estimated cost. Do not expose keys on screen. Place only if the demo account is funded and the user intends to trade. | “For an order, I select my Perpl account and review the market, direction, size, leverage and estimated costs. Nothing is submitted until I choose Place order. Perpl returns the order and fill status; GentrY checks a matching fill's transaction receipt on Monad Testnet and gives me the explorer link.” |
| 2:25–2:50 | Show status and click the MonadScan link. Keep the receipt visible briefly. Return to app. | “Here is the confirmed Monad transaction for the Perpl fill. I can compare the execution record with the order status in GentrY. Research can inform the decision, but the user approves the service payment and confirms the trade.” |
| 2:50–3:00 | Return to GentrY home and hold. | “GentrY brings market context, agent services and verifiable execution together on Monad.” |

## Before recording

- Use the public Railway app and refresh once so live market cards load.
- Keep all API keys, signing keys and private wallet details off screen. Close password managers and notifications.
- Use a funded Monad Testnet wallet and a trade-enabled Perpl Testnet account. Confirm the account's order forwarding is enabled.
- Place a small, intentional testnet order only if the demo account owner agrees. Do not promise a fill: if the order is not filled, show the returned status accurately and record the Perpl bounty proof separately after a fill exists.
- Only show a MonadScan transaction link when GentrY displays a verified successful receipt.
- If the selected research agent is temporarily unavailable, use the agent that is actually listed as payable in the live app; don't stage or fabricate a response.
