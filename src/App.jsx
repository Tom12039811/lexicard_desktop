import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════════
   STORAGE — works in Claude artifact (window.storage) + Vercel (localStorage)
═══════════════════════════════════════════════════════════════ */
const store = {
  async get(k) {
    try { if(window.storage?.get){const r=await window.storage.get(k);return r?.value??null;} } catch{}
    try { return localStorage.getItem(k); } catch { return null; }
  },
  async set(k,v) {
    try { if(window.storage?.set){await window.storage.set(k,v);return;} } catch{}
    try { localStorage.setItem(k,v); } catch{}
  }
};

/* ═══════════════════════════════════════════════════════════════
   SM-2 SPACED REPETITION
═══════════════════════════════════════════════════════════════ */
function srsUpdate(word, correct) {
  const ef = Math.max(1.3, Math.min(2.8, (word.ef??2.5)+(correct?0.08:-0.25)));
  const reps = correct ? (word.reps??0)+1 : 0;
  const interval = !correct ? 1 : reps<=1 ? 1 : reps===2 ? 3 : Math.round((word.interval??1)*ef);
  return { ef, reps, interval, due: Date.now()+interval*86400000 };
}
function isDue(w) { return !w.due || w.due <= Date.now(); }
function dueCount(words) { return words.filter(isDue).length; }
function pickStudyWords(words, n=20) {
  const now=Date.now();
  const due=words.filter(w=>isDue(w));
  const future=[...words].filter(w=>w.due&&w.due>now).sort((a,b)=>a.due-b.due);
  return [...due,...future].slice(0,n);
}

/* ═══════════════════════════════════════════════════════════════
   XP & LEVELS
═══════════════════════════════════════════════════════════════ */
const XP_THRESHOLDS=[0,100,300,600,1100,2000,3500,6000,10000,15000];
function getLevel(xp){let l=1;for(let i=0;i<XP_THRESHOLDS.length-1;i++){if(xp>=XP_THRESHOLDS[i])l=i+1;}return l;}
function getLevelProgress(xp){const l=getLevel(xp),f=XP_THRESHOLDS[l-1]??0,c=XP_THRESHOLDS[l]??XP_THRESHOLDS[XP_THRESHOLDS.length-1];return c===f?1:(xp-f)/(c-f);}
function getXPToNext(xp){const l=getLevel(xp);return(XP_THRESHOLDS[l]??0)-xp;}
function calcXP(correct,streak){return correct?10+Math.min(15,Math.floor((streak??0)/3)*3):0;}

/* ═══════════════════════════════════════════════════════════════
   STREAK
═══════════════════════════════════════════════════════════════ */
const todayStr=()=>new Date().toDateString();
function calcStreak(lastStudy,cur){
  if(!lastStudy)return 1;
  if(lastStudy===todayStr())return cur??1;
  if(lastStudy===new Date(Date.now()-86400000).toDateString())return(cur??0)+1;
  return 1;
}

/* ═══════════════════════════════════════════════════════════════
   BADGES
═══════════════════════════════════════════════════════════════ */
const BADGES=[
  {id:'first',  icon:'🌱',name:'První krok',    desc:'První správná odpověď',  check:s=>s.totalCorrect>=1},
  {id:'ten',    icon:'🎯',name:'Desítka',       desc:'10 zvládnutých slovíček', check:s=>s.totalMastered>=10},
  {id:'hundred',icon:'💯',name:'Stotník',       desc:'100 správných odpovědí',  check:s=>s.totalCorrect>=100},
  {id:'streak7',icon:'🔥',name:'Týden v kuse',  desc:'7 dní za sebou',          check:s=>s.streak>=7},
  {id:'perfect',icon:'⭐',name:'Perfekcionista',desc:'Perfektní kolo',           check:s=>s.lastPerfect},
  {id:'xp500',  icon:'💎',name:'Diamant',       desc:'500 XP',                  check:s=>s.xp>=500},
  {id:'xp2000', icon:'👑',name:'Mistr slov',    desc:'2000 XP',                 check:s=>s.xp>=2000},
  {id:'poly',   icon:'🌍',name:'Polyglot',      desc:'Balíčky ve 2+ jazycích',  check:s=>s.langCount>=2},
];
function checkNewBadges(profile, earned=[]) {
  return BADGES.filter(b=>!earned.includes(b.id)&&b.check(profile)).map(b=>b.id);
}

/* ═══════════════════════════════════════════════════════════════
   SOUND
═══════════════════════════════════════════════════════════════ */
function playSound(type) {
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    (type==='correct'?[[523,0,.12],[659,.1,.28],[784,.2,.45]]:[[350,0,.18],[294,.14,.35]])
      .forEach(([f,s,e])=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type='sine';o.frequency.value=f;o.connect(g);g.connect(ctx.destination);
        g.gain.setValueAtTime(0,ctx.currentTime+s);
        g.gain.linearRampToValueAtTime(type==='correct'?.18:.12,ctx.currentTime+s+.04);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+e+.18);
        o.start(ctx.currentTime+s);o.stop(ctx.currentTime+e+.22);
      });
  } catch{}
}

/* ═══════════════════════════════════════════════════════════════
   TEXT & MATCHING
═══════════════════════════════════════════════════════════════ */
const uid=()=>Math.random().toString(36).slice(2,9);
const nowTs=()=>Date.now();
function norm(t){return(t||'').normalize('NFD').replace(/\p{Mn}/gu,'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();}
function parseSyns(f){if(!f)return[];return f.split(/[\/,]/).map(s=>s.trim()).filter(Boolean);}
function lev(a,b){const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[m][n];}
function localMatch(input,field){
  const s=norm(input);
  for(const c of parseSyns(field)){
    const e=norm(c);if(!e)continue;
    if(s===e)return true;
    const ew=e.split(' '),sw=s.split(' ');
    if(ew.length===1&&sw.some(w=>w===ew[0]))return true;
    if(sw.length===1&&ew.some(w=>w===sw[0]))return true;
    if(ew.length>1&&ew.filter(w=>sw.includes(w)).length/ew.length>=.72)return true;
    if(ew.length===1&&sw.length===1&&lev(s,e)<=Math.floor(e.length*.25))return true;
    if(sw.filter(w=>w!=='se'&&w!=='si').join(' ')===ew.filter(w=>w!=='se'&&w!=='si').join(' '))return true;
  }
  return false;
}
async function claudeEval(ans,field,src,mode){
  try{
    const list=parseSyns(field).join(', ');
    const p=mode==='en-cs'
      ?`Slovo:"${src}" Překlady:${list} Odpověď:"${ans}" Správně?(synonyma/překlepy OK) POUZE: SPRÁVNĚ nebo ŠPATNĚ`
      :`Word:"${src}" Correct:${list} Answer:"${ans}" OK?(synonyms/typos) ONLY: CORRECT or INCORRECT`;
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:10,messages:[{role:'user',content:p}]})});
    if(!r.ok)return null;
    const d=await r.json();const t=(d.content?.[0]?.text||'').toUpperCase();
    if(t.includes('SPRÁVNĚ')||t.includes('CORRECT'))return true;
    if(t.includes('ŠPATNĚ')||t.includes('INCORRECT'))return false;
    return null;
  }catch{return null;}
}
function getBlankSentence(example,enWord){
  if(!example||!enWord)return null;
  const rx=new RegExp(enWord.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&'),'gi');
  const b=example.replace(rx,'______');
  return b===example?null:b;
}
function doSpeak(synth,text,lang){if(!synth||!text)return;synth.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.82;synth.speak(u);}

/* ═══════════════════════════════════════════════════════════════
   SORT HELPERS
═══════════════════════════════════════════════════════════════ */
function sortDecks(d,k){const a=[...d];if(k==='name-asc')return a.sort((a,b)=>a.name.localeCompare(b.name));if(k==='name-desc')return a.sort((a,b)=>b.name.localeCompare(a.name));if(k==='date-asc')return a.sort((a,b)=>(a.createdAt??0)-(b.createdAt??0));return a.sort((a,b)=>(b.createdAt??0)-(a.createdAt??0));}
function sortWords(w,k){const a=[...w];if(k==='en-asc')return a.sort((a,b)=>a.en.localeCompare(b.en));if(k==='en-desc')return a.sort((a,b)=>b.en.localeCompare(a.en));if(k==='cs-asc')return a.sort((a,b)=>a.cs.localeCompare(b.cs));if(k==='cs-desc')return a.sort((a,b)=>b.cs.localeCompare(a.cs));if(k==='date-desc')return a.sort((a,b)=>(b.addedAt??0)-(a.addedAt??0));return a.sort((a,b)=>(a.addedAt??0)-(b.addedAt??0));}
function sortStats(w,k){const a=[...w];if(k==='total-desc')return a.sort((a,b)=>(b.wStats?.total??0)-(a.wStats?.total??0));if(k==='correct-desc')return a.sort((a,b)=>(b.wStats?.correct??0)-(a.wStats?.correct??0));if(k==='wrong-desc')return a.sort((a,b)=>(b.wStats?.wrong??0)-(a.wStats?.wrong??0));if(k==='pct-desc')return a.sort((a,b)=>{const ap=a.wStats?.total?a.wStats.correct/a.wStats.total:0,bp=b.wStats?.total?b.wStats.correct/b.wStats.total:0;return bp-ap;});if(k==='score-desc')return a.sort((a,b)=>(b.score??0)-(a.score??0));return a.sort((a,b)=>a.en.localeCompare(b.en));}

/* ═══════════════════════════════════════════════════════════════
   SAMPLE DECK (onboarding)
═══════════════════════════════════════════════════════════════ */
const SAMPLE_DECK={
  id:uid(),name:'Základní slovíčka',lang:'en',createdAt:nowTs(),
  deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0},
  words:[
    {id:uid(),en:'apple',cs:'jablko',example:'An apple a day keeps the doctor away.',synonyms:'',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'beautiful',cs:'krásný',example:'What a beautiful day!',synonyms:'nádherný / překrásný',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'contestant',cs:'soutěžící',example:'She is a contestant in the competition.',synonyms:'závodník / účastník',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'freedom',cs:'svoboda',example:'Freedom is a fundamental right.',synonyms:'volnost',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'knowledge',cs:'znalost',example:'Knowledge is power.',synonyms:'vědomost / vědění',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'challenge',cs:'výzva',example:'This is a great challenge.',synonyms:'',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'journey',cs:'cesta',example:'Life is a long journey.',synonyms:'pouť / výprava',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
    {id:uid(),en:'succeed',cs:'uspět',example:'I want to succeed in life.',synonyms:'podařit se / zvládnout',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}},
  ]
};

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const DEFAULT_LANGS=[{id:'en',label:'Angličtina',flag:'🇬🇧',code:'ENG'},{id:'es',label:'Španělština',flag:'🇪🇸',code:'ESP'}];
const STUDY_MODES=[
  {id:'en-cs',label:'🇬🇧→🇨🇿',desc:'Anglicky → česky'},
  {id:'cs-en',label:'🇨🇿→🇬🇧',desc:'Česky → anglicky'},
  {id:'pron', label:'🔊 Výsl.',desc:'Výslovnost'},
  {id:'blank',label:'✏️ Doplň',desc:'Doplň do věty'},
];
const WORD_SORTS=[{id:'date-asc',label:'Pořadí'},{id:'en-asc',label:'EN ↑'},{id:'en-desc',label:'EN ↓'},{id:'cs-asc',label:'CS ↑'},{id:'cs-desc',label:'CS ↓'},{id:'date-desc',label:'Datum ↓'}];
const STAT_SORT_OPTS=[{id:'en-asc',label:'Slovo ↑'},{id:'total-desc',label:'Procv. ↓'},{id:'correct-desc',label:'Správně ↓'},{id:'wrong-desc',label:'Špatně ↓'},{id:'pct-desc',label:'Úsp. ↓'},{id:'score-desc',label:'Skóre ↓'}];
const C={bg:'#0b0f16',card:'#111622',border:'#1e2535',gold:'#d4a853',goldDim:'#7a5818',text:'#f0e6d3',textDim:'#9a9080',muted:'#5a6070',mutedDark:'#3e4455',ok:'#5cb88a',okBg:'#0f2018',okBorder:'#255030',err:'#c87070',errBg:'#200e0e',errBorder:'#4a1a1a',xp:'#7090e8',xpBg:'#0e1428'};

