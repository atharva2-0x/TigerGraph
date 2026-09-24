"""Benchmark answer files: one JSON (machine) + one Markdown (human) file per case, plus a summary.

The JSON layout follows the submission requirements in the brief: the case with its internal investigation record,
evidence, findings, decisions and actions; the SAR when policy requires one; and the next best action with its
approval route recorded before any additional evidence is requested and after it is received. If the official
README prescribes different field names, adapt ``to_answer`` only.
"""
from __future__ import annotations

import json
import re
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
                "subgraph": s.get("subgraph"),
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


def to_hhgoa_submission(a: dict, latency_s: float | None = None) -> dict:
    """Add the exact HHGOA submission fields while preserving VERDICT's richer internal record."""
    trigger = a.get("trigger", {})
    case = a["case"]
    record = case.get("investigation_record", {})
    subgraph = record.get("subgraph") or {}
    nodes = subgraph.get("nodes") or []
    pattern_info = case.get("fraud_pattern") or {}
    assessment = case.get("risk_assessment") or {}
    action_plan = a.get("next_best_action") or {}
    before = action_plan.get("before_evidence") or {}
    after = action_plan.get("after_evidence") or {}
    raw_sar = a.get("suspicious_activity_report") or {}
    activity = raw_sar.get("activity") or {}
    subject = raw_sar.get("subject") or {}
    narrative_parts = raw_sar.get("narrative") or {}
    txn_id = str(trigger.get("trigger_txn_id") or "")
    card_id = str(trigger.get("card_id") or "")
    customer_id = str(trigger.get("customer_id") or "")

    def unique(values):
        return list(dict.fromkeys(str(v) for v in values if v not in (None, "")))

    def actual_card(value):
        value = str(value or "")
        return value.startswith("C") and "-K" in value and not value.startswith("CC-")

    graph_cards = [n.get("id") for n in nodes if n.get("type") == "Card" and n.get("linked") and actual_card(n.get("id"))]
    connected_cards = unique(c for c in [*(subject.get("linked_cards") or []), *graph_cards] if actual_card(c) and c != card_id)
    device_profiles = unique(
        f"{n.get('label') or 'device'} (profile {n.get('id')})" if n.get("id") else n.get("label")
        for n in nodes if n.get("type") == "Device"
    )

    involved = [str(v) for v in (activity.get("involved_transactions") or []) if v]
    affected_txns = unique([*involved, txn_id]) if involved else ([txn_id] if txn_id else [])
    first_txn = involved[0] if involved else txn_id
    transaction_node = next((n for n in nodes if n.get("type") == "Transaction" and (n.get("trigger") or n.get("id") == txn_id)), {})
    try:
        amount = float(activity.get("amount", 0) or 0)
    except (TypeError, ValueError):
        amount = 0.0
    if not amount:
        match = re.search(r"\$([\d,]+(?:\.\d{1,2})?)", str(trigger.get("detail") or transaction_node.get("label") or ""))
        amount = float(match.group(1).replace(",", "")) if match else 0.0
    try:
        exposure = float(activity.get("amount_at_risk", amount) or amount)
    except (TypeError, ValueError):
        exposure = amount

    labels = {"CARD_TESTING": "card_testing", "CARD_NOT_PRESENT_FRAUD": "card_not_present_fraud",
              "CARD_NOT_PRESENT_NEW_DEVICE": "card_not_present_new_device", "OUT_OF_REGION_USE": "out_of_region_use",
              "ACCOUNT_TAKEOVER": "account_takeover", "UNDOCUMENTED": "undocumented", "NONE": "none"}
    raw_pattern = str(pattern_info.get("label") or "").upper()
    display_pattern = str(pattern_info.get("display") or raw_pattern)
    if pattern_info.get("undocumented") or raw_pattern.startswith("UNDOCUMENTED"):
        normalized_pattern = "undocumented"
    elif "LEGITIMATE" in raw_pattern or "LEGITIMATE" in display_pattern.upper():
        normalized_pattern = "none"
    else:
        normalized_pattern = labels.get(raw_pattern, "undocumented" if raw_pattern else "none")

    try:
        probability = float(after.get("p_fraud", assessment.get("p_fraud_after_evidence", 0.5)))
    except (TypeError, ValueError):
        probability = 0.5
    decision = str(after.get("decision") or "GATHER").upper()
    if decision == "RELEASE" and probability < 0.3:
        verdict = "legitimate"
    elif decision == "PROTECT" and probability >= 0.8:
        verdict = "fraud"
    else:
        verdict = "uncertain"
    final_codes = [x.get("action") for x in (after.get("actions") or [])]
    case_status = "escalated" if "ESCALATE_TO_ANALYST" in final_codes else "open"
    if case.get("status") == "CLOSED":
        case_status = "closed_legitimate" if verdict == "legitimate" else "closed_fraud" if verdict == "fraud" else "open"

    ledger = record.get("evidence_ledger") or []
    evidence = []
    for row in ledger:
        if row.get("key") == "base_rate":
            continue
        source_ref = str(row.get("source") or "evidence_ledger")
        source = "document" if source_ref.startswith("rag_search_docs") else "customer" if "customer" in source_ref else "graph"
        entity_ids = [txn_id, card_id, customer_id]
        if row.get("key") in {"prior_fraud_case", "prior_cleared_case", "precedent_fraud_majority", "precedent_cleared_majority"}:
            entity_ids.extend(
                str(p.get("case_id")) for p in (record.get("precedent_cases") or [])
                if str(p.get("case_id", "")).startswith("CC-")
            )
        contribution = float(row.get("contribution") or 0)
        evidence.append({"claim": row.get("label") or str(row.get("key") or "Observed signal"), "source": source,
                         "ref": source_ref, "entity_ids": unique(entity_ids),
                         "log_odds_contribution": round(contribution, 3),
                         "effect": "supports_fraud" if contribution > 0 else "weighs_against_fraud" if contribution < 0 else "neutral"})

    precedent_ids = unique(
        p.get("case_id") for p in (record.get("precedent_cases") or [])
        if str(p.get("case_id", "")).startswith("CC-")
    )
    positive = [r["claim"] for r in evidence if r["effect"] == "supports_fraud"][:2]
    negative = [r["claim"] for r in evidence if r["effect"] == "weighs_against_fraud"][:2]
    interval = assessment.get("ci80_after") or [probability, probability]
    summary_parts = [str(trigger.get("detail") or f"Investigation of transaction {txn_id} on card {card_id}.")]
    if positive:
        summary_parts.append("Graph evidence supporting fraud included " + "; ".join(positive) + ".")
    if negative:
        summary_parts.append("Counter-evidence included " + "; ".join(negative) + ".")
    summary_parts.append(
        f"The calibrated fraud probability is {probability:.2f} (80% interval {float(interval[0]):.2f}–{float(interval[1]):.2f}); "
        f"the conclusion is {verdict} and the best action is {decision}."
    )
    summary_parts.append(str(after.get("reason") or "The investigation stopped after reviewing the available graph evidence."))
    summary = " ".join(summary_parts[:5])

    hypothesis = pattern_info.get("hypothesis") or {}
    pattern_description = ""
    if normalized_pattern == "undocumented":
        description = str(hypothesis.get("description") or "Residual graph analysis found coordinated activity outside the documented typologies.")
        name = str(hypothesis.get("name") or display_pattern.partition(":")[2].strip() or "residual pattern")
        prefix = "Confirmed-fraud cases not explained by the documented typologies, characterised by:"
        details = description.removeprefix(prefix).strip() if description.startswith(prefix) else description
        pattern_description = (
            f"Residual analysis found confirmed-fraud cases outside the documented typologies, with {details.rstrip('.')}. "
            f"This case maps to the {name} hypothesis; the finding is an analyst-review hypothesis rather than a confirmed typology."
        )

    def actions(rows):
        out = []
        for row in rows or []:
            refs = row.get("policy_refs") or []
            reason = row.get("rationale") or (f"Policy {', '.join(refs)}." if refs else "Recommended by the policy engine.")
            out.append({"action": row.get("action"), "route": row.get("approval_route"), "reason": reason})
        return out

    request_type = {"CUSTOMER_VALIDATION": "customer_validation", "STEP_UP_AUTH": "step_up_auth", "ANALYST_INFO": "analyst_info"}
    evidence_requests = []
    for request in action_plan.get("evidence_requests") or []:
        kind = str(request.get("kind") or "").upper()
        evidence_requests.append({"type": request_type.get(kind, kind.lower()), "asked_after_step": 1,
                                 "assumed_response": str(request.get("response") or "pending")})

    llm_usage = (a.get("agent", {}).get("llm") or {}).get("usage") or {}
    tokens = sum(int(llm_usage.get(k, 0) or 0) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens"))
    sar_file = bool(after.get("sar_required"))
    sar_rules = (raw_sar.get("filing_required_by") or []) if sar_file else []
    date = str(activity.get("date") or trigger.get("trigger_time") or "")[:10]
    if sar_file:
        criteria = []
        if exposure > 1000:
            criteria.append("exposure exceeds $1,000")
        if connected_cards:
            criteria.append("shared-entity links to other cards")
        if normalized_pattern == "undocumented":
            criteria.append("an undocumented pattern")
        qualifier = ", ".join(criteria) or "the policy's qualifying exposure or shared-entity criteria"
        sar_reason = f"Filed under {', '.join(sar_rules) or 'R2'}: strong suspicion plus {qualifier}. The filing remains subject to L2 approval."
        sar_narrative = [
            f"This report concerns customer {customer_id} and card {card_id}.",
            f"At {activity.get('date') or trigger.get('trigger_time') or 'the recorded transaction time'}, transaction {txn_id} for ${amount:,.2f} was identified.",
            str(narrative_parts.get("where") or "The supplied transaction record does not include a merchant or physical location."),
            f"The activity was assessed as {display_pattern}, with calibrated P(fraud) {probability:.2f} and an 80% interval of {float(interval[0]):.2f}–{float(interval[1]):.2f}.",
            "Supporting evidence included " + ("; ".join(positive) if positive else "graph-linked transaction and entity context") + ".",
            "Evidence weighing against fraud included " + ("; ".join(negative) if negative else "no material contradictory graph signal recorded") + ".",
            (f"The graph linked the activity to cards {', '.join(connected_cards[:5])}." if connected_cards else "No additional card was included as a connected subject in this report."),
            f"The policy recommends {', '.join(final_codes) or 'analyst review'}; FILE_REPORT requires L2 approval under {', '.join(sar_rules) or 'R2'}."
        ]
        sar_subjects = unique([customer_id, card_id, *connected_cards, *[n.get("id") for n in nodes if n.get("type") == "Device"]])
        sar = {"file": True, "reason": sar_reason, "narrative": " ".join(sar_narrative), "subjects": sar_subjects,
               "total_amount_usd": round(exposure, 2), "activity_dates": [date, date] if date else []}
    else:
        sar = {"file": False,
               "reason": "Not filed under R2: the case did not meet the strong-suspicion threshold together with a qualifying exposure, shared-entity, or undocumented-pattern condition.",
               "narrative": "", "subjects": [], "total_amount_usd": 0, "activity_dates": []}

    verdict_case = {
        "status": case_status,
        "verdict": verdict,
        "fraud_probability": round(probability, 4),
        "pattern": normalized_pattern,
        "pattern_description": pattern_description,
        "affected_txn_ids": affected_txns,
        "first_suspicious_txn_id": first_txn,
        "connected_card_ids": connected_cards,
        "connected_device_profiles": device_profiles,
        "exposure_usd": round(exposure, 2),
        "evidence": evidence,
        "similar_prior_cases": precedent_ids,
        "summary": summary,
        "written_to_graph": bool(a.get("graph_write_back", {}).get("verified")),
        "graph_case_id": str(a.get("graph_write_back", {}).get("vertex") or "").split("/")[-1]
                          if a.get("graph_write_back", {}).get("verified") else "",
    }
    what_changed = action_plan.get("what_changed") if evidence_requests else "nothing"
    return {
        "case_id": a["case_id"],
        "case": verdict_case,
        "evidence_requests": evidence_requests,
        "next_best_actions": {"initial": actions(before.get("actions")), "final": actions(after.get("actions")),
                              "what_changed": str(what_changed or "nothing")},
        "sar": sar,
        "stop_reason": str(after.get("reason") or "Investigation completed with the available graph evidence."),
        "tool_calls": len(record.get("graph_queries") or []),
        "tokens": tokens,
        "latency_s": round(float(latency_s if latency_s is not None else 0), 3),
        "agent": a.get("agent"),
        "graph_write_back": a.get("graph_write_back"),
    }


def write(s: dict, out_dir: Path | None = None, graph_check: dict | None = None,
          submission_dir: Path | None = None, latency_s: float | None = None) -> Path:
    out = Path(out_dir or settings.answers_dir)
    out.mkdir(parents=True, exist_ok=True)
    a = to_answer(s, graph_check)
    p = out / f"{s['case_id']}.json"
    p.write_text(json.dumps(a, indent=2, default=str))
    (out / f"{s['case_id']}.md").write_text(to_markdown(a))
    if submission_dir is not None:
        dest = Path(submission_dir)
        dest.mkdir(parents=True, exist_ok=True)
        submission = to_hhgoa_submission(a, latency_s=latency_s)
        (dest / f"{s['case_id']}.json").write_text(json.dumps(submission, indent=2, default=str))
    return p


def summary(rows: list[dict], out_dir: Path | None = None) -> Path:
    out = Path(out_dir or settings.answers_dir)
    df = pd.DataFrame(rows)
    lines = ["# Benchmark run summary", "", f"Generated {datetime.utcnow():%Y-%m-%d %H:%M} UTC. One JSON + one Markdown answer per case.", "",
             df.to_markdown(index=False) if len(df) else "(no cases)"]
    p = out.parent / "benchmark_summary.md"
    p.write_text("\n".join(lines) + "\n")
    return p
