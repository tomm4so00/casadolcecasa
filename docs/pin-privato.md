# Il PIN privato della cassaforte

Il PIN stava in `sims_rooms_state/<n>/pin`, leggibile da tutti e cifrato col numero della
stanza: con 64 o 125 combinazioni lo si scopriva provandole tutte. Ora sta in
`sims_safe_pins/<giocatore>`, che legge solo il proprietario (e il server), cifrato col codice
del giocatore (`shared/safe-pin-rules.ts`). Nella stanza resta solo `pinSet: true`.

## Lo scasso

1. Il ladro registra il tentativo in `sims_theft/<ladro>/<id stanza>`, prima di sapere se è
   giusto: oltre a `n` e `since` (3 tentativi ogni 24 ore, di più per il Criminale) scrive la
   combinazione provata `g`, cifrata come il PIN privato, e l'ora `t`.
2. Dopo i 15 secondi dello scasso prova a svuotare la cassaforte scrivendo insieme
   `vaultMoney: 0` e `robbed: { by, t }`. Le regole accettano `robbed` solo se l'ultimo tentativo
   ha la combinazione del PIN privato, è passato il tempo dello scasso (e non più di un minuto
   oltre) e il proprietario non ha dato il pugno.
3. Durante l'attacco di Zero la prima cifra la dice il Worker (`/scasso/indizio`), l'unico
   oltre al proprietario a leggere il PIN.

**Da chiudere**: la regola di `vaultMoney` lascia ancora a chiunque non sia bloccato abbassare
la cassaforte di un altro, perché la usano anche multe, offerte e aste. Finché quelle non hanno
una prova loro, chi bara può svuotare una cassaforte senza PIN.

## Il trasloco dei PIN

- La manutenzione del server (`moveSafePins` in `server/src/maintenance.ts`, ogni 15 minuti)
  ritrova le 3 cifre di ogni PIN vecchio, scrive la copia privata (se non c'è già) e poi
  cancella quella pubblica. Si può ripetere senza danni.
- Il gioco nuovo sposta subito il PIN del giocatore che entra (`src/game/safe-pins.ts`).
- Un PIN che non si riconosce resta dov'è e finisce nel log.

## Pubblicare

1. Copia dei PIN di oggi: `firebase database:get /sims_rooms_state > firebase/backups/…` (e
   gli stessi dati dei mondi), perché il trasloco cancella i PIN pubblici.
2. Regole (`node firebase/rules.mjs deploy`): nella stanza `pin` si può solo lasciare uguale o
   cancellare, così le versioni vecchie non si bloccano.
3. Manutenzione del server (push: la esegue `market.yml`) e Worker (`npx wrangler deploy`).
4. Il gioco.

Chi ha la versione vecchia aperta gioca normalmente, ma non può più scassinare (vede le
casseforti "non protette"), il cambio di combinazione gli sembra riuscito ma il database lo
rifiuta, e il trasloco di stanza fallisce finché il suo PIN non è stato spostato.