/* ═══════════════════════════════════════════════════════════════
   GLOBAL STYLES
═══════════════════════════════════════════════════════════════ */
const STYLE=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{overflow-x:hidden;max-width:100vw;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes cardIn{from{opacity:0;transform:scale(.97) translateY(6px)}to{opacity:1;transform:scale(1)}}
  @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,168,83,.5)}55%{box-shadow:0 0 0 18px rgba(212,168,83,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes wave{0%,100%{height:5px}50%{height:18px}}
  @keyframes overlayIn{from{opacity:0}to{opacity:1}}
  @keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
  @keyframes badgePop{0%{transform:scale(0) rotate(-15deg);opacity:0}70%{transform:scale(1.2) rotate(5deg)}100%{transform:scale(1) rotate(0);opacity:1}}
  .fade-up{animation:fadeUp .22s ease both}
  .card-in{animation:cardIn .3s ease both}
  .mic-on{animation:micPulse 1.2s ease-in-out infinite}
  .pulse{animation:pulse 1s ease-in-out infinite}
  .badge-pop{animation:badgePop .5s ease both}
  .btn{cursor:pointer;transition:filter .15s,transform .1s;border:none;font-family:'Lora',serif;background:transparent;}
  .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
  .btn:active{transform:translateY(0) scale(.97)}
  .inp{width:100%;background:#0e1320;border:1.5px solid #2e3447;color:#f0e6d3;border-radius:10px;padding:10px 13px;font-size:15px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp:focus{border-color:#d4a853}
  .inp::placeholder{color:#2e3550}
  .inp-sm{width:100%;background:#0e1320;border:1.5px solid #2e3447;color:#f0e6d3;border-radius:8px;padding:8px 11px;font-size:14px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp-sm:focus{border-color:#d4a853}
  .inp-sm::placeholder{color:#2e3550}
  .tdinp{width:100%;background:transparent;border:none;color:#ccc5b5;font-size:13px;font-family:'Lora',serif;outline:none;padding:7px 9px;border-radius:6px;transition:background .15s;}
  .tdinp:focus{background:#141c30;}
  .tdinp::placeholder{color:#252e40}
  .wv{width:4px;border-radius:2px;background:#d4a853;display:inline-block;margin:0 2px;}
  .wv:nth-child(1){animation:wave .8s ease-in-out infinite 0s}
  .wv:nth-child(2){animation:wave .8s ease-in-out infinite .13s}
  .wv:nth-child(3){animation:wave .8s ease-in-out infinite .26s}
  .wv:nth-child(4){animation:wave .8s ease-in-out infinite .39s}
  .wv:nth-child(5){animation:wave .8s ease-in-out infinite .52s}
  .overlay{position:fixed;inset:0;background:rgba(5,8,14,.85);display:flex;align-items:center;justify-content:center;z-index:100;animation:overlayIn .18s ease;padding:1rem;}
  .modal{background:#111e30;border:1px solid #2a3650;border-radius:20px;padding:1.5rem;width:100%;max-width:480px;animation:modalIn .22s ease;max-height:90vh;overflow-y:auto;}
  .modal-wide{max-width:860px;}
  @media(max-width:600px){
    .hide-mobile{display:none!important;}
    .deck-header-row{flex-wrap:wrap;gap:6px!important;}
    .stat-grid-6{grid-template-columns:repeat(3,1fr)!important;}
    .word-grid{grid-template-columns:22px 1fr 1fr 22px!important;}
    .word-grid-hdr{grid-template-columns:22px 1fr 1fr 22px!important;}
  }
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-track{background:#0b0f16}
  ::-webkit-scrollbar-thumb{background:#2a3040;border-radius:2px}
`;

/* ═══════════════════════════════════════════════════════════════
   UI PRIMITIVES
═══════════════════════════════════════════════════════════════ */
function Modal({onClose,children,wide=false}){
  useEffect(()=>{const h=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[onClose]);
  return(<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal${wide?' modal-wide':''}`}>{children}</div></div>);
}
function Confirm({title,msg,confirmLabel='Smazat',onConfirm,onClose}){
  return(<Modal onClose={onClose}><div style={{textAlign:'center',padding:'0.5rem 0'}}><div style={{fontSize:36,marginBottom:12}}>⚠️</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.text,marginBottom:8}}>{title}</div><div style={{fontSize:14,color:C.muted,marginBottom:24,lineHeight:1.6}}>{msg}</div><div style={{display:'flex',gap:10}}><button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:'11px',fontSize:14,cursor:'pointer'}}>Zrušit</button><button className="btn" onClick={()=>{onConfirm();onClose();}} style={{flex:1,background:C.err,color:'#fff',border:'none',borderRadius:9,padding:'11px',fontSize:14,fontWeight:700,cursor:'pointer'}}>{confirmLabel}</button></div></div></Modal>);
}
function IOSToggle({value,onChange}){
  return(<div onClick={()=>onChange(!value)} style={{width:46,height:26,borderRadius:13,flexShrink:0,background:value?C.ok:'#3e4455',position:'relative',cursor:'pointer',transition:'background .25s'}}><div style={{position:'absolute',top:3,left:value?23:3,width:20,height:20,borderRadius:'50%',background:'white',transition:'left .25s',boxShadow:'0 1px 4px rgba(0,0,0,.4)'}}/></div>);
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS DROPDOWN
═══════════════════════════════════════════════════════════════ */
function SettingsMenu({autoPlay,onToggleAutoPlay}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);
  return(
    <div ref={ref} style={{position:'relative',flexShrink:0}}>
      <button className="btn" onClick={()=>setOpen(o=>!o)} style={{background:open?'#1e2a45':'#1a1f2e',border:`1px solid ${open?'#3a5080':'#2e3447'}`,color:open?C.gold:C.muted,borderRadius:8,padding:'5px 10px',fontSize:18,cursor:'pointer',lineHeight:1}}>⚙️</button>
      {open&&(
        <div style={{position:'absolute',right:0,top:'calc(100% + 8px)',background:'#111e30',border:`1px solid #2a3650`,borderRadius:14,padding:0,minWidth:240,zIndex:50,boxShadow:'0 8px 32px rgba(0,0,0,.6)',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:11,color:C.mutedDark,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>Nastavení</div></div>
          <div style={{padding:'4px 0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',gap:12}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:17,width:22,textAlign:'center'}}>{autoPlay?'🔊':'🔇'}</span>
                <div><div style={{fontSize:13,color:C.text,fontFamily:"'Lora',serif"}}>Auto přehrávání</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>Přehrát slovo při zobrazení</div></div>
              </div>
              <IOSToggle value={autoPlay} onChange={onToggleAutoPlay}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LANG DROPDOWN
═══════════════════════════════════════════════════════════════ */
function LangDropdown({langs,activeId,onSwitch,onAddLang,onDeleteLang}){
  const [open,setOpen]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [delTarget,setDelTarget]=useState(null);
  const [nl,setNl]=useState({label:'',flag:'🌐',code:''});
  const ref=useRef(null);
  const active=langs.find(l=>l.id===activeId)||langs[0];
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);
  function addL(){if(!nl.label.trim()||!nl.code.trim())return;onAddLang({id:uid(),label:nl.label.trim(),flag:nl.flag||'🌐',code:nl.code.trim().toUpperCase().slice(0,3),custom:true});setNl({label:'',flag:'🌐',code:''});setShowAdd(false);setOpen(false);}
  return(
    <>
      <div ref={ref} style={{position:'relative',userSelect:'none'}}>
        <button className="btn" onClick={()=>setOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:8,background:'#111e30',border:`1.5px solid ${open?'#3a5080':C.border}`,borderRadius:10,padding:'8px 12px',cursor:'pointer',minWidth:130,transition:'all .2s'}}>
          <span style={{fontSize:20}}>{active?.flag}</span>
          <span style={{fontWeight:700,fontSize:12,color:C.gold,letterSpacing:.5}}>{active?.code}</span>
          <span style={{fontSize:12,color:C.muted,flex:1,textAlign:'left'}}>{active?.label}</span>
          <span style={{fontSize:10,color:C.muted}}>{open?'▲':'▼'}</span>
        </button>
        {open&&(
          <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'#111e30',border:`1px solid #2a3650`,borderRadius:12,overflow:'hidden',minWidth:210,zIndex:50,boxShadow:'0 8px 32px rgba(0,0,0,.5)'}}>
            {langs.map(l=>(
              <div key={l.id} style={{display:'flex',alignItems:'center',background:l.id===activeId?'#1a2a45':'transparent'}} onMouseEnter={e=>e.currentTarget.style.background=l.id===activeId?'#1a2a45':'#161e30'} onMouseLeave={e=>e.currentTarget.style.background=l.id===activeId?'#1a2a45':'transparent'}>
                <button className="btn" onClick={()=>{onSwitch(l.id);setOpen(false);}} style={{flex:1,display:'flex',alignItems:'center',gap:10,padding:'10px 14px',textAlign:'left'}}>
                  <span style={{fontSize:18}}>{l.flag}</span><span style={{fontWeight:700,fontSize:12,color:C.gold,width:34}}>{l.code}</span><span style={{fontSize:13,color:C.textDim}}>{l.label}</span>
                  {l.id===activeId&&<span style={{marginLeft:'auto',fontSize:12,color:C.ok}}>✓</span>}
                </button>
                {langs.length>1&&<button className="btn" onClick={e=>{e.stopPropagation();setDelTarget(l);setOpen(false);}} style={{padding:'10px 12px',color:'#4a2828',fontSize:16,flexShrink:0,transition:'color .15s'}} onMouseEnter={e=>e.currentTarget.style.color='#c87070'} onMouseLeave={e=>e.currentTarget.style.color='#4a2828'}>×</button>}
              </div>
            ))}
            <div style={{borderTop:`1px solid ${C.border}`,margin:'4px 0'}}/>
            <button className="btn" onClick={()=>{setShowAdd(true);setOpen(false);}} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',color:'#7090b8',textAlign:'left',fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background='#161e30'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{fontSize:18}}>＋</span> Přidat jazyk
            </button>
          </div>
        )}
      </div>
      {delTarget&&<Confirm title={`Smazat ${delTarget.label}?`} msg="Všechny balíčky v tomto jazyce budou smazány. Akce je nevratná." onConfirm={()=>onDeleteLang(delTarget.id)} onClose={()=>setDelTarget(null)}/>}
      {showAdd&&(
        <Modal onClose={()=>setShowAdd(false)}>
          <div style={{marginBottom:16}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:4}}>Přidat jazyk</div></div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Název</div><input className="inp-sm" value={nl.label} onChange={e=>setNl(n=>({...n,label:e.target.value}))} placeholder="např. Francouzština" autoFocus/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Vlajka</div><input className="inp-sm" value={nl.flag} onChange={e=>setNl(n=>({...n,flag:e.target.value}))} placeholder="🇫🇷"/></div>
              <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Kód</div><input className="inp-sm" value={nl.code} onChange={e=>setNl(n=>({...n,code:e.target.value}))} placeholder="FRA" maxLength={3}/></div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button className="btn" onClick={()=>setShowAdd(false)} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:'10px',fontSize:14,cursor:'pointer'}}>Zrušit</button>
              <button className="btn" onClick={addL} style={{flex:2,background:nl.label&&nl.code?C.gold:'#1a2030',color:nl.label&&nl.code?C.bg:'#4a5060',border:'none',borderRadius:9,padding:'10px',fontSize:14,fontWeight:700,cursor:'pointer',transition:'all .2s'}}>Přidat</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UPLOAD MODAL
═══════════════════════════════════════════════════════════════ */
function UploadModal({onClose,onUpload}){
  const [drag,setDrag]=useState(false);
  const fRef=useRef(null);
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:18}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.gold,marginBottom:4}}>Nahrát balíček</div><div style={{fontSize:13,color:C.muted}}>Excel nebo CSV soubor se slovíčky</div></div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f){onUpload(f);onClose();}}} onClick={()=>fRef.current.click()}
        style={{border:`2px dashed ${drag?C.gold:'#2e3447'}`,borderRadius:14,padding:'2rem 1.5rem',textAlign:'center',background:drag?'rgba(212,168,83,.05)':'transparent',cursor:'pointer',transition:'all .2s',marginBottom:16}}>
        <div style={{fontSize:36,marginBottom:8}}>📊</div>
        <div style={{fontSize:15,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700,marginBottom:5}}>Přetáhni nebo klikni</div>
        <div style={{fontSize:12,color:C.mutedDark}}>.xlsx · .xls · .csv</div>
        <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0]){onUpload(e.target.files[0]);onClose();}}}/>
      </div>
      <div style={{background:'#0e1520',borderRadius:10,padding:'11px 14px',fontSize:12,lineHeight:1.7}}>
        <div style={{color:C.mutedDark,fontSize:10,textTransform:'uppercase',letterSpacing:1,marginBottom:6,fontWeight:600}}>Formát sloupců</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'2px 8px',fontFamily:'monospace'}}>
          <span style={{color:'#5c8aaa',fontWeight:600}}>A — EN</span><span style={{color:'#7a8a5c',fontWeight:600}}>B — CS</span><span style={{color:'#9a7a5c',fontWeight:600}}>C — Příklad</span><span style={{color:'#7a6a8a',fontWeight:600}}>D — Synonyma</span>
          <span style={{color:C.muted}}>contestant</span><span style={{color:C.muted}}>soutěžící</span><span style={{color:'#5a5a5a',fontStyle:'italic'}}>She wins.</span><span style={{color:'#7a6a5c'}}>závodník</span>
        </div>
        <div style={{marginTop:7,color:'#5a6a5c',fontSize:11}}>Synonyma lze i v B přímo: <span style={{color:'#8a8',fontFamily:'monospace'}}>soutěžící / závodník</span></div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADD WORD MODAL
