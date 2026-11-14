// La freccia delle missioni di benvenuto (senza dipendenze dal browser, così è testabile): dato dove
// si trova il giocatore e dove deve arrivare, dice verso cosa puntare adesso. Se la meta è in un
// altro ambiente indica la porta da prendere: cortile → portone dell'appartamento → salone → porta
// della stanza (o cucina, bagno); da fuori si torna a casa con l'uscita.

/** Gli ambienti di casa: cortile, salone e le stanze che si aprono dal salone. */
export const HOME_ENVS = ['SALOON', 'KITCHEN', 'BATHROOM', 'PLAYER_ROOM', 'CORTILE'];
/** Ambienti che esistono uguali in ogni appartamento. */
const PER_APT = ['SALOON', 'KITCHEN', 'BATHROOM'];

export interface GuideHere {
  env: string;
  /** L'appartamento in cui si è (salone, cucina, bagno). */
  apt: number;
  /** La stanza in cui si è (solo in PLAYER_ROOM). */
  roomIdx: number | null;
}

export interface GuideDest {
  env: string;
  /** Per cucina, bagno e salone: di quale appartamento. */
  apt?: number;
  /** Per PLAYER_ROOM: quale stanza (indice su tutto il condominio). */
  roomIdx?: number;
  /** L'oggetto da raggiungere una volta arrivati (frigo, letto…). */
  key?: string;
  /** Oppure un punto (un altro giocatore, un personaggio). */
  point?: { x: number; y: number };
}

/** Verso cosa puntare: un oggetto della mappa di dove si è, un punto, o niente (si è arrivati). */
export type GuideStep = { key: string } | { point: { x: number; y: number } } | null;

/** L'appartamento della meta (null se la meta non è in un appartamento). */
function destApt(dest: GuideDest, perApt: number): number | null {
  if (dest.env === 'PLAYER_ROOM')
    return typeof dest.roomIdx === 'number' ? Math.floor(dest.roomIdx / perApt) : null;
  return PER_APT.includes(dest.env) ? (dest.apt ?? 0) : null;
}

/** Il prossimo passo verso la meta. */
export function guideStep(here: GuideHere, dest: GuideDest, perApt = 8): GuideStep {
  const apt = destApt(dest, perApt);
  const arrived =
    here.env === dest.env &&
    (dest.env === 'PLAYER_ROOM'
      ? here.roomIdx === dest.roomIdx
      : PER_APT.includes(dest.env)
        ? here.apt === apt
        : true);
  if (arrived) return dest.point ? { point: dest.point } : dest.key ? { key: dest.key } : null;
  const home = HOME_ENVS.includes(dest.env);
  if (here.env === 'CORTILE')
    return !home || apt === null ? { key: 'exitHouse' } : { key: 'doorApt' + apt };
  if (here.env === 'SALOON') {
    // fuori casa, nel cortile o in un altro appartamento: si passa dal cortile
    if (!home || apt === null || here.apt !== apt || dest.env === 'SALOON')
      return { key: 'courtyard' };
    if (dest.env === 'KITCHEN') return { key: 'kitchen' };
    if (dest.env === 'BATHROOM') return { key: 'bathroom' };
    return { key: 'room' + (((dest.roomIdx ?? 0) % perApt) + 1) };
  }
  // cucina, bagno, una stanza o un posto fuori: l'uscita riporta al salone
  return { key: 'doorExit' };
}

/** Sotto questa distanza dalla meta la freccia sparisce: ci si è già. */
export const GUIDE_NEAR = 70;

// ---------------------------------------------------------------- la freccetta sui pulsanti

/** Le azioni che il passo della missione scrive tra «…»: sono i pulsanti da toccare. */
export function quotedActions(hint: string): string[] {
  return [...hint.matchAll(/«([^»]{1,40})»/g)].map((m) => m[1].trim()).filter(Boolean);
}

/** Il testo di un pulsante senza emoji, segni e maiuscole: "💼 Lavoro" → "lavoro". */
export const plainLabel = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Quale pulsante evidenziare tra quelli visibili (testo per testo): prima quello che si chiama
 * proprio come l'azione, poi quello che la contiene ("Continua Lavoro"). -1 se nessuno.
 */
export function pickAction(labels: string[], actions: string[]): number {
  for (const exact of [true, false])
    for (const a of actions.map(plainLabel).filter(Boolean)) {
      const i = labels.findIndex((l) =>
        exact ? plainLabel(l) === a : ` ${plainLabel(l)} `.includes(` ${a} `),
      );
      if (i >= 0) return i;
    }
  return -1;
}

/**
 * Il passo chiede di aprire lo zaino adesso, nel posto giusto (taste.ts: "Sei nella stanza di…",
 * "Avvicinati a…"): la freccetta va sull'icona 🎒. Non mentre si sta ancora andando dal vicino.
 */
export const wantsBackpack = (hint: string): boolean =>
  /apri lo zaino/i.test(hint) && /^\S*\s*(Sei nella stanza|Avvicinati a)/u.test(hint);

// ---------------------------------------------------------------- fuori dal condominio

/** I negozi del centro commerciale (world.ts, MALL_SHOPS): ci si arriva dal centro commerciale. */
export const MALL_ENVS = [
  'centro_commerciale',
  'negozio_mobili',
  'negozio_vestiti',
  'scommesse',
  'sala_giochi',
  'growshop',
  'negozio_animali',
  'collezionismo',
  'usato',
];

/** I posti delle "Attività ricreative" e il loro pulsante. */
const FUN_BUTTONS: Record<string, string> = {
  passeggiata: 'btn-act-walk',
  bar: 'btn-act-bar',
  viaggio: 'btn-act-trip',
  discoteca: 'btn-act-disco',
};

/** Gli altri posti del menu dell'uscita e il loro pulsante. */
const EXIT_BUTTONS: Record<string, string> = {
  banca: 'btn-act-bank',
  commissariato: 'btn-act-police',
  criogenesi: 'btn-act-cryo',
  laboratorio: 'btn-act-art',
  ingegneria: 'btn-act-eng',
  CIMITERO: 'btn-act-cemetery',
};

/**
 * Nel menu dell'uscita del condominio, il pulsante che porta verso `env` (o null): il centro
 * commerciale per i suoi negozi, "Attività ricreative" e poi il posto per bar, discoteca…
 */
export function exitMenuButton(env: string, submenu: string): string | null {
  if (env.startsWith('lavoro_')) return submenu ? 'btn-act-back' : 'btn-act-work';
  if (FUN_BUTTONS[env]) return submenu === 'fun' ? FUN_BUTTONS[env] : 'btn-act-fun';
  const id = MALL_ENVS.includes(env) ? 'btn-act-mall' : EXIT_BUTTONS[env];
  if (!id) return null;
  return submenu ? 'btn-act-back' : id;
}
