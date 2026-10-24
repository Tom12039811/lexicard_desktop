/* ══════════════════════════════════════════════════════════════
   syncMerge.js — LexiCard: čistá logika synchronizace (bez sítě)
   ══════════════════════════════════════════════════════════════

   Každá položka (balíček, slovíčko, složka, gameStats) nese:
     updatedAt  – ISO čas poslední změny (mění ho každá úprava)
     _syncedAt  – updatedAt verze, která je prokazatelně v Supabase
   Položka je „neodeslaná“ (dirty), pokud se tyto dvě hodnoty liší.

   Pravidla slučování:
   - smazáno v Supabase (deleted_at) → smaže se i lokálně
   - existuje na obou stranách → vyhrává novější updatedAt
   - jen lokálně → odešle se (při úplné synchronizaci vždy,
     při rychlé jen pokud je neodeslaná)
   - jen v Supabase → stáhne se (pokud není lokálně čerstvě smazaná)
══════════════════════════════════════════════════════════════ */

const ts = v => (v ? new Date(v).getTime() : 0);
export const msToIso = ms => (ms ? new Date(ms).toISOString() : null);
export const isoToMs = iso => (iso ? new Date(iso).getTime() : null);
export const nowIso = () => new Date().toISOString();

/** Neodeslaná změna? */
export const isDirty = x => !!x && (!x._syncedAt || x._syncedAt !== x.updatedAt);

/* ── Mapování lokální ↔ Supabase ───────────────────────────── */

export function deckToRemote(deck, userId) {
  return {
    id:            deck.id,
    user_id:       userId,
    name:          deck.name ?? "Bez názvu",
    folder:        deck.folderId ?? null,
    language_pair: deck.lang ?? "cs-en",
    from_library:  deck.fromLibrary ?? null,
    deck_stats:    deck.deckStats ?? null,
    created_at:    msToIso(deck.createdAt),
    updated_at:    deck.updatedAt ?? nowIso(),
  };
}

export function deckFromRemote(r, local) {
  return {
    ...(local ?? {}),
    id:          r.id,
    name:        r.name,
    folderId:    r.folder ?? null,
    lang:        r.language_pair ?? "cs-en",
    fromLibrary: r.from_library ?? local?.fromLibrary ?? null,
    deckStats:   r.deck_stats ?? local?.deckStats ?? { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 },
    createdAt:   isoToMs(r.created_at) ?? local?.createdAt ?? isoToMs(r.updated_at),
    words:       local?.words ?? [],
    updatedAt:   r.updated_at,
    _syncedAt:   r.updated_at,
  };
}

export function cardToRemote(w, deckId, userId) {
  return {
    id:          w.id,
    deck_id:     deckId,
    user_id:     userId,
    czech:       w.cs ?? null,
    english:     w.en ?? null,
    ipa:         w.ipa || w.phonetic || null,
    audio_url:   w.audioUrl ?? null,
    example:     w.example ?? null,
    synonyms:    w.synonyms ?? null,
    box:         w.vmBox ?? 1,
    next_review: msToIso(w.vmNextReview),
    last_review: msToIso(w.vmLastReview),
    added_at:    msToIso(w.addedAt),
    w_stats:     w.wStats ?? null,
    xp:          w.score ?? 0,
    updated_at:  w.updatedAt ?? nowIso(),
  };
}

export function cardFromRemote(r, local) {
  return {
    ...(local ?? {}),
    id:           r.id,
    cs:           r.czech ?? local?.cs ?? "",
    en:           r.english ?? local?.en ?? "",
    ipa:          r.ipa ?? local?.ipa ?? null,
    audioUrl:     r.audio_url ?? local?.audioUrl ?? null,
    example:      r.example ?? local?.example ?? "",
    synonyms:     Array.isArray(r.synonyms) ? r.synonyms.join(", ") : (r.synonyms ?? local?.synonyms ?? ""),
    vmBox:        r.box ?? 1,
    vmNextReview: isoToMs(r.next_review),
    vmLastReview: isoToMs(r.last_review) ?? local?.vmLastReview ?? null,
    addedAt:      isoToMs(r.added_at) ?? local?.addedAt ?? isoToMs(r.updated_at),
    wStats:       r.w_stats ?? local?.wStats ?? { total: 0, correct: 0, wrong: 0 },
    score:        r.xp ?? 0,
    updatedAt:    r.updated_at,
    _syncedAt:    r.updated_at,
  };
}