═══════════════════════════════════════════════════════════════ */
function AddWordModal({onClose,onAdd}){
  const [en,setEn]=useState('');const [cs,setCs]=useState('');const [ex,setEx]=useState('');const [syn,setSyn]=useState('');
  function submit(){if(!en.trim()||!cs.trim())return;onAdd({en:en.trim(),cs:cs.trim(),example:ex.trim(),synonyms:syn.trim()});onClose();}
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:14}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>Přidat slovíčko</div></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>🇬🇧 Anglicky *</div><input className="inp-sm" value={en} onChange={e=>setEn(e.target.value)} placeholder="anglické slovo" autoFocus onKeyDown={e=>{if(e.key==='Enter')document.getElementById('pro-cs')?.focus();}}/></div>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>🇨🇿 Česky * <span style={{color:C.mutedDark,fontSize:11}}>(nebo více: soutěžící / závodník)</span></div><input id="pro-cs" className="inp-sm" value={cs} onChange={e=>setCs(e.target.value)} placeholder="překlad" onKeyDown={e=>{if(e.key==='Enter')document.getElementById('pro-syn')?.focus();}}/></div>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>🔄 Synonyma <span style={{color:C.mutedDark,fontSize:11}}>(volitelné)</span></div><input id="pro-syn" className="inp-sm" value={syn} onChange={e=>setSyn(e.target.value)} placeholder="závodník / účastník" onKeyDown={e=>{if(e.key==='Enter')document.getElementById('pro-ex')?.focus();}}/></div>
        <div><div style={{fontSize:12,color:C.muted,marginBottom:4}}>💡 Příkladová věta <span style={{color:C.mutedDark,fontSize:11}}>(pro režim Doplň)</span></div><input id="pro-ex" className="inp-sm" value={ex} onChange={e=>setEx(e.target.value)} placeholder="She is a contestant in the competition." onKeyDown={e=>{if(e.key==='Enter')submit();}}/></div>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:'10px',fontSize:14,cursor:'pointer'}}>Zrušit</button>
          <button className="btn" onClick={submit} style={{flex:2,background:en&&cs?C.gold:'#1a2030',color:en&&cs?C.bg:'#4a5060',border:'none',borderRadius:9,padding:'10px',fontSize:14,fontWeight:700,cursor:'pointer',transition:'all .2s'}}>Přidat</button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STATS MODAL
