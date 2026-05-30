
import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";



// --- NOVĚ PŘIDANÉ IMPORTY ---
import { C, STYLE, DEFAULT_LANGS } from "./constants.js";
import { uid, now, sortDecks, vmPickRound, checkStreak, calcXP, getLevel, doSpeak, playAudio, fetchDict, vmUpdate, comboInfo, playSound } from "./utils.js";
import HomeScreen from "./homescreen.jsx";
import DeckScreen from "./deckscreen.jsx";
import StudyScreen from "./studyscreen.jsx";
import { RoundEnd } from "./studyscreen.jsx";


export default function App() {
  const [decks,setDecks]=useState([]);
  const [langs,setLangs]=useState(DEFAULT_LANGS);
  const [folders,setFolders]=useState([]);
  const [screen,setScreen]=useState("home"); // home | deck | study
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
    try{
      const raw=localStorage.getItem("lc6_data");
      if(raw){
        const d=JSON.parse(raw);
        if(d.decks)setDecks(d.decks);
        if(d.lang)setLang(d.lang);
        if(d.langs)setLangs(p=>{const ids=new Set(p.map(l=>l.id));return[...p,...d.langs.filter(l=>!ids.has(l.id))];});
        if(d.gameStats)setGameStats(d.gameStats);
        if(d.folders)setFolders(d.folders);
      } else setShowOnboarding(true);
    }catch{}
    setLoaded(true);
  },[]);
  useEffect(()=>{
    if(loaded){try{localStorage.setItem("lc6_data",JSON.stringify({decks,lang:activeLang,langs:langs.filter(l=>l.custom),gameStats,folders}));}catch{}}
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
        const words=rows.filter(r=>r[0]&&r[1]).map(r=>({id:uid(),en:String(r[0]).trim(),cs:String(r[1]).trim(),example:r[2]?String(r[2]).trim():"",synonyms:r[3]?String(r[3]).trim():"",score:0,addedAt:now(),vmBox:1,vmLastReview:null,vmNextReview:null,wStats:{total:0,correct:0,wrong:0}}));
        if(!words.length){alert("Žádná slovíčka nenalezena.");return;}
        const d={id:uid(),name,lang:activeLang,words,createdAt:now(),deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0}};
        setDecks(ds=>[...ds,d]);setDeckId(d.id);setScreen("deck");
      }catch{alert("Nepodařilo se načíst soubor.");}
    };
    rd.readAsArrayBuffer(file);
  }
  function loadSampleDeck(){
    const words=SAMPLE_WORDS.map(w=>({id:uid(),...w,synonyms:"",score:0,addedAt:now(),vmBox:1,vmLastReview:null,vmNextReview:null,wStats:{total:0,correct:0,wrong:0}}));
    const d={id:uid(),name:"Ukázkový balíček",lang:activeLang,words,createdAt:now(),deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0}};
    setDecks(ds=>[...ds,d]);setDeckId(d.id);setScreen("deck");
  }

  /* ── deck ops ── */
  const updWord=(wid,field,val)=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.map(w=>w.id!==wid?w:{...w,[field]:val})}));
  function addWord({en,cs,example,synonyms}){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:[...d.words,{id:uid(),en,cs,example,synonyms:synonyms||"",score:0,addedAt:now(),vmBox:1,vmLastReview:null,vmNextReview:null,wStats:{total:0,correct:0,wrong:0}}]}));}
  const delWord=wid=>setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,words:d.words.filter(w=>w.id!==wid)}));
  function delDeck(){setDecks(ds=>ds.filter(d=>d.id!==deckId));setScreen("home");}
  function renameDeck(name){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,name}));}
  function resetStats(){setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,deckStats:{totalAnswers:0,correctAnswers:0,roundsCompleted:0},words:d.words.map(w=>({...w,score:0,vmBox:1,vmLastReview:null,vmNextReview:null,wStats:{total:0,correct:0,wrong:0}}))}));}
  function addLang(l){setLangs(ls=>[...ls,l]);setLang(l.id);}
  function editLang(updated){setLangs(ls=>ls.map(l=>l.id===updated.id?updated:l));}
  function deleteLang(id){setDecks(ds=>ds.filter(d=>d.lang!==id));setFolders(fs=>fs.filter(f=>f.lang!==id));setLangs(ls=>ls.filter(l=>l.id!==id));if(activeLang===id){const rem=langs.filter(l=>l.id!==id);if(rem.length)setLang(rem[0].id);}}

  /* ── Folder ops ── */
  function addFolder(name){setFolders(fs=>[...fs,{id:uid(),name,lang:activeLang,createdAt:now()}]);}
  function renameFolder(fid,name){setFolders(fs=>fs.map(f=>f.id===fid?{...f,name}:f));}
  function deleteFolder(fid){
    setFolders(fs=>fs.filter(f=>f.id!==fid));
    // move decks out of deleted folder
    setDecks(ds=>ds.map(d=>d.folderId===fid?{...d,folderId:null}:d));
  }
  function moveDeck(did,folderId){setDecks(ds=>ds.map(d=>d.id===did?{...d,folderId:folderId??null}:d));}

  /* ── Export deck to Excel ── */
  function exportDeck(){
    if(!deck) return;
    const rows=[["Anglicky","Česky","Příkladová věta","Synonyma"],...deck.words.map(w=>[w.en,w.cs,w.example||"",w.synonyms||""])];
    const ws=XLSX.utils.aoa_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,deck.name.slice(0,31));
    XLSX.writeFile(wb,`${deck.name}.xlsx`);
  }

  /* ── study helpers ── */
  /* ── Session persistence (paměť sezení) ── */
  function saveSession(words, idx, stats, combo, deckId, mode, translDir, flipDir) {
    try {
      localStorage.setItem("lc6_session", JSON.stringify({
        deckId, rWords:words.map(w=>w.id), rIdx:idx,
        rStats:stats, combo, mode, translDir, flipDir,
        savedAt:Date.now()
      }));
    } catch {}
  }
  function clearSession() {
    try { localStorage.removeItem("lc6_session"); } catch {}
  }
  function restoreSession(decks) {
    try {
      const raw = localStorage.getItem("lc6_session");
      if(!raw) return null;
      const s = JSON.parse(raw);
      // Session expires after 24h
      if(Date.now()-s.savedAt > 86400000) { clearSession(); return null; }
      const deck = decks.find(d=>d.id===s.deckId);
      if(!deck) return null;
      const wordMap = new Map(deck.words.map(w=>[w.id,w]));
      const rWords = (s.rWords||[]).map(id=>wordMap.get(id)).filter(Boolean);
      if(rWords.length===0) return null;
      return {rWords, rIdx:s.rIdx||0, rStats:s.rStats||{ok:0,bad:0,xp:0}, combo:s.combo||0, deckId:s.deckId, mode:s.mode||"transl", translDir:s.translDir||"en-cs", flipDir:s.flipDir||"en-cs"};
    } catch { return null; }
  }

  function clearCard(){clearTimeout(timerRef.current);clearInterval(intervalRef.current);setFB(null);setTx("");setMicErr("");setTyped("");setPronAtt(0);setWrongCountdown(0);setEvalLoading(false);setFlipped(false);setFlipFlash(null);}

  function startStudy(){
    if(!deck?.words?.length)return;
    const words=pickRound(deck.words);
    setRWords(words);setRIdx(0);setRStats({ok:0,bad:0,xp:0});setCombo(0);clearCard();
    saveSession(words,0,{ok:0,bad:0,xp:0},0,deckId,mode,translDir,flipDir);
    setScreen("study");
  }

  function resumeStudy(decksSnap){
    const s=restoreSession(decksSnap||decks);
    if(!s) return;
    setDeckId(s.deckId);
    setRWords(s.rWords);setRIdx(s.rIdx);setRStats(s.rStats);setCombo(s.combo);
    setMode(s.mode);setTranslDir(s.translDir);setFlipDir(s.flipDir);
    clearCard();
    setScreen("study");
  }

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
      clearSession();
      setScreen("roundEnd");
    } else {
      setRIdx(nxt);
      saveSession(rWords,nxt,rStats,combo,deckId,mode,translDir,flipDir);
    }
  }
  function nextRound(){
    const words=pickRound(deck.words);
    setRWords(words);setRIdx(0);setRStats({ok:0,bad:0,xp:0});setCombo(0);clearCard();
    saveSession(words,0,{ok:0,bad:0,xp:0},0,deckId,mode,translDir,flipDir);
    setScreen("study");
  }

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
    const vmUpd=vmUpdate(w,quality);
    setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,
      words:d.words.map(dw=>dw.id!==w.id?dw:{...dw,...vmUpd,score:quality>=3?(dw.score??0)+1:Math.max(0,(dw.score??0)-1),wStats:{total:(dw.wStats?.total??0)+1,correct:(dw.wStats?.correct??0)+(ok?1:0),wrong:(dw.wStats?.wrong??0)+(ok?0:1)}}),
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
    const vmUpd=vmUpdate(w,quality);
    setFB({ok,answer:translDir==="en-cs"?w.cs:w.en,given,forced,quality});
    setRStats(s=>({...s,ok:s.ok+(ok?1:0),bad:s.bad+(ok?0:1),xp:s.xp+xpGain}));
    setDecks(ds=>ds.map(d=>d.id!==deckId?d:{...d,
      words:d.words.map(dw=>dw.id!==w.id?dw:{...dw,...vmUpd,score:ok?(dw.score??0)+1:Math.max(0,(dw.score??0)-1),wStats:{total:(dw.wStats?.total??0)+1,correct:(dw.wStats?.correct??0)+(ok?1:0),wrong:(dw.wStats?.wrong??0)+(ok?0:1)}}),
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
    <HomeScreen decks={decks} langs={langs} activeLang={activeLang} gameStats={gameStats} folders={folders}
      onLangSwitch={setLang} onAddLang={addLang} onEditLang={editLang} onDeleteLang={deleteLang}
      onSelect={id=>{setDeckId(id);setScreen("deck");}} onFileUpload={loadFile} onSampleDeck={loadSampleDeck}
      onAddFolder={addFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} onMoveDeck={moveDeck}/>
  </>);
  if(screen==="deck"&&deck){
    const lc=langs.find(l=>l.id===deck.lang)||langs[0];
    const savedSess=restoreSession(decks);
    const hasSavedSession=!!(savedSess&&savedSess.deckId===deck.id);
    return <DeckScreen deck={deck} langCfg={lc} hasSavedSession={hasSavedSession}
      onBack={()=>setScreen("home")} onStart={startStudy} onResume={()=>resumeStudy(decks)}
      onUpdate={updWord} onAddWord={addWord} onDeleteWord={delWord} onDeleteDeck={delDeck}
      onRename={renameDeck} onResetStats={resetStats} onExport={exportDeck}/>;
  }  if(screen==="roundEnd") return <RoundEnd stats={rStats} total={rWords.length} deckName={deck?.name??""} xpEarned={roundEndData?.xpEarned??0} newLevel={roundEndData?.newLevel} streak={roundEndData?.streak} onNext={nextRound} onBack={()=>setScreen("deck")}/>;

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

