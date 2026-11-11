# Le connessioni al database

Sul piano Spark di Firebase le connessioni simultanee al Realtime Database sono al massimo 100.
Oltre, chi apre il gioco resta in "connessione…" finché qualcuno non esce.

## Cosa conta come connessione

- ogni scheda aperta del gioco (anche nascosta): 1;
- la manutenzione del server (`market.yml`, ogni 15 minuti): 1, solo per il minuto in cui gira;
- il Worker di Cloudflare: le sue chiamate REST non tengono una connessione aperta.

## La pausa

Con la scheda nascosta da 10 minuti (2 se il personaggio dorme) il gioco salva e si scollega
(`src/game/dormancy.ts`). Per gli altri è uscito: il personaggio va in autoplay e il tempo conta
come un'assenza. Tornando alla scheda la pagina si ricarica e si rientra da soli; se intanto il
personaggio è stato aperto su un altro dispositivo, compare il solito avviso e la sessione resta
a quel dispositivo. Non vale in modalità prova (`?offline=1`) né durante un turno di lavoro, uno
scasso o un viaggio in razzo.

Le schede con una versione vecchia del gioco restano collegate finché non vengono ricaricate.

## Quante connessioni si usano

- **Console di Firebase** → Realtime Database → scheda **Utilizzo** → grafico **Connessioni**:
  le connessioni simultanee e il picco delle ultime 24 ore, 7 o 30 giorni.
- **Google Cloud Monitoring** → Metrics Explorer (gratis anche sul piano Spark): metrica
  `firebasedatabase.googleapis.com/network/active_connections`. Da lì si può creare un avviso
  per email, per esempio sopra 80.

## Prova

`npm run test:dormancy` (serve Java per gli emulatori): pausa, segno "offline", niente
scritture durante la pausa, ricarica e rientro, rispetto dell'altro dispositivo.
