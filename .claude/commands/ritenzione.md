---
description: Apre la ritenzione dei giocatori (chi torna dopo il primo giorno) e la commenta
---

Mostra all'utente la ritenzione dei giocatori (sims_retention, vedi shared/retention-rules.ts e
scripts/ritenzione.mjs).

1. Lancia `node scripts/ritenzione.mjs --testo` (aggiungi `--prova` se l'utente ha scritto
   "prova" dopo il comando: $ARGUMENTS). Lo script apre la pagina nel browser del PC e stampa
   il riepilogo nel terminale.
2. Se il gioco gira da remoto (l'utente è sul telefono), manda anche la pagina creata (il
   percorso è nell'ultima riga, "Pagina: …") con SendUserFile.
3. Commenta in italiano, in due o tre righe semplici:
   - quanti giocano e quanti di loro sono nuovi o di ritorno;
   - quanti nuovi tornano il giorno dopo, dopo una settimana e dopo un mese, e se va meglio o
     peggio delle settimane prima;
   - con pochi giocatori o settimane ancora aperte ("—"), dillo invece di trarre conclusioni.
