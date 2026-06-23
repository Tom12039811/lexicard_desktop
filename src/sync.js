/* ══════════════════════════════════════════════════════════════
   sync.js — LexiCard offline-first Supabase sync
   ══════════════════════════════════════════════════════════════

   Logika:
   - Data primárně žijí v localStorage (app funguje offline)
   - Sync se spustí: a) po přihlášení, b) při obnovení připojení
   - Conflict resolution: updatedAt timestamp — novější přepíše starší
   - Složky (folders) zůstávají pouze lokálně (nejsou v DB schématu)

   Mapování localStorage ↔ Supabase:
   - deck  { id, name, lang, folderId, ... }  → tabulka decks
   - word  { id, en, cs, vmBox, ... }          → tabulka cards
   - gameStats { xp, dailyStreak, ... }        → tabulka user_stats
══════════════════════════════════════════════════════════════ */

import { supabase } from "./supabase.js";

/* ── Helpers ─────────────────────────────────────────────── */

/** Vrátí aktuální ISO timestamp string */
const tsNow = () => new Date().toISOString();

/**
 * Porovná dva timestamps (ISO string nebo ms číslo).
 * Vrátí true pokud je `a` novější než `b`.
 */
function isNewer(a, b) {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

/* ── Deck sync ───────────────────────────────────────────── */

/**
 * Synchronizuje decky mezi localStorage a Supabase.
 * @param {Array}  localDecks  - pole decků z React state
 * @param {string} userId      - auth.uid()
 * @returns {Array} sloučené pole decků (pro setDecks)
 */
export async function syncDecks(localDecks, userId) {
  /* 1. Načti seznam záměrně smazaných deck ID z localStorage */
  let deletedIds = new Set();
  try {
    const raw = localStorage.getItem("lc6_deletedDecks");
    if (raw) deletedIds = new Set(JSON.parse(raw));
  } catch {}

  /* 2. Stáhni všechny decky uživatele ze Supabase */
  const { data: remoteDecks, error } = await supabase
    .from("decks")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("[sync] Chyba při načítání decků:", error.message);
    return localDecks; // offline fallback — ponecháme lokální data
  }

  /* 3. Smaž ze Supabase decky které byly záměrně smazány lokálně */
  const toDeleteRemote = remoteDecks.filter(r => deletedIds.has(r.id)).map(r => r.id);
  if (toDeleteRemote.length > 0) {
    await supabase.from("decks").delete().in("id", toDeleteRemote);
    await supabase.from("cards").delete().in("deck_id", toDeleteRemote);
  }

  /* 4. Slouč lokální a vzdálené decky (timestamp wins) */
  const localMap  = new Map(localDecks.map(d => [d.id, d]));
  const remoteMap = new Map(remoteDecks.filter(r => !deletedIds.has(r.id)).map(d => [d.id, d]));
  const allIds    = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const toUpsert = []; // decky k zapsání do Supabase
  const merged   = []; // výsledná lokální data

  for (const id of allIds) {
    const local  = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && remote) {
      // Oboje existuje → porovnej timestamp
      if (isNewer(local.updatedAt, remote.updated_at)) {
        // Lokální je novější → updatuj Supabase
        toUpsert.push(deckToRemote(local, userId));
        merged.push(local);
      } else {
        // Vzdálené je novější → updatuj lokál
        merged.push(deckFromRemote(remote, local));
      }
    } else if (local && !remote) {
      // Pouze lokálně → nahraj do Supabase
      toUpsert.push(deckToRemote(local, userId));
      merged.push(local);
    } else if (!local && remote) {
      // Pouze vzdáleně → stáhni lokálně (jen pokud nebyl záměrně smazán)
      merged.push(deckFromRemote(remote, null));
    }
  }

  /* 3. Zapiš změny do Supabase (upsert = insert nebo update) */
  if (toUpsert.length > 0) {
    const { error: upsertErr } = await supabase
      .from("decks")
      .upsert(toUpsert, { onConflict: "id" });
    if (upsertErr) console.error("[sync] Chyba upsert decků:", upsertErr.message);
  }

  return merged;
}

/** Lokální deck → formát pro Supabase */
function deckToRemote(deck, userId) {
  return {
    id:            deck.id,
    user_id:       userId,
    name:          deck.name ?? "Bez názvu",
    folder:        deck.folderId ?? null,   // lokální folderId → remote folder (text)
    language_pair: deck.lang ?? "cs-en",
    updated_at:    deck.updatedAt ?? tsNow(),
  };
}

