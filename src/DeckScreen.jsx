import { useState, useRef, useEffect } from "react";
import { C, STYLE } from "./constants.js";
import { sortWords, dueCount, isMastered, normalizeText } from "./utils.js";
import { AddWordModal, StatsModal, ConfirmModal, RenameModal, EditWordModal } from "./modals.jsx";
import { usePersistentState, useIsMobile } from "./hooks.js";

/* ── Stat Info Popover ────────────────────────────────────────── */
const STAT_INFO = {
  "Úspěšnost": "Kolik procent tvých odpovědí bylo správných. Počítá se ze všech odpovědí v historii tohoto balíčku — čím vyšší, tím lépe!",
  "Naučeno": "Počet slov v krabičce 4 a výš — opakuješ je nejdříve za 14 dní, protože jsi je několikrát po sobě znal. Špatná odpověď vrací slovo do krabičky 1.",
  "Procvičeno": "Kolik slov jsi už alespoň jednou procvičoval (správně či špatně). Zbytek jsou slova, která jsi ještě neviděl.",
  "K opak.": "Slovíčka, která jsou dnes na řadě k opakování podle systému plánovaného opakování (včetně nových). Čím častěji opakování zvládneš, tím lépe si slovíčka zapamatuješ.",
  "Odpovědi": "Celkový počet všech odpovědí v tomto balíčku — správných i špatných dohromady. Ukazuje, jak intenzivně ses balíčkem zabýval.",
  "Kol": "Kolikrát jsi dokončil celé kolo studia v tomto balíčku. Každé dokončené kolo = jeden bod.",
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
        title="Co tato statistika znamená?"
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
function DeckSettingsDropdown({ onDelete, onExport, hideExport }) {
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
          {!hideExport && (
            <>
              <button className="btn" onClick={() => { onExport(); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.textDim, fontSize: 13, textAlign: "left", transition: "background .15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--lc-dropHover)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 16 }}>📥</span> Export do Excelu
              </button>
              <div style={{ borderTop: `1px solid ${C.border}` }} />
            </>
          )}
          <button className="btn" onClick={() => { onDelete(); setOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.err, fontSize: 13, textAlign: "left", transition: "background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--lc-errBg)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 16 }}>🗑️</span> Smazat balíček
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
  onUpdate, onAddWord, onDeleteWord, onEditWord,
  onDeleteDeck, onRename, onResetStats, onExport,
}) {
  const isMobile = useIsMobile();
  // Řazení slov si pamatujeme (globálně pro všechny balíčky, per zařízení)
  const [wSort, setWSort] = usePersistentState("lc6_wordSort", "date-asc", v => typeof v === "string");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDelDeck, setShowDelDeck] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [editWord, setEditWord] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const ds = deck.deckStats ?? { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 };
  const mastered = deck.words.filter(isMastered).length;
  const practiced = deck.words.filter(w => (w.wStats?.total ?? 0) > 0).length;
  const due = dueCount(deck.words);
  const sr = ds.totalAnswers ? Math.round(ds.correctAnswers / ds.totalAnswers * 100) : null;

  // Číslo řádku = pozice v seřazeném seznamu (při hledání zůstává stejné)
  const sorted = sortWords(deck.words, wSort).map((w, i) => ({ w, n: i + 1 }));
  const q = normalizeText(search);
  const visible = q
    ? sorted.filter(({ w }) => [w.en, w.cs, w.synonyms, w.example].some(f => normalizeText(f).includes(q)))
    : sorted;

  const toggleRow = id => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const statItems = [
    { lbl: "Úspěšnost", val: sr !== null ? `${sr}%` : "—", c: "#7090c8", bg: "var(--lc-statBg1)" },
    { lbl: "Naučeno", val: `${mastered}/${deck.words.length}`, c: C.ok, bg: C.okBg },
    { lbl: "Procvičeno", val: `${practiced}/${deck.words.length}`, c: "#a080c8", bg: "var(--lc-statBg2)" },
    { lbl: "K opak.", val: due, c: due > 0 ? "var(--lc-dueText)" : C.ok, bg: due > 0 ? "var(--lc-dueBg)" : C.okBg },
    { lbl: "Odpovědi", val: ds.totalAnswers || 0, c: C.gold, bg: "var(--lc-statBg5)" },
    { lbl: "Kol", val: ds.roundsCompleted || 0, c: "#7090c8", bg: "var(--lc-statBg1)" },
  ];

  const studyBtnFlex = isMobile ? 1 : "0 0 auto";

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora',Georgia,serif", color: C.text, display: "flex", flexDirection: "column", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>

      {showAdd && <AddWordModal onClose={() => setShowAdd(false)} onAdd={onAddWord} />}
      {showStats && <StatsModal deck={deck} onClose={() => setShowStats(false)} onReset={() => { onResetStats(); setShowStats(false); }} />}
      {showDelDeck && <ConfirmModal title="Smazat balíček?" msg={`Opravdu smazat balíček "${deck.name}"?`} onConfirm={onDeleteDeck} onClose={() => setShowDelDeck(false)} />}
      {showRename && <RenameModal currentName={deck.name} onClose={() => setShowRename(false)} onRename={n => { onRename(n); setShowRename(false); }} />}
      {editWord && (
        <EditWordModal
          word={editWord}
          onClose={() => setEditWord(null)}
          onSave={data => { onEditWord(editWord.id, data); setEditWord(null); }}
          onDelete={() => { onDeleteWord(editWord.id); setEditWord(null); }}
        />
      )}

      {/* Hlavička — na mobilu se odscrolluje (víc místa pro slovíčka), na desktopu zůstává nahoře */}
      <div style={{ position: isMobile ? "static" : "sticky", top: 0, zIndex: 10, background: "var(--lc-headerBg)", borderBottom: `1px solid var(--lc-headerBorder)`, padding: "0.8rem 1rem" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", display: "flex", flexDirection: "column", gap: 7 }}>

          {/* Řádek 1: Zpět + nastavení */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn" onClick={onBack} style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>← Balíčky</button>
            <div style={{ flex: 1 }} />
            <DeckSettingsDropdown onDelete={() => setShowDelDeck(true)} onExport={onExport} hideExport={!!deck.fromLibrary} />
          </div>

          {/* Řádek 2: celý název balíčku (zalamuje se, nezkracuje) */}
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, lineHeight: 1.25, overflowWrap: "anywhere" }}>
            {deck.name}
            {!deck.fromLibrary && (
              <button className="btn" onClick={() => setShowRename(true)} style={{ color: C.muted, fontSize: 14, marginLeft: 8, opacity: .7, verticalAlign: "middle" }} title="Přejmenovat">✏️</button>
            )}
          </div>

          {/* Řádek 3: štítek knihovny */}
          {deck.fromLibrary && (
            <div>
              <span title="Staženo z knihovny" style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#7090c8", background: "var(--lc-statBg1)", border: "1px solid #2e4065", borderRadius: 20, padding: "2px 9px", letterSpacing: .3, whiteSpace: "nowrap" }}>
                📚 Knihovna
              </span>
            </div>
          )}

          {/* Řádek 4: Pokračovat / Učení */}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {hasSavedSession && (
              <button className="btn" onClick={onResume}
                style={{ flex: studyBtnFlex, background: "var(--lc-selBg)", border: `1px solid var(--lc-selBorder)`, color: "#7090c8", borderRadius: 9, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                ↩ Pokračovat
              </button>
            )}
            <button className="btn" onClick={onStart} disabled={!deck.words.length}
              style={{ flex: studyBtnFlex, background: deck.words.length ? C.gold : "var(--lc-mutedDark)", color: deck.words.length ? C.bg : C.muted, borderRadius: 9, padding: "9px 20px", fontSize: 14, fontWeight: 700, cursor: deck.words.length ? "pointer" : "default" }}>
              Učení ▶
            </button>
          </div>

          {/* Statistiky */}
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

      {/* Řazení + statistiky + přidat slovo */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.7rem 1rem 0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, flexShrink: 0 }}>Řadit:</span>
        <select value={wSort} onChange={e => setWSort(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 8, padding: "5px 10px", fontSize: isMobile ? 16 : 12, fontFamily: "'Lora',serif", cursor: "pointer", outline: "none" }}>
          {[
            { id: "date-asc",  label: "Pořadí" },
            { id: "en-asc",    label: `${langCfg?.studyCode || "EN"} ↑` },
            { id: "en-desc",   label: `${langCfg?.studyCode || "EN"} ↓` },
            { id: "cs-asc",    label: `${langCfg?.nativeCode || "CS"} ↑` },
            { id: "cs-desc",   label: `${langCfg?.nativeCode || "CS"} ↓` },
            { id: "date-desc", label: "Datum ↓" },
          ].map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        <button className="btn" onClick={() => setShowStats(true)}
          style={{ border: `1px solid var(--lc-statBg1)`, color: "#7090c8", borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
          📊 Stat.
        </button>

        {!deck.fromLibrary && (
          <button className="btn" onClick={() => setShowAdd(true)}
            style={{
              border: `1px solid var(--lc-selBorder)`, background: "var(--lc-selBg)", color: C.gold,
              borderRadius: 8, padding: "5px 13px", fontSize: 12, cursor: "pointer", flexShrink: 0,
              fontWeight: 600, whiteSpace: "nowrap", transition: "all .2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.gold; e.currentTarget.style.color = C.bg; e.currentTarget.style.borderColor = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--lc-selBg)"; e.currentTarget.style.color = C.gold; e.currentTarget.style.borderColor = "var(--lc-selBorder)"; }}>
            + Slovo
          </button>
        )}
      </div>

      {/* Hledání */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.6rem 1rem 0", position: "relative" }}>
        <input
          className="inp-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Hledat slovíčko…"
          style={{ fontSize: isMobile ? 16 : 13, paddingRight: 34 }}
        />
        {search && (
          <button className="btn" onClick={() => setSearch("")} title="Vymazat hledání"
            style={{ position: "absolute", right: "1.5rem", top: "50%", transform: "translateY(-30%)", color: C.muted, fontSize: 14, padding: "2px 6px" }}>✕</button>
        )}
      </div>

      {/* Seznam slov */}
      <div style={{ maxWidth: 1020, margin: "0 auto", width: "100%", padding: "0.8rem 1rem 2rem", display: "flex", flexDirection: "column", gap: isMobile ? 6 : 4 }}>
        {!isMobile && (
          <div className="word-hdr" style={{ padding: "0 8px 4px", color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 2 }}>
            <span style={{ textAlign: "center" }}>#</span>
            <span>{langCfg?.studyCode || "EN"}</span>
            <span>{langCfg?.nativeCode || "CS"}</span>
            <span className="col-ex">Příkladová věta</span>
            <span className="col-syn">Synonyma</span>
            <span />
          </div>
        )}

        {q && visible.length === 0 && (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13, fontStyle: "italic", padding: "1.5rem 0" }}>Nic nenalezeno pro „{search}“</div>
        )}

        {visible.map(({ w, n }) => isMobile ? (
          /* ── MOBIL: jen text, klik kamkoli = rozbalit/zabalit, ✏️ otevře úpravu ── */
          <div key={w.id} style={{ background: C.card, border: `1px solid ${expandedRows[w.id] ? "var(--lc-selBorder)" : C.border}`, borderRadius: 8, overflow: "hidden", transition: "border-color .2s" }}>
            <div onClick={() => toggleRow(w.id)}
              style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr", gap: 8, alignItems: "center", padding: "10px 12px 8px 6px", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontSize: 10, color: expandedRows[w.id] ? C.gold : C.muted, textAlign: "center" }}>{n}</span>
              <span style={{ fontSize: 17, fontWeight: 600, color: C.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>{w.en}</span>
              <span style={{ fontSize: 15, color: C.textDim, lineHeight: 1.3, overflowWrap: "anywhere" }}>{w.cs}</span>
            </div>

            {expandedRows[w.id] && (
              <div onClick={() => toggleRow(w.id)} style={{ padding: "0 12px 8px 34px", fontSize: 14, color: C.textDim, lineHeight: 1.45, cursor: "pointer", overflowWrap: "anywhere" }}>
                {w.synonyms?.trim()
                  ? <><span style={{ fontSize: 9, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 1.5, display: "block", marginBottom: 2 }}>Synonyma</span>{w.synonyms}</>
                  : <span style={{ fontStyle: "italic", color: C.muted, fontSize: 12 }}>Bez synonym</span>}
              </div>
            )}

            <div onClick={() => toggleRow(w.id)}
              style={{ borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", minHeight: 26, padding: "0 2px 0 34px", fontSize: 10, color: C.mutedDark, cursor: "pointer" }}>
              {!expandedRows[w.id] && w.synonyms?.trim() && <span>🔤 synonyma</span>}
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={e => { e.stopPropagation(); setEditWord(w); }} title="Upravit slovíčko" aria-label="Upravit slovíčko"
                style={{ fontSize: 12, padding: "4px 12px", opacity: .65, lineHeight: 1 }}>✏️</button>
            </div>
          </div>
        ) : (
          /* ── DESKTOP: úpravy přímo v řádku (beze změny), ✕ smaže ── */
          <div key={w.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div className="word-row" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.muted, textAlign: "center", userSelect: "none", lineHeight: 1 }}>{n}</span>
              <input className="tdinp" value={w.en} placeholder="anglicky…" onChange={e => onUpdate(w.id, "en", e.target.value)} />
              <input className="tdinp" value={w.cs} placeholder="česky…" onChange={e => onUpdate(w.id, "cs", e.target.value)} />
              <input className="tdinp col-ex" value={w.example || ""} placeholder="příkladová věta…" onChange={e => onUpdate(w.id, "example", e.target.value)} />
              <input className="tdinp col-syn" value={w.synonyms || ""} placeholder="synonyma…" onChange={e => onUpdate(w.id, "synonyms", e.target.value)} />
              <button className="btn" onClick={() => onDeleteWord(w.id)} title="Smazat slovíčko"
                style={{
                  background: "var(--lc-wordDelBg)", color: "var(--lc-wordDelColor)", fontSize: 15, fontWeight: "bold",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 14px 0 6px", height: "100%", borderRadius: "0 8px 8px 0",
                  minWidth: 36, cursor: "pointer", flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--lc-wordDelHover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--lc-wordDelBg)"; }}>✕</button>
            </div>
          </div>
        ))}

        {!deck.fromLibrary && !q && (
          <button className="btn" onClick={() => setShowAdd(true)}
            style={{ border: `1.5px dashed ${C.border}`, borderRadius: 8, padding: "9px", color: C.muted, fontSize: 13, cursor: "pointer", textAlign: "center" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
            + Přidat slovíčko
          </button>
        )}
      </div>
    </div>
  );
}