export function folderToRemote(f, userId) {
  return {
    id:         f.id,
    user_id:    userId,
    name:       f.name ?? "Složka",
    lang:       f.lang ?? null,
    created_at: msToIso(f.createdAt),
    updated_at: f.updatedAt ?? nowIso(),
  };
}

export function folderFromRemote(r, local) {
  return {
    ...(local ?? {}),
    id:        r.id,
    name:      r.name,
    lang:      r.lang ?? local?.lang ?? null,
    createdAt: isoToMs(r.created_at) ?? local?.createdAt ?? null,
    updatedAt: r.updated_at,
    _syncedAt: r.updated_at,
  };
}

/* Supabase nemá ještě data, která máme lokálně (první sync po migraci F4) */
const deckNeedsBackfill = (l, r) => !r.deck_stats && (l.deckStats?.totalAnswers ?? 0) > 0;
const cardNeedsBackfill = (l, r) =>
  (!r.w_stats && (l.wStats?.total ?? 0) > 0) || (!r.last_review && !!l.vmLastReview);

/* ── Obecné sloučení jednoho typu položek ──────────────────── */
function mergeEntity(localList, remoteRows, { full, tomb, fromRemote, needsBackfill }) {
  const R = new Map(remoteRows.map(r => [r.id, r]));
  const out = [];
  const push = [];
  const seen = new Set();
  const markPushed = l => { const m = { ...l, _syncedAt: l.updatedAt }; out.push(m); push.push(m); };

  for (const l of localList) {
    if (tomb.has(l.id)) continue;               // lokálně smazáno, čeká na odeslání
    const r = R.get(l.id);
    if (r) {
      seen.add(l.id);
      if (r.deleted_at) continue;               // smazáno jinde → smazat i zde
      const lt = ts(l.updatedAt), rt = ts(r.updated_at);
      if (lt > rt) markPushed(l);               // lokální je novější
      else if (lt === rt) {
        if (needsBackfill?.(l, r)) markPushed(l);
        else out.push(l._syncedAt === l.updatedAt ? l : { ...l, _syncedAt: l.updatedAt });
      } else out.push(fromRemote(r, l));        // vzdálená je novější
    } else if (full || isDirty(l)) {
      markPushed(l);                            // jen lokálně → nahrát
    } else {
      out.push(l);                              // rychlý sync: beze změny, v Supabase nemuselo přijít
    }
  }
  for (const r of remoteRows) {
    if (seen.has(r.id) || r.deleted_at || tomb.has(r.id)) continue;
    out.push(fromRemote(r, null));              // nové ze Supabase
  }
  return { out, push };
}

/**
 * Sloučí lokální data se staženými řádky.
 * @param {{decks, folders}} local
 * @param {{decks, cards, folders}} remote   řádky ze Supabase (všechny nebo jen změněné)
 * @param {{full:boolean, tombstones:{decks:Set, cards:Set, folders:Set}}} opts
 * @returns {{decks, folders, push:{decks, cards:[{word, deckId}], folders}}}
 */
