"""Benchmark answer files: one JSON (machine) + one Markdown (human) file per case, plus a summary.

The JSON layout follows the submission requirements in the brief: the case with its internal investigation record,
evidence, findings, decisions and actions; the SAR when policy requires one; and the next best action with its
approval route recorded before any additional evidence is requested and after it is received. If the official
README prescribes different field names, adapt ``to_answer`` only.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pandas as pd

from verdict import __version__
from verdict.config import settings


def _risk_level(p: float) -> str:
    return "CRITICAL" if p >= 0.95 else "HIGH" if p >= 0.8 else "MEDIUM" if p >= 0.5 else "LOW" if p >= 0.2 else "MINIMAL"


def _nba_view(n: dict) -> dict:
    return {
        "decision": n["decision"],
        "p_fraud": n["p_fraud"],
        "ci80": n["ci80"],
        "decision_stability": n["decision_stability"],
        "actions": [{"action": x["code"], "approval_route": x["route"], "status": x["status"], "policy_refs": x.get("clauses", []),
                     "rationale": x.get("rationale", "")} for x in n["actions"]],
        "approval_routes": n["approval_routes"],
        "requires_human_approval": n["requires_human_approval"],
        "forbidden_by_policy": n.get("forbidden", []),
        "deferred_by_policy": n.get("deferred", []),
        "reason": n["reason"],
        "expected_loss_usd": n.get("expected_loss"),
        "value_of_information": n.get("voi"),
        "sar_required": n["sar_required"],
    }


def to_answer(s: dict, graph_check: dict | None = None) -> dict:
    last = s["assessments"][-1]
    first = s["assessments"][0]
    before, after = s["nba_before_evidence"], s["nba_after_evidence"]
    return {
        "case_id": s["case_id"],
        "schema_version": "verdict-answer/1.0",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "agent": {"name": "VERDICT", "version": __version__, "llm": s["llm"], "graph_access": s["tool_calls"][0]["via"] if s["tool_calls"] else None},
        "trigger": s["trigger"],
        "case": {
            "status": s["status"],
            "fraud_pattern": {"label": last["pattern"], "display": last["pattern_display"], "probability": last["pattern_prob"],
                              "undocumented": last["undocumented_pattern"], "hypothesis": last.get("hypothesis"),
                              "alternatives": last["patterns"][:4], "documented_signature_match": last["signature_match"]},
            "risk_assessment": {"p_fraud_before_evidence": first["p_fraud"], "ci80_before": first["ci80"],
                                "p_fraud_after_evidence": last["p_fraud"], "ci80_after": last["ci80"],
                                "risk_level": _risk_level(last["p_fraud"]), "decision_stability": after["decision_stability"]},
            "investigation_record": {
                "graph_queries": [{"tool": c["tool"], "args": c["args"], "via": c["via"], "ms": round(c["ms"], 1), "ok": c["ok"]} for c in s["tool_calls"]],
                "evidence_ledger": last["ledger"],
                "belief_trajectory": s.get("trajectory", []),
                "findings": s["explanation"].get("evidence_for_fraud", []) + s["explanation"].get("evidence_against_fraud", []),
                "llm_investigation": s.get("llm_investigation"),
                "precedent_cases": s.get("precedents", []),
                "timeline": [{"ts": e["ts"], "phase": e["phase"], "type": e["type"], "title": e["title"]} for e in s["events"]],
            },
            "decisions": [{"phase": "BEFORE_EVIDENCE", "decision": before["decision"], "reason": before["reason"]},
                          {"phase": "AFTER_EVIDENCE", "decision": after["decision"], "reason": after["reason"]}],
            "actions_log": s["audit"],
            "summary": s["explanation"],
        },
        "next_best_action": {
            "before_evidence": _nba_view(before),
            "evidence_requests": [{k: r.get(k) for k in ("kind", "action", "basis", "reason", "evsi", "cost", "outcomes", "status", "response")}
                                  for r in s["evidence_requests"]],
            "counterfactual_branches": s.get("branches", {}),
            "simulated_responses": s.get("simulated_responses", {}),
            "after_evidence": _nba_view(after),
            "what_changed": after.get("what_changed"),
        },
        "suspicious_activity_report": s.get("sar"),
        "graph_write_back": graph_check or {},
    }


def to_markdown(a: dict) -> str:
    c, n = a["case"], a["next_best_action"]
    ra = c["risk_assessment"]
    L = [f"# Case {a['case_id']} - {c['fraud_pattern']['display']}", "",
         f"**Trigger:** {a['trigger'].get('trigger_type')} - {a['trigger'].get('detail')}  ",
         f"**Status:** {c['status']}  |  **Risk:** {ra['risk_level']}  |  **P(fraud):** {ra['p_fraud_before_evidence']:.2f} before evidence -> "
         f"{ra['p_fraud_after_evidence']:.2f} after (80% CI {ra['ci80_after'][0]:.2f}-{ra['ci80_after'][1]:.2f})", "",
         "## Summary", c["summary"]["executive_summary"], "",
         "## Evidence ledger (log-odds contributions)", "| Evidence | Source | Contribution |", "|---|---|---|"]
    for r in sorted(c["investigation_record"]["evidence_ledger"], key=lambda r: -abs(r["contribution"])):
        L.append(f"| {r['label']} | `{r['source']}` | {r['contribution']:+.2f} |")
    def nba(title, v):
        L.extend(["", f"## {title}: {v['decision']}", f"_{v['reason']}_", "", "| Action | Approval route | Status | Policy |", "|---|---|---|---|"])
        for x in v["actions"]:
            L.append(f"| {x['action']} | {x['approval_route']} | {x['status']} | {', '.join(x['policy_refs'])} |")
    nba("Next best action - before additional evidence", n["before_evidence"])
    if n["evidence_requests"]:
        L.extend(["", "## Evidence requested"])
        for r in n["evidence_requests"]:
            L.append(f"- **{r['kind']}** via {r['action']} ({r['basis']}): {r['reason']} -> response **{r.get('response')}**")
        for kind, br in n["counterfactual_branches"].items():
            L.append(f"- Branches for {kind}: " + "; ".join(f"{b['response']} -> P={b['p_fraud']:.2f} {b['decision']} {b['actions']}" for b in br))
    nba("Next best action - after evidence", n["after_evidence"])
    if a.get("suspicious_activity_report"):
        L.extend(["", "## Suspicious activity report", a["suspicious_activity_report"]["narrative_text"]])
    L.extend(["", "## Graph write-back", f"`{json.dumps(a['graph_write_back'])}`"])
    return "\n".join(L) + "\n"


def write(s: dict, out_dir: Path | None = None, graph_check: dict | None = None) -> Path:
    out = Path(out_dir or settings.answers_dir)
    out.mkdir(parents=True, exist_ok=True)
    a = to_answer(s, graph_check)
    p = out / f"{s['case_id']}.json"
    p.write_text(json.dumps(a, indent=2, default=str))
    (out / f"{s['case_id']}.md").write_text(to_markdown(a))
    return p


def summary(rows: list[dict], out_dir: Path | None = None) -> Path:
    out = Path(out_dir or settings.answers_dir)
    df = pd.DataFrame(rows)
    lines = ["# Benchmark run summary", "", f"Generated {datetime.utcnow():%Y-%m-%d %H:%M} UTC. One JSON + one Markdown answer per case.", "",
             df.to_markdown(index=False) if len(df) else "(no cases)"]
    p = out.parent / "benchmark_summary.md"
    p.write_text("\n".join(lines) + "\n")
    return p
