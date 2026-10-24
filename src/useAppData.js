/* ══════════════════════════════════════════════════════════════
   useAppData.js — LexiCard: data aplikace (balíčky, složky, jazyky,
   statistiky) + načtení/uložení do localStorage + operace nad daty
══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { DEFAULT_LANGS, SAMPLE_WORDS } from "./constants.js";
import { uid, now } from "./utils.js";
import { addTombstones } from "./sync.js";

const isoNow = () => new Date().toISOString();
const emptyStats = () => ({ totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 });
const newWordFields = () => ({ score: 0, addedAt: now(), vmBox: 1, vmLastReview: null, vmNextReview: null, wStats: { total: 0, correct: 0, wrong: 0 } });

export function useAppData() {
  const [decks, setDecks]           = useState([]);
  const [langs, setLangs]           = useState(DEFAULT_LANGS);
  const [folders, setFolders]       = useState([]);
  const [activeLang, setLang]       = useState("en");
  const [loaded, setLoaded]         = useState(false);
  const [gameStats, setGameStats]   = useState({ xp: 0, dailyStreak: 0, lastStudyDate: null });
  const [showOnboarding, setShowOnboarding]         = useState(false);
  const [showEnVoiceWarning, setShowEnVoiceWarning] = useState(false);

  /* ── načtení z localStorage (jednou při startu) ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lc6_data");
      if (raw) {
        const d = JSON.parse(raw);
        if (d.decks) {
          // Migrace: synonyms mohly být uloženy jako pole (z Supabase JSONB) — normalizuj na string
          // + F4: každá položka musí mít updatedAt (jinak by se pořád jevila jako neodeslaná)
          const fallbackTs = isoNow();
          const migratedDecks = d.decks.map(deck => ({
            ...deck,
            updatedAt: deck.updatedAt ?? fallbackTs,
            words: (deck.words || []).map(w => ({
              ...w,
              updatedAt: w.updatedAt ?? deck.updatedAt ?? fallbackTs,
              synonyms: Array.isArray(w.synonyms) ? w.synonyms.join(", ") : (w.synonyms ?? ""),
            })),
          }));
          // eslint-disable-next-line react-hooks/set-state-in-effect -- jednorázové načtení z localStorage
          setDecks(migratedDecks);
        }
        if (d.lang)      setLang(d.lang);
        if (d.langs)     setLangs(p => { const ids = new Set(p.map(l => l.id)); return [...p, ...d.langs.filter(l => !ids.has(l.id))]; });
        if (d.gameStats) setGameStats(d.gameStats);
        if (d.folders)   setFolders(d.folders.map(f => (f.updatedAt ? f : { ...f, updatedAt: new Date(f.createdAt || Date.now()).toISOString() })));
      } else {
        setShowOnboarding(true);
      }
    } catch { /* úložiště nedostupné */ }
    setLoaded(true);

    // Zkontroluj dostupnost anglického hlasu — jednorázově
    const alreadyWarned = localStorage.getItem("lc6_enVoiceWarned") === "1";
    if (!alreadyWarned && window.speechSynthesis) {
      const check = () => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return; // ještě nenačteno
        const hasEn = voices.some(v => v.lang.toLowerCase().startsWith("en"));
        if (!hasEn) setShowEnVoiceWarning(true);
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        check();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          check();
        };
        setTimeout(check, 1000); // pokud onvoiceschanged nikdy nepřijde
      }
    }
  }, []);

  /* ── uložení do localStorage se zpožděním 400 ms, při skrytí/zavření okamžitě ── */
  const saveTimerRef   = useRef(null);
  const pendingSaveRef = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    pendingSaveRef.current = () => {
      try { localStorage.setItem("lc6_data", JSON.stringify({ decks, lang: activeLang, langs: langs.filter(l => l.custom), gameStats, folders })); } catch { /* úložiště plné/nedostupné */ }
    };
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { pendingSaveRef.current?.(); pendingSaveRef.current = null; }, 400);
  }, [decks, activeLang, langs, loaded, gameStats, folders]);

  useEffect(() => {
    const flush = () => {
      if (!pendingSaveRef.current) return;
      clearTimeout(saveTimerRef.current);
      pendingSaveRef.current();
      pendingSaveRef.current = null;
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* ── vytvoření balíčku ── */
  function createDeck(name, words) {
    const ts = isoNow();
    const d = { id: uid(), name, lang: activeLang, words: words.map(w => ({ ...w, updatedAt: ts })), createdAt: now(), updatedAt: ts, deckStats: emptyStats() };
    setDecks(ds => [...ds, d]);
    return d;
  }

  /** Načte Excel/CSV a vytvoří balíček; onCreated(deck) po úspěchu */
  function importFile(file, onCreated) {
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
          ...newWordFields(),
        }));
        if (!words.length) { alert("Žádná slovíčka nenalezena."); return; }
        onCreated?.(createDeck(name, words));
      } catch { alert("Nepodařilo se načíst soubor."); }
    };
    rd.readAsArrayBuffer(file);
  }

  function createSampleDeck() {
    return createDeck("Ukázkový balíček", SAMPLE_WORDS.map(w => ({ id: uid(), ...w, synonyms: "", ...newWordFields() })));
  }

  function addLibraryDeck(newDeck) { setDecks(ds => [...ds, newDeck]); }

  /* ── operace nad slovíčky / balíčky (deckId předává volající) ── */
  const touchDeck = (deckId, fn) => setDecks(ds => ds.map(d => d.id !== deckId ? d : { ...d, updatedAt: isoNow(), ...fn(d) }));

  function updWord(deckId, wid, field, val) {
    touchDeck(deckId, d => ({ words: d.words.map(w => w.id !== wid ? w : { ...w, [field]: val, updatedAt: isoNow() }) }));
  }
  function addWord(deckId, { en, cs, example, synonyms }) {
    touchDeck(deckId, d => ({ words: [...d.words, { id: uid(), en, cs, example, synonyms: synonyms || "", ...newWordFields(), updatedAt: isoNow() }] }));
  }
  function delWord(deckId, wid) {
    addTombstones("cards", [wid]);
    touchDeck(deckId, d => ({ words: d.words.filter(w => w.id !== wid) }));
  }
  function renameDeck(deckId, name) { touchDeck(deckId, () => ({ name })); }
  function delDeck(deckId) {
    // Balíček se v Supabase označí jako smazaný (deleted_at) při příští synchronizaci
    addTombstones("decks", [deckId]);
    setDecks(ds => ds.filter(d => d.id !== deckId));
  }
  function resetStats(deckId) {
    touchDeck(deckId, d => ({
      deckStats: emptyStats(),
      words: d.words.map(w => ({ ...w, score: 0, vmBox: 1, vmLastReview: null, vmNextReview: null, wStats: { total: 0, correct: 0, wrong: 0 }, updatedAt: isoNow() })),
    }));
  }
  function exportDeck(deck) {
    if (!deck) return;
    const rows = [["Anglicky", "Česky", "Příkladová věta", "Synonyma"], ...deck.words.map(w => [w.en, w.cs, w.example || "", w.synonyms || ""])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, deck.name.slice(0, 31));
    XLSX.writeFile(wb, `${deck.name}.xlsx`);
  }

  /* ── jazyky ── */
  function addLang(l)     { setLangs(ls => [...ls, l]); setLang(l.id); }
  function editLang(u)    { setLangs(ls => ls.map(l => l.id === u.id ? u : l)); }
  function deleteLang(id) {
    addTombstones("decks", decks.filter(d => d.lang === id).map(d => d.id));
    addTombstones("folders", folders.filter(f => f.lang === id).map(f => f.id));
    setDecks(ds => ds.filter(d => d.lang !== id));
    setFolders(fs => fs.filter(f => f.lang !== id));
    setLangs(ls => ls.filter(l => l.id !== id));
    if (activeLang === id) { const rem = langs.filter(l => l.id !== id); if (rem.length) setLang(rem[0].id); }
  }

  /* ── složky (updatedAt → změny se synchronizují) ── */
  function addFolder(name)         { setFolders(fs => [...fs, { id: uid(), name, lang: activeLang, createdAt: now(), updatedAt: isoNow() }]); }
  function renameFolder(fid, name) { setFolders(fs => fs.map(f => f.id === fid ? { ...f, name, updatedAt: isoNow() } : f)); }
  function deleteFolder(fid) {
    addTombstones("folders", [fid]);
    setFolders(fs => fs.filter(f => f.id !== fid));
    setDecks(ds => ds.map(d => d.folderId === fid ? { ...d, folderId: null, updatedAt: isoNow() } : d));
  }
  function moveDeck(did, folderId) { setDecks(ds => ds.map(d => d.id === did ? { ...d, folderId: folderId ?? null, updatedAt: isoNow() } : d)); }

  return {
    decks, setDecks, langs, folders, setFolders, activeLang, setLang, loaded, gameStats, setGameStats,
    showOnboarding, setShowOnboarding, showEnVoiceWarning, setShowEnVoiceWarning,
    importFile, createSampleDeck, addLibraryDeck,
    updWord, addWord, delWord, renameDeck, delDeck, resetStats, exportDeck,
    addLang, editLang, deleteLang,
    addFolder, renameFolder, deleteFolder, moveDeck,
  };
}
