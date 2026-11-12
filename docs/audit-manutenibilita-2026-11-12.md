# Audit di manutenibilità — 12 novembre 2026

Analisi della copia di lavoro locale, incluse le modifiche non ancora pubblicate. Obiettivo:
ridurre il numero di punti da conoscere e modificare per aggiungere una funzione. Nessuna
modifica all'architettura o alla produzione è stata eseguita durante questo audit.

## Esito

La base ha già regole pure, TypeScript strict, controlli sui salvataggi e numerosi test.
Il limite principale è la separazione incompleta fra stato, simulazione, interfaccia e disegno.
Conviene intervenire per funzionalità, iniziando dai lavori, senza riscrivere il gioco.

## Verifiche

- `npm run check`: formattazione e TypeScript passano; 655 test passano e 2 falliscono.
  Il controllo si interrompe prima della prova nel browser.
- I due fallimenti riguardano il limite di `GameValue`: `jobs.ts` ne contiene 113 invece
  di massimo 112, `restaurant.ts` 19 invece di 17. Totale 3387 invece di 3384.
  Sono occorrenze testuali del nome, non un conteggio di tutte le espressioni non tipizzate.
- Compilazione server: riuscita.
- Smoke browser eseguito separatamente: riuscito, senza errori JavaScript rilevati.
- Controllo Worker: non verificabile con le dipendenze locali presenti; manca
  `@cloudflare/workers-types`. Non è prova di un errore nel codice del Worker.
- Le prove degli emulatori Firebase non sono state eseguite in questo audit.

## Riscontri e interventi

| Priorità | Riscontro                                                                                  | Conseguenza                                                              | Intervento                                                              |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Alta     | Limite `GameValue` superato nelle modifiche locali                                         | La verifica completa e la CI non passano                                 | Sostituire i nuovi usi con tipi concreti, mantenendo il limite attuale  |
| Alta     | Un gruppo di 92 moduli ha dipendenze circolari a esecuzione                                | Un cambiamento locale coinvolge molte funzioni; difficile isolare i test | Separare regole, controller e vista; impedire nuovi cicli               |
| Alta     | `context.ts` è importato da 191 moduli; `MG` e `activeShift` sono `GameValue`              | Proprietà e transizioni non valide sfuggono al compilatore               | Tipizzare prima turno, oggetto trasportato e interazioni                |
| Alta     | La CI principale non esegue smoke browser, scenari di sviluppo e controllo completo Worker | Una PR può passare pur rompendo interazioni o un altro componente        | Aggiungere verifiche esplicite per ciascuna componente                  |
| Media    | Scene, interazioni e renderer hanno registri separati                                      | Una nuova postazione richiede modifiche coordinate in più file           | Tipi condivisi per i `kind` e controllo della copertura dei registri    |
| Media    | Smoke test lungo e basato anche sulla modifica diretta dello stato                         | Diagnosi lenta; alcuni percorsi non verificano i comandi reali           | Separare smoke, lavori, salvataggi e multiplayer con fixture comuni     |
| Media    | File molto grandi e responsabilità miste                                                   | Aumentano conflitti e ricerca manuale del punto da modificare            | Estrarre moduli per dominio mantenendo esportazioni compatibili         |
| Media    | Documentazione della pubblicazione non allineata al workflow                               | Possibili procedure operative sbagliate                                  | Documentare Firebase Hosting come sito principale e Pages come trasloco |

### Dipendenze e stato

Esempio concreto: `jobs.ts` importa ufficio e ristorante; entrambi richiamano `mgHud`,
`mgPop` e `mgScore` da `jobs.ts`. Inoltre `jobs.ts` importa le collisioni da `engine.ts`,
mentre il motore importa i lavori. Questi legami uniscono simulazione, rendering e UI.

Il conteggio dei cicli esclude importazioni solo di tipi e considera le importazioni statiche
fra i file TypeScript di `src/game`. Non misura gli effetti delle importazioni dinamiche.
Oltre al gruppo di 92 moduli, esiste un ciclo fra `market-event.ts` e `market-client.ts`.

Proposta: un contratto del lavoro con `start`, `tick`, `prompt`, `interact`, `stop` e uno stato
tipizzato. Il controller comune riceve gli eventi del lavoro e aggiorna punteggio e UI;
ufficio e ristorante non importano il controller. Le collisioni passano da un modulo di geometria
indipendente dal rendering. L'orologio e il generatore casuale diventano dipendenze sostituibili
nei test, evitando di modificare globalmente `Math.random`.

### Dimensioni dei file

Rilevazione iniziale: `catalogues.ts` 4204 righe, `avatars.ts` 3967, `objects.ts` 3257,
`world.ts` 1599, `interactions.ts` 1073 e CSS 4350. La lunghezza da sola non è un difetto:
la priorità è separare dati e responsabilità che cambiano per ragioni diverse.

Dividere prima i cataloghi per luogo e i renderer per famiglia. Nei file originali mantenere
facciate compatibili: `tests/parity.test.ts` cerca esportazioni tramite una regex sul sorgente,
quindi spostare funzioni senza aggiornare il manifest rompe quel controllo anche a comportamento
invariato. Rivalutare gradualmente questo vincolo storico con test sul contratto effettivo.

### Registri e interazioni

Il lavandino del ristorante è definito nel catalogo, associato al renderer in `render/registry.ts`
e alla postazione in `restaurant.ts`. Usare un'unione dei tipi di scena e `satisfies` sui registri
per rilevare errori di nome. Non tutte le decorazioni devono essere interattive: la verifica deve
distinguere esplicitamente gli oggetti decorativi dalle postazioni utilizzabili.

### Sviluppo e pubblicazione

`npm run check` controlla il client, i test unitari e lo smoke browser, ma non richiama
`test:dev-mode`, il compilatore server o il controllo Worker. La CI principale compila anche il
server, ma non esegue gli smoke browser. I test unitari importano alcuni moduli server/Worker:
questo non equivale a verificarne l'intero progetto con il relativo `tsconfig.json`.

Proposta: comandi `check:client`, `check:server`, `check:worker`, `test:browser:jobs` e un comando
completo documentato. Aggiungere un'installazione riproducibile delle tre componenti e verifiche
emulatore sulle modifiche a regole, autorizzazioni e contratti dei dati. Le pagine di trasloco e
il sito Firebase hanno build con base diversa: mantenere esplicita questa distinzione.

## Sequenza proposta

1. Ripristinare il controllo verde eliminando i nuovi `GameValue`, senza alzarne i limiti.
2. Allineare comandi, CI e documentazione; rendere eseguibili separatamente gli scenari lavori.
3. Estrarre tipi e stato dei lavori, poi togliere le importazioni inverse verso `jobs.ts`.
4. Consolidare i registri delle postazioni e separare cataloghi e disegno della cucina.
5. Applicare il modello ad altri domini solo dopo aver verificato il primo.

Primo risultato verificabile: aggiungere una postazione del ristorante senza modificare il motore
generale; provare riempimento, rilascio anticipato, cottura e consegna con stato e tempo controllati;
nessun nuovo ciclo e nessun aumento del debito di tipi. Non sono necessarie migrazioni del database
per le prime estrazioni, purché si mantengano invariati i formati persistiti.
