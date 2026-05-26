import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

/* ─── SM-2 Spaced Repetition ─────────────────────────────────── */
function sm2Update(word, quality) {
  const ef = Math.max(1.3, (word.ef??2.5)+0.1-(5-quality)*(0.08+(5-quality)*0.02));
  const reps = quality<3 ? 0 : (word.reps??0)+1;
  const iv = quality<3 ? 1 : reps<=1 ? 1 : reps===2 ? 6 : Math.round((word.iv??1)*ef);
  return { ef, reps, iv, nextReview: Date.now()+iv*86400000 };
}
function pickRound(words, n=20) {
  const t=Date.now();
  const arr=[...words].map(w=>{
    const due=!w.nextReview||w.nextReview<=t;
    return {w, urgency: due?(t-(w.nextReview??0)+Math.random()*3600000):(-(w.nextReview-t)+Math.random()*1800000)};
  });
  arr.sort((a,b)=>b.urgency-a.urgency);
  return arr.slice(0,Math.min(n,arr.length)).map(x=>x.w);
}
function dueCount(words) { const t=Date.now(); return words.filter(w=>!w.nextReview||w.nextReview<=t).length; }

/* ─── XP & Levels ────────────────────────────────────────────── */
const LVL_XP=[0,100,250,500,1000,2000,4000,7500,13000,22000,36000];
const LVL_NAMES=["Začátečník","Learner","Student","Pokročilý","Expert","Mistr","Šampion","Legenda","Guru","Virtuóz","Mistr světa"];
function getLevel(xp) {
  let lv=0; while(lv<LVL_XP.length-1&&xp>=LVL_XP[lv+1]) lv++;
  const curr=LVL_XP[lv], next=LVL_XP[lv+1]??LVL_XP[lv]*2;
  return {level:lv+1, name:LVL_NAMES[lv]??"Legenda", curr, next, pct:Math.min(100,Math.round((xp-curr)/(next-curr)*100))};
}
function calcXP(quality, combo, isFlip=false) {
  if(quality<3) return 0;
  if(isFlip) return 1; // karty: 1 XP za správně, 0 za tuším/nevím
  const base = quality===5 ? 10 : 5;
  const mult = quality<5 ? 1 : combo>=10?3:combo>=5?2:combo>=3?1.5:1;
  return Math.round(base*mult);
}
function comboInfo(n) {
  if(n>=10) return {txt:"🔥 MEGA",color:"#ff6b35",mult:"×3"};
  if(n>=5)  return {txt:"⚡ SUPER",color:"#d4a853",mult:"×2"};
  if(n>=3)  return {txt:"✨ COMBO",color:"#7090c8",mult:"×1.5"};
  return null;
}
function checkStreak(gs) {
  const today=new Date().toDateString();
  const last=gs.lastStudyDate;
  if(last===today) return gs;
  const yesterday=new Date(Date.now()-86400000).toDateString();
  const newStreak=last===yesterday?(gs.dailyStreak??0)+1:1;
  return {...gs, dailyStreak:newStreak, lastStudyDate:today};
}

