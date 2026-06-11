/* ══════════════════════════════════════════════════════════════
   LeaderboardScreen.jsx — Žebříček top uživatelů podle XP
══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import { C, STYLE } from "./constants.js";
import { getLevel } from "./utils.js";
import { supabase } from "./supabase.js";

export default function LeaderboardScreen({ onBack, currentUserId, lightMode }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  /* ── Sleduj online/offline stav ── */
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    // Joinuj profiles + user_stats, seřaď podle XP
    supabase
      .from("user_stats")
      .select("user_id, xp, level, streak, profiles(username)")
      .order("xp", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) { setError("Nepodařilo se načíst žebříček."); }
        else {
          setEntries(
            (data ?? [])
              .filter(r => r.profiles?.username)   // skryj uživatele bez username
              .map((r, i) => ({
                rank:     i + 1,
                userId:   r.user_id,
                username: r.profiles.username,
                xp:       r.xp    ?? 0,
                level:    r.level ?? 1,
                streak:   r.streak ?? 0,
              }))
          );
        }
        setLoading(false);
      });
  }, [isOnline]);

  /* ── medailové barvy pro top 3 ── */
  function medalColor(rank) {
    if (rank === 1) return "#f0c060";   // zlato
    if (rank === 2) return "#b0b8c8";   // stříbro
    if (rank === 3) return "#c8905a";   // bronz
    return C.mutedDark;
  }

  function medalEmoji(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  }

  /* ── pozice přihlášeného uživatele ── */
  const myEntry = entries.find(e => e.userId === currentUserId);

  return (
    <div className={lightMode ? "lc-light" : ""} style={{ minHeight: "100dvh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 1rem 3rem" }}>
      <style>{STYLE}</style>

      {/* header */}
      <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
        <button className="btn" onClick={onBack}
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.gold}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
          ← Zpět
        </button>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: C.gold }}>🏆 Žebříček</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Top 50 uživatelů podle XP</div>
        </div>
      </div>

      {/* offline */}
      {!isOnline && (
        <div style={{ width: "100%", maxWidth: 600, background: "var(--lc-errBg)", border: `1px solid var(--lc-errBorder)`, borderRadius: 12, padding: "14px 18px", color: "var(--lc-err)", fontSize: 14 }}>
          📡 Žebříček je dostupný pouze při připojení k internetu.
        </div>
      )}

      {/* loading */}
      {loading && (
        <div style={{ marginTop: "4rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 32, height: 32, border: `3px solid var(--lc-inputBorder)`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <div style={{ color: C.muted, fontSize: 13 }}>Načítám žebříček…</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ color: "var(--lc-err)", fontSize: 14, marginTop: "2rem" }}>{error}</div>
      )}

      {!loading && !error && isOnline && entries.length === 0 && (
        <div style={{ color: C.muted, fontSize: 14, fontStyle: "italic", marginTop: "3rem" }}>
          Zatím žádní uživatelé v žebříčku.
        </div>
      )}

      {/* moje pozice (pokud není v top 50 viditelná) */}
      {!loading && myEntry && myEntry.rank > 10 && (
        <div style={{ width: "100%", maxWidth: 600, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Tvoje pozice</div>
          <EntryRow entry={myEntry} isMe={true} medalColor={medalColor} medalEmoji={medalEmoji} />
        </div>
      )}

      {/* seznam */}
      {!loading && !error && entries.length > 0 && (
        <div style={{ width: "100%", maxWidth: 600, display: "flex", flexDirection: "column", gap: 6 }}>
          {entries.map(entry => (
            <EntryRow
              key={entry.userId}
              entry={entry}
              isMe={entry.userId === currentUserId}
              medalColor={medalColor}
              medalEmoji={medalEmoji}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, isMe, medalColor, medalEmoji }) {
  const lvl    = getLevel(entry.xp);
  const medal  = medalEmoji(entry.rank);
  const isTop3 = entry.rank <= 3;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: isMe ? "var(--lc-selBg)" : "var(--lc-card)",
      border: `1px solid ${isMe ? "var(--lc-selBorder)" : "var(--lc-border)"}`,
      borderRadius: 12, padding: "10px 14px",
      transition: "border-color .2s",
    }}>
      {/* rank */}
      <div style={{ width: 32, textAlign: "center", flexShrink: 0 }}>
        {medal
          ? <span style={{ fontSize: 20 }}>{medal}</span>
          : <span style={{ fontSize: 13, fontWeight: 700, color: medalColor(entry.rank) }}>#{entry.rank}</span>
        }
      </div>

      {/* avatar placeholder */}
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: isTop3 ? `${medalColor(entry.rank)}22` : "var(--lc-cardAlt)",
        border: `2px solid ${isTop3 ? medalColor(entry.rank) : "var(--lc-border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 700,
        color: isTop3 ? medalColor(entry.rank) : "var(--lc-textDim)",
      }}>
        {entry.username[0].toUpperCase()}
      </div>

      {/* username + level */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: isMe ? 700 : 600, color: isMe ? "var(--lc-gold)" : "var(--lc-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.username}{isMe && " (ty)"}
        </div>
        <div style={{ fontSize: 11, color: "var(--lc-muted)", marginTop: 1 }}>
          Lv.{entry.level} · {lvl.name}
        </div>
      </div>

      {/* streak */}
      {entry.streak > 0 && (
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 14 }}>🔥</div>
          <div style={{ fontSize: 10, color: "var(--lc-gold)", fontWeight: 700 }}>{entry.streak}</div>
        </div>
      )}

      {/* XP */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: isTop3 ? medalColor(entry.rank) : "var(--lc-gold)", fontFamily: "'Playfair Display',serif" }}>
          {entry.xp.toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: "var(--lc-muted)" }}>XP</div>
      </div>
    </div>
  );
}
