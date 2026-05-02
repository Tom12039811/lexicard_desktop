import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

/* ─── utils ──────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

function norm(t) {
  return (t||"").normalize("NFD").replace(/\p{Mn}/gu,"")
    .toLowerCase().replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();
}

/* Parse synonyms from a field — splits by "/" or "," */
function parseSynonyms(field) {
  if(!field) return [];
  return field.split(/[\/,]/).map(s=>s.trim()).filter(Boolean);
}

/* ── Smart local matcher ──────────────────────────────────────
   Accepts if input matches ANY synonym with fuzzy logic.
   Also strips common Czech prefixes (se, si, se, být) that
   students often omit or add. */
function localMatch(input, expectedField) {
  const candidates = parseSynonyms(expectedField);
  const s = norm(input);

  for(const cand of candidates) {
    const e = norm(cand);
    if(!e) continue;
    if(s === e) return true;

    // direct contains check for short expected answers
    const ew = e.split(" "), sw = s.split(" ");
    if(ew.length === 1 && sw.some(w => w === ew[0])) return true;
    if(sw.length === 1 && ew.some(w => w === sw[0])) return true;

    // word overlap ratio — 72% threshold
    if(ew.length > 1) {
      const overlap = ew.filter(w => sw.includes(w)).length / ew.length;
      if(overlap >= 0.72) return true;
    }

    // Levenshtein for typos in short single words
    if(ew.length === 1 && sw.length === 1) {
      if(levenshtein(s, e) <= Math.floor(e.length * 0.25)) return true;
    }

    // reflexive verb: strip/add "se/si" and retry
    const strippedS = sw.filter(w=>w!=="se"&&w!=="si").join(" ");
    const strippedE = ew.filter(w=>w!=="se"&&w!=="si").join(" ");
    if(strippedS && strippedE && strippedS === strippedE) return true;
  }
  return false;
}

function levenshtein(a, b) {
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

/* ── Claude API semantic evaluator ───────────────────────────── */
async function claudeEval(userAnswer, correctTranslations, sourceWord, sourceLang) {
  try {
    const translationList = parseSynonyms(correctTranslations).join(", ");
    const prompt = sourceLang === "en-cs"
      ? `Posuzuješ překlad anglického slova do češtiny.
Anglické slovo: "${sourceWord}"
Správné překlady: ${translationList}
Studentova odpověď: "${userAnswer}"

Je studentova odpověď SPRÁVNĚ? Přijmi odpověď jako správnou pokud:
- Je to synonymum nebo alternativní překlad
- Je gramaticky jiná forma ale stejný význam (např. "závodit" vs "závodník" NE, ale "soutěžící" vs "soutěžitel" ANO)
- Má drobnou překlep
- Chybí/přebývá zvratné "se/si"
Odmítni pokud jde o jiný základní význam.
Odpověz POUZE: SPRÁVNĚ nebo ŠPATNĚ`
      : `You're evaluating a Czech-to-English translation.
Czech word: "${sourceWord}"
Correct translations: ${translationList}
Student's answer: "${userAnswer}"

Is the student's answer CORRECT? Accept if:
- It's a synonym or alternative translation
- Minor typo
- Same meaning, different grammatical form
Reject if it's a fundamentally different meaning.
Reply ONLY: CORRECT or INCORRECT`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:10,
        messages:[{role:"user",content:prompt}]
      })
    });
    if(!res.ok) return null;
    const data = await res.json();
    const text = (data.content?.[0]?.text||"").toUpperCase();
    if(text.includes("SPRÁVNĚ")||text.includes("CORRECT")) return true;
    if(text.includes("ŠPATNĚ")||text.includes("INCORRECT")) return false;
    return null;
  } catch { return null; }
}

/* ─── sort helpers ───────────────────────────────────────────── */
function pickRound(words, n=20) {
  const arr=[...words].map(w=>({w,k:Math.random()/Math.max(0.1,(w.score??0)+0.5)}));
  arr.sort((a,b)=>b.k-a.k);
  return arr.slice(0,Math.min(n,arr.length)).map(x=>x.w);
}
function doSpeak(synth, text, lang) {
  if(!synth||!text) return;
  synth.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang=lang; u.rate=0.82; synth.speak(u);
}
function sortWords(words, key) {
  const arr=[...words];
  if(key==="en-asc")    return arr.sort((a,b)=>a.en.localeCompare(b.en));
  if(key==="en-desc")   return arr.sort((a,b)=>b.en.localeCompare(a.en));
  if(key==="cs-asc")    return arr.sort((a,b)=>a.cs.localeCompare(b.cs));
  if(key==="cs-desc")   return arr.sort((a,b)=>b.cs.localeCompare(a.cs));
  if(key==="date-asc")  return arr.sort((a,b)=>(a.addedAt??0)-(b.addedAt??0));
  if(key==="date-desc") return arr.sort((a,b)=>(b.addedAt??0)-(a.addedAt??0));
  return arr;
}
function sortDecks(decks, key) {
  const arr=[...decks];
  if(key==="name-asc")  return arr.sort((a,b)=>a.name.localeCompare(b.name));
  if(key==="name-desc") return arr.sort((a,b)=>b.name.localeCompare(a.name));
  if(key==="date-asc")  return arr.sort((a,b)=>(a.createdAt??0)-(b.createdAt??0));
  if(key==="date-desc") return arr.sort((a,b)=>(b.createdAt??0)-(a.createdAt??0));
  return arr;
}
function sortStats(words, key) {
  const arr=[...words];
  if(key==="en-asc")       return arr.sort((a,b)=>a.en.localeCompare(b.en));
  if(key==="en-desc")      return arr.sort((a,b)=>b.en.localeCompare(a.en));
  if(key==="total-desc")   return arr.sort((a,b)=>((b.wStats?.total??0))-(a.wStats?.total??0));
  if(key==="total-asc")    return arr.sort((a,b)=>((a.wStats?.total??0))-(b.wStats?.total??0));
  if(key==="correct-desc") return arr.sort((a,b)=>((b.wStats?.correct??0))-(a.wStats?.correct??0));
  if(key==="correct-asc")  return arr.sort((a,b)=>((a.wStats?.correct??0))-(b.wStats?.correct??0));
  if(key==="wrong-desc")   return arr.sort((a,b)=>((b.wStats?.wrong??0))-(a.wStats?.wrong??0));
  if(key==="wrong-asc")    return arr.sort((a,b)=>((a.wStats?.wrong??0))-(b.wStats?.wrong??0));
  if(key==="pct-desc")     return arr.sort((a,b)=>{const ap=(a.wStats?.total?a.wStats.correct/a.wStats.total:0),bp=(b.wStats?.total?b.wStats.correct/b.wStats.total:0);return bp-ap;});
  if(key==="pct-asc")      return arr.sort((a,b)=>{const ap=(a.wStats?.total?a.wStats.correct/a.wStats.total:0),bp=(b.wStats?.total?b.wStats.correct/b.wStats.total:0);return ap-bp;});
  if(key==="score-desc")   return arr.sort((a,b)=>(b.score??0)-(a.score??0));
  if(key==="score-asc")    return arr.sort((a,b)=>(a.score??0)-(b.score??0));
  return arr;
}

