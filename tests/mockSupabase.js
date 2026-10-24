// In-memory náhrada Supabase klienta pro testy sync.js
export const db = { decks: [], cards: [], folders: [], user_stats: [], profiles: [] };
export const cfg = { maxRows: 1000, failTable: null, calls: [] };
let clock = Date.parse("2026-10-24T10:00:00Z");
const serverNow = () => new Date(clock += 1000).toISOString();
const FK = { cards: r => db.decks.some(d => d.id === r.deck_id) };

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = "select"; }
  select() { return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  gt(c, v) { this.f.push(r => r[c] > v); return this; }
  in(c, vs) { this.f.push(r => vs.includes(r[c])); return this; }
  order(c) { this.ord = c; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  maybeSingle() { this.single = true; return this; }
  update(obj) { this.op = "update"; this.obj = obj; return this; }
  upsert(rows) { this.op = "upsert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
  exec() {
    cfg.calls.push(this.t + ":" + this.op);
    if (cfg.failTable === this.t) return { data: null, error: { message: "simulated failure" } };
    const tbl = db[this.t];
    if (this.op === "upsert") {
      for (const r of this.rows) {
        if (FK[this.t] && !FK[this.t](r)) return { data: null, error: { message: "FK violation" } };
        if (Object.keys(r).some(k => k === undefined)) throw 0;
      }
      for (const r of this.rows) {
        const key = this.t === "user_stats" || this.t === "profiles" ? "user_id" : "id";
        const i = tbl.findIndex(x => x[key] === r[key]);
        const row = { ...(i >= 0 ? tbl[i] : {}), ...r, server_updated_at: serverNow() };
        if (i >= 0) tbl[i] = row; else tbl.push(row);
      }
      return { data: null, error: null };
    }
    let rows = tbl.filter(r => this.f.every(fn => fn(r)));
    if (this.op === "update") {
      rows.forEach(r => Object.assign(r, this.obj, { server_updated_at: serverNow() }));
      return { data: null, error: null };
    }
    if (this.ord) rows = [...rows].sort((a, b) => (a[this.ord] > b[this.ord] ? 1 : -1));
    if (this.rng) rows = rows.slice(this.rng[0], Math.min(this.rng[1] + 1, this.rng[0] + cfg.maxRows));
    if (this.single) return { data: rows[0] ?? null, error: null };
    return { data: rows.map(r => ({ ...r })), error: null };
  }
}
export const supabase = { from: t => new Q(t) };
