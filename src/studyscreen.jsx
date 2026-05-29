
import React, { useState, useEffect, useRef } from "react";
import { C, MODES, DEFAULT_LANGS, STAT_COLS, WORD_SORTS, DECK_SORTS } from "./constants.js";
import { uid, now, sortDecks, sortWords, sortStats, getLevel, checkStreak } from "./utils.js";
import { Modal, ConfirmModal, SettingsDropdown, LangModal } from "./modals.jsx";

/* ══════════════════════════════════════════════════════════════
   STUDY SCREEN
══════════════════════════════════════════════════════════════ */
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


export default StudyScreen;