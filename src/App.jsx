import React, { useState, useEffect } from "react";
import { C, DEFAULT_LANGS, STYLE } from "./constants.js";
import { uid, now, sortDecks, vmPickRound, checkStreak, calcXP, getLevel, doSpeak, playAudio, fetchDict, vmUpdate, comboInfo, playSound } from "./utils.js";
import HomeScreen from "./homescreen.jsx";
import DeckScreen from "./deckscreen.jsx";
import StudyScreenRenderer from "./StudyScreenRenderer.jsx";
import { RoundEnd } from "./studyscreen.jsx";

const STORAGE_KEY = "lexicard_data";

function App() {
  const [screen, setScreen] = useState("home"); // home | deck | study
  const [decks, setDecks] = useState([]);
  const [currentDeck, setCurrentDeck] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [globalStats, setGlobalStats] = useState({ xp: 0, level: 1, dailyStreak: 0, lastStudyDate: null });
  const [langCfg, setLangCfg] = useState(DEFAULT_LANGS[0]);

  // Load data from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setDecks(data.decks || []);
        setGlobalStats(data.globalStats || { xp: 0, level: 1, dailyStreak: 0, lastStudyDate: null });
        setLangCfg(data.langCfg || DEFAULT_LANGS[0]);
      }
    } catch (e) {
      console.error("Load error:", e);
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ decks, globalStats, langCfg }));
  }, [decks, globalStats, langCfg]);

  // ─── DECK OPERATIONS ───
  const createDeck = (name) => {
    const newDeck = {
      id: uid(),
      name,
      words: [],
      createdAt: now(),
      deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 }
    };
    setDecks([...decks, newDeck]);
  };

  const updateDeck = (deckId, field, value) => {
    setDecks(decks.map(d => d.id === deckId ? { ...d, [field]: value } : d));
  };

  const deleteDeck = (deckId) => {
    setDecks(decks.filter(d => d.id !== deckId));
    if (currentDeck?.id === deckId) {
      setCurrentDeck(null);
      setScreen("home");
    }
  };

  const renameDeck = (deckId, newName) => {
    setDecks(decks.map(d => d.id === deckId ? { ...d, name: newName } : d));
  };

  // ─── WORD OPERATIONS ───
  const addWord = (deckId, word) => {
    setDecks(decks.map(d => d.id === deckId ? { ...d, words: [...d.words, word] } : d));
    if (currentDeck?.id === deckId) {
      setCurrentDeck({ ...currentDeck, words: [...currentDeck.words, word] });
    }
  };

  const updateWord = (deckId, wordId, field, value) => {
    setDecks(decks.map(d => d.id === deckId ? { ...d, words: d.words.map(w => w.id === wordId ? { ...w, [field]: value } : w) } : d));
    if (currentDeck?.id === deckId) {
      setCurrentDeck({ ...currentDeck, words: currentDeck.words.map(w => w.id === wordId ? { ...w, [field]: value } : w) });
    }
  };

  const deleteWord = (deckId, wordId) => {
    setDecks(decks.map(d => d.id === deckId ? { ...d, words: d.words.filter(w => w.id !== wordId) } : d));
    if (currentDeck?.id === deckId) {
      setCurrentDeck({ ...currentDeck, words: currentDeck.words.filter(w => w.id !== wordId) });
    }
  };

  // ─── STUDY SESSION ───
  const startSession = (deck) => {
    const words = vmPickRound(deck.words, 20);
    const newSession = {
      deckId: deck.id,
      words,
      current: 0,
      stats: { ok: 0, bad: 0 },
      combo: 0,
      direction: Math.random() > 0.5 ? "en-cs" : "cs-en",
      xpGained: 0
    };
    setCurrentSession(newSession);
    setScreen("study");
  };

  const answerWord = (quality) => {
    if (!currentSession) return;

    const word = currentSession.words[currentSession.current];
    const isCorrect = quality >= 3;
    const xpEarned = calcXP(quality, currentSession.combo);

    const updatedSession = {
      ...currentSession,
      stats: {
        ok: currentSession.stats.ok + (isCorrect ? 1 : 0),
        bad: currentSession.stats.bad + (isCorrect ? 0 : 1)
      },
      combo: isCorrect ? currentSession.combo + 1 : 0,
      xpGained: currentSession.xpGained + xpEarned,
      words: currentSession.words.map((w, i) => i === currentSession.current ? { ...w, ...vmUpdate(w, quality) } : w),
      current: currentSession.current + 1
    };

    if (updatedSession.current < updatedSession.words.length) {
      setCurrentSession(updatedSession);
    } else {
      // Session complete
      endSession(updatedSession);
    }
  };

  const endSession = (session) => {
    const xpEarned = session.xpGained;
    const newXp = globalStats.xp + xpEarned;
    const oldLevel = getLevel(globalStats.xp).level;
    const newLevel = getLevel(newXp).level;
    const leveledUp = newLevel > oldLevel ? newLevel : null;

    const updatedStats = checkStreak({ ...globalStats, xp: newXp });
    setGlobalStats(updatedStats);

    // Update deck stats
    const deckId = session.deckId;
    setDecks(decks.map(d => d.id === deckId ? {
      ...d,
      deckStats: {
        totalAnswers: (d.deckStats?.totalAnswers || 0) + session.stats.ok + session.stats.bad,
        correctAnswers: (d.deckStats?.correctAnswers || 0) + session.stats.ok,
        roundsCompleted: (d.deckStats?.roundsCompleted || 0) + 1
      }
    } : d));

    setCurrentSession({
      ...session,
      xpEarned,
      leveledUp,
      streak: updatedStats.dailyStreak
    });
  };

  const resetDeckStats = (deckId) => {
    setDecks(decks.map(d => d.id === deckId ? { ...d, deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 } } : d));
    if (currentDeck?.id === deckId) {
      setCurrentDeck({ ...currentDeck, deckStats: { totalAnswers: 0, correctAnswers: 0, roundsCompleted: 0 } });
    }
  };

  const exportToExcel = (deck) => {
    // Placeholder: implement Excel export if needed
    console.log("Export to Excel:", deck.name);
  };

  // ─── SCREEN RENDERING ───
  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: "'Lora', Georgia, serif" }}>
      <style>{STYLE}</style>

      {screen === "home" && (
        <HomeScreen
          decks={decks}
          globalStats={globalStats}
          langCfg={langCfg}
          onCreateDeck={createDeck}
          onSelectDeck={(deck) => {
            setCurrentDeck(deck);
            setScreen("deck");
          }}
          onDeleteDeck={deleteDeck}
          onChangeLang={setLangCfg}
        />
      )}

      {screen === "deck" && currentDeck && (
        <DeckScreen
          deck={currentDeck}
          langCfg={langCfg}
          hasSavedSession={false}
          onBack={() => {
            setScreen("home");
            setCurrentDeck(null);
          }}
          onStart={() => startSession(currentDeck)}
          onResume={() => startSession(currentDeck)}
          onUpdate={(wordId, field, value) => updateWord(currentDeck.id, wordId, field, value)}
          onAddWord={(word) => addWord(currentDeck.id, word)}
          onDeleteWord={(wordId) => deleteWord(currentDeck.id, wordId)}
          onDeleteDeck={() => deleteDeck(currentDeck.id)}
          onRename={(name) => renameDeck(currentDeck.id, name)}
          onResetStats={() => resetDeckStats(currentDeck.id)}
          onExport={() => exportToExcel(currentDeck)}
        />
      )}

      {screen === "study" && currentSession && !currentSession.leveledUp && (
        <StudyScreenRenderer
          session={currentSession}
          onAnswer={answerWord}
          onExit={() => {
            setScreen("deck");
            setCurrentSession(null);
          }}
        />
      )}

      {screen === "study" && currentSession?.leveledUp !== undefined && (
        <RoundEnd
          stats={currentSession.stats}
          total={currentSession.stats.ok + currentSession.stats.bad}
          deckName={decks.find(d => d.id === currentSession.deckId)?.name || ""}
          xpEarned={currentSession.xpEarned}
          newLevel={currentSession.leveledUp}
          streak={currentSession.streak}
          onNext={() => startSession(decks.find(d => d.id === currentSession.deckId))}
          onBack={() => {
            setScreen("deck");
            setCurrentSession(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
