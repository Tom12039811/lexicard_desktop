import React, { useState, useEffect } from "react";
import { C, STYLE } from "./constants.js";
import { fetchDict, playAudio, doSpeak, comboInfo, playSound } from "./utils.js";
import FlipSwipeCard from "./studyscreen.jsx";

function StudyScreen({ session, onAnswer, onExit }) {
  const [dictEntry, setDictEntry] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [flipFlash, setFlipFlash] = useState(null);

  const word = session.words[session.current];
  const progress = session.current + 1;
  const total = session.words.length;
  const direction = session.direction;

  // Fetch dictionary info
  useEffect(() => {
    const fetch = async () => {
      const en = direction === "en-cs" ? word.en : word.cs;
      const entry = await fetchDict(en);
      setDictEntry(entry);
    };
    fetch();
    setFlipped(false);
  }, [word, direction]);

  const handleAnswer = (quality) => {
    playSound(quality >= 3 ? "ok" : "bad");
    setFlipFlash(quality >= 3 ? "ok" : quality === 3 ? "warn" : "bad");
    setTimeout(() => {
      setFlipFlash(null);
      onAnswer(quality);
      setFlipped(false);
    }, 400);
  };

  const handleFlip = () => {
    setFlipped(true);
  };

  const handleSpeak = () => {
    const synth = window.speechSynthesis;
    if (direction === "en-cs") {
      doSpeak(synth, word.en, "en-US");
    }
  };

  const handleSpeakBack = () => {
    const synth = window.speechSynthesis;
    if (direction === "en-cs") {
      doSpeak(synth, word.cs, "cs-CZ");
    } else {
      doSpeak(synth, word.en, "en-US");
    }
  };

  const combo = comboInfo(session.combo);
  const allSyn = word.synonyms ? word.synonyms : null;

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora', Georgia, serif", color: C.text, display: "flex", flexDirection: "column", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "0.8rem 1rem" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button className="btn" onClick={onExit} style={{ color: C.muted, fontSize: 13, cursor: "pointer" }}>← Konec</button>
            <div style={{ fontSize: 12, color: C.muted }}>
              {progress} / {total}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ width: "100%", height: 4, background: "#1a1f2e", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: C.gold, width: `${(progress / total) * 100}%`, transition: "width .3s ease" }} />
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, fontSize: 11 }}>
            <div style={{ background: C.okBg, borderRadius: 7, padding: "5px", textAlign: "center" }}>
              <div style={{ color: C.ok, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Správně</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 700, color: C.ok }}>{session.stats.ok}</div>
            </div>
            <div style={{ background: C.errBg, borderRadius: 7, padding: "5px", textAlign: "center" }}>
              <div style={{ color: C.err, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Špatně</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 700, color: C.err }}>{session.stats.bad}</div>
            </div>
            <div style={{ background: "#1a1608", borderRadius: 7, padding: "5px", textAlign: "center" }}>
              <div style={{ color: C.gold, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>XP</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 700, color: C.gold }}>+{session.xpGained || 0}</div>
            </div>
            <div style={{ background: "#121a2e", borderRadius: 7, padding: "5px", textAlign: "center" }}>
              <div style={{ color: "#7090c8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Combo</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 700, color: combo?.color || "#5a6a70" }}>
                {combo ? combo.txt : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, maxWidth: 700, margin: "0 auto", width: "100%", padding: "2rem 1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FlipSwipeCard
          word={word}
          dir={direction}
          flipped={flipped}
          flipFlash={flipFlash}
          dictEntry={dictEntry}
          allSyn={allSyn}
          onFlip={handleFlip}
          onAnswer={handleAnswer}
          onSpeak={handleSpeak}
          onSpeakBack={handleSpeakBack}
        />
      </div>

      {/* Footer hint */}
      {!flipped && (
        <div style={{ padding: "1rem", textAlign: "center", color: C.mutedDark, fontSize: 11 }}>
          👆 Klikni na kartu pro překlad
        </div>
      )}
    </div>
  );
}

export default StudyScreen;
