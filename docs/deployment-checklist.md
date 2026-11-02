# Messa online di Casa Dolce Casa

Repository: [tomm4so00/casadolcecasa](https://github.com/tomm4so00/casadolcecasa).
Progetto Firebase: **casadolcecasa-6d92a**. Manteniamo il piano gratuito Spark.

## Cosa facciamo noi

- [x] Pubblicare il processo del mercato e questa documentazione su **main**,
      mantenendo il frontend attualmente online.
- [x] Caricare il nuovo frontend nel ramo **feature/typescript-shared-market**,
      pronto da portare su main quando il mercato sarà attivo.
- [ ] Preparare le regole aggiornate partendo da quelle attuali di Firebase.
- [ ] Controllare il primo aggiornamento del mercato dopo la configurazione.
- [ ] Portare il nuovo frontend su main e verificare la pubblicazione del sito.

## Cosa deve fare Tom Tom

- [ ] **GitHub Pages:** in [Settings → Pages](https://github.com/tomm4so00/casadolcecasa/settings/pages),
      selezionare **GitHub Actions** come Source.
- [ ] **Accesso Google:** in Firebase → Authentication, abilitare Google come
      metodo di accesso e aggiungere **tomm4so00.github.io** ai domini autorizzati.
- [ ] **Database:** conservare una copia dei dati e delle regole attuali.
      Passarci il JSON delle regole per preparare l'aggiornamento, poi pubblicare
      le regole aggiornate che forniremo.
- [ ] **Credenziale del mercato:** in Firebase → Impostazioni progetto → Account
      di servizio, generare una chiave privata Admin SDK. In GitHub → Settings →
      Secrets and variables → Actions → Secrets, creare
      **FIREBASE_MARKET_SERVICE_ACCOUNT** e inserirvi l'intero JSON della chiave.
      La chiave va inserita direttamente nel Secret, senza inviarla in chat.
- [ ] **Attivazione, dopo aver pubblicato le regole:** in GitHub → Settings →
      Secrets and variables → Actions → Variables, impostare **MARKET_ENABLED** a
      **true**. Poi aprire Actions → **Update shared stock market** →
      **Run workflow**, scegliendo il branch **main**.

## Verifiche finali

- [ ] Il workflow del mercato termina correttamente e aggiorna `sims_market/updatedAt`.
- [ ] Il workflow Pages pubblica il nuovo gioco senza errori.
- [ ] Accesso Google e recupero del personaggio funzionano sul sito reale.
- [ ] Acquisti, saldo e salvataggi restano corretti dopo uscita e rientro.
- [ ] Due dispositivi mostrano le stesse quotazioni.
- [ ] Una successiva esecuzione pianificata aggiorna il mercato.

**Ordine:** prima carichiamo il processo del mercato; poi completiamo credenziale
e regole Firebase; infine attiviamo il mercato e pubblichiamo il nuovo frontend.
Gli aggiornamenti sono previsti ogni 15 minuti, con possibili ritardi di GitHub.