/* ─── constants ──────────────────────────────────────────────── */
const DEFAULT_LANGS=[
  {id:"en", label:"Angličtina", flag:"🇬🇧", code:"ENG"},
  {id:"es", label:"Španělština", flag:"🇪🇸", code:"ESP"},
];
const MODES=[
  {id:"en-cs", label:"🇬🇧→🇨🇿", hint:"anglicky → česky"},
  {id:"cs-en", label:"🇨🇿→🇬🇧", hint:"česky → anglicky"},
  {id:"pron",  label:"🔊 Výslovnost", hint:"opakuj slova"},
];
const DECK_SORTS=[{id:"date-desc",label:"Nejnovější"},{id:"date-asc",label:"Nejstarší"},{id:"name-asc",label:"Název A–Z"},{id:"name-desc",label:"Název Z–A"}];
const WORD_SORTS=[{id:"date-asc",label:"Pořadí"},{id:"en-asc",label:"EN ↑"},{id:"en-desc",label:"EN ↓"},{id:"cs-asc",label:"CS ↑"},{id:"cs-desc",label:"CS ↓"},{id:"date-desc",label:"Datum ↓"}];
const STAT_COLS=[{id:"en-asc",label:"Slovo ↑"},{id:"total-desc",label:"Procvičeno ↓"},{id:"total-asc",label:"Procvičeno ↑"},{id:"correct-desc",label:"Správně ↓"},{id:"wrong-desc",label:"Špatně ↓"},{id:"pct-desc",label:"Úspěšnost ↓"},{id:"pct-asc",label:"Úspěšnost ↑"},{id:"score-desc",label:"Skóre ↓"},{id:"score-asc",label:"Skóre ↑"}];

const C={bg:"#0b0f16",card:"#111622",border:"#1e2535",gold:"#d4a853",goldDim:"#7a5818",text:"#f0e6d3",textDim:"#9a9080",muted:"#5a6070",mutedDark:"#3e4455",ok:"#5cb88a",okBg:"#0f2018",okBorder:"#255030",err:"#c87070",errBg:"#200e0e",errBorder:"#4a1a1a"};

