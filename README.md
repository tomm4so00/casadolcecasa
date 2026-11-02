# Casa dolce casa

Versione modulare del gioco completo proveniente da **`tomm4so00/casadolcecasa4`**,
`GAME_VERSION = 8`, commit `8f15c85353196c899edd41770e953900cb0d081d`.
Il confronto che identifica la base corretta è in [docs/base-comparison.md](docs/base-comparison.md).

## Avvio

Node.js 22.12 o successivo; per gli strumenti Firebase è consigliata una versione LTS.

```sh
npm ci
npm run dev
```

Apri l'indirizzo mostrato dal terminale. Per provare senza leggere o scrivere
nel database reale, aggiungi **`?offline=1`** all'indirizzo. Le prove automatiche
usano questa modalità oppure gli emulatori con progetto `demo-casadolcecasa`.

```sh
npm run build
npm run preview
```

La cartella da pubblicare è `dist/`. Non caricare `node_modules/` o i sorgenti
TypeScript direttamente come sito statico.

## Cosa comprende

Sono presenti le funzioni della base v8: quattro appartamenti e 32 stanze,
cassaforte e PIN, negozi di mobili e vestiti, editor del personaggio, quattro
lavori con turni e minigiochi, investimenti simulati, chat globale e interazioni
tra giocatori, classifiche, bisogni nel tempo, caffè, doccia e sonno, audio,
illuminazione e ambienti, dipendenza, morte e cimitero.
Il sistema missioni è mantenuto, con catalogo vuoto come nella v8 originale.

Il bilanciamento è quello della v8: ad esempio il recupero completo del riposo
richiede otto ore reali prima degli eventuali bonus del letto. Al riposo completo
il personaggio si sveglia automaticamente, anche a gioco aperto. Il tempo passa
anche durante l'assenza tramite `catchUpOffline`; vengono aggiornati anche gli
altri bisogni e lo stesso bonus di salute del gioco aperto. Il sonno ancora
in corso viene ripreso nella propria stanza al rientro. La versione precedente del prototipo usava valori differenti.

## Salvataggi e Firebase

La configurazione pubblica del progetto Firebase originale della v8 è conservata
in `src/firebase-config.ts`. Le variabili `VITE_FIREBASE_*` permettono di usare
un altro progetto; devono essere impostati tutti e cinque i valori di `.env.example`.
`?offline=1` isola completamente le prove dal database online.

Sono mantenuti identità e percorsi originali:

```text
sims_saves/{playerId}             progressi del personaggio
sims_rooms_state                  stanze, proprietari, PIN e cassaforti
sims_online_players/{playerId}    presenza temporanea
sims_leaderboard                  classifiche
sims_graveyard                    personaggi deceduti
sims_chat                        chat globale
```

Le altre tabelle sociali e i relativi nomi sono conservati nel codice di origine.
Non viene convertito il database in `characters/{uid}`: quel formato apparteneva
al prototipo precedente e avrebbe escluso molti dati della v8.
Le regole del database reale rimangono gestite separatamente; `firebase.json`
non include un comando di pubblicazione delle vecchie regole del prototipo.
La compatibilità con i dati esistenti non equivale a un audit delle regole in uso.

L'accesso online richiede **Google**, senza password separata del gioco. Ogni
account è collegato a un Sim; i salvataggi locali online sono separati per
personaggio. Per i Sim v8 precedenti, il codice permette di richiedere un
collegamento al gestore, senza accedere automaticamente ai progressi altrui.
Le copie locali precedenti sono conservate.

Il file `firebase/database.rules.proposed.json` contiene la politica con accesso
Google obbligatorio e salvataggi privati. Procedura, collegamenti dei vecchi Sim
e limiti delle meccaniche condivise sono in
[docs/firebase-authentication.md](docs/firebase-authentication.md).
La proposta va pubblicata insieme alla nuova versione; non viene distribuita
automaticamente da `firebase.json`.

Un blocco in `sims_sessions/{playerId}` e Web Locks impediscono di aprire lo stesso
personaggio contemporaneamente in due sessioni di questo client. Il blocco cloud
scade dopo 45 secondi senza rinnovo. I vecchi client v8 non conoscono questo blocco;
questa estensione non modifica automaticamente le regole del database.

Il salvataggio distingue copia locale e conferma cloud. **Salva ed esci** attende
la scrittura prima di tornare all'ingresso, senza ricaricare la pagina, e chiude
timer, input, anteprime e listener. In modalità offline anche il database simulato
è salvato sul dispositivo, inclusi cassaforte, stanze e chat; la presenza non viene
ricaricata come se un giocatore fosse ancora online.
La cancellazione dei dati del browser elimina le sole copie locali.

Se non esiste già un salvataggio v8, il formato locale del precedente prototipo
`casadolcecasa.save.v1` o `casadolcecasa.save.v2.guest` viene importato, conservando
gli originali. Le posizioni dei mobili, i bisogni, i soldi e l'inventario vengono
convertiti nel formato v8. Un salvataggio v8 esistente non viene sovrascritto da
questa importazione.

## Struttura

