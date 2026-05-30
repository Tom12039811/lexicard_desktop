
import React, { useState, useEffect, useRef } from "react";
import { C, MODES, DEFAULT_LANGS, STAT_COLS, WORD_SORTS, DECK_SORTS, STYLE } from "./constants.js";
import { uid, now, sortDecks, sortWords, sortStats, getLevel, checkStreak, dueCount } from "./utils.js";
import { Modal, ConfirmModal, SettingsDropdown, LangModal } from "./modals.jsx";

/* ══════════════════════════════════════════════════════════════
   DECK SCREEN
══════════════════════════════════════════════════════════════ */
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
        <thead><tr style={{borderBottom:`1px solid #1e2535`}}>{["#","Anglicky","Česky","Synonyma","Prox.","✓","✗","Úsp.","Krabička"].map(h=><th key={h} style={{padding:"6px 8px",color:C.muted,fontWeight:500,fontSize:10,textTransform:"uppercase",letterSpacing:1,textAlign:h==="#"?"center":"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
        <tbody>
          {sorted.map((w,i)=>{
            const ws=w.wStats??{total:0,correct:0,wrong:0},pct=ws.total?Math.round(ws.correct/ws.total*100):null,pc=pct===null?C.muted:pct>=80?C.ok:pct>=50?C.gold:C.err;
            const syns=[...parseSyn(w.cs).slice(1),...parseSyn(w.synonyms||"")].join(", ");
            const daysLeft=w.vmNextReview?Math.max(0,Math.round((w.vmNextReview-Date.now())/86400000)):null;
            const vmBox=vmGetBox(w);
            return(<tr key={w.id} style={{borderBottom:`1px solid #161e2e`}} onMouseEnter={e=>e.currentTarget.style.background="#0e1525"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <td style={{padding:"7px 8px",color:C.muted,textAlign:"center",fontSize:10}}>{i+1}</td>
              <td style={{padding:"7px 8px",color:C.text,fontWeight:500}}>{w.en}</td>
              <td style={{padding:"7px 8px",color:C.textDim}}>{parseSyn(w.cs)[0]||w.cs}</td>
              <td style={{padding:"7px 8px",color:"#6a7060",fontSize:11,fontStyle:"italic"}}>{syns||"—"}</td>
              <td style={{padding:"7px 8px",color:C.textDim,textAlign:"center"}}>{ws.total||"—"}</td>
              <td style={{padding:"7px 8px",color:C.ok,textAlign:"center"}}>{ws.correct||"—"}</td>
              <td style={{padding:"7px 8px",color:C.err,textAlign:"center"}}>{ws.wrong||"—"}</td>
              <td style={{padding:"7px 8px",textAlign:"center"}}>{pct!==null?<span style={{background:pc+"22",color:pc,borderRadius:20,padding:"2px 8px",fontWeight:600,fontSize:11}}>{pct}%</span>:<span style={{color:C.mutedDark}}>—</span>}</td>
              <td style={{padding:"7px 8px",textAlign:"center"}}>
                <span style={{background:"#1a2035",color:C.gold,borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:600}}>#{vmBox}</span>
                {daysLeft!==null&&<span style={{color:C.muted,fontSize:10,marginLeft:4}}>{daysLeft===0?"dnes":`${daysLeft}d`}</span>}
              </td>
            </tr>);
          })}
        </tbody>
      </table>
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



/* ─── Deck Settings Dropdown (⚙️) ───────────────────────────── */
function DeckSettingsDropdown({onDelete, onExport}) {
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  return(
    <div ref={ref} style={{position:"relative",flexShrink:0}}>
      <button className="btn" onClick={()=>setOpen(o=>!o)}
        style={{background:open?"#1e2a45":"transparent",border:`1px solid ${open?"#3a5080":C.border}`,color:open?C.gold:C.muted,borderRadius:8,padding:"5px 10px",fontSize:16,cursor:"pointer",lineHeight:1,transition:"all .2s"}}>
        ⚙️
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#111e30",border:`1px solid #2a3650`,borderRadius:12,overflow:"hidden",minWidth:180,zIndex:50,boxShadow:"0 8px 28px rgba(0,0,0,.6)"}}>
          <button className="btn" onClick={()=>{onExport();setOpen(false);}}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",color:C.textDim,fontSize:13,textAlign:"left",transition:"background .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#161e30"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:16}}>📥</span> Export do Excelu
          </button>
          <div style={{borderTop:`1px solid ${C.border}`}}/>
          <button className="btn" onClick={()=>{onDelete();setOpen(false);}}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",color:C.err,fontSize:13,textAlign:"left",transition:"background .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#1a0a0a"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:16}}>🗑️</span> Smazat balíček
          </button>
        </div>
      )}
    </div>
  );
}


function DeckScreen({deck,langCfg,hasSavedSession,onBack,onStart,onResume,onUpdate,onAddWord,onDeleteWord,onDeleteDeck,onRename,onResetStats,onExport}){
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
          <DeckSettingsDropdown onDelete={()=>setShowDelDeck(true)} onExport={onExport}/>
        </div>
        {/* Row 2: ✏️ Deck name  |  Učení ▶ */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:6,minWidth:0}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{deck.name}</div>
            <button className="btn" onClick={()=>setShowRename(true)} style={{color:C.muted,fontSize:14,flexShrink:0,opacity:.7}} title="Přejmenovat">✏️</button>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {hasSavedSession&&(
              <button className="btn" onClick={onResume}
                style={{background:"#1a2535",border:`1px solid #3a5080`,color:"#7090c8",borderRadius:9,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                ↩ Pokračovat
              </button>
            )}
            <button className="btn" onClick={onStart} disabled={!deck.words.length}
              style={{background:deck.words.length?C.gold:"#2a2a1a",color:deck.words.length?C.bg:"#5a5030",borderRadius:9,padding:"8px 20px",fontSize:14,fontWeight:700,cursor:deck.words.length?"pointer":"default"}}>
              Učení ▶
            </button>
          </div>
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

export default function HomeScreen(props) {
  return (
    // Hlavní UI pro Home Screen
  );
}