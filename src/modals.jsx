import { useState, useEffect, useRef } from "react";
import { C, STAT_COLS } from "./constants.js";
import { sortStats, parseSyn, vmGetBox, uid } from "./utils.js";

/* ─── Base Modal ─────────────────────────────────────────────── */
export function Modal({ onClose, children, wide = false }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " modal-wide" : ""}`}>{children}</div>
    </div>
  );
}

/* ─── Confirm Modal ──────────────────────────────────────────── */
export function ConfirmModal({ title, msg, label = "Smazat", onConfirm, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: "11px", fontSize: 14, cursor: "pointer" }}>Zrušit</button>
          <button className="btn" onClick={() => { onConfirm(); onClose(); }} style={{ flex: 1, background: C.err, color: "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{label}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── iOS-style Toggle ───────────────────────────────────────── */
export function IOSToggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 13, flexShrink: 0, background: value ? "#5cb88a" : "#3e4455", position: "relative", cursor: "pointer", transition: "background .25s" }}>
      <div style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left .25s", boxShadow: "0 1px 4px rgba(0,0,0,.4)" }} />
    </div>
  );
}

/* ─── Settings Dropdown ──────────────────────────────────────── */
export function SettingsDropdown({ autoPlay, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button className="btn" onClick={() => setOpen(o => !o)} style={{ background: open ? "#1e2a45" : "#1a1f2e", border: `1px solid ${open ? "#3a5080" : "#2e3447"}`, color: open ? C.gold : C.muted, borderRadius: 8, padding: "5px 10px", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>⚙️</button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#111e30", border: `1px solid #2a3650`, borderRadius: 14, padding: "4px 0", minWidth: 240, zIndex: 50, boxShadow: "0 8px 32px rgba(0,0,0,.6)", overflow: "hidden" }}>
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>Nastavení</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 17, width: 22, textAlign: "center" }}>{autoPlay ? "🔊" : "🔇"}</span>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontFamily: "'Lora',serif" }}>Automatické přehrávání</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Přehrát slovo při zobrazení</div>
              </div>
            </div>
            <IOSToggle value={autoPlay} onChange={onToggle} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Lang Modal (add + edit) ────────────────────────────────── */
