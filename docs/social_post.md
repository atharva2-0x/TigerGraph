# Social post draft

Draft only; not posted.

> VERDICT: TigerGraph + MCP fraud investigation, calibrated evidence, GraphRAG memory & policy-gated actions. HHGOA: historical AUC .9886; 20/20 writebacks; 13 SARs. Demo: https://tiger-graph-jbs3tozes-atharva2ox-gmailcoms-projects.vercel.app/ Blog: https://github.com/atharva2-0x/TigerGraph/blob/main/docs/blog.md @TigerGraphDB @247pmstudio #HackerHouseGoa #AgenticAI

## Longer LinkedIn version

I built VERDICT for the Hacker House Goa TigerGraph challenge: an agentic fraud investigator designed to explain what it knows, what it still needs, and who must approve its next action.

- TigerGraph evidence through a read-only MCP investigation path, with GSQL queries and graph community analysis.
- A calibrated evidence ledger with uncertainty intervals and a value-of-information rule for deciding whether another check could change the outcome.
- Policy-routed actions, human approval for high-impact steps, grounded SARs, and case memory written back to the graph.

On the official HHGOA data, a time-ordered historical holdout reached 0.9886 ROC AUC and 0.0265 Brier score. The 20-case pack produced 20 verified graph writebacks and 13 SAR recommendations. These are historical backtest and workflow results, not hidden-answer-key accuracy. The Vercel link is a replay of precomputed cases; the live TigerGraph/MCP agent runs from the repository's Docker setup.

I work as a Forward Deployed Engineer at Fiserv, integrating fintech systems and agentic AI. That perspective is why I built the operational boundaries—permissions, approvals, evidence trails, and case progression—into the demo alongside the graph and model.

Demo: https://tiger-graph-jbs3tozes-atharva2ox-gmailcoms-projects.vercel.app/
Audio walkthrough: https://raw.githubusercontent.com/atharva2-0x/TigerGraph/main/docs/assets/verdict_demo_narration.mp3
Technical blog: https://github.com/atharva2-0x/TigerGraph/blob/main/docs/blog.md
Code: https://github.com/atharva2-0x/TigerGraph

#TigerGraph #GraphRAG #AgenticAI #FraudDetection #MCP
