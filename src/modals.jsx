import React from "react";
import { C } from "./constants.js";

/* ─── Base Modal ─────────────────────────────────────── */
export function Modal({ title, children, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {title && <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 16 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

/* ─── Confirm Modal ──────────────────────────────────── */
export function ConfirmModal({ title, msg, onConfirm, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.textDim, marginBottom: 20 }}>{msg}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1, background: C.border, color: C.text, borderRadius: 8, padding: 10, cursor: "pointer" }}>Zrušit</button>
          <button className="btn" onClick={() => {
            onConfirm();
            onClose();
          }} style={{ flex: 1, background: C.err, color: C.bg, borderRadius: 8, padding: 10, cursor: "pointer", fontWeight: 600 }}>Smazat</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Settings Dropdown ──────────────────────────────– */
export function SettingsDropdown({ items, onSelect }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOpen(o => !o)} style={{ background: open ? "#1e2a45" : "transparent", border: `1px solid ${open ? "#3a5080" : C.border}`, color: open ? C.gold : C.muted, borderRadius: 8, padding: "5px 10px", fontSize: 16, cursor: "pointer", lineHeight: 1, transition: "all .2s" }}>
        ⚙️
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#111e30", border: `1px solid #2a3650`, borderRadius: 12, overflow: "hidden", minWidth: 180, zIndex: 50, boxShadow: "0 8px 28px rgba(0,0,0,.6)" }}>
          {items.map((item, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <div style={{ borderTop: `1px solid ${C.border}` }} />}
              <button className="btn" onClick={() => {
                onSelect(item);
                setOpen(false);
              }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: item.color || C.textDim, fontSize: 13, textAlign: "left", transition: "background .15s" }} onMouseEnter={e => e.currentTarget.style.background = item.bgHover || "#161e30"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Language Modal ─────────────────────────────────── */
export function LangModal({ onSelect, onClose }) {
  const languages = [
    { code: "en", flag: "🇬🇧", name: "English" },
    { code: "cs", flag: "🇨🇿", name: "Čeština" },
    { code: "es", flag: "🇪🇸", name: "Español" },
    { code: "fr", flag: "🇫🇷", name: "Français" },
    { code: "de", flag: "🇩🇪", name: "Deutsch" },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: 16 }}>Zvolte jazyk</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {languages.map(lang => (
            <button key={lang.code} className="btn" onClick={() => {
              onSelect(lang);
              onClose();
            }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "12px", cursor: "pointer", transition: "all .2s", textAlign: "center" }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = "#1a2230"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{lang.flag}</div>
              <div style={{ fontSize: 12 }}>{lang.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
