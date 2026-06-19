import { useState, useRef, useEffect } from "react";
import { C, STYLE } from "./constants.js";
import { sortWords, dueCount } from "./utils.js";
import { AddWordModal, StatsModal, ConfirmModal, RenameModal } from "./modals.jsx";

/* ── Stat Info Popover ────────────────────────────────────────── */
const STAT_INFO = {
  "Uspesnost": "Kolik procent tvych odpovedi bylo spravnych. Pocita se ze vsech odpovedi v historii tohoto balicku — cim vyssi, tim lepe!",
  "Nauceno": "Pocet slov, ktera jsi skutecne zvladl — odpovidal jsi na ne spravne vicekrat za sebou a dosahla stoupajiciho skore. Cil je mit toto cislo co nejvyssi.",
  "Procviceno": "Kolik slov jsi jiz alespon jednou procvicoval (spravne ci spatne). Slov ktera jsi jeste nikdy nevidel ukazuje zbyvajici cast.",
  "K opak.": "Slovicka, ktera jsou dnes 'splatna' k opakovani podle systemu planovaneho opakovani. Cim castejis opakovani zvladnes, tim lepe si slovicka zapamatujes.",
  "Odpovedi": "Celkovy pocet vsech odpovedi v tomto balicku — spravnych i spatnych dohromady. Ukazuje, jak intenzivne jsi se balickem zabival.",
  "Kol": "Kolikrat jsi dokoncil cely pruchod balickem (kolo studia). Kazde dokoncene kolo = jeden bod zde.",
};

function StatInfoButton({ label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const text = STAT_INFO[label];
  if (!text) return null;

  return (
    <div ref={ref} style={{ position: "absolute", top: 4, right: 4, zIndex: 5 }}>
      <button
        className="btn"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: open ? "var(--lc-selBg)" : "var(--lc-cardAlt)",
          border: `1px solid ${open ? "var(--lc-selBorder)" : "var(--lc-border)"}`,
          color: open ? C.gold : C.mutedDark,
          fontSize: 9, fontWeight: 700, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all .15s", padding: 0,
          fontFamily: "system-ui, sans-serif",
        }}
        title="Co tato statistika znamena?"
      >
        i
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "var(--lc-dropBg)", border: `1px solid var(--lc-modalBorder)`,
          borderRadius: 10, padding: "10px 12px", width: 200,
          boxShadow: `0 6px 20px var(--lc-shadow)`, zIndex: 100,
          animation: "fadeUp .15s ease both",
        }}>
          <div style={{ fontSize: 11, color: "var(--lc-textDim)", lineHeight: 1.55, fontFamily: "'Lora',serif" }}>
            {text}
          </div>
          <div style={{
            position: "absolute", top: -5, right: 6,
            width: 8, height: 8, background: "var(--lc-dropBg)",
            border: `1px solid var(--lc-modalBorder)`,
            borderBottom: "none", borderRight: "none",
            transform: "rotate(45deg)",
          }} />
        </div>
      )}
    </div>
  );
}

/* ── Deck Settings Dropdown ───────────────────────────────────── */
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
        style={{ background: open ? "var(--lc-selBg)" : "transparent", border: `1px solid ${open ? "var(--lc-selBorder)" : C.border}`, color: open ? C.gold : C.muted, borderRadius: 8, padding: "5px 10px", fontSize: 16, cursor: "pointer", lineHeight: 1, transition: "all .2s" }}>
        ⚙️
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--lc-dropBg)", border: `1px solid var(--lc-modalBorder)`, borderRadius: 12, overflow: "hidden", minWidth: 200, zIndex: 50, boxShadow: `0 8px 28px var(--lc-shadow)` }}>
          <button className="btn" onClick={() => { onExport(); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.textDim, fontSize: 13, textAlign: "left", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--lc-dropHover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 16 }}>📥</span> Export do Excelu
          </button>
          <div style={{ borderTop: `1px solid ${C.border}` }} />
          <button className="btn" onClick={() => { onDelete(); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.err, fontSize: 13, textAlign: "left", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--lc-errBg)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 16 }}>🗑️</span> Smazat balicek
          </button>
        </div>
      )}
    </div>
  );
}

