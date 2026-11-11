---
description: Apre la classifica settimanale dei contatori d'uso del gioco e la commenta
---

Mostra all'utente la classifica settimanale dei contatori d'uso (sims_usage, vedi
src/game/usage.ts e scripts/contatori.mjs).

1. Lancia `node scripts/contatori.mjs --testo` (aggiungi `--prova` se l'utente ha scritto
   "prova" dopo il comando: $ARGUMENTS). Lo script apre la pagina nel browser del PC e stampa
   la classifica nel terminale.
2. Se il gioco gira da remoto (l'utente è sul telefono), manda anche la pagina creata (il
   percorso è nell'ultima riga, "Pagina: …") con SendUserFile.
3. Commenta in italiano, in due o tre righe semplici:
   - cosa si usa di più e cosa sale rispetto alla settimana prima;
   - cosa scende o si usa pochissimo (candidati da limitare o togliere);
   - se ci sono pochi dati, dillo invece di trarre conclusioni.