═══════════════════════════════════════════════════════════════ */
function StatsModal({deck,onClose}){
  const [sk,setSk]=useState('total-desc');
  const sorted=sortStats(deck.words,sk);
  const ds=deck.deckStats??{totalAnswers:0,correctAnswers:0,roundsCompleted:0};
  const mastered=deck.words.filter(w=>(w.score??0)>=3).length;
  return(
    <Modal onClose={onClose} wide>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,gap:12}}>
        <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>Statistika — {deck.name}</div><div style={{fontSize:12,color:C.muted}}>{deck.words.length} slov · {mastered} zvládnuto · {ds.roundsCompleted} kol</div></div>
        <button className="btn" onClick={onClose} style={{color:C.muted,fontSize:22,lineHeight:1}}>×</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7,marginBottom:14}}>
        {[{l:'Celkem',v:ds.totalAnswers||0,c:'#7090c8',bg:'#121a2e'},{l:'Správně',v:ds.correctAnswers||0,c:C.ok,bg:C.okBg},{l:'Špatně',v:(ds.totalAnswers||0)-(ds.correctAnswers||0),c:C.err,bg:C.errBg},{l:'Úspěšnost',v:ds.totalAnswers?`${Math.round(ds.correctAnswers/ds.totalAnswers*100)}%`:'—',c:C.gold,bg:'#1a1608'}].map(({l,v,c,bg})=>(
          <div key={l} style={{background:bg,borderRadius:10,padding:'9px 6px',textAlign:'center'}}><div style={{fontSize:10,color:c,textTransform:'uppercase',letterSpacing:.8,marginBottom:3}}>{l}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,color:c}}>{v}</div></div>
        ))}
      </div>
      <div style={{display:'flex',gap:5,marginBottom:10,flexWrap:'wrap'}}>
        <span style={{fontSize:10,color:C.mutedDark,textTransform:'uppercase',letterSpacing:1.5,flexShrink:0,alignSelf:'center'}}>Řadit:</span>
        {STAT_SORT_OPTS.map(s=><button key={s.id} className="btn" onClick={()=>setSk(s.id)} style={{background:sk===s.id?'#1a2a40':'transparent',border:`1px solid ${sk===s.id?'#2e4565':C.border}`,color:sk===s.id?C.gold:C.muted,borderRadius:7,padding:'3px 9px',fontSize:11,cursor:'pointer',transition:'all .2s'}}>{s.label}</button>)}
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:460}}>
          <thead><tr style={{borderBottom:`1px solid #1e2535`}}>{['#','Anglicky','Česky','Synonyma','Celkem','✓','✗','Úsp.','Skóre'].map(h=><th key={h} style={{padding:'6px 8px',color:C.muted,fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:1,textAlign:h==='#'?'center':'left',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>
            {sorted.map((w,i)=>{
              const ws=w.wStats??{total:0,correct:0,wrong:0};
              const pct=ws.total?Math.round(ws.correct/ws.total*100):null;
              const pc=pct===null?C.muted:pct>=80?C.ok:pct>=50?C.gold:C.err;
              const syns=[...parseSyns(w.cs).slice(1),...parseSyns(w.synonyms||'')].join(', ');
              return(
                <tr key={w.id} style={{borderBottom:`1px solid #161e2e`}} onMouseEnter={e=>e.currentTarget.style.background='#0e1525'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'7px 8px',color:C.muted,textAlign:'center',fontSize:11}}>{i+1}</td>
                  <td style={{padding:'7px 8px',color:C.text,fontWeight:500}}>{w.en}</td>
                  <td style={{padding:'7px 8px',color:C.textDim}}>{parseSyns(w.cs)[0]||w.cs}</td>
                  <td style={{padding:'7px 8px',color:'#6a7060',fontSize:12,fontStyle:'italic'}}>{syns||'—'}</td>
                  <td style={{padding:'7px 8px',color:C.textDim,textAlign:'center'}}>{ws.total||'—'}</td>
                  <td style={{padding:'7px 8px',color:C.ok,textAlign:'center'}}>{ws.correct||'—'}</td>
                  <td style={{padding:'7px 8px',color:C.err,textAlign:'center'}}>{ws.wrong||'—'}</td>
                  <td style={{padding:'7px 8px',textAlign:'center'}}>{pct!==null?<span style={{background:pc+'22',color:pc,borderRadius:20,padding:'2px 8px',fontWeight:600,fontSize:12}}>{pct}%</span>:<span style={{color:C.mutedDark}}>—</span>}</td>
                  <td style={{padding:'7px 8px',textAlign:'center'}}><div style={{display:'flex',justifyContent:'center',gap:2}}>{[0,1,2,3,4].map(d=><div key={d} style={{width:6,height:6,borderRadius:'50%',background:d<(w.score??0)?C.gold:'#1e2535'}}/>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BADGES MODAL
═══════════════════════════════════════════════════════════════ */
function BadgesModal({profile,onClose}){
  const earned=profile.badges||[];
  return(
    <Modal onClose={onClose}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold}}>Odznaky</div>
        <button className="btn" onClick={onClose} style={{color:C.muted,fontSize:22,lineHeight:1}}>×</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {BADGES.map(b=>{
          const has=earned.includes(b.id);
          return(
            <div key={b.id} style={{background:has?'#1a2a18':'#0e1420',border:`1px solid ${has?'#2a4a28':C.border}`,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,opacity:has?1:.5}}>
              <span style={{fontSize:26,filter:has?'none':'grayscale(1)'}}>{b.icon}</span>
              <div><div style={{fontSize:13,color:has?C.text:C.muted,fontWeight:500}}>{b.name}</div><div style={{fontSize:11,color:C.mutedDark,marginTop:2}}>{b.desc}</div></div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING SCREEN
═══════════════════════════════════════════════════════════════ */
function OnboardingScreen({onLoadSample,onUpload}){
  const fRef=useRef(null);
  return(
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'2rem 1.5rem'}}>
      <style>{STYLE}</style>
      <div style={{textAlign:'center',maxWidth:460,width:'100%'}}>
        <div style={{fontSize:56,marginBottom:16}}>🃏</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:38,fontWeight:700,color:C.gold,letterSpacing:'-1px',marginBottom:8}}>LexiCard PRO</div>
        <div style={{fontSize:14,color:C.muted,marginBottom:36,lineHeight:1.7}}>Chytrý systém pro učení slovíček s opakováním ve správný čas, gamifikací a pokročilou statistikou.</div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <button className="btn" onClick={onLoadSample}
            style={{background:C.gold,border:'none',color:C.bg,borderRadius:14,padding:'16px',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Playfair Display',serif"}}>
            🚀 Začít s ukázkovým balíčkem
          </button>
          <button className="btn" onClick={()=>fRef.current.click()}
            style={{background:'#111622',border:`1.5px dashed #2a3650`,color:C.textDim,borderRadius:14,padding:'14px',fontSize:14,cursor:'pointer',transition:'all .2s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='#2a3650';e.currentTarget.style.color=C.textDim;}}>
            📊 Nahrát vlastní .xlsx soubor
          </button>
        </div>
        <input ref={fRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])onUpload(e.target.files[0]);}}/>
        <div style={{marginTop:28,fontSize:12,color:C.mutedDark,lineHeight:1.8}}>
          ⚡ Spaced Repetition · 🎯 4 režimy učení · 🔥 Streaky · 🏆 Odznaky
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOME SCREEN — Dashboard + Decks
═══════════════════════════════════════════════════════════════ */
function HomeScreen({decks,langs,activeLang,profile,onLangSwitch,onAddLang,onDeleteLang,onSelect,onFileUpload}){
  const [sort,setSort]=useState('date-desc');
  const [showUpload,setShowUpload]=useState(false);
  const [showBadges,setShowBadges]=useState(false);
  const langDecks=sortDecks(decks.filter(d=>d.lang===activeLang),sort);
  const lc=langs.find(l=>l.id===activeLang)||langs[0];
  const level=getLevel(profile.xp||0);
  const prog=getLevelProgress(profile.xp||0);
  const toNext=getXPToNext(profile.xp||0);
  const earnedCount=(profile.badges||[]).length;
  const totalDue=langDecks.reduce((s,d)=>s+dueCount(d.words),0);

  return(
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:'flex',flexDirection:'column',alignItems:'center',padding:'1.5rem 1rem'}}>
      <style>{STYLE}</style>
      {showUpload&&<UploadModal onClose={()=>setShowUpload(false)} onUpload={onFileUpload}/>}
      {showBadges&&<BadgesModal profile={profile} onClose={()=>setShowBadges(false)}/>}

      {/* header */}
      <div style={{width:'100%',maxWidth:780,display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1rem',gap:10}}>
        <div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:700,color:C.gold,letterSpacing:'-1px'}}>LexiCard <span style={{fontSize:14,color:C.goldDim,letterSpacing:1,fontWeight:500}}>PRO</span></div>
          <div style={{fontSize:12,color:C.muted,marginTop:2,fontStyle:'italic'}}>{lc?.label}</div>
        </div>
        <LangDropdown langs={langs} activeId={activeLang} onSwitch={onLangSwitch} onAddLang={onAddLang} onDeleteLang={onDeleteLang}/>
      </div>

      {/* XP dashboard */}
      <div style={{width:'100%',maxWidth:780,background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:'1.2rem 1.4rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:'1rem',flexWrap:'wrap'}}>
          {/* streak */}
          <div style={{display:'flex',alignItems:'center',gap:8,background:'#1e1a10',borderRadius:10,padding:'8px 14px'}}>
            <span style={{fontSize:22}}>🔥</span>
            <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:'#e8a030',lineHeight:1}}>{profile.streak||0}</div><div style={{fontSize:10,color:'#7a6030',textTransform:'uppercase',letterSpacing:.8}}>dnů</div></div>
          </div>
          {/* level */}
          <div style={{display:'flex',alignItems:'center',gap:8,background:C.xpBg,borderRadius:10,padding:'8px 14px'}}>
            <span style={{fontSize:22}}>⚡</span>
            <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.xp,lineHeight:1}}>Level {level}</div><div style={{fontSize:10,color:'#506090',textTransform:'uppercase',letterSpacing:.8}}>{profile.xp||0} XP</div></div>
          </div>
          {/* badges */}
          <button className="btn" onClick={()=>setShowBadges(true)} style={{display:'flex',alignItems:'center',gap:8,background:'#1a1820',borderRadius:10,padding:'8px 14px',cursor:'pointer',border:'none'}}>
            <span style={{fontSize:22}}>🏆</span>
            <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:'#c0a0e0',lineHeight:1}}>{earnedCount}</div><div style={{fontSize:10,color:'#6a5080',textTransform:'uppercase',letterSpacing:.8}}>odznaky</div></div>
          </button>
          {/* due today */}
          {totalDue>0&&(
            <div style={{display:'flex',alignItems:'center',gap:8,background:'#200e0e',borderRadius:10,padding:'8px 14px',marginLeft:'auto'}}>
              <span style={{fontSize:22}}>📚</span>
              <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.err,lineHeight:1}}>{totalDue}</div><div style={{fontSize:10,color:'#7a3030',textTransform:'uppercase',letterSpacing:.8}}>k opakování</div></div>
            </div>
          )}
        </div>
        {/* XP bar */}
        <div style={{fontSize:11,color:C.muted,marginBottom:5,display:'flex',justifyContent:'space-between'}}>
          <span>Level {level}</span>
          <span>{toNext > 0 ? `${toNext} XP do Level ${level+1}` : 'Max level!'}</span>
        </div>
        <div style={{background:'#1a2030',borderRadius:4,height:8,overflow:'hidden'}}>
          <div style={{width:`${prog*100}%`,height:'100%',background:`linear-gradient(90deg,${C.xp},#a0c0ff)`,borderRadius:4,transition:'width .6s ease'}}/>
        </div>
      </div>

      {/* add deck */}
      <div style={{width:'100%',maxWidth:780,marginBottom:'0.9rem'}}>
        <button className="btn" onClick={()=>setShowUpload(true)}
          style={{width:'100%',display:'flex',alignItems:'center',gap:12,background:'#0e1520',border:`1.5px dashed #2a3650`,borderRadius:14,padding:'12px 16px',cursor:'pointer',transition:'all .2s',textAlign:'left'}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.background='rgba(212,168,83,.04)';}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='#2a3650';e.currentTarget.style.background='#0e1520';}}>
          <div style={{width:34,height:34,background:'#1a2535',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>📊</div>
          <div><div style={{fontSize:14,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Přidat nový balíček</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>Nahrej .xlsx nebo .csv soubor</div></div>
          <div style={{marginLeft:'auto',fontSize:20,color:'#2a3650'}}>+</div>
        </button>
      </div>

      {/* sort */}
      <div style={{width:'100%',maxWidth:780,display:'flex',alignItems:'center',gap:7,marginBottom:10,flexWrap:'wrap'}}>
        <span style={{fontSize:10,color:C.mutedDark,textTransform:'uppercase',letterSpacing:2,flexShrink:0}}>Řadit:</span>
        {[{id:'date-desc',label:'Nejnovější'},{id:'date-asc',label:'Nejstarší'},{id:'name-asc',label:'A–Z'},{id:'name-desc',label:'Z–A'}].map(s=><button key={s.id} className="btn" onClick={()=>setSort(s.id)} style={{background:sort===s.id?'#1a2a40':'transparent',border:`1px solid ${sort===s.id?'#2e4565':C.border}`,color:sort===s.id?C.gold:C.muted,borderRadius:8,padding:'4px 11px',fontSize:12,cursor:'pointer',transition:'all .2s'}}>{s.label}</button>)}
      </div>

      {/* decks */}
      <div style={{width:'100%',maxWidth:780,flex:1}}>
        {langDecks.length===0?(
          <div style={{textAlign:'center',padding:'3rem 0',color:C.muted,fontSize:14,fontStyle:'italic'}}>Žádné balíčky pro {lc?.label}</div>
        ):(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))',gap:11}}>
            {langDecks.map(d=>{
              const mastered=d.words.filter(w=>(w.score??0)>=3).length;
              const pct=d.words.length?Math.round(mastered/d.words.length*100):0;
              const due=dueCount(d.words);
              return(
                <div key={d.id} onClick={()=>onSelect(d.id)} className="btn" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:'1.1rem',cursor:'pointer',transition:'border-color .2s',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.borderColor='#3a5080'} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:C.text,marginBottom:5,lineHeight:1.2}}>{d.name}</div>
                  {/* SRS indicator */}
                  <div style={{fontSize:11,marginBottom:8,display:'flex',alignItems:'center',gap:5}}>
                    {due>0
                      ?<span style={{color:C.err}}>🔴 {due} k opakování</span>
                      :<span style={{color:C.ok}}>✅ Vše hotovo</span>}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:9}}>{d.words.length} slov</div>
                  <div style={{background:'#161e30',borderRadius:3,height:3}}><div style={{width:`${pct}%`,height:'100%',background:C.gold,borderRadius:3,transition:'width .4s'}}/></div>
                  <div style={{fontSize:10,color:C.goldDim,marginTop:4,textAlign:'right'}}>{pct}% zvládnuto</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DECK SCREEN
═══════════════════════════════════════════════════════════════ */
function DeckScreen({deck,onBack,onStart,onUpdate,onAddWord,onDeleteWord,onDeleteDeck,onExport,onRename}){
  const [wSort,setWSort]=useState('date-asc');
  const [showAdd,setShowAdd]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const [showDel,setShowDel]=useState(false);
  const [editing,setEditing]=useState(false);
  const [nameVal,setNameVal]=useState(deck.name);
  const nameRef=useRef(null);
  const ds=deck.deckStats??{totalAnswers:0,correctAnswers:0,roundsCompleted:0};
  const mastered=deck.words.filter(w=>(w.score??0)>=3).length;
  const practiced=deck.words.filter(w=>(w.wStats?.total??0)>0).length;
  const sr=ds.totalAnswers?Math.round(ds.correctAnswers/ds.totalAnswers*100):null;
  const due=dueCount(deck.words);
  const sorted=sortWords(deck.words,wSort);
  const statItems=[{l:'Úspěšnost',v:sr!==null?`${sr}%`:'—',c:'#7090c8',bg:'#121a2e'},{l:'Naučeno',v:`${mastered}/${deck.words.length}`,c:C.ok,bg:C.okBg},{l:'Procvičeno',v:`${practiced}/${deck.words.length}`,c:'#a080c8',bg:'#1a1028'},{l:'Odpovědí',v:ds.totalAnswers||0,c:C.gold,bg:'#1a1608'},{l:'Správných',v:ds.correctAnswers||0,c:C.ok,bg:C.okBg},{l:'Kol',v:ds.roundsCompleted||0,c:'#7090c8',bg:'#121a2e'}];

  function saveName(){if(nameVal.trim()&&nameVal.trim()!==deck.name)onRename(nameVal.trim());setEditing(false);}

  return(
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:'flex',flexDirection:'column'}}>
      <style>{STYLE}</style>
      {showAdd&&<AddWordModal onClose={()=>setShowAdd(false)} onAdd={onAddWord}/>}
      {showStats&&<StatsModal deck={deck} onClose={()=>setShowStats(false)}/>}
      {showDel&&<Confirm title="Smazat balíček?" msg={`Smazat „${deck.name}"? Akce je nevratná.`} onConfirm={onDeleteDeck} onClose={()=>setShowDel(false)}/>}

      <div style={{position:'sticky',top:0,zIndex:10,background:C.bg,borderBottom:`1px solid #1a1f2e`,padding:'0.9rem 1rem'}}>
        <div style={{maxWidth:1020,margin:'0 auto'}}>
          <div className="deck-header-row" style={{display:'flex',alignItems:'center',gap:8,marginBottom:'0.8rem'}}>
            <button className="btn" onClick={onBack} style={{color:C.muted,fontSize:13,flexShrink:0}}>← Balíčky</button>
            {/* Editable deck name */}
            {editing
              ?<input ref={nameRef} value={nameVal} onChange={e=>setNameVal(e.target.value)} onBlur={saveName} onKeyDown={e=>{if(e.key==='Enter')saveName();if(e.key==='Escape')setEditing(false);}} style={{flex:1,background:'#1a2035',border:`1px solid ${C.gold}`,color:C.gold,borderRadius:7,padding:'5px 10px',fontSize:17,fontFamily:"'Playfair Display',serif",fontWeight:700,outline:'none'}} autoFocus/>
              :<div onClick={()=>{setEditing(true);setNameVal(deck.name);}} title="Klikni pro přejmenování" style={{flex:1,fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:C.gold,cursor:'pointer',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0,padding:'3px 0',borderBottom:`1px dashed ${C.goldDim}`}}>{deck.name} <span style={{fontSize:12,color:C.goldDim}}>✎</span></div>
            }
            {due>0&&<span style={{background:C.errBg,color:C.err,fontSize:11,padding:'3px 9px',borderRadius:20,flexShrink:0}}>{due} dnes</span>}
            <button className="btn" onClick={()=>setShowStats(true)} style={{border:`1px solid #2a3555`,color:'#7090c8',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',flexShrink:0}}>📊</button>
            <button className="btn" onClick={onExport} style={{border:`1px solid #2a4035`,color:'#6a9070',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',flexShrink:0}} title="Export do JSON">⬇️</button>
            <button className="btn" onClick={()=>setShowAdd(true)} style={{border:`1px solid #2e4060`,color:'#7090b8',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',flexShrink:0}}>+ Slovo</button>
            <button className="btn" onClick={()=>setShowDel(true)} style={{border:'1px solid #3a1515',color:'#7a4040',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',flexShrink:0}}>Smazat</button>
            <button className="btn" onClick={onStart} disabled={!deck.words.length} style={{background:deck.words.length?C.gold:'#2a2a1a',color:deck.words.length?C.bg:'#5a5030',borderRadius:9,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:deck.words.length?'pointer':'default',flexShrink:0,transition:'all .2s'}}>Učení ▶</button>
          </div>
          <div className="stat-grid-6" style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6}}>
            {statItems.map(({l,v,c,bg})=><div key={l} style={{background:bg,borderRadius:7,padding:'5px 6px',textAlign:'center'}}><div style={{fontSize:9,color:c,textTransform:'uppercase',letterSpacing:.6,marginBottom:2}}>{l}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:c}}>{v}</div></div>)}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1020,margin:'0 auto',width:'100%',padding:'0.8rem 1rem 0',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
        <span style={{fontSize:10,color:C.mutedDark,textTransform:'uppercase',letterSpacing:2,flexShrink:0}}>Řadit:</span>
        {WORD_SORTS.map(s=><button key={s.id} className="btn" onClick={()=>setWSort(s.id)} style={{background:wSort===s.id?'#1a2a40':'transparent',border:`1px solid ${wSort===s.id?'#2e4565':C.border}`,color:wSort===s.id?C.gold:C.muted,borderRadius:7,padding:'3px 9px',fontSize:11,cursor:'pointer',transition:'all .2s'}}>{s.label}</button>)}
      </div>

      <div style={{maxWidth:1020,margin:'0 auto',width:'100%',padding:'0.8rem 1rem 2rem',display:'flex',flexDirection:'column',gap:4}}>
        <div className="word-grid-hdr" style={{display:'grid',gridTemplateColumns:'24px 1fr 1fr 1.4fr 1fr 24px',gap:4,padding:'0 8px 4px',color:C.muted,fontSize:10,textTransform:'uppercase',letterSpacing:2}}>
          <span style={{textAlign:'center'}}>#</span><span>Anglicky</span><span>Česky</span>
          <span className="hide-mobile">Příkladová věta</span><span className="hide-mobile">Synonyma</span><span/>
        </div>
        {sorted.map((w,i)=>(
          <div key={w.id} className="word-grid" style={{display:'grid',gridTemplateColumns:'24px 1fr 1fr 1.4fr 1fr 24px',gap:4,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,alignItems:'center'}}>
            <span style={{fontSize:10,color:C.muted,textAlign:'center'}}>{i+1}</span>
            <input className="tdinp" value={w.en} placeholder="anglicky…" onChange={e=>onUpdate(w.id,'en',e.target.value)}/>
            <input className="tdinp" value={w.cs} placeholder="česky…" onChange={e=>onUpdate(w.id,'cs',e.target.value)}/>
            <input className="tdinp hide-mobile" value={w.example||''} placeholder="příkladová věta…" onChange={e=>onUpdate(w.id,'example',e.target.value)}/>
            <input className="tdinp hide-mobile" value={w.synonyms||''} placeholder="synonyma…" onChange={e=>onUpdate(w.id,'synonyms',e.target.value)}/>
            <button className="btn" onClick={()=>onDeleteWord(w.id)} style={{color:'#3a2020',fontSize:17,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px',height:'100%',borderRadius:'0 8px 8px 0',transition:'color .15s'}} onMouseEnter={e=>e.currentTarget.style.color='#c87070'} onMouseLeave={e=>e.currentTarget.style.color='#3a2020'}>×</button>
          </div>
        ))}
        <button className="btn" onClick={()=>setShowAdd(true)} style={{border:`1.5px dashed #2e3447`,borderRadius:8,padding:'9px',color:C.muted,fontSize:13,cursor:'pointer',transition:'all .2s',textAlign:'center'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#2e3447';e.currentTarget.style.color=C.muted;}}>+ Přidat slovíčko</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROUND END — XP + Badges
═══════════════════════════════════════════════════════════════ */
function RoundEnd({stats,total,xpEarned,newBadges,deckName,onNext,onBack}){
  const pct=total?Math.round(stats.ok/total*100):0;
  const em=pct>=90?'🏆':pct>=70?'👏':pct>=50?'💪':'📚';
  return(
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem'}}>
      <style>{STYLE}</style>
      <div className="card-in" style={{width:'100%',maxWidth:400,textAlign:'center'}}>
        <div style={{fontSize:50,marginBottom:10}}>{em}</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:C.gold,marginBottom:4}}>Kolo dokončeno!</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20,fontStyle:'italic'}}>{deckName}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginBottom:16}}>
          {[{l:'Správně',v:stats.ok,bg:C.okBg,c:C.ok},{l:'Špatně',v:stats.bad,bg:C.errBg,c:C.err},{l:'Úspěšnost',v:`${pct}%`,bg:'#1a2038',c:'#7090c8'}].map(({l,v,bg,c})=>(
            <div key={l} style={{background:bg,borderRadius:12,padding:'0.8rem 0.4rem'}}><div style={{fontSize:10,color:c,textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{l}</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:c}}>{v}</div></div>
          ))}
        </div>
        {/* XP earned */}
        {xpEarned>0&&(
          <div style={{background:C.xpBg,border:`1px solid #2a3870`,borderRadius:12,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
            <span style={{fontSize:22}}>⚡</span>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.xp}}>+{xpEarned} XP</div>
          </div>
        )}
        {/* new badges */}
        {newBadges.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:C.mutedDark,textTransform:'uppercase',letterSpacing:1.5,marginBottom:10}}>Nové odznaky!</div>
            <div style={{display:'flex',justifyContent:'center',gap:10,flexWrap:'wrap'}}>
              {newBadges.map(bid=>{const b=BADGES.find(x=>x.id===bid);return b?(<div key={bid} className="badge-pop" style={{background:'#1a2a18',border:`1px solid #2a4a28`,borderRadius:12,padding:'10px 14px',textAlign:'center'}}><div style={{fontSize:28,marginBottom:4}}>{b.icon}</div><div style={{fontSize:12,color:C.ok,fontWeight:500}}>{b.name}</div></div>):null;})}
            </div>
          </div>
        )}
        <div style={{display:'flex',flexDirection:'column',gap:9}}>
          <button className="btn" onClick={onNext} style={{background:C.gold,border:'none',color:C.bg,borderRadius:11,padding:'13px',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Playfair Display',serif"}}>Další kolo →</button>
          <button className="btn" onClick={onBack} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,borderRadius:11,padding:'11px',fontSize:14,cursor:'pointer'}}>Zpět na slovíčka</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════ */
export default function LexiCardPro() {
  const [decks,setDecks]=useState([]);
  const [langs,setLangs]=useState(DEFAULT_LANGS);
  const [activeLang,setLang]=useState('en');
  const [screen,setScreen]=useState('loading');
  const [deckId,setDeckId]=useState(null);
  const [profile,setProfile]=useState({xp:0,streak:0,lastStudy:null,badges:[],totalCorrect:0,totalMastered:0,lastPerfect:false,langCount:1});

  // study state
  const [studyMode,setStudyMode]=useState('en-cs');
  const [rWords,setRWords]=useState([]);
  const [rIdx,setRIdx]=useState(0);
  const [rStats,setRStats]=useState({ok:0,bad:0});
  const [rXP,setRXP]=useState(0);
  const [feedback,setFB]=useState(null);
  const [newBadgesEarned,setNewBadges]=useState([]);
  const [listenOn,setListen]=useState(false);
  const [tx,setTx]=useState('');
  const [micSt,setMicSt]=useState('idle');
  const [micErr,setMicErr]=useState('');
  const [iMode,setIMode]=useState('mic');
  const [typed,setTyped]=useState('');
  const [autoPlay,setAutoPlay]=useState(true);
  const [pronAtt,setPronAtt]=useState(0);
  const [evalLoading,setEvalLoading]=useState(false);
  const [wrongCd,setWrongCd]=useState(0);

  const recRef=useRef(null);
  const streamRef=useRef(null);
  const synthRef=useRef(window.speechSynthesis);
  const timerRef=useRef(null);
  const cdRef=useRef(null);

  /* ── Load ── */
  useEffect(()=>{
    (async()=>{
      try{
        const raw=await store.get('lcp_data');
        if(raw){
          const d=JSON.parse(raw);
          if(d.decks)setDecks(d.decks);
          if(d.lang)setLang(d.lang);
          if(d.langs)setLangs(prev=>{const ids=new Set(prev.map(l=>l.id));return[...prev,...d.langs.filter(l=>!ids.has(l.id))];});
          if(d.profile)setProfile(p=>({...p,...d.profile}));
        }
        setScreen(raw?'home':'onboarding');
      }catch{setScreen('onboarding');}
    })();
  },[]);

  /* ── Save ── */
  useEffect(()=>{
    if(screen==='loading')return;
    const data={decks,lang:activeLang,langs:langs.filter(l=>l.custom),profile};
    store.set('lcp_data',JSON.stringify(data));
  },[decks,activeLang,langs,profile,screen]);

  const deck=decks.find(d=>d.id===deckId)??null;

  /* ── File ── */
  function loadFile(file){
    const name=file.name.replace(/\.[^.]+$/,'');
    const rd=new FileReader();
    rd.onload=e=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
        const words=rows.filter(r=>r[0]&&r[1]).map(r=>({id:uid(),en:String(r[0]).trim(),cs:String(r[1]).trim(),example:r[2]?String(r[2]).trim():'',synonyms:r[3]?String(r[3]).trim():'',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}}));
        if(!words.length){alert('Žádná slovíčka nenalezena.');return;}
        const d={id:uid(),name,lang:activeLang,words,createdAt:nowTs(),deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0}};
        setDecks(ds=>[...ds,d]);setDeckId(d.id);setScreen('deck');
      }catch{alert('Nepodařilo se načíst soubor.');}
    };
    rd.readAsArrayBuffer(file);
  }
  function loadSample(){const d={...SAMPLE_DECK,id:uid(),createdAt:nowTs()};setDecks([d]);setDeckId(d.id);setScreen('deck');}

  /* ── Deck ops ── */
  const updWord=(wid,f,v)=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.map(w=>w.id!==wid?w:{...w,[f]:v})}));
  function addWord({en,cs,example,synonyms}){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:[...d.words,{id:uid(),en,cs,example,synonyms:synonyms||'',score:0,addedAt:nowTs(),wStats:{total:0,correct:0,wrong:0}}]}));}
  const delWord=wid=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.filter(w=>w.id!==wid)}));
  function delDeck(){setDecks(ds=>ds.filter(d=>d.id!==deckId));setScreen('home');}
  function renameDeck(name){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,name}));}
  function exportDeck(){
    if(!deck)return;
    const blob=new Blob([JSON.stringify(deck,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${deck.name}.json`;a.click();
  }
  function addLang(l){setLangs(ls=>[...ls,l]);setLang(l.id);}
  function deleteLang(id){setDecks(ds=>ds.filter(d=>d.lang!==id));setLangs(ls=>ls.filter(l=>l.id!==id));if(activeLang===id){const rem=langs.filter(l=>l.id!==id);if(rem.length)setLang(rem[0].id);}}

  /* ── Study ── */
  function clearCard(){
    clearTimeout(timerRef.current);clearInterval(cdRef.current);
    setFB(null);setTx('');setMicErr('');setTyped('');setPronAtt(0);setWrongCd(0);setEvalLoading(false);
  }
  function startStudy(){
    if(!deck?.words?.length)return;
    setRWords(pickStudyWords(deck.words));setRIdx(0);setRStats({ok:0,bad:0});setRXP(0);setNewBadges([]);clearCard();setScreen('study');
  }
  function nextCard(){
    clearTimeout(timerRef.current);clearInterval(cdRef.current);
    setFB(null);setTx('');setMicErr('');setTyped('');setPronAtt(0);setWrongCd(0);setEvalLoading(false);
    const nxt=rIdx+1;
    if(nxt>=rWords.length){
      // finalize round
      setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+rStats.ok+rStats.bad,correctAnswers:(d.deckStats?.correctAnswers??0)+rStats.ok,roundsCompleted:(d.deckStats?.roundsCompleted??0)+1}}));
      setScreen('roundEnd');
    } else setRIdx(nxt);
  }
  function nextRound(){setRWords(pickStudyWords(deck.words));setRIdx(0);setRStats({ok:0,bad:0});setRXP(0);setNewBadges([]);clearCard();setScreen('study');}

  // auto-advance on feedback
  useEffect(()=>{
    if(!feedback||screen!=='study')return;
    playSound(feedback.ok?'correct':'wrong');
    if(feedback.ok){
      timerRef.current=setTimeout(()=>nextCard(),900);
    } else {
      let c=5;setWrongCd(c);
      cdRef.current=setInterval(()=>{c--;setWrongCd(c);if(c<=0)clearInterval(cdRef.current);},1000);
      timerRef.current=setTimeout(()=>nextCard(),5500);
    }
    return()=>{clearTimeout(timerRef.current);clearInterval(cdRef.current);};
  // eslint-disable-next-line
  },[feedback]);

  // auto-speak
  useEffect(()=>{
    if(screen==='study'&&rWords[rIdx]&&!feedback&&autoPlay){
      const w=rWords[rIdx];
      const lang=studyMode==='cs-en'?'cs-CZ':'en-US';
      const text=studyMode==='en-cs'?w.en:studyMode==='cs-en'?w.cs:w.en;
      const t=setTimeout(()=>doSpeak(synthRef.current,text,lang),350);
      return()=>clearTimeout(t);
    }
  },[rIdx,studyMode,screen,feedback,autoPlay]);

  /* ── Mic ── */
  async function startListen(lang){
    setMicErr('');
    if(micSt!=='ready'){
      setMicSt('requesting');
      try{streamRef.current=await navigator.mediaDevices.getUserMedia({audio:true});setMicSt('ready');}
      catch(err){setMicSt('error');setMicErr(err.name==='NotAllowedError'?'Přístup k mikrofonu zamítnut.':err.name==='NotFoundError'?'Mikrofon nenalezen.':`Chyba: ${err.message}`);return;}
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setMicErr('Rozpoznávání řeči funguje pouze v Chrome/Edge.');return;}
    const rec=new SR();
    rec.lang=lang;rec.continuous=false;rec.interimResults=true;
    rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join('');setTx(t);if(e.results[e.results.length-1].isFinal){evalAnswer(t);rec.stop();}};
    rec.onerror=ev=>{if(ev.error!=='aborted')setMicErr({'not-allowed':'Mikrofon blokován.','service-not-allowed':'Zkus textový režim.','no-speech':'Nic nezaznamenáno.','network':'Chyba sítě.'}[ev.error]??`Chyba: ${ev.error}`);setListen(false);};
    rec.onend=()=>setListen(false);
    recRef.current=rec;rec.start();setListen(true);
  }
  function stopListen(){recRef.current?.stop();setListen(false);}

  /* ── Answer ── */
  async function evalAnswer(text){
    const w=rWords[rIdx];if(!w||feedback)return;

    if(studyMode==='pron'){
      const ok=localMatch(text,w.en);
      if(ok){commit(w,true,text);return;}
      const att=pronAtt+1;
      if(att>=3){commit(w,false,text,true);}
      else{setPronAtt(att);setTx('');setTimeout(()=>doSpeak(synthRef.current,w.en,'en-US'),300);}
      return;
    }

    // blank mode: answer is always the EN word
    const isBlank=studyMode==='blank';
    const expectedField=isBlank||studyMode==='cs-en'
      ?(w.en+(w.synonyms?' / '+w.synonyms:''))
      :(w.cs+(w.synonyms?' / '+w.synonyms:''));

    if(localMatch(text,expectedField)){commit(w,true,text);return;}
    setEvalLoading(true);
    const srcWord=studyMode==='en-cs'?w.en:w.cs;
    const evalMode=isBlank?'cs-en':studyMode;
    const apiResult=await claudeEval(text,expectedField,srcWord,evalMode);
    setEvalLoading(false);
    if(apiResult===true){commit(w,true,text,'ai');return;}
    commit(w,false,text);
  }

  function commit(w,ok,given,source='local',forced=false){
    const isForced=forced||source===true;
    // XP
    const xpGained=calcXP(ok,profile.streak||0);
    if(xpGained>0)setRXP(x=>x+xpGained);
    // update word SRS
    const srs=srsUpdate(w,ok);
    setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,
      words:d.words.map(dw=>dw.id!==w.id?dw:{...dw,...srs,score:ok?(dw.score??0)+1:Math.max(0,(dw.score??0)-2),wStats:{total:(dw.wStats?.total??0)+1,correct:(dw.wStats?.correct??0)+(ok?1:0),wrong:(dw.wStats?.wrong??0)+(ok?0:1)}}),
      deckStats:{totalAnswers:(d.deckStats?.totalAnswers??0)+1,correctAnswers:(d.deckStats?.correctAnswers??0)+(ok?1:0),roundsCompleted:d.deckStats?.roundsCompleted??0},
    }));
    const newRStats={ok:rStats.ok+(ok?1:0),bad:rStats.bad+(ok?0:1)};
    setRStats(newRStats);
    // update profile
    const newXP=(profile.xp||0)+xpGained;
    const newStreak=calcStreak(profile.lastStudy,profile.streak);
    const allDecks=decks;
    const totalMastered=allDecks.reduce((s,d)=>s+d.words.filter(w=>(w.score??0)>=3).length,0)+(ok&&(w.score??0)===2?1:0);
    const newProfile={
      ...profile,xp:newXP,streak:newStreak,lastStudy:todayStr(),
      totalCorrect:(profile.totalCorrect||0)+(ok?1:0),
      totalMastered,
      lastPerfect: newRStats.bad===0,
      langCount:new Set(allDecks.map(d=>d.lang)).size,
    };
    const newBadgeIds=checkNewBadges(newProfile,profile.badges||[]);
    if(newBadgeIds.length){
      newProfile.badges=[...(profile.badges||[]),...newBadgeIds];
      setNewBadges(prev=>[...prev,...newBadgeIds]);
    }
    setProfile(newProfile);
    setFB({ok,answer:studyMode==='en-cs'?w.cs:w.en,given,forced:isForced,aiEval:source==='ai',xp:xpGained});
  }

  function submitTyped(){if(typed.trim())evalAnswer(typed.trim());}
  function dontKnow(){
    const w=rWords[rIdx];if(!w||feedback)return;
    const ans=studyMode==='en-cs'?w.cs:w.en;
    const lang=studyMode==='en-cs'?'cs-CZ':'en-US';
    commit(w,false,'','manual');
    doSpeak(synthRef.current,ans,lang);
  }

  /* ── Routing ── */
  if(screen==='loading') return(<div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:32,height:32,border:'3px solid #2e3447',borderTopColor:C.gold,borderRadius:'50%',animation:'spin .8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if(screen==='onboarding') return <OnboardingScreen onLoadSample={loadSample} onUpload={loadFile}/>;
  if(screen==='home') return <HomeScreen decks={decks} langs={langs} activeLang={activeLang} profile={profile} onLangSwitch={setLang} onAddLang={addLang} onDeleteLang={deleteLang} onSelect={id=>{setDeckId(id);setScreen('deck');}} onFileUpload={loadFile}/>;
  if(screen==='deck'&&deck) return <DeckScreen deck={deck} onBack={()=>setScreen('home')} onStart={startStudy} onUpdate={updWord} onAddWord={addWord} onDeleteWord={delWord} onDeleteDeck={delDeck} onExport={exportDeck} onRename={renameDeck}/>;
  if(screen==='roundEnd') return <RoundEnd stats={rStats} total={rWords.length} xpEarned={rXP} newBadges={newBadgesEarned} deckName={deck?.name??''} onNext={nextRound} onBack={()=>setScreen('deck')}/>;

  /* ══ STUDY SCREEN ══ */
  const w=rWords[rIdx];if(!w)return null;
  const isPron=studyMode==='pron';
  const isBlank=studyMode==='blank';
  const blankSentence=isBlank?getBlankSentence(w.example,w.en):null;
  const question=studyMode==='en-cs'?w.en:studyMode==='cs-en'?w.cs:w.en;
  const qLang=studyMode==='cs-en'?'cs-CZ':'en-US';
  const aLang=studyMode==='en-cs'?'cs-CZ':'en-US';
  const micLang=studyMode==='en-cs'?'cs-CZ':studyMode==='cs-en'?'en-US':'en-US';
  const total=rStats.ok+rStats.bad;
  const pct=total?Math.round(rStats.ok/total*100):0;
  const allSyns=[...parseSyns(studyMode==='en-cs'?w.cs:w.en).slice(1),...parseSyns(w.synonyms||'')].join(' · ');

  return(
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:'flex',flexDirection:'column',alignItems:'center',overflow:'hidden'}}>
      <style>{STYLE}</style>

      {/* top bar */}
      <div style={{width:'100%',maxWidth:680,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.75rem 1rem',borderBottom:`1px solid #1a1f2e`,gap:8}}>
        <button className="btn" onClick={()=>setScreen('deck')} style={{color:C.muted,fontSize:12,flexShrink:0}}>← {deck?.name}</button>
        <div style={{flex:1,maxWidth:130}}>
          <div style={{fontSize:10,color:C.muted,textAlign:'center',marginBottom:3}}>Kolo {rIdx+1}/{rWords.length}</div>
          <div style={{background:'#1a2030',borderRadius:3,height:3}}><div style={{width:`${((rIdx+1)/rWords.length)*100}%`,height:'100%',background:C.gold,borderRadius:3,transition:'width .3s'}}/></div>
        </div>
        <div style={{display:'flex',gap:4,flexShrink:0}}>
          {[{bg:C.okBg,c:C.ok,t:`✓${rStats.ok}`},{bg:C.errBg,c:C.err,t:`✗${rStats.bad}`},...(total>0?[{bg:'#1a2038',c:'#7090c8',t:`${pct}%`}]:[])].map(({bg,c,t},i)=><span key={i} style={{background:bg,color:c,padding:'2px 7px',borderRadius:20,fontSize:11,fontWeight:500}}>{t}</span>)}
          {rXP>0&&<span style={{background:C.xpBg,color:C.xp,padding:'2px 7px',borderRadius:20,fontSize:11,fontWeight:500}}>+{rXP}XP</span>}
        </div>
        <SettingsMenu autoPlay={autoPlay} onToggleAutoPlay={setAutoPlay}/>
      </div>

      {/* mode tabs */}
      <div style={{width:'100%',maxWidth:680,padding:'0.6rem 1rem 0',display:'flex',gap:5}}>
        {STUDY_MODES.map(m=><button key={m.id} className="btn" onClick={()=>{setStudyMode(m.id);clearCard();}} style={{flex:1,background:studyMode===m.id?'#1e2a45':C.card,border:`1.5px solid ${studyMode===m.id?'#3a5080':C.border}`,color:studyMode===m.id?C.gold:'#6a7080',borderRadius:9,padding:'6px 2px',fontSize:11,cursor:'pointer',transition:'all .2s'}}>{m.label}</button>)}
      </div>

      <div style={{flex:1,width:'100%',maxWidth:680,display:'flex',flexDirection:'column',alignItems:'center',padding:'1rem',gap:'0.75rem'}}>

        {/* card */}
        <div key={w.id+studyMode} className="card-in" style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:'1.2rem 1.5rem',textAlign:'center'}}>
          {isPron?(
            <>
              <div style={{fontSize:10,color:'#3e6850',textTransform:'uppercase',letterSpacing:3,marginBottom:8}}>🔊 Výslovnost</div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:5}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:700,color:C.text,lineHeight:1.2}}>{w.en}</div>
                <button className="btn" onClick={()=>doSpeak(synthRef.current,w.en,'en-US')} style={{border:`1px solid #2a5030`,color:'#6acf90',borderRadius:'50%',width:30,height:30,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>🔊</button>
              </div>
              {w.cs&&<div style={{fontSize:12,color:'#4a6050',fontStyle:'italic',marginBottom:4}}>{parseSyns(w.cs)[0]}</div>}
              {pronAtt>0&&!feedback&&<div style={{fontSize:12,color:pronAtt>=2?C.err:'#c89040',marginTop:4}}>{pronAtt===1?'Pokus 2/3':'Poslední pokus 3/3'}</div>}
            </>
          ):isBlank?(
            <>
              <div style={{fontSize:10,color:'#5a4a8a',textTransform:'uppercase',letterSpacing:3,marginBottom:8}}>✏️ Doplň do věty</div>
              {blankSentence
                ?(<><div style={{fontSize:18,color:C.text,fontFamily:"'Playfair Display',serif",fontWeight:500,marginBottom:10,lineHeight:1.5}}>„{blankSentence}"</div><div style={{fontSize:13,color:'#5a6070',fontStyle:'italic'}}>🇨🇿 {parseSyns(w.cs)[0]||w.cs}</div></>)
                :(<><div style={{fontSize:12,color:C.muted,marginBottom:6}}>Žádná věta — přelož:</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:C.text}}>{w.cs}</div></>)
              }
            </>
          ):(
            <>
              <div style={{fontSize:10,color:C.mutedDark,textTransform:'uppercase',letterSpacing:3,marginBottom:8}}>{studyMode==='en-cs'?'🇬🇧 Anglicky':'🇨🇿 Česky'}</div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:5}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:C.text,lineHeight:1.2}}>{question}</div>
                <button className="btn" onClick={()=>doSpeak(synthRef.current,question,qLang)} style={{border:`1px solid #2e3447`,color:'#6a7888',borderRadius:'50%',width:28,height:28,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>🔊</button>
              </div>
              {w.example&&!feedback&&<div style={{fontSize:11,color:'#3a4a50',fontStyle:'italic',borderTop:`1px solid ${C.border}`,paddingTop:8}}>💡 „{w.example}"</div>}
            </>
          )}
          <div style={{display:'flex',justifyContent:'center',gap:5,marginTop:10}}>
            {[0,1,2,3,4].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',transition:'background .3s',background:i<(w.score??0)?C.gold:'#1e2535'}}/>)}
          </div>
        </div>

        {/* input toggle — not in pron mode */}
        {!feedback&&!isPron&&(
          <div style={{display:'flex',background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:3,gap:3}}>
            {[['mic','🎤 Mikrofon'],['text','⌨️ Psát']].map(([m,lbl])=>(
              <button key={m} className="btn" onClick={()=>{setIMode(m);setMicErr('');setTx('');}} style={{background:iMode===m?'#1e2a45':'transparent',border:iMode===m?'1px solid #2e4065':'1px solid transparent',color:iMode===m?C.gold:'#6a7080',borderRadius:7,padding:'5px 14px',fontSize:13,cursor:'pointer',transition:'all .2s'}}>{lbl}</button>
            ))}
          </div>
        )}

        {evalLoading&&<div className="pulse" style={{fontSize:13,color:C.gold,textAlign:'center'}}>🤖 Vyhodnocuji…</div>}

        {/* answer area */}
        {!feedback&&!evalLoading?(
          <div className="fade-up" style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:9}}>
            {(iMode==='mic'||isPron)&&(<>
              {micErr&&<div style={{width:'100%',background:'#200e0e',border:`1px solid #5a2020`,borderRadius:9,padding:'8px 12px',fontSize:12,color:'#e08080',lineHeight:1.5}}>⚠️ {micErr}{!isPron&&<button className="btn" onClick={()=>setIMode('text')} style={{marginLeft:8,background:C.gold,color:C.bg,borderRadius:5,padding:'2px 7px',fontSize:11,fontWeight:700,cursor:'pointer'}}>Psát</button>}</div>}
              {micSt==='requesting'&&<div style={{color:'#8a9060',fontSize:12}}>Žádám o přístup k mikrofonu…</div>}
              <div style={{color:C.muted,fontSize:12,minHeight:20,textAlign:'center',display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
                {listenOn?(<><span style={{display:'flex',alignItems:'flex-end',height:16}}>{[1,2,3,4,5].map(i=><span key={i} className="wv" style={{height:5}}/>)}</span>{tx?`„${tx}"`:isPron?'Řekni slovo anglicky…':`Říkejte ${studyMode==='en-cs'?'česky':'anglicky'}…`}</>):tx?`„${tx}"`:isPron?'Klikni na 🎤 a zopakuj':`Řekněte překlad ${studyMode==='en-cs'?'česky':'anglicky'}`}
              </div>
              <button onClick={listenOn?stopListen:()=>startListen(micLang)} className={`btn${listenOn?' mic-on':''}`}
                style={{width:66,height:66,borderRadius:'50%',fontSize:26,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',background:listenOn?'#c49840':'#141c2e',border:`2.5px solid ${listenOn?C.gold:'#2e3447'}`,color:listenOn?C.bg:'#7a8888',transition:'all .2s'}}>
                {listenOn?'⏹':'🎤'}
              </button>
            </>)}
            {iMode==='text'&&!isPron&&(
              <div style={{width:'100%',display:'flex',flexDirection:'column',gap:7}}>
                <input className="inp" value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitTyped();}} placeholder={studyMode==='en-cs'?'česky…':'anglicky…'} autoFocus/>
                <button className="btn" onClick={submitTyped} style={{background:typed.trim()?C.gold:'#1a2030',color:typed.trim()?C.bg:'#4a5060',border:'none',borderRadius:9,padding:'11px',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:"'Playfair Display',serif",transition:'all .2s'}}>Zkontrolovat →</button>
              </div>
            )}
            {!isPron&&(
              <button className="btn" onClick={dontKnow}
                style={{border:`1.5px solid #3d3020`,background:'#1a1508',color:'#c8a050',borderRadius:9,padding:'8px 22px',fontSize:13,cursor:'pointer',fontWeight:500,transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#3d3020';e.currentTarget.style.color='#c8a050';}}>
                Nevím — ukázat &amp; přečíst 🔈
              </button>
            )}
          </div>
        ):!evalLoading&&feedback?(
          <div className="fade-up" style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
            <div style={{width:'100%',background:feedback.ok?C.okBg:C.errBg,border:`1px solid ${feedback.ok?C.okBorder:C.errBorder}`,borderRadius:14,padding:'1rem 1.2rem',display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:28,flexShrink:0}}>{feedback.ok?'✓':'✗'}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700,color:feedback.ok?C.ok:C.err,marginBottom:4,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  {feedback.ok?(isPron?'Výborná výslovnost!':'Správně!'):(feedback.forced?'3× špatně → další':(isPron?'Zkus příště':'Špatně'))}
                  {feedback.aiEval&&<span style={{fontSize:10,background:'#1a2a1a',color:'#5a9060',borderRadius:20,padding:'1px 7px'}}>🤖 AI</span>}
                  {feedback.ok&&feedback.xp>0&&<span style={{fontSize:11,color:C.xp,marginLeft:'auto'}}>+{feedback.xp} XP ⚡</span>}
                  {!feedback.ok&&<span style={{fontSize:10,color:C.errBorder,marginLeft:'auto'}}>{wrongCd>0?`→ ${wrongCd}s`:'→ dále'}</span>}
                </div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,color:C.text}}>{parseSyns(feedback.answer)[0]||feedback.answer}</div>
                {allSyns&&<div style={{fontSize:11,color:'#5a6a50',marginTop:3}}>✓ také: {allSyns}</div>}
                {isPron&&w.cs&&<div style={{fontSize:12,color:'#5a7060',marginTop:2}}>🇨🇿 {parseSyns(w.cs)[0]}</div>}
                {w.example&&<div style={{fontSize:11,color:'#3a4a50',fontStyle:'italic',marginTop:5}}>💡 „{w.example}"</div>}
                {!feedback.ok&&feedback.given&&<div style={{fontSize:11,color:'#4a4030',marginTop:4,fontStyle:'italic'}}>Vaše odpověď: „{feedback.given}"</div>}
              </div>
              <button className="btn" onClick={()=>doSpeak(synthRef.current,parseSyns(feedback.answer)[0]||feedback.answer,aLang)} style={{border:`1px solid #2e3447`,color:'#6a7888',borderRadius:'50%',width:32,height:32,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>🔊</button>
            </div>
            {!feedback.ok&&(
              <button className="btn" onClick={nextCard}
                style={{background:C.card,border:`1px solid ${C.border}`,color:C.textDim,borderRadius:11,padding:'10px 28px',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:8,transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textDim;}}>
                Další → {wrongCd>0&&<span style={{background:'#2a3040',color:C.muted,borderRadius:'50%',width:22,height:22,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{wrongCd}</span>}
              </button>
            )}
          </div>
        ):null}
      </div>
    </div>
  );
}