/** Supabase deck → lokální formát (zachová lokální cards/words pokud existují) */
function deckFromRemote(remote, existingLocal) {
  return {
    ...(existingLocal ?? {}),
    id:         remote.id,
    name:       remote.name,
    folderId:   remote.folder ?? null,
    lang:       remote.language_pair ?? "cs-en",
    updatedAt:  remote.updated_at,
    words:      existingLocal?.words ?? [],           // karty se syncují zvlášť
    createdAt:  existingLocal?.createdAt ?? remote.updated_at,
    deckStats:  existingLocal?.deckStats ?? { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 },
  };
}

/* ── Cards sync ──────────────────────────────────────────── */

/**
 * Synchronizuje kartičky (words) pro VŠECHNY decky.
 * @param {Array}  mergedDecks - decky po syncDecks()
 * @param {string} userId
 * @returns {Array} decky s aktualizovanými words
 */
export async function syncCards(mergedDecks, userId) {
  /* 1. Stáhni všechny karty uživatele */
  const { data: remoteCards, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("[sync] Chyba při načítání karet:", error.message);
    return mergedDecks;
  }

  /* 2. Indexuj vzdálené karty podle id */
  const remoteMap = new Map(remoteCards.map(c => [c.id, c]));

  /* 3. Pro každý deck: synchronizuj jeho words */
  const toUpsert     = [];
  const remoteToKeep = new Set(); // karty ze Supabase které si zachováme lokálně

  const updatedDecks = mergedDecks.map(deck => {
    const localCards  = deck.words ?? [];
    const localMap    = new Map(localCards.map(c => [c.id, c]));

    // Přidej do porovnání i karty ze Supabase patřící tomuto decku
    const remoteForDeck = remoteCards.filter(c => c.deck_id === deck.id);
    const remoteForMap  = new Map(remoteForDeck.map(c => [c.id, c]));
    const allCardIds    = new Set([...localMap.keys(), ...remoteForMap.keys()]);

    const mergedWords = [];

    for (const cid of allCardIds) {
      const local  = localMap.get(cid);
      const remote = remoteForMap.get(cid);

      if (local && remote) {
        if (isNewer(local.updatedAt, remote.updated_at)) {
          toUpsert.push(cardToRemote(local, deck.id, userId));
          mergedWords.push(local);
        } else {
          const merged = cardFromRemote(remote, local);
          mergedWords.push(merged);
          remoteToKeep.add(cid);
        }
      } else if (local && !remote) {
        toUpsert.push(cardToRemote(local, deck.id, userId));
        mergedWords.push(local);
      } else if (!local && remote) {
        mergedWords.push(cardFromRemote(remote, null));
        remoteToKeep.add(cid);
      }
    }

    return { ...deck, words: mergedWords };
  });

  /* 4. Upsert karet do Supabase */
  if (toUpsert.length > 0) {
    // Rozděl na batche po 500 (Supabase limit)
    for (let i = 0; i < toUpsert.length; i += 500) {
      const batch = toUpsert.slice(i, i + 500);
      const { error: upsertErr } = await supabase
        .from("cards")
        .upsert(batch, { onConflict: "id" });
      if (upsertErr) console.error("[sync] Chyba upsert karet:", upsertErr.message);
    }
  }

  return updatedDecks;
}

/** Lokální word → formát pro Supabase */
function cardToRemote(word, deckId, userId) {
  return {
    id:          word.id,
    deck_id:     deckId,
    user_id:     userId,
    czech:       word.cs  ?? null,
    english:     word.en  ?? null,
    ipa:         word.ipa ?? null,
    audio_url:   word.audioUrl ?? null,
    box:         word.vmBox ?? 1,
    next_review: word.vmNextReview
      ? new Date(word.vmNextReview).toISOString()
      : null,
    xp:          word.score ?? 0,
    updated_at:  word.updatedAt ?? tsNow(),
  };
}

