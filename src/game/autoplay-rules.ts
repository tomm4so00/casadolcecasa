// Il personaggio vive da solo quando il giocatore non c'è (senza dipendenze dal browser, così è
// testabile). Ogni giocatore online calcola da sé cosa fanno gli offline: la giornata è divisa in
// turni e il posto di ogni turno lo sceglie un "dado" che dipende solo dal codice del personaggio
// e dall'ora, quindi tutti vedono la stessa cosa senza scrivere niente nel database.
// Nei posti si cammina tra punti fissi, più piano di chi gioca e sempre più piano man mano che i
// parametri calano; sotto il 20% si torna a letto. Di notte si dorme. Non si spendono soldi,
// tranne il Giocatore d'azzardo: 3 giocate alla slot al giorno, contate al rientro.
import type { PersonalityId } from './personality-rules.js';
import { SLOT_BET, reelSymbol, slotWin, type SlotSymbol } from './betting-rules.js';

/** I parametri di chi è via calano tante volte più piano: da pieni durano circa una settimana. */
export const ABSENCE_SLOWDOWN = 7;
/**
 * Chi non entra per ABANDON_DAYS giorni (fuori dalla capsula) muore di abbandono e la sua stanza
 * si libera. Con i parametri che durano una settimana, più o meno quando morirebbe di fame.
 */
export const ABANDON_DAYS = 10;
export const ABANDON_MS = ABANDON_DAYS * 24 * 3600000;

/** Sotto questa soglia (il parametro più basso) il personaggio torna nel suo letto. */
export const BED_THRESHOLD = 20;
/** Appena usciti si resta dove si era per un po' (non si sparisce sotto gli occhi degli altri). */
export const AUTOPLAY_GRACE_MS = 3 * 60_000;
/** Ogni turno un posto nuovo. */
export const SLOT_MS = 12 * 60_000;
/** Velocità a parametri pieni: il 60% di chi gioca (130). Con i parametri al minimo, la metà. */
export const AUTOPLAY_SPEED = 130 * 0.6;
/** Sosta a ogni punto del percorso. */
export const PAUSE_MS = 25_000;
/** Si dorme dall'1 alle 8 (ora italiana, uguale per tutti). */
export const NIGHT_FROM = 1;
export const NIGHT_TO = 8;
/** Il Giocatore d'azzardo: giocate al giorno e soldi minimi in cassaforte per farle. */
export const GAMBLES_PER_DAY = 3;
export const GAMBLE_MIN_VAULT = 50;

export interface AutoplayPlace {
  env: string;
  /** Punti liberi tra cui si cammina in linea retta (controllati da un test nel browser). */
  points: [number, number][];
  /** Cosa sta facendo, per l'etichetta sopra la testa. */
  label: string;
}

export const AUTOPLAY_PLACES = {
  cortile: {
    env: 'CORTILE',
    points: [
      [-60, 70],
      [100, 70],
      [100, 170],
      [-60, 170],
    ],
    label: '🌳 passeggia nel cortile',
  },
  ronda: {
    env: 'CORTILE',
    points: [
      [-450, 60],
      [-250, 60],
      [-250, 140],
      [-450, 140],
    ],
    label: '🕵️ fa la ronda nel cortile',
  },
  parco: {
    env: 'passeggiata',
    points: [
      [100, 170],
      [300, 170],
      [300, 240],
      [100, 240],
    ],
    label: '🌳 passeggia al parco',
  },
  bar: {
    env: 'bar',
    points: [
      [-30, 0],
      [30, 0],
      [30, 120],
      [-30, 120],
    ],
    label: '☕ prende un caffè al bar',
  },
  discoteca: {
    env: 'discoteca',
    points: [
      [-60, 60],
      [60, 60],
      [60, -40],
      [-60, -40],
    ],
    label: '🕺 balla in discoteca',
  },
  laboratorio: {
    env: 'laboratorio',
    points: [
      [-70, 30],
      [70, 30],
      [0, 110],
    ],
    label: '🎨 dipinge al laboratorio',
  },
  galleria: {
    env: 'galleria',
    points: [
      [-150, 60],
      [150, 60],
      [0, 140],
    ],
    label: '🖼️ guarda i quadri in galleria',
  },
  ingegneria: {
    env: 'ingegneria',
    points: [
      [-60, 150],
      [60, 220],
      [-60, 300],
    ],
    label: '🔧 lavora al laboratorio ingegneristico',
  },
  banca: {
    env: 'banca',
    points: [
      [-40, 40],
      [60, 100],
      [-40, 130],
    ],
    label: '🏦 sbriga affari in banca',
  },
  mall: {
    env: 'centro_commerciale',
    points: [
      [-250, 150],
      [0, 200],
      [250, 150],
      [0, 80],
    ],
    label: '🛍️ fa un giro al centro commerciale',
  },
  scommesse: {
    env: 'scommesse',
    points: [
      [-175, -160],
      [60, -130],
      [0, 0],
    ],
    label: '🎰 gioca alla slot',
  },
  commissariato: {
    env: 'commissariato',
    points: [
      [0, 100],
      [-150, -40],
      [120, 150],
    ],
    label: '👮 passa dal commissariato',
  },
} as const satisfies Record<string, AutoplayPlace>;

