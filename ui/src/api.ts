export async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function post<T = any>(path: string, body: any = {}): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const pct = (p?: number) => (p === undefined || p === null ? "–" : `${(p * 100).toFixed(p > 0.99 || p < 0.01 ? 1 : 0)}%`);
