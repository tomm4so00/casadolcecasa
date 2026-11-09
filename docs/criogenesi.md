# Criogenesi: come metterla in funzione

La criogenesi si compra con Stripe: un pass da 30 giorni a 1,99€ oppure un pass a vita a 9,99€.
Mentre il pass è attivo, il personaggio va in capsula quando il giocatore esce dal gioco:
bisogni, animali e conto alla rovescia delle 80 ore si fermano. Se si ricomprano i 30 giorni
prima della scadenza, i giorni si sommano. Il pass a vita è un pass che scade il 31/12/9999
(`CRYO_FOREVER_UNTIL`): così gioco, server e regole del database non hanno casi speciali.

## Come funziona

1. Nel profilo, **🧊 Criogenesi** apre il Payment Link di Stripe con
   `client_reference_id = uid` dell'account Firebase.
2. Dopo il pagamento Stripe chiama il **Worker di Cloudflare** `casadolcecasa-criogenesi`
   (`worker/`). Il Worker controlla la firma di Stripe, accetta solo il Payment Link della
   criogenesi e, in una sola transazione, allunga il pass in `sims_cryo/<uid>` e ne registra la
   ricevuta in `sims_cryo/<uid>/payments/<sessione>`. Se Stripe manda di nuovo lo stesso avviso,
   la ricevuta c'è già e non si aggiungono giorni.
3. Il Worker scrive nel database con la chiave di un account di servizio, ma presentandosi come
   l'utente ridotto `cryo-webhook`: le regole gli permettono solo `sims_cryo`.
4. Il gioco legge il pass all'avvio e quando cambia. La manutenzione (`server/`) lo legge
   per le morti per assenza e per gli avvisi.

Le regole del tempo sono in `shared/cryo-rules.ts`, usato da gioco, server e Worker.
Il piano gratuito di Cloudflare (100.000 richieste al giorno) basta e non chiede una carta.

## Da fare una volta

Prova tutto prima in **modalità test** di Stripe (interruttore in alto nella dashboard).
Prodotti, link, webhook e segreti di test sono diversi da quelli veri: per i pagamenti veri si
rifanno i punti 2, 4 e 5 in modalità reale.

### 1. Cloudflare

Crea un account gratuito su <https://dash.cloudflare.com/sign-up>, poi collega il computer:

```sh
cd worker
npm install
npx wrangler login
```

### 2. Stripe: prodotto e Payment Link

1. Catalogo prodotti → **Aggiungi prodotto**: "Criogenesi 30 giorni", **pagamento singolo**,
   1,99 EUR. Per il pass a vita un secondo prodotto, "Criogenesi a vita", 9,99 EUR, con il suo
   Payment Link: si rifanno i punti 2 e 3 e l'id va in `STRIPE_CRYO_LIFETIME_LINK`, l'indirizzo
   in `CRYO_LIFETIME_LINK`.

   Il prezzo di un Payment Link non si cambia: per un prezzo nuovo si fa un link nuovo. Il link
   vecchio si disattiva, ma il suo id resta in `wrangler.toml`, dopo una virgola: chi ha pagato
   col vecchio ha comunque il suo pass.

2. Payment Links → **Nuovo**, con quel prodotto. In "Dopo il pagamento" scegli **Non mostrare la
   pagina di conferma** → reindirizza a `https://tomm4so00.github.io/casadolcecasa/`.
3. Salva e annota:
   - l'indirizzo (`https://buy.stripe.com/…`): va nel gioco (punto 6);
   - l'id (`plink_…`, nell'indirizzo della pagina del link nella dashboard): va in
     `worker/wrangler.toml`, in `STRIPE_CRYO_PAYMENT_LINK`.

Per gli incassi Stripe chiede un IBAN intestato a te: va bene anche quello della Postepay
Evolution.

### 3. Firebase: la chiave per il Worker

Console Firebase → ⚙️ Impostazioni progetto → **Account di servizio** → **Genera nuova chiave
privata**. Si scarica un file JSON: tienilo al sicuro, non va mai su git né in chat.

```sh
cd worker
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT < percorso/della/chiave.json
```

Poi puoi cancellare il file: la chiave resta solo nei segreti del Worker.

### 4. Pubblica le regole e il Worker

```sh
node firebase/rules.mjs deploy      # dalla cartella del progetto: regole con sims_cryo
cd worker && npx wrangler deploy
```

`wrangler deploy` stampa l'indirizzo del Worker, per esempio
`https://casadolcecasa-criogenesi.<tuo-nome>.workers.dev`.

### 5. Stripe: il webhook

Developers → Webhooks → **Aggiungi destinazione**:

- indirizzo: quello del Worker;
- eventi: `checkout.session.completed` e `checkout.session.async_payment_succeeded`.

Copia il **segreto di firma** (`whsec_…`) e caricalo:

```sh
cd worker
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

### 6. Il gioco

In `src/game/cryo.ts` metti l'indirizzo del Payment Link in `CRYO_PAYMENT_LINK` e pubblica il
gioco (push su `main`), dopo le regole.

### 7. Prova

In modalità test paga con la carta `4242 4242 4242 4242` (scadenza futura qualsiasi, CVC
qualsiasi). Entro pochi secondi nel gioco compare "🧊 Criogenesi attiva fino al …". Nella
dashboard di Stripe, in Webhooks, ogni avviso deve avere risposta 200. L'esito di ogni pagamento
si legge con `npm run logs --prefix worker` (o nella dashboard di Cloudflare → Workers →
casadolcecasa-criogenesi → Log): `attivata`, `già registrato`, `altro prodotto`,
`non ancora pagato` o `account mancante`.

## Da sapere

- **Rimborsi**: un rimborso fatto da Stripe non toglie il pass. Se serve, si cancella a mano
  `sims_cryo/<uid>` dalla console del database.
- **Account e personaggio**: il pass è dell'account. Se il personaggio muore e il giocatore ne
  crea uno nuovo, il pass vale per il nuovo.
- **Mentre si gioca** i bisogni calano normalmente: la capsula vale solo per le assenze.
- **Errori temporanei** (Firebase che non risponde): il Worker risponde 500 e Stripe riprova da
  solo per qualche giorno.
