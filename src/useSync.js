/* ══════════════════════════════════════════════════════════════
   useSync.js — LexiCard: řízení synchronizace se Supabase (kdy a jak)
   Samotná synchronizace: sync.js, slučování: syncMerge.js
══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import { runSync, getSyncMeta, tombstoneCount } from "./sync.js";
import { reconcileDecks, reconcileList, countDirty } from "./syncMerge.js";

export function useSync({ session, loaded, decks, folders, gameStats, setDecks, setFolders, setGameStats }) {
  const [syncStatus, setSyncStatus] = useState(null);      // text lišty dole (jen úplná synchronizace)
  const [syncInfo, setSyncInfo]     = useState({ state: "idle", lastSyncAt: null, error: null });
  const stateRef   = useRef({ decks: [], folders: [], gameStats: {} });
  const sessionRef = useRef(session);
  const syncingRef = useRef(false);
  const queuedRef  = useRef(null);        // "quick" | "full" – sync vyžádaný během běžícího syncu
  useEffect(() => { stateRef.current = { decks, folders, gameStats }; sessionRef.current = session; });

  async function triggerSync({ full = false } = {}) {
    const s = sessionRef.current;
    const userId = s?.user?.id;
    if (!userId) return;
    if (syncingRef.current) { queuedRef.current = (full || queuedRef.current === "full") ? "full" : "quick"; return; }
    syncingRef.current = true;
    setSyncInfo(i => ({ ...i, state: "syncing", lastSyncAt: i.lastSyncAt ?? getSyncMeta(userId).lastSyncAt }));

    const snap = stateRef.current;   // snímek na začátku – výsledek se s ním porovná (reconcile)
    const username = s.user.user_metadata?.username || s.user.email?.split("@")[0];
    const res = await runSync(snap, { userId, username, full, onProgress: full ? setSyncStatus : undefined });

    if (res.ok) {
      // změny provedené během syncu zůstanou zachované (odešlou se příště)
      setDecks(prev => reconcileDecks(prev, snap.decks, res.decks));
      setFolders(prev => reconcileList(prev, snap.folders, res.folders));
      setGameStats(prev => (prev === snap.gameStats ? res.gameStats : prev));
      setSyncInfo({ state: "ok", lastSyncAt: res.syncedAt, error: null });
    } else {
      setSyncInfo(i => ({ ...i, state: res.error === "offline" ? "offline" : "error", error: res.error }));
    }
    syncingRef.current = false;
    const q = queuedRef.current;
    queuedRef.current = null;
    if (q) triggerSync({ full: q === "full" });
  }

  /* Úplná synchronizace po přihlášení / startu aplikace */
  const prevSessionRef = useRef(undefined);
  useEffect(() => {
    const wasNull = prevSessionRef.current === null || prevSessionRef.current === undefined;
    const isLoggedIn = session != null;
    prevSessionRef.current = session;
    if (wasNull && isLoggedIn && loaded) triggerSync({ full: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loaded]);

  /* Rychlá synchronizace: po obnovení připojení, při návratu do aplikace a při jejím opuštění */
  useEffect(() => {
    const onOnline = () => triggerSync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const last = getSyncMeta(sessionRef.current?.user?.id).lastSyncAt;
        if (!last || Date.now() - new Date(last).getTime() > 60000) triggerSync();
      } else if (countDirty(stateRef.current, tombstoneCount()) > 0) {
        triggerSync();   // best-effort – iOS může síť při uspání aplikace přerušit
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Rychlá synchronizace 20 s po poslední změně (nejpozději 2 min od první neodeslané změny) */
  const firstDirtyRef = useRef(null);
  useEffect(() => {
    if (!loaded || !session?.user?.id) return;
    if (countDirty({ decks, folders, gameStats }, tombstoneCount()) === 0) { firstDirtyRef.current = null; return; }
    const now = Date.now();
    if (!firstDirtyRef.current) firstDirtyRef.current = now;
    const delay = Math.max(0, Math.min(20000, firstDirtyRef.current + 120000 - now));
    const t = setTimeout(() => { firstDirtyRef.current = null; triggerSync(); }, delay);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, folders, gameStats, loaded, session]);

  const getPendingCount = () => countDirty(stateRef.current, tombstoneCount());

  return { syncStatus, syncInfo, triggerSync, getPendingCount };
}