export function mergeSync(local, remote, { full, tombstones }) {
  const tomb = tombstones ?? { decks: new Set(), cards: new Set(), folders: new Set() };

  /* balíčky (bez slovíček) */
  const deckRes = mergeEntity(local.decks ?? [], remote.decks ?? [], {
    full, tomb: tomb.decks, fromRemote: deckFromRemote, needsBackfill: deckNeedsBackfill,
  });
  const deckMap = new Map(deckRes.out.map(d => [d.id, { ...d, words: [] }]));

  /* slovíčka – sloučená napříč balíčky, pak rozdělená zpět */
  const localCards = [];
  for (const d of local.decks ?? []) {
    for (const w of d.words ?? []) localCards.push({ ...w, __deckId: d.id, __orig: w });
  }
  const cardRes = mergeEntity(localCards, remote.cards ?? [], {
    full, tomb: tomb.cards,
    fromRemote: (r, l) => ({ ...cardFromRemote(r, l ? l.__orig : null), __deckId: l ? l.__deckId : r.deck_id }),
    needsBackfill: cardNeedsBackfill,
  });

  // u nezměněných slov vracíme původní objekt (důležité pro reconcile – porovnává identitu)
  const clean = c => {
    if (c.__orig && c._syncedAt === c.__orig._syncedAt && c.updatedAt === c.__orig.updatedAt) return c.__orig;
    const { __deckId: _d, __orig: _o, ...w } = c; // eslint-disable-line no-unused-vars
    return w;
  };
  const pushCards = [];
  const pushedIds = new Set(cardRes.push.map(c => c.id));
  for (const c of cardRes.out) {
    const deck = deckMap.get(c.__deckId);
    if (!deck) continue;                         // balíček smazán → slovíčko zahodit
    const w = clean(c);
    deck.words.push(w);
    if (pushedIds.has(c.id)) pushCards.push({ word: w, deckId: c.__deckId });
  }

  // balíček, jehož slovíčka se nezměnila a sám se nezměnil, vrátíme jako původní objekt
  const localDeckMap = new Map((local.decks ?? []).map(d => [d.id, d]));
  const decks = deckRes.out.map(d0 => {
    const d = deckMap.get(d0.id);
    const orig = localDeckMap.get(d.id);
    if (orig && orig === d0 && orig.words.length === d.words.length && orig.words.every((w, i) => w === d.words[i])) return orig;
    return d;
  });
  // Nové balíčky nemají _syncedAt → jsou „dirty“ a odešlou se vždy dřív než jejich karty (FK).
  const pushDecks = deckRes.push;

  const folderRes = mergeEntity(local.folders ?? [], remote.folders ?? [], {
    full, tomb: tomb.folders, fromRemote: folderFromRemote,
  });

  return {
    decks,
    folders: folderRes.out,
    push: { decks: pushDecks, cards: pushCards, folders: folderRes.push },
  };
}

/* ── Reconcile: aplikace výsledku syncu na stav, který se mezitím mohl změnit ──
   prev = aktuální stav, snap = stav na začátku syncu, res = výsledek syncu.
   Co se během syncu lokálně změnilo (jiný objekt než ve snap), zůstává lokální
   a odešle se při dalším syncu. */
export function reconcileList(prev, snap, res) {
  const P = new Map(prev.map(x => [x.id, x]));
  const S = new Map(snap.map(x => [x.id, x]));
  const R = new Map(res.map(x => [x.id, x]));
  const out = [];
  for (const r of res) {
    const p = P.get(r.id), s = S.get(r.id);
    if (!p && s) continue;              // lokálně smazáno během syncu
    if (!p && !s) { out.push(r); continue; }
    if (p && !s) { out.push(p); continue; }
    out.push(p === s ? r : p);          // změněno během syncu → lokální verze
  }
  for (const p of prev) if (!R.has(p.id) && !S.has(p.id)) out.push(p); // přidáno během syncu
  return out;
}

export function reconcileDecks(prev, snap, res) {
  const P = new Map(prev.map(x => [x.id, x]));
  const S = new Map(snap.map(x => [x.id, x]));
  const R = new Map(res.map(x => [x.id, x]));
  const out = [];
  for (const r of res) {
    const p = P.get(r.id), s = S.get(r.id);
    if (!p && s) continue;
    if (!p && !s) { out.push(r); continue; }
    if (p && !s) { out.push(p); continue; }
    if (p === s) { out.push(r); continue; }
    // balíček se během syncu změnil: pole balíčku podle toho, zda se změnilo updatedAt,
    // slovíčka po jednom
    const base = p.updatedAt !== s.updatedAt ? p : r;
    out.push({ ...base, words: reconcileList(p.words ?? [], s.words ?? [], r.words ?? []) });
  }
  for (const p of prev) if (!R.has(p.id) && !S.has(p.id)) out.push(p);
  return out;
}

/** Počet neodeslaných položek (pro indikátor stavu) */
export function countDirty({ decks = [], folders = [], gameStats } = {}, tombstoneCount = 0) {
  let n = tombstoneCount;
  for (const d of decks) {
    if (isDirty(d)) n++;
    for (const w of d.words ?? []) if (isDirty(w)) n++;
  }
  for (const f of folders) if (isDirty(f)) n++;
  if (gameStats?.updatedAt && isDirty(gameStats)) n++;
  return n;
}
