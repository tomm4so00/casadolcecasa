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

Il vecchio codice personaggio non è più una credenziale di accesso. Il pulsante
**Collega un Sim già esistente** autentica con Google e registra una richiesta
in `sims_link_requests/{uid}`. La richiesta non trasferisce il personaggio.

Il gestore verifica l'identità del proprietario e il Sim richiesto, controlla
che non appartenga già a un altro account e conserva una copia degli eventuali
collegamenti precedenti. Poi imposta `sims_accounts/{uid}/playerId` al codice
approvato dalla console amministrativa. Al successivo accesso con Google il
giocatore ritrova quel Sim, senza cambiare i percorsi dei progressi o della stanza.
Il vecchio salvataggio locale viene conservato e non è cancellato creando un
nuovo Sim. Non approvare un collegamento basandosi soltanto sul codice pubblico.

## Regole proposte

Il file è `firebase/database.rules.proposed.json`. Non è collegato a una
distribuzione automatica in `firebase.json`: va pubblicato durante il passaggio
coordinato alla versione con Google obbligatorio, dopo il backup dei dati e
delle regole precedenti.

| Dati                                         | Accesso previsto                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Salvataggio e sessione                       | Account Google collegato a quel Sim                                          |
| Collegamento account e richiesta di recupero | Solo l'account interessato; approvazione del gestore                         |
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

## Configurazione del progetto

In Authentication abilitare Google e autorizzare `tomm4so00.github.io`.
Non è necessario attivare email/password o effettuare l'upgrade a Blaze.
La procedura gratuita è descritta nel
[codelab ufficiale Firebase](https://firebase.google.com/codelabs/firebase-terraform).

Le prove su emulatori usano credenziali Google simulate, verificano il recupero
su un altro browser, il rifiuto degli accessi di un secondo account e
l'approvazione amministrativa di un Sim precedente. Il popup Google reale va
verificato sul dominio pubblicato con un account dell'utente.
