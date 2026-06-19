import { useState, useEffect, useRef } from "react";
import { C, STYLE } from "./constants.js";
import { uid, now } from "./utils.js";
import { supabase } from "./supabase.js";

/* ── Pomocna funkce: normalizace textu pro hledani (odstrani diakritiku + interpunkci) ── */
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // diakritika
    .replace(/[^a-z0-9\s]/g, " ")      // interpunkce -> mezera
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Konstanty ── */
const SORT_OPTIONS = [
  { id: "az",       label: "A → Z" },
  { id: "za",       label: "Z → A" },
  { id: "level-az", label: "Uroven ↑" },
  { id: "level-za", label: "Uroven ↓" },
  { id: "new",      label: "Nejnovejsi" },
  { id: "old",      label: "Nejstarsi" },
];

const LEVEL_ORDER = ["A1","A2","B1","B2","C1","C2"];

const CATEGORIES = [
  { id: "all",            label: "Vse" },
  { id: "bezna_anglictina", label: "Bezna anglictina" },
  { id: "deti",           label: "Deti" },
  { id: "elektrotechnika", label: "Elektrotechnika" },
  { id: "farmacie",       label: "Farmacie" },
  { id: "medicina",       label: "Medicina" },
  { id: "strojirstvi",    label: "Strojirstvi" },
];

const LEVEL_FILTER = [
  { id: "all", label: "Vse" },
  { id: "A1", label: "A1" },
  { id: "A2", label: "A2" },
  { id: "B1", label: "B1" },
  { id: "B2", label: "B2" },
  { id: "C1", label: "C1" },
  { id: "C2", label: "C2" },
];

/* ── Info popover na karte balicku ── */
function DeckInfoPopover({ deck }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
      <button
        className="btn"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: 20, height: 20, borderRadius: "50%",
          background: open ? "var(--lc-selBg)" : "var(--lc-cardAlt)",
          border: `1px solid ${open ? "var(--lc-selBorder)" : C.border}`,
          color: open ? C.gold : C.mutedDark,
          fontSize: 10, fontWeight: 700, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all .15s", padding: 0,
          fontFamily: "system-ui, sans-serif",
        }}
        title="Informace o balicku"
      >
        i
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "var(--lc-card)",
            border: `1px solid var(--lc-modalBorder)`,
            borderRadius: 12, padding: "12px 14px",
            width: 230, zIndex: 100,
            boxShadow: `0 8px 24px var(--lc-shadow)`,
            animation: "fadeUp .15s ease both",
          }}
        >
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 700, color: C.gold, marginBottom: 6 }}>
            {deck.title}
          </div>
          {deck.long_desc ? (
            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
              {deck.long_desc}
            </div>
          ) : deck.description ? (
            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
              {deck.description}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Popis neni k dispozici.</div>
          )}
          {deck.level && (
            <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
              Uroven: <span style={{ color: C.gold, fontWeight: 700 }}>{deck.level}</span>
            </div>
          )}
          {deck.category && (
            <div style={{ fontSize: 11, color: C.muted }}>
              Kategorie: <span style={{ color: C.textDim }}>{CATEGORIES.find(c => c.id === deck.category)?.label || deck.category}</span>
            </div>
          )}
          {/* Sipka nahoru */}
          <div style={{
            position: "absolute", top: -5, right: 8,
            width: 8, height: 8,
            background: "var(--lc-card)",
            border: `1px solid var(--lc-modalBorder)`,
            borderBottom: "none", borderRight: "none",
            transform: "rotate(45deg)",
          }} />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   LibraryScreen
