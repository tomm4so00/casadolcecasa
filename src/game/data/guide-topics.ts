// La guida del pulsante ❓, divisa per argomenti (guide-book.ts): un indice e una pagina breve per
// argomento. Si legge quando serve, non tutta in una volta.

export interface GuideTopic {
  id: string;
  title: string;
  text: string;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'vivere',
    title: '🏠 Come si vive',
    text:
      'Il tuo personaggio vive in tempo reale: Fame, Sonno, Igiene e Felicità calano anche a gioco chiuso.\n\n' +
      'Se uno si svuota scende la Salute, e a zero il personaggio muore: la sua lapide resta al cimitero.\n\n' +
      '😴 Si dorme nel proprio letto, 🚿 ci si lava in bagno, 🙂 la Felicità sale uscendo, giocando e stando con gli altri.\n\n' +
      'Tocca il riquadro dei parametri per vederli con le barre o in piccolo.',
  },
  {
    id: 'cibo',
    title: '🍝 Cibo e cucina',
    text:
      'In cucina prendi il cibo dal frigo e cucinalo ai fornelli: un piatto cucinato sazia più del cibo crudo.\n\n' +
      'Quello che hai in più resta nello zaino 🎒: puoi mangiarlo dove vuoi o regalarlo a un vicino con «Regala».\n\n' +
      'Da noi si usa così: chi arriva porta un assaggio ai vicini.',
  },
  {
    id: 'soldi',
    title: '💼 Lavoro e soldi',
    text:
      'Dall’uscita del condominio scegli «Lavoro»: ogni turno paga in Dindini (Đ), e di più con l’esperienza. I turni al giorno sono pochi.\n\n' +
      '🔐 I soldi stanno nella cassaforte della tua stanza, protetta da una combinazione.\n' +
      '🏦 In banca sono al sicuro da ladri e da Zero.\n' +
      '📈 In banca o dal PC della stanza puoi comprare azioni della borsa del condominio: salgono e scendono.',
  },
  {
    id: 'vicini',
    title: '👋 I vicini',
    text:
      'Avvicinati a un vicino e tocca il suo nome: puoi dialogare, fare complimenti, regalargli cibo… o insultarlo.\n\n' +
      'Chi ti tratta bene diventa tuo amico, chi ti tratta male nemico: lo vedi accanto alla sua icona in alto.\n\n' +
      '💬 Dal pulsante dei messaggi scrivi nella chat del condominio o in un fumetto sopra la testa. Con chi ti piace ci si può anche fidanzare.\n\n' +
      'Le icone in alto sono i vicini online: toccane una per vedere come sta.',
  },
  {
    id: 'zero',
    title: '🔐 Zero e i ladri',
    text:
      'Ogni giorno alle 11:45 Zero, lo scassinatore, annuncia a che ora attaccherà: per 10 minuti le casseforti sono più facili da aprire.\n\n' +
      'Se vedi qualcuno scassinare la tua cassaforte, avvicinati e dagli un pugno 👊: per lui resterà chiusa per sempre.\n\n' +
      'Per stare tranquillo: soldi in banca e cassaforte livello 2 dal negozio di mobili.\n\n' +
      '🚓 Al commissariato porti le prove di un furto e si pagano le multe.',
  },
  {
    id: 'citta',
    title: '🏙️ La città',
    text:
      'Dall’uscita del condominio, nel cortile, si va in città.\n\n' +
      '🏬 Il centro commerciale ha i negozi: mobili, vestiti, animali, collezionismo, usato, growshop, sala giochi e scommesse.\n' +
      '🎉 Le «Attività ricreative» sono passeggiata, bar, discoteca e viaggio: alzano la Felicità.\n\n' +
      'La prima volta che entri in un posto, una riga in alto ti dice a cosa serve.',
  },
  {
    id: 'missioni',
    title: '📋 Missioni e trofei',
    text:
      'Tocca 📋 Missioni sotto i parametri.\n\n' +
      '🌅 Ogni giorno ci sono 3 missioni nuove, uguali per tutti: finirle più giorni di fila dà un premio che cresce, e al 7° giorno una medaglia.\n\n' +
      '🏆 I capitoli fanno scoprire il gioco: ognuno finito mette un trofeo sulla mensola della tua stanza.\n\n' +
      '🧭 «Segui missione» accende la freccia che ti porta dove serve.',
  },
  {
    id: 'progetti',
    title: '🎨 Grandi progetti',
    text:
      '🎨 Al Laboratorio Artistico dipingi quadri e li metti all’asta: gli altri giocatori fanno offerte.\n\n' +
      '🚀 Al Laboratorio Ingegneristico tutto il condominio versa quote per il razzo: finito il razzo si vola sulla Luna e si costruisce la base lunare.\n\n' +
      '🏺 Al negozio di collezionismo ci sono pezzi unici per la mensola della tua stanza.',
  },
  {
    id: 'pulsanti',
    title: '⚙️ I pulsanti',
    text:
      'A destra:\n' +
      '🎒 lo zaino con cibo e oggetti\n' +
      '🔊 il volume di effetti e musica, e le notifiche\n' +
      '❓ questa guida\n' +
      '🏆 la classifica\n' +
      '🧑 il profilo: personalità, invita amici, cambia condominio\n' +
      '💬 la chat del condominio e il fumetto sopra la testa\n' +
      '🏃 corri\n\n' +
      'In basso «Arreda» sposta i mobili della tua stanza.',
  },
];
