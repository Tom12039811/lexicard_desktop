/* ══════════════════════════════════════════════════════════════
   useStudySession.js — LexiCard: stav a logika učení na jednom místě
   (kola, denní pool, odpovědi, výslovnost, mikrofon, obnovení sezení)
══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import {
  pickRound, vmUpdate, getLevel, calcXP,
  checkStreak, fetchDict, doSpeak, playSound,
  localMatch, gradeAnswer, isProblem, parseSyn,
} from "./utils.js";
import { usePersistentState } from "./hooks.js";

const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

/* Slova splatná dnes nebo dříve (a nová) */
function buildDailyPool(words) {
  const t = Date.now();
  return words.filter(w => !w.vmNextReview || w.vmNextReview <= t);
}

export function useStudySession({ decks, setDecks, deck, deckId, setDeckId, screen, setScreen, gameStats, setGameStats }) {
  /* ── folder study ── */
  const [studyFolderId, setStudyFolderId] = useState(null); // null = single deck, string = folder id
  const [studyKind, setStudyKind]         = useState("normal"); // "normal" | "problems" (trénink chyb)

  /* ── study state ── */
  // Nastavení učení si pamatujeme mezi sezeními (per zařízení)
  const isDir = v => v === "en-cs" || v === "cs-en";
  const [mode, setMode]               = usePersistentState("lc6_mode", "transl", v => ["transl", "pron", "flip"].includes(v));
  const [translDir, setTranslDir]     = usePersistentState("lc6_translDir", "en-cs", isDir);
  const [flipDir, setFlipDir]         = usePersistentState("lc6_flipDir", "en-cs", isDir);
  const [rWords, setRWords]           = useState([]);
  const [rIdx, setRIdx]               = useState(0);
  const [rStats, setRStats]           = useState({ ok: 0, bad: 0, xp: 0 });
  const [combo, setCombo]             = useState(0);
  const [feedback, setFB]             = useState(null);
  const [flipFlash, setFlipFlash]     = useState(null);
  const [flipped, setFlipped]         = useState(false);
  const [listenOn, setListen]         = useState(false);
  const [tx, setTx]                   = useState("");
  const [micSt, setMicSt]             = useState("idle");
  const [micErr, setMicErr]           = useState("");
  const [iMode, setIMode]             = usePersistentState("lc6_inputMode", "mic", v => v === "mic" || v === "text");
  const [typed, setTyped]             = useState("");
  const [autoPlay, setAutoPlay]       = usePersistentState("lc6_autoPlay", true, v => typeof v === "boolean");
  const [playSounds, setPlaySounds]   = useState(() => { try { const v = localStorage.getItem("lc6_playSounds"); return v === null ? true : v === "true"; } catch { return true; } });
  const [pronAtt, setPronAtt]         = useState(0);
  const [evalLoading, setEvalLoading] = useState(false);
  const [wrongCountdown, setWrongCountdown] = useState(0);
  const [dictEntry, setDictEntry]     = useState(null);
  const [roundEndData, setRoundEndData] = useState(null);
  /* ── daily pool state ── */
  // poolUnseen:   IDs slov která ještě nebyla v žádném kole tohoto sezení
  // poolReturned: IDs slov která se vrátila (špatně/tuším) — do dalšího kola
  // dailyPoolDone: true = všechna dnešní slova naučena → daily done screen
  const [poolUnseen, setPoolUnseen]     = useState(null); // null = bez pool trackingu
  const [poolReturned, setPoolReturned] = useState(new Set());
  const [, setDailyPoolDone] = useState(false);

  const recRef      = useRef(null);
  const streamRef   = useRef(null);
  const synthRef    = useRef(window.speechSynthesis);
  const timerRef    = useRef(null);
  const intervalRef = useRef(null);
  // Vždy aktuální verze nextCard pro časovače (setTimeout) — jinak by časovač
  // zavolal verzi se starými rStats a poslední odpověď kola by se nezapočítala.
  const nextCardRef = useRef(null);

  /* ── dict fetch ── */
  useEffect(() => {
    if (screen !== "study" || !rWords[rIdx]) return;
    const w = rWords[rIdx];
    const needEn = mode !== "cs-en";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset slovníkového záznamu
    if (!needEn) { setDictEntry(null); return; }
    setDictEntry(null);
    fetchDict(w.en).then(e => { if (rWords[rIdx]?.id === w.id) setDictEntry(e); });
  }, [rIdx, mode, screen]); // eslint-disable-line react-hooks/exhaustive-deps -- záměrně jen při změně karty/režimu

  useEffect(() => { nextCardRef.current = nextCard; });

  /* ── auto-advance on feedback ── */
  useEffect(() => {
    if (!feedback || screen !== "study" || mode === "flip") return;
    if (playSounds) playSound(feedback.ok ? "ok" : "bad");
    if (feedback.typo) {
      // téměř správně: 3 s na prohlédnutí rozdílu (lze přeskočit tlačítkem Další)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odpočet po odpovědi
      setWrongCountdown(3); let c = 3;
      intervalRef.current = setInterval(() => { c--; setWrongCountdown(c); if (c <= 0) clearInterval(intervalRef.current); }, 1000);
      timerRef.current = setTimeout(() => nextCardRef.current?.(), 3200);
    } else if (feedback.ok) {
      timerRef.current = setTimeout(() => nextCardRef.current?.(), 900);
    } else {
      setWrongCountdown(5); let c = 5;
      intervalRef.current = setInterval(() => { c--; setWrongCountdown(c); if (c <= 0) clearInterval(intervalRef.current); }, 1000);
      timerRef.current = setTimeout(() => nextCardRef.current?.(), 5200);
    }
    return () => { clearTimeout(timerRef.current); clearInterval(intervalRef.current); };
  }, [feedback]); // eslint-disable-line react-hooks/exhaustive-deps -- záměrně jen při změně feedbacku

  /* ── session persistence ── */
  function saveSession(words, idx, stats, combo, deckId, mode, translDir, flipDir, folderId, kind = "normal") {
    try { localStorage.setItem("lc6_session", JSON.stringify({ deckId, folderId: folderId ?? null, kind, rWords: words.map(w => w.id), rIdx: idx, rStats: stats, combo, mode, translDir, flipDir, savedAt: Date.now() })); } catch { /* úložiště nedostupné */ }
  }
  function clearSession()  { try { localStorage.removeItem("lc6_session"); } catch { /* úložiště nedostupné */ } }
  function restoreSession(decksSnap) {
    try {
      const raw = localStorage.getItem("lc6_session");
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.savedAt > 86400000) { clearSession(); return null; }
      const ds = decksSnap || decks;
      // Studium složky: slova hledáme ve všech balíčcích složky (dříve jen v prvním)
      const pool = s.folderId
        ? ds.filter(d => d.folderId === s.folderId).flatMap(d => d.words)
        : (ds.find(d => d.id === s.deckId)?.words ?? null);
      if (!pool) return null;
      const wm = new Map(pool.map(w => [w.id, w]));
      const rWords = (s.rWords || []).map(id => wm.get(id)).filter(Boolean);
      if (!rWords.length) return null;
      return { rWords, rIdx: s.rIdx || 0, rStats: s.rStats || { ok: 0, bad: 0, xp: 0 }, combo: s.combo || 0, deckId: s.deckId, folderId: s.folderId ?? null, kind: s.kind || "normal", mode: s.mode || "transl", translDir: s.translDir || "en-cs", flipDir: s.flipDir || "en-cs" };
    } catch { return null; }
  }

  function editWordInDecks(wid, data) {
    // Funguje i pro folder study — prohledá všechny balíčky
    setDecks(ds => ds.map(d => ({
      ...d,
      updatedAt: d.words.some(w => w.id === wid) ? new Date().toISOString() : d.updatedAt,
      words: d.words.map(w => w.id !== wid ? w : { ...w, ...data, updatedAt: new Date().toISOString() }),
    })));
    // Okamžitá aktualizace karet v probíhajícím kole
    setRWords(rw => rw.map(w => w.id !== wid ? w : { ...w, ...data, updatedAt: new Date().toISOString() }));
  }

  /* ── study helpers ── */
  function clearCard() { clearTimeout(timerRef.current); clearInterval(intervalRef.current); setFB(null); setTx(""); setMicErr(""); setTyped(""); setPronAtt(0); setWrongCountdown(0); setEvalLoading(false); setFlipped(false); setFlipFlash(null); }

  /* ── get words for folder study ── */
  function getFolderWords(folderId, decksSnap) {
    const ds = decksSnap || decks;
    return ds.filter(d => d.folderId === folderId).flatMap(d => d.words);
  }

  /* ── start study: single deck ── */
  function startStudy() {
    if (!deck?.words?.length) return;
    setStudyFolderId(null);
    const poolWords = buildDailyPool(deck.words);
    const roundWords = pickRound(poolWords.length ? poolWords : deck.words);
    const unseenIds = new Set(poolWords.map(w => w.id));
    // Odeber z unseen slova která jdou do tohoto kola
    roundWords.forEach(w => unseenIds.delete(w.id));
    setPoolUnseen(unseenIds);
    setPoolReturned(new Set());
    setDailyPoolDone(false);
    setRWords(roundWords); setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
    setStudyKind("normal");
    saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, null, "normal");
    setScreen("study");
    autoPlayForCard(roundWords[0], 600);
  }
  function startFolderStudy(folderId) {
    const allWords = getFolderWords(folderId);
    if (!allWords.length) return;
    setStudyFolderId(folderId);
    const poolWords = buildDailyPool(allWords);
    const roundWords = pickRound(poolWords.length ? poolWords : allWords);
    const unseenIds = new Set(poolWords.map(w => w.id));
    roundWords.forEach(w => unseenIds.delete(w.id));
    setPoolUnseen(unseenIds);
    setPoolReturned(new Set());
    setDailyPoolDone(false);
    // Use first deck in folder as "active" for session purposes
    const firstDeck = decks.find(d => d.folderId === folderId);
    const did = firstDeck?.id ?? deckId;
    setDeckId(did);
    setRWords(roundWords); setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
    setStudyKind("normal");
    saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, did, mode, translDir, flipDir, folderId, "normal");
    setScreen("study");
    autoPlayForCard(roundWords[0], 600);
  }

  function resumeStudy(decksSnap) {
    const s = restoreSession(decksSnap || decks);
    if (!s) return;
    setDeckId(s.deckId);
    setStudyFolderId(s.folderId ?? null);
    setStudyKind(s.kind);
    setRWords(s.rWords); setRIdx(s.rIdx); setRStats(s.rStats); setCombo(s.combo);
    setMode(s.mode); setTranslDir(s.translDir); setFlipDir(s.flipDir);
    setPoolUnseen(null); setPoolReturned(new Set()); setDailyPoolDone(false);
    clearCard(); setScreen("study");
    // Auto-play pro první/aktuální kartu při obnovení session
    autoPlayForCard(s.rWords[s.rIdx], 600);
  }
  /* ── trénink chyb: kolo jen z problémových slov (balíček nebo složka) ── */
  function problemWords(folderId = null) {
    const words = folderId ? getFolderWords(folderId) : (deck?.words ?? []);
    return words.filter(isProblem);
  }
  function startProblemStudy(folderId = null) {
    const probs = problemWords(folderId);
    if (!probs.length) return;
    setStudyFolderId(folderId);
    setStudyKind("problems");
    setPoolUnseen(null); setPoolReturned(new Set()); setDailyPoolDone(false);
    let did = deckId;
    if (folderId) { did = decks.find(d => d.folderId === folderId)?.id ?? deckId; setDeckId(did); }
    const roundWords = shuffle(probs).slice(0, 15);
    setRWords(roundWords); setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
    saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, did, mode, translDir, flipDir, folderId, "problems");
    setScreen("study");
    autoPlayForCard(roundWords[0], 600);
  }

  function updateWordInDecks(wid, vmUpd, ok) {
    setDecks(ds => ds.map(d => {
      const hasWord = d.words.some(w => w.id === wid);
      if (!hasWord) return d;
      return {
        ...d,
        updatedAt: new Date().toISOString(),
        words: d.words.map(dw => dw.id !== wid ? dw : {
          ...dw, ...vmUpd,
          score: ok ? (dw.score ?? 0) + 1 : Math.max(0, (dw.score ?? 0) - 1),
          wStats: { total: (dw.wStats?.total ?? 0) + 1, correct: (dw.wStats?.correct ?? 0) + (ok ? 1 : 0), wrong: (dw.wStats?.wrong ?? 0) + (ok ? 0 : 1) },
          updatedAt: new Date().toISOString(),
        }),
        deckStats: { totalAnswers: (d.deckStats?.totalAnswers ?? 0) + 1, correctAnswers: (d.deckStats?.correctAnswers ?? 0) + (ok ? 1 : 0), roundsCompleted: d.deckStats?.roundsCompleted ?? 0 },
      };
    }));
  }


  function nextCard() {
    clearTimeout(timerRef.current); clearInterval(intervalRef.current);
    synthRef.current?.cancel();
    setFB(null); setTx(""); setMicErr(""); setTyped(""); setPronAtt(0); setWrongCountdown(0); setEvalLoading(false); setFlipped(false); setFlipFlash(null);
    const nxt = rIdx + 1;

    if (nxt >= rWords.length) {
      finishRound();
    } else {
      setRIdx(nxt);
      saveSession(rWords, nxt, rStats, combo, deckId, mode, translDir, flipDir, studyFolderId, studyKind);
      // Auto-play nové karty (pron nepřehrává při zobrazení)
      autoPlayForCard(rWords[nxt]);
    }
  }

  function finishRound() {
    // Odpovědi (totalAnswers/correctAnswers) se přičítají průběžně v updateWordInDecks —
    // tady už jen dokončené kolo (dříve se odpovědi počítaly 2×).
    setDecks(ds => ds.map(d => {
      if (studyFolderId ? d.folderId !== studyFolderId : d.id !== deckId) return d;
      return { ...d, deckStats: { totalAnswers: d.deckStats?.totalAnswers ?? 0, correctAnswers: d.deckStats?.correctAnswers ?? 0, roundsCompleted: (d.deckStats?.roundsCompleted ?? 0) + 1 } };
    }));
    const roundBonus = 50;
    const totalXp = rStats.xp + roundBonus;

    // Data pro obrazovku konce kola počítáme synchronně z aktuálního gameStats.
    // (Dříve se plnila uvnitř setGameStats updateru, který React spouští až při
    //  dalším renderu → level-up a streak se nikdy nezobrazily.)
    const updatedNow = checkStreak(gameStats);
    const oldLvl = getLevel(updatedNow.xp ?? 0).level;
    const newLvl = getLevel((updatedNow.xp ?? 0) + totalXp).level;
    setRoundEndData({ xpEarned: totalXp, newLevel: newLvl > oldLvl ? newLvl : null, streak: updatedNow.dailyStreak ?? 0 });

    setGameStats(prev => {
      const updated = checkStreak(prev);
      return { ...updated, xp: (updated.xp ?? 0) + totalXp, updatedAt: new Date().toISOString() };
    });
    clearSession();

    // Rozhodnutí o další obrazovce — čteme aktuální hodnoty poolUnseen/poolReturned
    // přímo (jsou v tomto renderu vždy aktuální), BEZ vnořování setState do setState.
    // Vnořený zápis (setPoolUnseen(prev => { ...; setPoolReturned(...); setScreen(...) }))
    // způsoboval na konci posledního/nedokončeného kola denního poolu pád na bílou
    // obrazovku — tohle je bezpečná, lineární varianta se stejným výsledkem.
    if (poolUnseen === null) {
      setScreen("roundEnd");
      return;
    }
    const hasUnseen = poolUnseen.size > 0;
    const hasReturned = poolReturned.size > 0;
    if (!hasUnseen && !hasReturned) {
      setDailyPoolDone(true);
      setScreen("dailyDone");
    } else {
      setScreen("roundEnd");
    }
  }

  function nextRound() {
    let allWords;
    if (studyFolderId) {
      allWords = getFolderWords(studyFolderId);
    } else {
      allWords = deck?.words ?? [];
    }
    const wordMap = new Map(allWords.map(w => [w.id, w]));

    // Trénink chyb: další kolo opět jen z (aktuálně) problémových slov
    if (studyKind === "problems") {
      const probs = allWords.filter(isProblem);
      if (!probs.length) { setScreen(studyFolderId ? "home" : "deck"); return; }
      const roundWords = shuffle(probs).slice(0, 15);
      setRWords(roundWords);
      setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
      saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, studyFolderId, "problems");
      setScreen("study");
      autoPlayForCard(roundWords[0], 600);
      return;
    }

    // Čteme aktuální poolUnseen/poolReturned přímo z closure a počítáme
    // synchronně — žádné vnořené setState (viz vysvětlení u finishRound()).
    let roundWords, newUnseen, newReturned;

    if (poolUnseen !== null) {
      // Máme tracking: priorita = unseen, pak returned
      const unseenArr = [...poolUnseen].map(id => wordMap.get(id)).filter(Boolean);
      const returnedArr = [...poolReturned].map(id => wordMap.get(id)).filter(Boolean);

      if (unseenArr.length > 0) {
        // Kolo z unseen (max 15)
        roundWords = pickRound(unseenArr);
        newUnseen = new Set(poolUnseen);
        roundWords.forEach(w => newUnseen.delete(w.id));
        newReturned = new Set(poolReturned); // returned se přenáší dál
      } else if (returnedArr.length > 0) {
        // Unseen vyčerpány, jedeme vrácená slova
        roundWords = pickRound(returnedArr);
        newUnseen = new Set(); // prázdné
        newReturned = new Set(poolReturned);
        roundWords.forEach(w => newReturned.delete(w.id)); // odebereme z returned
      } else {
        // Nemělo by nastat (finishRound by šel na dailyDone)
        roundWords = pickRound(allWords);
        newUnseen = new Set();
        newReturned = new Set();
      }
    } else {
      // Bez pool trackingu (pokračování po dailyDone)
      roundWords = pickRound(allWords);
      newUnseen = null;
      newReturned = new Set();
    }

    setPoolUnseen(newUnseen);
    setPoolReturned(newReturned);
    setRWords(roundWords);
    setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
    saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, studyFolderId, studyKind);
    setScreen("study");
    // Auto-play první karty nového kola
    autoPlayForCard(roundWords[0], 600);
  }

  /* ── continue after daily done (show remaining non-pool words) ── */
  function continueAfterDailyDone() {
    let allWords;
    if (studyFolderId) {
      allWords = getFolderWords(studyFolderId);
    } else {
      allWords = deck?.words ?? [];
    }
    // Slova s nejbližší budoucí expirací (standardní režim po vyčerpání denního poolu)
    const futureWords = allWords
      .filter(w => w.vmNextReview && w.vmNextReview > Date.now())
      .sort((a, b) => a.vmNextReview - b.vmNextReview);
    if (!futureWords.length) {
      setScreen(studyFolderId ? "home" : "deck");
      return;
    }
    setPoolUnseen(null); // bez pool trackingu
    setPoolReturned(new Set());
    setDailyPoolDone(false);
    const words = futureWords.slice(0, 15);
    setRWords(words); setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
    setStudyKind("normal");
    saveSession(words, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, studyFolderId, "normal");
    setScreen("study");
    autoPlayForCard(words[0], 600);
  }
  async function startListen(lang) {
    setMicErr("");
    if (micSt !== "ready") {
      setMicSt("requesting");
      try { streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true }); setMicSt("ready"); }
      catch (err) { setMicSt("error"); setMicErr(err.name === "NotAllowedError" ? "Přístup k mikrofonu zamítnut." : err.name === "NotFoundError" ? "Mikrofon nenalezen." : `Chyba: ${err.message}`); return; }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicErr("Rozpoznávání řeči funguje pouze v Chrome/Edge."); return; }
    const rec = new SR(); rec.lang = lang; rec.continuous = false; rec.interimResults = true;
    rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(""); setTx(t); if (e.results[e.results.length - 1].isFinal) { evalAnswer(t); rec.stop(); } };
    rec.onerror  = ev => { if (ev.error !== "aborted") setMicErr({ "not-allowed": "Mikrofon blokován.", "service-not-allowed": "Rozpoznávání blokováno — zkus psaní.", "no-speech": "Nic nezaznamenáno.", "network": "Chyba sítě." }[ev.error] ?? `Chyba: ${ev.error}`); setListen(false); };
    rec.onend    = () => setListen(false);
    recRef.current = rec; rec.start(); setListen(true);
  }
  function stopListen() { recRef.current?.stop(); setListen(false); }

  /* ── speak ── */
  // Vždy přes SpeechSynthesis — žádná závislost na API audio.
  function speakWord(text, lang) {
    if (!text) return;
    doSpeak(synthRef.current, text, lang);
  }

  // Přehraje slovo při zobrazení nové karty dle pravidel auto-play.
  // Voláno explicitně: při přechodu na novou kartu a po flip otočení.
  //
  // Pravidla:
  //   transl EN→CZ : přehraj EN při zobrazení
  //   transl CZ→EN : nepřehrávej při zobrazení
  //   pron         : nepřehrávej při zobrazení (až od 2. pokusu)
  //   flip EN→CZ   : přehraj EN při zobrazení přední strany
  //   flip CZ→EN   : nepřehrávej při zobrazení přední strany
  //
  // delay: ms před přehráním (default 400)
  function autoPlayForCard(w, delay = 400) {
    if (!autoPlay || !w) return null;
    if (mode === "transl") {
      if (translDir === "en-cs") {
        return setTimeout(() => speakWord(w.en, "en-US"), delay);
      }
      // CZ→EN: nepřehrávej
      return null;
    }
    if (mode === "flip") {
      if (flipDir === "en-cs") {
        return setTimeout(() => speakWord(w.en, "en-US"), delay);
      }
      // CZ→EN: nepřehrávej
      return null;
    }
    // pron: nepřehrávej při zobrazení
    return null;
  }

  /* ── flip answer ── */
  function flipAnswer(quality) {
    const w = rWords[rIdx]; if (!w) return;
    const ok = quality >= 3;
    const xpGain = ok ? 1 : 0;
    if (playSounds) playSound(ok ? "ok" : "bad");
    const newCombo = quality >= 5 ? combo + 1 : 0;
    setCombo(newCombo);
    const vmUpd = vmUpdate(w, quality);
    updateWordInDecks(w.id, vmUpd, ok);
    setRStats(s => ({ ...s, ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1), xp: s.xp + xpGain }));
    setFlipFlash(quality === 0 ? "bad" : quality === 3 ? "warn" : "ok");

    if (poolUnseen !== null && (quality === 0 || quality === 3)) {
      setPoolReturned(prev => { const next = new Set(prev); next.add(w.id); return next; });
    }

    // Zruš případné probíhající přehrávání před odpovědí
    synthRef.current?.cancel();

    // Auto-play při odpovědi:
    // flip EN→CZ: přehraj CZ pouze při neznám (q=0)
    // flip CZ→EN: přehraj EN pouze při neznám (q=0)
    // tuším (q=3) ani správně (q=5) → nepřehrávej
    if (autoPlay && quality === 0) {
      const ans  = flipDir === "en-cs" ? (parseSyn(w.cs)[0] || w.cs) : w.en;
      const lang = flipDir === "en-cs" ? "cs-CZ" : "en-US";
      setTimeout(() => speakWord(ans, lang), 150);
    }

    setTimeout(() => { setFlipFlash(null); setFlipped(false); nextCardRef.current?.(); }, 420);
  }

  /* ── text/mic answer ── */
  async function evalAnswer(text) {
    const w = rWords[rIdx]; if (!w || feedback) return;
    // Zruš případné probíhající přehrávání
    synthRef.current?.cancel();
    if (mode === "pron") {
      const ok = localMatch(text, w.en);
      if (ok) { commitAnswer(w, 5, text); return; }
      const att = pronAtt + 1;
      if (att >= 3) {
        // 3. špatná → konec, přehraj slovo a commituj
        speakWord(w.en, "en-US");
        commitAnswer(w, 0, text, true);
      } else {
        setPronAtt(att);
        setTx("");
        // Od 2. pokusu (att >= 1) přehraj slovo jako nápovědu
        if (att >= 1) {
          setTimeout(() => speakWord(w.en, "en-US"), 300);
        }
      }
      return;
    }
    // Hlavní pole se dělí jen podle "/" a ";" (věty obsahují čárky), synonyma i podle ","
    const expected = (mode === "transl" && translDir === "cs-en") ? w.en : w.cs;
    const g = gradeAnswer(text, expected, w.synonyms || "");
    if (g.result === "ok")   { commitAnswer(w, 5, text); return; }
    // o překlep víc, než je tolerance → „téměř“ = jako Tuším (krabička o 1 níž, vrátí se v dalším kole)
    if (g.result === "typo") { commitAnswer(w, 3, text, false, { typo: { given: text, match: g.match } }); return; }
    commitAnswer(w, 0, text);
  }

  function commitAnswer(w, quality, given, forced = false, extra = {}) {
    const ok = quality >= 3;
    const xpGain = calcXP(quality, combo);
    const newCombo = quality >= 5 ? combo + 1 : 0;   // „téměř“ (3) sérii přeruší, stejně jako Tuším u karet
    setCombo(newCombo);
    const vmUpd = vmUpdate(w, quality);
    setFB({ ok, answer: translDir === "en-cs" ? w.cs : w.en, given, forced, quality, ...extra });
    setRStats(s => ({ ...s, ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1), xp: s.xp + xpGain }));
    updateWordInDecks(w.id, vmUpd, ok);

    // Pool: špatně → vrátit do poolReturned (do příštího kola, ne do aktuálního)
    if (poolUnseen !== null && (!ok || quality === 3)) {
      setPoolReturned(prev => { const next = new Set(prev); next.add(w.id); return next; });
    }

    // Auto-play správné odpovědi při špatné/nevím (transl + flip):
    // transl EN→CZ špatně → přehraj CZ
    // transl CZ→EN špatně → přehraj EN
    // flip EN→CZ špatně/tuším → přehraj CZ (řeší flipAnswer)
    // flip CZ→EN špatně/tuším → přehraj EN (řeší flipAnswer)
    // pron: přehrávání řeší evalAnswer přímo
    if ((!ok || quality === 3) && autoPlay && mode === "transl") {
      const ans  = translDir === "en-cs" ? w.cs : w.en;
      const lang = translDir === "en-cs" ? "cs-CZ" : "en-US";
      setTimeout(() => speakWord(ans, lang), 300);
    }
  }

  function submitTyped()  { if (typed.trim()) evalAnswer(typed.trim()); }

  function dontKnow() {
    const w = rWords[rIdx]; if (!w || feedback) return;
    // Zruš případné probíhající přehrávání
    synthRef.current?.cancel();
    commitAnswer(w, 0, "");
    // Pokud je autoPlay vypnutý, commitAnswer nepřehraje → přehraj explicitně
    if (!autoPlay && mode === "transl") {
      const ans  = translDir === "en-cs" ? w.cs : w.en;
      const lang = translDir === "en-cs" ? "cs-CZ" : "en-US";
      setTimeout(() => speakWord(ans, lang), 300);
    }
  }

  function flipCard() {
    // Zruš případné probíhající přehrávání před otočením
    synthRef.current?.cancel();
    setFlipped(true);
    if (autoPlay) {
      const w = rWords[rIdx];
      if (!w) return;
      if (flipDir === "cs-en") {
        // Otočili jsme na EN (back side) → přehraj EN vždy
        setTimeout(() => speakWord(w.en, "en-US"), 200);
      }
      // flipDir === "en-cs": otočení na CS → nepřehrávej
    }
  }

  function setPlaySoundsPersist(v) {
    setPlaySounds(v);
    try { localStorage.setItem("lc6_playSounds", String(v)); } catch { /* úložiště nedostupné */ }
  }

  return {
    studyFolderId, studyKind, startProblemStudy, problemWords,
    mode, setMode, translDir, setTranslDir, flipDir, setFlipDir,
    rWords, rIdx, rStats, combo, feedback, flipFlash, flipped, listenOn, tx, micSt, micErr,
    iMode, setIMode, typed, setTyped, autoPlay, setAutoPlay, playSounds, setPlaySounds: setPlaySoundsPersist,
    pronAtt, evalLoading, wrongCountdown, dictEntry, roundEndData,
    setMicErr, setTx, clearCard,
    restoreSession, startStudy, startFolderStudy, resumeStudy, nextRound, continueAfterDailyDone, nextCard,
    flipCard, flipAnswer, startListen, stopListen, submitTyped, dontKnow, speakWord, editWordInDecks,
  };
}