══════════════════════════════════════════════════════════════ */
export default function LibraryScreen({ onBack, onDownload, activeLang, lightMode }) {
  const [decks, setDecks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [downloaded, setDownloaded] = useState(new Set());
  const [downloading, setDownloading] = useState(null);
  const [search, setSearch]         = useState("");
  const [sort, setSort]             = useState("new");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const isOnline = navigator.onLine;

  /* ── Nacteni ── */
  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }
    supabase
      .from("public_decks")
      .select("id, title, description, long_desc, language_pair, cards_count, created_at, level, category")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError("Nepodarilo se nacist knihovnu.");
        else setDecks(data ?? []);
        setLoading(false);
      });
  }, []);

  /* ── Stazeni balicku ── */
  async function handleDownload(deck) {
    if (!isOnline) return;
    setDownloading(deck.id);
    const { data, error } = await supabase
      .from("public_decks")
      .select("cards, words")
      .eq("id", deck.id)
      .single();

    if (error || (!data?.cards && !data?.words)) {
      alert("Nepodarilo se stahnout karticky.");
      setDownloading(null);
      return;
    }

    const rawWords = data.words ?? data.cards ?? [];
    const ts = new Date().toISOString();
    const words = rawWords.map(c => ({
      id:           uid(),
      en:           c.english ?? c.en ?? "",
      cs:           c.czech   ?? c.cs ?? "",
      phonetic:     c.phonetic ?? c.ipa ?? "",
      example:      c.example  ?? "",
      synonyms:     c.synonyms ?? "",
      score:        0,
      addedAt:      now(),
      vmBox:        1,
      vmLastReview: null,
      vmNextReview: null,
      wStats:       { total: 0, correct: 0, wrong: 0 },
      updatedAt:    ts,
    }));

    const newDeck = {
      id:          uid(),
      name:        deck.title,
      // Vždy aktivní jazyk (stejně jako u nahrávání Excelu) — language_pair
      // z public_decks nemusí přesně odpovídat ID v langs a balíček by pak
      // v přehledu na hlavní stránce nikdy nešel najít.
      lang:        activeLang ?? "en",
      folderId:    null,
      words,
      createdAt:   now(),
      updatedAt:   ts,
      deckStats:   { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 },
      fromLibrary: deck.id,
    };

    onDownload(newDeck);
    setDownloaded(prev => new Set([...prev, deck.id]));
    setDownloading(null);
  }

  /* ── Filtrovani + razeni ── */
  const normSearch = normalize(search);

  const filtered = decks
    .filter(d => {
      if (filterLevel !== "all" && d.level !== filterLevel) return false;
      if (filterCategory !== "all" && d.category !== filterCategory) return false;
      if (normSearch) {
        const inTitle = normalize(d.title).includes(normSearch);
        const inDesc  = normalize(d.description).includes(normSearch) || normalize(d.long_desc).includes(normSearch);
        if (!inTitle && !inDesc) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "az")       return (a.title || "").localeCompare(b.title || "", "cs");
      if (sort === "za")       return (b.title || "").localeCompare(a.title || "", "cs");
      if (sort === "level-az") return (LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
      if (sort === "level-za") return (LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level));
      if (sort === "old")      return new Date(a.created_at) - new Date(b.created_at);
      return new Date(b.created_at) - new Date(a.created_at); // "new" default
    });

  /* ── Render ── */
  return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 1rem 3rem", fontFamily: "'Lora',Georgia,serif", color: C.text }}>
      <style>{STYLE}</style>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 860, display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
        <button className="btn" onClick={onBack}
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.gold}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
          ← Zpet
        </button>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: C.gold }}>📚 Knihovna</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Verejne sady ke stazeni</div>
        </div>
      </div>

      {/* Offline warning */}
      {!isOnline && (
        <div style={{ width: "100%", maxWidth: 860, background: "var(--lc-errBg)", border: `1px solid var(--lc-errBorder)`, borderRadius: 12, padding: "14px 18px", marginBottom: "1rem", color: "var(--lc-err)", fontSize: 14 }}>
          📡 Jsi offline. Knihovna je dostupna pouze pri pripojeni k internetu.
        </div>
      )}

      {/* Hledani + razeni (radek 1) + filtry (radek 2) */}
      {isOnline && !loading && !error && (
        <div style={{ width: "100%", maxWidth: 860, marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Radek 1: razeni vlevo | hledani uprostred */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Razeni */}
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              style={{ background: "var(--lc-card)", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 10, padding: "8px 12px", fontSize: 12, fontFamily: "'Lora',serif", cursor: "pointer", outline: "none", flexShrink: 0 }}>
              {SORT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>

            {/* Hledani */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat sadu…"
              style={{
                flex: 1, minWidth: 160,
                background: "var(--lc-card)", border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "8px 14px", fontSize: 13,
                color: C.text, outline: "none", fontFamily: "'Lora',serif",
              }}
              onFocus={e => e.target.style.borderColor = C.gold}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>

          {/* Radek 2: filtry vpravo */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {/* Uroven */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>Uroven:</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {LEVEL_FILTER.map(l => (
                  <button key={l.id} className="btn" onClick={() => setFilterLevel(l.id)}
                    style={{
                      padding: "3px 9px", borderRadius: 7, fontSize: 11,
                      border: `1px solid ${filterLevel === l.id ? "var(--lc-selBorder)" : C.border}`,
                      background: filterLevel === l.id ? "var(--lc-selBg)" : "transparent",
                      color: filterLevel === l.id ? C.gold : C.muted,
                      cursor: "pointer",
                    }}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Kategorie */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>Kategorie:</span>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{ background: "var(--lc-card)", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontFamily: "'Lora',serif", cursor: "pointer", outline: "none" }}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Stavy */}
      {loading && (
        <div style={{ marginTop: "4rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 32, height: 32, border: `3px solid var(--lc-inputBorder)`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <div style={{ color: C.muted, fontSize: 13 }}>Nacitam knihovnu…</div>
        </div>
      )}
      {!loading && error && (
        <div style={{ color: "var(--lc-err)", fontSize: 14, marginTop: "2rem" }}>{error}</div>
      )}
      {!loading && !error && isOnline && filtered.length === 0 && (
        <div style={{ color: C.muted, fontSize: 14, fontStyle: "italic", marginTop: "3rem" }}>
          {search || filterLevel !== "all" || filterCategory !== "all" ? "Zadne sady neodpovidaji filtrum." : "Knihovna je zatim prazdna."}
        </div>
      )}

      {/* Grid balicku */}
      {!loading && !error && isOnline && (
        <div style={{ width: "100%", maxWidth: 860, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
          {filtered.map(deck => {
            const isDone    = downloaded.has(deck.id);
            const isLoading = downloading === deck.id;

            return (
              <div key={deck.id} style={{
                position: "relative",
                background: "var(--lc-card)", border: `1px solid ${C.border}`,
                borderRadius: 16, padding: "16px", display: "flex",
                flexDirection: "column", gap: 8, transition: "border-color .2s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.goldDim}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>

                {/* Info tlacitko */}
                <DeckInfoPopover deck={deck} />

                {/* Badges: uroven + kategorie */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingRight: 24 }}>
                  {deck.level && (
                    <div style={{ background: "var(--lc-selBg)", border: `1px solid var(--lc-selBorder)`, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: 1 }}>
                      {deck.level}
                    </div>
                  )}
                  {deck.category && (
                    <div style={{ background: "var(--lc-cardAlt)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: C.muted, letterSpacing: .5 }}>
                      {CATEGORIES.find(c => c.id === deck.category)?.label || deck.category}
                    </div>
                  )}
                </div>

                {/* Nazev */}
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                  {deck.title}
                </div>

                {/* Kratky popis */}
                {deck.description && (
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, flex: 1 }}>
                    {deck.description}
                  </div>
                )}

                {/* Pocet karet */}
                <div style={{ fontSize: 11, color: C.mutedDark }}>
                  📇 {deck.cards_count ?? "?"} karet
                </div>

                {/* Tlacitko stazeni */}
                <button
                  className="btn"
                  onClick={() => !isDone && !isLoading && handleDownload(deck)}
                  disabled={isDone || isLoading}
                  style={{
                    marginTop: 4, padding: "8px 0", borderRadius: 10,
                    border: `1px solid ${isDone ? "var(--lc-selBorder)" : C.gold}`,
                    background: isDone ? "var(--lc-selBg)" : "transparent",
                    color: C.gold, fontSize: 13, fontWeight: 700,
                    cursor: isDone ? "default" : "pointer",
                    transition: "all .2s", opacity: isLoading ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!isDone && !isLoading) { e.currentTarget.style.background = C.gold; e.currentTarget.style.color = C.bg; } }}
                  onMouseLeave={e => { if (!isDone && !isLoading) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.gold; } }}>
                  {isLoading ? "Stahuji…" : isDone ? "✓ Stazeno" : "⬇ Stahnout"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
