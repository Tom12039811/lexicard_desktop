import { useState, useRef } from "react";
import { C, STYLE, MODES } from "./constants.js";
import { parseSyn, comboInfo } from "./utils.js";
import { SettingsDropdown } from "./modals.jsx";

/* ══════════════════════════════════════════════════════════════
   FLIP SWIPE CARD
══════════════════════════════════════════════════════════════ */
export function FlipSwipeCard({ word: w, dir, flipped, flipFlash, dictEntry, allSyn, onFlip, onAnswer, onSpeak, onSpeakBack }) {
  const [drag, setDrag] = useState({ active: false, dx: 0, dy: 0 });
  const [hovered, setHovered] = useState(null);
  const startRef = useRef(null);

  const ZONES = [
    { q: 0, label: "Neznám", emoji: "😕", color: C.err,      bg: C.errBg,  border: C.errBorder },
    { q: 3, label: "Tuším",  emoji: "🤔", color: "#c8a050",  bg: "#1a1608", border: "#4a4010" },
    { q: 5, label: "Vím! ✓", emoji: "😊", color: C.ok,       bg: C.okBg,   border: C.okBorder },
  ];

  const showFront = dir === "en-cs";
  const frontWord = showFront ? w.en : (parseSyn(w.cs)[0] || w.cs);
  const frontFlag = showFront ? "🇬🇧" : "🇨🇿";
  const backWord  = showFront ? (parseSyn(w.cs)[0] || w.cs) : w.en;

  function getZone(dx, dy) {
    if (dy > -30) return null;
    if (dx < -60) return 0;
    if (dx > 60)  return 5;
    return 3;
  }

  function onPointerDown(e) {
    if (!flipped || flipFlash) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ active: true, dx: 0, dy: 0 });
  }
  function onPointerMove(e) {
    if (!drag.active || !startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    setDrag({ active: true, dx, dy });
    setHovered(getZone(dx, dy));
  }
  function onPointerUp(e) {
    if (!drag.active) return;
    const dx = e.clientX - (startRef.current?.x ?? e.clientX);
    const dy = e.clientY - (startRef.current?.y ?? e.clientY);
    const zone = getZone(dx, dy);
    setDrag({ active: false, dx: 0, dy: 0 });
    setHovered(null);
    startRef.current = null;
    if (zone != null) onAnswer(zone);
  }

  const cardTransform = drag.active
    ? `translate(${drag.dx}px, ${Math.min(0, drag.dy)}px) rotate(${drag.dx * 0.04}deg)`
    : "translate(0,0) rotate(0deg)";

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", userSelect: "none" }}>

      {/* Drop zones */}
      {flipped && !flipFlash && (
        <div className="fade-up" style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, pointerEvents: "none" }}>
          {ZONES.map(z => {
            const isHov = hovered === z.q, isDrag = drag.active && Math.abs(drag.dy) > 30;
            return (
              <div key={z.q} style={{
                background: isHov ? "#1a2035" : "transparent",
                border: `1.5px dashed ${isHov ? "#4a5878" : isDrag ? "#252e42" : C.border}`,
                borderRadius: 12, padding: "8px 4px", textAlign: "center",
                transition: "all .15s", transform: isHov ? "scale(1.06)" : "scale(1)",
              }}>
                <div style={{ fontSize: 20 }}>{z.emoji}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Answer buttons */}
      {flipped && !flipFlash && (
        <div className="fade-up" style={{ width: "100%", display: "flex", gap: 6 }}>
          {ZONES.map(({ q, label }) => (
            <button key={q} className="btn" onClick={() => onAnswer(q)}
              style={{ flex: 1, background: "#131c2e", border: `1px solid #2a3448`, color: "#8a96a8", borderRadius: 10, padding: "9px 4px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Lora',serif", transition: "all .18s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#1a2540"; e.currentTarget.style.borderColor = "#3a4a60"; e.currentTarget.style.color = "#c0cad8"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#131c2e"; e.currentTarget.style.borderColor = "#2a3448"; e.currentTarget.style.color = "#8a96a8"; }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Card */}
      <div
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className={flipFlash ? `flash-${flipFlash}` : (drag.active ? "" : "card-in")}
        style={{
          width: "100%", background: C.card,
          border: `1px solid ${hovered != null ? "#3a4a62" : C.border}`,
          borderRadius: 22, padding: "2.8rem 2rem", textAlign: "center",
          cursor: flipped ? "grab" : "pointer", touchAction: "none",
          transform: cardTransform,
          transition: drag.active ? "none" : "transform .3s ease, border-color .15s",
          minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0,
          boxShadow: hovered != null ? "0 8px 30px rgba(60,80,120,.25)" : "none",
        }}
        onClick={!flipped ? onFlip : undefined}
      >
        {!flipped ? (
          <>
            <div style={{ fontSize: 11, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 3, marginBottom: 18 }}>{frontFlag} — klikni pro překlad</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 42, fontWeight: 700, color: C.text, lineHeight: 1.15 }}>{frontWord}</div>
              {dir === "en-cs" && (
                <button className="btn" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSpeak(); }}
                  style={{ border: `1px solid #2e3447`, color: "#6a7888", borderRadius: "50%", width: 34, height: 34, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🔊</button>
              )}
            </div>
            {dir === "en-cs" && dictEntry?.ipa && <div style={{ fontSize: 15, color: C.muted, fontStyle: "italic", marginBottom: 6 }}>{dictEntry.ipa}</div>}
            <div style={{ fontSize: 13, color: "#2a3545", marginTop: 8 }}>👆 Klikni pro překlad</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 600, color: C.textDim, marginBottom: 10, lineHeight: 1.2 }}>{frontWord}</div>
            <div style={{ fontSize: 26, color: C.mutedDark, marginBottom: 10, lineHeight: 1 }}>↓</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: allSyn || w.example ? 14 : 0 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 38, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{backWord}</div>
              <button className="btn" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSpeakBack(); }}
                style={{ border: `1px solid #2e3447`, color: "#6a7888", borderRadius: "50%", width: 34, height: 34, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🔊</button>
            </div>
            {dir === "cs-en" && dictEntry?.ipa && <div style={{ fontSize: 14, color: C.muted, fontStyle: "italic", marginBottom: allSyn || w.example ? 10 : 0 }}>{dictEntry.ipa}</div>}
            {allSyn && <div style={{ fontSize: 13, color: "#5a6a50", marginBottom: w.example ? 12 : 0 }}>také: {allSyn}</div>}
            {w.example && (
              <div style={{ fontSize: 16, color: "#3a4a50", fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 2, lineHeight: 1.65, maxWidth: "90%" }}>
                💡 „{w.example}"
              </div>
            )}
          </>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
          {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < (w.score ?? 0) ? C.gold : "#1e2535" }} />)}
        </div>
      </div>

      {flipped && !flipFlash && (
        <div style={{ fontSize: 10, color: C.mutedDark, textAlign: "center" }}>nebo přetáhni kartičku nahoru do zóny</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROUND END
══════════════════════════════════════════════════════════════ */
export function RoundEnd({ stats, total, deckName, xpEarned, newLevel, streak, onNext, onBack }) {
  const pct = total ? Math.round(stats.ok / total * 100) : 0;
  const em = pct >= 90 ? "🏆" : pct >= 70 ? "👏" : pct >= 50 ? "💪" : "📚";
  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora',Georgia,serif", color: C.text, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>
      <div className="card-in" style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>{em}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: C.gold, marginBottom: 4 }}>Kolo dokončeno!</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, fontStyle: "italic" }}>{deckName}</div>
        {newLevel && <div style={{ background: "#1a1608", border: `1px solid ${C.gold}`, borderRadius: 12, padding: "10px 16px", marginBottom: 14, fontSize: 14, color: C.gold, fontWeight: 600 }}>🎉 Level up! Jsi teď Level {newLevel}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 16 }}>
          {[
            { lbl: "Správně",    val: stats.ok,   bg: C.okBg,   c: C.ok },
            { lbl: "Špatně",     val: stats.bad,  bg: C.errBg,  c: C.err },
            { lbl: "Úspěšnost",  val: `${pct}%`,  bg: "#1a2038", c: "#7090c8" },
          ].map(({ lbl, val, bg, c }) => (
            <div key={lbl} style={{ background: bg, borderRadius: 11, padding: "0.9rem 0.3rem" }}>
              <div style={{ fontSize: 10, color: c, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{lbl}</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 23, fontWeight: 700, color: c }}>{val}</div>
            </div>
          ))}
        </div>
        {xpEarned > 0 && <div style={{ background: "#1a1608", border: "1px solid #3a3010", borderRadius: 10, padding: "8px", marginBottom: 14, fontSize: 14, color: C.gold }}>+{xpEarned} XP získáno{streak >= 3 ? ` · 🔥 ${streak} dní v řadě` : ""}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <button className="btn" onClick={onNext} style={{ background: C.gold, border: "none", color: C.bg, borderRadius: 11, padding: "13px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Playfair Display',serif" }}>Další kolo →</button>
          <button className="btn" onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 11, padding: "11px", fontSize: 14, cursor: "pointer" }}>Zpět na slovíčka</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   STUDY SCREEN
══════════════════════════════════════════════════════════════ */
export default function StudyScreen({
  deck, langs,
  rWords, rIdx, rStats, combo,
  feedback, flipFlash, flipped, listenOn,
  tx, micSt, micErr, iMode, typed, autoPlay, playSounds,
  pronAtt, evalLoading, wrongCountdown, dictEntry,
  mode, translDir, flipDir,
  onSetMode, onSetTranslDir, onSetFlipDir,
  onSetIMode, onSetTyped, onSetAutoPlay, onSetPlaySounds,
  onFlip, onFlipAnswer, onStartListen, onStopListen,
  onSubmitTyped, onDontKnow, onNextCard, onBack,
  onSpeak,
}) {
  const w = rWords[rIdx];
  if (!w) return null;

  const isFlip = mode === "flip";
  const isPron = mode === "pron";
  const effDir = translDir;
  const question = isPron ? w.en : (effDir === "en-cs" ? w.en : w.cs);
  const qLang = effDir === "en-cs" ? "en-US" : "cs-CZ";
  const aLang = effDir === "en-cs" ? "cs-CZ" : "en-US";
  const micLang = effDir === "en-cs" ? "cs-CZ" : "en-US";
  const total = rStats.ok + rStats.bad;
  const pct = total ? Math.round(rStats.ok / total * 100) : 0;
  const ci = comboInfo(combo);
  const allSyn = [...parseSyn(effDir === "en-cs" ? w.cs : w.en).slice(1), ...parseSyn(w.synonyms || "")].join(" · ");

  const lc = langs.find(l => l.id === deck?.lang) || langs[0];
  const nativeCode = lc?.nativeCode || "CZ";
  const studyCode = lc?.studyCode || "EN";
  const studyFlag = lc?.flag || "🇬🇧";

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora',Georgia,serif", color: C.text, display: "flex", flexDirection: "column", overscrollBehavior: "none", alignItems: "center", overflow: "hidden" }}>
      <style>{STYLE}</style>

      {/* top bar */}
      <div style={{ width: "100%", maxWidth: 680, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: `1px solid #1a1f2e`, gap: 8 }}>
        <button className="btn" onClick={onBack} style={{ color: C.muted, fontSize: 12, flexShrink: 0 }}>← {deck?.name}</button>
        <div style={{ flex: 1, maxWidth: 130 }}>
          <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginBottom: 3 }}>Kolo {rIdx + 1}/{rWords.length}</div>
          <div style={{ background: "#1a2030", borderRadius: 3, height: 3 }}>
            <div style={{ width: `${((rIdx + 1) / rWords.length) * 100}%`, height: "100%", background: C.gold, borderRadius: 3, transition: "width .3s" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
          {ci && <span style={{ background: ci.color + "22", color: ci.color, padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{ci.txt} {ci.mult}</span>}
          {[
            { bg: C.okBg,   c: C.ok,       t: `✓${rStats.ok}` },
            { bg: C.errBg,  c: C.err,      t: `✗${rStats.bad}` },
            ...(total > 0 ? [{ bg: "#1a2038", c: "#7090c8", t: `${pct}%` }] : []),
          ].map(({ bg, c, t }, i) => <span key={i} style={{ background: bg, color: c, padding: "2px 7px", borderRadius: 20, fontSize: 11, fontWeight: 500 }}>{t}</span>)}
        </div>
        <SettingsDropdown autoPlay={autoPlay} onToggle={onSetAutoPlay} playSounds={playSounds} onToggleSounds={onSetPlaySounds} />
      </div>

      {/* mode tabs */}
      <div style={{ width: "100%", maxWidth: 680, padding: "0.6rem 1rem 0", display: "flex", gap: 5 }}>
        {MODES.map(m => (
          <button key={m.id} className="btn" onClick={() => onSetMode(m.id)}
            style={{ flex: 1, background: mode === m.id ? "#1e2a45" : C.card, border: `1.5px solid ${mode === m.id ? "#3a5080" : C.border}`, color: mode === m.id ? C.gold : "#6a7080", borderRadius: 9, padding: "6px 3px", fontSize: 12, cursor: "pointer", transition: "all .2s" }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* direction buttons */}
      {(mode === "transl" || mode === "flip") && (() => {
        const activeDir = mode === "flip" ? flipDir : translDir;
        const setDir = v => { if (mode === "flip") onSetFlipDir(v); else onSetTranslDir(v); };
        const opts = [
          { dir: "en-cs", label: `${studyFlag} ${lc?.label || "Angličtina"} → ${nativeCode}` },
          { dir: "cs-en", label: `${nativeCode} → ${studyFlag} ${lc?.label || "Angličtina"}` },
        ];
        return (
          <div style={{ width: "100%", maxWidth: 680, padding: "0.5rem 1rem 0", display: "flex", gap: 7 }}>
            {opts.map(opt => (
              <button key={opt.dir} className="btn" onClick={() => setDir(opt.dir)}
                style={{ flex: 1, background: activeDir === opt.dir ? "#1e2a45" : C.card, border: `1.5px solid ${activeDir === opt.dir ? "#3a5080" : C.border}`, color: activeDir === opt.dir ? C.gold : "#6a7080", borderRadius: 10, padding: "9px 8px", fontSize: 13, cursor: "pointer", transition: "all .2s", fontFamily: "'Lora',serif", fontWeight: activeDir === opt.dir ? 600 : 400 }}>
                {opt.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* main content */}
      <div style={{ flex: 1, width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", alignItems: "center", padding: "1rem", gap: "0.8rem" }}>

        {/* FLIP CARD MODE */}
        {isFlip && (
          <FlipSwipeCard
            key={w.id + flipDir}
            word={w} dir={flipDir} flipped={flipped}
            flipFlash={flipFlash} dictEntry={dictEntry} allSyn={allSyn}
            onFlip={onFlip}
            onAnswer={onFlipAnswer}
            onSpeak={() => onSpeak(w.en, "en-US")}
            onSpeakBack={() => onSpeak(w.en, "en-US")}
          />
        )}

        {/* STANDARD MODES (transl, pron) */}
        {!isFlip && (<>
          {/* question card */}
          <div key={w.id + mode + effDir} className="card-in"
            style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "1.2rem 1.5rem", textAlign: "center" }}>
            {isPron ? (
              <>
                <div style={{ fontSize: 10, color: "#3e6850", textTransform: "uppercase", letterSpacing: 3, marginBottom: 8 }}>🔊 Výslovnost</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 5 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 700, color: C.text }}>{w.en}</div>
                  <button className="btn" onClick={() => onSpeak(w.en, "en-US")} style={{ border: `1px solid #2a5030`, color: "#6acf90", borderRadius: "50%", width: 30, height: 30, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>🔊</button>
                </div>
                {dictEntry?.ipa && <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic", marginBottom: 4 }}>{dictEntry.ipa}</div>}
                {w.cs && <div style={{ fontSize: 13, color: "#4a6050", fontStyle: "italic" }}>{parseSyn(w.cs)[0]}</div>}
                {pronAtt > 0 && !feedback && <div style={{ fontSize: 12, color: pronAtt >= 2 ? C.err : "#c89040", marginTop: 5 }}>{pronAtt === 1 ? "Pokus 2/3" : "Poslední pokus 3/3"}</div>}
              </>
            ) : (
              <>
                <div style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 3, marginBottom: 8 }}>
                  {effDir === "en-cs" ? "🇬🇧 Anglicky" : "🇨🇿 Česky"}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 5 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{question}</div>
                  <button className="btn" onClick={() => onSpeak(question, qLang)} style={{ border: `1px solid #2e3447`, color: "#6a7888", borderRadius: "50%", width: 28, height: 28, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>🔊</button>
                </div>
                {effDir === "en-cs" && dictEntry?.ipa && <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginBottom: 4 }}>{dictEntry.ipa}</div>}
                {effDir === "en-cs" && w.example && !feedback && (
                  <div style={{ fontSize: 14, color: "#3a4a50", fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4, lineHeight: 1.5 }}>
                    💡 „{w.example}"
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 10 }}>
              {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", transition: "background .3s", background: i < (w.score ?? 0) ? C.gold : "#1e2535" }} />)}
            </div>
          </div>

          {/* input toggle */}
          {!feedback && !isPron && (
            <div style={{ display: "flex", background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3, gap: 3 }}>
              {[["mic", "🎤 Mikrofon"], ["text", "⌨️ Psát"]].map(([m, lbl]) => (
                <button key={m} className="btn" onClick={() => { onSetIMode(m); }}
                  style={{ background: iMode === m ? "#1e2a45" : "transparent", border: iMode === m ? "1px solid #2e4065" : "1px solid transparent", color: iMode === m ? C.gold : "#6a7080", borderRadius: 7, padding: "5px 14px", fontSize: 13, cursor: "pointer" }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {evalLoading && <div style={{ fontSize: 13, color: C.gold, textAlign: "center", opacity: .8 }}>🤖 Vyhodnocuji…</div>}

          {/* answer area */}
          {!feedback && !evalLoading && (
            <div className="fade-up" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
              {(iMode === "mic" || isPron) && (<>
                {micErr && (
                  <div style={{ width: "100%", background: "#200e0e", border: `1px solid #5a2020`, borderRadius: 9, padding: "8px 12px", fontSize: 12, color: "#e08080", lineHeight: 1.5 }}>
                    ⚠️ {micErr}
                    {!isPron && <button className="btn" onClick={() => onSetIMode("text")} style={{ marginLeft: 8, background: C.gold, color: C.bg, borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Psát</button>}
                  </div>
                )}
                {micSt === "requesting" && <div style={{ color: "#8a9060", fontSize: 12 }}>Žádám o přístup k mikrofonu…</div>}
                <div style={{ color: C.muted, fontSize: 12, minHeight: 20, textAlign: "center", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  {listenOn
                    ? (<><span style={{ display: "flex", alignItems: "flex-end", height: 16 }}>{[1, 2, 3, 4, 5].map(i => <span key={i} className="wv" style={{ height: 5 }} />)}</span>{tx ? `„${tx}"` : isPron ? "Řekni slovo anglicky…" : `Říkejte ${effDir === "en-cs" ? "česky" : "anglicky"}…`}</>)
                    : tx ? `„${tx}"` : isPron ? "Klikni na 🎤 a zopakuj" : `Řekněte překlad ${effDir === "en-cs" ? "česky" : "anglicky"}`}
                </div>
                <button onClick={listenOn ? onStopListen : () => onStartListen(micLang)}
                  className={`btn${listenOn ? " mic-on" : ""}`}
                  style={{ width: 66, height: 66, borderRadius: "50%", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: listenOn ? "#c49840" : "#141c2e", border: `2.5px solid ${listenOn ? C.gold : "#2e3447"}`, color: listenOn ? C.bg : "#7a8888", transition: "all .2s" }}>
                  {listenOn ? "⏹" : "🎤"}
                </button>
              </>)}

              {iMode === "text" && !isPron && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
                  <input className="inp" value={typed} onChange={e => onSetTyped(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && onSubmitTyped()}
                    placeholder={effDir === "en-cs" ? "česky…" : "anglicky…"} autoFocus />
                  <button className="btn" onClick={onSubmitTyped}
                    style={{ background: typed.trim() ? C.gold : "#1a2030", color: typed.trim() ? C.bg : "#4a5060", border: "none", borderRadius: 9, padding: "11px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Playfair Display',serif", transition: "all .2s" }}>
                    Zkontrolovat →
                  </button>
                </div>
              )}

              {!isPron && (
                <button className="btn" onClick={onDontKnow}
                  style={{ border: `1.5px solid #3d3020`, background: "#1a1508", color: "#c8a050", borderRadius: 9, padding: "8px 22px", fontSize: 13, cursor: "pointer", fontWeight: 500, transition: "all .2s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#3d3020"; e.currentTarget.style.color = "#c8a050"; }}>
                  Nevím — ukázat &amp; přečíst 🔈
                </button>
              )}
            </div>
          )}

          {/* feedback */}
          {!evalLoading && feedback && (
            <div className="fade-up" style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: "100%", background: feedback.ok ? C.okBg : C.errBg, border: `1px solid ${feedback.ok ? C.okBorder : C.errBorder}`, borderRadius: 14, padding: "1rem 1.2rem", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{feedback.ok ? "✓" : "✗"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, fontWeight: 700, color: feedback.ok ? C.ok : C.err, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    {feedback.ok ? (isPron ? "Výborná výslovnost!" : "Správně!") : (feedback.forced ? "3× špatně" : (isPron ? "Zkus příště" : "Špatně"))}
                    {feedback.ok && <span style={{ fontSize: 10, color: "#5a7060", marginLeft: "auto" }}>→ za chvíli…</span>}
                  </div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700, color: C.text }}>{parseSyn(feedback.answer)[0] || feedback.answer}</div>
                  {allSyn && <div style={{ fontSize: 11, color: "#5a6a50", marginTop: 2 }}>✓ také: {allSyn}</div>}
                  {dictEntry?.ipa && <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic", marginTop: 2 }}>{dictEntry.ipa}</div>}
                  {effDir === "en-cs" && w.example && <div style={{ fontSize: 14, color: "#3a4a50", fontStyle: "italic", marginTop: 6, lineHeight: 1.5 }}>💡 „{w.example}"</div>}
                  {!feedback.ok && feedback.given && <div style={{ fontSize: 11, color: "#4a4030", marginTop: 4, fontStyle: "italic" }}>Vaše odpověď: „{feedback.given}"</div>}
                </div>
                <button className="btn" onClick={() => onSpeak(parseSyn(feedback.answer)[0] || feedback.answer, aLang)}
                  style={{ border: `1px solid #2e3447`, color: "#6a7888", borderRadius: "50%", width: 32, height: 32, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🔊</button>
              </div>
              {!feedback.ok && (
                <button className="btn" onClick={onNextCard}
                  style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 11, padding: "10px 32px", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}>
                  Další →
                  {wrongCountdown > 0 && <span style={{ background: "#2a3040", color: C.muted, borderRadius: "50%", width: 22, height: 22, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{wrongCountdown}</span>}
                </button>
              )}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