export function LangModal({ initial, onClose, onSave, title }) {
  const [f, setF] = useState(initial ?? { label: "", flag: "🌐", code: "", nativeCode: "CZ", studyCode: "" });
  const upd = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const valid = f.label.trim() && f.nativeCode.trim() && f.studyCode.trim();
  return (
    <Modal onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted }}>Nastavení jazykové větve</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Název jazyka *</div>
          <input className="inp-sm" value={f.label} onChange={upd("label")} placeholder="např. Španělština" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Vlajka (emoji)</div>
            <input className="inp-sm" value={f.flag} onChange={upd("flag")} placeholder="🇪🇸" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Kód (3–4 znaky)</div>
            <input className="inp-sm" value={f.code} onChange={upd("code")} placeholder="ESP" maxLength={4} />
          </div>
        </div>
        <div style={{ background: "#0e1520", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: C.mutedDark, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Zkratky pro řazení</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Rozumím (výchozí) *</div>
              <input className="inp-sm" value={f.nativeCode} onChange={upd("nativeCode")} placeholder="CZ" maxLength={4} />
              <div style={{ fontSize: 10, color: C.mutedDark, marginTop: 3 }}>Jazyk ze kterého překládám</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Chci se naučit *</div>
              <input className="inp-sm" value={f.studyCode} onChange={upd("studyCode")} placeholder="ESP" maxLength={4} />
              <div style={{ fontSize: 10, color: C.mutedDark, marginTop: 3 }}>Jazyk který se učím</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: "10px", fontSize: 14, cursor: "pointer" }}>Zrušit</button>
          <button className="btn" onClick={() => { if (valid) onSave({ ...f, label: f.label.trim(), code: (f.code || f.studyCode).toUpperCase().slice(0, 4), nativeCode: f.nativeCode.toUpperCase().trim(), studyCode: f.studyCode.toUpperCase().trim() }); }}
            style={{ flex: 2, background: valid ? C.gold : "#1a2030", color: valid ? C.bg : "#4a5060", border: "none", borderRadius: 9, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>
            Uložit
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Lang Dropdown ──────────────────────────────────────────── */
export function LangDropdown({ langs, activeId, onSwitch, onAddLang, onEditLang, onDeleteLang }) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editLang, setEditLang] = useState(null);
  const [showDel, setShowDel] = useState(null);
  const ref = useRef(null);
  const active = langs.find(l => l.id === activeId) || langs[0];
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <>
      <div ref={ref} style={{ position: "relative", userSelect: "none" }}>
        <button className="btn" onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: "#111e30", border: `1.5px solid ${open ? "#3a5080" : C.border}`, borderRadius: 10, padding: "8px 12px", cursor: "pointer", minWidth: 130 }}>
          <span style={{ fontSize: 20 }}>{active?.flag}</span>
          <span style={{ fontWeight: 700, fontSize: 12, color: C.gold }}>{active?.code || active?.studyCode}</span>
          <span style={{ fontSize: 12, color: C.muted, flex: 1, textAlign: "left" }}>{active?.label}</span>
          <span style={{ fontSize: 10, color: C.muted }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#111e30", border: `1px solid #2a3650`, borderRadius: 12, overflow: "hidden", minWidth: 230, zIndex: 50, boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
            {langs.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", background: l.id === activeId ? "#1a2a45" : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = l.id === activeId ? "#1a2a45" : "#161e30"}
                onMouseLeave={e => e.currentTarget.style.background = l.id === activeId ? "#1a2a45" : "transparent"}>
                <button className="btn" onClick={() => { onSwitch(l.id); setOpen(false); }} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", textAlign: "left" }}>
                  <span style={{ fontSize: 18 }}>{l.flag}</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: C.gold, width: 34 }}>{l.code || l.studyCode}</span>
                  <span style={{ fontSize: 13, color: C.textDim }}>{l.label}</span>
                  {l.id === activeId && <span style={{ marginLeft: "auto", color: C.ok, fontSize: 12 }}>✓</span>}
                </button>
                <button className="btn" onClick={e => { e.stopPropagation(); setEditLang(l); setOpen(false); }}
                  style={{ padding: "10px 8px", color: "#4a5878", fontSize: 13, flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = C.gold}
                  onMouseLeave={e => e.currentTarget.style.color = "#4a5878"}>✏️</button>
                {langs.length > 1 && (
                  <button className="btn" onClick={e => { e.stopPropagation(); setShowDel(l); setOpen(false); }}
                    style={{ padding: "10px 8px", color: "#4a2828", fontSize: 16, flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#c87070"}
                    onMouseLeave={e => e.currentTarget.style.color = "#4a2828"}>×</button>
                )}
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
            <button className="btn" onClick={() => { setShowAdd(true); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", color: "#7090b8", textAlign: "left", fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = "#161e30"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize: 18 }}>＋</span> Přidat jazyk
            </button>
          </div>
        )}
      </div>
      {showDel && <ConfirmModal title={`Smazat jazyk ${showDel.label}?`} msg="Všechny balíčky tohoto jazyka budou také smazány." onConfirm={() => onDeleteLang(showDel.id)} onClose={() => setShowDel(null)} />}
      {showAdd && <LangModal title="Přidat jazyk" onClose={() => setShowAdd(false)} onSave={data => { onAddLang({ id: uid(), ...data, custom: true }); setShowAdd(false); }} />}
      {editLang && <LangModal title={`Upravit — ${editLang.label}`} initial={editLang} onClose={() => setEditLang(null)} onSave={data => { onEditLang({ ...editLang, ...data }); setEditLang(null); }} />}
    </>
  );
}

/* ─── Upload Modal ───────────────────────────────────────────── */
export function UploadModal({ onClose, onUpload }) {
  const [drag, setDrag] = useState(false);
  const fRef = useRef(null);
  return (
    <Modal onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: C.gold, marginBottom: 4 }}>Nahrát nový balíček</div>
        <div style={{ fontSize: 13, color: C.muted }}>Excel nebo CSV soubor</div>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) { onUpload(f); onClose(); } }}
        onClick={() => fRef.current.click()}
        style={{ border: `2px dashed ${drag ? C.gold : "#2e3447"}`, borderRadius: 14, padding: "2rem 1.5rem", textAlign: "center", background: drag ? "rgba(212,168,83,.05)" : "transparent", cursor: "pointer", transition: "all .2s", marginBottom: 16 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 16, color: C.gold, fontFamily: "'Playfair Display',serif", fontWeight: 700, marginBottom: 4 }}>Přetáhni soubor sem</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>nebo klikni pro výběr</div>
        <div style={{ display: "inline-block", background: "#1a2030", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#4a6070" }}>.xlsx · .xls · .csv</div>
        <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); onClose(); } }} />
      </div>
      <div style={{ background: "#0e1520", borderRadius: 10, padding: "10px 14px" }}>
        <div style={{ fontSize: 10, color: C.mutedDark, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>Formát</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "3px 10px", fontSize: 12, fontFamily: "monospace" }}>
          <span style={{ color: "#5c8aaa", fontWeight: 600 }}>A – EN</span>
          <span style={{ color: "#7a8a5c", fontWeight: 600 }}>B – CS</span>
          <span style={{ color: "#9a7a5c", fontWeight: 600 }}>C – Příklad</span>
          <span style={{ color: "#7a6a8a", fontWeight: 600 }}>D – Synonyma</span>
          <span style={{ color: C.muted }}>contestant</span>
          <span style={{ color: C.muted }}>soutěžící</span>
          <span style={{ color: "#5a5a5a", fontStyle: "italic" }}>She wins.</span>
          <span style={{ color: "#7a6a5c" }}>závodník</span>
        </div>
        <div style={{ marginTop: 7, fontSize: 11, color: "#5a6a5c" }}>Synonyma lze i v B: <span style={{ fontFamily: "monospace", color: "#8a8" }}>soutěžící / závodník</span></div>
      </div>
    </Modal>
  );
}

