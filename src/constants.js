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
