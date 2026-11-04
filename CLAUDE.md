# Casa Dolce Casa — note per lavorare sul codice

Gioco multiplayer da browser (TypeScript, Vite, Firebase Realtime Database) con una scena
isometrica disegnata su canvas. Un push su `main` pubblica subito il gioco su GitHub Pages
(`.github/workflows/pages.yml`): fai commit e push solo quando l'utente lo chiede.

## Comandi

```sh
npx vitest run                 # test unitari (le regole pure stanno nei file *-rules.ts)
npm run typecheck              # tsc, con noUnusedLocals e noUnusedParameters
node tests/browser-smoke.mjs   # prova nel browser: 64 stanze, 16 scene, salvataggi
npm run format                 # prettier (la CI fallisce se non è formattato)
npm run shot -- <cartella> '<scatti JSON>' ['<opzioni JSON>']   # screenshot, vedi sotto
```

Prima di un commit: typecheck, vitest, prova nel browser e `npm run format:check`.
Sotto Windows i browser di Playwright usano Edge (`channel: 'msedge'`).

## Screenshot

`scripts/shot.mjs` apre il gioco in modalità prova (`?offline=1`, niente dati verso il server),
crea un personaggio e fotografa le scene richieste:

```sh
node scripts/shot.mjs <cartella> '[{"name":"lab","env":"ingegneria","x":0,"y":200,"title":"Laboratorio"}]' '{"hour":21,"phone":true}'
```

Ogni scatto accetta `env`, `x`/`y` (posizione del giocatore), `title`, `setup` (codice con `game`),
`clip` `[x,y,w,h]` e `wait`. Le opzioni sono `hour`, `phone` e `scale`. Gli screenshot vanno nella
cartella temporanea e si mostrano all'utente leggendoli con Read; non aprirli mai sul suo PC.
Un oggetto di scena che compare come un blocco grigio ha il `kind` non registrato in
`render/registry.ts`.

## Struttura

- `src/game/context.ts`: lo stato globale `game`, condiviso da tutti i moduli.
- `src/game/data/catalogues.ts`: dati delle scene (mobili per ambiente, `ENV_DECOR`,
  `ENV_STYLE`, porte del cortile…).
- `src/game/room-size.ts`: misure di ogni ambiente (`ENV_HALF`, `ENV_GROW`).
- `src/game/world.ts`: movimento, vicinanza agli oggetti, spostamenti tra ambienti.
- `src/game/interactions.ts`: per ogni ambiente (`PLACES`) il testo del pulsante vicino a ogni
  oggetto (`prompt`) e cosa fa (`act`). Un posto o un oggetto nuovo si aggiunge qui.
- `src/game/engine.ts`: il ciclo di disegno di ogni fotogramma.
- `src/game/render/`: disegno. `primitives.ts` (proiezione `isoProject`, `setPlane`),
  `objects.ts` (`box`, `onFace`, mobili di casa), `doors.ts` (la classe `DoorModel` e i tre
  modelli di porta: `PANEL_DOOR`, `PORTONE`, `SERVICE_DOOR`; una porta nuova ne usa uno), un file per zona (`facades`,
  `mall`, `rocket`, `fridge`…) e `registry.ts` (quale funzione disegna ogni mobile, oggetto
  e decorazione a parete).
- `*-rules.ts`: regole senza dipendenze dal browser, coperte dai test.
- `firebase/database.rules.proposed.json`: regole del database. Si pubblicano con
  `node firebase/rules.mjs deploy` (salva prima una copia di quelle online). Da Git Bash il CLI
  di Firebase vuole `MSYS_NO_PATHCONV=1`.
- `server/`: manutenzione periodica (mercato, notifiche), eseguita da `market.yml`.

## Regole del progetto

- Commenti, testi del gioco e messaggi di commit in italiano. Lo stile dei commenti è quello
  del codice intorno: frasi brevi che dicono perché.
- `src/game/source-manifest.json` elenca le funzioni della versione originale v8; il test
  `tests/parity.test.ts` pretende che restino esportate nel modulo indicato. Se ne sposti una,
  aggiorna il suo `module` nel manifest.
- La versione visibile in alto a destra è quella di `package.json` (più le righe 3 e 9 di
  `package-lock.json`): si alza sulle modifiche grosse. `game.GAME_VERSION = 8` è il formato
  dei salvataggi, un'altra cosa.
- Le stanze sono 64 (8 appartamenti da 8): le regole del database pretendono la lista intera,
  così le versioni vecchie del gioco non possono riscriverla più corta.
- Se una modifica tocca il database, prima si pubblicano regole e dati e poi il gioco: chi ha
  ancora la versione vecchia aperta non deve poter rompere niente.
- La stanza privata resta 400×360: i giocatori vi hanno salvato la disposizione dei mobili.
- Con la telecamera che segue il giocatore, lo sfondo fisso (pavimento e pareti) è un'immagine
  grande quanto tutta la corsa della telecamera (`drawStaticScene`).
- In un'anta o in un `setPlane` con `ctx.clip()` serve `ctx.save()`/`restore()`: `resetPlane`
  azzera solo la trasformazione, non il ritaglio.
