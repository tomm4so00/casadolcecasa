// Coltivazione in camera: semi, fino a tre vasi (terra, terra premium, idroponico), una lampada
// per vaso, annaffiatura e raccolto che dipende dalla cura. L'erba raccolta va nello zaino ed è
// tutta uguale (un solo oggetto), qualunque sia la varietà. Niente browser qui: è testabile.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export type StrainId = 'lemon' | 'amnesia' | 'purple';

/** Varietà: prezzo dei semi, giorni di crescita in un vaso di terra senza lampada, grammi a cura piena. */
export const STRAINS: Record<
  StrainId,
  {
    name: string;
    price: number;
    days: number;
    grams: number;
    leaf: string;
    bud: string;
    hair: string;
  }
> = {
  lemon: {
    name: 'Lemon Haze',
    price: 100,
    days: 6,
    grams: 80,
    leaf: '#7cb342',
    bud: '#d4e157',
    hair: '#ffb74d',
  },
  amnesia: {
    name: 'Amnesia',
    price: 150,
    days: 5,
    grams: 100,
    leaf: '#388e3c',
    bud: '#a5d6a7',
    hair: '#ffffff',
  },
  purple: {
    name: 'Purple Haze',
    price: 210,
    days: 4,
    grams: 120,
    leaf: '#2e7d32',
    bud: '#8e24aa',
    hair: '#ff8a65',
  },
};
export const STRAIN_IDS = Object.keys(STRAINS) as StrainId[];
const isStrain = (v: unknown): v is StrainId => typeof v === 'string' && v in STRAINS;

export type PotKind = 'soil' | 'premium' | 'hydro';
/** Vasi: prezzo, velocità di crescita, resa e ogni quanto vanno annaffiati. */
export const POTS: Record<
  PotKind,
  { name: string; price: number; speed: number; yield: number; waterMs: number }
> = {
  soil: { name: 'Vaso di terra', price: 60, speed: 1, yield: 1, waterMs: DAY },
  premium: { name: 'Vaso di terra premium', price: 300, speed: 1.25, yield: 1, waterMs: DAY },
  hydro: { name: 'Vaso idroponico', price: 900, speed: 1.25, yield: 1.4, waterMs: 2 * DAY },
};
export const POT_KINDS = Object.keys(POTS) as PotKind[];

/** Lampade (una per vaso): 1 Lampada, 2 Top, 3 Super. 0: senza. */
export type LampLevel = 0 | 1 | 2 | 3;
export const LAMPS: Record<1 | 2 | 3, { name: string; price: number; speed: number }> = {
  1: { name: 'Lampada', price: 150, speed: 1.15 },
  2: { name: 'Lampada Top', price: 400, speed: 1.3 },
  3: { name: 'Lampada Super', price: 900, speed: 1.5 },
};

/** Vasi al massimo in una stanza. */
export const MAX_POTS = 3;
/** Ogni annaffiatura saltata toglie tanto dal raccolto… */
const DRY_PENALTY = 0.15;
/** …ma il raccolto non scende sotto questa frazione. */
const MIN_YIELD = 0.4;
/** Le piante di prima (comprate col vaso) danno sempre tanto. */
export const LEGACY_GRAMS = 100;

/** Ogni canna usa 1 grammo, alza la felicità del 10% e si vende a 5 Đ. */
const JOINT_GRAMS = 1;
export const JOINT_HAPPY = 10;
export const JOINT_PRICE = 5;

export interface Pot {
  kind: PotKind;
  lamp?: LampLevel;
  x?: number;
  y?: number;
  /** Pianta che cresce (assente se il vaso è vuoto). */
  strain?: StrainId;
  plantedAt?: number;
  /** Crescita fatta fino a `growAt` (0–1): cambia velocità se si mette una lampada a metà. */
  grown?: number;
  growAt?: number;
  /** Ultima annaffiatura e annaffiature saltate finora. */
  wateredAt?: number;
  missed?: number;
  /** Pianta del vecchio sistema: tempi di prima, 100 g, niente acqua. */
  legacy?: boolean;
}

export interface WeedState {
  /** Erba nello zaino (la tiene il registro della stanza) e varietà dell'ultimo raccolto. */
  grams: number;
  jarStrain?: StrainId;
  jarX?: number;
  jarY?: number;
  /** Semi nello zaino (non si scambiano). */
  seeds?: Partial<Record<StrainId, number>>;
  pots?: Pot[];
  /** Canne fumate nelle ultime 24 ore (per la tolleranza). */
  smokes?: number[];
}