export type PlaceId = keyof typeof AUTOPLAY_PLACES;
const PLACE_IDS = Object.keys(AUTOPLAY_PLACES) as PlaceId[];

/** I posti di ogni personalità. */
export const PERSONALITY_PLACES: Record<PersonalityId, PlaceId[]> = {
  artist: ['laboratorio', 'galleria'],
  business: ['banca', 'mall'],
  criminal: ['ronda', 'bar'],
  romantic: ['parco', 'cortile'],
  addict: ['bar', 'parco'],
  gambler: ['scommesse'],
  partier: ['discoteca', 'bar'],
  animals: ['parco', 'cortile'],
  scientist: ['ingegneria'],
  vigilante: ['commissariato', 'ronda'],
};

/** Quante volte su cento va nei posti suoi: senza personalità, con qualche punto, livelli 1-3. */
export const SPECIFIC_SHARE = { none: 0, lead: 0.3, levels: [0.6, 0.75, 0.9] } as const;
/** Del resto, quanto va al secondo tratto. */
export const SECOND_SHARE = 0.1;

/** Cosa sa del personaggio chi lo guarda (dalla sua presenza, che resta quando esce). */
export interface AutoplayInfo {
  pid: string;
  /** Quando è uscito (ora del server). */
  offAt: number;
  /** Quando tornerà a letto (previsione del suo gioco; 0 = non si sa). */
  bedAt: number;
  /** Il parametro più basso quando è uscito. */
  need: number;
  pers?: PersonalityId;
  persLv?: number;
  pers2?: PersonalityId;
  /** La personalità più sviluppata, per chi non ne ha ancora una. */
  lead?: PersonalityId;
}

// ---------------------------------------------------------------- dado

/** Un numero tra 0 e 1 che dipende solo dal testo (uguale su ogni dispositivo). */
export function dice(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // un giro di mescolamento (mulberry32)
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const romeFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  hour: 'numeric',
  hourCycle: 'h23',
});
const romeDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' });

/** L'ora italiana (0-23): la notte è la stessa per tutti, ovunque si giochi. */
export const romeHour = (t: number): number => Number(romeFmt.format(new Date(t))) % 24;
/** Il giorno italiano, AAAA-MM-GG. */
export const romeDay = (t: number): string => romeDayFmt.format(new Date(t));

export const isNight = (t: number): boolean => {
  const h = romeHour(t);
  return h >= NIGHT_FROM && h < NIGHT_TO;
};

// ---------------------------------------------------------------- dove va

/** Il posto del turno `slot`: i suoi, del secondo tratto o uno qualunque. */
export function placeFor(info: AutoplayInfo, slot: number): PlaceId {
  const r = dice(`${info.pid}:${slot}:posto`);
  const pick = (list: readonly PlaceId[], salt: string) =>
    list[Math.floor(dice(`${info.pid}:${slot}:${salt}`) * list.length)];
  const main = info.pers ?? info.lead;
  const share = info.pers
    ? SPECIFIC_SHARE.levels[Math.min(3, Math.max(1, info.persLv || 1)) - 1]
    : info.lead
      ? SPECIFIC_SHARE.lead
      : SPECIFIC_SHARE.none;
  if (main && r < share) return pick(PERSONALITY_PLACES[main], 'suo');
  if (info.pers2 && r < share + SECOND_SHARE)
    return pick(PERSONALITY_PLACES[info.pers2], 'secondo');
  return pick(PLACE_IDS, 'caso');
}

/** Il parametro più basso a quell'ora: da quello di quando è uscito, giù fino alla soglia del letto. */
export function needAt(info: AutoplayInfo, t: number): number {
  if (!(info.bedAt > info.offAt)) return info.need;
  const k = Math.max(0, Math.min(1, (t - info.offAt) / (info.bedAt - info.offAt)));
  return info.need + (BED_THRESHOLD - info.need) * k;
}

/** Velocità con i parametri di quel momento: dal 60% di chi gioca fino alla metà. */
export const speedAt = (need: number): number =>
  AUTOPLAY_SPEED * (0.5 + (0.5 * Math.max(0, Math.min(100, need))) / 100);

export type AutoplayView =
  | { kind: 'still' }
  | { kind: 'bed' }
  | {
      kind: 'place';
      place: PlaceId;
      env: string;
      x: number;
      y: number;
      moving: boolean;
      dir: { x: number; y: number };
      speed: number;
      label: string;
    };

/**
 * Cosa fa un personaggio offline all'ora `t`: fermo dov'era (appena uscito), a letto (di notte o
 * con i parametri sotto la soglia), oppure in un posto, in cammino tra i suoi punti.
 */
