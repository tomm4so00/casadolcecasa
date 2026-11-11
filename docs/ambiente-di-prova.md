# L'ambiente di prova

Un secondo gioco, con il suo progetto Firebase (database, accessi, sito) e il suo Worker, dove
provare con 2 o 3 amici prima di pubblicare per tutti.

|                     | Gioco di tutti                                                                    | Gioco di prova                                                         |
| ------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ramo                | `main`                                                                            | `prova`                                                                |
| sito                | GitHub Pages (`tomm4so00.github.io/casadolcecasa/`)                               | Firebase Hosting (`<id-prova>.web.app`)                                |
| workflow            | `pages.yml`                                                                       | `prova.yml`                                                            |
| regole del database | a mano (`npm run rules:deploy`); la pubblicazione si ferma se online sono diverse | le pubblica il workflow, con copia di quelle di prima tra gli allegati |
| manutenzione        | `market.yml`, lavoro `update`                                                     | `market.yml`, lavoro `update-prova`                                    |
| Worker              | `casadolcecasa-criogenesi`                                                        | `casadolcecasa-prova`                                                  |

Nel gioco di prova accanto alla versione c'è la scritta **PROVA**, la criogenesi non si compra e
non partono messaggi sul gruppo Telegram. Il database di prova parte vuoto: il primo che entra
crea le 64 stanze; gli amici creano un personaggio nuovo.

## Come si lavora

1. Le modifiche si uniscono nel ramo `prova` e si fa push: in pochi minuti il gioco di prova è
   aggiornato (regole comprese).
2. Si prova con gli amici sul sito di prova.
3. Si pubblicano le regole vere (`npm run rules:deploy`), poi si unisce `prova` in `main`. Se le
   regole online non sono quelle della repo, `pages.yml` si ferma prima di pubblicare: online
   resta il gioco di prima. Si pubblicano le regole e si rilancia il workflow (Actions → il run
   fermo → Re-run jobs).

## Da fare una volta

### 1. Console di Firebase: il progetto di prova

1. <https://console.firebase.google.com> → **Aggiungi progetto** → nome `casadolcecasa-prova`
   (l'id lo sceglie Firebase, per esempio `casadolcecasa-prova-1a2b3`: annotalo). Google
   Analytics: no. Piano: Spark (gratuito).
2. **Realtime Database** → Crea database → Stati Uniti (come quello vero) → modalità bloccata.
3. **Authentication** → Inizia → Metodo di accesso: attiva **Google**, **Anonimo** ed
   **Email/password**, come nel progetto vero. Tra i domini autorizzati `<id>.web.app` e
   `<id>.firebaseapp.com` ci sono già.
4. **Impostazioni progetto** (⚙️) → Le tue app → **</>** (app web) → nome "Casa dolce casa
   prova". Copia i valori di `firebaseConfig`: `apiKey`, `authDomain`, `databaseURL`,
   `projectId`, `appId`, `messagingSenderId`. Sono pubblici: vanno nelle variabili, non nei
   secrets.
5. **Hosting** → Inizia → avanti fino alla fine (i comandi li esegue GitHub).
6. **Impostazioni progetto** → **Account di servizio** → **Genera nuova chiave privata**: si
   scarica un file JSON. Non va mai nel codice né in chat: solo nei secrets (punto 2) e nel
   Worker (punto 3). Poi puoi cancellarlo dal computer.
7. <https://console.cloud.google.com/iam-admin/iam?project=casadolcecasa-prova> → la riga
   `firebase-adminsdk-…` → matita → **Aggiungi ruolo** → **Firebase Hosting Admin** → Salva.
   Serve a GitHub per pubblicare il sito di prova.

### 2. GitHub

Repo → **Settings → Secrets and variables → Actions**.

Scheda **Variables** → New repository variable, una per riga:

| Nome                                 | Valore                                                 |
| ------------------------------------ | ------------------------------------------------------ |
| `PROVA_FIREBASE_API_KEY`             | `apiKey`                                               |
| `PROVA_FIREBASE_AUTH_DOMAIN`         | `authDomain`                                           |
| `PROVA_FIREBASE_DATABASE_URL`        | `databaseURL`                                          |
| `PROVA_FIREBASE_PROJECT_ID`          | `projectId`                                            |
| `PROVA_FIREBASE_APP_ID`              | `appId`                                                |
| `PROVA_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`                                    |
| `PROVA_GAME_URL`                     | `https://casadolcecasa-prova.web.app/`                 |
| `PROVA_WORKER_URL`                   | l'indirizzo del Worker di prova (punto 3)              |
| `PROVA_MARKET_ENABLED`               | `true` (accende la manutenzione del database di prova) |

Scheda **Secrets** → New repository secret:

| Nome                             | Valore                                         |
| -------------------------------- | ---------------------------------------------- |
| `PROVA_FIREBASE_SERVICE_ACCOUNT` | tutto il contenuto del file JSON del punto 1.6 |

Per il controllo delle regole su `main` non serve niente di nuovo: usa il secret che c'è già,
`FIREBASE_MARKET_SERVICE_ACCOUNT`. Se il passo "Le regole online sono quelle della repo?" dice
che non ha il permesso, si genera una chiave nuova del progetto vero (come al punto 1.6) e la si
mette al posto di quella.

Infine il ramo `prova`, creato da `main` (`git push origin main:prova`): da lì in poi ogni push
su `prova` pubblica il gioco di prova.

### 3. Cloudflare: il Worker di prova

Nessun passo nella dashboard. In `worker/wrangler.toml`, sezione `[env.prova.vars]`, si mette
l'id del progetto di prova al posto di `casadolcecasa-prova`, poi dal computer:

```sh
cd worker
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --env prova < percorso/della/chiave.json
npx wrangler deploy --env prova
```

`wrangler deploy` stampa l'indirizzo (`https://casadolcecasa-prova.<nome>.workers.dev`): va
nella variabile `PROVA_WORKER_URL`. Il secondo Worker è gratis e condivide le 100.000
richieste al giorno del piano gratuito.

### 4. Stripe

Niente: nel gioco di prova la criogenesi non si compra, e il Worker di prova non ha il segreto
del webhook (rifiuta ogni avviso).

## Se qualcosa non va

- **`prova.yml` si ferma a "Configurazione del progetto di prova"**: manca una variabile, oppure
  una punta al progetto, al Worker o al sito veri, oppure la chiave è di un altro progetto. Il
  messaggio dice quale.
- **"Regole del database di prova" o "Sito di prova" senza permessi**: la chiave non ha i ruoli
  (punto 1.7).
- **`pages.yml` si ferma a "Le regole online sono quelle della repo?"**: è il controllo che
  funziona. `npm run rules:deploy`, poi Re-run jobs.