/* ── DeckScreen ───────────────────────────────────────────────── */
export default function DeckScreen({
  deck, langCfg, hasSavedSession,
  onBack, onStart, onResume,
  onUpdate, onAddWord, onDeleteWord,
  onDeleteDeck, onRename, onResetStats, onExport,
  lightMode, onToggleLight
}) {
  const [wSort, setWSort] = useState("date-asc");
  const [showAdd, setShowAdd] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDelDeck, setShowDelDeck] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});

  const ds = deck.deckStats ?? { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 };
  const mastered = deck.words.filter(w => (w.score ?? 0) >= 3).length;
  const practiced = deck.words.filter(w => (w.wStats?.total ?? 0) > 0).length;
  const due = dueCount(deck.words);
  const sr = ds.totalAnswers ? Math.round(ds.correctAnswers / ds.totalAnswers * 100) : null;
  const sorted = sortWords(deck.words, wSort);

  const statItems = [
    { lbl: "Uspesnost", val: sr !== null ? `${sr}%` : "—", c: "#7090c8", bg: "var(--lc-statBg1)" },
    { lbl: "Nauceno", val: `${mastered}/${deck.words.length}`, c: C.ok, bg: C.okBg },
    { lbl: "Procviceno", val: `${practiced}/${deck.words.length}`, c: "#a080c8", bg: "var(--lc-statBg2)" },
    { lbl: "K opak.", val: due, c: due > 0 ? "var(--lc-dueText)" : C.ok, bg: due > 0 ? "var(--lc-dueBg)" : C.okBg },
    { lbl: "Odpovedi", val: ds.totalAnswers || 0, c: C.gold, bg: "var(--lc-statBg5)" },
    { lbl: "Kol", val: ds.roundsCompleted || 0, c: "#7090c8", bg: "var(--lc-statBg1)" },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora',Georgia,serif", color: C.text, display: "flex", flexDirection: "column", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>

      {showAdd && <AddWordModal onClose={() => setShowAdd(false)} onAdd={onAddWord} />}
      {showStats && <StatsModal deck={deck} onClose={() => setShowStats(false)} onReset={() => { onResetStats(); setShowStats(false); }} />}
      {showDelDeck && <ConfirmModal title="Smazat balicek?" msg={`Opravdu smazat balicek "${deck.name}"?`} onConfirm={onDeleteDeck} onClose={() => setShowDelDeck(false)} />}
      {showRename && <RenameModal currentName={deck.name} onClose={() => setShowRename(false)} onRename={n => { onRename(n); setShowRename(false); }} />}

      {/* sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--lc-headerBg)", borderBottom: `1px solid var(--lc-headerBorder)`, padding: "0.8rem 1rem" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", display: "flex", flexDirection: "column", gap: 7 }}>

          {/* Row 1: Back + Settings */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn" onClick={onBack} style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>← Balicky</button>
            <div style={{ flex: 1 }} />
            <DeckSettingsDropdown onDelete={() => setShowDelDeck(true)} onExport={onExport} />
          </div>

          {/* Row 2: Deck name + study buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name}</div>
              {deck.fromLibrary && (
                <span title="Stazeno z knihovny" style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "#7090c8", background: "var(--lc-statBg1)", border: "1px solid #2e4065", borderRadius: 20, padding: "2px 9px", letterSpacing: .3, whiteSpace: "nowrap" }}>
                  📚 Knihovna
                </span>
              )}
              <button className="btn" onClick={() => setShowRename(true)} style={{ color: C.muted, fontSize: 14, flexShrink: 0, opacity: .7 }} title="Prejmenovat">✏️</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {hasSavedSession && (
                <button className="btn" onClick={onResume}
                  style={{ background: "var(--lc-selBg)", border: `1px solid var(--lc-selBorder)`, color: "#7090c8", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  ↩ Pokracovat
                </button>
              )}
              <button className="btn" onClick={onStart} disabled={!deck.words.length}
                style={{ background: deck.words.length ? C.gold : "var(--lc-mutedDark)", color: deck.words.length ? C.bg : C.muted, borderRadius: 9, padding: "8px 20px", fontSize: 14, fontWeight: 700, cursor: deck.words.length ? "pointer" : "default" }}>
                Uceni ▶
              </button>
            </div>
          </div>

          {/* Row 3: Stats */}
          <div className="stat-grid">
            {statItems.map(({ lbl, val, c, bg }) => (
              <div key={lbl} style={{ background: bg, borderRadius: 7, padding: "5px 6px", textAlign: "center", position: "relative" }}>
                <StatInfoButton label={lbl} />
                <div style={{ fontSize: 9, color: c, textTransform: "uppercase", letterSpacing: .6, marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: c }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sort row + Stat + Add word buttons */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.7rem 1rem 0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, flexShrink: 0 }}>Radit:</span>
        <select value={wSort} onChange={e => setWSort(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontFamily: "'Lora',serif", cursor: "pointer", outline: "none" }}>
          {[
            { id: "date-asc",  label: "Poradi" },
            { id: "en-asc",    label: `${langCfg?.studyCode || "EN"} ↑` },
            { id: "en-desc",   label: `${langCfg?.studyCode || "EN"} ↓` },
            { id: "cs-asc",    label: `${langCfg?.nativeCode || "CS"} ↑` },
            { id: "cs-desc",   label: `${langCfg?.nativeCode || "CS"} ↓` },
            { id: "date-desc", label: "Datum ↓" },
          ].map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Statistiky */}
        <button className="btn" onClick={() => setShowStats(true)}
          style={{ border: `1px solid var(--lc-statBg1)`, color: "#7090c8", borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          📊 Stat.
        </button>

        {/* + Slovo — vyraznejsi (skryto u balicku stazenych z knihovny) */}
        {!deck.fromLibrary && (
          <button className="btn" onClick={() => setShowAdd(true)}
            style={{
              border: `1px solid var(--lc-selBorder)`,
              background: "var(--lc-selBg)",
              color: C.gold,
              borderRadius: 8, padding: "5px 13px", fontSize: 12,
              cursor: "pointer", flexShrink: 0, fontWeight: 600,
              whiteSpace: "nowrap",
              transition: "all .2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.gold; e.currentTarget.style.color = C.bg; e.currentTarget.style.borderColor = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--lc-selBg)"; e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = "var(--lc-selBorder)"; }}>
            + Slovo
          </button>
        )}
      </div>

      {/* Word list */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.8rem 1rem 2rem", display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Hlavicka — skryta na mobilu */}
        <div className="word-hdr" style={{ padding: "0 8px 4px", color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 2 }}>
          <span style={{ textAlign: "center" }}>#</span>
          <span>{langCfg?.studyCode || "EN"}</span>
          <span>{langCfg?.nativeCode || "CS"}</span>
          <span className="col-ex">Prikladova veta</span>
          <span className="col-syn">Synonyma</span>
          <span />
        </div>

        {sorted.map((w, i) => {
          const isExpanded = expandedRows[w.id] || false;
          const hasExtra = (w.example && w.example.trim()) || (w.synonyms && w.synonyms.trim());
          return (
            <div key={w.id} style={{ background: C.card, border: `1px solid ${isExpanded ? "var(--lc-selBorder)" : C.border}`, borderRadius: 8, transition: "border-color .2s", overflow: "hidden" }}>
              {/* Hlavni radek — desktop i mobil */}
              <div className="word-row" style={{ alignItems: "center" }}>
                {/* Cislo / expand toggle na mobilu */}
                <span
                  className="mob-expand-btn"
                  onClick={() => setExpandedRows(prev => ({ ...prev, [w.id]: !isExpanded }))}
                  style={{ fontSize: 10, color: isExpanded ? C.gold : C.muted, textAlign: "center", cursor: "pointer", userSelect: "none", lineHeight: 1 }}
                  title={isExpanded ? "Skrit detaily" : "Zobrazit detaily"}
                >
                  {i + 1}
                </span>
                <input className="tdinp" value={w.en} placeholder="anglicky…" onChange={e => onUpdate(w.id, "en", e.target.value)} />
                <input className="tdinp" value={w.cs} placeholder="cesky…" onChange={e => onUpdate(w.id, "cs", e.target.value)} />
                <input className="tdinp col-ex" value={w.example || ""} placeholder="prikladova veta…" onChange={e => onUpdate(w.id, "example", e.target.value)} />
                <input className="tdinp col-syn" value={w.synonyms || ""} placeholder="synonyma…" onChange={e => onUpdate(w.id, "synonyms", e.target.value)} />
                <button className="btn" onClick={() => onDeleteWord(w.id)}
                  style={{
                    background: "var(--lc-wordDelBg)", color: "var(--lc-wordDelColor)", fontSize: 15, fontWeight: "bold",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 12px", height: "100%", borderRadius: "0 8px 8px 0",
                    minWidth: 36, cursor: "pointer", flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--lc-wordDelHover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--lc-wordDelBg)"; }}>✕</button>
              </div>

              {/* Expand panel — pouze na mobilu (640px a mene) */}
              {isExpanded && (
                <div className="mob-expand-panel" style={{ borderTop: `1px solid ${C.border}`, padding: "10px 10px 10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 3 }}>Prikladova veta</div>
                    <input
                      className="tdinp"
                      value={w.example || ""}
                      placeholder="Napiste prikladovou vetu…"
                      onChange={e => onUpdate(w.id, "example", e.target.value)}
                      style={{ width: "100%", background: "var(--lc-cardAlt)", borderRadius: 6, padding: "7px 10px" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 3 }}>Synonyma</div>
                    <input
                      className="tdinp"
                      value={w.synonyms || ""}
                      placeholder="Napiste synonyma…"
                      onChange={e => onUpdate(w.id, "synonyms", e.target.value)}
                      style={{ width: "100%", background: "var(--lc-cardAlt)", borderRadius: 6, padding: "7px 10px" }}
                    />
                  </div>
                </div>
              )}

              {/* Indikator ze existuji data — pouze na mobilu, kdyz neni expand */}
              {!isExpanded && hasExtra && (
                <div
                  className="mob-has-extra"
                  onClick={() => setExpandedRows(prev => ({ ...prev, [w.id]: true }))}
                  style={{ borderTop: `1px solid ${C.border}`, padding: "3px 12px", fontSize: 10, color: C.mutedDark, cursor: "pointer", display: "flex", gap: 8 }}
                >
                  {w.example?.trim() && <span>📝 veta</span>}
                  {w.synonyms?.trim() && <span>🔤 synonyma</span>}
                </div>
              )}
            </div>
          );
        })}

        {!deck.fromLibrary && (
          <button className="btn" onClick={() => setShowAdd(true)}
            style={{ border: `1.5px dashed ${C.border}`, borderRadius: 8, padding: "9px", color: C.muted, fontSize: 13, cursor: "pointer", textAlign: "center" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
            + Pridat slovicko
          </button>
        )}
      </div>
    </div>
  );
}
