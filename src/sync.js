/* ══════════════════════════════════════════════════════════════
   sync.js — LexiCard offline-first Supabase sync (F4)
   ══════════════════════════════════════════════════════════════

   - Data primárně žijí v localStorage (aplikace funguje offline).
   - Úplná synchronizace (full): při startu / přihlášení / ručně.
     Stáhne všechny řádky (po stránkách – Supabase vrací max. 1000 na dotaz).
   - Rychlá synchronizace: po změnách, při návratu do aplikace, po obnovení připojení.
     Stáhne jen řádky změněné od minula (podle server_updated_at, který nastavuje databáze)
     a odešle jen neodeslané změny.
   - Mazání: položka se v Supabase označí deleted_at (měkké mazání), ostatní zařízení
     ji podle toho smažou. Lokálně se ID drží v „tombstone“ seznamu, dokud se neodešle.
   - Slučování a reconcile: viz syncMerge.js (čistá logika, testovatelná).

   Vyžaduje SQL migraci supabase/f4_sync_migration.sql.
══════════════════════════════════════════════════════════════ */

import { supabase } from "./supabase.js";
import { getLevel } from "./utils.js";
import {
  mergeSync, deckToRemote, cardToRemote, folderToRemote, isDirty, nowIso,
} from "./syncMerge.js";

/* ── Tombstones (lokálně smazané, ještě neodeslané položky) ── */
const TOMB_KEYS = { decks: "lc6_deletedDecks", cards: "lc6_deletedCards", folders: "lc6_deletedFolders" };

export function getTombstones(kind) {
  try { return new Set(JSON.parse(localStorage.getItem(TOMB_KEYS[kind]) || "[]")); }
  catch { return new Set(); }
}
export function addTombstones(kind, ids) {
  if (!ids?.length) return;
  const s = getTombstones(kind);
  ids.forEach(id => s.add(id));
  try { localStorage.setItem(TOMB_KEYS[kind], JSON.stringify([...s])); } catch { /* úložiště nedostupné */ }
}
function removeTombstones(kind, ids) {
  const s = getTombstones(kind);
  ids.forEach(id => s.delete(id));
  try { localStorage.setItem(TOMB_KEYS[kind], JSON.stringify([...s])); } catch { /* úložiště nedostupné */ }
}
export function tombstoneCount() {
  return getTombstones("decks").size + getTombstones("cards").size + getTombstones("folders").size;
}

/* ── Metadata synchronizace (per uživatel) ─────────────────── */
const META_KEY = "lc6_syncMeta";
export function getSyncMeta(userId) {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || "null");
    return m && m.userId === userId ? m : { userId, mark: null, lastSyncAt: null };
  } catch { return { userId, mark: null, lastSyncAt: null }; }
}
function saveSyncMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* úložiště nedostupné */ }
}

/* ── Pomocné funkce pro Supabase ───────────────────────────── */
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Stáhne všechny řádky tabulky po stránkách (od `since`, pokud je zadáno). */
async function fetchAll(table, userId, since) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select("*").eq("user_id", userId).order("id").range(from, from + 999);
    if (since) q = q.gt("server_updated_at", since);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data.length) break;
    rows.push(...data);
    from += data.length;          // funguje i při jiném limitu řádků než 1000
  }
  return rows;
}

async function upsertAll(table, rows) {
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict: "id" });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

/** Odešle lokální mazání (deleted_at). Vrací true, pokud vše prošlo. */
async function pushTombstones(userId) {
  const ts = nowIso();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const kind of ["decks", "cards", "folders"]) {
    let ids = [...getTombstones(kind)];
    if (kind !== "folders") {
      // decks.id / cards.id jsou v Supabase typu uuid – jiné ID tam být nemůže, jen by shodilo dotaz
      const invalid = ids.filter(id => !UUID.test(id));
      if (invalid.length) { removeTombstones(kind, invalid); ids = ids.filter(id => UUID.test(id)); }
    }
    for (const part of chunk(ids, 150)) {
      const { error } = await supabase.from(kind)
        .update({ deleted_at: ts, updated_at: ts })
        .eq("user_id", userId)
        .in("id", part);
      if (error) throw new Error(`${kind} delete: ${error.message}`);
      removeTombstones(kind, part);   // řádek, který v Supabase neexistuje, prostě nic neaktualizuje
    }
  }
}

const maxIso = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

/* ── Profil (nutný pro žebříček a cizí klíč user_stats → profiles) ── */
export async function syncProfile(userId, username) {
  if (!userId || !username) return;
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, username }, { onConflict: "user_id" });
  if (error) console.error("[sync] Chyba upsert profilu:", error.message);
}