/* ─── Dictionary API ─────────────────────────────────────────── */
const _dc=new Map();
async function fetchDict(word) {
  const k=word.toLowerCase().trim();
  if(_dc.has(k)) return _dc.get(k);
  try {
    const r=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(k)}`);
    if(!r.ok){_dc.set(k,null);return null;}
    const d=await r.json(), e=d[0];
    const ipa=e.phonetics?.find(p=>p.text)?.text??null;
    const audio=e.phonetics?.find(p=>p.audio&&p.audio.length>4)?.audio??null;
    const ex=e.meanings?.[0]?.definitions?.[0]?.example??null;
    const res={ipa,audio,example:ex};
    _dc.set(k,res); return res;
  } catch {_dc.set(k,null);return null;}
}
function playAudio(url){try{new Audio(url).play();}catch{}}

/* ─── Helpers ────────────────────────────────────────────────── */
const uid=()=>Math.random().toString(36).slice(2,9);
const now=()=>Date.now();
function norm(t){return(t||"").normalize("NFD").replace(/\p{Mn}/gu,"").toLowerCase().replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();}
function parseSyn(f){return(f||"").split(/[\/,]/).map(s=>s.trim()).filter(Boolean);}
function localMatch(input,field){
  const s=norm(input);
  for(const c of parseSyn(field)){
    const e=norm(c);if(!e)continue;
    if(s===e)return true;
    const ew=e.split(" "),sw=s.split(" ");
    if(ew.length===1&&sw.some(w=>w===ew[0]))return true;
    if(sw.length===1&&ew.some(w=>w===sw[0]))return true;
    if(ew.length>1&&ew.filter(w=>sw.includes(w)).length/ew.length>=0.72)return true;
    if(ew.length===1&&sw.length===1&&lev(s,e)<=Math.floor(e.length*0.25))return true;
    const a=sw.filter(w=>w!=="se"&&w!=="si").join(" "),b=ew.filter(w=>w!=="se"&&w!=="si").join(" ");
    if(a&&b&&a===b)return true;
  }
  return false;
}
function lev(a,b){
  const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i?j?0:i:j));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
function playSound(type){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(type==="ok"){[[523,0,.1],[659,.08,.25],[784,.18,.42]].forEach(([f,s,e])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.value=f;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(0,ctx.currentTime+s);g.gain.linearRampToValueAtTime(.18,ctx.currentTime+s+.04);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+e+.15);o.start(ctx.currentTime+s);o.stop(ctx.currentTime+e+.2);});}
    else{[[330,0,.15],[277,.12,.32]].forEach(([f,s,e])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.value=f;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(0,ctx.currentTime+s);g.gain.linearRampToValueAtTime(.12,ctx.currentTime+s+.04);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+e+.18);o.start(ctx.currentTime+s);o.stop(ctx.currentTime+e+.22);});}
  }catch{}
}
function doSpeak(synth,text,lang){if(!synth||!text)return;synth.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=0.82;synth.speak(u);}
function sortWords(w,k){const a=[...w];if(k==="en-asc")return a.sort((a,b)=>a.en.localeCompare(b.en));if(k==="en-desc")return a.sort((a,b)=>b.en.localeCompare(a.en));if(k==="cs-asc")return a.sort((a,b)=>a.cs.localeCompare(b.cs));if(k==="cs-desc")return a.sort((a,b)=>b.cs.localeCompare(a.cs));if(k==="date-asc")return a.sort((a,b)=>(a.addedAt??0)-(b.addedAt??0));if(k==="date-desc")return a.sort((a,b)=>(b.addedAt??0)-(a.addedAt??0));return a;}
function sortDecks(d,k){const a=[...d];if(k==="name-asc")return a.sort((a,b)=>a.name.localeCompare(b.name));if(k==="name-desc")return a.sort((a,b)=>b.name.localeCompare(a.name));if(k==="date-asc")return a.sort((a,b)=>(a.createdAt??0)-(b.createdAt??0));if(k==="date-desc")return a.sort((a,b)=>(b.createdAt??0)-(a.createdAt??0));return a;}
function sortStats(w,k){const a=[...w];const wt=x=>x.wStats?.total??0,wc=x=>x.wStats?.correct??0,ww=x=>x.wStats?.wrong??0,pct=x=>wt(x)?(wc(x)/wt(x)):0;if(k==="en-asc")return a.sort((a,b)=>a.en.localeCompare(b.en));if(k==="en-desc")return a.sort((a,b)=>b.en.localeCompare(a.en));if(k==="total-desc")return a.sort((a,b)=>wt(b)-wt(a));if(k==="total-asc")return a.sort((a,b)=>wt(a)-wt(b));if(k==="correct-desc")return a.sort((a,b)=>wc(b)-wc(a));if(k==="wrong-desc")return a.sort((a,b)=>ww(b)-ww(a));if(k==="pct-desc")return a.sort((a,b)=>pct(b)-pct(a));if(k==="pct-asc")return a.sort((a,b)=>pct(a)-pct(b));if(k==="score-desc")return a.sort((a,b)=>(b.score??0)-(a.score??0));return a;}

/* ─── Sample deck ────────────────────────────────────────────── */
const SAMPLE_WORDS=[
  {en:"hello",cs:"ahoj",example:"Hello, how are you?"},
  {en:"goodbye",cs:"sbohem / čau",example:"Goodbye, see you soon!"},
  {en:"thank you",cs:"děkuji",example:"Thank you for your help."},
  {en:"please",cs:"prosím",example:"Please pass the salt."},
  {en:"house",cs:"dům",example:"They live in a big house."},
  {en:"water",cs:"voda",example:"Drink plenty of water."},
  {en:"friend",cs:"přítel / kamarád",example:"She is my best friend."},
  {en:"beautiful",cs:"krásný",example:"What a beautiful sunset."},
  {en:"happy",cs:"šťastný",example:"I am very happy today."},
  {en:"time",cs:"čas",example:"Time is precious."},
  {en:"love",cs:"láska / milovat",example:"Love conquers all."},
  {en:"work",cs:"práce / pracovat",example:"She works very hard."},
];

/* ─── Constants ──────────────────────────────────────────────── */
const DEFAULT_LANGS=[
  {id:"en",label:"Angličtina",flag:"🇬🇧",code:"ENG",nativeCode:"CZ",studyCode:"ENG"},
  {id:"es",label:"Španělština",flag:"🇪🇸",code:"ESP",nativeCode:"CZ",studyCode:"ESP"},
];
const MODES=[
  {id:"transl",label:"🔤 Překlad",hint:"přeložit slovo"},
  {id:"pron",  label:"🔊 Výslovnost",hint:"opakuj slova"},
  {id:"flip",  label:"🃏 Karty",hint:"překlop & ohodnoť"},
];
const DECK_SORTS=[{id:"date-desc",label:"Nejnovější"},{id:"date-asc",label:"Nejstarší"},{id:"name-asc",label:"A–Z"},{id:"name-desc",label:"Z–A"}];
const WORD_SORTS=[{id:"date-asc",label:"Pořadí"},{id:"en-asc",label:"EN ↑"},{id:"en-desc",label:"EN ↓"},{id:"cs-asc",label:"CS ↑"},{id:"cs-desc",label:"CS ↓"},{id:"date-desc",label:"Datum ↓"}];
const STAT_COLS=[{id:"en-asc",label:"Slovo ↑"},{id:"total-desc",label:"Procvičeno ↓"},{id:"total-asc",label:"Procvičeno ↑"},{id:"correct-desc",label:"Správně ↓"},{id:"wrong-desc",label:"Špatně ↓"},{id:"pct-desc",label:"Úsp. ↓"},{id:"pct-asc",label:"Úsp. ↑"},{id:"score-desc",label:"Skóre ↓"}];
const C={bg:"#0b0f16",card:"#111622",border:"#1e2535",gold:"#d4a853",goldDim:"#7a5818",text:"#f0e6d3",textDim:"#9a9080",muted:"#5a6070",mutedDark:"#3e4455",ok:"#5cb88a",okBg:"#0f2018",okBorder:"#255030",err:"#c87070",errBg:"#200e0e",errBorder:"#4a1a1a"};

/* ─── Styles ─────────────────────────────────────────────────── */
const STYLE=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html{background:#0b0f16;height:-webkit-fill-available;}
  body{background:#0b0f16;overflow-x:hidden;max-width:100vw;min-height:100vh;min-height:-webkit-fill-available;overscroll-behavior:none;-webkit-overflow-scrolling:touch;}
  #root,#__next{background:#0b0f16;min-height:100vh;min-height:-webkit-fill-available;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes cardIn{from{opacity:0;transform:scale(.97) translateY(5px)}to{opacity:1;transform:scale(1)}}
  @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,168,83,.5)}55%{box-shadow:0 0 0 18px rgba(212,168,83,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes wave{0%,100%{height:5px}50%{height:18px}}
  @keyframes overlayIn{from{opacity:0}to{opacity:1}}
  @keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes flashOk{0%{background:#0f2018}50%{background:#1a4030}100%{background:#0f2018}}
  @keyframes flashWarn{0%{background:#1e1a0a}50%{background:#3a3010}100%{background:#1e1a0a}}
  @keyframes flashBad{0%{background:#200e0e}50%{background:#3a1a1a}100%{background:#200e0e}}
  .fade-up{animation:fadeUp .22s ease both}
  .card-in{animation:cardIn .28s ease both}
  .mic-on{animation:micPulse 1.2s ease-in-out infinite}
  .flash-ok{animation:flashOk .4s ease}
  .flash-warn{animation:flashWarn .4s ease}
  .flash-bad{animation:flashBad .4s ease}
  .btn{cursor:pointer;transition:filter .15s,transform .1s;border:none;font-family:'Lora',serif;background:transparent;}
  .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
  .btn:active{transform:translateY(0) scale(.97)}
  .inp{width:100%;background:#0e1320;border:1.5px solid #2e3447;color:#f0e6d3;border-radius:10px;padding:10px 13px;font-size:15px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp:focus{border-color:#d4a853}.inp::placeholder{color:#2e3550}
  .inp-sm{width:100%;background:#0e1320;border:1.5px solid #2e3447;color:#f0e6d3;border-radius:8px;padding:8px 11px;font-size:14px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp-sm:focus{border-color:#d4a853}.inp-sm::placeholder{color:#2e3550}
  .tdinp{width:100%;background:transparent;border:none;color:#ccc5b5;font-size:13px;font-family:'Lora',serif;outline:none;padding:8px 10px;border-radius:6px;transition:background .15s;}
  .tdinp:focus{background:#141c30;}.tdinp::placeholder{color:#252e40}
  .wv{width:4px;border-radius:2px;background:#d4a853;display:inline-block;margin:0 2px;}
  .wv:nth-child(1){animation:wave .8s ease-in-out infinite 0s}.wv:nth-child(2){animation:wave .8s ease-in-out infinite .13s}
  .wv:nth-child(3){animation:wave .8s ease-in-out infinite .26s}.wv:nth-child(4){animation:wave .8s ease-in-out infinite .39s}
  .wv:nth-child(5){animation:wave .8s ease-in-out infinite .52s}
  .overlay{position:fixed;inset:0;background:rgba(5,8,14,.85);display:flex;align-items:center;justify-content:center;z-index:100;animation:overlayIn .18s ease;padding:1rem;}
  .modal{background:#111e30;border:1px solid #2a3650;border-radius:20px;padding:1.75rem;width:100%;max-width:480px;animation:modalIn .22s ease;max-height:90vh;overflow-y:auto;}
  .modal-wide{max-width:860px;}
  .stat-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;}
  .word-row{display:grid;grid-template-columns:26px 1fr 1fr 1.5fr 1fr 26px;gap:4px;}
  .word-hdr{display:grid;grid-template-columns:26px 1fr 1fr 1.5fr 1fr 26px;gap:4px;}
  @media(max-width:640px){
    .stat-grid{grid-template-columns:repeat(3,1fr)!important;}
    .word-row{grid-template-columns:22px 1fr 1fr 22px!important;}
    .word-hdr{grid-template-columns:22px 1fr 1fr 22px!important;}
    .col-ex,.col-syn{display:none!important;}
    .deck-hdr{flex-wrap:wrap;gap:6px!important;}
  }
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0b0f16}::-webkit-scrollbar-thumb{background:#2a3040;border-radius:2px}
`;

/* ─── Modal ──────────────────────────────────────────────────── */
function Modal({onClose,children,wide=false}){
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return(<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal${wide?" modal-wide":""}`}>{children}</div></div>);
}
function ConfirmModal({title,msg,label="Smazat",onConfirm,onClose}){
  return(<Modal onClose={onClose}><div style={{textAlign:"center",padding:"0.5rem 0"}}><div style={{fontSize:36,marginBottom:12}}>⚠️</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.text,marginBottom:8}}>{title}</div><div style={{fontSize:14,color:C.muted,marginBottom:24,lineHeight:1.6}}>{msg}</div><div style={{display:"flex",gap:10}}><button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"11px",fontSize:14,cursor:"pointer"}}>Zrušit</button><button className="btn" onClick={()=>{onConfirm();onClose();}} style={{flex:1,background:C.err,color:"#fff",border:"none",borderRadius:9,padding:"11px",fontSize:14,fontWeight:700,cursor:"pointer"}}>{label}</button></div></div></Modal>);
}
function IOSToggle({value,onChange}){
  return(<div onClick={()=>onChange(!value)} style={{width:46,height:26,borderRadius:13,flexShrink:0,background:value?"#5cb88a":"#3e4455",position:"relative",cursor:"pointer",transition:"background .25s"}}><div style={{position:"absolute",top:3,left:value?23:3,width:20,height:20,borderRadius:"50%",background:"white",transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/></div>);
}

/* ─── Settings Dropdown ──────────────────────────────────────── */
function SettingsDropdown({autoPlay,onToggle}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(
    <div ref={ref} style={{position:"relative",flexShrink:0}}>
      <button className="btn" onClick={()=>setOpen(o=>!o)} style={{background:open?"#1e2a45":"#1a1f2e",border:`1px solid ${open?"#3a5080":"#2e3447"}`,color:open?C.gold:C.muted,borderRadius:8,padding:"5px 10px",fontSize:18,cursor:"pointer",lineHeight:1}}>⚙️</button>
      {open&&(<div style={{position:"absolute",right:0,top:"calc(100% + 8px)",background:"#111e30",border:`1px solid #2a3650`,borderRadius:14,padding:"4px 0",minWidth:240,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,.6)",overflow:"hidden"}}>
        <div style={{padding:"8px 16px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600}}>Nastavení</div></div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:17,width:22,textAlign:"center"}}>{autoPlay?"🔊":"🔇"}</span>
            <div><div style={{fontSize:13,color:C.text,fontFamily:"'Lora',serif"}}>Automatické přehrávání</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>Přehrát slovo při zobrazení</div></div>
          </div>
          <IOSToggle value={autoPlay} onChange={onToggle}/>
        </div>
      </div>)}
    </div>
  );
}

/* ─── Lang Dropdown ──────────────────────────────────────────── */
/* ─── Lang Modal (shared add + edit) ────────────────────────── */
function LangModal({initial, onClose, onSave, title}) {
  const [f,setF]=useState(initial ?? {label:"",flag:"🌐",code:"",nativeCode:"CZ",studyCode:""});
  const upd=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const valid=f.label.trim()&&f.nativeCode.trim()&&f.studyCode.trim();
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:4}}>{title}</div>
        <div style={{fontSize:13,color:C.muted}}>Nastavení jazykové větve</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Název jazyka *</div>
          <input className="inp-sm" value={f.label} onChange={upd("label")} placeholder="např. Španělština"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Vlajka (emoji)</div>
            <input className="inp-sm" value={f.flag} onChange={upd("flag")} placeholder="🇪🇸"/>
          </div>
          <div>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Kód (3–4 znaky)</div>
            <input className="inp-sm" value={f.code} onChange={upd("code")} placeholder="ESP" maxLength={4}/>
          </div>
        </div>
        <div style={{background:"#0e1520",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:11,color:C.mutedDark,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Zkratky pro řazení</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Rozumím (výchozí) *</div>
              <input className="inp-sm" value={f.nativeCode} onChange={upd("nativeCode")} placeholder="CZ" maxLength={4}/>
              <div style={{fontSize:10,color:C.mutedDark,marginTop:3}}>Jazyk ze kterého překládám</div>
            </div>
            <div>
              <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Chci se naučit *</div>
              <input className="inp-sm" value={f.studyCode} onChange={upd("studyCode")} placeholder="ESP" maxLength={4}/>
              <div style={{fontSize:10,color:C.mutedDark,marginTop:3}}>Jazyk který se učím</div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
          <button className="btn" onClick={()=>{if(valid)onSave({...f,label:f.label.trim(),code:(f.code||f.studyCode).toUpperCase().slice(0,4),nativeCode:f.nativeCode.toUpperCase().trim(),studyCode:f.studyCode.toUpperCase().trim()});}}
            style={{flex:2,background:valid?C.gold:"#1a2030",color:valid?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>
            Uložit
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Lang Dropdown ──────────────────────────────────────────── */
function LangDropdown({langs,activeId,onSwitch,onAddLang,onEditLang,onDeleteLang}){
  const [open,setOpen]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [editLang,setEditLang]=useState(null);
  const [showDel,setShowDel]=useState(null);
  const ref=useRef(null);
  const active=langs.find(l=>l.id===activeId)||langs[0];
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(<>
    <div ref={ref} style={{position:"relative",userSelect:"none"}}>
      <button className="btn" onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,background:"#111e30",border:`1.5px solid ${open?"#3a5080":C.border}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",minWidth:130}}>
        <span style={{fontSize:20}}>{active?.flag}</span>
        <span style={{fontWeight:700,fontSize:12,color:C.gold}}>{active?.code||active?.studyCode}</span>
        <span style={{fontSize:12,color:C.muted,flex:1,textAlign:"left"}}>{active?.label}</span>
        <span style={{fontSize:10,color:C.muted}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"#111e30",border:`1px solid #2a3650`,borderRadius:12,overflow:"hidden",minWidth:230,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          {langs.map(l=>(
            <div key={l.id} style={{display:"flex",alignItems:"center",background:l.id===activeId?"#1a2a45":"transparent"}}
              onMouseEnter={e=>e.currentTarget.style.background=l.id===activeId?"#1a2a45":"#161e30"}
              onMouseLeave={e=>e.currentTarget.style.background=l.id===activeId?"#1a2a45":"transparent"}>
              <button className="btn" onClick={()=>{onSwitch(l.id);setOpen(false);}} style={{flex:1,display:"flex",alignItems:"center",gap:10,padding:"10px 14px",textAlign:"left"}}>
                <span style={{fontSize:18}}>{l.flag}</span>
                <span style={{fontWeight:700,fontSize:12,color:C.gold,width:34}}>{l.code||l.studyCode}</span>
                <span style={{fontSize:13,color:C.textDim}}>{l.label}</span>
                {l.id===activeId&&<span style={{marginLeft:"auto",color:C.ok,fontSize:12}}>✓</span>}
              </button>
              <button className="btn" onClick={e=>{e.stopPropagation();setEditLang(l);setOpen(false);}}
                style={{padding:"10px 8px",color:"#4a5878",fontSize:13,flexShrink:0}}
                onMouseEnter={e=>e.currentTarget.style.color=C.gold}
                onMouseLeave={e=>e.currentTarget.style.color="#4a5878"}>✏️</button>
              {langs.length>1&&(
                <button className="btn" onClick={e=>{e.stopPropagation();setShowDel(l);setOpen(false);}}
                  style={{padding:"10px 8px",color:"#4a2828",fontSize:16,flexShrink:0}}
                  onMouseEnter={e=>e.currentTarget.style.color="#c87070"}
                  onMouseLeave={e=>e.currentTarget.style.color="#4a2828"}>×</button>
              )}
            </div>
          ))}
          <div style={{borderTop:`1px solid ${C.border}`,margin:"4px 0"}}/>
          <button className="btn" onClick={()=>{setShowAdd(true);setOpen(false);}}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",color:"#7090b8",textAlign:"left",fontSize:13}}
            onMouseEnter={e=>e.currentTarget.style.background="#161e30"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:18}}>＋</span> Přidat jazyk
          </button>
        </div>
      )}
    </div>
    {showDel&&<ConfirmModal title={`Smazat jazyk ${showDel.label}?`} msg="Všechny balíčky tohoto jazyka budou také smazány." onConfirm={()=>onDeleteLang(showDel.id)} onClose={()=>setShowDel(null)}/>}
    {showAdd&&<LangModal title="Přidat jazyk" onClose={()=>setShowAdd(false)} onSave={data=>{onAddLang({id:uid(),...data,custom:true});setShowAdd(false);}}/>}
    {editLang&&<LangModal title={`Upravit — ${editLang.label}`} initial={editLang} onClose={()=>setEditLang(null)} onSave={data=>{onEditLang({...editLang,...data});setEditLang(null);}}/>}
  </>);
}

