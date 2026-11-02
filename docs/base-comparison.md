# Verifica della base del gioco

Confronto limitato ai file unici HTML, prima di integrare la versione più recente.
Le date sotto sono quelle dei commit che modificano il file, in ora italiana.

| Repository                                   | File             | Ultima modifica        | Righe |
| -------------------------------------------- | ---------------- | ---------------------- | ----: |
| `casadolcecasa` prima della ristrutturazione | `index.html.txt` | 30 ottobre 2026, 13:57 |   853 |
| `casadolcecasa1`                             | `index.htm`      | 30 ottobre 2026, 14:14 | 3.237 |
| `casadolcecasa2`                             | `index.html`     | 30 ottobre 2026, 14:25 |   854 |
| `casadolcecasa3`                             | `index.html`     | 30 ottobre 2026, 14:34 |   844 |
| `casadolcecasa4`                             | `index.html`     | 1 novembre 2026, 22:08 | 6.379 |

Il file iniziale locale e `casadolcecasa2/index.html` sono identici dopo aver
ignorato una riga vuota finale. La precedente ristrutturazione non era quindi
partita dall'ultima versione del gioco. Il numero di righe non è usato da solo
come prova: sono stati confrontati contenuto, cronologia e funzioni.

La base corretta è [casadolcecasa4, commit 8f15c853](https://github.com/tomm4so00/casadolcecasa4/commit/8f15c85353196c899edd41770e953900cb0d081d),
con `GAME_VERSION = 8` e blob dell'HTML
`19d51080de176cdd75c4b3ec1d299c0b4ecfcec5`.
`casadolcecasa0` e `casadolcecasa0.1` risultavano vuote; nella `5` non è stato
trovato un file HTML da usare come base.

La versione integrata conserva tutte le 304 funzioni di primo livello e i
cataloghi della v8. La mappa delle funzioni, con modulo e riga di origine, è in
`src/game/source-manifest.json` ed è verificata da un test di parità.

Sono conservati 32 posti nel condominio, 28 capi/accessori, 16 mobili,
quattro lavori, tre attività finanziarie simulate, chat, interazioni sociali,
aspetto del personaggio, animazioni, illuminazione, audio, bisogni, salute,
dipendenza, morte e cimitero. Il catalogo missioni della v8 è vuoto: viene
preservata la sua interfaccia e la logica, senza inventare nuove missioni.

Il prototipo TypeScript precedente è conservato nel commit locale `a18443a`.
Non sono stati sovrascritti i dati dei giocatori né pubblicate nuove regole sul
database reale durante il confronto e l'integrazione.