/* ─── Add Word Modal ─────────────────────────────────────────── */
export function AddWordModal({ onClose, onAdd }) {
  const [f, setF] = useState({ en: "", cs: "", ex: "", syn: "" });
  const upd = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  function submit() {
    if (!f.en.trim() || !f.cs.trim()) return;
    onAdd({ en: f.en.trim(), cs: f.cs.trim(), example: f.ex.trim(), synonyms: f.syn.trim() });
    onClose();
  }
  return (
    <Modal onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 3 }}>Přidat slovíčko</div>
        <div style={{ fontSize: 13, color: C.muted }}>Překlad, synonyma a příkladová věta</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>🇬🇧 Anglicky *</div>
          <input className="inp-sm" value={f.en} onChange={upd("en")} placeholder="anglické slovo" autoFocus onKeyDown={e => e.key === "Enter" && document.getElementById("lc-cs")?.focus()} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>🇨🇿 Česky * <span style={{ color: C.mutedDark, fontSize: 11 }}>(nebo: slov1 / slov2)</span></div>
          <input id="lc-cs" className="inp-sm" value={f.cs} onChange={upd("cs")} placeholder="překlad" onKeyDown={e => e.key === "Enter" && document.getElementById("lc-syn")?.focus()} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>🔄 Synonyma <span style={{ color: C.mutedDark, fontSize: 11 }}>(volitelné)</span></div>
          <input id="lc-syn" className="inp-sm" value={f.syn} onChange={upd("syn")} placeholder="závodník / účastník" onKeyDown={e => e.key === "Enter" && document.getElementById("lc-ex")?.focus()} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>💡 Příkladová věta</div>
          <input id="lc-ex" className="inp-sm" value={f.ex} onChange={upd("ex")} placeholder="volitelně…" onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: "10px", fontSize: 14, cursor: "pointer" }}>Zrušit</button>
          <button className="btn" onClick={submit} style={{ flex: 2, background: f.en && f.cs ? C.gold : "#1a2030", color: f.en && f.cs ? C.bg : "#4a5060", border: "none", borderRadius: 9, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>Přidat</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Rename Deck Modal ──────────────────────────────────────── */
export function RenameModal({ currentName, onClose, onRename }) {
  const [name, setName] = useState(currentName);
  return (
    <Modal onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 3 }}>Přejmenovat balíček</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input className="inp-sm" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && name.trim() && onRename(name.trim())} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: "10px", fontSize: 14, cursor: "pointer" }}>Zrušit</button>
          <button className="btn" onClick={() => name.trim() && onRename(name.trim())} style={{ flex: 2, background: name.trim() ? C.gold : "#1a2030", color: name.trim() ? C.bg : "#4a5060", border: "none", borderRadius: 9, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Uložit</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Stats Modal ────────────────────────────────────────────── */
export function StatsModal({ deck, onClose, onReset }) {
  const [sk, setSk] = useState("total-desc");
  const sorted = sortStats(deck.words, sk);
  const ds = deck.deckStats ?? { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 };
  const mastered = deck.words.filter(w => (w.score ?? 0) >= 3).length;
  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 3 }}>Statistika — {deck.name}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{deck.words.length} slovíček · {mastered} zvládnuto · {ds.roundsCompleted} kol</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button className="btn" onClick={onReset} style={{ border: "1px solid #3a1515", color: "#7a4040", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>🔄 Reset</button>
          <button className="btn" onClick={onClose} style={{ color: C.muted, fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 14 }}>
        {[
          { lbl: "Celkem", val: ds.totalAnswers || 0, c: "#7090c8", bg: "#121a2e" },
          { lbl: "Správně", val: ds.correctAnswers || 0, c: C.ok, bg: C.okBg },
          { lbl: "Špatně", val: (ds.totalAnswers || 0) - (ds.correctAnswers || 0), c: C.err, bg: C.errBg },
          { lbl: "Úspěšnost", val: ds.totalAnswers ? `${Math.round(ds.correctAnswers / ds.totalAnswers * 100)}%` : "—", c: C.gold, bg: "#1a1608" },
        ].map(({ lbl, val, c, bg }) => (
          <div key={lbl} style={{ background: bg, borderRadius: 9, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: c, textTransform: "uppercase", letterSpacing: .8, marginBottom: 2 }}>{lbl}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: c }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 1.5, flexShrink: 0 }}>Řadit:</span>
        {STAT_COLS.map(s => (
          <button key={s.id} className="btn" onClick={() => setSk(s.id)}
            style={{ background: sk === s.id ? "#1a2a40" : "transparent", border: `1px solid ${sk === s.id ? "#2e4565" : C.border}`, color: sk === s.id ? C.gold : C.muted, borderRadius: 7, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid #1e2535` }}>
              {["#", "Anglicky", "Česky", "Synonyma", "Prox.", "✓", "✗", "Úsp.", "Krabička"].map(h => (
                <th key={h} style={{ padding: "6px 8px", color: C.muted, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, textAlign: h === "#" ? "center" : "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((w, i) => {
              const ws = w.wStats ?? { total: 0, correct: 0, wrong: 0 };
              const pct = ws.total ? Math.round(ws.correct / ws.total * 100) : null;
              const pc = pct === null ? C.muted : pct >= 80 ? C.ok : pct >= 50 ? C.gold : C.err;
              const syns = [...parseSyn(w.cs).slice(1), ...parseSyn(w.synonyms || "")].join(", ");
              const daysLeft = w.vmNextReview ? Math.max(0, Math.round((w.vmNextReview - Date.now()) / 86400000)) : null;
              const vmBox = vmGetBox(w);
              return (
                <tr key={w.id} style={{ borderBottom: `1px solid #161e2e` }}
                  onMouseEnter={e => e.currentTarget.style.background = "#0e1525"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "7px 8px", color: C.muted, textAlign: "center", fontSize: 10 }}>{i + 1}</td>
                  <td style={{ padding: "7px 8px", color: C.text, fontWeight: 500 }}>{w.en}</td>
                  <td style={{ padding: "7px 8px", color: C.textDim }}>{parseSyn(w.cs)[0] || w.cs}</td>
                  <td style={{ padding: "7px 8px", color: "#6a7060", fontSize: 11, fontStyle: "italic" }}>{syns || "—"}</td>
                  <td style={{ padding: "7px 8px", color: C.textDim, textAlign: "center" }}>{ws.total || "—"}</td>
                  <td style={{ padding: "7px 8px", color: C.ok, textAlign: "center" }}>{ws.correct || "—"}</td>
                  <td style={{ padding: "7px 8px", color: C.err, textAlign: "center" }}>{ws.wrong || "—"}</td>
                  <td style={{ padding: "7px 8px", textAlign: "center" }}>
                    {pct !== null
                      ? <span style={{ background: pc + "22", color: pc, borderRadius: 20, padding: "2px 8px", fontWeight: 600, fontSize: 11 }}>{pct}%</span>
                      : <span style={{ color: C.mutedDark }}>—</span>}
                  </td>
                  <td style={{ padding: "7px 8px", textAlign: "center" }}>
                    <span style={{ background: "#1a2035", color: C.gold, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>#{vmBox}</span>
                    {daysLeft !== null && <span style={{ color: C.muted, fontSize: 10, marginLeft: 4 }}>{daysLeft === 0 ? "dnes" : `${daysLeft}d`}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ─── Onboarding Modal ───────────────────────────────────────── */
export function OnboardingModal({ onSample, onUpload, onClose }) {
  const fRef = useRef(null);
  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "0.5rem 0 1rem" }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🃏</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: C.gold, marginBottom: 6 }}>Vítej v LexiCard!</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>Jak chceš začít?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn" onClick={onSample} style={{ background: C.gold, border: "none", color: C.bg, borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Playfair Display',serif" }}>🎓 Zkusit ukázkový balíček</button>
          <button className="btn" onClick={() => fRef.current.click()} style={{ background: "transparent", border: `1.5px solid #2a3650`, color: C.textDim, borderRadius: 12, padding: "13px", fontSize: 14, cursor: "pointer" }}>📊 Nahrát vlastní .xlsx soubor</button>
          <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); onClose(); } }} />
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: C.mutedDark, fontStyle: "italic" }}>Formát: sloupec A = anglicky, B = česky, C = příkladová věta (volitelné)</div>
      </div>
    </Modal>
  );
}

/* ─── Folder Modal ───────────────────────────────────────────── */
export function FolderModal({ initial, onClose, onSave, title }) {
  const [name, setName] = useState(initial?.name ?? "");
  return (
    <Modal onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 3 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input className="inp-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Název složky…" autoFocus onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: "10px", fontSize: 14, cursor: "pointer" }}>Zrušit</button>
          <button className="btn" onClick={() => name.trim() && onSave(name.trim())}
            style={{ flex: 2, background: name.trim() ? C.gold : "#1a2030", color: name.trim() ? C.bg : "#4a5060", border: "none", borderRadius: 9, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>
            Uložit
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Move to Folder Modal ───────────────────────────────────── */
export function MoveFolderModal({ deck, folders, currentFolderId, onClose, onMove }) {
  const [selected, setSelected] = useState(currentFolderId ?? null);
  return (
    <Modal onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: C.gold, marginBottom: 3 }}>Přesunout balíček</div>
        <div style={{ fontSize: 13, color: C.muted }}>„{deck.name}"</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        <div onClick={() => setSelected(null)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: selected === null ? "#1a2a45" : "transparent", border: `1px solid ${selected === null ? "#3a5080" : C.border}`, borderRadius: 10, cursor: "pointer", transition: "all .15s" }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <span style={{ fontSize: 13, color: selected === null ? C.gold : C.textDim }}>Bez složky (hlavní stránka)</span>
          {selected === null && <span style={{ marginLeft: "auto", color: C.ok, fontSize: 12 }}>✓</span>}
        </div>
        {folders.map(f => (
          <div key={f.id} onClick={() => setSelected(f.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: selected === f.id ? "#1a2a45" : "transparent", border: `1px solid ${selected === f.id ? "#3a5080" : C.border}`, borderRadius: 10, cursor: "pointer", transition: "all .15s" }}>
            <span style={{ fontSize: 18 }}>📁</span>
            <span style={{ fontSize: 13, color: selected === f.id ? C.gold : C.textDim }}>{f.name}</span>
            {selected === f.id && <span style={{ marginLeft: "auto", color: C.ok, fontSize: 12 }}>✓</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={onClose} style={{ flex: 1, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: "10px", fontSize: 14, cursor: "pointer" }}>Zrušit</button>
        <button className="btn" onClick={() => { onMove(selected); onClose(); }}
          style={{ flex: 2, background: C.gold, color: C.bg, border: "none", borderRadius: 9, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Přesunout
        </button>
      </div>
    </Modal>
  );
}
