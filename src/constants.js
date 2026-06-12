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

/* ─── Color palette (dark — výchozí) ────────────────────────── */
export const C = {
  bg:         "var(--lc-bg)",
  card:       "var(--lc-card)",
  border:     "var(--lc-border)",
  gold:       "var(--lc-gold)",
  goldDim:    "var(--lc-goldDim)",
  text:       "var(--lc-text)",
  textDim:    "var(--lc-textDim)",
  muted:      "var(--lc-muted)",
  mutedDark:  "var(--lc-mutedDark)",
  ok:         "var(--lc-ok)",
  okBg:       "var(--lc-okBg)",
  okBorder:   "var(--lc-okBorder)",
  err:        "var(--lc-err)",
  errBg:      "var(--lc-errBg)",
  errBorder:  "var(--lc-errBorder)",
};

/* ─── Global CSS ─────────────────────────────────────────────── */
export const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

  /* ── Dark theme (výchozí) ── */
  :root{
    --lc-bg:#0b0f16;
    --lc-card:#111622;
    --lc-border:#1e2535;
    --lc-gold:#d4a853;
    --lc-goldDim:#7a5818;
    --lc-text:#f0e6d3;
    --lc-textDim:#9a9080;
    --lc-muted:#5a6070;
    --lc-mutedDark:#3e4455;
    --lc-ok:#5cb88a;
    --lc-okBg:#0f2018;
    --lc-okBorder:#255030;
    --lc-err:#c87070;
    --lc-errBg:#200e0e;
    --lc-errBorder:#4a1a1a;
    --lc-cardAlt:#0e1420;
    --lc-cardSub:#131c2e;
    --lc-cardSubBorder:#2a3448;
    --lc-inputBg:#0e1320;
    --lc-inputBorder:#2e3447;
    --lc-inputPlaceholder:#2e3550;
    --lc-headerBg:#0b0f16;
    --lc-headerBorder:#1a1f2e;
    --lc-modalBg:#111e30;
    --lc-modalBorder:#2a3650;
    --lc-dropBg:#111e30;
    --lc-dropHover:#161e30;
    --lc-selBg:#1a2a45;
    --lc-selBorder:#3a5080;
    --lc-xpTrack:#1a2030;
    --lc-folderBg:#0e1420;
    --lc-btnAddBg:#0e1520;
    --lc-btnAddBorder:#2a3650;
    --lc-streakBg:#1a1608;
    --lc-streakBorder:#3a3010;
    --lc-progressTrack:#161e30;
    --lc-dueBg:#3a1a08;
    --lc-dueBorder:#8a4020;
    --lc-dueText:#d08050;
    --lc-statBg1:#121a2e;
    --lc-statBg2:#1a1028;
    --lc-statBg3:#1a1008;
    --lc-statBg4:#0a1410;
    --lc-statBg5:#1a1608;
    --lc-wordDelBg:#5a1a1a;
    --lc-wordDelColor:#ff8080;
    --lc-wordDelHover:#8b2020;
    --lc-scrollTrack:#0b0f16;
    --lc-scrollThumb:#2a3040;
    --lc-flashOk1:#0f2018;
    --lc-flashOk2:#1a4030;
    --lc-flashWarn1:#1e1a0a;
    --lc-flashWarn2:#3a3010;
    --lc-flashBad1:#200e0e;
    --lc-flashBad2:#3a1a1a;
    --lc-zoneDrag:#252e42;
    --lc-zoneHover:#1a2035;
    --lc-zoneHoverBorder:#4a5878;
    --lc-ansBtn:#131c2e;
    --lc-ansBtnBorder:#2a3448;
    --lc-ansBtnColor:#8a96a8;
    --lc-ansBtnHover:#1a2540;
    --lc-ansBtnHoverBorder:#3a4a60;
    --lc-ansBtnHoverColor:#c0cad8;
    --lc-micBg:#0e1520;
    --lc-overlayBg:rgba(5,8,14,.85);
    --lc-shadow:rgba(0,0,0,.6);
  }

  /* ── Light theme ── */
  [data-theme="light"]{
    --lc-bg:#f4f0ea;
    --lc-card:#ffffff;
    --lc-border:#ddd8d0;
    --lc-gold:#b8832a;
    --lc-goldDim:#c8a060;
    --lc-text:#2a2420;
    --lc-textDim:#6a6058;
    --lc-muted:#8a8075;
    --lc-mutedDark:#b0a898;
    --lc-ok:#2a7848;
    --lc-okBg:#eaf4ee;
    --lc-okBorder:#90c8a0;
    --lc-err:#b03030;
    --lc-errBg:#fdf0f0;
    --lc-errBorder:#d0a0a0;
    --lc-cardAlt:#f0ece4;
    --lc-cardSub:#fafaf8;
    --lc-cardSubBorder:#ddd8d0;
    --lc-inputBg:#ffffff;
    --lc-inputBorder:#c8c0b8;
    --lc-inputPlaceholder:#c0b8b0;
    --lc-headerBg:#f4f0ea;
    --lc-headerBorder:#ddd8d0;
    --lc-modalBg:#ffffff;
    --lc-modalBorder:#ddd8d0;
    --lc-dropBg:#ffffff;
    --lc-dropHover:#f5f0e8;
    --lc-selBg:#f0e8d8;
    --lc-selBorder:#c8b890;
    --lc-xpTrack:#ede8e0;
    --lc-folderBg:#f5f0e8;
    --lc-btnAddBg:#fffdf9;
    --lc-btnAddBorder:#c8b890;
    --lc-streakBg:#fdf6e8;
    --lc-streakBorder:#e8d8b0;
    --lc-progressTrack:#ede8e0;
    --lc-dueBg:#fff3ec;
    --lc-dueBorder:#e8b080;
    --lc-dueText:#c07040;
    --lc-statBg1:#eef2f8;
    --lc-statBg2:#f5f0fc;
    --lc-statBg3:#fdf6e8;
    --lc-statBg4:#eef8f2;
    --lc-statBg5:#fdf6e8;
    --lc-wordDelBg:#fde8e8;
    --lc-wordDelColor:#c04040;
    --lc-wordDelHover:#f8d0d0;
    --lc-scrollTrack:#f4f0ea;
    --lc-scrollThumb:#d0c8c0;
    --lc-flashOk1:#eaf4ee;
    --lc-flashOk2:#c8e8d0;
    --lc-flashWarn1:#fdf6e8;
    --lc-flashWarn2:#f5e0b0;
    --lc-flashBad1:#fdf0f0;
    --lc-flashBad2:#f8d8d8;
    --lc-zoneDrag:#e8e0d8;
    --lc-zoneHover:#f0e8d8;
    --lc-zoneHoverBorder:#c8b890;
    --lc-ansBtn:#fafaf8;
    --lc-ansBtnBorder:#ddd8d0;
    --lc-ansBtnColor:#6a6058;
    --lc-ansBtnHover:#f0ece4;
    --lc-ansBtnHoverBorder:#c8b890;
    --lc-ansBtnHoverColor:#2a2420;
    --lc-micBg:#fffdf9;
    --lc-overlayBg:rgba(180,170,160,.7);
    --lc-shadow:rgba(0,0,0,.12);
  }

  html{background:var(--lc-bg);height:-webkit-fill-available;}
  body{background:var(--lc-bg);overflow-x:hidden;max-width:100vw;min-height:100vh;min-height:-webkit-fill-available;overscroll-behavior:none;-webkit-overflow-scrolling:touch;}
  #root,#__next{background:var(--lc-bg);min-height:100vh;min-height:-webkit-fill-available;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes cardIn{from{opacity:0;transform:scale(.97) translateY(5px)}to{opacity:1;transform:scale(1)}}
  @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,168,83,.5)}55%{box-shadow:0 0 0 18px rgba(212,168,83,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes wave{0%,100%{height:5px}50%{height:18px}}
  @keyframes overlayIn{from{opacity:0}to{opacity:1}}
  @keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes flashOk{0%{background:var(--lc-flashOk1)}50%{background:var(--lc-flashOk2)}100%{background:var(--lc-flashOk1)}}
  @keyframes flashWarn{0%{background:var(--lc-flashWarn1)}50%{background:var(--lc-flashWarn2)}100%{background:var(--lc-flashWarn1)}}
  @keyframes flashBad{0%{background:var(--lc-flashBad1)}50%{background:var(--lc-flashBad2)}100%{background:var(--lc-flashBad1)}}
  .fade-up{animation:fadeUp .22s ease both}
  .card-in{animation:cardIn .28s ease both}
  .mic-on{animation:micPulse 1.2s ease-in-out infinite}
  .flash-ok{animation:flashOk .4s ease}
  .flash-warn{animation:flashWarn .4s ease}
  .flash-bad{animation:flashBad .4s ease}
  .btn{cursor:pointer;transition:filter .15s,transform .1s;border:none;font-family:'Lora',serif;background:transparent;}
  .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
  .btn:active{transform:translateY(0) scale(.97)}
  .inp{width:100%;background:var(--lc-inputBg);border:1.5px solid var(--lc-inputBorder);color:var(--lc-text);border-radius:10px;padding:10px 13px;font-size:15px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp:focus{border-color:var(--lc-gold)}.inp::placeholder{color:var(--lc-inputPlaceholder)}
  .inp-sm{width:100%;background:var(--lc-inputBg);border:1.5px solid var(--lc-inputBorder);color:var(--lc-text);border-radius:8px;padding:8px 11px;font-size:14px;font-family:'Lora',serif;outline:none;transition:border-color .2s;}
  .inp-sm:focus{border-color:var(--lc-gold)}.inp-sm::placeholder{color:var(--lc-inputPlaceholder)}
  .tdinp{width:100%;background:transparent;border:none;color:var(--lc-textDim);font-size:13px;font-family:'Lora',serif;outline:none;padding:8px 10px;border-radius:6px;transition:background .15s;}
  .tdinp:focus{background:var(--lc-cardAlt);}.tdinp::placeholder{color:var(--lc-inputPlaceholder)}
  .wv{width:4px;border-radius:2px;background:var(--lc-gold);display:inline-block;margin:0 2px;}
  .wv:nth-child(1){animation:wave .8s ease-in-out infinite 0s}.wv:nth-child(2){animation:wave .8s ease-in-out infinite .13s}
  .wv:nth-child(3){animation:wave .8s ease-in-out infinite .26s}.wv:nth-child(4){animation:wave .8s ease-in-out infinite .39s}
  .wv:nth-child(5){animation:wave .8s ease-in-out infinite .52s}
  .overlay{position:fixed;inset:0;background:var(--lc-overlayBg);display:flex;align-items:center;justify-content:center;z-index:100;animation:overlayIn .18s ease;padding:1rem;}
  .modal{background:var(--lc-modalBg);border:1px solid var(--lc-modalBorder);border-radius:20px;padding:1.75rem;width:100%;max-width:480px;animation:modalIn .22s ease;max-height:90vh;overflow-y:auto;}
  .modal-wide{max-width:860px;}
  .stat-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;}
  .word-row{display:grid;grid-template-columns:26px 1fr 1fr 1.5fr 1fr 26px;gap:4px;}
  .word-hdr{display:grid;grid-template-columns:26px 1fr 1fr 1.5fr 1fr 26px;gap:4px;}
  /* mob-expand: skryto na desktopu, viditelne na mobilu */
  .mob-expand-panel{display:none;}
  .mob-has-extra{display:none;}
  .mob-expand-btn{cursor:default;}
  @media(max-width:640px){
    .stat-grid{grid-template-columns:repeat(3,1fr)!important;}
    .word-row{grid-template-columns:22px 1fr 1fr 22px!important;}
    .word-hdr{grid-template-columns:22px 1fr 1fr 22px!important;}
    .col-ex,.col-syn{display:none!important;}
    .deck-hdr{flex-wrap:wrap;gap:6px!important;}
    .mob-expand-panel{display:flex!important;}
    .mob-has-extra{display:flex!important;}
    .mob-expand-btn{cursor:pointer!important;font-weight:700;}
  }
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--lc-scrollTrack)}::-webkit-scrollbar-thumb{background:var(--lc-scrollThumb);border-radius:2px}
`;
