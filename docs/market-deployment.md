# Mercato condiviso sul piano gratuito

Il mercato v8 calcolava i prezzi in ogni browser, partendo dal 1 ottobre 2026
con una sequenza deterministica e l'orologio del dispositivo. Non esisteva un
aggiornamento centralizzato. I tre titoli sono attività immaginarie del gioco.

Ora `.github/workflows/market.yml` esegue il programma TypeScript
`server/src/index.ts` ogni 15 minuti e pubblica un unico snapshot in
`sims_market` su Realtime Database. Il browser online ascolta quel percorso e
non genera prezzi. Anche grafici e variazioni giornaliere usano la storia
pubblicata dal processo centrale. La quotazione è riferita al relativo intervallo
di 15 minuti: il workflow parte ai minuti 7, 22, 37 e 52 per evitare i picchi
all'inizio dell'ora.

La transazione confronta l'intervallo già elaborato: una ripetizione o due
esecuzioni concorrenti non producono un secondo aggiornamento nello stesso
intervallo. Il campione casuale viene estratto fuori dal callback della
transazione, che Firebase può ripetere. La prima esecuzione riproduce la sequenza
v8 fino all'intervallo corrente per preservare il valore dei portafogli esistenti;
poi il processo centrale genera i nuovi movimenti. I campioni del grafico coprono
circa 24 ore e sono limitati a 97.

Senza dati validi, senza connessione o con una quotazione più vecchia di 45 minuti,
gli scambi sono sospesi. Il vecchio calcolo non viene usato come ripiego online.
`?offline=1` mantiene una simulazione separata per le prove locali.

## Gratuità e limiti

Firebase rimane sul piano Spark: non occorrono Cloud Functions, Cloud Scheduler,
un server dedicato o l'attivazione della fatturazione. I limiti di Spark su
connessioni, spazio e traffico continuano ad applicarsi.

La repository `tomm4so00/casadolcecasa` è pubblica e usa il runner standard
`ubuntu-latest`, gratuito secondo [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Il workflow non parte nei fork o in repository private. È disabilitato finché
`MARKET_ENABLED` non vale `true`.

GitHub può ritardare le esecuzioni; non è un servizio con scadenze garantite.
I workflow pianificati pubblici vengono disabilitati dopo 60 giorni senza
attività nella repository. Un ritardo prolungato sospende gli scambi invece di
creare prezzi differenti nei browser. Vedere [eventi pianificati](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Attivazione nel progetto reale

Le prove non pubblicano regole e non accedono al database reale. GitHub Pages
pubblica soltanto il frontend; il processo del mercato ha un workflow separato.

1. Nella console Firebase, controllare il progetto `casadolcecasa-6d92a`.
   Un proprietario del progetto deve generare una credenziale Admin SDK da
   Impostazioni progetto → Account di servizio. La chiave privata va inserita
   direttamente nei Secrets di GitHub, mai nel codice o nella chat.
2. In GitHub → Settings → Secrets and variables → Actions → Secrets, creare
   `FIREBASE_MARKET_SERVICE_ACCOUNT` con l'intero JSON della credenziale.
   Chi non ha accesso alle impostazioni deve far completare il passaggio al
   proprietario. Per un progetto diverso impostare anche le variabili
   `VITE_FIREBASE_PROJECT_ID` e `VITE_FIREBASE_DATABASE_URL` già usate dal frontend.
3. Conservare una copia delle regole e dei dati attuali. La proposta completa
   per la versione con accesso Google è in `firebase/database.rules.proposed.json`.
   Va esaminata e pubblicata nel passaggio al nuovo frontend: i vecchi client
   con ingresso senza account non sono compatibili con i salvataggi privati.
4. Seguire [firebase-authentication.md](firebase-authentication.md) per identità,
   richieste di collegamento dei vecchi Sim e permessi. Il processo centrale usa
   l'identità amministrativa `market-publisher`, autorizzata anche alla
   manutenzione degli assenti e della chat. I giocatori non scrivono quotazioni
   o metadati della versione.
5. Pubblicare il codice nella repository principale. In Actions selezionare
   **Update shared stock market**. Impostare la variabile di repository
   `MARKET_ENABLED=true`, poi avviare **Run workflow** sul branch `main`.
6. Controllare l'esito e il campo `sims_market/updatedAt` nella console Firebase.
   Aprire il mercato su due dispositivi e confrontare prezzo e ora.
7. Pubblicare il frontend tramite il workflow Pages predisposto. Finché il
   mercato non è inizializzato, il nuovo frontend sospende gli scambi.

La CI compila il processo centrale ma non lo esegue contro Firebase. Il workflow
pianificato passa la credenziale solo al passo di pubblicazione, non ai comandi di
installazione. `firebase.json` non distribuisce regole o funzioni e nessuna
credenziale amministrativa è inclusa nel bundle del gioco.

## Acquisti e portafogli

Saldo, proprietà degli oggetti e investimenti sono confermati insieme nella
transazione della stanza, sotto `sims_rooms_state/{roomIndex}/economy`. Quando il
campo non esiste, la prima operazione importa gli acquisti e gli investimenti
del salvataggio v8. In seguito lo stato della stanza è quello autorevole per
questi beni, anche se una chiusura interrompe il successivo autosalvataggio.
Le copie nel salvataggio v8 restano disponibili per la compatibilità.

Le quotazioni sono calcolate centralmente. Gli ordini e le altre operazioni
economiche restano transazioni del client: non è un sistema completo contro la
manipolazione dei saldi e non sostituisce la revisione di autenticazione e regole
delle tabelle legacy. I vecchi client v8 vanno aggiornati.

## Prove

`npm test` verifica aggiornamenti ripetuti, orologi diversi, dati corrotti,
storia limitata, acquisti doppi, trasferimenti e saldo insufficiente.
`npm run test:cloud` usa solo gli emulatori con progetto `demo-casadolcecasa`:
esegue il vero programma centrale, verifica le ripetizioni dello stesso
intervallo, le quotazioni identiche su due browser e il rifiuto di scritture al
mercato da un giocatore autenticato. Le prove non accedono al progetto reale.
