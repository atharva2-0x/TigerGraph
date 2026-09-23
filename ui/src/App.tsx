import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, pct, post } from "./api";
import GraphView from "./GraphView";
import { Ledger, PatternBars, Reliability, Trajectory, Weights } from "./Charts";

type Tab = "queue" | "room" | "memory" | "score" | "policy";

// ----------------------------------------------------------------- helpers
const DECISION_LABEL: Record<string, string> = { PROTECT: "Protect", RELEASE: "Release", GATHER: "Gather evidence" };
const DECISION_ICON: Record<string, string> = { PROTECT: "■", RELEASE: "✓", GATHER: "?" };

function Decision({ d }: { d?: string }) {
  if (!d) return <span className="muted">–</span>;
  return (
    <span className={`badge dec-${d}`}>
      <span aria-hidden>{DECISION_ICON[d]}</span>
      {DECISION_LABEL[d] || d}
    </span>
  );
}

function Route({ r }: { r: string }) {
  return <span className={`badge route-${r}`}>{r === "AUTO" ? "auto" : r.replaceAll("_", " ").toLowerCase()}</span>;
}

/** Normalise live investigation state and stored answer files to one view model. */
function toView(s: any) {
  if (!s) return null;
  if (s.from_file) {
    const a = s.answer;
    const ir = a.case.investigation_record;
    const act = (x: any) => ({ code: x.action, route: x.approval_route, status: x.status, clauses: x.policy_refs, rationale: x.rationale });
    const nb = (v: any) => v && { ...v, actions: v.actions.map(act), pattern: a.case.fraud_pattern.display };
    return {
      status: a.case.status,
      trigger: a.trigger,
      events: ir.timeline,
      subgraph: ir.subgraph,
      trajectory: ir.belief_trajectory,
      ledger: ir.evidence_ledger,
      patterns: a.case.fraud_pattern.alternatives,
      hypothesis: a.case.fraud_pattern.hypothesis,
      before: nb(a.next_best_action.before_evidence),
      after: nb(a.next_best_action.after_evidence),
      requests: a.next_best_action.evidence_requests,
      branches: a.next_best_action.counterfactual_branches,
      explanation: a.case.summary,
      sar: a.suspicious_activity_report,
      precedents: ir.precedent_cases,
      policyHits: [],
      tools: ir.graph_queries,
      writeBack: a.graph_write_back,
      live: false,
    };
  }
  const last = (s.assessments || [])[s.assessments?.length - 1];
  return {
    status: s.status,
    trigger: s.trigger,
    events: s.events,
    subgraph: s.subgraph,
    trajectory: s.trajectory,
    ledger: last?.ledger,
    patterns: last?.patterns,
    hypothesis: last?.hypothesis,
    before: s.nba_before_evidence,
    after: s.nba_after_evidence,
    requests: s.evidence_requests,
    branches: s.branches,
    explanation: s.explanation,
    sar: s.sar,
    precedents: s.precedents,
    policyHits: s.context_pack?.policy || [],
    tools: s.tool_calls,
    writeBack: s.answer?.graph_write_back,
    live: true,
    p: last?.p_fraud,
    ci: last?.ci80,
    patternDisplay: last?.pattern_display,
  };
}

