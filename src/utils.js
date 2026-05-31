import { VM_INTERVALS, LVL_XP, LVL_NAMES } from "./constants.js";

/* ─── SM-2 / Vocabulary Miner Box Algorithm ─────────────────── */
export function vmGetBox(word) {
  return Math.max(1, Math.min(8, word.vmBox ?? 1));
}

export function vmUpdate(word, quality) {
  // quality: 0=Nevím/špatně, 3=Tuším, 5=Vím/správně
  const box = vmGetBox(word);
  let newBox, newLastReview, newNextReview;
  const now = Date.now();

  if (quality >= 5) {
    // Vím → krabička +1, posunutí času
    newBox = Math.min(8, box + 1);
    newLastReview = now;
    newNextReview = now + VM_INTERVALS[newBox] * 86400000;
  } else if (quality === 3) {
    // Tuším → zůstane ve stejné krabičce, čas se NEposouvá
    newBox = box;
    newLastReview = word.vmLastReview ?? now;
    newNextReview = word.vmNextReview ?? (now + VM_INTERVALS[box] * 86400000);
  } else {
    // Nevím → krabička -3 (min 1), čas se NEposouvá
    newBox = Math.max(1, box - 3);
    newLastReview = word.vmLastReview ?? now;
    newNextReview = word.vmNextReview ?? (now + VM_INTERVALS[newBox] * 86400000);
  }
  return { vmBox: newBox, vmLastReview: newLastReview, vmNextReview: newNextReview };
}

export function vmPickRound(words, n = 20) {
  const t = Date.now();
  const due = words.filter(w => !w.vmNextReview || w.vmNextReview <= t);
  let pool = due.length >= n
    ? due
    : [...words].sort((a, b) => (a.vmNextReview ?? 0) - (b.vmNextReview ?? 0)).slice(0, n);
  pool = [...pool].sort((a, b) => vmGetBox(a) - vmGetBox(b));
  if (pool.length <= n) return shuffle(pool);
  const result = [];
  let ci = 0;
  for (let i = 0; i < n; i++) {
    ci = ci + Math.floor(Math.random() * (pool.length - ci) / (n - i) + 0.99);
    ci = Math.min(ci, pool.length - 1);
    result.push(pool[ci]);
  }
  return shuffle(result);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function vmDueCount(words) {
  const t = Date.now();
  return words.filter(w => !w.vmNextReview || w.vmNextReview <= t).length;
}

// Legacy aliases
export const pickRound = vmPickRound;
export const dueCount = vmDueCount;

/* ─── XP & Levels ────────────────────────────────────────────── */
export function getLevel(xp) {
  let lv = 0;
  while (lv < LVL_XP.length - 1 && xp >= LVL_XP[lv + 1]) lv++;
  const curr = LVL_XP[lv];
  const next = LVL_XP[lv + 1] ?? Math.round(LVL_XP[lv] * 1.5);
  return {
    level: lv + 1,
    name: LVL_NAMES[lv] ?? "Legenda",
    curr,
    next,
    pct: Math.min(100, Math.round((xp - curr) / (next - curr) * 100)),
  };
}

export function calcXP(quality, combo = 0, isFlip = false) {
  if (isFlip) return 0;
  if (quality >= 5) return 10;
  if (quality === 3) return 5;
  return 0;
}

export function comboInfo(n) {
  if (n >= 10) return { txt: "🔥 MEGA", color: "#ff6b35", mult: "×3" };
  if (n >= 5)  return { txt: "⚡ SUPER", color: "#d4a853", mult: "×2" };
  if (n >= 3)  return { txt: "✨ COMBO", color: "#7090c8", mult: "×1.5" };
  return null;
}

export function checkStreak(gs) {
  const today = new Date().toDateString();
  const last = gs.lastStudyDate;
  if (last === today) return gs;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const newStreak = last === yesterday ? (gs.dailyStreak ?? 0) + 1 : 1;
  return { ...gs, dailyStreak: newStreak, lastStudyDate: today };
}

/* ─── Helpers ────────────────────────────────────────────────── */
export const uid = () => Math.random().toString(36).slice(2, 9);
export const now = () => Date.now();

export function norm(t) {
  return (t || "").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function parseSyn(f) {
  return (f || "").split(/[\/,]/).map(s => s.trim()).filter(Boolean);
}

export function localMatch(input, field) {
  const s = norm(input);
  for (const c of parseSyn(field)) {
    const e = norm(c);
    if (!e) continue;
    if (s === e) return true;
    const ew = e.split(" "), sw = s.split(" ");
    if (ew.length === 1 && sw.some(w => w === ew[0])) return true;
    if (sw.length === 1 && ew.some(w => w === sw[0])) return true;
    if (ew.length > 1 && ew.filter(w => sw.includes(w)).length / ew.length >= 0.72) return true;
    if (ew.length === 1 && sw.length === 1 && lev(s, e) <= Math.floor(e.length * 0.25)) return true;
    const a = sw.filter(w => w !== "se" && w !== "si").join(" ");
    const b = ew.filter(w => w !== "se" && w !== "si").join(" ");
    if (a && b && a === b) return true;
  }
  return false;
}

export function lev(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i ? j ? 0 : i : j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);
    if (type === "ok") {
      [[659, .0, .22], [784, .15, .38]].forEach(([f, s, e]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        o.connect(g); g.connect(master);
        g.gain.setValueAtTime(0, ctx.currentTime + s);
        g.gain.linearRampToValueAtTime(1, ctx.currentTime + s + .03);
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + e + .12);
        o.start(ctx.currentTime + s); o.stop(ctx.currentTime + e + .15);
      });
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 300;
      o.connect(g); g.connect(master);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + .04);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + .35);
    }
  } catch {}
}

