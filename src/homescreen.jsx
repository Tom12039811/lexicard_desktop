import React, { useState } from "react";
import { C, DEFAULT_LANGS, STYLE } from "./constants.js";
import { sortDecks, getLevel } from "./utils.js";

function HomeScreen({ decks, globalStats, langCfg, onCreateDeck, onSelectDeck, onDeleteDeck, onChangeLang }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [dSort, setDSort] = useState("date-desc");

  const handleCreateDeck = () => {
    if (!newDeckName.trim()) return;
    onCreateDeck(newDeckName.trim());
    setNewDeckName("");
    setShowCreateModal(false);
  };

  const sorted = sortDecks(decks, dSort);
  const levelInfo = getLevel(globalStats.xp);

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora', Georgia, serif", color: C.text, display: "flex", flexDirection: "column", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "1rem" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Top row: Logo + Settings */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: C.gold }}>📚 LexiCard</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={langCfg.id} onChange={e => {
                const newLang = DEFAULT_LANGS.find(l => l.id === e.target.value);
                if (newLang) onChangeLang(newLang);
              }} style={{ background: "#111622", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "'Lora', serif", cursor: "pointer", outline: "none" }}>
                {DEFAULT_LANGS.map(l => <option key={l.id} value={l.id}>{l.flag} {l.label}</option>)}
              </select>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <div style={{ background: "#1a1608", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.gold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Level</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: C.gold }}>{levelInfo.level}</div>
            </div>
            <div style={{ background: "#121a2e", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#7090c8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>XP</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#7090c8" }}>{globalStats.xp}</div>
            </div>
            <div style={{ background: C.okBg, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.ok, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Balíčků</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: C.ok }}>{decks.length}</div>
            </div>
            <div style={{ background: globalStats.dailyStreak > 0 ? "#1a1608" : "#1a1a1a", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: globalStats.dailyStreak > 0 ? C.gold : C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Streak</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: globalStats.dailyStreak > 0 ? C.gold : C.muted }}>
                {globalStats.dailyStreak > 0 ? `🔥 ${globalStats.dailyStreak}` : "—"}
              </div>
            </div>
          </div>

          {/* Create button */}
          <button className="btn" onClick={() => setShowCreateModal(true)} style={{ background: C.gold, color: C.bg, border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Playfair Display', serif" }}>
            + Nový balíček
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, maxWidth: 1020, margin: "0 auto", width: "100%", padding: "1rem", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Sort dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, flexShrink: 0 }}>Řadit:</span>
          <select value={dSort} onChange={e => setDSort(e.target.value)} style={{ background: "#111622", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontFamily: "'Lora', serif", cursor: "pointer", outline: "none" }}>
            <option value="date-desc">Nejnovější</option>
            <option value="date-asc">Nejstarší</option>
            <option value="name-asc">A–Z</option>
            <option value="name-desc">Z–A</option>
          </select>
        </div>

        {/* Decks list */}
        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: C.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 16, marginBottom: 6 }}>Zatím žádné balíčky</div>
            <div style={{ fontSize: 13 }}>Klikni na „Nový balíček" a začni se učit!</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {sorted.map(deck => (
              <div key={deck.id} onClick={() => onSelectDeck(deck)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.2rem", cursor: "pointer", transition: "all .2s", display: "flex", flexDirection: "column", gap: 10 }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = "#1a2230"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: C.gold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {deck.name}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  <div style={{ background: "#0e1320", borderRadius: 8, padding: "6px", textAlign: "center" }}>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Slov</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: C.text }}>{deck.words.length}</div>
                  </div>
                  <div style={{ background: "#0e1320", borderRadius: 8, padding: "6px", textAlign: "center" }}>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Procvičeno</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: C.text }}>{deck.deckStats?.totalAnswers || 0}</div>
                  </div>
                </div>
                <button className="btn" onClick={e => {
                  e.stopPropagation();
                  onDeleteDeck(deck.id);
                }} style={{ background: "transparent", border: `1px solid ${C.err}`, color: C.err, borderRadius: 8, padding: "6px", fontSize: 12, cursor: "pointer", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#1a0808"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  Smazat
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Deck Modal */}
      {showCreateModal && (
        <div className="overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 16 }}>Nový balíček</div>
            <input className="inp" placeholder="Jméno balíčku (např. Angličtina A1)" value={newDeckName} onChange={e => setNewDeckName(e.target.value)} style={{ marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setShowCreateModal(false)} style={{ flex: 1, background: C.border, color: C.text, borderRadius: 8, padding: 10, cursor: "pointer" }}>Zrušit</button>
              <button className="btn" onClick={handleCreateDeck} disabled={!newDeckName.trim()} style={{ flex: 1, background: C.gold, color: C.bg, borderRadius: 8, padding: 10, cursor: "pointer", fontWeight: 600, opacity: newDeckName.trim() ? 1 : 0.5 }}>Vytvořit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