export const emptyWeed = (): WeedState => ({ grams: 0 });

// ---------------------------------------------------------------- crescita

/** Durata della crescita delle piante di prima: più cara la varietà, un po' più veloce. */
const LEGACY_MS: Record<StrainId, number> = {
  lemon: 5.5 * DAY,
  amnesia: 5 * DAY,
  purple: 4.5 * DAY,
};

/** Quanto ci mette a crescere una pianta in questo vaso con questa lampada. */
export function growMsFor(strain: StrainId, kind: PotKind = 'soil', lamp: LampLevel = 0): number {
  const speed = POTS[kind].speed * (lamp ? LAMPS[lamp].speed : 1);
  return Math.round((STRAINS[strain].days * DAY) / speed);
}

const potGrowMs = (pot: Pot): number =>
  pot.legacy && pot.strain
    ? LEGACY_MS[pot.strain]
    : growMsFor(pot.strain!, pot.kind, pot.lamp ?? 0);

/** Quanto è cresciuta la pianta, da 0 a 1 (pronta). */
export function potProgress(pot: Pot, now: number): number {
  if (!pot.strain || !pot.plantedAt) return 0;
  const since = pot.growAt ?? pot.plantedAt;
  return Math.max(0, Math.min(1, (pot.grown ?? 0) + (now - since) / potGrowMs(pot)));
}

/** Quando sarà pronta (ms). */
export function potReadyAt(pot: Pot, now: number): number {
  if (!pot.strain || !pot.plantedAt) return now;
  // dalla crescita fatta fino a growAt: anche per una pianta già pronta da un pezzo
  const since = pot.growAt ?? pot.plantedAt;
  return since + Math.max(0, 1 - (pot.grown ?? 0)) * potGrowMs(pot);
}

/** Per i visitatori: varietà, crescita fatta, da quando e durata (vedi growProgress). */
export function potGrowInfo(pot: Pot): { s: StrainId; p: number; q: number; d: number } | null {
  if (!pot.strain || !pot.plantedAt) return null;
  return { s: pot.strain, p: pot.growAt ?? pot.plantedAt, q: pot.grown ?? 0, d: potGrowMs(pot) };
}

/** Crescita vista dai visitatori (anche le stanze dei giocatori con la versione di prima). */
export function growProgress(
  g: { s?: StrainId; p?: number; q?: number; d?: number } | undefined,
  now: number,
): number {
  if (!g?.p) return 0;
  const d = g.d ?? (g.s ? LEGACY_MS[g.s] : 5 * DAY);
  return Math.max(0, Math.min(1, (g.q ?? 0) + (now - g.p) / d));
}

// ---------------------------------------------------------------- acqua

/** Annaffiature saltate da quella di prima fino a `at`. */
export function dryPeriods(pot: Pot, at: number): number {
  if (pot.legacy || !pot.wateredAt) return 0;
  const every = POTS[pot.kind].waterMs;
  const late = at - (pot.wateredAt + every);
  return late <= 0 ? 0 : Math.floor(late / every) + 1;
}

/** Quanto manca alla prossima annaffiatura (negativo: è già in ritardo). */
export const waterDueIn = (pot: Pot, now: number): number =>
  (pot.wateredAt ?? now) + POTS[pot.kind].waterMs - now;

export function water(pot: Pot, now: number): Pot {
  if (!pot.strain || pot.legacy) return pot;
  // dopo che è pronta non serve più: si conta fino al momento in cui lo è diventata
  const until = Math.min(now, potReadyAt(pot, now));
  return { ...pot, missed: (pot.missed ?? 0) + dryPeriods(pot, until), wateredAt: now };
}

/** Grammi che darebbe raccogliendo adesso (o quando sarà pronta). */
export function expectedGrams(pot: Pot, now: number): number {
  if (!pot.strain) return 0;
  if (pot.legacy) return LEGACY_GRAMS;
  const ready = Math.min(now, potReadyAt(pot, now));
  const missed = (pot.missed ?? 0) + dryPeriods(pot, ready);
  const care = Math.max(MIN_YIELD, 1 - DRY_PENALTY * missed);
  return Math.round(STRAINS[pot.strain].grams * POTS[pot.kind].yield * care);
}

// ---------------------------------------------------------------- azioni sul vaso

/** Spiega perché non si può piantare, oppure null. */
export function plantError(state: WeedState, index: number, strain: StrainId): string | null {
  const pot = state.pots?.[index];
  if (!pot) return 'Questo vaso non c’è.';
  if (pot.strain) return 'In questo vaso c’è già una pianta.';
  if (!(state.seeds?.[strain] ?? 0))
    return `Non hai semi di ${STRAINS[strain].name}: li vende il grow shop.`;
  return null;
}