const STYLE=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes cardIn{from{opacity:0;transform:scale(.97) translateY(5px)}to{opacity:1;transform:scale(1)}}
  @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,168,83,.5)}55%{box-shadow:0 0 0 18px rgba(212,168,83,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes wave{0%,100%{height:5px}50%{height:18px}}
  @keyframes overlayIn{from{opacity:0}to{opacity:1}}
  @keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes thinking{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}
  .fade-up{animation:fadeUp .2s ease both}
  .card-in{animation:cardIn .28s ease both}
  .mic-on{animation:micPulse 1.2s ease-in-out infinite}
  .thinking{animation:thinking 1s ease-in-out infinite}
  .btn{cursor:pointer;transition:filter .15s,transform .1s;border:none;font-family:'Lora',serif;background:transparent;}
  .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
  .btn:active{transform:translateY(0) scale(.97)}
  .inp{width:100%;background:#0e1320;border:1.5px solid #2e3447;color:#f0e6d3;border-radius:10px;padding:10px 13px;font-size:15px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp:focus{border-color:#d4a853}
  .inp::placeholder{color:#2e3550}
  .inp-sm{width:100%;background:#0e1320;border:1.5px solid #2e3447;color:#f0e6d3;border-radius:8px;padding:8px 11px;font-size:14px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp-sm:focus{border-color:#d4a853}
  .inp-sm::placeholder{color:#2e3550}
  .tdinp{width:100%;background:transparent;border:none;color:#ccc5b5;font-size:13px;font-family:'Lora',serif;outline:none;padding:8px 10px;border-radius:6px;transition:background .15s;}
  .tdinp:focus{background:#141c30;}
  .tdinp::placeholder{color:#252e40}
  .wv{width:4px;border-radius:2px;background:#d4a853;display:inline-block;margin:0 2px;}
  .wv:nth-child(1){animation:wave .8s ease-in-out infinite 0s}
  .wv:nth-child(2){animation:wave .8s ease-in-out infinite .13s}
  .wv:nth-child(3){animation:wave .8s ease-in-out infinite .26s}
  .wv:nth-child(4){animation:wave .8s ease-in-out infinite .39s}
  .wv:nth-child(5){animation:wave .8s ease-in-out infinite .52s}
  .overlay{position:fixed;inset:0;background:rgba(5,8,14,.82);display:flex;align-items:center;justify-content:center;z-index:100;animation:overlayIn .18s ease;padding:1rem;}
  .modal{background:#111e30;border:1px solid #2a3650;border-radius:20px;padding:2rem;width:100%;max-width:480px;animation:modalIn .22s ease;max-height:90vh;overflow-y:auto;}
  .modal-wide{max-width:900px;}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-track{background:#0b0f16}
  ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:2px}
`;

/* ─── Modal ──────────────────────────────────────────────────── */
function Modal({onClose, children, wide=false}) {
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return(
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className={`modal${wide?" modal-wide":""}`}>{children}</div>
    </div>
  );
}

/* ─── Lang Dropdown ──────────────────────────────────────────── */
function LangDropdown({langs, activeId, onSwitch, onAddLang}) {
  const [open,setOpen]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [nl,setNl]=useState({label:"",flag:"🌐",code:""});
  const ref=useRef(null);
  const active=langs.find(l=>l.id===activeId)||langs[0];
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  function addLang(){if(!nl.label.trim()||!nl.code.trim())return;onAddLang({id:uid(),label:nl.label.trim(),flag:nl.flag||"🌐",code:nl.code.trim().toUpperCase().slice(0,3),custom:true});setNl({label:"",flag:"🌐",code:""});setShowAdd(false);setOpen(false);}
  return(
    <>
      <div ref={ref} style={{position:"relative",userSelect:"none"}}>
        <button className="btn" onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,background:"#111e30",border:`1.5px solid ${open?"#3a5080":C.border}`,borderRadius:10,padding:"8px 14px",cursor:"pointer",transition:"all .2s",minWidth:140}}>
          <span style={{fontSize:20}}>{active?.flag}</span>
          <span style={{fontWeight:700,fontSize:13,color:C.gold,letterSpacing:.5}}>{active?.code}</span>
          <span style={{fontSize:12,color:C.muted,flex:1,textAlign:"left"}}>{active?.label}</span>
          <span style={{fontSize:10,color:C.muted}}>{open?"▲":"▼"}</span>
        </button>
        {open&&(
          <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"#111e30",border:`1px solid #2a3650`,borderRadius:12,overflow:"hidden",minWidth:200,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
            {langs.map(l=>(
              <button key={l.id} className="btn" onClick={()=>{onSwitch(l.id);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:l.id===activeId?"#1a2a45":"transparent",transition:"background .15s",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=l.id===activeId?"#1a2a45":"#161e30"} onMouseLeave={e=>e.currentTarget.style.background=l.id===activeId?"#1a2a45":"transparent"}>
                <span style={{fontSize:18}}>{l.flag}</span>
                <span style={{fontWeight:700,fontSize:12,color:C.gold,width:36}}>{l.code}</span>
                <span style={{fontSize:13,color:C.textDim}}>{l.label}</span>
                {l.id===activeId&&<span style={{marginLeft:"auto",fontSize:12,color:C.ok}}>✓</span>}
              </button>
            ))}
            <div style={{borderTop:`1px solid ${C.border}`,margin:"4px 0"}}/>
            <button className="btn" onClick={()=>{setShowAdd(true);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",color:"#7090b8",textAlign:"left",fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background="#161e30"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:18}}>＋</span> Přidat jazyk
            </button>
          </div>
        )}
      </div>
      {showAdd&&(
        <Modal onClose={()=>setShowAdd(false)}>
          <div style={{marginBottom:16}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:4}}>Přidat jazyk</div><div style={{fontSize:13,color:C.muted}}>Vlastní jazyková větev pro balíčky</div></div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Název jazyka</div><input className="inp-sm" value={nl.label} onChange={e=>setNl(n=>({...n,label:e.target.value}))} placeholder="např. Francouzština"/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Emoji vlajka</div><input className="inp-sm" value={nl.flag} onChange={e=>setNl(n=>({...n,flag:e.target.value}))} placeholder="🇫🇷"/></div>
              <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Kód (3 znaky)</div><input className="inp-sm" value={nl.code} onChange={e=>setNl(n=>({...n,code:e.target.value}))} placeholder="FRA" maxLength={3}/></div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button className="btn" onClick={()=>setShowAdd(false)} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
              <button className="btn" onClick={addLang} style={{flex:2,background:nl.label&&nl.code?C.gold:"#1a2030",color:nl.label&&nl.code?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>Přidat jazyk</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ─── Upload Modal ───────────────────────────────────────────── */
function UploadModal({onClose, onUpload}) {
  const [drag,setDrag]=useState(false);
  const fRef=useRef(null);
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:20}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.gold,marginBottom:4}}>Nahrát nový balíček</div><div style={{fontSize:13,color:C.muted}}>Excel nebo CSV soubor se slovíčky</div></div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f){onUpload(f);onClose();}}} onClick={()=>fRef.current.click()}
        style={{border:`2px dashed ${drag?C.gold:"#2e3447"}`,borderRadius:14,padding:"2.5rem 1.5rem",textAlign:"center",background:drag?"rgba(212,168,83,.05)":"transparent",cursor:"pointer",transition:"all .2s",marginBottom:20}}>
        <div style={{fontSize:40,marginBottom:10}}>📊</div>
        <div style={{fontSize:16,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:6}}>Přetáhni soubor sem</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>nebo klikni pro výběr</div>
        <div style={{display:"inline-block",background:"#1a2030",borderRadius:20,padding:"4px 14px",fontSize:12,color:"#4a6070"}}>.xlsx &nbsp;·&nbsp; .xls &nbsp;·&nbsp; .csv</div>
        <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){onUpload(e.target.files[0]);onClose();}}}/>
      </div>
      {/* format guide */}
      <div style={{background:"#0e1520",borderRadius:12,padding:"14px 16px"}}>
        <div style={{fontSize:11,color:C.mutedDark,marginBottom:10,letterSpacing:1,textTransform:"uppercase",fontWeight:600}}>Formát souboru</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.5fr 1.4fr",gap:"4px 12px",fontSize:12,fontFamily:"monospace"}}>
          <span style={{color:"#5c8aaa",fontWeight:600}}>A – Anglicky</span>
          <span style={{color:"#7a8a5c",fontWeight:600}}>B – Česky *</span>
          <span style={{color:"#9a7a5c",fontWeight:600}}>C – Příkladová věta</span>
          <span style={{color:"#7a6a8a",fontWeight:600}}>D – Synonyma</span>
          <span style={{color:C.muted}}>contestant</span>
          <span style={{color:C.muted}}>soutěžící</span>
          <span style={{color:"#5a5a5a",fontStyle:"italic"}}>She's a contestant.</span>
          <span style={{color:"#7a6a5c"}}>závodník / účastník</span>
          <span style={{color:C.muted}}>apple</span>
          <span style={{color:C.muted}}>jablko</span>
          <span style={{color:"#5a5a5a",fontStyle:"italic"}}>An apple a day…</span>
          <span style={{color:"#5a5a5a"}}>—</span>
        </div>
        <div style={{marginTop:10,fontSize:12,color:"#5a6a5c",lineHeight:1.6,borderTop:`1px solid #1e2535`,paddingTop:10}}>
          <span style={{color:C.gold}}>* Sloupec D je volitelný.</span> Synonyma lze také psát přímo do sloupce B oddělená lomítkem: <span style={{color:"#8a8",fontFamily:"monospace"}}>soutěžící / závodník</span>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Add Word Modal ─────────────────────────────────────────── */
function AddWordModal({onClose, onAdd}) {
  const [en,setEn]=useState(""); const [cs,setCs]=useState(""); const [ex,setEx]=useState(""); const [syn,setSyn]=useState("");
  function submit(){if(!en.trim()||!cs.trim())return;onAdd({en:en.trim(),cs:cs.trim(),example:ex.trim(),synonyms:syn.trim()});onClose();}
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:18}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>Přidat slovíčko</div><div style={{fontSize:13,color:C.muted}}>Přidej překlad, synonyma a příkladovou větu</div></div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>🇬🇧 Anglicky *</div><input className="inp-sm" value={en} onChange={e=>setEn(e.target.value)} placeholder="anglické slovo / fráze" autoFocus onKeyDown={e=>{if(e.key==="Enter")document.getElementById("lc-cs")?.focus();}}/></div>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>🇨🇿 Česky * <span style={{color:C.mutedDark}}>(nebo více: soutěžící / závodník)</span></div><input id="lc-cs" className="inp-sm" value={cs} onChange={e=>setCs(e.target.value)} placeholder="český překlad (nebo více oddělených /)" onKeyDown={e=>{if(e.key==="Enter")document.getElementById("lc-syn")?.focus();}}/></div>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>🔄 Další synonyma <span style={{color:C.mutedDark}}>(volitelné)</span></div><input id="lc-syn" className="inp-sm" value={syn} onChange={e=>setSyn(e.target.value)} placeholder="závodník / účastník / hráč" onKeyDown={e=>{if(e.key==="Enter")document.getElementById("lc-ex")?.focus();}}/></div>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>💡 Příkladová věta</div><input id="lc-ex" className="inp-sm" value={ex} onChange={e=>setEx(e.target.value)} placeholder="volitelně…" onKeyDown={e=>{if(e.key==="Enter")submit();}}/></div>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
          <button className="btn" onClick={submit} style={{flex:2,background:en&&cs?C.gold:"#1a2030",color:en&&cs?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>Přidat slovíčko</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Stats Modal ────────────────────────────────────────────── */
function StatsModal({deck, onClose}) {
  const [sortKey,setSortKey]=useState("total-desc");
  const sorted=sortStats(deck.words, sortKey);
  const ds=deck.deckStats??{totalAnswers:0,correctAnswers:0,roundsCompleted:0};
  const mastered=deck.words.filter(w=>(w.score??0)>=3).length;
  return(
    <Modal onClose={onClose} wide>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:18,gap:12}}>
        <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.gold,marginBottom:3}}>Statistika — {deck.name}</div><div style={{fontSize:13,color:C.muted}}>{deck.words.length} slovíček · {mastered} zvládnuto · {ds.roundsCompleted} kol</div></div>
        <button className="btn" onClick={onClose} style={{color:C.muted,fontSize:22,flexShrink:0,lineHeight:1}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
        {[{lbl:"Celkem odpovědí",val:ds.totalAnswers||0,c:"#7090c8",bg:"#121a2e"},{lbl:"Správně",val:ds.correctAnswers||0,c:C.ok,bg:C.okBg},{lbl:"Špatně",val:(ds.totalAnswers||0)-(ds.correctAnswers||0),c:C.err,bg:C.errBg},{lbl:"Úspěšnost",val:ds.totalAnswers?`${Math.round(ds.correctAnswers/ds.totalAnswers*100)}%`:"—",c:C.gold,bg:"#1a1608"}].map(({lbl,val,c,bg})=>(
          <div key={lbl} style={{background:bg,borderRadius:10,padding:"10px 8px",textAlign:"center"}}><div style={{fontSize:10,color:c,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{lbl}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:c}}>{val}</div></div>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:C.mutedDark,textTransform:"uppercase",letterSpacing:1.5,flexShrink:0}}>Řadit:</span>
        {STAT_COLS.map(s=>(
          <button key={s.id} className="btn" onClick={()=>setSortKey(s.id)} style={{background:sortKey===s.id?"#1a2a40":"transparent",border:`1px solid ${sortKey===s.id?"#2e4565":C.border}`,color:sortKey===s.id?C.gold:C.muted,borderRadius:7,padding:"3px 10px",fontSize:11,cursor:"pointer",transition:"all .2s"}}>{s.label}</button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:`1px solid #1e2535`}}>{["#","Anglicky","Česky","Synonyma","Procvičeno","Správně","Špatně","Úspěšnost","Skóre"].map(h=><th key={h} style={{padding:"7px 10px",color:C.muted,fontWeight:500,fontSize:11,textTransform:"uppercase",letterSpacing:1,textAlign:h==="#"?"center":"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {sorted.map((w,i)=>{
              const ws=w.wStats??{total:0,correct:0,wrong:0};
              const pct=ws.total?Math.round(ws.correct/ws.total*100):null;
              const pctColor=pct===null?C.muted:pct>=80?C.ok:pct>=50?C.gold:C.err;
              const syns=[...parseSynonyms(w.cs).slice(1),...parseSynonyms(w.synonyms||"")].join(", ");
              return(
                <tr key={w.id} style={{borderBottom:`1px solid #161e2e`,transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background="#0e1525"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"8px 10px",color:C.muted,textAlign:"center",fontSize:11}}>{i+1}</td>
                  <td style={{padding:"8px 10px",color:C.text,fontWeight:500}}>{w.en}</td>
                  <td style={{padding:"8px 10px",color:C.textDim}}>{parseSynonyms(w.cs)[0]||w.cs}</td>
                  <td style={{padding:"8px 10px",color:"#6a7060",fontSize:12,fontStyle:"italic"}}>{syns||"—"}</td>
                  <td style={{padding:"8px 10px",color:C.textDim,textAlign:"center"}}>{ws.total||"—"}</td>
                  <td style={{padding:"8px 10px",color:C.ok,textAlign:"center"}}>{ws.correct||"—"}</td>
                  <td style={{padding:"8px 10px",color:C.err,textAlign:"center"}}>{ws.wrong||"—"}</td>
                  <td style={{padding:"8px 10px",textAlign:"center"}}>{pct!==null?<span style={{background:pctColor+"22",color:pctColor,borderRadius:20,padding:"2px 9px",fontWeight:600,fontSize:12}}>{pct}%</span>:<span style={{color:C.mutedDark}}>—</span>}</td>
                  <td style={{padding:"8px 10px",textAlign:"center"}}><div style={{display:"flex",justifyContent:"center",gap:3}}>{[0,1,2,3,4].map(d=><div key={d} style={{width:6,height:6,borderRadius:"50%",background:d<(w.score??0)?C.gold:"#1e2535"}}/>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length===0&&<div style={{textAlign:"center",padding:"2rem",color:C.muted,fontStyle:"italic"}}>Žádná slovíčka</div>}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════
   HOME
══════════════════════════════════════════════════════════════ */
function HomeScreen({decks,langs,activeLang,onLangSwitch,onAddLang,onSelect,onFileUpload}) {
  const [sort,setSort]=useState("date-desc");
  const [showUpload,setShowUpload]=useState(false);
  const langDecks=sortDecks(decks.filter(d=>d.lang===activeLang),sort);
  const lc=langs.find(l=>l.id===activeLang)||langs[0];
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",padding:"2rem 1.5rem"}}>
      <style>{STYLE}</style>
      {showUpload&&<UploadModal onClose={()=>setShowUpload(false)} onUpload={onFileUpload}/>}
      <div style={{width:"100%",maxWidth:800,display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"1.5rem"}}>
        <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:40,fontWeight:700,color:C.gold,letterSpacing:"-1px"}}>LexiCard</div><div style={{fontSize:13,color:C.muted,marginTop:3,fontStyle:"italic"}}>Procvičuj slovíčka · {lc?.label}</div></div>
        <LangDropdown langs={langs} activeId={activeLang} onSwitch={onLangSwitch} onAddLang={onAddLang}/>
      </div>
      <div style={{width:"100%",maxWidth:800,marginBottom:"1.2rem"}}>
        <button className="btn" onClick={()=>setShowUpload(true)}
          style={{width:"100%",display:"flex",alignItems:"center",gap:14,background:"#0e1520",border:`1.5px dashed #2a3650`,borderRadius:14,padding:"14px 20px",cursor:"pointer",transition:"all .2s",textAlign:"left"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.background="rgba(212,168,83,.04)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3650";e.currentTarget.style.background="#0e1520";}}>
          <div style={{width:40,height:40,background:"#1a2535",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📊</div>
          <div><div style={{fontSize:15,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Přidat nový balíček</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Nahrej .xlsx nebo .csv soubor se slovíčky</div></div>
          <div style={{marginLeft:"auto",fontSize:20,color:"#2a3650"}}>+</div>
        </button>
      </div>
      <div style={{width:"100%",maxWidth:800,display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:11,color:C.mutedDark,textTransform:"uppercase",letterSpacing:2,flexShrink:0}}>Řadit:</span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {DECK_SORTS.map(s=><button key={s.id} className="btn" onClick={()=>setSort(s.id)} style={{background:sort===s.id?"#1a2a40":"transparent",border:`1px solid ${sort===s.id?"#2e4565":C.border}`,color:sort===s.id?C.gold:C.muted,borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",transition:"all .2s"}}>{s.label}</button>)}
        </div>
      </div>
      <div style={{width:"100%",maxWidth:800,flex:1}}>
        {langDecks.length===0?(
          <div style={{textAlign:"center",padding:"3rem 0",color:C.muted,fontSize:14,fontStyle:"italic"}}>Žádné balíčky pro {lc?.label} — přidej první kliknutím výše</div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14}}>
            {langDecks.map(d=>{
              const mastered=d.words.filter(w=>(w.score??0)>=3).length;
              const pct=d.words.length?Math.round(mastered/d.words.length*100):0;
              const sr=d.deckStats?.totalAnswers?Math.round(d.deckStats.correctAnswers/d.deckStats.totalAnswers*100):null;
              return(
                <div key={d.id} onClick={()=>onSelect(d.id)} className="btn" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:"1.4rem",cursor:"pointer",transition:"border-color .2s,transform .15s",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#3a5080"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.text,marginBottom:5,lineHeight:1.2}}>{d.name}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{d.words.length} slovíček · {mastered} zvl.{sr!==null?` · ${sr}% úsp.`:""}</div>
                  <div style={{background:"#161e30",borderRadius:3,height:4}}><div style={{width:`${pct}%`,height:"100%",background:C.gold,borderRadius:3,transition:"width .4s"}}/></div>
                  <div style={{fontSize:11,color:C.goldDim,marginTop:5,textAlign:"right"}}>{pct}% zvládnuto</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   DECK SCREEN
══════════════════════════════════════════════════════════════ */
function DeckScreen({deck,onBack,onStart,onUpdate,onAddWord,onDeleteWord,onDeleteDeck}) {
  const [wSort,setWSort]=useState("date-asc");
  const [showAdd,setShowAdd]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const ds=deck.deckStats??{totalAnswers:0,correctAnswers:0,roundsCompleted:0};
  const mastered=deck.words.filter(w=>(w.score??0)>=3).length;
  const practiced=deck.words.filter(w=>(w.wStats?.total??0)>0).length;
  const sr=ds.totalAnswers?Math.round(ds.correctAnswers/ds.totalAnswers*100):null;
  const sorted=sortWords(deck.words,wSort);
  const statItems=[{lbl:"Úspěšnost",val:sr!==null?`${sr}%`:"—",c:"#7090c8",bg:"#121a2e"},{lbl:"Naučeno",val:`${mastered}/${deck.words.length}`,c:C.ok,bg:C.okBg},{lbl:"Procvičeno",val:`${practiced}/${deck.words.length}`,c:"#a080c8",bg:"#1a1028"},{lbl:"Odpovědí",val:ds.totalAnswers||0,c:C.gold,bg:"#1a1608"},{lbl:"Správných",val:ds.correctAnswers||0,c:C.ok,bg:C.okBg},{lbl:"Kol hotovo",val:ds.roundsCompleted||0,c:"#7090c8",bg:"#121a2e"}];
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column"}}>
      <style>{STYLE}</style>
      {showAdd&&<AddWordModal onClose={()=>setShowAdd(false)} onAdd={onAddWord}/>}
      {showStats&&<StatsModal deck={deck} onClose={()=>setShowStats(false)}/>}
      <div style={{position:"sticky",top:0,zIndex:10,background:C.bg,borderBottom:`1px solid #1a1f2e`,padding:"1rem 1.5rem"}}>
        <div style={{maxWidth:1020,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"0.9rem",flexWrap:"wrap"}}>
            <button className="btn" onClick={onBack} style={{color:C.muted,fontSize:13,flexShrink:0}}>← Balíčky</button>
            <div style={{flex:1,fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{deck.name}</div>
            <button className="btn" onClick={()=>setShowStats(true)} style={{border:`1px solid #2a3555`,color:"#7090c8",borderRadius:8,padding:"7px 13px",fontSize:13,cursor:"pointer",flexShrink:0}}>📊 Statistika</button>
            <button className="btn" onClick={()=>setShowAdd(true)} style={{border:`1px solid #2e4060`,color:"#7090b8",borderRadius:8,padding:"7px 13px",fontSize:13,cursor:"pointer",flexShrink:0}}>+ Přidat slovo</button>
            <button className="btn" onClick={onDeleteDeck} style={{border:"1px solid #3a1515",color:"#7a4040",borderRadius:8,padding:"7px 13px",fontSize:13,cursor:"pointer",flexShrink:0}}>Smazat</button>
            <button className="btn" onClick={onStart} disabled={!deck.words.length} style={{background:deck.words.length?C.gold:"#2a2a1a",color:deck.words.length?C.bg:"#5a5030",borderRadius:10,padding:"9px 20px",fontSize:14,fontWeight:700,cursor:deck.words.length?"pointer":"default",flexShrink:0,transition:"all .2s"}}>Začít učení ▶</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
            {statItems.map(({lbl,val,c,bg})=><div key={lbl} style={{background:bg,borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:10,color:c,textTransform:"uppercase",letterSpacing:.7,marginBottom:2}}>{lbl}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:c}}>{val}</div></div>)}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1020,margin:"0 auto",width:"100%",padding:"0.9rem 1.5rem 0",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:C.mutedDark,textTransform:"uppercase",letterSpacing:2,flexShrink:0}}>Řadit:</span>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{WORD_SORTS.map(s=><button key={s.id} className="btn" onClick={()=>setWSort(s.id)} style={{background:wSort===s.id?"#1a2a40":"transparent",border:`1px solid ${wSort===s.id?"#2e4565":C.border}`,color:wSort===s.id?C.gold:C.muted,borderRadius:7,padding:"4px 11px",fontSize:12,cursor:"pointer",transition:"all .2s"}}>{s.label}</button>)}</div>
      </div>
      <div style={{maxWidth:1020,margin:"0 auto",width:"100%",padding:"1rem 1.5rem 2rem",display:"flex",flexDirection:"column",gap:5}}>
        <div style={{display:"grid",gridTemplateColumns:"28px 1fr 1fr 1.5fr 1fr 28px",gap:4,padding:"0 10px 5px",color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:2}}>
          <span style={{textAlign:"center"}}>#</span><span>Anglicky</span><span>Česky</span><span>Příkladová věta</span><span>Synonyma</span><span/>
        </div>
        {sorted.map((w,i)=>(
          <div key={w.id} style={{display:"grid",gridTemplateColumns:"28px 1fr 1fr 1.5fr 1fr 28px",gap:4,background:C.card,border:`1px solid ${C.border}`,borderRadius:9,alignItems:"center"}}>
            <span style={{fontSize:11,color:C.muted,textAlign:"center"}}>{i+1}</span>
            <input className="tdinp" value={w.en} placeholder="anglicky…" onChange={e=>onUpdate(w.id,"en",e.target.value)}/>
            <input className="tdinp" value={w.cs} placeholder="česky…" onChange={e=>onUpdate(w.id,"cs",e.target.value)}/>
            <input className="tdinp" value={w.example||""} placeholder="příkladová věta…" onChange={e=>onUpdate(w.id,"example",e.target.value)}/>
            <input className="tdinp" value={w.synonyms||""} placeholder="synonyma / var…" onChange={e=>onUpdate(w.id,"synonyms",e.target.value)}/>
            <button className="btn" onClick={()=>onDeleteWord(w.id)} style={{color:"#3a2020",fontSize:19,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 6px",height:"100%",borderRadius:"0 9px 9px 0",transition:"color .15s"}} onMouseEnter={e=>e.currentTarget.style.color="#c87070"} onMouseLeave={e=>e.currentTarget.style.color="#3a2020"}>×</button>
          </div>
        ))}
        <button className="btn" onClick={()=>setShowAdd(true)} style={{border:`1.5px dashed #2e3447`,borderRadius:9,padding:"10px",color:C.muted,fontSize:14,cursor:"pointer",transition:"all .2s",textAlign:"center"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#2e3447";e.currentTarget.style.color=C.muted;}}>+ Přidat slovíčko</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ROUND END
══════════════════════════════════════════════════════════════ */
function RoundEnd({stats,total,deckName,onNext,onBack}) {
  const pct=total?Math.round(stats.ok/total*100):0;
  const em=pct>=90?"🏆":pct>=70?"👏":pct>=50?"💪":"📚";
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem"}}>
      <style>{STYLE}</style>
      <div className="card-in" style={{width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:54,marginBottom:10}}>{em}</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:C.gold,marginBottom:5}}>Kolo dokončeno!</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:28,fontStyle:"italic"}}>{deckName}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:26}}>
          {[{lbl:"Správně",val:stats.ok,bg:C.okBg,c:C.ok},{lbl:"Špatně",val:stats.bad,bg:C.errBg,c:C.err},{lbl:"Úspěšnost",val:`${pct}%`,bg:"#1a2038",c:"#7090c8"}].map(({lbl,val,bg,c})=>(
            <div key={lbl} style={{background:bg,borderRadius:12,padding:"1rem 0.5rem"}}><div style={{fontSize:11,color:c,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>{lbl}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:c}}>{val}</div></div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          <button className="btn" onClick={onNext} style={{background:C.gold,border:"none",color:C.bg,borderRadius:11,padding:"13px",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"'Playfair Display',serif"}}>Další kolo →</button>
          <button className="btn" onClick={onBack} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:11,padding:"11px",fontSize:14,cursor:"pointer"}}>Zpět na seznam slovíček</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════════ */
export default function LexiCard() {
  const [decks,setDecks]=useState([]);
  const [langs,setLangs]=useState(DEFAULT_LANGS);
  const [screen,setScreen]=useState("home");
  const [deckId,setDeckId]=useState(null);
  const [activeLang,setLang]=useState("en");
  const [loaded,setLoaded]=useState(false);

  const [mode,setMode]=useState("en-cs");
  const [rWords,setRWords]=useState([]);
  const [rIdx,setRIdx]=useState(0);
  const [rStats,setRStats]=useState({ok:0,bad:0});
  const [feedback,setFB]=useState(null);
  const [listenOn,setListen]=useState(false);
  const [tx,setTx]=useState("");
  const [micSt,setMicSt]=useState("idle");
  const [micErr,setMicErr]=useState("");
  const [iMode,setIMode]=useState("mic");
  const [typed,setTyped]=useState("");
  const [autoPlay,setAutoPlay]=useState(true);
  const [pronAtt,setPronAtt]=useState(0);
  const [evalLoading,setEvalLoading]=useState(false);

  const recRef=useRef(null);
  const streamRef=useRef(null);
  const synthRef=useRef(window.speechSynthesis);

  useEffect(()=>{
    try{const raw=localStorage.getItem("lc4_data");if(raw){const d=JSON.parse(raw);if(d.decks)setDecks(d.decks);if(d.lang)setLang(d.lang);if(d.langs)setLangs(prev=>{const ids=new Set(prev.map(l=>l.id));return[...prev,...d.langs.filter(l=>!ids.has(l.id))];});}}catch{}
    setLoaded(true);
  },[]);
  useEffect(()=>{if(loaded){try{localStorage.setItem("lc4_data",JSON.stringify({decks,lang:activeLang,langs:langs.filter(l=>l.custom)}));}catch{}}},[decks,activeLang,langs,loaded]);

  const deck=decks.find(d=>d.id===deckId)??null;

  function loadFile(file){
    const name=file.name.replace(/\.[^.]+$/,"");
    const rd=new FileReader();
    rd.onload=e=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
        const words=rows.filter(r=>r[0]&&r[1]).map(r=>({
          id:uid(),en:String(r[0]).trim(),cs:String(r[1]).trim(),
          example:r[2]?String(r[2]).trim():"",
          synonyms:r[3]?String(r[3]).trim():"",
          score:0,addedAt:now(),wStats:{total:0,correct:0,wrong:0},
        }));
        if(!words.length){alert("Žádná slovíčka nenalezena.");return;}
        const d={id:uid(),name,lang:activeLang,words,createdAt:now(),deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0}};
        setDecks(ds=>[...ds,d]);setDeckId(d.id);setScreen("deck");
      }catch{alert("Nepodařilo se načíst soubor.");}
    };
    rd.readAsArrayBuffer(file);
  }

  const updWord=(wid,field,val)=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.map(w=>w.id!==wid?w:{...w,[field]:val})}));
  function addWord({en,cs,example,synonyms}){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:[...d.words,{id:uid(),en,cs,example,synonyms:synonyms||"",score:0,addedAt:now(),wStats:{total:0,correct:0,wrong:0}}]}));}
  const delWord=wid=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.filter(w=>w.id!==wid)}));
  function delDeck(){if(!window.confirm("Smazat tento balíček?"))return;setDecks(ds=>ds.filter(d=>d.id!==deckId));setScreen("home");}
  function addLang(l){setLangs(ls=>[...ls,l]);setLang(l.id);}

  function clearCard(){setFB(null);setTx("");setMicErr("");setTyped("");setPronAtt(0);setEvalLoading(false);}
  function startStudy(){if(!deck?.words?.length)return;setRWords(pickRound(deck.words));setRIdx(0);setRStats({ok:0,bad:0});clearCard();setScreen("study");}
  function nextCard(){
    clearCard();
    const nxt=rIdx+1;
    if(nxt>=rWords.length){
      setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+rStats.ok+rStats.bad,correctAnswers:(d.deckStats?.correctAnswers??0)+rStats.ok,roundsCompleted:(d.deckStats?.roundsCompleted??0)+1}}));
      setScreen("roundEnd");
    } else setRIdx(nxt);
  }
  function nextRound(){setRWords(pickRound(deck.words));setRIdx(0);setRStats({ok:0,bad:0});clearCard();setScreen("study");}

  useEffect(()=>{
    if(screen==="study"&&rWords[rIdx]&&!feedback&&autoPlay){
      const w=rWords[rIdx];
      const lang=mode==="cs-en"?"cs-CZ":"en-US";
      const text=mode==="en-cs"?w.en:mode==="cs-en"?w.cs:w.en;
      const t=setTimeout(()=>doSpeak(synthRef.current,text,lang),350);
      return()=>clearTimeout(t);
    }
  },[rIdx,mode,screen,feedback,autoPlay]);

  async function startListen(lang){
    setMicErr("");
    if(micSt!=="ready"){
      setMicSt("requesting");
      try{streamRef.current=await navigator.mediaDevices.getUserMedia({audio:true});setMicSt("ready");}
      catch(err){setMicSt("error");setMicErr(err.name==="NotAllowedError"?"Přístup k mikrofonu zamítnut.":err.name==="NotFoundError"?"Mikrofon nenalezen.":`Chyba: ${err.message}`);return;}
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setMicErr("Rozpoznávání řeči funguje pouze v Chrome/Edge.");return;}
    const rec=new SR();
    rec.lang=lang;rec.continuous=false;rec.interimResults=true;
    rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join("");setTx(t);if(e.results[e.results.length-1].isFinal){evalAnswer(t);rec.stop();}};
    rec.onerror=ev=>{if(ev.error!=="aborted")setMicErr({"not-allowed":"Mikrofon blokován.","service-not-allowed":"Rozpoznávání blokováno — zkus textový režim.","no-speech":"Nic nezaznamenáno.","network":"Chyba sítě."}[ev.error]??`Chyba: ${ev.error}`);setListen(false);};
    rec.onend=()=>setListen(false);
    recRef.current=rec;rec.start();setListen(true);
  }
  function stopListen(){recRef.current?.stop();setListen(false);}

  /* ── Smart answer evaluation ── */
  async function evalAnswer(text){
    const w=rWords[rIdx];if(!w||feedback)return;

    if(mode==="pron"){
      // combine cs and synonyms for pron check too
      const allVariants=w.en;
      const ok=localMatch(text,allVariants)||localMatch(text,w.en);
      if(ok){commitAnswer(w,true,text);return;}
      const att=pronAtt+1;
      if(att>=3){commitAnswer(w,false,text,true);}
      else{setPronAtt(att);setTx("");setTimeout(()=>doSpeak(synthRef.current,w.en,"en-US"),300);}
      return;
    }

    // Build all accepted answers: cs field (may contain synonyms) + synonyms field
    const expectedField = mode==="en-cs"
      ? (w.cs + (w.synonyms ? " / " + w.synonyms : ""))
      : (w.en + (w.synonyms ? " / " + w.synonyms : ""));

    // 1. Fast local check
    if(localMatch(text, expectedField)){commitAnswer(w,true,text);return;}

    // 2. Claude API semantic check (async)
    setEvalLoading(true);
    const sourceWord = mode==="en-cs" ? w.en : w.cs;
    const apiResult = await claudeEval(text, expectedField, sourceWord, mode);
    setEvalLoading(false);

    if(apiResult===true){commitAnswer(w,true,text,"ai");return;}
    if(apiResult===false){commitAnswer(w,false,text);return;}

    // 3. API unavailable — fall back to local result (already false)
    commitAnswer(w,false,text);
  }

  function commitAnswer(w,ok,given,source="local",forced=false){
    const isForced=source===true||forced;
    setFB({ok,answer:mode==="en-cs"?w.cs:w.en,given,forced:isForced,mode,aiEval:source==="ai"});
    setRStats(s=>({ok:s.ok+(ok?1:0),bad:s.bad+(ok?0:1)}));
    setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,
      words:d.words.map(dw=>dw.id!==w.id?dw:{...dw,score:ok?(dw.score??0)+1:Math.max(0,(dw.score??0)-2),wStats:{total:(dw.wStats?.total??0)+1,correct:(dw.wStats?.correct??0)+(ok?1:0),wrong:(dw.wStats?.wrong??0)+(ok?0:1)}}),
      deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+1,correctAnswers:(d.deckStats?.correctAnswers??0)+(ok?1:0),roundsCompleted:d.deckStats?.roundsCompleted??0},
    }));
  }
  function submitTyped(){if(typed.trim())evalAnswer(typed.trim());}
  function dontKnow(){
    const w=rWords[rIdx];if(!w||feedback)return;
    const ans=mode==="en-cs"?w.cs:w.en;
    const lang=mode==="en-cs"?"cs-CZ":"en-US";
    commitAnswer(w,false,"","manual");
    doSpeak(synthRef.current,ans,lang);
  }

  if(!loaded)return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:32,height:32,border:"3px solid #2e3447",borderTopColor:C.gold,borderRadius:"50%",animation:"spin .8s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if(screen==="home") return <HomeScreen decks={decks} langs={langs} activeLang={activeLang} onLangSwitch={setLang} onAddLang={addLang} onSelect={id=>{setDeckId(id);setScreen("deck");}} onFileUpload={loadFile}/>;
  if(screen==="deck"&&deck) return <DeckScreen deck={deck} onBack={()=>setScreen("home")} onStart={startStudy} onUpdate={updWord} onAddWord={addWord} onDeleteWord={delWord} onDeleteDeck={delDeck}/>;
  if(screen==="roundEnd") return <RoundEnd stats={rStats} total={rWords.length} deckName={deck?.name??""} onNext={nextRound} onBack={()=>setScreen("deck")}/>;

  /* ══ STUDY ══ */
  const w=rWords[rIdx];if(!w)return null;
  const isPron=mode==="pron";
  const question=mode==="en-cs"?w.en:mode==="cs-en"?w.cs:w.en;
  const qLang=mode==="cs-en"?"cs-CZ":"en-US";
  const aLang=mode==="en-cs"?"cs-CZ":"en-US";
  const micLang=mode==="en-cs"?"cs-CZ":mode==="cs-en"?"en-US":"en-US";
  const total=rStats.ok+rStats.bad;
  const pct=total?Math.round(rStats.ok/total*100):0;
  // Show synonyms hint under card
  const allSynonyms=[...parseSynonyms(mode==="en-cs"?w.cs:w.en).slice(1),...parseSynonyms(w.synonyms||"")].join(" · ");

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column",alignItems:"center"}}>
      <style>{STYLE}</style>
      <div style={{width:"100%",maxWidth:680,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.9rem 1.5rem",borderBottom:`1px solid #1a1f2e`,gap:12}}>
        <button className="btn" onClick={()=>setScreen("deck")} style={{color:C.muted,fontSize:13,flexShrink:0}}>← {deck?.name}</button>
        <div style={{flex:1,maxWidth:150}}>
          <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:3}}>Kolo {rIdx+1} / {rWords.length}</div>
          <div style={{background:"#1a2030",borderRadius:3,height:3}}><div style={{width:`${((rIdx+1)/rWords.length)*100}%`,height:"100%",background:C.gold,borderRadius:3,transition:"width .3s"}}/></div>
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          {[{bg:C.okBg,c:C.ok,t:`✓ ${rStats.ok}`},{bg:C.errBg,c:C.err,t:`✗ ${rStats.bad}`},...(total>0?[{bg:"#1a2038",c:"#7090c8",t:`${pct}%`}]:[])].map(({bg,c,t},i)=><span key={i} style={{background:bg,color:c,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:500}}>{t}</span>)}
        </div>
        <button className="btn" onClick={()=>setAutoPlay(a=>!a)} style={{background:autoPlay?"#1a2e20":"#1a1a1a",border:`1px solid ${autoPlay?"#2a5030":"#2e3447"}`,color:autoPlay?"#6acf90":C.muted,borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer",flexShrink:0,transition:"all .2s"}}>
          {autoPlay?"🔊":"🔇"}
        </button>
      </div>

      <div style={{width:"100%",maxWidth:680,padding:"0.8rem 1.5rem 0",display:"flex",gap:7}}>
        {MODES.map(m=><button key={m.id} className="btn" onClick={()=>{setMode(m.id);clearCard();}} style={{flex:1,background:mode===m.id?"#1e2a45":C.card,border:`1.5px solid ${mode===m.id?"#3a5080":C.border}`,color:mode===m.id?C.gold:"#6a7080",borderRadius:9,padding:"7px 4px",fontSize:13,cursor:"pointer",transition:"all .2s"}}>{m.label}</button>)}
      </div>

      <div style={{flex:1,width:"100%",maxWidth:680,display:"flex",flexDirection:"column",alignItems:"center",padding:"1.2rem 1.5rem",gap:"0.9rem"}}>
        {/* card */}
        <div key={w.id+mode} className="card-in" style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"1.3rem 2rem",textAlign:"center"}}>
          {isPron?(
            <>
              <div style={{fontSize:10,color:"#3e6850",textTransform:"uppercase",letterSpacing:3,marginBottom:8}}>🔊 Výslovnost</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:6}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,fontWeight:700,color:C.text,lineHeight:1.2}}>{w.en}</div>
                <button className="btn" onClick={()=>doSpeak(synthRef.current,w.en,"en-US")} style={{border:`1px solid #2a5030`,color:"#6acf90",borderRadius:"50%",width:30,height:30,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔊</button>
              </div>
              {w.cs&&<div style={{fontSize:12,color:"#4a6050",fontStyle:"italic",marginBottom:4}}>{parseSynonyms(w.cs)[0]}</div>}
              {pronAtt>0&&!feedback&&<div style={{fontSize:12,color:pronAtt>=2?C.err:"#c89040",marginTop:4}}>{pronAtt===1?"Pokus 2/3":"Poslední pokus 3/3"}</div>}
            </>
          ):(
            <>
              <div style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:3,marginBottom:8}}>{mode==="en-cs"?"🇬🇧 Anglicky":"🇨🇿 Česky"}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:6}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:700,color:C.text,lineHeight:1.2}}>{question}</div>
                <button className="btn" onClick={()=>doSpeak(synthRef.current,question,qLang)} style={{border:`1px solid #2e3447`,color:"#6a7888",borderRadius:"50%",width:28,height:28,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔊</button>
              </div>
              {w.example&&!feedback&&<div style={{fontSize:11,color:"#3a4a50",fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:8}}>💡 „{w.example}"</div>}
            </>
          )}
          <div style={{display:"flex",justifyContent:"center",gap:5,marginTop:10}}>
            {[0,1,2,3,4].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",transition:"background .3s",background:i<(w.score??0)?C.gold:"#1e2535"}}/>)}
          </div>
        </div>

        {/* input toggle */}
        {!feedback&&!isPron&&(
          <div style={{display:"flex",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:3,gap:3}}>
            {[["mic","🎤 Mikrofon"],["text","⌨️ Psát"]].map(([m,lbl])=>(
              <button key={m} className="btn" onClick={()=>{setIMode(m);setMicErr("");setTx("");}} style={{background:iMode===m?"#1e2a45":"transparent",border:iMode===m?"1px solid #2e4065":"1px solid transparent",color:iMode===m?C.gold:"#6a7080",borderRadius:7,padding:"5px 16px",fontSize:13,cursor:"pointer",transition:"all .2s"}}>{lbl}</button>
            ))}
          </div>
        )}

        {/* loading indicator */}
        {evalLoading&&(
          <div className="thinking" style={{fontSize:13,color:C.gold,textAlign:"center",padding:"4px 0"}}>
            🤖 Vyhodnocuji odpověď…
          </div>
        )}

        {/* answer area */}
        {!feedback&&!evalLoading?(
          <div className="fade-up" style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:9}}>
            {(iMode==="mic"||isPron)&&(<>
              {micErr&&<div style={{width:"100%",background:"#200e0e",border:`1px solid #5a2020`,borderRadius:9,padding:"9px 13px",fontSize:12,color:"#e08080",lineHeight:1.6}}>⚠️ {micErr}{!isPron&&<button className="btn" onClick={()=>setIMode("text")} style={{marginLeft:8,background:C.gold,color:C.bg,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Psát</button>}</div>}
              {micSt==="requesting"&&<div style={{color:"#8a9060",fontSize:12}}>Žádám o přístup k mikrofonu…</div>}
              <div style={{color:C.muted,fontSize:12,minHeight:20,textAlign:"center",display:"flex",alignItems:"center",gap:7,justifyContent:"center"}}>
                {listenOn?(<><span style={{display:"flex",alignItems:"flex-end",height:18}}>{[1,2,3,4,5].map(i=><span key={i} className="wv" style={{height:5}}/>)}</span>{tx?`„${tx}"`:isPron?"Řekni slovo anglicky…":`Říkejte ${mode==="en-cs"?"česky":"anglicky"}…`}</>):tx?`„${tx}"`:isPron?"Klikni na 🎤 a zopakuj slovo":`Řekněte překlad ${mode==="en-cs"?"česky":"anglicky"}`}
              </div>
              <button onClick={listenOn?stopListen:()=>startListen(micLang)} className={`btn${listenOn?" mic-on":""}`}
                style={{width:68,height:68,borderRadius:"50%",fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:listenOn?"#c49840":"#141c2e",border:`2.5px solid ${listenOn?C.gold:"#2e3447"}`,color:listenOn?C.bg:"#7a8888",transition:"all .2s"}}>
                {listenOn?"⏹":"🎤"}
              </button>
            </>)}
            {iMode==="text"&&!isPron&&(
              <div style={{width:"100%",display:"flex",flexDirection:"column",gap:7}}>
                <input className="inp" value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitTyped();}} placeholder={mode==="en-cs"?"česky…":"anglicky…"} autoFocus/>
                <button className="btn" onClick={submitTyped} style={{background:typed.trim()?C.gold:"#1a2030",color:typed.trim()?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"11px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Playfair Display',serif",transition:"all .2s"}}>Zkontrolovat →</button>
              </div>
            )}
            {!isPron&&(
              <button className="btn" onClick={dontKnow} style={{border:`1.5px solid #3d3020`,background:"#1a1508",color:"#c8a050",borderRadius:9,padding:"9px 24px",fontSize:13,cursor:"pointer",fontWeight:500,transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#3d3020";e.currentTarget.style.color="#c8a050";}}>
                Nevím — ukázat &amp; přečíst 🔈
              </button>
            )}
          </div>
        ):!evalLoading&&feedback?(
          <div className="fade-up" style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{width:"100%",background:feedback.ok?C.okBg:C.errBg,border:`1px solid ${feedback.ok?C.okBorder:C.errBorder}`,borderRadius:14,padding:"1rem 1.4rem",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:32,flexShrink:0}}>{feedback.ok?"✓":"✗"}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700,color:feedback.ok?C.ok:C.err,marginBottom:5,display:"flex",alignItems:"center",gap:8}}>
                  {feedback.ok?(isPron?"Výborná výslovnost!":"Správně!"):(feedback.forced?"3× špatně — další slovíčko":(isPron?"Zkus příště":"Špatně"))}
                  {feedback.aiEval&&<span style={{fontSize:10,background:"#1a2a1a",color:"#5a9060",borderRadius:20,padding:"2px 8px",letterSpacing:.5}}>🤖 AI</span>}
                </div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.text}}>{parseSynonyms(feedback.answer)[0]||feedback.answer}</div>
                {/* show all accepted variants */}
                {allSynonyms&&<div style={{fontSize:11,color:"#5a6a50",marginTop:4}}>✓ také: {allSynonyms}</div>}
                {isPron&&w.cs&&<div style={{fontSize:12,color:"#5a7060",marginTop:2}}>🇨🇿 {parseSynonyms(w.cs)[0]}</div>}
                {w.example&&<div style={{fontSize:11,color:"#3a4a50",fontStyle:"italic",marginTop:6}}>💡 „{w.example}"</div>}
                {!feedback.ok&&feedback.given&&<div style={{fontSize:11,color:"#4a4030",marginTop:4,fontStyle:"italic"}}>Vaše odpověď: „{feedback.given}"</div>}
              </div>
              <button className="btn" onClick={()=>doSpeak(synthRef.current,parseSynonyms(feedback.answer)[0]||feedback.answer,aLang)} style={{border:`1px solid #2e3447`,color:"#6a7888",borderRadius:"50%",width:32,height:32,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔊</button>
            </div>
            <button className="btn" onClick={nextCard} style={{background:C.gold,border:"none",color:C.bg,borderRadius:11,padding:"12px 40px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Playfair Display',serif"}}>
              {rIdx+1>=rWords.length?"Dokončit kolo ✓":"Další →"}
            </button>
          </div>
        ):null}
      </div>
    </div>
  );
}