/** Supabase card → lokální word formát */
function cardFromRemote(remote, existingLocal) {
  return {
    ...(existingLocal ?? {}),
    id:           remote.id,
    cs:           remote.czech   ?? existingLocal?.cs ?? "",
    en:           remote.english ?? existingLocal?.en ?? "",
    ipa:          remote.ipa     ?? existingLocal?.ipa ?? null,
    audioUrl:     remote.audio_url ?? existingLocal?.audioUrl ?? null,
    vmBox:        remote.box        ?? 1,
    vmNextReview: remote.next_review ? new Date(remote.next_review).getTime() : null,
    vmLastReview: existingLocal?.vmLastReview ?? null,
    score:        remote.xp ?? 0,
    updatedAt:    remote.updated_at,
    // Zachovej lokální pole která Supabase nemá
    example:      existingLocal?.example   ?? "",
    synonyms:     existingLocal?.synonyms  ?? "",
    addedAt:      existingLocal?.addedAt   ?? remote.updated_at,
    wStats:       existingLocal?.wStats    ?? { total: 0, correct: 0, wrong: 0 },
  };
}

/* ── UserStats sync ──────────────────────────────────────── */

/**
 * Synchronizuje gameStats (XP, streak, level).
 * @param {object} localStats  - { xp, dailyStreak, lastStudyDate, updatedAt }
 * @param {string} userId
 * @returns {object} sloučené stats (pro setGameStats)
 */
export async function syncUserStats(localStats, userId) {
  const { data, error } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "row not found" → nový uživatel, to je ok
    console.error("[sync] Chyba načítání user_stats:", error.message);
    return localStats;
  }

  const remote = data;

  let finalStats;
  if (!remote) {
    // Nový uživatel — nahraj lokální data
    finalStats = localStats;
  } else if (isNewer(localStats?.updatedAt, remote.updated_at)) {
    // Lokální je novější
    finalStats = localStats;
  } else {
    // Vzdálené je novější
    finalStats = {
      ...localStats,
      xp:             remote.xp ?? localStats.xp ?? 0,
      level:          remote.level ?? 1,
      dailyStreak:    remote.streak ?? localStats.dailyStreak ?? 0,
      lastStudyDate:  remote.last_study_date ?? localStats.lastStudyDate ?? null,
      updatedAt:      remote.updated_at,
    };
  }

  // Vždy napiš finální stav do Supabase (upsert)
  const { error: upsertErr } = await supabase
    .from("user_stats")
    .upsert({
      user_id:          userId,
      xp:               finalStats.xp             ?? 0,
      level:            finalStats.level           ?? 1,
      streak:           finalStats.dailyStreak     ?? 0,
      last_study_date:  finalStats.lastStudyDate   ?? null,
      updated_at:       finalStats.updatedAt       ?? tsNow(),
    }, { onConflict: "user_id" });

  if (upsertErr) console.error("[sync] Chyba upsert user_stats:", upsertErr.message);

  return finalStats;
}

/* ── Hlavní sync funkce ──────────────────────────────────── */

/**
 * Spustí kompletní sync: decky → karty → statistiky.
 * Vrátí nová data pro React state, nebo null při chybě.
 *
 * @param {{ decks, gameStats }} localData  - aktuální data z React state
 * @param {string}               userId
 * @param {function}             onProgress - volitelný callback (string zpráva)
 * @returns {{ decks, gameStats } | null}
 */
export async function runSync(localData, userId, onProgress) {
  if (!userId) return null;
  if (!navigator.onLine) return null;

  try {
    onProgress?.("Synchronizuji balíčky…");
    const mergedDecks = await syncDecks(localData.decks ?? [], userId);

    onProgress?.("Synchronizuji kartičky…");
    const decksWithCards = await syncCards(mergedDecks, userId);

    onProgress?.("Synchronizuji statistiky…");
    const mergedStats = await syncUserStats(localData.gameStats ?? {}, userId);

    onProgress?.(null); // hotovo
    return { decks: decksWithCards, gameStats: mergedStats };
  } catch (err) {
    console.error("[sync] Neočekávaná chyba synchronizace:", err);
    onProgress?.(null);
    return null;
  }
}

/* ── Profile sync ────────────────────────────────────────── */

/**
 * Zajistí že uživatel má záznam v tabulce profiles.
 * Voláno po každém přihlášení — upsert je bezpečný.
 * @param {string} userId
 * @param {string} username  - z session.user.user_metadata.username
 */
export async function syncProfile(userId, username) {
  if (!userId || !username) return;

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, username }, { onConflict: "user_id" });

  if (error) console.error("[sync] Chyba upsert profilu:", error.message);
}
