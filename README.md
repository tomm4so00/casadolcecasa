# Casa dolce casa

Gioco multiplayer da browser: un condominio disegnato in isometrico, dove ognuno ha la sua
stanza, un personaggio da far vivere e dei soldi da guadagnare (o perdere) insieme agli altri.
Si gioca su <https://casadolcecasa.web.app/>, anche dal telefono (si installa come app). Il
vecchio indirizzo, <https://tomm4so00.github.io/casadolcecasa/>, porta lì con il proprio accesso
(pagina del trasloco, `src/game/move-rules.ts`).

TypeScript e Vite per il gioco, Firebase Realtime Database per i dati condivisi, una scena
disegnata su canvas. Niente framework.

## Il gioco in breve

- **Il condominio**: 8 appartamenti da 8 stanze, cioè 64 giocatori per mondo. Oltre al mondo
  di tutti si possono creare mondi privati con un codice (`CASA-X92L`). Ci si può trasferire in
  un'altra stanza o in un altro mondo.
- **Il personaggio**: aspetto e vestiti, bisogni (fame, sonno, igiene, felicità, salute) che
  calano anche a gioco chiuso, più piano, mentre il personaggio vive da solo (autoplay). Chi non
  torna per 10 giorni muore di abbandono e finisce al cimitero. La criogenesi (a pagamento) mette
  il personaggio in pausa durante l'assenza.
- **I soldi**: la cassaforte della stanza (con PIN privato e scassinatori), la banca, quattro
  lavori con turni e minigiochi, la borsa condivisa, aste di quadri, pezzi da collezione, il
  negozio dell'usato, le edizioni limitate, roulette, slot e sfide a morra cinese.
- **Gli altri**: chat, pettegolezzi, relazioni e coppie, dieci personalità, Zero lo
  scassinatore, il cestino con le prove e le multe della polizia, animali, la serra, la luna, la
  sala giochi, la cassetta dei suggerimenti.

Si entra con **Google**, con **email e password** (indirizzo confermato) oppure come **ospite**.
Un personaggio si gioca su un dispositivo alla volta: l'ultimo che lo apre prende la sessione.

## Avvio

Node.js 22.12 o successivo.

```sh
npm run setup:deps
npm run dev
```

Aggiungendo **`?offline=1`** all'indirizzo il gioco usa un database simulato sul dispositivo:
niente arriva al database vero. Le prove automatiche usano questa modalità o gli emulatori di
Firebase (progetto `demo-casadolcecasa`, serve Java 21).

## Comandi

```sh
npm run check              # formattazione, client, test browser e scenari, server e Worker
npm run check:client       # tipi client, test unitari e i due test browser
npm run check:server       # compila il server e le sue regole condivise
npm run check:worker       # controlla i tipi del Worker e delle sue dipendenze
npm run check:dependencies # impedisce nuove dipendenze circolari statiche a esecuzione
npm test                   # test unitari (vitest)
npm run typecheck          # tsc
npm run format             # prettier (la CI fallisce se non è formattato)
npm run test:browser       # prova nel browser: personaggio, stanze, 16 scene, salvataggi
npm run test:dev-mode      # verifica automatica degli scenari di sviluppo
npm run test:cloud         # con gli emulatori: accesso, due browser, sessione, saldo
npm run test:dormancy      # con gli emulatori: la pausa con la scheda nascosta
npm run test:rules         # con gli emulatori: le regole del database
npm run rules:check        # le regole online sono quelle della repo?
npm run rules:deploy       # copia di quelle online in firebase/backups/, poi pubblica
npm run shot -- …          # screenshot di una scena (vedi scripts/shot.mjs)
npm run gamevalue:budget   # abbassa i tetti dei GameValue (any) rimasti
```

L'installazione con `setup:deps` usa i lockfile di client, server e Worker. Per i test browser
su Windows serve Edge; su Linux installare Chromium con `npx playwright install --with-deps chromium`.
Il comando completo si ferma al primo errore e non pubblica nulla. I workflow di `main` e `prova`
richiamano gli stessi controlli prima di pubblicare.

Gli **scenari manuali** (`npm run dev:test`) preparano una partita locale per provare le funzioni.
I **test automatici browser** eseguono azioni e verificano il risultato senza intervento manuale.
I **test con emulatori Firebase** verificano anche dati condivisi e autorizzazioni: richiedono
Java 21 e si eseguono separatamente con i comandi `test:cloud`, `test:rules` e gli altri `test:*`
dedicati. Non sono inclusi in `npm run check`.

