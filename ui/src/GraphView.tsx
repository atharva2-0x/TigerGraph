import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

const TYPE_COLORS: Record<string, string> = {
  Transaction: "#3987e5",
  Card: "#d95926",
  Customer: "#199e70",
  Device: "#c98500",
  EmailDomain: "#d55181",
  Region: "#008300",
  FraudCase: "#9085e9",
};

export default function GraphView({ graph }: { graph: any }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !graph) return;
    const els: any[] = [];
    for (const n of graph.nodes) {
      els.push({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          color: TYPE_COLORS[n.type] || "#888",
          size: n.trigger ? 46 : n.type === "Transaction" ? 22 : 30,
          ring: n.trigger ? "#ecebe6" : n.fraud || n.outcome === "CONFIRMED_FRAUD" ? "#e66767" : n.outcome === "CLEARED" ? "#0ca30c" : "#161920",
        },
      });
    }
    for (const e of graph.edges) els.push({ data: { id: `${e.source}->${e.target}-${e.type}`, source: e.source, target: e.target, label: e.type } });
    const cy = cytoscape({
      container: ref.current,
      elements: els,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            width: "data(size)",
            height: "data(size)",
            label: "data(label)",
            color: "#b7b9c2",
            "font-size": 9,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "border-width": 3,
            "border-color": "data(ring)",
          },
        },
        {
          selector: "edge",
          style: { width: 1.5, "line-color": "#3a4150", "curve-style": "bezier", "target-arrow-shape": "triangle", "target-arrow-color": "#3a4150", "arrow-scale": 0.7 },
        },
        { selector: "edge[label = 'SHARES_ENTITY']", style: { "line-color": "#e66767", "target-arrow-color": "#e66767", "line-style": "dashed" } },
        { selector: "edge[label = 'SIMILAR']", style: { "line-color": "#9085e9", "line-style": "dotted", "target-arrow-shape": "none" } },
      ],
      layout: { name: "cose", animate: true, animationDuration: 600, nodeRepulsion: () => 9000, idealEdgeLength: () => 70, padding: 20 } as any,
      wheelSensitivity: 0.2,
    });
    return () => cy.destroy();
  }, [graph]);
  return (
    <div>
      <div ref={ref} className="graph" role="img" aria-label="Investigation subgraph" />
      <div className="legend">
        {Object.entries(TYPE_COLORS).map(([k, c]) => (
          <span key={k} className="row" style={{ gap: 5 }}>
            <span className="dot" style={{ background: c }} />
            {k}
          </span>
        ))}
        <span className="row" style={{ gap: 5 }}>
          <span className="dot" style={{ background: "transparent", border: "2px solid #e66767" }} />
          prior fraud
        </span>
        <span className="row" style={{ gap: 5 }}>
          <span className="dot" style={{ background: "transparent", border: "2px solid #0ca30c" }} />
          cleared
        </span>
      </div>
    </div>
  );
}
