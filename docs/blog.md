# VERDICT: making a fraud investigation agent know when to stop

*Hacker House Goa 2026 · TigerGraph Agentic Fraud Investigation*

**Demo:** [HHGOA replay](https://tiger-graph-jbs3tozes-atharva2ox-gmailcoms-projects.vercel.app/) · **Audio walkthrough:** [listen to the narrated demo](https://raw.githubusercontent.com/atharva2-0x/TigerGraph/main/docs/assets/verdict_demo_narration.mp3) · **Code:** [GitHub repository](https://github.com/atharva2-0x/TigerGraph)

## The important question is whether the evidence is enough

A fraud alert starts an investigation; it does not finish one. Analysts have to decide whether the signal is strong enough to protect an account, whether another check could change that decision, and which actions need a person to approve them. A false positive can interrupt a real customer. A missed link between cards can let a fraud ring keep moving.

I built **VERDICT** around that decision. It uses TigerGraph to collect connected evidence, turns findings into an auditable probability, evaluates whether more evidence is worth gathering, and sends proposed actions through bank policy and approval rules. The language model can help choose investigative steps and explain results. Deterministic scoring and policy code own the numbers and permissions.

I work as a Forward Deployed Engineer at Fiserv, where I work at the intersection of fintech integrations and agentic AI. That experience shapes the engineering goal here: a useful agent has to fit the systems around it, preserve operational controls, and leave a case another person can understand and continue.

## From alert to case, with the graph in the loop

The investigation starts from a risk alert, customer report, or analyst request. VERDICT opens a case and calls installed GSQL queries through the TigerGraph MCP server. Its read path is restricted by an MCP tool filter and a query allow-list.

The queries examine transaction velocity, customer and device baselines, region activity, identity consistency, linked entities, prior cases, community membership, and exposure. For ring context, the system builds a card-to-card projection from shared devices and recipient email domains, then uses TigerGraph GDS WCC and Louvain. A new location by itself is weak context; a new location while normal activity continues elsewhere is a very different observation.

Each result becomes a named row in an evidence ledger. The calibrated additive log-odds model estimates fraud probability from historical closed cases, and bootstrap refits give the estimate an uncertainty interval. The UI shows which query supports each signal and how each signal moves the assessment. This makes the graph useful to an analyst: it connects evidence to a case, rather than presenting a graph as decoration.

## Ask for more evidence only when it can change the decision

The next-best-action engine compares expected losses for the available decisions. For each possible evidence request, it estimates the value of information after the request cost. VERDICT asks only when the expected value is positive and at least one plausible answer could change the action. It records the action for each possible response before asking, so the counterfactual is part of the case record.

The result may be to gather evidence, protect, release, or stop and act. The system also records why it stopped. In the official 20-case HHGOA judging pack, the calculation found no request with positive value of information, so VERDICT requested no additional evidence in that run. That is a result of this pack and its configured costs and likelihoods; it is not a claim that uncertain fraud cases never need more investigation.

## Policy controls what the agent may do

Recommendations pass through a policy-as-code engine that attaches policy clauses, permitted actions, approval routes, and SAR criteria. The agent can propose; it cannot use its read-only graph connection to perform a high-impact action. A separate operations path applies policy-gated side effects, while actions routed to an analyst or compliance remain pending human approval. Broader card blocking requires evidence of broader compromise, and required SARs are checked against stored evidence before they are presented.

This boundary matters as much as the risk score. Investigation accuracy and next-best-action quality depend on evidence, but a case also needs to explain its recommendation, preserve the decision path, and respect permissions. VERDICT stores the trigger, query calls, evidence, before-and-after assessment, policy references, approvals, and actions as case history.

## Memory makes each case part of the graph

After an investigation, VERDICT writes the case, evidence, requests, actions, and links back to TigerGraph. Later cases can retrieve similar outcomes through TigerVector and graph structure. The retrieval combines vector similarity with structural precedent; WCC and Louvain add community context. A residual clustering job also looks for confirmed-fraud cases that documented signatures do not explain and stores candidate patterns as hypotheses rather than allowing them to silently become automatic decisions.

This gives the agent a path to improve from outcomes: resolved cases can refit the evidence model, and later investigations can retrieve the precedent and its graph context. It also gives reviewers a record to challenge when a pattern, policy, or recommendation is wrong.

## What the HHGOA run shows

The official HHGOA data includes 5,565 closed cases for calibration: 4,665 confirmed-fraud and 900 cleared examples. On a time-ordered historical holdout of 1,392 cases, the evidence model reached **0.9886 ROC AUC** and a **0.0265 Brier score**. Pattern classification reached **73.94% accuracy** on 1,247 held-out confirmed-fraud cases.

The 20-case judging pack produced 20 answer files and 20 verified graph writebacks. The policy engine recommended 13 SARs, and the VOI calculation requested no additional evidence in this run. The benchmark ran through the deterministic path; LLM-assisted investigation and explanations are optional. These historical backtest figures do **not** measure accuracy on the hidden judging answer key.

The [Vercel demo](https://tiger-graph-jbs3tozes-atharva2ox-gmailcoms-projects.vercel.app/) is a browser-based replay of precomputed HHGOA-format sample investigations. It lets a reviewer inspect case progression, evidence, recommendations, policy routes, SARs, and graph writeback. The hosted page labels this replay mode; the live TigerGraph/MCP agent is run from the repository's Docker setup. The narrated audio follows a representative ring investigation in that replay.

## Why this is a different kind of fraud demo

Many prototypes stop at classification. VERDICT treats the work as an investigation with a controlled endpoint: retrieve evidence, represent uncertainty, decide whether another observation has decision value, and route actions under policy. The most original part is not one model or one graph algorithm. It is the connection between graph evidence, calibrated uncertainty, value of information, case memory, and approval requirements in one traceable workflow.

The extra features support the same ask: GraphRAG precedent, claim-checked SARs, policy citations, uncertainty intervals, counterfactual branches, human approvals, graph writeback, and residual pattern discovery. The end-to-end demo shows not just what the agent believes, but what evidence changed its belief, which actions it recommends, who must approve them, and what it remembers.

## Next steps

The next iteration should connect the workflow to a streaming trigger source, measure request outcomes as they arrive, and expose stronger analyst feedback for case resolution and policy review. I would also add segment-specific calibration and richer counterfactuals that state which single new fact would change a decision. A production deployment would need bank-specific integration, security, retention, and governance reviews before any real customer action.

The guiding idea stays the same: an agent should be able to investigate, explain its uncertainty, and stop safely when the evidence or its permissions run out.
