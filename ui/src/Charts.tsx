import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AX = { stroke: "#4a5060", fontSize: 11, tick: { fill: "#9ca0ad" } };
const TT = { contentStyle: { background: "#1c2029", border: "1px solid #272c37", borderRadius: 8, color: "#ecebe6", fontSize: 12 }, itemStyle: { color: "#ecebe6" } };

/** P(fraud) as each graph query adds its evidence; shaded band = 80% credible interval. */
export function Trajectory({ steps }: { steps: any[] }) {
  const data = (steps || []).map((s, i) => ({ i, step: s.step, p: s.p, band: [s.ci[0], s.ci[1]], added: (s.added || []).join(", ") }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 30, left: -8 }}>
        <CartesianGrid stroke="#222733" vertical={false} />
        <XAxis dataKey="step" {...AX} interval={0} angle={-25} textAnchor="end" height={40} />
        <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} {...AX} />
        <ReferenceLine y={0.5} stroke="#4a5060" strokeDasharray="3 3" />
        <Area dataKey="band" stroke="none" fill="#3987e5" fillOpacity={0.18} isAnimationActive={false} />
        <Line dataKey="p" stroke="#3987e5" strokeWidth={2} dot={{ r: 4, fill: "#3987e5", stroke: "#161920", strokeWidth: 2 }} isAnimationActive />
        <Tooltip
          {...TT}
          formatter={(v: any, n: any) => (n === "p" ? [`${(v * 100).toFixed(1)}%`, "P(fraud)"] : [`${(v[0] * 100).toFixed(0)}–${(v[1] * 100).toFixed(0)}%`, "80% CI"])}
          labelFormatter={(l: any, p: any) => `${l}${p?.[0]?.payload?.added ? " · +" + p[0].payload.added : ""}`}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Diverging bars: log-odds contribution of each ledger row (red = towards fraud, blue = away). */
export function Ledger({ rows }: { rows: any[] }) {
  const data = [...(rows || [])]
    .filter((r) => r.kind !== "prior" || r.key === "risk_score")
    .sort((a, b) => b.contribution - a.contribution)
    .map((r) => ({ name: r.key, v: +r.contribution.toFixed(2), label: r.label, src: r.source }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 24 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="#222733" horizontal={false} />
        <XAxis type="number" {...AX} />
        <YAxis type="category" dataKey="name" width={170} {...AX} tick={{ fill: "#b7b9c2", fontSize: 11 }} />
        <ReferenceLine x={0} stroke="#6b7080" />
        <Tooltip {...TT} cursor={{ fill: "#ffffff08" }} formatter={(v: any, _n: any, p: any) => [`${v > 0 ? "+" : ""}${v} log-odds · ${p.payload.src}`, p.payload.label]} labelFormatter={() => ""} />
        <Bar dataKey="v" radius={4} barSize={14}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.v >= 0 ? "#e66767" : "#3987e5"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PatternBars({ patterns }: { patterns: any[] }) {
  const data = (patterns || []).slice(0, 6).map((p) => ({ name: p.pattern, v: +(p.prob * 100).toFixed(1) }));
  return (
    <ResponsiveContainer width="100%" height={data.length * 24 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 8 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="name" width={170} {...AX} tick={{ fill: "#b7b9c2", fontSize: 11 }} />
        <Tooltip {...TT} cursor={{ fill: "#ffffff08" }} formatter={(v: any) => [`${v}%`, "P(pattern | fraud)"]} />
        <Bar dataKey="v" fill="#9085e9" radius={4} barSize={12} label={{ position: "right", fill: "#b7b9c2", fontSize: 11, formatter: (v: any) => `${v}%` }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Reliability diagram: predicted vs observed fraud rate on the held-out month. */
export function Reliability({ bins }: { bins: any[] }) {
  const data = (bins || []).map((b) => ({ x: b.predicted, y: b.observed, n: b.n, bin: b.bin }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 18, left: -8 }}>
        <CartesianGrid stroke="#222733" />
        <XAxis type="number" dataKey="x" domain={[0, 1]} {...AX} label={{ value: "predicted P(fraud)", position: "insideBottom", offset: -8, fill: "#7d8190", fontSize: 11 }} />
        <YAxis type="number" domain={[0, 1]} {...AX} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#4a5060" strokeDasharray="4 4" />
        <Line dataKey="y" stroke="#3987e5" strokeWidth={2} dot={{ r: 5, fill: "#3987e5", stroke: "#161920", strokeWidth: 2 }} isAnimationActive={false} />
        <Tooltip {...TT} formatter={(v: any, n: any, p: any) => [`${(v * 100).toFixed(0)}% observed (n=${p.payload.n})`, p.payload.bin]} labelFormatter={() => ""} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Learned weight per signal, as simple diverging HTML bars (red = towards fraud, blue = away). */
export function Weights({ weights }: { weights: any[] }) {
  const data = [...(weights || [])].sort((a, b) => b.weight - a.weight);
  const max = Math.max(...data.map((d) => Math.abs(d.weight)), 0.01);
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {data.map((d) => (
        <div key={d.signal} title={`${d.label}: ${d.weight.toFixed(2)} log-odds`} style={{ display: "grid", gridTemplateColumns: "190px 1fr 1fr 52px", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span className="muted" style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.signal}
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {d.weight < 0 && <div style={{ width: `${(-d.weight / max) * 100}%`, height: 10, background: "#3987e5", borderRadius: "4px 0 0 4px" }} />}
          </div>
          <div style={{ borderLeft: "1px solid #6b7080" }}>
            {d.weight > 0 && <div style={{ width: `${(d.weight / max) * 100}%`, height: 10, background: "#e66767", borderRadius: "0 4px 4px 0" }} />}
          </div>
          <span className="mono" style={{ color: "#b7b9c2" }}>
            {d.weight > 0 ? "+" : ""}
            {d.weight.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