function UploadModal({onClose,onUpload}){
  const [drag,setDrag]=useState(false);const fRef=useRef(null);
  return(<Modal onClose={onClose}>
    <div style={{marginBottom:18}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.gold,marginBottom:4}}>Nahrát nový balíček</div><div style={{fontSize:13,color:C.muted}}>Excel nebo CSV soubor</div></div>
    <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f){onUpload(f);onClose();}}} onClick={()=>fRef.current.click()}
      style={{border:`2px dashed ${drag?C.gold:"#2e3447"}`,borderRadius:14,padding:"2rem 1.5rem",textAlign:"center",background:drag?"rgba(212,168,83,.05)":"transparent",cursor:"pointer",transition:"all .2s",marginBottom:16}}>
      <div style={{fontSize:36,marginBottom:8}}>📊</div>
      <div style={{fontSize:16,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:4}}>Přetáhni soubor sem</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:8}}>nebo klikni pro výběr</div>
      <div style={{display:"inline-block",background:"#1a2030",borderRadius:20,padding:"3px 12px",fontSize:12,color:"#4a6070"}}>.xlsx · .xls · .csv</div>
      <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){onUpload(e.target.files[0]);onClose();}}}/>
    </div>
    <div style={{background:"#0e1520",borderRadius:10,padding:"10px 14px"}}>
      <div style={{fontSize:10,color:C.mutedDark,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Formát</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"3px 10px",fontSize:12,fontFamily:"monospace"}}>
        <span style={{color:"#5c8aaa",fontWeight:600}}>A – EN</span><span style={{color:"#7a8a5c",fontWeight:600}}>B – CS</span><span style={{color:"#9a7a5c",fontWeight:600}}>C – Příklad</span><span style={{color:"#7a6a8a",fontWeight:600}}>D – Synonyma</span>
        <span style={{color:C.muted}}>contestant</span><span style={{color:C.muted}}>soutěžící</span><span style={{color:"#5a5a5a",fontStyle:"italic"}}>She wins.</span><span style={{color:"#7a6a5c"}}>závodník</span>
      </div>
      <div style={{marginTop:7,fontSize:11,color:"#5a6a5c"}}>Synonyma lze i v B: <span style={{fontFamily:"monospace",color:"#8a8"}}>soutěžící / závodník</span></div>
    </div>
  </Modal>);
}