/** Si pianta un seme: il vaso parte annaffiato. */
export function plant(
  state: WeedState,
  index: number,
  strain: StrainId,
  now: number,
): WeedState | null {
  if (plantError(state, index, strain)) return null;
  const pots = [...state.pots!];
  const { x, y, kind, lamp } = pots[index];
  pots[index] = {
    kind,
    ...(lamp ? { lamp } : {}),
    ...(x !== undefined ? { x, y } : {}),
    strain,
    plantedAt: now,
    growAt: now,
    grown: 0,
    wateredAt: now,
    missed: 0,
  };
  const seeds = { ...state.seeds, [strain]: state.seeds![strain]! - 1 };
  if (!seeds[strain]) delete seeds[strain];
  return { ...state, pots, seeds };
}

/** Raccolto: il vaso si svuota e restituisce i grammi. null se la pianta non è pronta. */
export function harvestPot(
  state: WeedState,
  index: number,
  now: number,
): { state: WeedState; grams: number; strain: StrainId; plantedAt: number } | null {
  const pot = state.pots?.[index];
  if (!pot?.strain || !pot.plantedAt || potProgress(pot, now) < 1) return null;
  const grams = expectedGrams(pot, now);
  const pots = [...state.pots!];
  pots[index] = {
    kind: pot.kind,
    ...(pot.lamp ? { lamp: pot.lamp } : {}),
    ...(pot.x !== undefined ? { x: pot.x, y: pot.y } : {}),
  };
  return {
    state: { ...state, pots, jarStrain: pot.strain },
    grams,
    strain: pot.strain,
    plantedAt: pot.plantedAt,
  };
}

/** Una lampada nuova (o migliore) sul vaso: la crescita fatta resta, da adesso va più veloce. */
export function setLamp(pot: Pot, lamp: 1 | 2 | 3, now: number): Pot {
  if (!pot.strain || !pot.plantedAt || pot.legacy) return { ...pot, lamp };
  return { ...pot, grown: potProgress(pot, now), growAt: now, lamp };
}

export function buyPotError(state: WeedState, kind: PotKind, money: number): string | null {
  if ((state.pots?.length ?? 0) >= MAX_POTS)
    return `Hai già ${MAX_POTS} vasi: è il massimo per una stanza.`;
  if (money < POTS[kind].price) return 'Non hai abbastanza soldi in cassaforte.';
  return null;
}

export function buyLampError(pot: Pot | undefined, lamp: 1 | 2 | 3, money: number): string | null {
  if (!pot) return 'Questo vaso non c’è.';
  if ((pot.lamp ?? 0) >= lamp) return 'Su questo vaso c’è già una lampada uguale o migliore.';
  if (money < LAMPS[lamp].price) return 'Non hai abbastanza soldi in cassaforte.';
  return null;
}

// ---------------------------------------------------------------- mercato

/** Grammi in una bustina dello spacciatore. */
export const BAG_GRAMS = 10;

/**
 * Il prezzo minimo di una bustina allo spacciatore: il 90% di quanto costa coltivarla con la
 * varietà più conveniente (semi diviso grammi in un vaso di terra, a cura piena). Cambia da solo
 * se cambiano semi o rese.
 */
export function bagFloorPrice(): number {
  const cheapest = Math.min(...STRAIN_IDS.map((id) => STRAINS[id].price / STRAINS[id].grams));
  return Math.round(0.9 * cheapest * BAG_GRAMS);
}

// ---------------------------------------------------------------- canne

/** Ogni canna fumata nelle ultime 24 ore toglie il 10% dell'effetto, fino a dimezzarlo. */
export function jointHappiness(smokes: readonly number[] | undefined, now: number): number {
  const recent = (smokes ?? []).filter((t) => now - t < DAY && t <= now).length;
  return Math.round(JOINT_HAPPY * Math.max(0.5, 1 - 0.1 * recent));
}

/** Le canne da ricordare dopo averne fumata una adesso. */
export const afterSmoke = (smokes: readonly number[] | undefined, now: number): number[] =>
  [...(smokes ?? []).filter((t) => now - t < DAY && t <= now), now].slice(-20);

/** Toglie una canna dal barattolo; null se è vuoto. */
export function takeJoint(state: WeedState): WeedState | null {
  if (state.grams < JOINT_GRAMS) return null;
  const grams = state.grams - JOINT_GRAMS;
  if (grams > 0) return { ...state, grams };
  // barattolo vuoto: sparisce (e il prossimo comparirà dove c'era la pianta)
  const { jarStrain: _s, jarX: _x, jarY: _y, ...rest } = state;
  return { ...rest, grams };
}

