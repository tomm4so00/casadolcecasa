// Dimensioni delle stanze: salone e cucina dell'appartamento sono più grandi delle altre, il cortile
// molto più largo (con le sue ali). La stanza privata resta 400×360 perché i giocatori vi hanno
// salvato la disposizione dei mobili.
import type { GameValue } from './context.js';
import { game } from './context.js';

const BASE_X = 200;
const BASE_Y = 180;
/** Quanto si allarga ogni ambiente rispetto alla misura di base; mobili e decorazioni lo seguono. */
const ENV_GROW: Record<string, number> = {
  SALOON: 1.25,
  KITCHEN: 1.25,
  lavoro_cantiere: 1.3,
  lavoro_ospedale: 1.3,
  lavoro_ristorante: 1.3,
  lavoro_ufficio: 1.3,
};
/** Ambienti con una misura propria e gli oggetti già sistemati a mano (metà larghezza e profondità). */
const ENV_HALF: Record<string, { x: number; y: number }> = {
  CORTILE: { x: 480, y: 220 },
  centro_commerciale: { x: 420, y: 200 },
  luna: { x: 300, y: 300 },
  // laboratorio ingegneristico (davanti) e la sua zona esterna (dietro)
  ingegneria: { x: 200, y: 380 },
};
/** Chi sta più vicino di così a una parete (porte, piante d'angolo) resta attaccato alla parete. */
const WALL_HUG = 45;

/** Imposta i limiti della stanza (game.X0…Y1) per l'ambiente in cui ci si trova. */
export function applyRoomBounds(env: string): void {
  const k = ENV_GROW[env] || 1;
  const half = ENV_HALF[env] || { x: BASE_X * k, y: BASE_Y * k };
  game.X0 = -half.x;
  game.X1 = half.x;
  game.Y0 = -half.y;
  game.Y1 = half.y;
}

function spread(c: number, base: number, k: number): number {
  return base - Math.abs(c) < WALL_HUG ? c + Math.sign(c) * base * (k - 1) : c * k;
}

function spreadItems(items: GameValue[], k: number): void {
  for (const it of items) {
    if (typeof it?.x === 'number') it.x = spread(it.x, BASE_X, k);
    if (typeof it?.y === 'number') it.y = spread(it.y, BASE_Y, k);
    // estremi di ciò che va da un punto a un altro (il nastro tra i coni)
    if (typeof it?.ax === 'number') it.ax = spread(it.ax, BASE_X, k);
    if (typeof it?.bx === 'number') it.bx = spread(it.bx, BASE_X, k);
    if (typeof it?.ay === 'number') it.ay = spread(it.ay, BASE_Y, k);
    if (typeof it?.by === 'number') it.by = spread(it.by, BASE_Y, k);
  }
}

/** Sposta mobili, decorazioni e luci degli ambienti più grandi; si chiama una volta all'avvio. */
export function growSceneData(): void {
  const maps: Record<string, GameValue> = {
    SALOON: game.saloonDoors,
    KITCHEN: game.kitchenFurniture,
    BATHROOM: game.bathroomFurniture,
  };
  for (const [env, k] of Object.entries(ENV_GROW)) {
    if (maps[env]) spreadItems(Object.values(maps[env]), k);
    spreadItems(game.ENV_DECOR[env] || [], k);
    spreadItems(game.ENV_PROPS[env] || [], k);
    // nei lavori anche i punti di consegna
    if (env.startsWith('lavoro_')) spreadItems(game.WORK_JOBS[env.slice(7)]?.targets || [], k);
    const st: GameValue = game.ENV_STYLE[env];
    if (!st) continue;
    for (const side of Object.keys(st.decor || {})) for (const d of st.decor[side]) d.u *= k;
    if (st.rug) for (const f of ['u', 'v', 'w', 'h']) st.rug[f] *= k;
    for (const li of st.lights || []) {
      li.x *= k;
      li.y *= k;
      li.r *= k;
    }
  }
}
