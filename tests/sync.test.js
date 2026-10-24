// Simulace synchronizace dvou (tří) zařízení proti in-memory náhradě Supabase
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";
vi.mock("../src/supabase.js", () => import("./mockSupabase.js"));
class Store { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
if (!globalThis.navigator) globalThis.navigator = {};
Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
const setStore = st => Object.defineProperty(globalThis, "localStorage", { value: st, configurable: true, writable: true });
const { db, cfg } = await import("./mockSupabase.js");
const S = await import("../src/sync.js");
const M = await import("../src/syncMerge.js");

const t = (name, fn) => it(name, fn);
let tick = 0; const ts = () => new Date(Date.now() + (++tick) * 1000).toISOString();
const uuid = () => crypto.randomUUID();
const dev = name => ({ name, store: new Store(), state: { decks: [], folders: [], gameStats: { xp: 0, dailyStreak: 0 } } });
async function sync(d, full = false, during) {
  setStore(d.store);
  const snap = d.state;
  const p = S.runSync(snap, { userId: "u1", username: "tom", full });
  if (during) during();                       // změna během syncu
  const res = await p;
  assert.ok(res.ok, `${d.name} sync failed: ${res.error}`);
  d.state = {
    decks: M.reconcileDecks(d.state.decks, snap.decks, res.decks),
    folders: M.reconcileList(d.state.folders, snap.folders, res.folders),
    gameStats: d.state.gameStats === snap.gameStats ? res.gameStats : d.state.gameStats,
  };
  return res;
}
const word = (en, cs) => ({ id: uuid(), en, cs, vmBox: 1, vmNextReview: null, vmLastReview: null, wStats: { total: 0, correct: 0, wrong: 0 }, addedAt: Date.now(), updatedAt: ts() });
const findW = (d, en) => d.state.decks.flatMap(x => x.words).find(w => w.en === en);
const dirty = d => { setStore(d.store); return M.countDirty(d.state, S.tombstoneCount()); };

describe("synchronizace (F4)", () => {
const A = dev("A"), B = dev("B");

t("A vytvoří balíček + 3 slova + složku → push", async () => {
  const f = { id: uuid(), name: "B1", lang: "en", createdAt: Date.now(), updatedAt: ts() };
  A.state.folders = [f];
  A.state.decks = [{ id: uuid(), name: "Fráze", lang: "en", folderId: f.id, createdAt: Date.now(), updatedAt: ts(), deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 }, words: [word("dog", "pes"), word("cat", "kočka"), word("out of order", "mimo provoz")] }];
  const r = await sync(A, true);
  assert.equal(db.decks.length, 1); assert.equal(db.cards.length, 3); assert.equal(db.folders.length, 1);
  assert.equal(dirty(A), 0, "po syncu nic neodeslaného");
  assert.equal(r.stats.pushed, 5);
});

t("B (nové zařízení) full sync → stáhne vše vč. složky", async () => {
  await sync(B, true);
  assert.equal(B.state.decks[0].words.length, 3);
  assert.equal(B.state.folders[0].name, "B1");
  assert.equal(B.state.decks[0].folderId, A.state.folders[0].id);
  assert.equal(dirty(B), 0);
});

t("rychlý sync beze změn nic neodesílá a vrací stejné objekty", async () => {
  const before = A.state.decks[0];
  cfg.calls = [];
  const r = await sync(A);
  assert.equal(r.stats.pushed, 0);
  assert.equal(A.state.decks[0], before, "identita zachována (žádný zbytečný re-render)");
  assert.ok(!cfg.calls.some(c => c.endsWith("upsert") && !c.startsWith("profiles")), "žádný upsert dat");
});

t("A odpoví (statistiky) → B dostane wStats, box, lastReview, deckStats", async () => {
  A.state.decks = A.state.decks.map(d => ({ ...d, updatedAt: ts(), deckStats: { ...d.deckStats, totalAnswers: 1, correctAnswers: 1 },
    words: d.words.map(w => w.en !== "dog" ? w : { ...w, vmBox: 2, vmLastReview: Date.now(), vmNextReview: Date.now() + 3 * 864e5, wStats: { total: 1, correct: 1, wrong: 0 }, updatedAt: ts() }) }));
  assert.equal(dirty(A), 2);
  const r = await sync(A); assert.equal(r.stats.pushed, 2, "jen balíček + 1 slovo");
  await sync(B);
  const w = findW(B, "dog");
  assert.deepEqual(w.wStats, { total: 1, correct: 1, wrong: 0 }); assert.equal(w.vmBox, 2); assert.ok(w.vmLastReview);
  assert.equal(B.state.decks[0].deckStats.totalAnswers, 1);
});

t("B smaže slovo → A ho po rychlém syncu nemá a nevrátí se", async () => {
  setStore(B.store);
  const id = findW(B, "cat").id;
  S.addTombstones("cards", [id]);
  B.state.decks = B.state.decks.map(d => ({ ...d, updatedAt: ts(), words: d.words.filter(w => w.id !== id) }));
  await sync(B);
  assert.ok(db.cards.find(c => c.id === id).deleted_at);
  await sync(A);
  assert.equal(findW(A, "cat"), undefined);
  await sync(A, true); await sync(B, true);
  assert.equal(findW(A, "cat"), undefined); assert.equal(findW(B, "cat"), undefined);
  setStore(B.store); assert.equal(S.tombstoneCount(), 0, "tombstone vyčištěn");
});

t("konflikt: obě zařízení upraví totéž slovo → vyhraje novější", async () => {
  A.state.decks = A.state.decks.map(d => ({ ...d, words: d.words.map(w => w.en !== "dog" ? w : { ...w, cs: "pes (A)", updatedAt: ts() }) }));
  B.state.decks = B.state.decks.map(d => ({ ...d, words: d.words.map(w => w.en !== "dog" ? w : { ...w, cs: "pes (B)", updatedAt: ts() }) }));
  await sync(A); await sync(B); await sync(A);
  assert.equal(findW(A, "dog").cs, "pes (B)"); assert.equal(findW(B, "dog").cs, "pes (B)");
});

t("race: úprava během syncu se neztratí a odešle se příště", async () => {
  A.state.decks = A.state.decks.map(d => ({ ...d, words: d.words.map(w => w.en !== "out of order" ? w : { ...w, synonyms: "broken", updatedAt: ts() }) }));
  await sync(A, false, () => {
    A.state = { ...A.state, decks: A.state.decks.map(d => ({ ...d, words: d.words.map(w => w.en !== "dog" ? w : { ...w, example: "Good dog.", updatedAt: ts() }) })) };
  });
  assert.equal(findW(A, "dog").example, "Good dog.", "změna během syncu zachována");
  assert.equal(findW(A, "out of order").synonyms, "broken");
  assert.equal(dirty(A), 1, "změna během syncu čeká na odeslání");
  await sync(A); assert.equal(dirty(A), 0);
  await sync(B); assert.equal(findW(B, "dog").example, "Good dog."); assert.equal(findW(B, "out of order").synonyms, "broken");
});

t("složka: přejmenování a smazání se propíše", async () => {
  A.state.folders = A.state.folders.map(f => ({ ...f, name: "B1 – fráze", updatedAt: ts() }));
  await sync(A); await sync(B);
  assert.equal(B.state.folders[0].name, "B1 – fráze");
  setStore(B.store);
  const fid = B.state.folders[0].id; S.addTombstones("folders", [fid]);
  B.state.folders = []; B.state.decks = B.state.decks.map(d => d.folderId === fid ? { ...d, folderId: null, updatedAt: ts() } : d);
  await sync(B); await sync(A);
  assert.equal(A.state.folders.length, 0); assert.equal(A.state.decks[0].folderId, null);
});

t("smazání balíčku na B → A ho smaže, full sync ho nevrátí", async () => {
  setStore(B.store);
  const id = B.state.decks[0].id; S.addTombstones("decks", [id]); B.state.decks = [];
  await sync(B); await sync(A); await sync(A, true);
  assert.equal(A.state.decks.length, 0);
});

t(">1000 slov: nové zařízení stáhne všechna (stránkování)", async () => {
  const words = Array.from({ length: 2345 }, (_, i) => word("w" + i, "s" + i));
  A.state.decks = [{ id: uuid(), name: "Velký", lang: "en", createdAt: Date.now(), updatedAt: ts(), deckStats: {}, words }];
  await sync(A);
  const C = dev("C"); await sync(C, true);
  assert.equal(C.state.decks.find(d => d.name === "Velký").words.length, 2345);
});

t("chyba sítě při uploadu → výsledek se neaplikuje, data zůstanou neodeslaná", async () => {
  A.state.decks = A.state.decks.map(d => ({ ...d, words: d.words.map((w, i) => i ? w : { ...w, cs: "změna", updatedAt: ts() }) }));
  const before = dirty(A);
  cfg.failTable = "cards";
  setStore(A.store);
  const res = await S.runSync(A.state, { userId: "u1", username: "tom" });
  cfg.failTable = null;
  assert.equal(res.ok, false);
  assert.equal(dirty(A), before, "lokální stav beze změny, odešle se příště");
  await sync(A); assert.equal(dirty(A), 0);
});

t("data z doby před F4 (bez _syncedAt) → první full sync doplní statistiky do Supabase", async () => {
  const D = dev("D");
  const legacyTs = ts();
  const w = { ...word("legacy", "starý"), updatedAt: legacyTs, wStats: { total: 5, correct: 4, wrong: 1 }, vmLastReview: Date.now() };
  const deck = { id: uuid(), name: "Starý", lang: "en", updatedAt: legacyTs, deckStats: { totalAnswers: 5, correctAnswers: 4, roundsCompleted: 1 }, words: [w] };
  // řádky v Supabase jako před migrací (bez nových sloupců), stejné updated_at
  db.decks.push({ id: deck.id, user_id: "u1", name: "Starý", language_pair: "en", updated_at: legacyTs, server_updated_at: "2026-01-01T00:00:00Z" });
  db.cards.push({ id: w.id, deck_id: deck.id, user_id: "u1", english: "legacy", czech: "starý", box: 1, xp: 0, updated_at: legacyTs, server_updated_at: "2026-01-01T00:00:00Z" });
  D.state.decks = [deck];
  await sync(D, true);
  assert.deepEqual(db.cards.find(c => c.id === w.id).w_stats, { total: 5, correct: 4, wrong: 1 });
  assert.equal(db.decks.find(c => c.id === deck.id).deck_stats.totalAnswers, 5);
  assert.equal(dirty(D), 0);
});

t("gameStats: XP z A se dostane na B při full syncu", async () => {
  A.state.gameStats = { xp: 420, dailyStreak: 3, lastStudyDate: "2026-10-24", updatedAt: ts() };
  await sync(A); await sync(B, true);
  assert.equal(B.state.gameStats.xp, 420);
  assert.equal(db.user_stats[0].level, 4);
});

});
