/* ══════════════════════════════════════════════════════════════
   utils.js — LexiCard
══════════════════════════════════════════════════════════════ */

/* ── 5. Bezpečné generování ID ─────────────────────────────── */
export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

/* ── Timestamp helper ──────────────────────────────────────── */
export const now = () => Date.now();

/* ── 1. Oprava Streaku (UTC, časová pásma) ─────────────────── */
export function checkStreak(gs) {
  const today = new Date().toISOString().split("T")[0];
  const last = gs.lastStudyDate;
  if (last === today) return gs;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const newStreak = last === yesterday ? (gs.dailyStreak ?? 0) + 1 : 1;
  return { ...gs, dailyStreak: newStreak, lastStudyDate: today };
}

/* ── 2. Oprava API Dictionary (cache + ochrana sítě) ───────── */
const _dc = new Map();
export async function fetchDict(word, langCode = "en") {
  const k = word.toLowerCase().trim();
  const cacheKey = `${langCode}-${k}`;
  if (_dc.has(cacheKey)) return _dc.get(cacheKey);

  try {
    const r = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(k)}`
    );
    // 404 = slovo neexistuje → uložit null natrvalo
    if (r.status === 404) { _dc.set(cacheKey, null); return null; }
    // Jiná chyba (500, výpadek) → NEukládat, zkusit znovu příště
    if (!r.ok) throw new Error("Síťová chyba nebo API nedostupné");

    const d = await r.json(), e = d[0];
    const ipa   = e.phonetics?.find(p => p.text)?.text ?? null;
    const ex    = e.meanings?.[0]?.definitions?.[0]?.example ?? null;

    const res = { ipa, example: ex };
    _dc.set(cacheKey, res);
    return res;
  } catch (error) {
    console.warn("Chyba stahování slovníku:", error);
    return null; // Nezapamatovat — zkusí se znovu
  }
}

/* ── Speech synthesis (iOS-safe) ───────────────────────────── */
// Přehrávání výhradně přes SpeechSynthesis — žádná závislost na API audio.
// iOS Safari: synth.cancel() těsně před speak() způsobuje ticho →
//   cancel → setTimeout 80ms → speak.
// iOS zamrznutý synth po pozadí: detekujeme přes watchdog + onvisibilitychange.

// Po návratu z pozadí na iOS synth někdy zamrzne ve stavu speaking=true
// bez možnosti přehrát cokoli dalšího. Sledujeme to a resetujeme.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const synth = window.speechSynthesis;
      if (synth && synth.speaking) {
        synth.cancel();
      }
    }
  });
}

export function doSpeak(synth, text, lang) {
  if (!synth || !text) return;

  const _speak = () => {
    try {
      if (synth.paused) synth.resume();
      const u = new SpeechSynthesisUtterance(text);
      u.lang   = lang;
      u.rate   = 0.9;
      u.volume = 1.0;

      let done = false;
      u.onend = () => { done = true; };
      u.onerror = () => {
        if (done) return;
        done = true;
        // Jeden retry po chybě
        setTimeout(() => {
          try {
            const u2 = new SpeechSynthesisUtterance(text);
            u2.lang = lang; u2.rate = 0.9; u2.volume = 1.0;
            synth.speak(u2);
          } catch {}
        }, 150);
      };

      synth.speak(u);

      // Watchdog: pokud po 5s synth stále mluví bez onend → zamrz → reset
      setTimeout(() => {
        if (!done && synth.speaking) {
          synth.cancel();
        }
      }, 5000);
    } catch {}
  };

  if (synth.speaking || synth.pending) {
    synth.cancel();
    // iOS potřebuje pauzu po cancel(), jinak speak() tiše selže
    setTimeout(_speak, 80);
  } else {
    _speak();
  }
}

/* ── UI Sounds ─────────────────────────────────────────────── */
const _soundCtx = { ctx: null };
export function playSound(type) {
  try {
    if (!_soundCtx.ctx)
      _soundCtx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _soundCtx.ctx;
    if (ctx.state === "suspended") ctx.resume();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "ok") {
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(680, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      osc.frequency.setValueAtTime(210, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    }
  } catch {}
}

/* ── 4. Optimalizace Levenshtein (early exit) ──────────────── */
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 4;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i ? (j ? 0 : i) : j))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/* ── Normalizace textu pro porovnávání ─────────────────────── */
function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/* ── Lokální porovnání odpovědi ────────────────────────────── */
export function localMatch(given, expected) {
  if (!given || !expected) return false;
  const g = norm(given);
  const variants = expected.split(/[/,]/).map(v => norm(v.trim())).filter(Boolean);
  return variants.some(v => lev(g, v) <= 1);
}

/* ── Parsování synonym (odděleno lomítkem) ─────────────────── */
export function parseSyn(str) {
  if (!str) return [];
  return str.split("/").map(s => s.trim()).filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════
   SPACED REPETITION (SM-2 inspirováno)
══════════════════════════════════════════════════════════════ */

/* Box → interval v ms */
const BOX_INTERVALS = [
  0,              // box 0 (unused)
  1 * 86400000,   // box 1 → 1 den
  3 * 86400000,   // box 2 → 3 dny
  7 * 86400000,   // box 3 → 7 dní
  14 * 86400000,  // box 4 → 14 dní
  30 * 86400000,  // box 5 → 30 dní
];

export function vmUpdate(word, quality) {
  const box = word.vmBox ?? 1;
  let newBox;
  if (quality >= 5)      newBox = Math.min(box + 1, 5);   // Vím → postup
  else if (quality >= 3) newBox = Math.max(box - 1, 1);   // Tuším → malý krok zpět
  else                   newBox = 1;                        // Neznám → reset

  const interval = BOX_INTERVALS[newBox] ?? BOX_INTERVALS[1];
  return {
    vmBox: newBox,
    vmLastReview: Date.now(),
    vmNextReview: Date.now() + interval,
  };
}

export function vmGetBox(word) {
  return word.vmBox ?? 1;
}

/* ── pickRound: sestavení sady ke studiu ───────────────────── */
export function pickRound(words, size = 15) {
  if (!words?.length) return [];
  const t = Date.now();

  // 1. Splatná dnes (overdue)
  const due = words.filter(w => !w.vmNextReview || w.vmNextReview <= t);
  // 2. Nová (nikdy nerecenzovaná)
  const fresh = words.filter(w => !w.vmLastReview && w.vmNextReview === null);
  // 3. Budoucí (padding)
  const future = words.filter(w => w.vmNextReview && w.vmNextReview > t)
    .sort((a, b) => (a.vmNextReview ?? 0) - (b.vmNextReview ?? 0));

  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
  const pool = [...shuffle(due), ...shuffle(fresh), ...future];

  return pool.slice(0, size);
}

/* ── XP výpočet ────────────────────────────────────────────── */
export function calcXP(quality, combo) {
  if (quality < 3) return 0;
  const base = quality >= 5 ? 3 : 1;
  const mult = combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
  return base * mult;
}

/* ── Level systém ──────────────────────────────────────────── */
export function getLevel(xp) {
  const thresholds = [0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3600, 5000];
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
  }
  const next = thresholds[level] ?? null;
  const prev = thresholds[level - 1] ?? 0;
  const progress = next ? Math.round(((xp - prev) / (next - prev)) * 100) : 100;
  return { level, next, progress };
}

/* ── Combo info (label + barva pro UI) ─────────────────────── */
export function comboInfo(combo) {
  if (combo < 3) return null;
  if (combo < 5)  return { txt: `🔥 ${combo}×`, color: "#c8a050", mult: "×1.5" };
  if (combo < 10) return { txt: `⚡ ${combo}×`, color: "#7090e8", mult: "×2" };
  return { txt: `💥 ${combo}×`, color: "#e87050", mult: "×3" };
}

/* ── Počet splatných slov v balíčku ────────────────────────── */
export function dueCount(words) {
  if (!words?.length) return 0;
  const t = Date.now();
  return words.filter(w => !w.vmNextReview || w.vmNextReview <= t).length;
}

/* ── Řazení balíčků ────────────────────────────────────────── */
export function sortDecks(decks, key) {
  if (!decks) return [];
  const arr = [...decks];
  switch (key) {
    case "date-desc":
    case "newest":   return arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    case "date-asc":
    case "oldest":   return arr.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    case "name-asc":
    case "alpha":    return arr.sort((a, b) => a.name.localeCompare(b.name, "cs"));
    case "name-desc": return arr.sort((a, b) => b.name.localeCompare(a.name, "cs"));
    case "due":      return arr.sort((a, b) => dueCount(b.words) - dueCount(a.words));
    case "size":     return arr.sort((a, b) => (b.words?.length ?? 0) - (a.words?.length ?? 0));
    default:         return arr;
  }
}

/* ── Řazení slov v balíčku ─────────────────────────────────── */
export function sortWords(words, key) {
  if (!words) return [];
  const arr = [...words];
  switch (key) {
    case "date-asc":
    case "oldest":   return arr.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
    case "date-desc":
    case "newest":   return arr.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    case "en-asc":
    case "alpha":    return arr.sort((a, b) => (a.en ?? "").localeCompare(b.en ?? "", "cs"));
    case "en-desc":  return arr.sort((a, b) => (b.en ?? "").localeCompare(a.en ?? "", "cs"));
    case "cs-asc":   return arr.sort((a, b) => (a.cs ?? "").localeCompare(b.cs ?? "", "cs"));
    case "cs-desc":  return arr.sort((a, b) => (b.cs ?? "").localeCompare(a.cs ?? "", "cs"));
    case "due":      return arr.sort((a, b) => (a.vmNextReview ?? 0) - (b.vmNextReview ?? 0));
    case "score":
    case "score-desc": return arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    case "wrong":
    case "wrong-desc": return arr.sort((a, b) => (b.wStats?.wrong ?? 0) - (a.wStats?.wrong ?? 0));
    default:         return arr;
  }
}

/* ── Řazení statistik ──────────────────────────────────────── */
export function sortStats(words, key) {
  if (!words) return [];
  const arr = [...words];
  switch (key) {
    case "en-asc":
    case "alpha":      return arr.sort((a, b) => (a.en ?? "").localeCompare(b.en ?? "", "cs"));
    case "score-desc":
    case "score":      return arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    case "wrong-desc":
    case "wrong":      return arr.sort((a, b) => (b.wStats?.wrong ?? 0) - (a.wStats?.wrong ?? 0));
    case "correct-desc": return arr.sort((a, b) => (b.wStats?.correct ?? 0) - (a.wStats?.correct ?? 0));
    case "total-desc": return arr.sort((a, b) => (b.wStats?.total ?? 0) - (a.wStats?.total ?? 0));
    case "total-asc":  return arr.sort((a, b) => (a.wStats?.total ?? 0) - (b.wStats?.total ?? 0));
    case "pct-desc":
    case "success":    return arr.sort((a, b) => {
      const pa = a.wStats?.total ? a.wStats.correct / a.wStats.total : 0;
      const pb = b.wStats?.total ? b.wStats.correct / b.wStats.total : 0;
      return pb - pa;
    });
    case "pct-asc":    return arr.sort((a, b) => {
      const pa = a.wStats?.total ? a.wStats.correct / a.wStats.total : 0;
      const pb = b.wStats?.total ? b.wStats.correct / b.wStats.total : 0;
      return pa - pb;
    });
    case "box":        return arr.sort((a, b) => (b.vmBox ?? 1) - (a.vmBox ?? 1));
    case "due":        return arr.sort((a, b) => (a.vmNextReview ?? 0) - (b.vmNextReview ?? 0));
    default:           return arr;
  }
}
