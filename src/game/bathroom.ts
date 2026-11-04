// Animazioni del bagno: WC, lavarsi le mani al lavandino e doccia (spogliandosi prima di entrare).
import type { GameValue } from './context.js';
import { game } from './context.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';

const ease = (k: number): number => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};

/** Muove il personaggio da a verso b (k da 0 a 1) e lo fa camminare. */
function walk(a: { x: number; y: number }, b: { x: number; y: number }, k: number): void {
  const e = ease(k);
  game.playerPos.x = a.x + (b.x - a.x) * e;
  game.playerPos.y = a.y + (b.y - a.y) * e;
  game.isWalking = k < 1;
}

/** Punto davanti al box doccia dove ci si spoglia e dove restano i vestiti piegati. */
export function showerSpots() {
  const sh: GameValue = game.bathroomFurniture.shower;
  return {
    undress: { x: sh.x - 60, y: sh.y + 55 },
    pile: { x: sh.x - 86, y: sh.y + 62 },
    inside: { x: sh.x, y: sh.y + 4 },
  };
}

// ---------------------------------------------------------------- doccia

// Tempi (secondi): si va davanti al box, ci si spoglia un pezzo alla volta, si entra,
// ci si lava, si esce e ci si riveste.
const SH = { toSpot: 0.7, undress: 1.6, enter: 0.7, wash: 3, exit: 0.7, dress: 1.4 };
const STEP_COUNT = 4;

export function startShower(): void {
  if (game.showerAnim || game.bathAnim) return;
  game.showerAnim = {
    t0: game.animClock,
    fromX: game.playerPos.x,
    fromY: game.playerPos.y,
    hy0: game.player.hygieneLevel,
    und: 0,
    soundOn: false,
  };
}

export function updateShower(now: number): void {
  const a: GameValue = game.showerAnim;
  const spot = showerSpots();
  const from = { x: a.fromX, y: a.fromY };
  let e = now - a.t0;
  if (e < SH.toSpot) {
    walk(from, spot.undress, e / SH.toSpot);
    a.und = 0;
    return;
  }
  e -= SH.toSpot;
  if (e < SH.undress) {
    walk(spot.undress, spot.undress, 1);
    a.und = Math.min(STEP_COUNT, 1 + Math.floor((e / SH.undress) * STEP_COUNT));
    return;
  }
  e -= SH.undress;
  a.und = STEP_COUNT;
  if (e < SH.enter) {
    walk(spot.undress, spot.inside, e / SH.enter);
    return;
  }
  e -= SH.enter;
  if (e < SH.wash) {
    walk(spot.inside, spot.inside, 1);
    if (!a.soundOn) {
      a.soundOn = true;
      sfx('shower');
    }
    game.player.hygieneLevel = Math.max(
      game.player.hygieneLevel,
      a.hy0 + (100 - a.hy0) * (e / SH.wash),
    );
    return;
  }
  e -= SH.wash;
  game.player.hygieneLevel = 100;
  if (e < SH.exit) {
    walk(spot.inside, spot.undress, e / SH.exit);
    return;
  }
  e -= SH.exit;
  if (e < SH.dress) {
    walk(spot.undress, spot.undress, 1);
    a.und = STEP_COUNT - Math.min(STEP_COUNT, Math.floor((e / SH.dress) * (STEP_COUNT + 1)));
    return;
  }
  game.player.stats.showers++;
  game.showerAnim = null;
  game.isWalking = false;
  toast('Doccia completata! 🚿 Ti sei rivestito.');
}

/** Pezzi di vestiti tolti in questo momento (0 = vestito, 4 = in mutande). */
export const myUndressStep = (): number => (game.showerAnim ? game.showerAnim.und || 0 : 0);

// ---------------------------------------------------------------- WC e lavandino

/** Felicità data dal WC (si può usare solo DAILY_LIMITS.wc volte al giorno). */
const WC_HAPPY = 3;
const TOILET = { approach: 0.6, sit: 0.35, stay: 2.8, stand: 0.4 };
const WASH = { approach: 0.6, rub: 2.4 };

export function startToilet(): void {
  if (game.showerAnim || game.bathAnim) return;
  game.bathAnim = {
    kind: 'toilet',
    t0: game.animClock,
    fromX: game.playerPos.x,
    fromY: game.playerPos.y,
  };
}

export function startWash(): void {
  if (game.showerAnim || game.bathAnim) return;
  game.bathAnim = {
    kind: 'wash',
    t0: game.animClock,
    fromX: game.playerPos.x,
    fromY: game.playerPos.y,
  };
}

/** Posa del personaggio durante l'animazione: 'sit' sul WC, 'wash' al lavandino. */
export function myBathPose(): string {
  return game.bathAnim?.pose || '';
}

export function updateBathroom(now: number): void {
  const a: GameValue = game.bathAnim;
  const from = { x: a.fromX, y: a.fromY };
  let e = now - a.t0;
  if (a.kind === 'toilet') {
    const t: GameValue = game.bathroomFurniture.toilet;
    const front = { x: t.x, y: t.y + 42 },
      seat = { x: t.x, y: t.y + 4 };
    if (e < TOILET.approach) return walk(from, front, e / TOILET.approach);
    e -= TOILET.approach;
    if (e < TOILET.sit) {
      a.pose = 'sit';
      return walk(front, seat, e / TOILET.sit);
    }
    e -= TOILET.sit;
    if (e < TOILET.stay) {
      a.pose = 'sit';
      return walk(seat, seat, 1);
    }
    e -= TOILET.stay;
    if (e < TOILET.stand) {
      a.pose = '';
      if (!a.flushed) {
        a.flushed = true;
        game.toiletFlushAt = now;
        sfx('shower');
      }
      return walk(seat, front, e / TOILET.stand);
    }
    game.bathAnim = null;
    game.isWalking = false;
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + WC_HAPPY);
    toast(`Che sollievo! 🚽 (Felicità +${WC_HAPPY}%)`);
    return;
  }
  // lavandino
  const sk: GameValue = game.bathroomFurniture.sink;
  // attaccati al bordo del lavandino: le mani arrivano sotto il rubinetto
  const front = { x: sk.x, y: sk.y + sk.h / 2 + 9 };
  if (e < WASH.approach) return walk(from, front, e / WASH.approach);
  e -= WASH.approach;
  if (e < WASH.rub) {
    a.pose = 'wash';
    if (!a.soundOn) {
      a.soundOn = true;
      sfx('shower');
    }
    return walk(front, front, 1);
  }
  game.bathAnim = null;
  game.isWalking = false;
  game.player.hygieneLevel = Math.min(100, game.player.hygieneLevel + 20);
  toast('Ti sei lavato le mani 🚰 (Igiene +20%)');
}
