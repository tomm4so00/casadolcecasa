// Regole del turno in ospedale: due pazienti a letto, quattro postazioni fisse e cosa si fa con
// ognuna. Niente browser qui: le usa hospital.ts e le controllano i test.
//
// Flusso A (si prende in mano e si porta al letto): il monitor dei parametri e i farmaci.
// Flusso B (si spinge il carrello fino al letto, poi si sceglie): medicazioni e biancheria.

export type StationId = 'monitor' | 'farmaci' | 'medicazioni' | 'biancheria';

export type ActionId =
  | 'temperatura'
  | 'pressione'
  | 'saturazione'
  | 'antibiotico'
  | 'antidolorifico'
  | 'vaccino'
  | 'cerotto'
  | 'medicazione'
  | 'igiene'
  | 'lenzuola';

export interface Station {
  e: string;
  label: string;
  /** 'hand': si porta in mano; 'cart': si spinge il carrello */
  flow: 'hand' | 'cart';
  actions: ActionId[];
}

export const STATIONS: Record<StationId, Station> = {
  monitor: {
    e: '🖥️',
    label: 'Monitor dei parametri',
    flow: 'hand',
    actions: ['temperatura', 'pressione', 'saturazione'],
  },
  farmaci: {
    e: '💊',
    label: 'Armadio dei farmaci',
    flow: 'hand',
    actions: ['antibiotico', 'antidolorifico', 'vaccino'],
  },
  medicazioni: {
    e: '🩹',
    label: 'Carrello delle medicazioni',
    flow: 'cart',
    actions: ['cerotto', 'medicazione'],
  },
  biancheria: {
    e: '🧺',
    label: 'Carrello della biancheria',
    flow: 'cart',
    actions: ['igiene', 'lenzuola'],
  },
};
export const STATION_IDS = Object.keys(STATIONS) as StationId[];

export interface Action {
  e: string;
  label: string;
  station: StationId;
}

export const ACTIONS: Record<ActionId, Action> = {
  temperatura: { e: '🌡️', label: 'Temperatura', station: 'monitor' },
  pressione: { e: '🩺', label: 'Pressione', station: 'monitor' },
  // (i polmoni 🫁 su Windows 10 non si vedono)
  saturazione: { e: '💨', label: "Saturazione d'ossigeno", station: 'monitor' },
  antibiotico: { e: '💊', label: 'Antibiotico', station: 'farmaci' },
  antidolorifico: { e: '💧', label: 'Antidolorifico', station: 'farmaci' },
  vaccino: { e: '💉', label: 'Vaccino', station: 'farmaci' },
  cerotto: { e: '🩹', label: 'Cerotto', station: 'medicazioni' },
  medicazione: { e: '🧻', label: 'Medicazione avanzata', station: 'medicazioni' },
  igiene: { e: '🧼', label: 'Cure igieniche', station: 'biancheria' },
  lenzuola: { e: '🛏️', label: 'Cambiare la biancheria', station: 'biancheria' },
};
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

/** Pazienti nella stanza (uno per letto). */
export const PATIENTS = 2;
/** Secondi in cui il paziente appena curato sorride, prima di chiedere altro. */
export const CURED_SECONDS = 2.5;

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/**
 * Di cosa ha bisogno un paziente: un'azione a caso (`r` tra 0 e 1), diversa da quelle che
 * chiedono gli altri, così due pazienti non chiedono mai la stessa cosa.
 */
export function needFor(r: number, others: readonly (ActionId | null)[]): ActionId {
  const free = ACTION_IDS.filter((a) => !others.includes(a));
  const pool = free.length ? free : ACTION_IDS;
  return pool[Math.min(pool.length - 1, Math.floor(clamp01(r) * pool.length))];
}

/** Cosa si ha in mano (flusso A) o cosa si spinge (flusso B). */
export type Hands =
  | { kind: 'empty' }
  | { kind: 'monitor' }
  | { kind: 'defib' }
  | { kind: 'drug'; drug: ActionId }
  | { kind: 'cart'; station: StationId };

/** Le azioni che si possono scegliere al letto con quello che si ha (nessuna a mani vuote). */
export function choicesAtBed(h: Hands): ActionId[] {
  if (h.kind === 'monitor') return STATIONS.monitor.actions;
  if (h.kind === 'drug') return [h.drug];
  if (h.kind === 'cart') return STATIONS[h.station].actions;
  return [];
}

/** Con le mani così si può usare la postazione? (prendere, rimettere, spingere) */
export function canUseStation(h: Hands, st: StationId): boolean {
  if (h.kind === 'empty') return true;
  // si rimette a posto quello che si ha in mano
  if (h.kind === 'monitor') return st === 'monitor';
  if (h.kind === 'defib') return false;
  if (h.kind === 'drug') return st === 'farmaci';
  return false;
}

/** Il paziente aveva bisogno proprio di questo? */
export const rightCare = (need: ActionId | null, done: ActionId): boolean => need === done;

/**
 * Dopo la cura: il farmaco si consuma; monitor e defibrillatore restano in mano, il carrello
 * accanto al letto.
 */
export function handsAfterCare(h: Hands): Hands {
  if (h.kind === 'drug') return { kind: 'empty' };
  if (h.kind === 'cart') return { kind: 'empty' };
  return h;
}

// ---------------------------------------------------------------- codice rosso

/**
 * Codice rosso (arresto cardiaco): tra il secondo 30 e il secondo 60 del turno ogni paziente,
 * per conto suo, ha il 35% di probabilità di andarci. Da quel momento ci sono 5 secondi per
 * portare il defibrillatore al letto e dare la scarica.
 */
export const CODE_RED = { from: 30, to: 60, chance: 0.35, seconds: 5 };

/**
 * Quando scatta il codice rosso per un paziente (secondi dall'inizio del turno), o null se in
 * questo turno non scatta. `r1` decide se succede, `r2` quando; tutti e due tra 0 e 1.
 */
export function codeRedAt(r1: number, r2: number): number | null {
  if (r1 >= CODE_RED.chance) return null;
  return CODE_RED.from + clamp01(r2) * (CODE_RED.to - CODE_RED.from);
}

/** Salvato in tempo: il doppio del compenso di una cura. */
export const codeRedBonus = (perItem: number): number => perItem * 2;
/** Tempo scaduto: si perde quanto vale una cura. */
export const codeRedPenalty = (perItem: number): number => perItem;

/**
 * Prendere il defibrillatore è un'emergenza: quello che si ha in mano si posa subito (monitor e
 * farmaco tornano al loro posto, il carrello resta dov'è). Dice cosa si posa.
 */
export function droppedForDefib(h: Hands): 'monitor' | 'drug' | 'cart' | null {
  if (h.kind === 'monitor' || h.kind === 'drug' || h.kind === 'cart') return h.kind;
  return null;
}