// ---------------------------------------------------------------- salvataggio

const clampX = (v: number) => Math.max(-200, Math.min(200, v));
const clampY = (v: number) => Math.max(-180, Math.min(180, v));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function decodePot(value: unknown): Pot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== 'string' || !(v.kind in POTS)) return null;
  const pot: Pot = { kind: v.kind as PotKind };
  if (v.lamp === 1 || v.lamp === 2 || v.lamp === 3) pot.lamp = v.lamp;
  if (num(v.x) && num(v.y)) {
    pot.x = clampX(v.x);
    pot.y = clampY(v.y);
  }
  if (isStrain(v.strain) && num(v.plantedAt) && v.plantedAt > 0) {
    pot.strain = v.strain;
    pot.plantedAt = v.plantedAt;
    pot.growAt = num(v.growAt) && v.growAt >= v.plantedAt ? v.growAt : v.plantedAt;
    pot.grown = num(v.grown) ? Math.max(0, Math.min(1, v.grown)) : 0;
    if (v.legacy === true) pot.legacy = true;
    else {
      pot.wateredAt = num(v.wateredAt) && v.wateredAt > 0 ? v.wateredAt : v.plantedAt;
      pot.missed =
        Number.isSafeInteger(v.missed) && (v.missed as number) > 0 ? (v.missed as number) : 0;
    }
  }
  return pot;
}

/**
 * Legge lo stato dal salvataggio scartando i valori non validi. I salvataggi di prima avevano una
 * sola pianta comprata col vaso: chi l'aveva si ritrova un vaso di terra (con la pianta, che
 * finisce di crescere con le regole di prima).
 */
export function decodeWeed(value: unknown): WeedState {
  const out = emptyWeed();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  if (Number.isSafeInteger(v.grams) && (v.grams as number) > 0)
    out.grams = Math.min(100000, v.grams as number);
  if (out.grams > 0 && isStrain(v.jarStrain)) out.jarStrain = v.jarStrain;
  if (out.grams > 0 && num(v.jarX) && num(v.jarY)) {
    out.jarX = clampX(v.jarX);
    out.jarY = clampY(v.jarY);
  }
  if (v.seeds && typeof v.seeds === 'object') {
    const seeds: Partial<Record<StrainId, number>> = {};
    for (const id of STRAIN_IDS) {
      const n = (v.seeds as Record<string, unknown>)[id];
      if (Number.isSafeInteger(n) && (n as number) > 0) seeds[id] = Math.min(1000, n as number);
    }
    if (Object.keys(seeds).length) out.seeds = seeds;
  }
  if (Array.isArray(v.pots)) {
    const pots = v.pots
      .map(decodePot)
      .filter((p): p is Pot => !!p)
      .slice(0, MAX_POTS);
    if (pots.length) out.pots = pots;
  } else if ((isStrain(v.strain) && num(v.plantedAt) && v.plantedAt > 0) || num(v.potX)) {
    // salvataggio di prima
    const pot: Pot = { kind: 'soil' };
    if (num(v.potX) && num(v.potY)) {
      pot.x = clampX(v.potX);
      pot.y = clampY(v.potY);
    }
    if (isStrain(v.strain) && num(v.plantedAt) && v.plantedAt > 0)
      Object.assign(pot, {
        strain: v.strain,
        plantedAt: v.plantedAt,
        growAt: v.plantedAt,
        grown: 0,
        legacy: true,
      });
    out.pots = [pot];
  }
  if (Array.isArray(v.smokes))
    out.smokes = v.smokes.filter((t): t is number => num(t) && t > 0).slice(-20);
  return out;
}

// ---------------------------------------------------------------- testi

/** Una durata come "3 giorni e 4 ore". */
export function durationText(ms: number): string {
  const totalHours = Math.ceil(Math.max(0, ms) / HOUR);
  const days = Math.floor(totalHours / 24),
    hours = totalHours % 24;
  if (days <= 0) return `${hours} ${hours === 1 ? 'ora' : 'ore'}`;
  return `${days} ${days === 1 ? 'giorno' : 'giorni'}${hours ? ` e ${hours} ${hours === 1 ? 'ora' : 'ore'}` : ''}`;
}

/** Quanto ci mette a crescere una varietà in un vaso di terra senza lampada (per il negozio). */
export const growTimeText = (strain: StrainId): string => durationText(growMsFor(strain));
