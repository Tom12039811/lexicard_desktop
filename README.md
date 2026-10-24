# LexiCard

Webová aplikace na učení slovíček (čeština ↔ angličtina) s opakováním v krabičkách,
knihovnou veřejných balíčků, žebříčkem a synchronizací mezi zařízeními.

- **Frontend:** React 19 + Vite, nasazení na Vercel (větev `supabase`)
- **Backend:** Supabase (přihlášení, PostgreSQL, RLS)
- **Offline:** data v `localStorage`, service worker (`public/sw.js`), instalace na plochu (PWA)

## Spuštění lokálně
```bash
npm install
cp .env.example .env      # doplnit VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY
npm run dev               # vývojový server
npm run build             # produkční sestavení do dist/
npm run lint              # kontrola kódu
npm test                  # testy (vitest)
```

## Struktura
| Soubor | Obsah |
|---|---|
| `src/App.jsx` | stav aplikace, učení, synchronizace, směrování obrazovek |
| `src/HomeScreen.jsx` / `DeckScreen.jsx` / `StudyScreen.jsx` | hlavní obrazovky |
| `src/LibraryScreen.jsx` / `LeaderboardScreen.jsx` / `AuthScreen.jsx` | knihovna, žebříček, přihlášení |
| `src/modals.jsx` | dialogová okna |
| `src/utils.js` | krabičky, výběr slov do kola, vyhodnocení odpovědí, levely, řeč |
| `src/sync.js` | komunikace se Supabase (synchronizace, mazání, stránkování) |
| `src/syncMerge.js` | čistá logika slučování dat (bez sítě, testovaná) |
| `src/hooks.js` | `usePersistentState`, `useIsMobile` |
| `src/constants.js` | barvy, styly, levely, výchozí data |
| `tests/` | testy logiky a simulace synchronizace dvou zařízení |
| `supabase/` | SQL migrace – spouštět v pořadí F4 → F5 |

## Synchronizace (stručně)
Úplná synchronizace při startu, rychlá po změnách (20 s), po návratu do aplikace a po obnovení
připojení. Mazání je „měkké“ (`deleted_at`), aby se propsalo na všechna zařízení.
Detail viz komentář v `src/sync.js`.