export function doSpeak(synth, text, lang) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang; u.rate = 0.82;
  synth.speak(u);
}

export function sortWords(w, k) {
  const a = [...w];
  if (k === "en-asc")   return a.sort((a, b) => a.en.localeCompare(b.en));
  if (k === "en-desc")  return a.sort((a, b) => b.en.localeCompare(a.en));
  if (k === "cs-asc")   return a.sort((a, b) => a.cs.localeCompare(b.cs));
  if (k === "cs-desc")  return a.sort((a, b) => b.cs.localeCompare(a.cs));
  if (k === "date-asc") return a.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
  if (k === "date-desc")return a.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return a;
}

export function sortDecks(d, k) {
  const a = [...d];
  if (k === "name-asc")  return a.sort((a, b) => a.name.localeCompare(b.name));
  if (k === "name-desc") return a.sort((a, b) => b.name.localeCompare(a.name));
  if (k === "date-asc")  return a.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  if (k === "date-desc") return a.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return a;
}

export function sortStats(w, k) {
  const a = [...w];
  const wt = x => x.wStats?.total ?? 0;
  const wc = x => x.wStats?.correct ?? 0;
  const ww = x => x.wStats?.wrong ?? 0;
  const pct = x => wt(x) ? (wc(x) / wt(x)) : 0;
  if (k === "en-asc")      return a.sort((a, b) => a.en.localeCompare(b.en));
  if (k === "en-desc")     return a.sort((a, b) => b.en.localeCompare(a.en));
  if (k === "total-desc")  return a.sort((a, b) => wt(b) - wt(a));
  if (k === "total-asc")   return a.sort((a, b) => wt(a) - wt(b));
  if (k === "correct-desc")return a.sort((a, b) => wc(b) - wc(a));
  if (k === "wrong-desc")  return a.sort((a, b) => ww(b) - ww(a));
  if (k === "pct-desc")    return a.sort((a, b) => pct(b) - pct(a));
  if (k === "pct-asc")     return a.sort((a, b) => pct(a) - pct(b));
  if (k === "score-desc")  return a.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return a;
}

/* ─── Dictionary API ─────────────────────────────────────────── */
const _dc = new Map();

export async function fetchDict(word) {
  const k = word.toLowerCase().trim();
  if (_dc.has(k)) return _dc.get(k);
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(k)}`);
    if (!r.ok) { _dc.set(k, null); return null; }
    const d = await r.json(), e = d[0];
    const ipa   = e.phonetics?.find(p => p.text)?.text ?? null;
    const audio = e.phonetics?.find(p => p.audio && p.audio.length > 4)?.audio ?? null;
    const ex    = e.meanings?.[0]?.definitions?.[0]?.example ?? null;
    const res   = { ipa, audio, example: ex };
    _dc.set(k, res);
    return res;
  } catch { _dc.set(k, null); return null; }
}

export function playAudio(url) {
  if (!url) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        let peak = 0;
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          const data = decoded.getChannelData(ch);
          for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        }
        gain.gain.value = peak > 0 ? Math.min(0.75 / peak, 3) : 1;
        src.buffer = decoded;
        src.connect(gain); gain.connect(ctx.destination);
        src.start(0);
      }).catch(() => { new Audio(url).play().catch(() => {}); });
  } catch {
    try { new Audio(url).play(); } catch {}
  }
}
