// L'aperitivo al bancone del bar: ci si siede su uno sgabello, il barista prende bottiglia e
// bicchiere dal mobile alle sue spalle, posa il bicchiere sul bancone e versa; poi si beve in tre
// sorsi e ci si alza. Qui ci sono solo i tempi e le posizioni: niente browser, si prova nei test.

/** Prezzo ed effetti dell'aperitivo (fame e felicità in punti percentuali). */
export const APERITIVO = { price: 5, hunger: 25, happiness: 5 };

/** I momenti della scena, in secondi da quando il cliente è seduto. */
export const BAR_TIMES = {
  /** il barista arriva al mobile dietro di sé, all'altezza del cliente */
  atShelf: 1.2,
  /** ha preso bottiglia e bicchiere */
  picked: 2.2,
  /** è tornato al bancone, davanti al cliente */
  atCounter: 2.9,
  /** il bicchiere è posato sul bancone */
  placed: 3.4,
  /** ha finito di versare */
  poured: 5.6,
  /** ha rimesso la bottiglia nel mobile */
  shelved: 6.6,
  /** è di nuovo al suo posto */
  idle: 7.6,
  /** il cliente prende il bicchiere */
  take: 6,
  /** i sorsi: uno ogni tanti secondi */
  sips: 3,
  sipEvery: 1.4,
} as const;

/** Quando il bicchiere è finito e ci si alza. */
export const DRINK_END = BAR_TIMES.take + BAR_TIMES.sips * BAR_TIMES.sipEvery + 0.5;

/** Dove si muove il barista, dietro il bancone. */
export interface BarSpots {
  /** dove aspetta i clienti */
  idle: { x: number; y: number };
  /** quanto si avvicina al mobile per prendere le cose */
  shelfY: number;
  /** quanto si avvicina al bancone per servire */
  counterY: number;
}

export interface BarMoment {
  bartender: {
    x: number;
    y: number;
    /** girato verso il mobile (di spalle a chi guarda) */
    back: boolean;
    walking: boolean;
    /** 0–1: le braccia salgono verso le mensole */
    reach: number;
    bottle: boolean;
    glass: boolean;
    /** 0–1: quanto è inclinata la bottiglia mentre versa */
    pour: number;
  };
  /** dov'è il bicchiere del cliente */
  glass: 'none' | 'counter' | 'hand';
  /** 0–1: quanto è pieno */
  fill: number;
  /** 0–1: quanto è alzato il braccio del cliente (1 = bicchiere alla bocca) */
  sip: number;
  done: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * ease(k);
const span = (e: number, from: number, to: number) => (e - from) / (to - from);

/** Il braccio del sorso numero k: sale, resta alla bocca, scende (0–1). */
function sipArm(e: number, k: number): number {
  const start = BAR_TIMES.take + 0.3 + k * BAR_TIMES.sipEvery;
  const t = e - start;
  if (t <= 0 || t >= 1.2) return 0;
  if (t < 0.4) return ease(t / 0.4);
  if (t < 0.8) return 1;
  return 1 - ease((t - 0.8) / 0.4);
}

/** Com'è la scena dopo `e` secondi, per il cliente sullo sgabello in `stoolX`. */
export function barMoment(e: number, stoolX: number, spots: BarSpots): BarMoment {
  const T = BAR_TIMES;
  const { idle, shelfY, counterY } = spots;
  const at = (x: number, y: number) => ({ x, y });
  let pos = at(idle.x, idle.y),
    back = false,
    walking = false,
    reach = 0,
    bottle = false,
    glass = false,
    pour = 0;
  if (e < T.atShelf) {
    // va verso il mobile, all'altezza del cliente
    const k = span(e, 0, T.atShelf);
    pos = at(mix(idle.x, stoolX, k), mix(idle.y, shelfY, k));
    walking = k < 1;
  } else if (e < T.picked) {
    // girato verso le mensole: allunga le braccia e prende bottiglia e bicchiere
    pos = at(stoolX, shelfY);
    back = true;
    const k = span(e, T.atShelf, T.picked);
    reach = k < 0.5 ? ease(k * 2) : 1 - ease((k - 0.5) * 2) * 0.6;
    bottle = glass = k > 0.55;
  } else if (e < T.atCounter) {
    pos = at(stoolX, mix(shelfY, counterY, span(e, T.picked, T.atCounter)));
    walking = true;
    bottle = glass = true;
  } else if (e < T.placed) {
    pos = at(stoolX, counterY);
    bottle = true;
    glass = e < T.placed - 0.15;
  } else if (e < T.poured) {
    pos = at(stoolX, counterY);
    bottle = true;
    const k = span(e, T.placed, T.poured);
    // inclina la bottiglia, versa, la raddrizza
    pour = k < 0.15 ? ease(k / 0.15) : k > 0.85 ? 1 - ease((k - 0.85) / 0.15) : 1;
  } else if (e < T.shelved) {
    const k = span(e, T.poured, T.shelved);
    pos = at(stoolX, mix(counterY, shelfY, k * 1.6));
    back = k > 0.6;
    walking = k < 0.6;
    bottle = k < 0.85;
    reach = back ? 0.7 : 0;
  } else if (e < T.idle) {
    const k = span(e, T.shelved, T.idle);
    pos = at(mix(stoolX, idle.x, k), mix(shelfY, idle.y, k));
    walking = k < 1;
  }

  const inHand = e >= T.take && e < DRINK_END;
  const onCounter = e >= T.placed && e < T.take;
  // si riempie mentre il barista versa (con un attimo di ritardo, il tempo di arrivare)
  const poured = ease(span(e, T.placed + 0.3, T.poured - 0.2));
  // si svuota un po' a ogni sorso, mentre il bicchiere è alla bocca
  let drunk = 0;
  let sip = 0;
  for (let k = 0; k < T.sips; k++) {
    const arm = sipArm(e, k);
    sip = Math.max(sip, arm);
    const start = T.take + 0.3 + k * T.sipEvery;
    drunk += clamp01((e - start - 0.4) / 0.4) / T.sips;
  }
  return {
    bartender: { x: pos.x, y: pos.y, back, walking, reach, bottle, glass, pour },
    glass: inHand ? 'hand' : onCounter ? 'counter' : 'none',
    fill: Math.max(0, poured - drunk),
    sip: inHand ? sip : 0,
    done: e >= DRINK_END,
  };
}

/** Cosa succede quando il bicchiere è finito: fame e felicità salgono, fino a 100. */
export function afterAperitivo(needs: { hunger: number; happiness: number }) {
  return {
    hunger: Math.min(100, needs.hunger + APERITIVO.hunger),
    happiness: Math.min(100, needs.happiness + APERITIVO.happiness),
  };
}
