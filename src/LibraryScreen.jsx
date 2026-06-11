/* ══════════════════════════════════════════════════════════════
   LibraryScreen.jsx — Centrální knihovna veřejných balíčků
   ══════════════════════════════════════════════════════════════
   - Načítá public_decks ze Supabase (jen při online)
   - Uživatel může stáhnout sadu do své kolekce
   - Stahování funguje jen při připojení k internetu
══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { C, STYLE } from "./constants.js";
import { uid, now } from "./utils.js";
import { supabase } from "./supabase.js";

export default function LibraryScreen({ onBack, onDownload, activeLang, lightMode }) {
  const [decks, setDecks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [downloaded, setDownloaded] = useState(new Set()); // id stažených sad v této session
  const [downloading, setDownloading] = useState(null);   // id právě staženého
  const [search, setSearch]     = useState("");
  const [filterLang, setFilterLang] = useState("all");

  const isOnline = navigator.onLine;

  /* ── Načti public_decks ze Supabase ── */
  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }

    supabase
      .from("public_decks")
      .select("id, title, description, language_pair, cards_count, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { setError("Nepodařilo se načíst knihovnu."); }
        else { setDecks(data ?? []); }
        setLoading(false);
      });
  }, []);

  /* ── Stáhni sadu ── */
  async function handleDownload(deck) {
    if (!isOnline) return;
    setDownloading(deck.id);

    // Stáhni karty (JSONB pole) pro tuto sadu
    const { data, error } = await supabase
      .from("public_decks")
      .select("cards")
      .eq("id", deck.id)
      .single();

    if (error || !data?.cards) {
      alert("Nepodařilo se stáhnout kartičky.");
      setDownloading(null);
      return;
    }

    // Sestav lokální deck objekt
    const ts = new Date().toISOString();
    const words = (data.cards ?? []).map(c => ({
      id:           uid(),
      en:           c.english ?? c.en ?? "",
      cs:           c.czech   ?? c.cs ?? "",
      example:      c.example  ?? "",
      synonyms:     c.synonyms ?? "",
      ipa:          c.ipa      ?? null,
      audioUrl:     c.audio_url ?? null,
      score:        0,
      addedAt:      now(),
      vmBox:        1,
      vmLastReview: null,
      vmNextReview: null,
      wStats:       { total: 0, correct: 0, wrong: 0 },
      updatedAt:    ts,
    }));

    const newDeck = {
      id:         uid(),
      name:       deck.title,
      lang:       deck.language_pair ?? activeLang ?? "en",
      folderId:   null,
      words,
      createdAt:  now(),
      updatedAt:  ts,
      deckStats:  { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 },
      fromLibrary: deck.id, // reference na zdrojovou public_deck
    };

    onDownload(newDeck);
    setDownloaded(prev => new Set([...prev, deck.id]));
    setDownloading(null);
  }

  /* ── Filtrování ── */
  const langOptions = ["all", ...new Set(decks.map(d => d.language_pair).filter(Boolean))];
  const filtered = decks.filter(d => {
    const matchLang   = filterLang === "all" || d.language_pair === filterLang;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase())
                                || (d.description ?? "").toLowerCase().includes(search.toLowerCase());
    return matchLang && matchSearch;
  });

  /* ── Render ── */
  return (
    <div className={lightMode ? "lc-light" : ""} style={{ minHeight: "100dvh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 1rem 3rem" }}>
      <style>{STYLE}</style>

      {/* header */}
      <div style={{ width: "100%", maxWidth: 780, display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
        <button className="btn" onClick={onBack}
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.gold}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
          ← Zpět
        </button>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: C.gold }}>📚 Knihovna</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Veřejné sady ke stažení</div>
        </div>
      </div>

      {/* offline warning */}
      {!isOnline && (
        <div style={{ width: "100%", maxWidth: 780, background: "var(--lc-errBg)", border: `1px solid var(--lc-errBorder)`, borderRadius: 12, padding: "14px 18px", marginBottom: "1rem", color: "var(--lc-err)", fontSize: 14 }}>
          📡 Jsi offline. Knihovna je dostupná pouze při připojení k internetu.
        </div>
      )}

      {/* search + filter */}
      {isOnline && !loading && !error && (
        <div style={{ width: "100%", maxWidth: 780, display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hledat sadu…"
            style={{
              flex: 1, minWidth: 180,
              background: "var(--lc-card)", border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "8px 14px", fontSize: 13,
              color: C.text, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = C.gold}
            onBlur={e => e.target.style.borderColor = C.border}
          />
          {langOptions.length > 2 && (
            <select
              value={filterLang}
              onChange={e => setFilterLang(e.target.value)}
              style={{
                background: "var(--lc-card)", border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "8px 12px", fontSize: 13,
                color: C.textDim, cursor: "pointer", outline: "none",
              }}>
              <option value="all">Všechny jazyky</option>
              {langOptions.filter(l => l !== "all").map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* stavy */}
      {loading && (
        <div style={{ marginTop: "4rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 32, height: 32, border: `3px solid var(--lc-inputBorder)`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <div style={{ color: C.muted, fontSize: 13 }}>Načítám knihovnu…</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ color: "var(--lc-err)", fontSize: 14, marginTop: "2rem" }}>{error}</div>
      )}

      {!loading && !error && isOnline && filtered.length === 0 && (
        <div style={{ color: C.muted, fontSize: 14, fontStyle: "italic", marginTop: "3rem" }}>
          {search ? "Žádné sady neodpovídají hledání." : "Knihovna je zatím prázdná."}
        </div>
      )}

      {/* deck grid */}
      {!loading && !error && isOnline && (
        <div style={{ width: "100%", maxWidth: 780, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {filtered.map(deck => {
            const isDone       = downloaded.has(deck.id);
            const isLoading    = downloading === deck.id;
            const langLabel    = deck.language_pair ?? "";

            return (
              <div key={deck.id} style={{
                background: "var(--lc-card)", border: `1px solid ${C.border}`,
                borderRadius: 16, padding: "16px", display: "flex",
                flexDirection: "column", gap: 8, transition: "border-color .2s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.goldDim}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>

                {/* lang badge */}
                {langLabel && (
                  <div style={{ alignSelf: "flex-start", background: "var(--lc-selBg)", border: `1px solid var(--lc-selBorder)`, borderRadius: 6, padding: "2px 8px", fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                    {langLabel}
                  </div>
                )}

                {/* title */}
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                  {deck.title}
                </div>

                {/* description */}
                {deck.description && (
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, flex: 1 }}>
                    {deck.description}
                  </div>
                )}

                {/* cards count */}
                <div style={{ fontSize: 11, color: C.mutedDark }}>
                  📇 {deck.cards_count ?? "?"} karet
                </div>

                {/* download button */}
                <button
                  className="btn"
                  onClick={() => !isDone && !isLoading && handleDownload(deck)}
                  disabled={isDone || isLoading}
                  style={{
                    marginTop: 4,
                    padding: "8px 0",
                    borderRadius: 10,
                    border: `1px solid ${isDone ? "var(--lc-selBorder)" : C.gold}`,
                    background: isDone ? "var(--lc-selBg)" : "transparent",
                    color: isDone ? C.gold : C.gold,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isDone ? "default" : "pointer",
                    transition: "all .2s",
                    opacity: isLoading ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!isDone && !isLoading) { e.currentTarget.style.background = C.gold; e.currentTarget.style.color = C.bg; } }}
                  onMouseLeave={e => { if (!isDone && !isLoading) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.gold; } }}>
                  {isLoading ? "Stahuji…" : isDone ? "✓ Staženo" : "⬇ Stáhnout"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