Il controllo delle dipendenze copre `src`, `shared`, `server/src` e `worker/src`. Ignora gli
import di soli tipi e quelli dinamici, che non costituiscono dipendenze statiche di avvio.
Gli archi dei cicli già presenti sono registrati in `tests/dependency-cycles-baseline.json`:
nuovi cicli, anche all'interno dei gruppi già esistenti, fanno fallire `check:dependencies`
e quindi il controllo completo e la CI. Dopo aver eliminato dipendenze cicliche eseguire
`node scripts/dependency-cycles.mjs --prune`: aggiorna il limite solo se non sono stati aggiunti
nuovi archi ciclici. Non allargare manualmente il limite per far passare una modifica.

`GameValue` è `any`: il test `tests/gamevalue-budget.test.ts` conta quelli rimasti file per
file e il numero può solo scendere. I file dei soldi e dei salvataggi non ne hanno.

## Com'è fatto

```text
src/game/          il gioco: stato (context.ts), salvataggi (saves.ts), soldi (economy.ts,
                   room-economy.ts), mondo e interazioni (world.ts, interactions.ts), disegno
                   (engine.ts, render/), e un file per ogni meccanica
src/game/*-rules.ts  le regole pure, senza browser, coperte dai test
shared/            regole usate da gioco, server e Worker (mondi, borsa, PIN, paga, Zero…)
server/            manutenzione ogni 15 minuti (market.yml): borsa, morti, PIN, notifiche
worker/            Worker di Cloudflare: criogenesi (Stripe), paga dei turni, indizio di Zero
firebase/          regole del database (database.rules.proposed.json) e script per pubblicarle
tests/             test unitari, prove nel browser, prove delle regole sugli emulatori
scripts/           screenshot, suggerimenti, controlli dei workflow
docs/              come funzionano e come si pubblicano le parti più delicate
```

Le note per chi lavora sul codice (stile, regole del progetto, comandi) sono in
[CLAUDE.md](CLAUDE.md).

I lavori condividono i tipi di turno, oggetto trasportato, postazioni e stato in
`src/game/work-model.ts`. Il controller `jobs.ts` passa un contratto `WorkHost` all'avvio
di ufficio, ospedale e ristorante: per aggiornare HUD, punteggio o messaggi usano quel
contratto, senza importare il controller. Le funzioni pubbliche originali restano disponibili.

## Dati

Il mondo di tutti usa i percorsi di sempre (`sims_rooms_state`, `sims_chat`, …); ogni mondo
privato ha i suoi sotto `worlds/<codice>/`. Account, salvataggi (`sims_saves`), PIN privati
(`sims_safe_pins`) e borsa sono di tutti i mondi. Le regole del database decidono chi può
scrivere cosa: chi le cambia le pubblica prima del gioco, così chi ha ancora la versione
vecchia aperta non può rompere niente.

## Pubblicazione

- **`main`** → il gioco su Firebase Hosting e la pagina del trasloco su GitHub Pages
  (`pages.yml`), dopo i controlli di `checks.yml` e solo se le regole del database online sono
  quelle della repo: altrimenti si ferma e online resta il gioco di prima.
- **`prova`** → il gioco di prova, con il suo progetto Firebase e il suo sito (`prova.yml`).
- Le regole vere si pubblicano a mano (`npm run rules:deploy`), il Worker con
  `npx wrangler deploy` dalla cartella `worker/`.

## Documenti

|                                                               |                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [ambiente-di-prova.md](docs/ambiente-di-prova.md)             | il gioco di prova: progetto, sito, variabili                                               |
| [connessioni.md](docs/connessioni.md)                         | il limite di 100 connessioni e la pausa                                                    |
| [criogenesi.md](docs/criogenesi.md)                           | criogenesi con Stripe e Worker, paga dei turni                                             |
| [pin-privato.md](docs/pin-privato.md)                         | PIN privato, scasso e trasloco dei PIN                                                     |
| [firebase-authentication.md](docs/firebase-authentication.md) | accesso con Google e collegamento dei personaggi vecchi (scritto prima di ospiti ed email) |
| [market-deployment.md](docs/market-deployment.md)             | la borsa condivisa e la manutenzione                                                       |
| [deployment-checklist.md](docs/deployment-checklist.md)       | la prima messa online (Firebase e GitHub Pages)                                            |
| [base-comparison.md](docs/base-comparison.md)                 | da dove viene il codice (versione v8)                                                      |
