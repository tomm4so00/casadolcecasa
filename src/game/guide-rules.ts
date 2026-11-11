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
