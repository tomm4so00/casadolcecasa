// La riga «prima volta qui» (fase 5 del piano dei primi minuti): entrando per la prima volta in un
// posto compare in alto una frase su a cosa serve, che poi sparisce da sola. Senza browser: i test
// controllano che ogni posto abbia la sua riga.

/** Le righe, per posto. I lavori (lavoro_cantiere, lavoro_ospedale…) hanno una riga sola. */
export const FIRST_VISIT: Record<string, string> = {
  CORTILE: '🏡 Il cuore del condominio: da qui si va nei palazzi, in città e alle bacheche.',
  SALOON: '🛋️ Le porte numerate sono le stanze: la tua ha il numero illuminato.',
  KITCHEN: '🍳 Prendi il cibo dal frigo e cucinalo ai fornelli: un piatto sazia di più.',
  BATHROOM: '🚿 La doccia rimette a posto l’Igiene.',
  PLAYER_ROOM: '🏠 Casa tua: letto, cassaforte e mobili che sposti con «Arreda».',
  centro_commerciale: '🏬 Ogni vetrina è un negozio: avvicinati ed entra.',
  negozio_mobili:
    '🛋️ Mobili migliori danno più Sonno e Felicità. C’è anche la cassaforte livello 2.',
  negozio_vestiti: '👕 Compra i capi qui, poi li indossi dall’armadio della tua stanza.',
  scommesse: '🎰 Slot, roulette e morra cinese contro i vicini. Gioca con giudizio!',
  sala_giochi: '🕹️ Alla console si gioca da soli; ai cabinati sfidi un vicino.',
  growshop: '🌱 Semi e vasi: le piante crescono nella tua stanza.',
  negozio_animali: '🐶 Un animale va nutrito ogni giorno, proprio come te.',
  collezionismo: '🏺 Pezzi unici: comprali per la mensola della tua stanza.',
  usato: '♻️ Qui i vicini vendono e comprano tra loro.',
  lavoro: '💼 Ogni turno paga di più con l’esperienza. Si fanno pochi turni al giorno.',
  banca: '🏦 In banca i soldi sono al sicuro da Zero e dai ladri. Qui c’è anche la borsa.',
  commissariato: '🚓 Porta le prove dei furti e paga le multe.',
  laboratorio: '🎨 Dipingi al cavalletto e metti i quadri all’asta.',
  galleria: '🖼️ I quadri del condominio: guarda, vota e fai offerte.',
  ingegneria: '🔧 Tutti insieme versate le quote per costruire il razzo.',
  luna: '🌙 Ci sei arrivato! Qui si costruisce la base lunare.',
  base_lunare: '🏗️ La base lunare: ogni quota la fa crescere.',
  passeggiata: '🚶 Camminare alza la Felicità. Attenzione a chi incontri…',
  bar: '🍹 Si chiacchiera e si conosce gente nuova.',
  discoteca: '🕺 Tanta Felicità, ma stanca: occhio al Sonno.',
  viaggio: '✈️ Un viaggio al giorno per staccare: Felicità alle stelle.',
  CIMITERO: '⚰️ Qui riposano i personaggi del condominio: puoi leggere le lapidi.',
};

/** La chiave della riga per un posto (tutti i lavori ne hanno una sola), o null se non ce l'ha. */
export function firstVisitKey(env: string, inOwnRoom: boolean): string | null {
  if (env.startsWith('lavoro_')) return 'lavoro';
  // la riga della stanza parla della tua: nelle stanze dei vicini non serve
  if (env === 'PLAYER_ROOM' && !inOwnRoom) return null;
  return FIRST_VISIT[env] ? env : null;
}

/** I posti già visti, dal salvataggio: solo chiavi conosciute. */
export function decodeSeenPlaces(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((k): k is string => typeof k === 'string' && k in FIRST_VISIT)
    : [];
}