/* ── Statistiky uživatele (XP, streak) ─────────────────────── */
async function syncUserStats(localStats, userId) {
  const { data: remote, error } = await supabase
    .from("user_stats").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`user_stats: ${error.message}`);

  let final;
  if (!remote || new Date(localStats?.updatedAt ?? 0) > new Date(remote.updated_at ?? 0)) {
    final = { ...localStats, updatedAt: localStats?.updatedAt ?? nowIso() };
    const { error: upErr } = await supabase.from("user_stats").upsert({
      user_id:         userId,
      xp:              final.xp ?? 0,
      level:           getLevel(final.xp ?? 0).level,
      streak:          final.dailyStreak ?? 0,
      last_study_date: final.lastStudyDate ?? null,
      updated_at:      final.updatedAt ?? nowIso(),
    }, { onConflict: "user_id" });
    if (upErr) throw new Error(`user_stats upsert: ${upErr.message}`);
  } else {
    final = {
      ...localStats,
      xp:            remote.xp ?? localStats?.xp ?? 0,
      dailyStreak:   remote.streak ?? localStats?.dailyStreak ?? 0,
      lastStudyDate: remote.last_study_date ?? localStats?.lastStudyDate ?? null,
      updatedAt:     remote.updated_at,
    };
  }
  final._syncedAt = final.updatedAt;
  return final;
}

/* ── Hlavní synchronizace ──────────────────────────────────── */
/**
 * @param {{decks, folders, gameStats}} local   snímek stavu na začátku
 * @param {{userId, username, full, onProgress}} opts
 * @returns {{ok:true, decks, folders, gameStats, syncedAt} | {ok:false, error}}
 */
export async function runSync(local, { userId, username, full = false, onProgress }) {
  if (!userId) return { ok: false, error: "Nepřihlášen" };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: "offline" };

  const meta = getSyncMeta(userId);
  const doFull = full || !meta.mark;
  // rychlý sync: stáhnout změny od poslední značky (s 2min překryvem kvůli souběžným zápisům)
  const since = doFull ? null : new Date(new Date(meta.mark).getTime() - 120000).toISOString();

  try {
    if (username) await syncProfile(userId, username);

    if (doFull) onProgress?.("Synchronizuji…");
    await pushTombstones(userId);

    const [rDecks, rCards, rFolders] = await Promise.all([
      fetchAll("decks", userId, since),
      fetchAll("cards", userId, since),
      fetchAll("folders", userId, since),
    ]);

    const merged = mergeSync(
      { decks: local.decks ?? [], folders: local.folders ?? [] },
      { decks: rDecks, cards: rCards, folders: rFolders },
      { full: doFull, tombstones: { decks: getTombstones("decks"), cards: getTombstones("cards"), folders: getTombstones("folders") } },
    );

    // pořadí kvůli cizímu klíči: balíčky → karty
    if (merged.push.decks.length)   await upsertAll("decks", merged.push.decks.map(d => deckToRemote(d, userId)));
    if (merged.push.folders.length) await upsertAll("folders", merged.push.folders.map(f => folderToRemote(f, userId)));
    if (merged.push.cards.length)   await upsertAll("cards", merged.push.cards.map(c => cardToRemote(c.word, c.deckId, userId)));

    const gameStats = (doFull || isDirty(local.gameStats) || !local.gameStats?._syncedAt)
      ? await syncUserStats(local.gameStats ?? {}, userId)
      : local.gameStats;

    // nová značka = nejnovější server_updated_at ze stažených řádků (čas serveru, ne telefonu).
    // Když se nic nestáhlo, značka zůstává – bez značky proběhne příště znovu úplná synchronizace.
    let mark = meta.mark;
    for (const r of [...rDecks, ...rCards, ...rFolders]) mark = maxIso(mark, r.server_updated_at);
    const syncedAt = nowIso();
    saveSyncMeta({ userId, mark, lastSyncAt: syncedAt });

    onProgress?.(null);
    return {
      ok: true, full: doFull, syncedAt,
      decks: merged.decks, folders: merged.folders, gameStats,
      stats: { pulled: rDecks.length + rCards.length + rFolders.length, pushed: merged.push.decks.length + merged.push.cards.length + merged.push.folders.length },
    };
  } catch (err) {
    console.error("[sync] Chyba synchronizace:", err);
    onProgress?.(null);
    return { ok: false, error: err?.message ?? String(err) };
  }
}
