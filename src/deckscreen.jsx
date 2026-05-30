import { useState, useRef, useEffect } from "react";
import { C, STYLE } from "./constants.js";
import { sortWords, dueCount } from "./utils.js";
import { AddWordModal, StatsModal, ConfirmModal, RenameModal } from "./modals.jsx";

/* ─── Deck Settings Dropdown ─────────────────────────────────── */
function DeckSettingsDropdown({ onDelete, onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button className="btn" onClick={() => setOpen(o => !o)}
        style={{ background: open ? "#1e2a45" : "transparent", border: `1px solid ${open ? "#3a5080" : C.border}`, color: open ? C.gold : C.muted, borderRadius: 8, padding: "5px 10px", fontSize: 16, cursor: "pointer", lineHeight: 1, transition: "all .2s" }}>
        ⚙️
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#111e30", border: `1px solid #2a3650`, borderRadius: 12, overflow: "hidden", minWidth: 180, zIndex: 50, boxShadow: "0 8px 28px rgba(0,0,0,.6)" }}>
          <button className="btn" onClick={() => { onExport(); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.textDim, fontSize: 13, textAlign: "left", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#161e30"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 16 }}>📥</span> Export do Excelu
          </button>
          <div style={{ borderTop: `1px solid ${C.border}` }} />
          <button className="btn" onClick={() => { onDelete(); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.err, fontSize: 13, textAlign: "left", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "#1a0a0a"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 16 }}>🗑️</span> Smazat balíček
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── DeckScreen ─────────────────────────────────────────────── */
export default function DeckScreen({
  deck, langCfg, hasSavedSession,
  onBack, onStart, onResume,
  onUpdate, onAddWord, onDeleteWord,
  onDeleteDeck, onRename, onResetStats, onExport
}) {
  const [wSort, setWSort] = useState("date-asc");
  const [showAdd, setShowAdd] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDelDeck, setShowDelDeck] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const ds = deck.deckStats ?? { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 };
  const mastered = deck.words.filter(w => (w.score ?? 0) >= 3).length;
  const practiced = deck.words.filter(w => (w.wStats?.total ?? 0) > 0).length;
  const due = dueCount(deck.words);
  const sr = ds.totalAnswers ? Math.round(ds.correctAnswers / ds.totalAnswers * 100) : null;
  const sorted = sortWords(deck.words, wSort);

  const statItems = [
    { lbl: "Úspěšnost", val: sr !== null ? `${sr}%` : "—", c: "#7090c8", bg: "#121a2e" },
    { lbl: "Naučeno", val: `${mastered}/${deck.words.length}`, c: C.ok, bg: C.okBg },
    { lbl: "Procvičeno", val: `${practiced}/${deck.words.length}`, c: "#a080c8", bg: "#1a1028" },
    { lbl: "K opak.", val: due, c: due > 0 ? "#d08050" : "#5a7060", bg: due > 0 ? "#1a1008" : "#0a1410" },
    { lbl: "Odpovědí", val: ds.totalAnswers || 0, c: C.gold, bg: "#1a1608" },
    { lbl: "Kol", val: ds.roundsCompleted || 0, c: "#7090c8", bg: "#121a2e" },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora',Georgia,serif", color: C.text, display: "flex", flexDirection: "column", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>

      {showAdd && <AddWordModal onClose={() => setShowAdd(false)} onAdd={onAddWord} />}
      {showStats && <StatsModal deck={deck} onClose={() => setShowStats(false)} onReset={() => { onResetStats(); setShowStats(false); }} />}
      {showDelDeck && <ConfirmModal title="Smazat balíček?" msg={`Opravdu smazat „${deck.name}"?`} onConfirm={onDeleteDeck} onClose={() => setShowDelDeck(false)} />}
      {showRename && <RenameModal currentName={deck.name} onClose={() => setShowRename(false)} onRename={n => { onRename(n); setShowRename(false); }} />}

      {/* sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: C.bg, borderBottom: `1px solid #1a1f2e`, padding: "0.8rem 1rem" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", display: "flex", flexDirection: "column", gap: 7 }}>

          {/* Row 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn" onClick={onBack} style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>← Balíčky</button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={() => setShowStats(true)} style={{ border: `1px solid #2a3555`, color: "#7090c8", borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>📊 Stat.</button>
            <button className="btn" onClick={() => setShowAdd(true)} style={{ border: `1px solid #2e4060`, color: "#7090b8", borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>+ Slovo</button>
            <DeckSettingsDropdown onDelete={() => setShowDelDeck(true)} onExport={onExport} />
          </div>

          {/* Row 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</div>
              <button className="btn" onClick={() => setShowRename(true)} style={{ color: C.muted, fontSize: 14, flexShrink: 0, opacity: .7 }} title="Přejmenovat">✏️</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {hasSavedSession && (
                <button className="btn" onClick={onResume}
                  style={{ background: "#1a2535", border: `1px solid #3a5080`, color: "#7090c8", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  ↩ Pokračovat
                </button>
              )}
              <button className="btn" onClick={onStart} disabled={!deck.words.length}
                style={{ background: deck.words.length ? C.gold : "#2a2a1a", color: deck.words.length ? C.bg : "#5a5030", borderRadius: 9, padding: "8px 20px", fontSize: 14, fontWeight: 700, cursor: deck.words.length ? "pointer" : "default" }}>
                Učení ▶
              </button>
            </div>
          </div>

          {/* Row 3: stats */}
          <div className="stat-grid">
            {statItems.map(({ lbl, val, c, bg }) => (
              <div key={lbl} style={{ background: bg, borderRadius: 7, padding: "5px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: c, textTransform: "uppercase", letterSpacing: .6, marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: c }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sort dropdown */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.7rem 1rem 0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, flexShrink: 0 }}>Řadit:</span>
        <select value={wSort} onChange={e => setWSort(e.target.value)}
          style={{ background: "#111622", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontFamily: "'Lora',serif", cursor: "pointer", outline: "none" }}>
          {[
            { id: "date-asc",  label: "Pořadí" },
            { id: "en-asc",    label: `${langCfg?.studyCode || "EN"} ↑` },
            { id: "en-desc",   label: `${langCfg?.studyCode || "EN"} ↓` },
            { id: "cs-asc",    label: `${langCfg?.nativeCode || "CS"} ↑` },
            { id: "cs-desc",   label: `${langCfg?.nativeCode || "CS"} ↓` },
            { id: "date-desc", label: "Datum ↓" },
          ].map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Word list */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.8rem 1rem 2rem", display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="word-hdr" style={{ padding: "0 8px 4px", color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 2 }}>
          <span style={{ textAlign: "center" }}>#</span>
          <span>{langCfg?.studyCode || "EN"}</span>
          <span>{langCfg?.nativeCode || "CS"}</span>
          <span className="col-ex">Příkladová věta</span>
          <span className="col-syn">Synonyma</span>
          <span />
        </div>
        {sorted.map((w, i) => (
          <div key={w.id} className="word-row" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.muted, textAlign: "center" }}>{i + 1}</span>
            <input className="tdinp" value={w.en} placeholder="anglicky…" onChange={e => onUpdate(w.id, "en", e.target.value)} />
            <input className="tdinp" value={w.cs} placeholder="česky…" onChange={e => onUpdate(w.id, "cs", e.target.value)} />
            <input className="tdinp col-ex" value={w.example || ""} placeholder="příkladová věta…" onChange={e => onUpdate(w.id, "example", e.target.value)} />
            <input className="tdinp col-syn" value={w.synonyms || ""} placeholder="synonyma…" onChange={e => onUpdate(w.id, "synonyms", e.target.value)} />
            <button className="btn" onClick={() => onDeleteWord(w.id)}
              style={{ color: "#3a2020", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", height: "100%", borderRadius: "0 8px 8px 0" }}
              onMouseEnter={e => e.currentTarget.style.color = "#c87070"}
              onMouseLeave={e => e.currentTarget.style.color = "#3a2020"}>×</button>
          </div>
        ))}
        <button className="btn" onClick={() => setShowAdd(true)}
          style={{ border: `1.5px dashed #2e3447`, borderRadius: 8, padding: "9px", color: C.muted, fontSize: 13, cursor: "pointer", textAlign: "center" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2e3447"; e.currentTarget.style.color = C.muted; }}>
          + Přidat slovíčko
        </button>
      </div>
    </div>
  );
}
