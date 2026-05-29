
import React, { useState, useEffect /* další potřebné hooky */ } from 'react';
import { C, DECK_SORTS, WORD_SORTS /* atd. dle potřeby daného screenu */ } from './constants.js';
import { uid, now, checkStreak, getLevel /* atd. */ } from './utils.js';
import { Modal, ConfirmModal /* a další popupy */ } from './modals.jsx';
/* ══════════════════════════════════════════════════════════════
   HOME SCREEN
══════════════════════════════════════════════════════════════ */
/* ─── Folder Modal ───────────────────────────────────────────── */
function FolderModal({initial, onClose, onSave, title}) {
  const [name,setName]=useState(initial?.name??"");
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold,marginBottom:3}}>{title}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <input className="inp-sm" value={name} onChange={e=>setName(e.target.value)}
          placeholder="Název složky…" autoFocus
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&onSave(name.trim())}/>
        <div style={{display:"flex",gap:8}}>
          <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
          <button className="btn" onClick={()=>name.trim()&&onSave(name.trim())}
            style={{flex:2,background:name.trim()?C.gold:"#1a2030",color:name.trim()?C.bg:"#4a5060",border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>
            Uložit
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Move to Folder Modal ───────────────────────────────────── */
function MoveFolderModal({deck, folders, currentFolderId, onClose, onMove}) {
  const [selected,setSelected]=useState(currentFolderId??null);
  return(
    <Modal onClose={onClose}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.gold,marginBottom:3}}>Přesunout balíček</div>
        <div style={{fontSize:13,color:C.muted}}>„{deck.name}"</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
        {/* no folder option */}
        <div onClick={()=>setSelected(null)}
          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:selected===null?"#1a2a45":"transparent",border:`1px solid ${selected===null?"#3a5080":C.border}`,borderRadius:10,cursor:"pointer",transition:"all .15s"}}>
          <span style={{fontSize:18}}>📋</span>
          <span style={{fontSize:13,color:selected===null?C.gold:C.textDim}}>Bez složky (hlavní stránka)</span>
          {selected===null&&<span style={{marginLeft:"auto",color:C.ok,fontSize:12}}>✓</span>}
        </div>
        {folders.map(f=>(
          <div key={f.id} onClick={()=>setSelected(f.id)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:selected===f.id?"#1a2a45":"transparent",border:`1px solid ${selected===f.id?"#3a5080":C.border}`,borderRadius:10,cursor:"pointer",transition:"all .15s"}}>
            <span style={{fontSize:18}}>📁</span>
            <span style={{fontSize:13,color:selected===f.id?C.gold:C.textDim}}>{f.name}</span>
            {selected===f.id&&<span style={{marginLeft:"auto",color:C.ok,fontSize:12}}>✓</span>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn" onClick={onClose} style={{flex:1,border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,padding:"10px",fontSize:14,cursor:"pointer"}}>Zrušit</button>
        <button className="btn" onClick={()=>{onMove(selected);onClose();}}
          style={{flex:2,background:C.gold,color:C.bg,border:"none",borderRadius:9,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          Přesunout
        </button>
      </div>
    </Modal>
  );
}


function HomeScreen({decks,langs,activeLang,gameStats,folders,onLangSwitch,onAddLang,onEditLang,onDeleteLang,onSelect,onFileUpload,onSampleDeck,onAddFolder,onRenameFolder,onDeleteFolder,onMoveDeck}){
  const [sort,setSort]=useState("date-desc");
  const [showUpload,setShowUpload]=useState(false);
  const [showAddFolder,setShowAddFolder]=useState(false);
  const [editFolder,setEditFolder]=useState(null);
  const [delFolder,setDelFolder]=useState(null);
  const [moveInfo,setMoveInfo]=useState(null);
  const [openFolders,setOpenFolders]=useState({});
  const ld=sortDecks(decks.filter(d=>d.lang===activeLang),sort);
  const lc=langs.find(l=>l.id===activeLang)||langs[0];
  const lvl=getLevel(gameStats.xp??0);
  const streak=gameStats.dailyStreak??0;
  const langFolders=folders.filter(f=>f.lang===activeLang);
  const decksInFolder=fid=>ld.filter(d=>d.folderId===fid);
  const looseDecks=ld.filter(d=>!d.folderId||!langFolders.find(f=>f.id===d.folderId));
  function DeckCard({d}){
    const mastered=d.words.filter(w=>(w.score??0)>=3).length;
    const pct=d.words.length?Math.round(mastered/d.words.length*100):0;
    const due=dueCount(d.words);
    const sr=d.deckStats?.totalAnswers?Math.round(d.deckStats.correctAnswers/d.deckStats.totalAnswers*100):null;
    return(<div style={{position:"relative"}}>
      <div onClick={()=>onSelect(d.id)} className="btn" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"1.2rem",cursor:"pointer",transition:"border-color .2s",textAlign:"left",width:"100%"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#3a5080"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
        {due>0&&<div style={{position:"absolute",top:10,right:34,background:"#3a1a08",border:"1px solid #8a4020",borderRadius:20,padding:"2px 7px",fontSize:10,color:"#d08050",fontWeight:600}}>{due} dnes</div>}
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.2,paddingRight:42}}>{d.name}</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:10}}>{d.words.length} slov · {mastered} zvl.{sr!==null?` · ${sr}%`:""}</div>
        <div style={{background:"#161e30",borderRadius:3,height:3}}><div style={{width:`${pct}%`,height:"100%",background:C.gold,borderRadius:3}}/></div>
        <div style={{fontSize:10,color:C.goldDim,marginTop:4,textAlign:"right"}}>{pct}% zvládnuto</div>
      </div>
      <button className="btn" onClick={e=>{e.stopPropagation();setMoveInfo({deck:d});}} title="Přesunout do složky"
        style={{position:"absolute",top:8,right:6,color:C.mutedDark,fontSize:13,padding:"3px 5px",lineHeight:1}}
        onMouseEnter={e=>e.currentTarget.style.color=C.gold} onMouseLeave={e=>e.currentTarget.style.color=C.mutedDark}>📁</button>
    </div>);
  }
  return(
    <div style={{minHeight:"100dvh",background:C.bg,fontFamily:"'Lora',Georgia,serif",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",padding:"1.5rem 1rem",overscrollBehavior:"none"}}>
      <style>{STYLE}</style>
      {showUpload&&<UploadModal onClose={()=>setShowUpload(false)} onUpload={onFileUpload}/>}
      {showAddFolder&&<FolderModal title="Nová složka" onClose={()=>setShowAddFolder(false)} onSave={name=>{onAddFolder(name);setShowAddFolder(false);}}/>}
      {editFolder&&<FolderModal title="Přejmenovat složku" initial={editFolder} onClose={()=>setEditFolder(null)} onSave={name=>{onRenameFolder(editFolder.id,name);setEditFolder(null);}}/>}
      {delFolder&&<ConfirmModal title="Smazat složku?" msg={`Balíčky ve složce budou přesunuty na hlavní stránku.`} label="Smazat složku" onConfirm={()=>{onDeleteFolder(delFolder.id);}} onClose={()=>setDelFolder(null)}/>}
      {moveInfo&&<MoveFolderModal deck={moveInfo.deck} folders={langFolders} currentFolderId={moveInfo.deck.folderId} onClose={()=>setMoveInfo(null)} onMove={fid=>onMoveDeck(moveInfo.deck.id,fid)}/>}
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
      {/* actions row: add deck + new folder */}
      <div style={{width:"100%",maxWidth:780,display:"flex",gap:8,marginBottom:"0.9rem"}}>
        <button className="btn" onClick={()=>setShowUpload(true)}
          style={{flex:1,display:"flex",alignItems:"center",gap:10,background:"#0e1520",border:`1.5px dashed #2a3650`,borderRadius:14,padding:"11px 14px",cursor:"pointer",transition:"all .2s",textAlign:"left"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.background="rgba(212,168,83,.04)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3650";e.currentTarget.style.background="#0e1520";}}>
          <div style={{width:30,height:30,background:"#1a2535",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>📊</div>
          <div style={{fontSize:13,color:C.gold,fontFamily:"'Playfair Display',serif",fontWeight:700}}>Přidat balíček</div>
          <div style={{marginLeft:"auto",fontSize:18,color:"#2a3650"}}>+</div>
        </button>
        <button className="btn" onClick={()=>setShowAddFolder(true)}
          style={{display:"flex",alignItems:"center",gap:8,background:"#0e1520",border:`1px solid #2a3650`,borderRadius:14,padding:"11px 14px",cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.background="rgba(212,168,83,.04)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3650";e.currentTarget.style.background="#0e1520";}}>
          <span style={{fontSize:18}}>📁</span>
          <span style={{fontSize:13,color:C.textDim}}>Nová složka</span>
        </button>
      </div>
      {/* sort */}
      <div style={{width:"100%",maxWidth:780,display:"flex",alignItems:"center",gap:7,marginBottom:12,flexWrap:"wrap"}}>
        <span style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:2,flexShrink:0}}>Řadit:</span>
        {DECK_SORTS.map(s=><button key={s.id} className="btn" onClick={()=>setSort(s.id)} style={{background:sort===s.id?"#1a2a40":"transparent",border:`1px solid ${sort===s.id?"#2e4565":C.border}`,color:sort===s.id?C.gold:C.muted,borderRadius:8,padding:"4px 11px",fontSize:11,cursor:"pointer"}}>{s.label}</button>)}
      </div>
      {/* decks + folders */}
      <div style={{width:"100%",maxWidth:780,flex:1,display:"flex",flexDirection:"column",gap:14}}>
        {ld.length===0?(
          <div style={{textAlign:"center",padding:"3rem 0",color:C.muted,fontSize:14,fontStyle:"italic"}}>
            Žádné balíčky pro {lc?.label}
            <div style={{marginTop:12}}><button className="btn" onClick={onSampleDeck} style={{background:"#1a2535",border:`1px solid #2a3650`,color:"#7090b8",borderRadius:10,padding:"9px 18px",fontSize:13,cursor:"pointer"}}>🎓 Načíst ukázkový balíček</button></div>
          </div>
        ):(
          <>
            {langFolders.map(f=>{
              const fDecks=decksInFolder(f.id);
              const isOpen=openFolders[f.id]!==false;
              return(<div key={f.id} style={{background:"#0e1420",border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",userSelect:"none"}} onClick={()=>setOpenFolders(o=>({...o,[f.id]:!isOpen}))}>
                  <span style={{fontSize:16}}>{isOpen?"📂":"📁"}</span>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:600,color:C.text,flex:1}}>{f.name}</span>
                  <span style={{fontSize:11,color:C.muted}}>{fDecks.length} bal.</span>
                  <button className="btn" onClick={e=>{e.stopPropagation();setEditFolder(f);}} style={{color:C.mutedDark,fontSize:13,padding:"2px 5px"}} onMouseEnter={e=>e.currentTarget.style.color=C.gold} onMouseLeave={e=>e.currentTarget.style.color=C.mutedDark}>✏️</button>
                  <button className="btn" onClick={e=>{e.stopPropagation();setDelFolder(f);}} style={{color:C.mutedDark,fontSize:14,padding:"2px 5px"}} onMouseEnter={e=>e.currentTarget.style.color=C.err} onMouseLeave={e=>e.currentTarget.style.color=C.mutedDark}>×</button>
                  <span style={{fontSize:11,color:C.muted}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&<div style={{padding:"0 10px 10px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:10}}>
                  {fDecks.length===0
                    ? <div style={{color:C.muted,fontSize:12,fontStyle:"italic",padding:"8px 4px",gridColumn:"1/-1"}}>Složka je prázdná — přesuň sem balíček pomocí 📁</div>
                    : fDecks.map(d=><DeckCard key={d.id} d={d}/>)}
                </div>}
              </div>);
            })}
            {looseDecks.length>0&&(
              <div>
                {langFolders.length>0&&<div style={{fontSize:10,color:C.mutedDark,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Bez složky</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12}}>
                  {looseDecks.map(d=><DeckCard key={d.id} d={d}/>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default HomeScreen;