// --------------------------------------------------------------------- app
export default function App() {
  const [tab, setTab] = useState<Tab>("queue");
  const [health, setHealth] = useState<any>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const refresh = useCallback(() => get("/api/cases").then(setCases).catch(() => {}), []);
  useEffect(() => {
    get("/api/health").then(setHealth).catch(() => setHealth({ ok: false }));
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const open = (id: string) => {
    setSel(id);
    setTab("room");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <b>VERDICT</b>
          <span>agentic fraud investigation on TigerGraph</span>
        </div>
        <nav className="tabs">
          {(
            [
              ["queue", "Case queue"],
              ["room", "Investigation room"],
              ["memory", "Memory & patterns"],
              ["score", "Scoreboard"],
              ["policy", "Policy"],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </nav>
        <div className="chips">
          <span className="chip">
            <span className="dot" style={{ background: health?.ok ? "var(--good)" : "var(--critical)" }} /> TigerGraph · {health?.graph || "?"}
          </span>
          <span className="chip">
            <span className="dot" style={{ background: health?.graph_access === "mcp" ? "var(--good)" : "var(--warning)" }} />
            {health?.graph_access === "mcp" ? "TigerGraph MCP" : "direct GSQL"}
          </span>
          <span className="chip">
            <span className="dot" style={{ background: health?.llm ? "var(--good)" : "var(--warning)" }} />
            {health?.llm ? `Claude · ${health.model}` : "LLM offline (templates)"}
          </span>
        </div>
      </header>
      <main>
        {health?.synthetic && (
          <div className="warn-banner">
            Running on the <b>synthetic stand-in dataset</b> (same shape as HHGOA_IEEE). Place the official files in <span className="mono">data/hhgoa</span> and run{" "}
            <span className="mono">verdict bootstrap</span> to switch.
          </div>
        )}
        {tab === "queue" && <Queue cases={cases} open={open} refresh={refresh} />}
        {tab === "room" && (sel ? <Room id={sel} onChange={refresh} /> : <div className="panel muted">Pick a case from the queue.</div>)}
        {tab === "memory" && <Memory />}
        {tab === "score" && <Score />}
        {tab === "policy" && <Policy />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------- queue
function Queue({ cases, open, refresh }: { cases: any[]; open: (id: string) => void; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [trig, setTrig] = useState({ trigger_type: "CUSTOMER_REPORT", trigger_txn_id: "", detail: "" });
  const runAll = async () => {
    setBusy(true);
    for (const c of cases.filter((c) => c.case_id.startsWith("HHG") && c.status === "NEW")) {
      await post(`/api/cases/${c.case_id}/investigate`).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
    }
    setBusy(false);
    refresh();
  };
  const start = async (id: string) => {
    await post(`/api/cases/${id}/investigate`);
    open(id);
  };
  const newTrigger = async () => {
    const r = await post("/api/triggers", trig);
    open(r.case_id);
  };
  const done = cases.filter((c) => c.decision_after).length;
  return (
    <div className="grid">
      <div className="kpis">
        <div className="panel kpi">
          <div className="v">{cases.length}</div>
          <div className="l">cases in queue</div>
        </div>
        <div className="panel kpi">
          <div className="v">{done}</div>
          <div className="l">investigated</div>
        </div>
        <div className="panel kpi">
          <div className="v">{cases.filter((c) => c.decision_before === "GATHER").length}</div>
          <div className="l">needed more evidence</div>
        </div>
        <div className="panel kpi">
          <div className="v">{cases.filter((c) => c.status === "PENDING_APPROVAL").length}</div>
          <div className="l">awaiting human approval</div>
        </div>
      </div>
      <div className="panel">
        <h3>New trigger</h3>
        <div className="trigger-form">
          <select value={trig.trigger_type} onChange={(e) => setTrig({ ...trig, trigger_type: e.target.value })}>
            <option>CUSTOMER_REPORT</option>
            <option>RISK_SIGNAL</option>
            <option>ANALYST_REQUEST</option>
          </select>
          <input placeholder="transaction id" value={trig.trigger_txn_id} onChange={(e) => setTrig({ ...trig, trigger_txn_id: e.target.value })} />
          <input placeholder="report text / analyst note" value={trig.detail} onChange={(e) => setTrig({ ...trig, detail: e.target.value })} />
          <button className="btn primary" disabled={!trig.trigger_txn_id} onClick={newTrigger}>
            Investigate
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Benchmark case pack</h3>
          <button className="btn" disabled={busy} onClick={runAll}>
            {busy ? "Running…" : "Investigate all new"}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Trigger</th>
                <th>Detail</th>
                <th>Pattern</th>
                <th>P before</th>
                <th>NBA before</th>
                <th>P after</th>
                <th>NBA after</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.case_id} className="click" onClick={() => c.status !== "NEW" && open(c.case_id)}>
                  <td className="mono">{c.case_id}</td>
                  <td>{c.trigger_type}</td>
                  <td className="muted" style={{ maxWidth: 320 }}>
                    {(c.detail || "").slice(0, 90)}
                  </td>
                  <td>{c.pattern || <span className="muted">–</span>}</td>
                  <td>{pct(c.p_before)}</td>
                  <td>
                    <Decision d={c.decision_before} />
                  </td>
                  <td>{pct(c.p_after)}</td>
                  <td>
                    <Decision d={c.decision_after} />
                  </td>
                  <td className="status">{c.status}</td>
                  <td>
                    {c.status === "NEW" ? (
                      <button
                        className="btn primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          start(c.case_id);
                        }}
                      >
                        Investigate
                      </button>
                    ) : (
                      <button className="btn">Open</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------- investigation room
function Room({ id, onChange }: { id: string; onChange: () => void }) {
  const [s, setS] = useState<any>(null);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [learn, setLearn] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get(`/api/cases/${id}`).then(setS).catch(() => {}), [id]);

  useEffect(() => {
    setS(null);
    setLiveEvents([]);
    setLearn(null);
    load();
    const es = new EventSource(`/api/cases/${id}/events`);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      setLiveEvents((x) => [...x, ev]);
      if (["status", "nba", "assessment", "done", "graph", "error", "rag"].includes(ev.type)) load();
    };
    return () => es.close();
  }, [id, load]);

  const v = useMemo(() => toView(s), [s]);
  const events = liveEvents.length ? liveEvents : v?.events || [];
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setTimeout(() => {
        load();
        onChange();
      }, 700);
    }
  };
  if (!v) return <div className="panel muted">Loading {id}…</div>;
  const cur = v.after || v.before;
  const p = cur?.p_fraud ?? v.p;
  const ci = cur?.ci80 ?? v.ci;
  const pending = (v.requests || []).filter((r: any) => r.status === "REQUESTED");

  return (
    <div className="grid">
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="row">
              <b className="mono" style={{ fontSize: 16 }}>
                {id}
              </b>
              <span className="chip">{v.trigger?.trigger_type}</span>
              <span className="chip">{v.status}</span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {v.trigger?.detail}
            </div>
          </div>
          <div className="row">
            {v.after && v.live && (
              <>
                <button className="btn good" disabled={busy} onClick={() => act(async () => setLearn(await post(`/api/cases/${id}/resolve`, { outcome: "CLEARED" })))}>
                  Resolve: cleared
                </button>
                <button className="btn bad" disabled={busy} onClick={() => act(async () => setLearn(await post(`/api/cases/${id}/resolve`, { outcome: "CONFIRMED_FRAUD" })))}>
                  Resolve: fraud
                </button>
              </>
            )}
          </div>
        </div>
        {learn && (
          <div style={{ marginTop: 10 }} className="mono">
            Memory updated: model refit on {learn.n_cases} cases.{" "}
            {learn.weight_deltas.slice(0, 4).map((d: any) => `${d.signal} ${d.before}→${d.after}`).join(" · ")}
          </div>
        )}
      </div>

      <div className="room">
        <div className="panel">
          <h3>Agent timeline</h3>
          <div className="timeline">
            {events.map((e: any, i: number) => (
              <div key={i} className={`ev ${e.type}`}>
                <div className="t">{e.title}</div>
                <div className="m">
                  {e.phase} · {e.type}
                  {e.data?.ms !== undefined ? ` · ${e.data.ms} ms` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Graph evidence (from TigerGraph)</h3>
          {v.subgraph ? <GraphView graph={v.subgraph} /> : <div className="graph" />}
        </div>
        <div className="panel">
          <h3>Assessment</h3>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="big">{pct(p)}</div>
              <div className="muted">P(fraud) · 80% CI {ci ? `${pct(ci[0])}–${pct(ci[1])}` : "–"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Decision d={cur?.decision} />
              <div className="muted" style={{ marginTop: 6 }}>
                stability {cur ? pct(cur.decision_stability) : "–"}
              </div>
            </div>
          </div>
          {ci && (
            <div className="meter" aria-hidden>
              <div className="ci" style={{ left: `${ci[0] * 100}%`, width: `${Math.max(1, (ci[1] - ci[0]) * 100)}%` }} />
              <div className="pt" style={{ left: `calc(${(p || 0) * 100}% - 2px)` }} />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <b>{cur?.pattern || v.patternDisplay}</b>
            {v.hypothesis && <div className="muted">{v.hypothesis.description}</div>}
          </div>
          <h3 style={{ marginTop: 14 }}>Belief trajectory</h3>
          <Trajectory steps={v.trajectory} />
          <h3>Pattern probabilities (if fraud)</h3>
          <PatternBars patterns={v.patterns} />
        </div>
      </div>

      <div className="panel">
        <h3>Evidence ledger · log-odds contribution (red → fraud, blue → legitimate)</h3>
        <Ledger rows={v.ledger} />
      </div>

      <div className="decision">
        <NbaCard title="Next best action · before additional evidence" n={v.before} id={id} />
        <div className="panel">
          <h3>Evidence request</h3>
          {(v.requests || []).length === 0 && <div className="muted">None needed. {v.before?.reason}</div>}
          {(v.requests || []).map((r: any) => (
            <div key={r.kind} style={{ marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>
                  {r.kind} <span className="muted">via {r.action}</span>
                </b>
                <span className="chip">{r.basis === "policy" ? "policy-mandated" : "value of information"}</span>
              </div>
              <div className="muted" style={{ margin: "6px 0" }}>
                {r.reason}
              </div>
              {(v.branches?.[r.kind] || []).map((b: any) => (
                <div className="branch" key={b.response}>
                  <b>{b.response}</b>
                  <span>{pct(b.p_fraud)}</span>
                  <span className="muted">{b.actions.join(", ")}</span>
                </div>
              ))}
              {r.status === "REQUESTED" && v.live ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/api/cases/${id}/evidence`, { kind: r.kind }))}>
                    Receive benchmark response
                  </button>
                  {(v.branches?.[r.kind] || []).map((b: any) => (
                    <button key={b.response} className="btn" disabled={busy} onClick={() => act(() => post(`/api/cases/${id}/evidence`, { kind: r.kind, response: b.response }))}>
                      Simulate {b.response.toLowerCase()}
                    </button>
                  ))}
                </div>
              ) : (
                r.response && (
                  <div style={{ marginTop: 6 }}>
                    Response: <b>{r.response}</b>
                  </div>
                )
              )}
            </div>
          ))}
          {pending.length > 0 && <div className="muted">Waiting for evidence: the case is paused with the interim actions on the left.</div>}
        </div>
        <NbaCard title="Next best action · after evidence" n={v.after} id={id} live={v.live} busy={busy} act={act} />
      </div>

      {v.explanation && (
        <div className="decision">
          <div className="panel explain">
            <h3>Explanation {v.explanation.generated_by === "llm" ? "· Claude (claim-checked)" : "· template"}</h3>
            <p>{v.explanation.executive_summary}</p>
            <b>Evidence for fraud</b>
            <ul>
              {(v.explanation.evidence_for_fraud || []).map((x: string, i: number) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <b>Evidence against</b>
            <ul>
              {(v.explanation.evidence_against_fraud || []).map((x: string, i: number) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <p>
              <b>Remaining uncertainty:</b> {v.explanation.remaining_uncertainty}
            </p>
          </div>
          <div className="panel">
            <h3>Precedent cases (GraphRAG: vector + graph structure)</h3>
            <table>
              <tbody>
                {(v.precedents || []).map((c: any) => (
                  <tr key={c.case_id}>
                    <td className="mono">{c.case_id}</td>
                    <td className={c.outcome === "CONFIRMED_FRAUD" ? "pill-bad" : "pill-good"}>{c.outcome}</td>
                    <td>{c.pattern}</td>
                    <td className="muted">{(c.via || []).join(" + ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.policyHits.length > 0 && (
              <>
                <h3 style={{ marginTop: 12 }}>Policy clauses retrieved</h3>
                {v.policyHits.slice(0, 4).map((d: any) => (
                  <div key={d.chunk_id} className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    <span className="mono">{d.ref_id}</span> {d.text.slice(0, 140)}
                  </div>
                ))}
              </>
            )}
          </div>
          {v.sar && (
            <div className="panel">
              <h3>Suspicious activity report · {v.sar.filing_required_by?.join(", ")}</h3>
              <div className="sar">{v.sar.narrative_text}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {v.sar.tipping_off_note} {v.sar.claim_check ? `· claim check: ${v.sar.claim_check}` : ""}
              </div>
            </div>
          )}
        </div>
      )}
      {v.writeBack && Object.keys(v.writeBack).length > 0 && (
        <div className="panel mono">
          Graph write-back: {Object.entries(v.writeBack).map(([k, val]) => `${k}=${val}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function NbaCard({ title, n, id, live, busy, act }: { title: string; n: any; id: string; live?: boolean; busy?: boolean; act?: any }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      {!n ? (
        <div className="muted">Pending…</div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <Decision d={n.decision} />
            <span className="muted">
              P {pct(n.p_fraud)} · routes {(n.approval_routes || []).join(", ")}
            </span>
          </div>
          {n.actions.map((x: any) => (
            <div className="action" key={x.code}>
              <div>
                <b className="mono">{x.code}</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  {(x.clauses || []).join(", ")}
                </div>
              </div>
              <div className="row">
                <Route r={x.route} />
                <span className="status">{x.status}</span>
                {live && x.status === "PENDING_APPROVAL" && act && (
                  <>
                    <button className="btn good" disabled={busy} onClick={() => act(() => post(`/api/cases/${id}/approve`, { code: x.code, approved: true }))}>
                      Approve
                    </button>
                    <button className="btn bad" disabled={busy} onClick={() => act(() => post(`/api/cases/${id}/approve`, { code: x.code, approved: false }))}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {(n.forbidden || n.forbidden_by_policy || []).map((f: any, i: number) => (
            <div key={i} className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              ⛔ {f.code} blocked by {f.clause}: {f.reason}
            </div>
          ))}
          {n.sar_required && <div style={{ marginTop: 8 }} className="badge route-COMPLIANCE">SAR required</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {n.reason}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ memory
function Memory() {
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    get("/api/model").then(setM);
  }, []);
  if (!m) return <div className="panel muted">Loading…</div>;
  const hyps = m.discovered?.hypotheses || [];
  return (
    <div className="grid">
      <div className="panel">
        <h3>Undocumented patterns discovered in closed cases</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          Residual confirmed-fraud cases that no documented typology explains were clustered on their graph signals ({m.discovered?.n_residual} residual cases,
          k={m.discovered?.k}, silhouette {m.discovered?.silhouette}). Each hypothesis is stored in TigerGraph as a Pattern vertex linked to its cases.
        </div>
        <div className="decision" style={{ marginTop: 0 }}>
          {hyps.map((h: any) => (
            <div className="panel" key={h.pattern_id} style={{ background: "var(--panel-2)" }}>
              <b>{h.llm_name || h.name}</b> <span className="chip">{h.n_cases} cases</span>{" "}
              <span className="chip">{Math.round(h.undocumented_share * 100)}% unclassified by analysts</span>
              <p className="muted">{h.description}</p>
              <div className="mono muted">examples: {h.example_cases.slice(0, 5).join(", ")}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h3>Learning log (resolved cases update the evidence model)</h3>
        {m.learned_from.length === 0 && <div className="muted">No cases resolved in this session yet: resolve one from the investigation room.</div>}
        {m.learned_from.map((l: any, i: number) => (
          <div key={i} className="mono">
            {l.at} · {l.case_id} → {l.outcome} by {l.by}
          </div>
        ))}
        {m.learn_log.map((l: any, i: number) => (
          <div key={i} className="mono muted" style={{ marginTop: 4 }}>
            {l.case_id}: {l.weight_deltas.slice(0, 5).map((d: any) => `${d.signal} ${d.before}→${d.after}`).join(" · ")}
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Evidence-response likelihoods learned from history (drive value of information)</h3>
        <table>
          <thead>
            <tr>
              <th>Evidence</th>
              <th>Response</th>
              <th>P(response | fraud)</th>
              <th>P(response | legit)</th>
              <th>Likelihood ratio</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(m.evidence_likelihoods || {}).flatMap(([k, v]: any) =>
              Object.keys(v.fraud).map((r) => (
                <tr key={k + r}>
                  <td>{k}</td>
                  <td>{r}</td>
                  <td>{pct(v.fraud[r])}</td>
                  <td>{pct(v.legit[r])}</td>
                  <td>{(v.fraud[r] / v.legit[r]).toFixed(2)}×</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- scoreboard
function Score() {
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    get("/api/model").then(setM);
  }, []);
  if (!m) return <div className="panel muted">Loading…</div>;
  const b = m.backtest || {};
  return (
    <div className="grid">
      <div className="kpis">
        <div className="panel kpi">
          <div className="v">{b.auc_model}</div>
          <div className="l">AUC on held-out month (VERDICT evidence model)</div>
        </div>
        <div className="panel kpi">
          <div className="v">{b.auc_risk_score_only}</div>
          <div className="l">AUC of the bank's risk score alone</div>
        </div>
        <div className="panel kpi">
          <div className="v">{b.brier_model}</div>
          <div className="l">Brier score (lower is better)</div>
        </div>
        <div className="panel kpi">
          <div className="v">{b.pattern_accuracy !== undefined ? pct(b.pattern_accuracy) : "–"}</div>
          <div className="l">pattern accuracy ({b.pattern_test_cases} held-out fraud cases)</div>
        </div>
      </div>
      <div className="decision" style={{ marginTop: 0 }}>
        <div className="panel">
          <h3>Reliability · predicted vs observed (held-out)</h3>
          <Reliability bins={b.reliability} />
          <div className="muted" style={{ fontSize: 12 }}>
            Trained on {b.train_cases} closed cases before {b.split_at}, evaluated on {b.test_cases} later cases.
          </div>
        </div>
        <div className="panel">
          <h3>Learned evidence weights (log-odds per signal)</h3>
          <Weights weights={m.weights} />
        </div>
      </div>
      {b.pattern_confusion && (
        <div className="panel">
          <h3>Pattern confusion (held-out)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>actual \ predicted</th>
                  {Object.keys(b.pattern_confusion).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(b.pattern_confusion).map(([a, row]: any) => (
                  <tr key={a}>
                    <td>{a}</td>
                    {Object.keys(b.pattern_confusion).map((k) => (
                      <td key={k}>{row[k] || ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ policy
function Policy() {
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    get("/api/policy").then(setP);
  }, []);
  if (!p) return <div className="panel muted">Loading…</div>;
  return (
    <div className="decision" style={{ marginTop: 0 }}>
      <div className="panel">
        <h3>Action catalogue & approval routes ({p.version})</h3>
        <table>
          <tbody>
            {Object.entries(p.actions).map(([k, a]: any) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td>
                  <Route r={a.route} />
                </td>
                <td className="muted">{a.class}</td>
                <td className="muted">{(a.route_rules || []).map((r: any) => `${r.when} → ${r.route}`).join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Rules, prohibitions & SAR criteria</h3>
        {p.rules.map((r: any, i: number) => (
          <div key={i} className="mono" style={{ marginBottom: 6 }}>
            <b>{r.id}</b> <span className="muted">when</span> {r.when} <span className="muted">→</span> {r.recommend.join(", ")}
            {r.defer ? <span className="muted"> (defer {r.defer.join(", ")})</span> : null}
          </div>
        ))}
        {p.forbid.map((f: any, i: number) => (
          <div key={i} className="mono" style={{ marginBottom: 6, color: "#ffb3b3" }}>
            ⛔ {f.id}: {f.action} unless {f.unless}
          </div>
        ))}
        {p.sar.map((s: any, i: number) => (
          <div key={i} className="mono" style={{ color: "#ffe0a0" }}>
            SAR {s.id}: {s.when}
          </div>
        ))}
      </div>
    </div>
  );
}
