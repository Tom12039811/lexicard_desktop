/* ─── Vocabulary Miner Box Intervals ─────────────────────────── */
export const VM_INTERVALS = [0, 1, 2, 3, 5, 10, 30, 60, 90]; // index = číslo krabičky (1-8)

/* ─── XP & Levels ────────────────────────────────────────────── */
export const LVL_XP = [0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000, 10000];
export const LVL_NAMES = [
  "Začátečník", "Učeň", "Student", "Mírně pokročilý", "Pokročilý",
  "Expert", "Mistr", "Šampion", "Legenda", "Guru",
  "Virtuóz", "Polobůh", "Mistr světa"
];

/* ─── Sample deck ────────────────────────────────────────────── */
export const SAMPLE_WORDS = [
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

/* ─── Language defaults ──────────────────────────────────────── */
export const DEFAULT_LANGS = [
  {id:"en",label:"Angličtina",flag:"🇬🇧",code:"ENG",nativeCode:"CZ",studyCode:"ENG"},
  {id:"es",label:"Španělština",flag:"🇪🇸",code:"ESP",nativeCode:"CZ",studyCode:"ESP"},
];

/* ─── Study modes ────────────────────────────────────────────── */
export const MODES = [
  {id:"transl",label:"🔤 Překlad",hint:"přeložit slovo"},
  {id:"pron",  label:"🔊 Výslovnost",hint:"opakuj slova"},
  {id:"flip",  label:"🃏 Karty",hint:"překlop & ohodnoť"},
];

/* ─── Sort options ───────────────────────────────────────────── */
export const DECK_SORTS = [
  {id:"date-desc",label:"Nejnovější"},
  {id:"date-asc", label:"Nejstarší"},
  {id:"name-asc", label:"A–Z"},
  {id:"name-desc",label:"Z–A"},
];
export const WORD_SORTS = [
  {id:"date-asc", label:"Pořadí"},
  {id:"en-asc",   label:"EN ↑"},
  {id:"en-desc",  label:"EN ↓"},
  {id:"cs-asc",   label:"CS ↑"},
  {id:"cs-desc",  label:"CS ↓"},
  {id:"date-desc",label:"Datum ↓"},
];
export const STAT_COLS = [
  {id:"en-asc",      label:"Slovo ↑"},
  {id:"total-desc",  label:"Procvičeno ↓"},
  {id:"total-asc",   label:"Procvičeno ↑"},
  {id:"correct-desc",label:"Správně ↓"},
  {id:"wrong-desc",  label:"Špatně ↓"},
  {id:"pct-desc",    label:"Úsp. ↓"},
  {id:"pct-asc",     label:"Úsp. ↑"},
  {id:"score-desc",  label:"Skóre ↓"},
];

/* ─── Color palette ──────────────────────────────────────────── */
export const C = {
  bg:"#0b0f16",
  card:"#111622",
  border:"#1e2535",
  gold:"#d4a853",
  goldDim:"#7a5818",
  text:"#f0e6d3",
  textDim:"#9a9080",
  muted:"#5a6070",
  mutedDark:"#3e4455",
  ok:"#5cb88a",
  okBg:"#0f2018",
  okBorder:"#255030",
  err:"#c87070",
  errBg:"#200e0e",
  errBorder:"#4a1a1a",
};

/* ─── Global CSS ─────────────────────────────────────────────── */
export const STYLE = `
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
