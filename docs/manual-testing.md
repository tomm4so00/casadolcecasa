# Partite di prova in locale

## Base riutilizzabile

Esegui `npm run dev:test`, oppure apri `http://127.0.0.1:5173/?test=1` sul server di sviluppo.

Entri direttamente con **Sim di prova**: personaggio creato, stanza assegnata, bisogni al 100%, **200 Đ**, cassaforte con **PIN 123**, zaino inizializzato e guida saltata. Il PIN è scritto davvero nella stanza. Parti dal salone e puoi giocare liberamente.

Ogni apertura o ricarica ricrea la stessa base. Il database di prova usa la sessione del browser e un prefisso di salvataggio dedicato; non usa l'account online o la partita offline normale. Disponibile soltanto con Vite in sviluppo.

Il pannello generico offre solo la scelta dello scenario e il riavvio. Console: `testGame.scenario('police')`, `testGame.scenario('generic')` e `testGame.reset()`.

## Scenario poliziotto

Esegui `npm run dev:test:police`, oppure apri `http://127.0.0.1:5173/?test=police`.

La stessa base viene estesa automaticamente: parti in passeggiata, lontano dal poliziotto, con retata attiva, **20 g d'erba e 3 pillole nello zaino**. Non devi premere un pulsante per preparare la scena. Avvicinati al poliziotto per avviare l'inseguimento.

Solo questo scenario aggiunge **Senza droga**, **Salta attesa 15 min** (dopo il sequestro dell'erba) e **Riavvia prova**. Torni alla base con **Test generico**. Console: `testGame.police()` e `testGame.smoke()`.

## Aggiungere altri scenari

La preparazione comune sta in `src/game/dev-fixture.ts`. Aggiungi le condizioni specifiche in un modulo `dev-<scenario>.ts`, come `dev-police.ts`, e registrane l'avvio e i pulsanti in `dev-tools.ts`. Usa il registro dello zaino e le normali operazioni economiche per mantenere coerenti interfaccia e dati confermati.

Verifica automatica: `npm run test:dev-mode`.
