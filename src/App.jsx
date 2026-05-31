import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

import { DEFAULT_LANGS, SAMPLE_WORDS, C, STYLE } from "./constants.js";
import {
  uid, now, pickRound, vmUpdate, getLevel, calcXP,
  checkStreak, fetchDict, playAudio, doSpeak, playSound,
  localMatch, parseSyn,
} from "./utils.js";
import HomeScreen from "./HomeScreen.jsx";
import DeckScreen from "./DeckScreen.jsx";
import StudyScreen, { RoundEnd, DailyDoneScreen } from "./StudyScreen.jsx";
import { OnboardingModal } from "./modals.jsx";

/* ── helpers ── */
function buildDailyPool(words) {
  // Slova splatná dnes nebo overdue
  const t = Date.now();
  return words.filter(w => !w.vmNextReview || w.vmNextReview <= t);
}

export default function LexiCard() {
  /* ── light mode ── */
  const [lightMode, setLightMode] = useState(() => localStorage.getItem("lc_lightMode") === "1");

  function toggleLight() {
    setLightMode(v => {
      const next = !v;
      localStorage.setItem("lc_lightMode", next ? "1" : "0");
      document.documentElement.setAttribute("data-theme", next ? "light" : "dark");
      return next;
    });
  }

  /* apply theme on mount */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", lightMode ? "light" : "dark");
  }, []); // eslint-disable-line

  /* ── core state ── */
  const [decks, setDecks]             = useState([]);
  const [langs, setLangs]             = useState(DEFAULT_LANGS);
  const [folders, setFolders]         = useState([]);
  const [screen, setScreen]           = useState("home");
  const [deckId, setDeckId]           = useState(null);
  const [activeLang, setLang]         = useState("en");
  const [loaded, setLoaded]           = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [gameStats, setGameStats]     = useState({ xp: 0, dailyStreak: 0, lastStudyDate: null });

  /* ── folder study ── */
  const [studyFolderId, setStudyFolderId] = useState(null); // null = single deck, string = folder id

  /* ── study state ── */
  const [mode, setMode]               = useState("transl");
  const [translDir, setTranslDir]     = useState("en-cs");
  const [flipDir, setFlipDir]         = useState("en-cs");
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
  const [iMode, setIMode]             = useState("mic");
  const [typed, setTyped]             = useState("");
  const [autoPlay, setAutoPlay]       = useState(true);
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
  const [dailyPoolDone, setDailyPoolDone] = useState(false);

  const recRef      = useRef(null);
  const streamRef   = useRef(null);
  const synthRef    = useRef(window.speechSynthesis);
  const timerRef    = useRef(null);
  const intervalRef = useRef(null);

  /* ── localStorage load ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lc6_data");
      if (raw) {
        const d = JSON.parse(raw);
        if (d.decks)     setDecks(d.decks);
        if (d.lang)      setLang(d.lang);
        if (d.langs)     setLangs(p => { const ids = new Set(p.map(l => l.id)); return [...p, ...d.langs.filter(l => !ids.has(l.id))]; });
        if (d.gameStats) setGameStats(d.gameStats);
        if (d.folders)   setFolders(d.folders);
      } else {
        setShowOnboarding(true);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem("lc6_data", JSON.stringify({ decks, lang: activeLang, langs: langs.filter(l => l.custom), gameStats, folders })); } catch {}
      try { localStorage.setItem("lc6_playSounds", String(playSounds)); } catch {}
    }
  }, [decks, activeLang, langs, loaded, gameStats, folders]);

  /* ── dict fetch ── */
  useEffect(() => {
    if (screen !== "study" || !rWords[rIdx]) return;
    const w = rWords[rIdx];
    const needEn = mode !== "cs-en";
    if (!needEn) { setDictEntry(null); return; }
    setDictEntry(null);
    fetchDict(w.en).then(e => { if (rWords[rIdx]?.id === w.id) setDictEntry(e); });
  }, [rIdx, mode, screen]);

  /* ── auto-advance on feedback ── */
  useEffect(() => {
    if (!feedback || screen !== "study" || mode === "flip") return;
    if (playSounds) playSound(feedback.ok ? "ok" : "bad");
    if (feedback.ok) {
      timerRef.current = setTimeout(() => nextCard(), 900);
    } else {
      setWrongCountdown(5); let c = 5;
      intervalRef.current = setInterval(() => { c--; setWrongCountdown(c); if (c <= 0) clearInterval(intervalRef.current); }, 1000);
      timerRef.current = setTimeout(() => nextCard(), 5200);
    }
    return () => { clearTimeout(timerRef.current); clearInterval(intervalRef.current); };
  }, [feedback]);

  /* ── auto speak ── */
  useEffect(() => {
    if (screen !== "study" || !rWords[rIdx] || feedback || !autoPlay) return;
    const w = rWords[rIdx];
    if (mode === "flip") {
      if (flipDir === "en-cs" && !flipped) {
        const t = setTimeout(() => speakWord(w.en, "en-US"), 400);
        return () => clearTimeout(t);
      }
      return;
    }
    if (mode === "pron" || mode === "transl") {
      const text = mode === "pron" ? w.en : translDir === "en-cs" ? w.en : w.cs;
      const lang = translDir === "cs-en" ? "cs-CZ" : "en-US";
      const t = setTimeout(() => {
        if (mode !== "cs-en" && dictEntry?.audio) playAudio(dictEntry.audio);
        else speakWord(text, lang);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [rIdx, mode, screen, feedback, autoPlay, dictEntry, flipped, flipDir]);

  const deck = decks.find(d => d.id === deckId) ?? null;

  /* ── file load ── */
  function loadFile(file) {
    const name = file.name.replace(/\.[^.]+$/, "");
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        const words = rows.filter(r => r[0] && r[1]).map(r => ({
          id: uid(), en: String(r[0]).trim(), cs: String(r[1]).trim(),
          example: r[2] ? String(r[2]).trim() : "",
          synonyms: r[3] ? String(r[3]).trim() : "",
          score: 0, addedAt: now(),
          vmBox: 1, vmLastReview: null, vmNextReview: null,
          wStats: { total: 0, correct: 0, wrong: 0 },
        }));
        if (!words.length) { alert("Žádná slovíčka nenalezena."); return; }
        const d = { id: uid(), name, lang: activeLang, words, createdAt: now(), deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 } };
        setDecks(ds => [...ds, d]); setDeckId(d.id); setScreen("deck");
      } catch { alert("Nepodařilo se načíst soubor."); }
    };
    rd.readAsArrayBuffer(file);
  }

  function loadSampleDeck() {
    const words = SAMPLE_WORDS.map(w => ({ id: uid(), ...w, synonyms: "", score: 0, addedAt: now(), vmBox: 1, vmLastReview: null, vmNextReview: null, wStats: { total: 0, correct: 0, wrong: 0 } }));
    const d = { id: uid(), name: "Ukázkový balíček", lang: activeLang, words, createdAt: now(), deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 } };
    setDecks(ds => [...ds, d]); setDeckId(d.id); setScreen("deck");
  }

  /* ── deck ops ── */
  const updWord   = (wid, field, val) => setDecks(ds => ds.map(d => d.id !== deckId ? d : { ...d, words: d.words.map(w => w.id !== wid ? w : { ...w, [field]: val }) }));
  function addWord({ en, cs, example, synonyms }) {
    setDecks(ds => ds.map(d => d.id !== deckId ? d : { ...d, words: [...d.words, { id: uid(), en, cs, example, synonyms: synonyms || "", score: 0, addedAt: now(), vmBox: 1, vmLastReview: null, vmNextReview: null, wStats: { total: 0, correct: 0, wrong: 0 } }] }));
  }
  const delWord   = wid  => setDecks(ds => ds.map(d => d.id !== deckId ? d : { ...d, words: d.words.filter(w => w.id !== wid) }));
  function delDeck()        { setDecks(ds => ds.filter(d => d.id !== deckId)); setScreen("home"); }
  function renameDeck(name) { setDecks(ds => ds.map(d => d.id !== deckId ? d : { ...d, name })); }
  function resetStats()     { setDecks(ds => ds.map(d => d.id !== deckId ? d : { ...d, deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 }, words: d.words.map(w => ({ ...w, score: 0, vmBox: 1, vmLastReview: null, vmNextReview: null, wStats: { total: 0, correct: 0, wrong: 0 } })) })); }
  function addLang(l)       { setLangs(ls => [...ls, l]); setLang(l.id); }
  function editLang(u)      { setLangs(ls => ls.map(l => l.id === u.id ? u : l)); }
  function deleteLang(id)   { setDecks(ds => ds.filter(d => d.lang !== id)); setFolders(fs => fs.filter(f => f.lang !== id)); setLangs(ls => ls.filter(l => l.id !== id)); if (activeLang === id) { const rem = langs.filter(l => l.id !== id); if (rem.length) setLang(rem[0].id); } }

  /* ── folder ops ── */
  function addFolder(name)          { setFolders(fs => [...fs, { id: uid(), name, lang: activeLang, createdAt: now() }]); }
  function renameFolder(fid, name)  { setFolders(fs => fs.map(f => f.id === fid ? { ...f, name } : f)); }
  function deleteFolder(fid)        { setFolders(fs => fs.filter(f => f.id !== fid)); setDecks(ds => ds.map(d => d.folderId === fid ? { ...d, folderId: null } : d)); }
  function moveDeck(did, folderId)  { setDecks(ds => ds.map(d => d.id === did ? { ...d, folderId: folderId ?? null } : d)); }

  /* ── export ── */
  function exportDeck() {
    if (!deck) return;
    const rows = [["Anglicky", "Česky", "Příkladová věta", "Synonyma"], ...deck.words.map(w => [w.en, w.cs, w.example || "", w.synonyms || ""])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, deck.name.slice(0, 31));
    XLSX.writeFile(wb, `${deck.name}.xlsx`);
  }

  /* ── session persistence ── */
  function saveSession(words, idx, stats, combo, deckId, mode, translDir, flipDir, folderId) {
    try { localStorage.setItem("lc6_session", JSON.stringify({ deckId, folderId: folderId ?? null, rWords: words.map(w => w.id), rIdx: idx, rStats: stats, combo, mode, translDir, flipDir, savedAt: Date.now() })); } catch {}
  }
  function clearSession()  { try { localStorage.removeItem("lc6_session"); } catch {} }
  function restoreSession(decksSnap) {
    try {
      const raw = localStorage.getItem("lc6_session");
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.savedAt > 86400000) { clearSession(); return null; }
      const d = (decksSnap || decks).find(d => d.id === s.deckId);
      if (!d) return null;
      const wm = new Map(d.words.map(w => [w.id, w]));
      const rWords = (s.rWords || []).map(id => wm.get(id)).filter(Boolean);
      if (!rWords.length) return null;
      return { rWords, rIdx: s.rIdx || 0, rStats: s.rStats || { ok: 0, bad: 0, xp: 0 }, combo: s.combo || 0, deckId: s.deckId, folderId: s.folderId ?? null, mode: s.mode || "transl", translDir: s.translDir || "en-cs", flipDir: s.flipDir || "en-cs" };
    } catch { return null; }
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
    saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, null);
    setScreen("study");
  }

  /* ── start study: whole folder ── */
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
    saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, did, mode, translDir, flipDir, folderId);
    setScreen("study");
  }

  function resumeStudy(decksSnap) {
    const s = restoreSession(decksSnap || decks);
    if (!s) return;
    setDeckId(s.deckId);
    setStudyFolderId(s.folderId ?? null);
    setRWords(s.rWords); setRIdx(s.rIdx); setRStats(s.rStats); setCombo(s.combo);
    setMode(s.mode); setTranslDir(s.translDir); setFlipDir(s.flipDir);
    setPoolUnseen(null); setPoolReturned(new Set()); setDailyPoolDone(false);
    clearCard(); setScreen("study");
  }

  /* ── update word stats across decks (handles folder study) ── */
  function updateWordInDecks(wid, vmUpd, ok) {
    setDecks(ds => ds.map(d => {
      const hasWord = d.words.some(w => w.id === wid);
      if (!hasWord) return d;
      return {
        ...d,
        words: d.words.map(dw => dw.id !== wid ? dw : {
          ...dw, ...vmUpd,
          score: ok ? (dw.score ?? 0) + 1 : Math.max(0, (dw.score ?? 0) - 1),
          wStats: { total: (dw.wStats?.total ?? 0) + 1, correct: (dw.wStats?.correct ?? 0) + (ok ? 1 : 0), wrong: (dw.wStats?.wrong ?? 0) + (ok ? 0 : 1) }
        }),
        deckStats: { totalAnswers: (d.deckStats?.totalAnswers ?? 0) + 1, correctAnswers: (d.deckStats?.correctAnswers ?? 0) + (ok ? 1 : 0), roundsCompleted: d.deckStats?.roundsCompleted ?? 0 },
      };
    }));
  }


  function nextCard() {
    clearTimeout(timerRef.current); clearInterval(intervalRef.current);
    setFB(null); setTx(""); setMicErr(""); setTyped(""); setPronAtt(0); setWrongCountdown(0); setEvalLoading(false); setFlipped(false); setFlipFlash(null);
    const nxt = rIdx + 1;

    // Check if daily pool just finished (current card was last pool card)
    // Pool tracking: kolo skončilo (nxt >= rWords.length)
    // Logika daily done / next round se řeší v finishRound

    if (nxt >= rWords.length) {
      finishRound();
    } else {
      setRIdx(nxt);
      saveSession(rWords, nxt, rStats, combo, deckId, mode, translDir, flipDir, studyFolderId);
    }
  }

  function finishRound() {
    setDecks(ds => ds.map(d => {
      if (studyFolderId ? d.folderId !== studyFolderId : d.id !== deckId) return d;
      return { ...d, deckStats: { totalAnswers: (d.deckStats?.totalAnswers ?? 0) + rStats.ok + rStats.bad, correctAnswers: (d.deckStats?.correctAnswers ?? 0) + rStats.ok, roundsCompleted: (d.deckStats?.roundsCompleted ?? 0) + 1 } };
    }));
    const roundBonus = 50;
    const totalXp = rStats.xp + roundBonus;
    setGameStats(prev => {
      const updated = checkStreak(prev);
      const oldLvl = getLevel(updated.xp ?? 0).level;
      const newXp = (updated.xp ?? 0) + totalXp;
      const newLvl = getLevel(newXp).level;
      const result = { ...updated, xp: newXp };
      setRoundEndData({ xpEarned: totalXp, newLevel: newLvl > oldLvl ? newLvl : null, streak: result.dailyStreak });
      return result;
    });
    clearSession();

    // Po skončení kola: je co pokračovat?
    setPoolUnseen(prev => {
      if (prev === null) { setScreen("roundEnd"); return prev; }
      const nextUnseen = prev; // aktuální stav unseen (po odebrání kola na startu)
      // poolReturned = slova vrácená za toto kolo (špatně/tuším)
      setPoolReturned(returned => {
        const hasUnseen = nextUnseen.size > 0;
        const hasReturned = returned.size > 0;
        if (!hasUnseen && !hasReturned) {
          // Denní pool vyčerpán
          setDailyPoolDone(true);
          setScreen("dailyDone");
        } else {
          setScreen("roundEnd");
        }
        return returned;
      });
      return prev;
    });
  }

  function nextRound() {
    let allWords;
    if (studyFolderId) {
      allWords = getFolderWords(studyFolderId);
    } else {
      allWords = deck?.words ?? [];
    }
    const wordMap = new Map(allWords.map(w => [w.id, w]));

    setPoolUnseen(unseen => {
      let roundWords;
      let newUnseen;
      let newReturned;

      setPoolReturned(returned => {
        if (unseen !== null) {
          // Máme tracking: priorita = unseen, pak returned
          const unseenArr = [...unseen].map(id => wordMap.get(id)).filter(Boolean);
          const returnedArr = [...returned].map(id => wordMap.get(id)).filter(Boolean);

          if (unseenArr.length > 0) {
            // Kolo z unseen (max 15)
            roundWords = pickRound(unseenArr);
            newUnseen = new Set(unseen);
            roundWords.forEach(w => newUnseen.delete(w.id));
            newReturned = new Set(returned); // returned se přenáší dál
          } else if (returnedArr.length > 0) {
            // Unseen vyčerpány, jedeme vrácená slova
            roundWords = pickRound(returnedArr);
            newUnseen = new Set(); // prázdné
            newReturned = new Set(returned);
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

        setTimeout(() => {
          setRWords(roundWords);
          setRIdx(0); setRStats({ ok: 0, bad: 0, xp: 0 }); setCombo(0); clearCard();
          saveSession(roundWords, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, studyFolderId);
          setScreen("study");
        }, 0);

        return newReturned;
      });

      return newUnseen;
    });
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
    saveSession(words, 0, { ok: 0, bad: 0, xp: 0 }, 0, deckId, mode, translDir, flipDir, studyFolderId);
    setScreen("study");
  }

  /* ── mic ── */
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
  function speakWord(text, lang) { if (lang === "en-US" && dictEntry?.audio) playAudio(dictEntry.audio); else doSpeak(synthRef.current, text, lang); }

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

    // Pool: špatně (q=0) nebo tuším (q=3) → vrátit do poolReturned (do příštího kola)
    if (poolUnseen !== null && (quality === 0 || quality === 3)) {
      setPoolReturned(prev => { const next = new Set(prev); next.add(w.id); return next; });
    }

    setTimeout(() => { setFlipFlash(null); setFlipped(false); nextCard(); }, 420);
  }

  /* ── text/mic answer ── */
  async function evalAnswer(text) {
    const w = rWords[rIdx]; if (!w || feedback) return;
    if (mode === "pron") {
      const ok = localMatch(text, w.en);
      if (ok) { commitAnswer(w, 5, text); return; }
      const att = pronAtt + 1;
      if (att >= 3) { commitAnswer(w, 0, text, true); }
      else { setPronAtt(att); setTx(""); setTimeout(() => speakWord(w.en, "en-US"), 300); }
      return;
    }
    const ef = mode === "transl"
      ? (translDir === "en-cs" ? (w.cs + (w.synonyms ? " / " + w.synonyms : "")) : (w.en + (w.synonyms ? " / " + w.synonyms : "")))
      : (w.cs + (w.synonyms ? " / " + w.synonyms : ""));
    if (localMatch(text, ef)) { commitAnswer(w, 5, text); return; }
    setEvalLoading(true);
    setEvalLoading(false);
    commitAnswer(w, 0, text);
  }

  function commitAnswer(w, quality, given, forced = false) {
    const ok = quality >= 3;
    const xpGain = calcXP(quality, combo);
    const newCombo = ok ? combo + 1 : 0;
    setCombo(newCombo);
    const vmUpd = vmUpdate(w, quality);
    setFB({ ok, answer: translDir === "en-cs" ? w.cs : w.en, given, forced, quality });
    setRStats(s => ({ ...s, ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1), xp: s.xp + xpGain }));
    updateWordInDecks(w.id, vmUpd, ok);

    // Pool: špatně → vrátit do poolReturned (do příštího kola, ne do aktuálního)
    if (poolUnseen !== null && !ok) {
      setPoolReturned(prev => { const next = new Set(prev); next.add(w.id); return next; });
    }
  }

  function submitTyped()  { if (typed.trim()) evalAnswer(typed.trim()); }
  function dontKnow()     {
    const w = rWords[rIdx]; if (!w || feedback) return;
    const ans = translDir === "en-cs" ? w.cs : w.en;
    const lang = translDir === "en-cs" ? "cs-CZ" : "en-US";
    commitAnswer(w, 0, "");
    speakWord(ans, lang);
  }

  /* ── loading spinner ── */
  if (!loaded) return (
    <div style={{ minHeight: "100dvh", background: "var(--lc-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid var(--lc-inputBorder)", borderTopColor: "var(--lc-gold)", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <style>{STYLE}</style>
    </div>
  );

  /* ── routing ── */
  if (screen === "home") return (
    <>
      {showOnboarding && (
        <OnboardingModal
          onSample={() => { loadSampleDeck(); setShowOnboarding(false); }}
          onUpload={f => { loadFile(f); setShowOnboarding(false); }}
          onClose={() => setShowOnboarding(false)}
        />
      )}
      <HomeScreen
        decks={decks} langs={langs} activeLang={activeLang} gameStats={gameStats} folders={folders}
        onLangSwitch={setLang} onAddLang={addLang} onEditLang={editLang} onDeleteLang={deleteLang}
        onSelect={id => { setDeckId(id); setScreen("deck"); }}
        onFileUpload={loadFile} onSampleDeck={loadSampleDeck}
        onAddFolder={addFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} onMoveDeck={moveDeck}
        onFolderStudy={startFolderStudy}
      />
    </>
  );

  if (screen === "deck" && deck) {
    const lc = langs.find(l => l.id === deck.lang) || langs[0];
    const savedSess = restoreSession(decks);
    const hasSavedSession = !!(savedSess && savedSess.deckId === deck.id);
    return (
      <DeckScreen
        deck={deck} langCfg={lc} hasSavedSession={hasSavedSession}
        onBack={() => setScreen("home")} onStart={startStudy} onResume={() => resumeStudy(decks)}
        onUpdate={updWord} onAddWord={addWord} onDeleteWord={delWord}
        onDeleteDeck={delDeck} onRename={renameDeck} onResetStats={resetStats} onExport={exportDeck}
        lightMode={lightMode} onToggleLight={toggleLight}
      />
    );
  }

  if (screen === "roundEnd") return (
    <RoundEnd
      stats={rStats} total={rWords.length}
      deckName={studyFolderId ? (folders.find(f => f.id === studyFolderId)?.name ?? "Složka") : (deck?.name ?? "")}
      xpEarned={roundEndData?.xpEarned ?? 0} newLevel={roundEndData?.newLevel}
      streak={roundEndData?.streak} onNext={nextRound} onBack={() => setScreen(studyFolderId ? "home" : "deck")}
    />
  );

  if (screen === "dailyDone") return (
    <DailyDoneScreen
      stats={rStats}
      deckName={studyFolderId ? (folders.find(f => f.id === studyFolderId)?.name ?? "Složka") : (deck?.name ?? "")}
      onEnd={() => setScreen(studyFolderId ? "home" : "deck")}
      onContinue={continueAfterDailyDone}
    />
  );

  /* ── STUDY screen ── */
  return (
    <StudyScreen
      deck={deck} langs={langs}
      rWords={rWords} rIdx={rIdx} rStats={rStats} combo={combo}
      feedback={feedback} flipFlash={flipFlash} flipped={flipped}
      listenOn={listenOn} tx={tx} micSt={micSt} micErr={micErr}
      iMode={iMode} typed={typed} autoPlay={autoPlay} playSounds={playSounds}
      pronAtt={pronAtt} evalLoading={evalLoading}
      wrongCountdown={wrongCountdown} dictEntry={dictEntry}
      mode={mode} translDir={translDir} flipDir={flipDir}
      studyFolderId={studyFolderId}
      folderName={studyFolderId ? (folders.find(f => f.id === studyFolderId)?.name ?? "Složka") : null}
      onSetMode={m => { setMode(m); clearCard(); }}
      onSetTranslDir={v => { setTranslDir(v); clearCard(); }}
      onSetFlipDir={v => { setFlipDir(v); clearCard(); }}
      onSetIMode={m => { setIMode(m); setMicErr(""); setTx(""); }}
      onSetTyped={setTyped}
      onSetAutoPlay={setAutoPlay}
      onSetPlaySounds={v => { setPlaySounds(v); try { localStorage.setItem("lc6_playSounds", String(v)); } catch {} }}
      onFlip={() => {
        setFlipped(true);
        if (flipDir === "cs-en" && autoPlay) {
          setTimeout(() => speakWord(rWords[rIdx]?.en, "en-US"), 200);
        }
      }}
      onFlipAnswer={flipAnswer}
      onStartListen={startListen}
      onStopListen={stopListen}
      onSubmitTyped={submitTyped}
      onDontKnow={dontKnow}
      onNextCard={nextCard}
      onBack={() => setScreen(studyFolderId ? "home" : "deck")}
      onSpeak={speakWord}
    />
  );
}
