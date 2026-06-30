import { useState, useRef, useEffect } from "react";
import { C, DECK_SORTS, STYLE } from "./constants.js";
import { sortDecks, dueCount, getLevel } from "./utils.js";
import { LangDropdown, UploadModal, FolderModal, ConfirmModal, MoveFolderModal, FolderStatsModal } from "./modals.jsx";
import { supabase } from "./supabase.js";

/* ── Profile Dropdown ─────────────────────────────────────────── */
function ProfileDropdown({ userEmail, username, onLogout, lightMode, onToggleLight }) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const displayName = username || (userEmail ? userEmail.split("@")[0] : "Profil");

  return (
    <>
      <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
        <button
          className="btn"
          onClick={() => setOpen(o => !o)}
          style={{
            padding: "0.4rem 0.7rem",
            borderRadius: 8,
            border: `1px solid ${open ? "var(--lc-selBorder)" : C.border}`,
            background: open ? "var(--lc-selBg)" : C.card,
            color: open ? C.gold : C.muted,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all .2s",
          }}
        >
          <span style={{ fontSize: 14 }}>👤</span>
          <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            background: "var(--lc-dropBg)", border: `1px solid var(--lc-modalBorder)`,
            borderRadius: 12, overflow: "hidden", minWidth: 210, zIndex: 50,
            boxShadow: `0 8px 28px var(--lc-shadow)`,
          }}>
            {/* Upravit profil */}
            <button
              className="btn"
              onClick={() => { setShowProfile(true); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.textDim, fontSize: 13, textAlign: "left" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--lc-dropHover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 15 }}>✏️</span> Upravit profil
            </button>

            <div style={{ borderTop: `1px solid ${C.border}` }} />

            {/* Theme toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
              <span style={{ fontSize: 15 }}>{lightMode ? "☀️" : "🌙"}</span>
              <span style={{ flex: 1, fontSize: 13, color: C.textDim, fontFamily: "'Lora',serif" }}>
                {lightMode ? "Svetly rezim" : "Tmavy rezim"}
              </span>
              <div
                onClick={onToggleLight}
                style={{
                  width: 46, height: 26, borderRadius: 13, flexShrink: 0,
                  background: lightMode ? "var(--lc-ok)" : "var(--lc-mutedDark)",
                  position: "relative", cursor: "pointer", transition: "background .25s",
                }}
              >
                <div style={{
                  position: "absolute", top: 3, left: lightMode ? 23 : 3,
                  width: 20, height: 20, borderRadius: "50%", background: "white",
                  transition: "left .25s", boxShadow: "0 1px 4px rgba(0,0,0,.4)",
                }} />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}` }} />

            {/* Odhlasit */}
            <button
              className="btn"
              onClick={() => { onLogout(); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: C.err, fontSize: 13, textAlign: "left" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--lc-errBg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 15 }}>🚪</span> Odhlasit se
            </button>
          </div>
        )}
      </div>

      {showProfile && (
        <ProfileModal
          userEmail={userEmail}
          username={username}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}

/* ── Profile Modal ────────────────────────────────────────────── */
function ProfileModal({ userEmail, username, onClose }) {
  const [newUsername, setNewUsername] = useState(username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState("username"); // "username" | "password"

  async function handleSaveUsername() {
    if (!newUsername.trim()) { setError("Uzivatelske jmeno nemuze byt prazdne."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const { error } = await supabase.auth.updateUser({ data: { username: newUsername.trim() } });
      if (error) throw error;
      setSuccess("Uzivatelske jmeno bylo zmeneno.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePassword() {
    if (!currentPassword) { setError("Zadej soucasne heslo."); return; }
    if (newPassword.length < 6) { setError("Nove heslo musi mit alespon 6 znaku."); return; }
    if (newPassword !== confirmPassword) { setError("Hesla se neshoduji."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      // Re-authenticate first
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPassword });
      if (signInError) { setError("Soucasne heslo je nespravne."); setLoading(false); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSuccess("Heslo bylo uspesne zmeneno.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const inp = {
    width: "100%", padding: "0.65rem 1rem", borderRadius: 10,
    border: "1px solid var(--lc-cardSubBorder)", background: "var(--lc-cardAlt)",
    color: "var(--lc-text)", fontSize: 14, fontFamily: "system-ui, sans-serif",
    boxSizing: "border-box", outline: "none",
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: C.gold }}>Upravit profil</div>
          <button className="btn" onClick={onClose} style={{ color: C.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Email info */}
        <div style={{ fontSize: 12, color: "var(--lc-textDim)", marginBottom: "1rem", padding: "0.5rem 0.8rem", background: "var(--lc-cardAlt)", borderRadius: 8 }}>
          📧 {userEmail}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: "var(--lc-cardAlt)", borderRadius: 10, padding: 4, marginBottom: "1.25rem", gap: 4 }}>
          {[["username", "Jmeno"], ["password", "Heslo"]].map(([id, label]) => (
            <button key={id} className="btn" onClick={() => { setTab(id); setError(""); setSuccess(""); }}
              style={{ flex: 1, padding: "0.45rem", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: tab === id ? C.gold : "transparent",
                color: tab === id ? "#fff" : "var(--lc-textDim)", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "username" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input style={inp} placeholder="Uzivatelske jmeno" value={newUsername} onChange={e => setNewUsername(e.target.value)} autoComplete="username" />
            {error && <div style={{ padding: "0.5rem 0.8rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>}
            {success && <div style={{ padding: "0.5rem 0.8rem", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#4ade80", fontSize: 13 }}>{success}</div>}
            <button className="btn" onClick={handleSaveUsername} disabled={loading}
              style={{ padding: "0.75rem", borderRadius: 12, background: C.gold, color: "#fff", fontWeight: 700, fontSize: 14, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Ukladam…" : "Ulozit jmeno"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input style={inp} type="password" placeholder="Soucasne heslo" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            <input style={inp} type="password" placeholder="Nove heslo (min. 6 znaku)" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
            <input style={inp} type="password" placeholder="Zopakuj nove heslo" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            {error && <div style={{ padding: "0.5rem 0.8rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>}
            {success && <div style={{ padding: "0.5rem 0.8rem", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#4ade80", fontSize: 13 }}>{success}</div>}
            <button className="btn" onClick={handleSavePassword} disabled={loading}
              style={{ padding: "0.75rem", borderRadius: 12, background: C.gold, color: "#fff", fontWeight: 700, fontSize: 14, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Ukladam…" : "Zmenit heslo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── HomeScreen ───────────────────────────────────────────────── */
export default function HomeScreen({
  decks, langs, activeLang, gameStats, folders,
  onLangSwitch, onAddLang, onEditLang, onDeleteLang,
  onSelect, onFileUpload, onSampleDeck,
  onAddFolder, onRenameFolder, onDeleteFolder, onMoveDeck,
  onFolderStudy, onLogout, userEmail, username,
  onLibrary, onLeaderboard,
  lightMode, onToggleLight,
  newlyDownloaded = new Set(),
  onClearNewlyDownloaded,
}) {
  const [sort, setSort] = useState("date-desc");
  const [showUpload, setShowUpload] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [editFolder, setEditFolder] = useState(null);
  const [delFolder, setDelFolder] = useState(null);
  const [moveInfo, setMoveInfo] = useState(null);
  const [openFolders, setOpenFolders] = useState({});
  const [folderStats, setFolderStats] = useState(null);

  // highlight nově stažených balíčků se čistí v App.jsx při odchodu z LibraryScreen

  const ld = sortDecks(decks.filter(d => d.lang === activeLang), sort);
  const lc = langs.find(l => l.id === activeLang) || langs[0];
  const lvl = getLevel(gameStats.xp ?? 0);
  const streak = gameStats.dailyStreak ?? 0;
  const langFolders = folders.filter(f => f.lang === activeLang);
  const decksInFolder = fid => ld.filter(d => d.folderId === fid);
  const looseDecks = ld.filter(d => !d.folderId || !langFolders.find(f => f.id === d.folderId));

  function DeckCard({ d }) {
    const mastered = d.words.filter(w => (w.score ?? 0) >= 3).length;
    const pct = d.words.length ? Math.round(mastered / d.words.length * 100) : 0;
    const due = dueCount(d.words);
    const sr = d.deckStats?.totalAnswers ? Math.round(d.deckStats.correctAnswers / d.deckStats.totalAnswers * 100) : null;
    const isNew = newlyDownloaded.has(d.id);
    const nameLen = d.name?.length ?? 0;
    const nameFontSize = nameLen > 34 ? 11 : nameLen > 26 ? 12 : nameLen > 20 ? 13.5 : 16;
    return (
      <div style={{ position: "relative" }}>
        <div onClick={() => onSelect(d.id)} className="btn"
          style={{
            background: C.card,
            border: `1px solid ${isNew ? "#4a90d9" : C.border}`,
            borderRadius: 16,
            padding: "1.2rem",
            cursor: "pointer",
            transition: "border-color .2s, box-shadow .2s",
            textAlign: "left",
            width: "100%",
            ...(isNew ? { boxShadow: "0 0 0 3px rgba(74,144,217,0.25), 0 0 16px rgba(74,144,217,0.15)" } : {}),
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--lc-selBorder)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = isNew ? "#4a90d9" : C.border; }}>
          {due > 0 && <div style={{ position: "absolute", top: 10, right: 34, background: "var(--lc-dueBg)", border: "1px solid var(--lc-dueBorder)", borderRadius: 20, padding: "2px 7px", fontSize: 10, color: "var(--lc-dueText)", fontWeight: 600 }}>{due} dnes</div>}
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4, lineHeight: 1.2, paddingRight: 42, display: "flex", alignItems: "center", gap: 5 }}>
            {d.fromLibrary && <span title="Stazeno z knihovny" style={{ fontSize: 12, flexShrink: 0 }}>📚</span>}
            <span style={{ fontSize: nameFontSize, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{d.words.length} slov · {mastered} zvl.{sr !== null ? ` · ${sr}%` : ""}</div>
          <div style={{ background: "#161e30", borderRadius: 3, height: 3 }}><div style={{ width: `${pct}%`, height: "100%", background: C.gold, borderRadius: 3 }} /></div>
          <div style={{ fontSize: 10, color: C.goldDim, marginTop: 4, textAlign: "right" }}>{pct}% zvladnuto</div>
        </div>
        <button className="btn" onClick={e => { e.stopPropagation(); setMoveInfo({ deck: d }); }} title="Presunout do slozky"
          style={{ position: "absolute", top: 8, right: 6, color: C.mutedDark, fontSize: 13, padding: "3px 5px", lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = C.gold}
          onMouseLeave={e => e.currentTarget.style.color = C.mutedDark}>📁</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Lora',Georgia,serif", color: C.text, display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 1rem", overscrollBehavior: "none" }}>
      <style>{STYLE}</style>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUpload={onFileUpload} />}
      {showAddFolder && <FolderModal title="Nova slozka" onClose={() => setShowAddFolder(false)} onSave={name => { onAddFolder(name); setShowAddFolder(false); }} />}
      {editFolder && <FolderModal title="Prejmenovat slozku" initial={editFolder} onClose={() => setEditFolder(null)} onSave={name => { onRenameFolder(editFolder.id, name); setEditFolder(null); }} />}
      {delFolder && <ConfirmModal title="Smazat slozku?" msg="Balicky ve slozce budou presunuty na hlavni stranku." label="Smazat slozku" onConfirm={() => { onDeleteFolder(delFolder.id); }} onClose={() => setDelFolder(null)} />}
      {moveInfo && <MoveFolderModal deck={moveInfo.deck} folders={langFolders} currentFolderId={moveInfo.deck.folderId} onClose={() => setMoveInfo(null)} onMove={fid => onMoveDeck(moveInfo.deck.id, fid)} />}
      {folderStats && <FolderStatsModal folder={folderStats} decks={decks} onClose={() => setFolderStats(null)} />}

      {/* ── Header ── */}
      <div style={{ width: "100%", maxWidth: 780, display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 36, fontWeight: 700, color: C.gold, letterSpacing: "-1px" }}>LexiCard</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontStyle: "italic" }}>{lc?.label}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LangDropdown langs={langs} activeId={activeLang} onSwitch={onLangSwitch} onAddLang={onAddLang} onEditLang={onEditLang} onDeleteLang={onDeleteLang} />
          {onLogout && (
            <ProfileDropdown
              userEmail={userEmail}
              username={username}
              onLogout={onLogout}
              lightMode={lightMode}
              onToggleLight={onToggleLight}
            />
          )}
        </div>
      </div>

      {/* ── XP & streak bar ── */}
      <div style={{ width: "100%", maxWidth: 780, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 16px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flexShrink: 0, textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: C.gold }}>Lv.{lvl.level}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{lvl.name}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 4 }}>
            <span>{gameStats.xp ?? 0} XP</span><span>{lvl.next} XP</span>
          </div>
          <div style={{ background: "var(--lc-xpTrack)", borderRadius: 4, height: 6 }}>
            <div style={{ width: `${lvl.pct}%`, height: "100%", background: "linear-gradient(90deg,#d4a853,#f0c060)", borderRadius: 4, transition: "width .5s" }} />
          </div>
        </div>
        {streak > 0 && (
          <div style={{ flexShrink: 0, background: "var(--lc-streakBg)", border: "1px solid var(--lc-streakBorder)", borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16 }}>🔥</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: C.gold }}>{streak}</div>
            <div style={{ fontSize: 9, color: C.muted }}>dni</div>
          </div>
        )}
        {/* Leaderboard icon — right edge of XP bar */}
        {onLeaderboard && (
          <button
            className="btn"
            onClick={onLeaderboard}
            title="Zebricek"
            style={{
              flexShrink: 0,
              width: 38, height: 38,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--lc-cardAlt)",
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              fontSize: 18,
              cursor: "pointer",
              transition: "all .2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = "var(--lc-selBg)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "var(--lc-cardAlt)"; }}
          >
            🏆
          </button>
        )}
      </div>

      {/* ── Actions row: Pridat balicek + Knihovna ── */}
      <div style={{ width: "100%", maxWidth: 780, display: "flex", gap: 8, marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setShowUpload(true)}
          style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 10, background: "var(--lc-btnAddBg)", border: `1.5px dashed var(--lc-btnAddBorder)`, borderRadius: 14, padding: "11px 14px", cursor: "pointer", transition: "all .2s", textAlign: "left" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = "rgba(212,168,83,.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--lc-btnAddBorder)"; e.currentTarget.style.background = "var(--lc-btnAddBg)"; }}>
          <div style={{ width: 30, height: 30, background: "var(--lc-cardAlt)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📊</div>
          <div style={{ fontSize: 13, color: C.gold, fontFamily: "'Playfair Display',serif", fontWeight: 700 }}>Pridat balicek</div>
          <div style={{ marginLeft: "auto", fontSize: 18, color: "var(--lc-btnAddBorder)" }}>+</div>
        </button>

        {onLibrary && (
          <button className="btn" onClick={onLibrary}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--lc-btnAddBg)", border: `1px solid #2a3650`, borderRadius: 14, padding: "11px 14px", cursor: "pointer", transition: "all .2s", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = "rgba(212,168,83,.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--lc-btnAddBorder)"; e.currentTarget.style.background = "var(--lc-btnAddBg)"; }}>
            <span style={{ fontSize: 18 }}>📚</span>
            <span style={{ fontSize: 13, color: C.textDim }}>Knihovna</span>
          </button>
        )}
      </div>

      {/* ── Nova slozka — pod actions row, zarovnana vpravo ── */}
      <div style={{ width: "100%", maxWidth: 780, display: "flex", justifyContent: "flex-end", marginBottom: "0.9rem" }}>
        <button
          className="btn"
          onClick={() => setShowAddFolder(true)}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "var(--lc-btnAddBg)", border: `1px solid #2a3650`,
            borderRadius: 10, padding: "5px 14px 5px 10px",
            cursor: "pointer", transition: "all .2s", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = "rgba(212,168,83,.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a3650"; e.currentTarget.style.background = "var(--lc-btnAddBg)"; }}
        >
          <span style={{ fontSize: 16, filter: "sepia(1) saturate(3) hue-rotate(5deg) brightness(0.75)" }}>📁</span>
          <span style={{ fontSize: 12, color: C.textDim }}>Nova slozka</span>
        </button>
      </div>

      {/* ── Sort ── */}
      <div style={{ width: "100%", maxWidth: 780, display: "flex", alignItems: "center", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, flexShrink: 0 }}>Radit:</span>
        {DECK_SORTS.map(s => (
          <button key={s.id} className="btn" onClick={() => setSort(s.id)}
            style={{ background: sort === s.id ? "var(--lc-selBg)" : "transparent", border: `1px solid ${sort === s.id ? "var(--lc-selBorder)" : C.border}`, color: sort === s.id ? C.gold : C.muted, borderRadius: 8, padding: "4px 11px", fontSize: 11, cursor: "pointer" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Decks + folders ── */}
      <div style={{ width: "100%", maxWidth: 780, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {ld.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: C.muted, fontSize: 14, fontStyle: "italic" }}>
            Zadne balicky pro {lc?.label}
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={onSampleDeck} style={{ background: "var(--lc-cardAlt)", border: `1px solid #2a3650`, color: "var(--lc-muted)", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer" }}>🎓 Nacist ukazkovy balicek</button>
            </div>
          </div>
        ) : (
          <>
            {langFolders.map(f => {
              const fDecks = decksInFolder(f.id);
              const isOpen = openFolders[f.id] !== false;
              return (
                <div key={f.id} style={{ background: "var(--lc-folderBg)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", userSelect: "none" }}
                    onClick={() => setOpenFolders(o => ({ ...o, [f.id]: !isOpen }))}>
                    <span style={{ fontSize: 16 }}>{isOpen ? "📂" : "📁"}</span>
                    <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 600, color: C.text, flex: 1 }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{fDecks.length} bal.</span>
                    {fDecks.length > 0 && (
                      <button className="btn" onClick={e => { e.stopPropagation(); onFolderStudy(f.id); }} title="Uceni ze slozky"
                        style={{ background: "var(--lc-selBg)", border: `1px solid var(--lc-selBorder)`, color: C.gold, borderRadius: 7, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.gold; e.currentTarget.style.color = C.bg; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "var(--lc-selBg)"; e.currentTarget.style.color = C.gold; }}>
                        ▶ Uceni
                      </button>
                    )}
                    <button className="btn" onClick={e => { e.stopPropagation(); setFolderStats(f); }} title="Statistiky slozky"
                      style={{ border: `1px solid var(--lc-statBg1)`, color: "#7090c8", borderRadius: 7, padding: "3px 9px", fontSize: 11, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#7090c8"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--lc-statBg1)"}>
                      📊
                    </button>
                    <button className="btn" onClick={e => { e.stopPropagation(); setEditFolder(f); }} style={{ color: C.mutedDark, fontSize: 13, padding: "2px 5px" }} onMouseEnter={e => e.currentTarget.style.color = C.gold} onMouseLeave={e => e.currentTarget.style.color = C.mutedDark}>✏️</button>
                    <button className="btn" onClick={e => { e.stopPropagation(); setDelFolder(f); }} style={{ color: C.mutedDark, fontSize: 14, padding: "2px 5px" }} onMouseEnter={e => e.currentTarget.style.color = C.err} onMouseLeave={e => e.currentTarget.style.color = C.mutedDark}>×</button>
                    <span style={{ fontSize: 11, color: C.muted }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div className="deck-grid" style={{ padding: "0 10px 10px" }}>
                      {fDecks.length === 0
                        ? <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: "8px 4px", gridColumn: "1/-1" }}>Slozka je prazdna — presun sem balicek pomoci 📁</div>
                        : fDecks.map(d => <DeckCard key={d.id} d={d} />)}
                    </div>
                  )}
                </div>
              );
            })}
            {looseDecks.length > 0 && (
              <div>
                {langFolders.length > 0 && <div style={{ fontSize: 10, color: C.mutedDark, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Bez slozky</div>}
                <div className="deck-grid">
                  {looseDecks.map(d => <DeckCard key={d.id} d={d} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