```text
src/main.ts                    ingresso dell'applicazione
src/firebase-config.ts         configurazione pubblica Firebase e variabili ambiente
src/game/
  application.ts, lifetime.ts  montaggio e chiusura del gioco
  accounts.ts, runtime.ts      accesso, sessione e collegamenti con il browser
  database.ts                 contratto database e simulazione locale
  save-model.ts, saves.ts      formato, importazione e salvataggi v8
  context.ts, models.ts        stato tipizzato di personaggio, sessione e vista
  initialize.ts               inizializzazione ordinata
  economy.ts, room-economy.ts  soldi, acquisti e portafogli confermati insieme
  simulation.ts, needs-rules.ts calcolo comune dei bisogni durante gioco e assenza
  ui-actions.ts, ui-bindings.ts eventi senza funzioni globali o onclick HTML
  market-client.ts            lettura delle quotazioni condivise
  data/catalogues.ts          cataloghi, ambienti e dati statici
  character.ts                vestiti, armadio e negozi
  world.ts, jobs.ts            interazioni, movimenti, carriera e minigiochi
  needs.ts                    bisogni, salute, caffè e assenza
  social.ts, chat.ts           interazioni e messaggi
  business.ts, missions.ts     investimenti simulati e classifiche/missioni
  audio.ts                    suoni e musica
  interface.ts, view.html      schermate e dialoghi
  render/                     geometria, mobili, ambienti e avatar
  source-manifest.json         provenienza di tutte le funzioni v8
src/storage/tab-lock.ts        blocco fra schede del browser
css/style.css                  stile del gioco completo
tests/                        test unitari, parità e prove browser
```

La migrazione conserva la provenienza delle funzioni v8, documentando anche quelle
sostituite dai servizi condivisi. Il compilatore TypeScript resta in modalità
`strict`. Personaggio, sessione e vista sono separati in `game.player`,
`game.session` e `game.view`; salvataggi, stanze, cataloghi, portafogli, messaggi e
dialoghi hanno contratti espliciti. I dati caricati sono validati prima dell'uso.
Le parti grafiche e alcune azioni legacy usano ancora `GameValue`: la tipizzazione
dettagliata del vecchio renderer rimane un lavoro successivo.

Le azioni dell'interfaccia usano una lista esplicita di comandi e un listener
sul contenitore: le 304 funzioni del vecchio monolite non vengono più esposte
su `window`. Non ci sono più attributi HTML `onclick`.

## Mercato condiviso

Le quotazioni online arrivano da `sims_market`, aggiornato ogni 15 minuti da
un workflow GitHub Actions. I browser leggono gli stessi valori senza ricalcolare il
mercato. Mancanza di connessione o prezzi più vecchi di 45 minuti sospendono gli
scambi. La simulazione locale resta isolata con `?offline=1`.

Il workflow va attivato separatamente: richiede una credenziale Firebase nei
Secrets di GitHub e regole che consentano solo al processo centrale di scrivere
le quotazioni. Firebase resta sul piano gratuito Spark; non servono Cloud
Functions o un server dedicato. GitHub può ritardare gli aggiornamenti. Procedura e limiti sono in
[docs/market-deployment.md](docs/market-deployment.md).

Saldo e beni acquistati sono confermati insieme nella stanza. Il portafoglio
v8 viene importato alla prima operazione; i nuovi acquisti non dipendono dalla
riuscita di un secondo salvataggio per evitare di perdere l'oggetto pagato.

## Verifiche

```sh
npm run typecheck
npm ci --prefix server
npm run build:server
npm run format:check
npm test
npm run test:browser
npm run test:cloud
```

`test:browser` verifica creazione del personaggio, stanze, acquisti, investimenti,
lavori, chat, rendering dei 16 ambienti e persistenza dopo uscita/rientro e reload.
`test:cloud` usa solo gli emulatori per accesso, recupero su un altro browser,
saldo della cassaforte, blocco della seconda sessione e riconnessione.
Richiede Java 21 nel `PATH`. I test browser usano Edge su Windows; su altri
sistemi installa Chromium con `npx playwright install chromium`.
Il popup Google reale va verificato sul progetto e dominio configurati.

Usa `npm run format` per applicare la formattazione comune.

## Pubblicazione automatica

La repository di lavoro e pubblicazione è `tomm4so00/casadolcecasa`:
<https://tomm4so00.github.io/casadolcecasa/>.
`casadolcecasa4` rimane la fonte della base v8, non la destinazione predefinita.
In **Settings → Pages → Source** scegli **GitHub Actions**. Il workflow
`.github/workflows/pages.yml` controlla formattazione, test e tipi, compila il gioco
e pubblica solo `dist/` a ogni push su `main`. Ricava il percorso corretto degli
asset dalle impostazioni di Pages. Può essere avviato anche con **Run workflow**.

Le variabili Firebase possono essere definite in **Settings → Secrets and
variables → Actions → Variables**, con i nomi di `.env.example`; se non vengono
impostate, viene usato il progetto originale v8. Non inserire chiavi amministrative.
Il dominio `tomm4so00.github.io` deve essere autorizzato in Authentication per Google.
Il workflow non pubblica né modifica regole del database.
