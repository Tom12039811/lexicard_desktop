/* ══════════════════════════════════════════════════════════════
   App.jsx — LexiCard: přihlášení, motiv, navigace mezi obrazovkami
   Data:            useAppData.js
   Synchronizace:   useSync.js
   Učení:           useStudySession.js
══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react";
import HomeScreen from "./HomeScreen.jsx";
import DeckScreen from "./DeckScreen.jsx";
import StudyScreen, { RoundEnd, DailyDoneScreen } from "./StudyScreen.jsx";
import { OnboardingModal, EnVoiceWarningModal } from "./modals.jsx";
import AuthScreen from "./AuthScreen.jsx";
import LibraryScreen from "./LibraryScreen.jsx";
import LeaderboardScreen from "./LeaderboardScreen.jsx";
import { supabase } from "./supabase.js";
import { useAppData } from "./useAppData.js";
import { useSync } from "./useSync.js";
import { useStudySession } from "./useStudySession.js";

export default function LexiCard() {
  /* ── přihlášení ── */
  const [session, setSession] = useState(undefined); // undefined = načítá se, null = nepřihlášen
  const [recoveryMode, setRecoveryMode] = useState(false); // příchod z odkazu pro obnovu hesla

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(session ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  /* ── světlý / tmavý motiv ── */
  const [lightMode, setLightMode] = useState(() => localStorage.getItem("lc_lightMode") === "1");
  function toggleLight() {
    setLightMode(v => {
      const next = !v;
      localStorage.setItem("lc_lightMode", next ? "1" : "0");
      document.documentElement.setAttribute("data-theme", next ? "light" : "dark");
      return next;
    });
  }
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", lightMode ? "light" : "dark");
  }, []); // eslint-disable-line

  /* ── navigace ── */
  const [screen, setScreen] = useState("home");
  const [deckId, setDeckId] = useState(null);
  const [newlyDownloaded, setNewlyDownloaded] = useState(new Set());

  /* ── data, synchronizace, učení ── */
  const data = useAppData();
  const { decks, setDecks, folders, setFolders, langs, activeLang, loaded, gameStats, setGameStats } = data;
  const deck = decks.find(d => d.id === deckId) ?? null;

  const sync = useSync({ session, loaded, decks, folders, gameStats, setDecks, setFolders, setGameStats });
  const st = useStudySession({ decks, setDecks, deck, deckId, setDeckId, screen, setScreen, gameStats, setGameStats });

  const openDeck = d => { setDeckId(d.id); setScreen("deck"); };
  const studyName = st.studyFolderId ? (folders.find(f => f.id === st.studyFolderId)?.name ?? "Složka") : (deck?.name ?? "");
  const backFromStudy = () => setScreen(st.studyFolderId ? "home" : "deck");

  /* ── načítání ── */
  if (!loaded) return (
    <div style={{ minHeight: "100dvh", background: "var(--lc-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid var(--lc-inputBorder)", borderTopColor: "var(--lc-gold)", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
    </div>
  );

  /* ── přihlášení ── */
  if (session === undefined) return (
    <div style={{ minHeight: "100dvh", background: "var(--lc-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--lc-textDim)", fontSize: 14 }}>Načítám…</div>
    </div>
  );
  if (session === null) return <AuthScreen />;
  if (recoveryMode) return <AuthScreen recoveryMode onRecoveryDone={() => setRecoveryMode(false)} />;

  /* ── lišta úplné synchronizace ── */
  const SyncBanner = sync.syncStatus ? (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      background: "var(--lc-surface)", border: "1px solid var(--lc-border)",
      borderRadius: 10, padding: "8px 18px", fontSize: 13,
      color: "var(--lc-textDim)", zIndex: 9999, pointerEvents: "none",
      boxShadow: "0 2px 12px rgba(0,0,0,.15)"
    }}>
      ⟳ {sync.syncStatus}
    </div>
  ) : null;

  /* ── obrazovky ── */
  if (screen === "home") {
    const saved = st.restoreSession(decks);
    return (
      <>
        {data.showOnboarding && (
          <OnboardingModal
            onSample={() => { openDeck(data.createSampleDeck()); data.setShowOnboarding(false); }}
            onUpload={f => { data.importFile(f, openDeck); data.setShowOnboarding(false); }}
            onClose={() => data.setShowOnboarding(false)}
          />
        )}
        {data.showEnVoiceWarning && (
          <EnVoiceWarningModal onClose={() => {
            data.setShowEnVoiceWarning(false);
            try { localStorage.setItem("lc6_enVoiceWarned", "1"); } catch { /* úložiště nedostupné */ }
          }} />
        )}
        <HomeScreen
          decks={decks} langs={langs} activeLang={activeLang} gameStats={gameStats} folders={folders}
          onLangSwitch={data.setLang} onAddLang={data.addLang} onEditLang={data.editLang} onDeleteLang={data.deleteLang}
          onSelect={id => { setDeckId(id); setScreen("deck"); setNewlyDownloaded(prev => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; }); }}
          onFileUpload={f => data.importFile(f, openDeck)} onSampleDeck={() => openDeck(data.createSampleDeck())}
          onAddFolder={data.addFolder} onRenameFolder={data.renameFolder} onDeleteFolder={data.deleteFolder} onMoveDeck={data.moveDeck}
          onFolderStudy={fid => {
            if (saved && saved.folderId === fid) st.resumeStudy(decks); else st.startFolderStudy(fid);
          }}
          onFolderProblems={fid => st.startProblemStudy(fid)}
          savedFolderId={saved?.folderId ?? null}
          onLogout={() => supabase.auth.signOut()}
          syncInfo={sync.syncInfo}
          onSyncNow={() => sync.triggerSync({ full: true })}
          getPendingCount={sync.getPendingCount}
          userEmail={session?.user?.email}
          username={session?.user?.user_metadata?.username}
          onLibrary={() => setScreen("library")}
          onLeaderboard={() => setScreen("leaderboard")}
          lightMode={lightMode} onToggleLight={toggleLight}
          newlyDownloaded={newlyDownloaded}
        />
        {SyncBanner}
      </>
    );
  }

  if (screen === "library") return (
    <LibraryScreen
      activeLang={activeLang}
      localDecks={decks}
      onBack={() => setScreen("home")}
      onDownload={newDeck => {
        data.addLibraryDeck(newDeck);
        setNewlyDownloaded(prev => new Set([...prev, newDeck.id]));
        // zůstáváme v knihovně — navigace záměrně chybí
      }}
    />
  );

  if (screen === "leaderboard") return (
    <LeaderboardScreen currentUserId={session?.user?.id} onBack={() => setScreen("home")} />
  );

  if (screen === "deck" && deck) {
    const lc = langs.find(l => l.id === deck.lang) || langs[0];
    const savedSess = st.restoreSession(decks);
    const hasSavedSession = !!(savedSess && !savedSess.folderId && savedSess.deckId === deck.id);
    return (
      <DeckScreen
        deck={deck} langCfg={lc} hasSavedSession={hasSavedSession}
        onBack={() => setScreen("home")} onStart={st.startStudy} onResume={() => st.resumeStudy(decks)}
        onUpdate={(wid, field, val) => data.updWord(deckId, wid, field, val)}
        onAddWord={w => data.addWord(deckId, w)}
        onDeleteWord={wid => data.delWord(deckId, wid)}
        onEditWord={st.editWordInDecks}
        onDeleteDeck={() => { data.delDeck(deckId); setScreen("home"); }}
        onRename={name => data.renameDeck(deckId, name)}
        onResetStats={() => data.resetStats(deckId)}
        onExport={() => data.exportDeck(deck)}
        onStartProblems={() => st.startProblemStudy()}
      />
    );
  }

  if (screen === "roundEnd") {
    // trénink chyb: když už žádná problémová slova nezbývají, „Další kolo“ nahradí „Hotovo“
    const noProblemsLeft = st.studyKind === "problems" && st.problemWords(st.studyFolderId).length === 0;
    return (
      <RoundEnd
        stats={st.rStats} total={st.rWords.length} deckName={studyName}
        xpEarned={st.roundEndData?.xpEarned ?? 0} newLevel={st.roundEndData?.newLevel}
        streak={st.roundEndData?.streak}
        onNext={noProblemsLeft ? backFromStudy : st.nextRound} onBack={backFromStudy}
        nextLabel={noProblemsLeft ? "Hotovo ✓" : st.studyKind === "problems" ? "Další kolo chyb →" : undefined}
        note={noProblemsLeft ? "🎉 Žádná další problémová slova" : null}
      />
    );
  }

  if (screen === "dailyDone") return (
    <DailyDoneScreen stats={st.rStats} deckName={studyName} onEnd={backFromStudy} onContinue={st.continueAfterDailyDone} />
  );

  /* ── učení ── */
  return (
    <StudyScreen
      deck={deck} langs={langs}
      rWords={st.rWords} rIdx={st.rIdx} rStats={st.rStats} combo={st.combo}
      feedback={st.feedback} flipFlash={st.flipFlash} flipped={st.flipped}
      listenOn={st.listenOn} tx={st.tx} micSt={st.micSt} micErr={st.micErr}
      iMode={st.iMode} typed={st.typed} autoPlay={st.autoPlay} playSounds={st.playSounds}
      pronAtt={st.pronAtt} evalLoading={st.evalLoading}
      wrongCountdown={st.wrongCountdown} dictEntry={st.dictEntry}
      mode={st.mode} translDir={st.translDir} flipDir={st.flipDir}
      folderName={st.studyFolderId ? studyName : null}
      isProblemMode={st.studyKind === "problems"}
      onSetMode={m => { st.setMode(m); st.clearCard(); }}
      onSetTranslDir={v => { st.setTranslDir(v); st.clearCard(); }}
      onSetFlipDir={v => { st.setFlipDir(v); st.clearCard(); }}
      onSetIMode={m => { st.setIMode(m); st.setMicErr(""); st.setTx(""); }}
      onSetTyped={st.setTyped}
      onSetAutoPlay={st.setAutoPlay}
      onSetPlaySounds={st.setPlaySounds}
      onFlip={st.flipCard}
      onFlipAnswer={st.flipAnswer}
      onStartListen={st.startListen}
      onStopListen={st.stopListen}
      onSubmitTyped={st.submitTyped}
      onDontKnow={st.dontKnow}
      onNextCard={st.nextCard}
      onBack={backFromStudy}
      onSpeak={st.speakWord}
      onEditWord={st.editWordInDecks}
    />
  );
}
