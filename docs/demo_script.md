# VERDICT demo guide

## Links

- Live replay: https://tiger-graph-jbs3tozes-atharva2ox-gmailcoms-projects.vercel.app/
- Narration audio: `docs/assets/verdict_demo_narration.mp3`
- Audio script: `docs/demo_narration.txt`
- Live agent setup: see the Docker quickstart in `README.md`.

The Vercel page is an interactive replay of precomputed HHGOA-format sample investigations. It is not a live TigerGraph/MCP backend. The repo's Docker workflow starts the live agent against TigerGraph.

## Suggested 2-minute walkthrough

1. Start in **Case queue** and point out that the page is in Replay mode.
2. Open **HHG-008**. Follow the agent timeline from the trigger through graph queries, assessment, explanation, and memory writeback.
3. In **Graph evidence**, show the connected transaction, card, customer, device, email, region, and prior-case context.
4. In **Assessment** and **Evidence ledger**, show the 99.9% replay assessment, its 80% interval, shared-entity-ring classification, and supporting/contradicting signals.
5. In **Next best action**, show the decision-stability and value-of-information explanation. This case stops and acts because the replay finds no evidence request with positive value.
6. In **Policy actions**, point out that routine actions may be automatic while card blocking is routed to an L1 analyst and the SAR to compliance. The agent recommends; approval controls govern execution.
7. In the **SAR** and graph writeback sections, show evidence-grounded reporting, the customer non-disclosure rule, and verified case memory.
8. Close with the measured results in the technical blog. Clearly distinguish historical backtest metrics from hidden-case judging accuracy.

The narration is a standalone audio track to play alongside the replay. The X post in `docs/social_post.md` is a draft and has not been posted.
