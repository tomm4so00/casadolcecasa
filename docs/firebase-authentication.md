# Accesso Google e regole Firebase

L'accesso online usa esclusivamente Google tramite Firebase Authentication.
Non esiste una password del gioco. Il nome scelto nella schermata iniziale è il
nome pubblico del Sim, non una credenziale. La prova `?offline=1` resta locale.

## Identità e salvataggi

Ogni nuovo account riceve l'identificativo `player_{uidFirebase}`. La regola del
database consente al client di creare soltanto il collegamento del proprio UID
verso tale identificativo; il client non può modificarlo dopo la creazione.
Il collegamento è in `sims_accounts/{uid}`.

Salvataggi, sessioni e richieste di collegamento sono leggibili e modificabili
solo dall'account autorizzato e dal processo amministrativo. Il salvataggio
locale online usa una chiave distinta per ogni Sim, per evitare di caricare i
progressi di un altro account sullo stesso browser.

## Sim precedenti

La schermata iniziale chiede solo **Accedi con Google**. Al primo accesso di un
account senza Sim, il gioco collega automaticamente, senza approvazione del
gestore:

1. il Sim indicato in una vecchia richiesta `sims_link_requests/{uid}`, se presente;
2. altrimenti il Sim v8 salvato sul dispositivo in uso.

Se nessuno dei due è collegabile, chiede se il giocatore aveva già un Sim: con
**No** crea il nuovo Sim dopo la scelta del nome; con **Sì** chiede il codice e lo
collega subito.

Il collegamento è un aggiornamento atomico che scrive `sims_legacy_claims/{playerId}`
con l'UID e `sims_accounts/{uid}/playerId` con il codice. Le regole lo accettano solo
se il codice ha il formato v8 (`player_` più 4–20 caratteri minuscoli o cifre: i Sim
creati con Google non sono reclamabili), esiste un salvataggio cloud, il Sim non è
già reclamato e l'account non ha ancora un Sim. Il primo account che reclama un
codice lo tiene: il codice è visibile ad altri giocatori, quindi un Sim non ancora
reclamato può essere preso da chi lo conosce. Il gestore può correggere un
collegamento dalla console, modificando entrambi i nodi.

I collegamenti approvati a mano prima di questa modifica non hanno una voce in
`sims_legacy_claims`: per proteggerli va aggiunta
`sims_legacy_claims/{playerId} = {uid}` dalla console.
Il vecchio salvataggio locale viene conservato e non è cancellato creando un
nuovo Sim.

## Regole proposte

Il file `firebase/database.rules.proposed.json` contiene le regole pubblicate nel
passaggio alla versione con Google obbligatorio. Non è collegato a una
distribuzione automatica in `firebase.json`: i successivi aggiornamenti richiedono
prove sugli emulatori e backup dei dati e delle regole precedenti.

| Dati                                         | Accesso previsto                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Salvataggio e sessione                       | Account Google collegato a quel Sim                                          |
| Collegamento account e recupero di un Sim v8 | Solo l'account interessato; un Sim v8 al primo account che lo reclama        |
| Mercato                                      | Lettura pubblica, scrittura del processo centrale                            |
| Presenza e classifica                        | Lettura dei giocatori con profilo; scrittura del proprio Sim                 |
| Chat                                         | Lettura dei giocatori con profilo; invio e cancellazione dei propri messaggi |
| Interazioni                                  | Invio dal proprio Sim, lettura e consumo da parte del destinatario           |
| Stanze                                       | Lettura dei giocatori con profilo; assegnazione e dati personali controllati |
| Versione del gioco e manutenzione            | Aggiornamento del processo centrale                                          |

Le transazioni condivise delle stanze mantengono trasferimenti e meccaniche
della cassaforte. Le regole impediscono di appropriarsi della stanza o di
modificare inventario e investimenti di un altro Sim. Il bilancio del proprio
personaggio resta calcolato dal client: questa versione non costituisce un
sistema completo contro la manipolazione economica. La verifica del PIN della
cassaforte rimane una meccanica del client, da spostare a un servizio autorevole
se si vuole una protezione completa dai client modificati.

La morte per lunga assenza e la pulizia della chat passano al processo
amministrativo pianificato. Un giocatore non deve leggere i salvataggi privati
degli altri per eseguire queste operazioni. La manutenzione conserva una ricevuta
nelle stanze per riprendere un aggiornamento interrotto da un errore di rete.
I Sim precedenti che non sono ancora stati collegati a Google sono esclusi dalla
manutenzione automatica degli assenti, così restano conservati durante il passaggio.

## Configurazione del progetto

In Authentication abilitare Google e autorizzare `tomm4so00.github.io`.
Non è necessario attivare email/password o effettuare l'upgrade a Blaze.
La procedura gratuita è descritta nel
[codelab ufficiale Firebase](https://firebase.google.com/codelabs/firebase-terraform).

Le prove su emulatori usano credenziali Google simulate, verificano il recupero
su un altro browser, il rifiuto degli accessi di un secondo account e
l'approvazione amministrativa di un Sim precedente. Il popup Google reale va
verificato sul dominio pubblicato con un account dell'utente.