/* ─── Add Word Modal ─────────────────────────────────────────── */
function AddWordModal({onClose,onAdd}){
  const [f,setF]=useState({en:"",cs:"",ex:"",syn:""});
  const upd=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  function submit(){if(!f.en.trim()||!f.cs.trim())return;onAdd({en:f.en.trim(),cs:f.cs.trim(),example:f.ex.trim(),synonyms:f.syn.trim()});onClose();}
  return(<Modal onClose={onClose}>
    <div style={{marginBottom:14}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>Přidat slovíčko</div><div style={{fontSize:13,color:C.muted}}>Překlad, synonyma a příkladová věta</div></div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>🇬🇧 Anglicky *</div><input className="inp-sm" value={f.en} onChange={upd("en")} placeholder="anglické slovo" autoFocus onKeyDown={e=>e.key==="Enter"&&document.getElementById("lc-cs")?.focus()}/></div>
      <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>🇨🇿 Česky * <span style={{color:C.mutedDark,fontSize:11}}>(nebo: slov1 / slov2)</span></div><input id="lc-cs" className="inp-sm" value={f.cs} onChange={upd("cs")} placeholder="překlad" onKeyDown={e=>e.key==="Enter"&&document.getElementById("lc-syn")?.focus()}/></div>
      <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>🔄 Synonyma <span style={{color:C.mutedDark,fontSize:11}}>(volitelné)</span></div><input id="lc-syn" className="inp-sm" value={f.syn} onChange={upd("syn")} placeholder="závodník / účastník" onKeyDown={e=>e.key==="Enter"&&document.getElementById("lc-ex")?.focus()}/></div>
      <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>💡 Příkladová věta</div><input id="lc-ex" className="inp-sm" value={f.ex} onChange={upd("ex")} placeholder="volitelně…" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
        <button className="btn" onClick={submit} style={{flex:2,background:f.en&&f.cs?C.gold:"#1a2030",color:f.en&&f.cs?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>Přidat</button>
      </div>
    </div>
  </Modal>);
}

/* ─── Rename Deck Modal ──────────────────────────────────────── */
function RenameModal({currentName,onClose,onRename}){
  const [name,setName]=useState(currentName);
  return(<Modal onClose={onClose}>
    <div style={{marginBottom:14}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>Přejmenovat balíček</div></div>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <input className="inp-sm" value={name} onChange={e=>setName(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&name.trim()&&onRename(name.trim())}/>
      <div style={{display:"flex",gap:8}}>
        <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
        <button className="btn" onClick={()=>name.trim()&&onRename(name.trim())} style={{flex:2,background:name.trim()?C.gold:"#1a2030",color:name.trim()?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Uložit</button>
      </div>
    </div>
  </Modal>);
}

/* ─── Stats Modal ────────────────────────────────────────────── */
function StatsModal({deck,onClose,onReset}){
  const [sk,setSk]=useState("total-desc");
  const sorted=sortStats(deck.words,sk);
  const ds=deck.deckStats??{totalAnswers:0,correctAnswers:0,roundsCompleted:0};
  const mastered=deck.words.filter(w=>(w.score??0)>=3).length;
  return(<Modal onClose={onClose} wide>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:12}}>
      <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>Statistika — {deck.name}</div><div style={{fontSize:12,color:C.muted}}>{deck.words.length} slovíček · {mastered} zvládnuto · {ds.roundsCompleted} kol</div></div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        <button className="btn" onClick={onReset} style={{border:"1px solid #3a1515",color:"#7a4040",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>🔄 Reset</button>
        <button className="btn" onClick={onClose} style={{color:C.muted,fontSize:22,lineHeight:1}}>×</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:14}}>
      {[{lbl:"Celkem",val:ds.totalAnswers||0,c:"#7090c8",bg:"#121a2e"},{lbl:"Správně",val:ds.correctAnswers||0,c:C.ok,bg:C.okBg},{lbl:"Špatně",val:(ds.totalAnswers||0)-(ds.correctAnswers||0),c:C.err,bg:C.errBg},{lbl:"Úspěšnost",val:ds.totalAnswers?`${Math.round(ds.correctAnswers/ds.totalAnswers*100)}%`:"—",c:C.gold,bg:"#1a1608"}].map(({lbl,val,c,bg})=>(
        <div key={lbl} style={{background:bg,borderRadius:9,padding:"8px 6px",textAlign:"center"}}><div style={{fontSize:9,color:c,textTransform:"uppercase",letterSpacing:.8,marginBottom:2}}>{lbl}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:c}}>{val}</div></div>
      ))}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:10,flexWrap:"wrap"}}>
      <span style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:1.5,flexShrink:0}}>Řadit:</span>
      {STAT_COLS.map(s=><button key={s.id} className="btn" onClick={()=>setSk(s.id)} style={{background:sk===s.id?"#1a2a40":"transparent",border:`1px solid ${sk===s.id?"#2e4565":C.border}`,color:sk===s.id?C.gold:C.muted,borderRadius:7,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>{s.label}</button>)}
    </div>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:480}}>
        <thead><tr style={{borderBottom:`1px solid #1e2535`}}>{["#","Anglicky","Česky","Synonyma","Prox.","✓","✗","Úsp.","Interval"].map(h=><th key={h} style={{padding:"6px 8px",color:C.muted,fontWeight:500,fontSize:10,textTransform:"uppercase",letterSpacing:1,textAlign:h==="#"?"center":"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
        <tbody>
          {sorted.map((w,i)=>{
            const ws=w.wStats??{total:0,correct:0,wrong:0},pct=ws.total?Math.round(ws.correct/ws.total*100):null,pc=pct===null?C.muted:pct>=80?C.ok:pct>=50?C.gold:C.err;
            const syns=[...parseSyn(w.cs).slice(1),...parseSyn(w.synonyms||"")].join(", ");
            const daysLeft=w.nextReview?Math.max(0,Math.round((w.nextReview-Date.now())/86400000)):null;
            return(<tr key={w.id} style={{borderBottom:`1px solid #161e2e`}} onMouseEnter={e=>e.currentTarget.style.background="#0e1525"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <td style={{padding:"7px 8px",color:C.muted,textAlign:"center",fontSize:10}}>{i+1}</td>
              <td style={{padding:"7px 8px",color:C.text,fontWeight:500}}>{w.en}</td>
              <td style={{padding:"7px 8px",color:C.textDim}}>{parseSyn(w.cs)[0]||w.cs}</td>
              <td style={{padding:"7px 8px",color:"#6a7060",fontSize:11,fontStyle:"italic"}}>{syns||"—"}</td>
              <td style={{padding:"7px 8px",color:C.textDim,textAlign:"center"}}>{ws.total||"—"}</td>
              <td style={{padding:"7px 8px",color:C.ok,textAlign:"center"}}>{ws.correct||"—"}</td>
              <td style={{padding:"7px 8px",color:C.err,textAlign:"center"}}>{ws.wrong||"—"}</td>
              <td style={{padding:"7px 8px",textAlign:"center"}}>{pct!==null?<span style={{background:pc+"22",color:pc,borderRadius:20,padding:"2px 8px",fontWeight:600,fontSize:11}}>{pct}%</span>:<span style={{color:C.mutedDark}}>—</span>}</td>
              <td style={{padding:"7px 8px",textAlign:"center",color:C.muted,fontSize:11}}>{daysLeft===null?"nové":daysLeft===0?"dnes":`${daysLeft}d`}</td>
            </tr>);
          })}
        </tbody>
      </table>
    </div>
  </Modal>);
}

/* ─── Onboarding Modal ───────────────────────────────────────── */
function OnboardingModal({onSample,onUpload,onClose}){
  const fRef=useRef(null);
  return(<Modal onClose={onClose}>
    <div style={{textAlign:"center",padding:"0.5rem 0 1rem"}}>
      <div style={{fontSize:48,marginBottom:10}}>🃏</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:C.gold,marginBottom:6}}>Vítej v LexiCard!</div>
      <div style={{fontSize:14,color:C.muted,lineHeight:1.6,marginBottom:24}}>Jak chceš začít?</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button className="btn" onClick={onSample} style={{background:C.gold,border:"none",color:C.bg,borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Playfair Display',serif"}}>🎓 Zkusit ukázkový balíček</button>
        <button className="btn" onClick={()=>fRef.current.click()} style={{background:"transparent",border:`1.5px solid #2a3650`,color:C.textDim,borderRadius:12,padding:"13px",fontSize:14,cursor:"pointer"}}>📊 Nahrát vlastní .xlsx soubor</button>
        <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){onUpload(e.target.files[0]);onClose();}}}/>
      </div>
      <div style={{marginTop:16,fontSize:12,color:C.mutedDark,fontStyle:"italic"}}>Formát: sloupec A = anglicky, B = česky, C = příkladová věta (volitelné)</div>
    </div>
  </Modal>);
}

/* ══════════════════════════════════════════════════════════════
   HOME SCREEN
══════════════════════════════════════════════════════════════ */
function HomeScreen({decks,langs,activeLang,gameStats,onLangSwitch,onAddLang,onEditLang,onDeleteLang,onSelect,onFileUpload,onSampleDeck}){
  const [sort,setSort]=useState("date-desc");
  const [showUpload,setShowUpload]=useState(false);
  const ld=sortDecks(decks.filter(d=>d.lang===activeLang),sort);
  const lc=langs.find(l=>l.id===activeLang)||langs[0];
  const lvl=getLevel(gameStats.xp??0);
  const streak=gameStats.dailyStreak??0;
  return(
    <div style={{minHeight:"100dvh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",padding:"1.5rem 1rem",overscrollBehavior:"none"}}>
      <style>{STYLE}</style>
      {showUpload&&<UploadModal onClose={()=>setShowUpload(false)} onUpload={onFileUpload}/>}
      {/* header */}
      <div style={{width:"100%",maxWidth:780,display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"1rem",gap:10}}>
        <div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:700,color:C.gold,letterSpacing:"-1px"}}>LexiCard</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2,fontStyle:"italic"}}>{lc?.label}</div>
        </div>
        <LangDropdown langs={langs} activeId={activeLang} onSwitch={onLangSwitch} onAddLang={onAddLang} onEditLang={onEditLang} onDeleteLang={onDeleteLang}/>
      </div>
      {/* XP & streak bar */}
      <div style={{width:"100%",maxWidth:780,background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px 16px",marginBottom:"1rem",display:"flex",alignItems:"center",gap:16}}>
        <div style={{flexShrink:0,textAlign:"center"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.gold}}>Lv.{lvl.level}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{lvl.name}</div>
        </div>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
            <span>{gameStats.xp??0} XP</span><span>{lvl.next} XP</span>
          </div>
          <div style={{background:"#1a2030",borderRadius:4,height:6}}>
            <div style={{width:`${lvl.pct}%`,height:"100%",background:"linear-gradient(90deg,#d4a853,#f0c060)",borderRadius:4,transition:"width .5s"}}/>
          </div>
        </div>
        {streak>0&&(
          <div style={{flexShrink:0,background:"#1a1608",border:"1px solid #3a3010",borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
            <div style={{fontSize:16}}>🔥</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:C.gold}}>{streak}</div>
            <div style={{fontSize:9,color:C.muted}}>dní</div>
          </div>
        )}
      </div>
      {/* add deck button */}
      <div style={{width:"100%",maxWidth:780,marginBottom:"0.9rem"}}>
        <button className="btn" onClick={()=>setShowUpload(true)}
          style={{width:"100%",display:"flex",alignItems:"center",gap:12,background:"#0e1520",border:`1.5px dashed #2a3650`,borderRadius:14,padding:"12px 16px",cursor:"pointer",transition:"all .2s",textAlign:"left"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.background="rgba(212,168,83,.04)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3650";e.currentTarget.style.background="#0e1520";}}>
          <div style={{width:34,height:34,background:"#1a2535",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>📊</div>
          <div><div style={{fontSize:14,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Přidat nový balíček</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>Nahrej .xlsx nebo .csv soubor</div></div>
          <div style={{marginLeft:"auto",fontSize:20,color:"#2a3650"}}>+</div>
        </button>
      </div>
      {/* sort */}
      <div style={{width:"100%",maxWidth:780,display:"flex",alignItems:"center",gap:7,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:2,flexShrink:0}}>Řadit:</span>
        {DECK_SORTS.map(s=><button key={s.id} className="btn" onClick={()=>setSort(s.id)} style={{background:sort===s.id?"#1a2a40":"transparent",border:`1px solid ${sort===s.id?"#2e4565":C.border}`,color:sort===s.id?C.gold:C.muted,borderRadius:8,padding:"4px 11px",fontSize:11,cursor:"pointer"}}>{s.label}</button>)}
      </div>
      {/* decks */}
      <div style={{width:"100%",maxWidth:780,flex:1}}>
        {ld.length===0?(
          <div style={{textAlign:"center",padding:"3rem 0",color:C.muted,fontSize:14,fontStyle:"italic"}}>
            Žádné balíčky pro {lc?.label}
            <div style={{marginTop:12}}><button className="btn" onClick={onSampleDeck} style={{background:"#1a2535",border:`1px solid #2a3650`,color:"#7090b8",borderRadius:10,padding:"9px 18px",fontSize:13,cursor:"pointer"}}>🎓 Načíst ukázkový balíček</button></div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
            {ld.map(d=>{
              const mastered=d.words.filter(w=>(w.score??0)>=3).length;
              const pct=d.words.length?Math.round(mastered/d.words.length*100):0;
              const due=dueCount(d.words);
              const sr=d.deckStats?.totalAnswers?Math.round(d.deckStats.correctAnswers/d.deckStats.totalAnswers*100):null;
              return(<div key={d.id} onClick={()=>onSelect(d.id)} className="btn" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"1.2rem",cursor:"pointer",transition:"border-color .2s",textAlign:"left",position:"relative"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#3a5080"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                {due>0&&<div style={{position:"absolute",top:10,right:10,background:"#3a1a08",border:"1px solid #8a4020",borderRadius:20,padding:"2px 8px",fontSize:10,color:"#d08050",fontWeight:600}}>{due} dnes</div>}
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.2,paddingRight:due>0?50:0}}>{d.name}</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:10}}>{d.words.length} slov · {mastered} zvl.{sr!==null?` · ${sr}%`:""}</div>
                <div style={{background:"#161e30",borderRadius:3,height:3}}><div style={{width:`${pct}%`,height:"100%",background:C.gold,borderRadius:3}}/></div>
                <div style={{fontSize:10,color:C.goldDim,marginTop:4,textAlign:"right"}}>{pct}% zvládnuto</div>
              </div>);
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
function DeckScreen({deck,langCfg,onBack,onStart,onUpdate,onAddWord,onDeleteWord,onDeleteDeck,onRename,onResetStats}){
  const [wSort,setWSort]=useState("date-asc");
  const [showAdd,setShowAdd]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const [showDelDeck,setShowDelDeck]=useState(false);
  const [showRename,setShowRename]=useState(false);
  const ds=deck.deckStats??{totalAnswers:0,correctAnswers:0,roundsCompleted:0};
  const mastered=deck.words.filter(w=>(w.score??0)>=3).length;
  const practiced=deck.words.filter(w=>(w.wStats?.total??0)>0).length;
  const due=dueCount(deck.words);
  const sr=ds.totalAnswers?Math.round(ds.correctAnswers/ds.totalAnswers*100):null;
  const sorted=sortWords(deck.words,wSort);
  const statItems=[{lbl:"Úspěšnost",val:sr!==null?`${sr}%`:"—",c:"#7090c8",bg:"#121a2e"},{lbl:"Naučeno",val:`${mastered}/${deck.words.length}`,c:C.ok,bg:C.okBg},{lbl:"Procvičeno",val:`${practiced}/${deck.words.length}`,c:"#a080c8",bg:"#1a1028"},{lbl:"K opak.",val:due,c:due>0?"#d08050":"#5a7060",bg:due>0?"#1a1008":"#0a1410"},{lbl:"Odpovědí",val:ds.totalAnswers||0,c:C.gold,bg:"#1a1608"},{lbl:"Kol",val:ds.roundsCompleted||0,c:"#7090c8",bg:"#121a2e"}];
  return(<div style={{minHeight:"100dvh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column",overscrollBehavior:"none"}}>
    <style>{STYLE}</style>
    {showAdd&&<AddWordModal onClose={()=>setShowAdd(false)} onAdd={onAddWord}/>}
    {showStats&&<StatsModal deck={deck} onClose={()=>setShowStats(false)} onReset={()=>{onResetStats();setShowStats(false);}}/>}
    {showDelDeck&&<ConfirmModal title="Smazat balíček?" msg={`Opravdu smazat „${deck.name}"?`} onConfirm={onDeleteDeck} onClose={()=>setShowDelDeck(false)}/>}
    {showRename&&<RenameModal currentName={deck.name} onClose={()=>setShowRename(false)} onRename={n=>{onRename(n);setShowRename(false);}}/>}
    <div style={{position:"sticky",top:0,zIndex:10,background:C.bg,borderBottom:`1px solid #1a1f2e`,padding:"0.8rem 1rem"}}>
      <div style={{maxWidth:1020,margin:"0 auto",display:"flex",flexDirection:"column",gap:7}}>
        {/* Row 1: ← back  |  📊 Stat.  + Slovo  Smazat */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="btn" onClick={onBack} style={{color:C.muted,fontSize:13,flexShrink:0}}>← Balíčky</button>
          <div style={{flex:1}}/>
          <button className="btn" onClick={()=>setShowStats(true)} style={{border:`1px solid #2a3555`,color:"#7090c8",borderRadius:8,padding:"5px 11px",fontSize:12,cursor:"pointer",flexShrink:0}}>📊 Stat.</button>
          <button className="btn" onClick={()=>setShowAdd(true)} style={{border:`1px solid #2e4060`,color:"#7090b8",borderRadius:8,padding:"5px 11px",fontSize:12,cursor:"pointer",flexShrink:0}}>+ Slovo</button>
          <button className="btn" onClick={()=>setShowDelDeck(true)} style={{border:"1px solid #3a1515",color:"#7a4040",borderRadius:8,padding:"5px 11px",fontSize:12,cursor:"pointer",flexShrink:0}}>Smazat</button>
        </div>
        {/* Row 2: ✏️ Deck name  |  Učení ▶ */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:6,minWidth:0}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{deck.name}</div>
            <button className="btn" onClick={()=>setShowRename(true)} style={{color:C.muted,fontSize:14,flexShrink:0,opacity:.7}} title="Přejmenovat">✏️</button>
          </div>
          <button className="btn" onClick={onStart} disabled={!deck.words.length}
            style={{background:deck.words.length?C.gold:"#2a2a1a",color:deck.words.length?C.bg:"#5a5030",borderRadius:9,padding:"8px 20px",fontSize:14,fontWeight:700,cursor:deck.words.length?"pointer":"default",flexShrink:0}}>
            Učení ▶
          </button>
        </div>
        {/* Row 3: stats */}
        <div className="stat-grid">
          {statItems.map(({lbl,val,c,bg})=><div key={lbl} style={{background:bg,borderRadius:7,padding:"5px 6px",textAlign:"center"}}><div style={{fontSize:9,color:c,textTransform:"uppercase",letterSpacing:.6,marginBottom:2}}>{lbl}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:c}}>{val}</div></div>)}
        </div>
      </div>
    </div>
    {/* Sort dropdown — dynamic labels from langCfg */}
    <div style={{maxWidth:1020,margin:"0 auto",width:"100%",padding:"0.7rem 1rem 0",display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:2,flexShrink:0}}>Řadit:</span>
      <select value={wSort} onChange={e=>setWSort(e.target.value)}
        style={{background:"#111622",border:`1px solid ${C.border}`,color:C.textDim,borderRadius:8,padding:"5px 10px",fontSize:12,fontFamily:"'Lora',serif",cursor:"pointer",outline:"none"}}>
        {[
          {id:"date-asc",  label:"Pořadí"},
          {id:"en-asc",    label:`${langCfg?.studyCode||"EN"} ↑`},
          {id:"en-desc",   label:`${langCfg?.studyCode||"EN"} ↓`},
          {id:"cs-asc",    label:`${langCfg?.nativeCode||"CS"} ↑`},
          {id:"cs-desc",   label:`${langCfg?.nativeCode||"CS"} ↓`},
          {id:"date-desc", label:"Datum ↓"},
        ].map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
    <div style={{maxWidth:1020,margin:"0 auto",width:"100%",padding:"0.8rem 1rem 2rem",display:"flex",flexDirection:"column",gap:4}}>
      <div className="word-hdr" style={{padding:"0 8px 4px",color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:2}}>
        <span style={{textAlign:"center"}}>#</span>
        <span>{langCfg?.studyCode||"EN"}</span>
        <span>{langCfg?.nativeCode||"CS"}</span>
        <span className="col-ex">Příkladová věta</span>
        <span className="col-syn">Synonyma</span>
        <span/>
      </div>
      {sorted.map((w,i)=>(<div key={w.id} className="word-row" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,alignItems:"center"}}>
        <span style={{fontSize:10,color:C.muted,textAlign:"center"}}>{i+1}</span>
        <input className="tdinp" value={w.en} placeholder="anglicky…" onChange={e=>onUpdate(w.id,"en",e.target.value)}/>
        <input className="tdinp" value={w.cs} placeholder="česky…" onChange={e=>onUpdate(w.id,"cs",e.target.value)}/>
        <input className="tdinp col-ex" value={w.example||""} placeholder="příkladová věta…" onChange={e=>onUpdate(w.id,"example",e.target.value)}/>
        <input className="tdinp col-syn" value={w.synonyms||""} placeholder="synonyma…" onChange={e=>onUpdate(w.id,"synonyms",e.target.value)}/>
        <button className="btn" onClick={()=>onDeleteWord(w.id)} style={{color:"#3a2020",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 5px",height:"100%",borderRadius:"0 8px 8px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#c87070"} onMouseLeave={e=>e.currentTarget.style.color="#3a2020"}>×</button>
      </div>))}
      <button className="btn" onClick={()=>setShowAdd(true)} style={{border:`1.5px dashed #2e3447`,borderRadius:8,padding:"9px",color:C.muted,fontSize:13,cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#2e3447";e.currentTarget.style.color=C.muted;}}>+ Přidat slovíčko</button>
    </div>
  </div>);
}

/* ══════════════════════════════════════════════════════════════
   ROUND END
══════════════════════════════════════════════════════════════ */
function RoundEnd({stats,total,deckName,xpEarned,newLevel,streak,onNext,onBack}){
  const pct=total?Math.round(stats.ok/total*100):0;
  const em=pct>=90?"🏆":pct>=70?"👏":pct>=50?"💪":"📚";
  return(<div style={{minHeight:"100dvh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",overscrollBehavior:"none"}}>
    <style>{STYLE}</style>
    <div className="card-in" style={{width:"100%",maxWidth:400,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:10}}>{em}</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:C.gold,marginBottom:4}}>Kolo dokončeno!</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:20,fontStyle:"italic"}}>{deckName}</div>
      {newLevel&&<div style={{background:"#1a1608",border:`1px solid ${C.gold}`,borderRadius:12,padding:"10px 16px",marginBottom:14,fontSize:14,color:C.gold,fontWeight:600}}>🎉 Level up! Jsi teď Level {newLevel}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:16}}>
        {[{lbl:"Správně",val:stats.ok,bg:C.okBg,c:C.ok},{lbl:"Špatně",val:stats.bad,bg:C.errBg,c:C.err},{lbl:"Úspěšnost",val:`${pct}%`,bg:"#1a2038",c:"#7090c8"}].map(({lbl,val,bg,c})=>(
          <div key={lbl} style={{background:bg,borderRadius:11,padding:"0.9rem 0.3rem"}}><div style={{fontSize:10,color:c,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>{lbl}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:23,fontWeight:700,color:c}}>{val}</div></div>
        ))}
      </div>
      {xpEarned>0&&<div style={{background:"#1a1608",border:"1px solid #3a3010",borderRadius:10,padding:"8px",marginBottom:14,fontSize:14,color:C.gold}}>+{xpEarned} XP získáno{streak>=3?` · 🔥 ${streak} dní v řadě`:""}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <button className="btn" onClick={onNext} style={{background:C.gold,border:"none",color:C.bg,borderRadius:11,padding:"13px",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"'Playfair Display',serif"}}>Další kolo →</button>
        <button className="btn" onClick={onBack} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:11,padding:"11px",fontSize:14,cursor:"pointer"}}>Zpět na slovíčka</button>
      </div>
    </div>
  </div>);
}

/* ══════════════════════════════════════════════════════════════
   FLIP SWIPE CARD — drag up OR tap buttons
══════════════════════════════════════════════════════════════ */
function FlipSwipeCard({word:w, dir, flipped, flipFlash, dictEntry, allSyn, onFlip, onAnswer, onSpeak, onSpeakBack}) {
  const [drag,setDrag]=useState({active:false,dx:0,dy:0});
  const [hovered,setHovered]=useState(null); // 0=neznám,3=tuším,5=vím
  const startRef=useRef(null);
  
  const ZONES=[
    {q:0,label:"Neznám",emoji:"😕",color:C.err,   bg:C.errBg,  border:C.errBorder},
    {q:3,label:"Tuším", emoji:"🤔",color:"#c8a050",bg:"#1a1608",border:"#4a4010"},
    {q:5,label:"Vím! ✓",emoji:"😊",color:C.ok,    bg:C.okBg,   border:C.okBorder},
  ];
  const showFront=dir==="en-cs";
  const frontWord=showFront?w.en:(parseSyn(w.cs)[0]||w.cs);
  const frontFlag=showFront?"🇬🇧":"🇨🇿";
  const backWord =showFront?(parseSyn(w.cs)[0]||w.cs):w.en;
  const backFlag =showFront?"🇨🇿":"🇬🇧";

  // which zone is the card dragged toward
  function getZone(dx,dy) {
    if(dy>-30) return null; // not dragged up enough
    if(dx<-60) return 0;
    if(dx>60)  return 5;
    return 3;
  }

  function onPointerDown(e) {
    if(!flipped||flipFlash) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current={x:e.clientX,y:e.clientY};
    setDrag({active:true,dx:0,dy:0});
  }
  function onPointerMove(e) {
    if(!drag.active||!startRef.current) return;
    const dx=e.clientX-startRef.current.x;
    const dy=e.clientY-startRef.current.y;
    setDrag({active:true,dx,dy});
    setHovered(getZone(dx,dy));
  }
  function onPointerUp(e) {
    if(!drag.active) return;
    const dx=e.clientX-(startRef.current?.x??e.clientX);
    const dy=e.clientY-(startRef.current?.y??e.clientY);
    const zone=getZone(dx,dy);
    setDrag({active:false,dx:0,dy:0});
    setHovered(null);
    startRef.current=null;
    if(zone!=null) onAnswer(zone);
  }

  const cardTransform = drag.active
    ? `translate(${drag.dx}px, ${Math.min(0,drag.dy)}px) rotate(${drag.dx*0.04}deg)`
    : "translate(0,0) rotate(0deg)";

  const dragProgress = drag.active ? Math.min(1, Math.max(0, -drag.dy/120)) : 0;

  return(
    <div style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.5rem",userSelect:"none"}}>

      {/* ── Drop zones — emoji only, no labels ── */}
      {flipped&&!flipFlash&&(
        <div className="fade-up" style={{width:"100%",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,pointerEvents:"none"}}>
          {ZONES.map(z=>{
            const isHov=hovered===z.q, isDrag=drag.active&&Math.abs(drag.dy)>30;
            return(
              <div key={z.q} style={{
                background:isHov?"#1a2035":"transparent",
                border:`1.5px dashed ${isHov?"#4a5878":isDrag?"#252e42":C.border}`,
                borderRadius:12,padding:"8px 4px",textAlign:"center",
                transition:"all .15s",transform:isHov?"scale(1.06)":"scale(1)",
              }}>
                <div style={{fontSize:20}}>{z.emoji}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Buttons between zones and card ── */}
      {flipped&&!flipFlash&&(
        <div className="fade-up" style={{width:"100%",display:"flex",gap:6}}>
          {ZONES.map(({q,label,emoji})=>(
            <button key={q} className="btn" onClick={()=>onAnswer(q)}
              style={{
                flex:1,
                background:"#131c2e",
                border:`1px solid #2a3448`,
                color:"#8a96a8",
                borderRadius:10,
                padding:"9px 4px",
                fontSize:13,
                fontWeight:500,
                cursor:"pointer",
                fontFamily:"'Lora',serif",
                transition:"all .18s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="#1a2540";e.currentTarget.style.borderColor="#3a4a60";e.currentTarget.style.color="#c0cad8";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#131c2e";e.currentTarget.style.borderColor="#2a3448";e.currentTarget.style.color="#8a96a8";}}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Card ── */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={flipFlash?`flash-${flipFlash}`:(drag.active?"":"card-in")}
        style={{
          width:"100%",
          background:C.card,
          border:`1px solid ${hovered!=null?"#3a4a62":C.border}`,
          borderRadius:22,padding:"2.8rem 2rem",textAlign:"center",
          cursor:flipped?"grab":"pointer",
          touchAction:"none",
          transform:cardTransform,
          transition:drag.active?"none":"transform .3s ease, border-color .15s",
          minHeight:280,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0,
          boxShadow:hovered!=null?"0 8px 30px rgba(60,80,120,.25)":"none",
        }}
        onClick={!flipped?onFlip:undefined}
      >
        {!flipped?(
          <>
            <div style={{fontSize:11,color:C.mutedDark,textTransform:"uppercase",letterSpacing:3,marginBottom:18}}>{frontFlag} — klikni pro překlad</div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:42,fontWeight:700,color:C.text,lineHeight:1.15}}>{frontWord}</div>
              {/* 🔊 only on EN front (dir=en-cs) — CZ front has no pronunciation to play */}
              {dir==="en-cs"&&(
                <button className="btn" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSpeak();}}
                  style={{border:`1px solid #2e3447`,color:"#6a7888",borderRadius:"50%",width:34,height:34,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔊</button>
              )}
            </div>
            {dir==="en-cs"&&dictEntry?.ipa&&<div style={{fontSize:15,color:C.muted,fontStyle:"italic",marginBottom:6}}>{dictEntry.ipa}</div>}
            <div style={{fontSize:13,color:"#2a3545",marginTop:8}}>👆 Klikni pro překlad</div>
          </>
        ):(
          <>
            {/* Řádek 1 — pouze původní slovo */}
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600,color:C.textDim,marginBottom:10,lineHeight:1.2}}>
              {frontWord}
            </div>
            {/* Řádek 2 — pouze šipka */}
            <div style={{fontSize:26,color:C.mutedDark,marginBottom:10,lineHeight:1}}>↓</div>
            {/* Řádek 3 — přeložené slovo + 🔊 vždy (tady je EN slovo) */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:allSyn||w.example?14:0}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:38,fontWeight:700,color:C.text,lineHeight:1.2}}>
                {backWord}
              </div>
              <button className="btn" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onSpeakBack();}}
                style={{border:`1px solid #2e3447`,color:"#6a7888",borderRadius:"50%",width:34,height:34,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔊</button>
            </div>
            {dir==="cs-en"&&dictEntry?.ipa&&<div style={{fontSize:14,color:C.muted,fontStyle:"italic",marginBottom:allSyn||w.example?10:0}}>{dictEntry.ipa}</div>}
            {/* synonyma */}
            {allSyn&&<div style={{fontSize:13,color:"#5a6a50",marginBottom:w.example?12:0}}>také: {allSyn}</div>}
            {/* Řádek 4 — příkladová věta */}
            {w.example&&(
              <div style={{fontSize:16,color:"#3a4a50",fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:2,lineHeight:1.65,maxWidth:"90%"}}>
                💡 „{w.example}"
              </div>
            )}
          </>
        )}
        <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:14}}>
          {[0,1,2,3,4].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<(w.score??0)?C.gold:"#1e2535"}}/>)}
        </div>
      </div>

      {/* hint */}
      {flipped&&!flipFlash&&(
        <div style={{fontSize:10,color:C.mutedDark,textAlign:"center"}}>
          nebo přetáhni kartičku nahoru do zóny
        </div>
      )}
    </div>
  );
}


export default function LexiCard() {
  const [decks,setDecks]=useState([]);
  const [langs,setLangs]=useState(DEFAULT_LANGS);
  const [screen,setScreen]=useState("home");
  const [deckId,setDeckId]=useState(null);
  const [activeLang,setLang]=useState("en");
  const [loaded,setLoaded]=useState(false);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [gameStats,setGameStats]=useState({xp:0,dailyStreak:0,lastStudyDate:null});

  // study state
  const [mode,setMode]=useState("transl");
  const [translDir,setTranslDir]=useState("en-cs"); // en-cs | cs-en (for transl mode)
  const [flipDir,setFlipDir]=useState("en-cs");     // en-cs | cs-en (for flip mode)
  const [rWords,setRWords]=useState([]);
  const [rIdx,setRIdx]=useState(0);
  const [rStats,setRStats]=useState({ok:0,bad:0,xp:0});
  const [combo,setCombo]=useState(0);
  const [feedback,setFB]=useState(null);
  const [flipFlash,setFlipFlash]=useState(null);
  const [flipped,setFlipped]=useState(false);
  const [listenOn,setListen]=useState(false);
  const [tx,setTx]=useState("");
  const [micSt,setMicSt]=useState("idle");
  const [micErr,setMicErr]=useState("");
  const [iMode,setIMode]=useState("mic");
  const [typed,setTyped]=useState("");
  const [autoPlay,setAutoPlay]=useState(true);
  const [pronAtt,setPronAtt]=useState(0);
  const [evalLoading,setEvalLoading]=useState(false);
  const [wrongCountdown,setWrongCountdown]=useState(0);
  const [dictEntry,setDictEntry]=useState(null);
  const [roundEndData,setRoundEndData]=useState(null);

  const recRef=useRef(null);
  const streamRef=useRef(null);
  const synthRef=useRef(window.speechSynthesis);
  const timerRef=useRef(null);
  const intervalRef=useRef(null);

  /* ── storage ── */
  useEffect(()=>{
    try{const raw=localStorage.getItem("lc6_data");if(raw){const d=JSON.parse(raw);if(d.decks)setDecks(d.decks);if(d.lang)setLang(d.lang);if(d.langs)setLangs(p=>{const ids=new Set(p.map(l=>l.id));return[...p,...d.langs.filter(l=>!ids.has(l.id))];});if(d.gameStats)setGameStats(d.gameStats);}else setShowOnboarding(true);}catch{}
    setLoaded(true);
  },[]);
  useEffect(()=>{
    if(loaded){try{localStorage.setItem("lc6_data",JSON.stringify({decks,lang:activeLang,langs:langs.filter(l=>l.custom),gameStats}));}catch{}}
  },[decks,activeLang,langs,loaded,gameStats]);

  /* ── dict fetch ── */
  useEffect(()=>{
    if(screen!=="study"||!rWords[rIdx]) return;
    const w=rWords[rIdx];
    const needEn=mode!=="cs-en";
    if(!needEn){setDictEntry(null);return;}
    setDictEntry(null);
    fetchDict(w.en).then(e=>{if(rWords[rIdx]?.id===w.id)setDictEntry(e);});
  },[rIdx,mode,screen]);

  /* ── auto-advance on feedback ── */
  useEffect(()=>{
    if(!feedback||screen!=="study"||mode==="flip")return;
    playSound(feedback.ok?"ok":"bad");
    if(feedback.ok){timerRef.current=setTimeout(()=>nextCard(),900);}
    else{
      setWrongCountdown(5);let c=5;
      intervalRef.current=setInterval(()=>{c--;setWrongCountdown(c);if(c<=0)clearInterval(intervalRef.current);},1000);
      timerRef.current=setTimeout(()=>nextCard(),5200);
    }
    return()=>{clearTimeout(timerRef.current);clearInterval(intervalRef.current);};
  },[feedback]);

  /* ── auto speak ── */
  useEffect(()=>{
    if(screen!=="study"||!rWords[rIdx]||feedback||!autoPlay) return;
    const w=rWords[rIdx];
    if(mode==="flip"){
      // en-cs: auto-play EN word on front side appearance
      if(flipDir==="en-cs"&&!flipped){
        const t=setTimeout(()=>speakWord(w.en,"en-US"),400);
        return()=>clearTimeout(t);
      }
      // cs-en: no autoplay on front (CZ) — plays when flipped (handled in onFlip)
      return;
    }
    if(mode==="pron"||mode==="transl"){
      const text=mode==="pron"?w.en:translDir==="en-cs"?w.en:w.cs;
      const lang=translDir==="cs-en"?"cs-CZ":"en-US";
      const t=setTimeout(()=>{
        if(mode!=="cs-en"&&dictEntry?.audio)playAudio(dictEntry.audio);
        else speakWord(text,lang);
      },400);
      return()=>clearTimeout(t);
    }
  },[rIdx,mode,screen,feedback,autoPlay,dictEntry,flipped,flipDir]);

  const deck=decks.find(d=>d.id===deckId)??null;

  /* ── file load ── */
  function loadFile(file){
    const name=file.name.replace(/\.[^.]+$/,"");
    const rd=new FileReader();
    rd.onload=e=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
        const words=rows.filter(r=>r[0]&&r[1]).map(r=>({id:uid(),en:String(r[0]).trim(),cs:String(r[1]).trim(),example:r[2]?String(r[2]).trim():"",synonyms:r[3]?String(r[3]).trim():"",score:0,addedAt:now(),ef:2.5,reps:0,iv:1,nextReview:null,wStats:{total:0,correct:0,wrong:0}}));
        if(!words.length){alert("Žádná slovíčka nenalezena.");return;}
        const d={id:uid(),name,lang:activeLang,words,createdAt:now(),deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0}};
        setDecks(ds=>[...ds,d]);setDeckId(d.id);setScreen("deck");
      }catch{alert("Nepodařilo se načíst soubor.");}
    };
    rd.readAsArrayBuffer(file);
  }
  function loadSampleDeck(){
    const words=SAMPLE_WORDS.map(w=>({id:uid(),...w,synonyms:"",score:0,addedAt:now(),ef:2.5,reps:0,iv:1,nextReview:null,wStats:{total:0,correct:0,wrong:0}}));
    const d={id:uid(),name:"Ukázkový balíček",lang:activeLang,words,createdAt:now(),deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0}};
    setDecks(ds=>[...ds,d]);setDeckId(d.id);setScreen("deck");
  }

  /* ── deck ops ── */
  const updWord=(wid,field,val)=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.map(w=>w.id!==wid?w:{...w,[field]:val})}));
  function addWord({en,cs,example,synonyms}){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:[...d.words,{id:uid(),en,cs,example,synonyms:synonyms||"",score:0,addedAt:now(),ef:2.5,reps:0,iv:1,nextReview:null,wStats:{total:0,correct:0,wrong:0}}]}));}
  const delWord=wid=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.filter(w=>w.id!==wid)}));
  function delDeck(){setDecks(ds=>ds.filter(d=>d.id!==deckId));setScreen("home");}
  function renameDeck(name){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,name}));}
  function resetStats(){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0},words:d.words.map(w=>({...w,score:0,ef:2.5,reps:0,iv:1,nextReview:null,wStats:{total:0,correct:0,wrong:0}}))}));}
  function addLang(l){setLangs(ls=>[...ls,l]);setLang(l.id);}
  function editLang(updated){setLangs(ls=>ls.map(l=>l.id===updated.id?updated:l));}
  function deleteLang(id){setDecks(ds=>ds.filter(d=>d.lang!==id));setLangs(ls=>ls.filter(l=>l.id!==id));if(activeLang===id){const rem=langs.filter(l=>l.id!==id);if(rem.length)setLang(rem[0].id);}}

  /* ── study helpers ── */
  function clearCard(){clearTimeout(timerRef.current);clearInterval(intervalRef.current);setFB(null);setTx("");setMicErr("");setTyped("");setPronAtt(0);setWrongCountdown(0);setEvalLoading(false);setFlipped(false);setFlipFlash(null);}
  function startStudy(){if(!deck?.words?.length)return;setRWords(pickRound(deck.words));setRIdx(0);setRStats({ok:0,bad:0,xp:0});setCombo(0);clearCard();setScreen("study");}

  function nextCard(){
    clearTimeout(timerRef.current);clearInterval(intervalRef.current);
    setFB(null);setTx("");setMicErr("");setTyped("");setPronAtt(0);setWrongCountdown(0);setEvalLoading(false);setFlipped(false);setFlipFlash(null);
    const nxt=rIdx+1;
    if(nxt>=rWords.length){
      // update deck stats
      setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+rStats.ok+rStats.bad,correctAnswers:(d.deckStats?.correctAnswers??0)+rStats.ok,roundsCompleted:(d.deckStats?.roundsCompleted??0)+1}}));
      // update game stats
      const roundBonus=50;
      const totalXp=rStats.xp+roundBonus;
      setGameStats(prev=>{
        const updated=checkStreak(prev);
        const oldLvl=getLevel(updated.xp??0).level;
        const newXp=(updated.xp??0)+totalXp;
        const newLvl=getLevel(newXp).level;
        const result={...updated,xp:newXp};
        setRoundEndData({xpEarned:totalXp,newLevel:newLvl>oldLvl?newLvl:null,streak:result.dailyStreak});
        return result;
      });
      setScreen("roundEnd");
    } else setRIdx(nxt);
  }
  function nextRound(){setRWords(pickRound(deck.words));setRIdx(0);setRStats({ok:0,bad:0,xp:0});setCombo(0);clearCard();setScreen("study");}

  /* ── mic ── */
  async function startListen(lang){
    setMicErr("");
    if(micSt!=="ready"){setMicSt("requesting");try{streamRef.current=await navigator.mediaDevices.getUserMedia({audio:true});setMicSt("ready");}catch(err){setMicSt("error");setMicErr(err.name==="NotAllowedError"?"Přístup k mikrofonu zamítnut.":err.name==="NotFoundError"?"Mikrofon nenalezen.":`Chyba: ${err.message}`);return;}}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setMicErr("Rozpoznávání řeči funguje pouze v Chrome/Edge.");return;}
    const rec=new SR();rec.lang=lang;rec.continuous=false;rec.interimResults=true;
    rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join("");setTx(t);if(e.results[e.results.length-1].isFinal){evalAnswer(t);rec.stop();}};
    rec.onerror=ev=>{if(ev.error!=="aborted")setMicErr({"not-allowed":"Mikrofon blokován.","service-not-allowed":"Rozpoznávání blokováno — zkus psaní.","no-speech":"Nic nezaznamenáno.","network":"Chyba sítě."}[ev.error]??`Chyba: ${ev.error}`);setListen(false);};
    rec.onend=()=>setListen(false);
    recRef.current=rec;rec.start();setListen(true);
  }
  function stopListen(){recRef.current?.stop();setListen(false);}

  /* ── speak helper ── */
  function speakWord(text,lang){if(lang==="en-US"&&dictEntry?.audio)playAudio(dictEntry.audio);else doSpeak(synthRef.current,text,lang);}

  /* ── flip card answer ── */
  function flipAnswer(quality){
    const w=rWords[rIdx];if(!w)return;
    const ok=quality>=3;
    const xpGain=ok?1:0; // karty: 1 za správně, 0 za ostatní
    playSound(ok?"ok":"bad");
    const newCombo=quality>=5?combo+1:0;
    setCombo(newCombo);
    const sm2=sm2Update(w,quality);
    setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,
      words:d.words.map(dw=>dw.id!==w.id?dw:{...dw,...sm2,score:quality>=3?(dw.score??0)+1:Math.max(0,(dw.score??0)-1),wStats:{total:(dw.wStats?.total??0)+1,correct:(dw.wStats?.correct??0)+(ok?1:0),wrong:(dw.wStats?.wrong??0)+(ok?0:1)}}),
      deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+1,correctAnswers:(d.deckStats?.correctAnswers??0)+(ok?1:0),roundsCompleted:d.deckStats?.roundsCompleted??0},
    }));
    setRStats(s=>({...s,ok:s.ok+(ok?1:0),bad:s.bad+(ok?0:1),xp:s.xp+xpGain}));
    setFlipFlash(quality===0?"bad":quality===3?"warn":"ok");
    setTimeout(()=>{setFlipFlash(null);setFlipped(false);nextCard();},420);
  }

  /* ── text/mic answer ── */
  async function evalAnswer(text){
    const w=rWords[rIdx];if(!w||feedback)return;
    if(mode==="pron"){
      const ok=localMatch(text,w.en);
      if(ok){commitAnswer(w,5,text);return;}
      const att=pronAtt+1;
      if(att>=3){commitAnswer(w,0,text,true);}
      else{setPronAtt(att);setTx("");setTimeout(()=>speakWord(w.en,"en-US"),300);}
      return;
    }
    const ef=mode==="transl"
      ? (translDir==="en-cs"?(w.cs+(w.synonyms?" / "+w.synonyms:"")):(w.en+(w.synonyms?" / "+w.synonyms:"")))
      : (w.cs+(w.synonyms?" / "+w.synonyms:""));
    if(localMatch(text,ef)){commitAnswer(w,5,text);return;}
    setEvalLoading(true);
    // no Claude API - just local
    setEvalLoading(false);
    commitAnswer(w,0,text);
  }
  function commitAnswer(w,quality,given,forced=false){
    const ok=quality>=3;
    const xpGain=calcXP(quality,combo);
    const newCombo=ok?combo+1:0;
    setCombo(newCombo);
    if(xpGain>0){/* XP shown only at round end */}
    const sm2=sm2Update(w,quality);
    setFB({ok,answer:translDir==="en-cs"?w.cs:w.en,given,forced,quality});
    setRStats(s=>({...s,ok:s.ok+(ok?1:0),bad:s.bad+(ok?0:1),xp:s.xp+xpGain}));
    setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,
      words:d.words.map(dw=>dw.id!==w.id?dw:{...dw,...sm2,score:ok?(dw.score??0)+1:Math.max(0,(dw.score??0)-1),wStats:{total:(dw.wStats?.total??0)+1,correct:(dw.wStats?.correct??0)+(ok?1:0),wrong:(dw.wStats?.wrong??0)+(ok?0:1)}}),
      deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+1,correctAnswers:(d.deckStats?.correctAnswers??0)+(ok?1:0),roundsCompleted:d.deckStats?.roundsCompleted??0},
    }));
  }
  function submitTyped(){if(typed.trim())evalAnswer(typed.trim());}
  function dontKnow(){const w=rWords[rIdx];if(!w||feedback)return;const ans=translDir==="en-cs"?w.cs:w.en;const lang=translDir==="en-cs"?"cs-CZ":"en-US";commitAnswer(w,0,"");speakWord(ans,lang);}

  /* ── loading ── */
  if(!loaded)return(<div style={{minHeight:"100dvh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:32,height:32,border:"3px solid #2e3447",borderTopColor:C.gold,borderRadius:"50%",animation:"spin .8s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);

  /* ── routing ── */
  if(screen==="home") return(<>
    {showOnboarding&&<OnboardingModal onSample={()=>{loadSampleDeck();setShowOnboarding(false);}} onUpload={f=>{loadFile(f);setShowOnboarding(false);}} onClose={()=>setShowOnboarding(false)}/>}
    <HomeScreen decks={decks} langs={langs} activeLang={activeLang} gameStats={gameStats} onLangSwitch={setLang} onAddLang={addLang} onEditLang={editLang} onDeleteLang={deleteLang} onSelect={id=>{setDeckId(id);setScreen("deck");}} onFileUpload={loadFile} onSampleDeck={loadSampleDeck}/>
  </>);
  if(screen==="deck"&&deck){const lc=langs.find(l=>l.id===deck.lang)||langs[0];return <DeckScreen deck={deck} langCfg={lc} onBack={()=>setScreen("home")} onStart={startStudy} onUpdate={updWord} onAddWord={addWord} onDeleteWord={delWord} onDeleteDeck={delDeck} onRename={renameDeck} onResetStats={resetStats}/>;}
  if(screen==="roundEnd") return <RoundEnd stats={rStats} total={rWords.length} deckName={deck?.name??""} xpEarned={roundEndData?.xpEarned??0} newLevel={roundEndData?.newLevel} streak={roundEndData?.streak} onNext={nextRound} onBack={()=>setScreen("deck")}/>;

  /* ══ STUDY ══════════════════════════════════════════════════ */
  const w=rWords[rIdx];if(!w)return null;
  const isPron=mode==="pron",isFlip=mode==="flip";
  const effDir=translDir; // direction for transl mode
  const question=isPron?w.en:(effDir==="en-cs"?w.en:w.cs);
  const qLang=effDir==="en-cs"?"en-US":"cs-CZ";
  const aLang=effDir==="en-cs"?"cs-CZ":"en-US";
  const micLang=effDir==="en-cs"?"cs-CZ":"en-US";
  const total=rStats.ok+rStats.bad;
  const pct=total?Math.round(rStats.ok/total*100):0;
  const ci=comboInfo(combo);
  const allSyn=[...parseSyn(effDir==="en-cs"?w.cs:w.en).slice(1),...parseSyn(w.synonyms||"")].join(" · ");

  return(<div style={{minHeight:"100dvh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column",overscrollBehavior:"none",alignItems:"center",overflow:"hidden"}}>
    <style>{STYLE}</style>

    {/* top bar */}
    <div style={{width:"100%",maxWidth:680,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.75rem 1rem",borderBottom:`1px solid #1a1f2e`,gap:8}}>
      <button className="btn" onClick={()=>setScreen("deck")} style={{color:C.muted,fontSize:12,flexShrink:0}}>← {deck?.name}</button>
      <div style={{flex:1,maxWidth:130}}>
        <div style={{fontSize:10,color:C.muted,textAlign:"center",marginBottom:3}}>Kolo {rIdx+1}/{rWords.length}</div>
        <div style={{background:"#1a2030",borderRadius:3,height:3}}><div style={{width:`${((rIdx+1)/rWords.length)*100}%`,height:"100%",background:C.gold,borderRadius:3,transition:"width .3s"}}/></div>
      </div>
      <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
        {ci&&<span style={{background:ci.color+"22",color:ci.color,padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{ci.txt} {ci.mult}</span>}
        {[{bg:C.okBg,c:C.ok,t:`✓${rStats.ok}`},{bg:C.errBg,c:C.err,t:`✗${rStats.bad}`},...(total>0?[{bg:"#1a2038",c:"#7090c8",t:`${pct}%`}]:[])].map(({bg,c,t},i)=><span key={i} style={{background:bg,color:c,padding:"2px 7px",borderRadius:20,fontSize:11,fontWeight:500}}>{t}</span>)}
      </div>
      <SettingsDropdown autoPlay={autoPlay} onToggle={setAutoPlay}/>
    </div>

    {/* mode tabs */}
    <div style={{width:"100%",maxWidth:680,padding:"0.6rem 1rem 0",display:"flex",gap:5}}>
      {MODES.map(m=><button key={m.id} className="btn" onClick={()=>{setMode(m.id);clearCard();}} style={{flex:1,background:mode===m.id?"#1e2a45":C.card,border:`1.5px solid ${mode===m.id?"#3a5080":C.border}`,color:mode===m.id?C.gold:"#6a7080",borderRadius:9,padding:"6px 3px",fontSize:12,cursor:"pointer",transition:"all .2s"}}>{m.label}</button>)}
    </div>

    {/* direction buttons — for transl and flip modes */}
    {(mode==="transl"||mode==="flip")&&(()=>{
      const activeDir=mode==="flip"?flipDir:translDir;
      const setDir=v=>{if(mode==="flip")setFlipDir(v);else setTranslDir(v);clearCard();};
      const lc=langs.find(l=>l.id===deck?.lang)||langs[0];
      const nativeLabel=lc?.label||"Čeština";
      const studyLabel=lc?.label||"Angličtina";
      const nativeCode=lc?.nativeCode||"CZ";
      const studyCode=lc?.studyCode||"EN";
      const studyFlag=lc?.flag||"🇬🇧";
      const opts=[
        {dir:"en-cs", label:`${studyFlag} ${studyLabel} → ${nativeCode}`},
        {dir:"cs-en", label:`${nativeCode} → ${studyFlag} ${studyLabel}`},
      ];
      return(
        <div style={{width:"100%",maxWidth:680,padding:"0.5rem 1rem 0",display:"flex",gap:7}}>
          {opts.map(opt=>(
            <button key={opt.dir} className="btn" onClick={()=>setDir(opt.dir)}
              style={{
                flex:1,
                background:activeDir===opt.dir?"#1e2a45":C.card,
                border:`1.5px solid ${activeDir===opt.dir?"#3a5080":C.border}`,
                color:activeDir===opt.dir?C.gold:"#6a7080",
                borderRadius:10,padding:"9px 8px",fontSize:13,
                cursor:"pointer",transition:"all .2s",
                fontFamily:"'Lora',serif",fontWeight:activeDir===opt.dir?600:400,
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      );
    })()}

    {/* main */}
    <div style={{flex:1,width:"100%",maxWidth:680,display:"flex",flexDirection:"column",alignItems:"center",padding:"1rem",gap:"0.8rem"}}>

      {/* ── FLIP CARD MODE ── */}
      {isFlip&&(
        <FlipSwipeCard
          key={w.id+flipDir}
          word={w}
          dir={flipDir}
          flipped={flipped}
          flipFlash={flipFlash}
          dictEntry={dictEntry}
          allSyn={allSyn}
          onFlip={()=>{
            setFlipped(true);
            // cs-en: when card flips, we now see EN word — speak it
            if(flipDir==="cs-en"&&autoPlay){
              setTimeout(()=>speakWord(w.en,"en-US"),200);
            }
          }}
          onAnswer={flipAnswer}
          onSpeak={()=>speakWord(w.en,"en-US")}
          onSpeakBack={()=>speakWord(w.en,"en-US")}
        />
      )}

      {/* ── STANDARD MODES (transl, pron) ── */}
      {!isFlip&&(<>
        {/* card */}
        <div key={w.id+mode+effDir} className="card-in" style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"1.2rem 1.5rem",textAlign:"center"}}>
          {isPron?(
            <>
              <div style={{fontSize:10,color:"#3e6850",textTransform:"uppercase",letterSpacing:3,marginBottom:8}}>🔊 Výslovnost</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:5}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:700,color:C.text}}>{w.en}</div>
                <button className="btn" onClick={()=>speakWord(w.en,"en-US")} style={{border:`1px solid #2a5030`,color:"#6acf90",borderRadius:"50%",width:30,height:30,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>🔊</button>
              </div>
              {dictEntry?.ipa&&<div style={{fontSize:13,color:C.muted,fontStyle:"italic",marginBottom:4}}>{dictEntry.ipa}</div>}
              {w.cs&&<div style={{fontSize:13,color:"#4a6050",fontStyle:"italic"}}>{parseSyn(w.cs)[0]}</div>}
              {pronAtt>0&&!feedback&&<div style={{fontSize:12,color:pronAtt>=2?C.err:"#c89040",marginTop:5}}>{pronAtt===1?"Pokus 2/3":"Poslední pokus 3/3"}</div>}
            </>
          ):(
            <>
              <div style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:3,marginBottom:8}}>
                {effDir==="en-cs"?"🇬🇧 Anglicky":"🇨🇿 Česky"}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:5}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:C.text,lineHeight:1.2}}>{question}</div>
                <button className="btn" onClick={()=>speakWord(question,qLang)} style={{border:`1px solid #2e3447`,color:"#6a7888",borderRadius:"50%",width:28,height:28,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>🔊</button>
              </div>
              {effDir==="en-cs"&&dictEntry?.ipa&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic",marginBottom:4}}>{dictEntry.ipa}</div>}
              {/* example only in en-cs direction, bigger font */}
              {effDir==="en-cs"&&w.example&&!feedback&&(
                <div style={{fontSize:14,color:"#3a4a50",fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4,lineHeight:1.5}}>
                  💡 „{w.example}"
                </div>
              )}
            </>
          )}
          <div style={{display:"flex",justifyContent:"center",gap:5,marginTop:10}}>
            {[0,1,2,3,4].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",transition:"background .3s",background:i<(w.score??0)?C.gold:"#1e2535"}}/>)}
          </div>
        </div>

        {/* input toggle */}
        {!feedback&&!isPron&&(<div style={{display:"flex",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:3,gap:3}}>
          {[["mic","🎤 Mikrofon"],["text","⌨️ Psát"]].map(([m,lbl])=>(
            <button key={m} className="btn" onClick={()=>{setIMode(m);setMicErr("");setTx("");}} style={{background:iMode===m?"#1e2a45":"transparent",border:iMode===m?"1px solid #2e4065":"1px solid transparent",color:iMode===m?C.gold:"#6a7080",borderRadius:7,padding:"5px 14px",fontSize:13,cursor:"pointer"}}>{lbl}</button>
          ))}
        </div>)}

        {evalLoading&&<div style={{fontSize:13,color:C.gold,textAlign:"center",opacity:.8}}>🤖 Vyhodnocuji…</div>}

        {/* answer area */}
        {!feedback&&!evalLoading&&(
          <div className="fade-up" style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:9}}>
            {(iMode==="mic"||isPron)&&(<>
              {micErr&&<div style={{width:"100%",background:"#200e0e",border:`1px solid #5a2020`,borderRadius:9,padding:"8px 12px",fontSize:12,color:"#e08080",lineHeight:1.5}}>⚠️ {micErr}{!isPron&&<button className="btn" onClick={()=>setIMode("text")} style={{marginLeft:8,background:C.gold,color:C.bg,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Psát</button>}</div>}
              {micSt==="requesting"&&<div style={{color:"#8a9060",fontSize:12}}>Žádám o přístup k mikrofonu…</div>}
              <div style={{color:C.muted,fontSize:12,minHeight:20,textAlign:"center",display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
                {listenOn?(<><span style={{display:"flex",alignItems:"flex-end",height:16}}>{[1,2,3,4,5].map(i=><span key={i} className="wv" style={{height:5}}/>)}</span>{tx?`„${tx}"`:isPron?"Řekni slovo anglicky…":`Říkejte ${effDir==="en-cs"?"česky":"anglicky"}…`}</>):tx?`„${tx}"`:isPron?"Klikni na 🎤 a zopakuj":`Řekněte překlad ${effDir==="en-cs"?"česky":"anglicky"}`}
              </div>
              <button onClick={listenOn?stopListen:()=>startListen(micLang)} className={`btn${listenOn?" mic-on":""}`}
                style={{width:66,height:66,borderRadius:"50%",fontSize:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:listenOn?"#c49840":"#141c2e",border:`2.5px solid ${listenOn?C.gold:"#2e3447"}`,color:listenOn?C.bg:"#7a8888",transition:"all .2s"}}>
                {listenOn?"⏹":"🎤"}
              </button>
            </>)}
            {iMode==="text"&&!isPron&&(<div style={{width:"100%",display:"flex",flexDirection:"column",gap:7}}>
              <input className="inp" value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitTyped()} placeholder={effDir==="en-cs"?"česky…":"anglicky…"} autoFocus/>
              <button className="btn" onClick={submitTyped} style={{background:typed.trim()?C.gold:"#1a2030",color:typed.trim()?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"11px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Playfair Display',serif",transition:"all .2s"}}>Zkontrolovat →</button>
            </div>)}
            {!isPron&&(<button className="btn" onClick={dontKnow}
              style={{border:`1.5px solid #3d3020`,background:"#1a1508",color:"#c8a050",borderRadius:9,padding:"8px 22px",fontSize:13,cursor:"pointer",fontWeight:500,transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#3d3020";e.currentTarget.style.color="#c8a050";}}>
              Nevím — ukázat &amp; přečíst 🔈
            </button>)}
          </div>
        )}

        {/* feedback */}
        {!evalLoading&&feedback&&(
          <div className="fade-up" style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{width:"100%",background:feedback.ok?C.okBg:C.errBg,border:`1px solid ${feedback.ok?C.okBorder:C.errBorder}`,borderRadius:14,padding:"1rem 1.2rem",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:28,flexShrink:0}}>{feedback.ok?"✓":"✗"}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700,color:feedback.ok?C.ok:C.err,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                  {feedback.ok?(isPron?"Výborná výslovnost!":"Správně!"):(feedback.forced?"3× špatně":(isPron?"Zkus příště":"Špatně"))}
                  {feedback.ok&&<span style={{fontSize:10,color:"#5a7060",marginLeft:"auto"}}>→ za chvíli…</span>}
                </div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,color:C.text}}>{parseSyn(feedback.answer)[0]||feedback.answer}</div>
                {allSyn&&<div style={{fontSize:11,color:"#5a6a50",marginTop:2}}>✓ také: {allSyn}</div>}
                {dictEntry?.ipa&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic",marginTop:2}}>{dictEntry.ipa}</div>}
                {effDir==="en-cs"&&w.example&&<div style={{fontSize:14,color:"#3a4a50",fontStyle:"italic",marginTop:6,lineHeight:1.5}}>💡 „{w.example}"</div>}
                {!feedback.ok&&feedback.given&&<div style={{fontSize:11,color:"#4a4030",marginTop:4,fontStyle:"italic"}}>Vaše odpověď: „{feedback.given}"</div>}
              </div>
              <button className="btn" onClick={()=>speakWord(parseSyn(feedback.answer)[0]||feedback.answer,aLang)} style={{border:`1px solid #2e3447`,color:"#6a7888",borderRadius:"50%",width:32,height:32,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔊</button>
            </div>
            {!feedback.ok&&(<button className="btn" onClick={nextCard}
              style={{background:C.card,border:`1px solid ${C.border}`,color:C.textDim,borderRadius:11,padding:"10px 32px",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textDim;}}>
              Další →{wrongCountdown>0&&<span style={{background:"#2a3040",color:C.muted,borderRadius:"50%",width:22,height:22,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{wrongCountdown}</span>}
            </button>)}
          </div>
        )}
      </>)}
    </div>
  </div>);
}