export function autoplayAt(info: AutoplayInfo, t: number): AutoplayView {
  if (t < info.offAt + AUTOPLAY_GRACE_MS) return { kind: 'still' };
  if ((info.bedAt > 0 && t >= info.bedAt) || isNight(t)) return { kind: 'bed' };
  const slot = Math.floor(t / SLOT_MS);
  const place = placeFor(info, slot);
  const p = AUTOPLAY_PLACES[place] as AutoplayPlace;
  const speed = speedAt(needAt(info, slot * SLOT_MS));
  // un giro tra i punti, partendo da uno a caso: cammino, sosta, cammino, sosta…
  const n = p.points.length;
  const start = Math.floor(dice(`${info.pid}:${slot}:via`) * n);
  const legs = Array.from({ length: n }, (_, i) => {
    const a = p.points[(start + i) % n],
      b = p.points[(start + i + 1) % n];
    return { a, b, walk: (Math.hypot(b[0] - a[0], b[1] - a[1]) / speed) * 1000 };
  });
  const loop = legs.reduce((s, l) => s + l.walk + PAUSE_MS, 0);
  let left = (t - slot * SLOT_MS) % loop;
  for (const l of legs) {
    if (left < PAUSE_MS)
      return {
        kind: 'place',
        place,
        env: p.env,
        x: l.a[0],
        y: l.a[1],
        moving: false,
        dir: { x: 0, y: 1 },
        speed,
        label: p.label,
      };
    left -= PAUSE_MS;
    if (left < l.walk) {
      const k = left / l.walk;
      const dx = l.b[0] - l.a[0],
        dy = l.b[1] - l.a[1];
      return {
        kind: 'place',
        place,
        env: p.env,
        x: l.a[0] + dx * k,
        y: l.a[1] + dy * k,
        moving: true,
        dir: { x: dx, y: dy },
        speed,
        label: p.label,
      };
    }
    left -= l.walk;
  }
  const a = legs[0].a;
  return {
    kind: 'place',
    place,
    env: p.env,
    x: a[0],
    y: a[1],
    moving: false,
    dir: { x: 0, y: 1 },
    speed,
    label: p.label,
  };
}

// ---------------------------------------------------------------- al rientro

/** Le ore da sveglio (di giorno, prima del letto) tra `from` e `to`, campionate a ogni turno. */
function awakeSlots(info: AutoplayInfo, from: number, to: number): number[] {
  const out: number[] = [];
  const end = info.bedAt > 0 ? Math.min(to, info.bedAt) : to;
  for (let s = Math.ceil((from + AUTOPLAY_GRACE_MS) / SLOT_MS); s * SLOT_MS < end; s++)
    if (!isNight(s * SLOT_MS)) out.push(s);
  return out;
}

/** Il diario dell'assenza: quanto tempo in ogni posto (i tre più frequenti) e se è andato a letto. */
export function absenceDiary(
  info: AutoplayInfo,
  from: number,
  to: number,
): { place: PlaceId; label: string; minutes: number }[] {
  const minutes = new Map<PlaceId, number>();
  for (const s of awakeSlots(info, from, to)) {
    const place = placeFor(info, s);
    minutes.set(place, (minutes.get(place) || 0) + SLOT_MS / 60_000);
  }
  return [...minutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([place, m]) => ({ place, label: AUTOPLAY_PLACES[place].label, minutes: m }));
}

/**
 * Le giocate del Giocatore d'azzardo durante l'assenza: 3 al giorno nei giorni in cui era in
 * giro, alla puntata minima, solo con almeno GAMBLE_MIN_VAULT in cassaforte. `prize` aggiunge il
 * premio della personalità. Restituisce le giocate e quanto si è vinto o perso in tutto.
 */
export function absenceGambles(
  info: AutoplayInfo,
  from: number,
  to: number,
  vault: number,
  prize: (win: number) => number = (w) => w,
): { spins: { reels: SlotSymbol[]; win: number }[]; net: number } {
  const days = [...new Set(awakeSlots(info, from, to).map((s) => romeDay(s * SLOT_MS)))].slice(
    0,
    14,
  );
  const spins: { reels: SlotSymbol[]; win: number }[] = [];
  let money = vault,
    net = 0;
  for (const day of days)
    for (let i = 0; i < GAMBLES_PER_DAY; i++) {
      if (money < GAMBLE_MIN_VAULT) break;
      const reels = [0, 1, 2].map((r) => reelSymbol(dice(`${info.pid}:${day}:slot${i}:${r}`)));
      const win = prize(slotWin(reels));
      money += win - SLOT_BET;
      net += win - SLOT_BET;
      spins.push({ reels, win });
    }
  return { spins, net };
}

/** "2 ore e 24 minuti", "36 minuti". */
export function minutesText(m: number): string {
  const h = Math.floor(m / 60),
    r = Math.round(m % 60);
  if (!h) return `${r} minuti`;
  const hs = h === 1 ? '1 ora' : `${h} ore`;
  return r ? `${hs} e ${r} minuti` : hs;
}
