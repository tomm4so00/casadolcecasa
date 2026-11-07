// Telecamera: sul telefono la scena è più grande e segue il giocatore, con una zona morta
// al centro (si muove solo quando ti avvicini al bordo) e senza mai uscire dalla stanza.
import { game } from './context.js';
import type { CameraState } from './models.js';

const PHONE_ZOOM = 1.6; // quanto si ingrandisce la scena sul telefono
const MAX_SCALE = 1.6;
const DEAD_U = 0.16; // zona morta: frazione della larghezza visibile per lato
const DEAD_V = 0.14; // ... e dell'altezza
const FOLLOW = 7; // rapidità con cui la telecamera raggiunge il giocatore
const MARGIN = 20; // spazio oltre muri e pavimento che resta visibile ai bordi
const BODY_Z = 25; // altezza del busto: si inquadra lui, non i piedi
const OFFSET_Y = 55; // la scena è disegnata 55 px sotto il centro dello schermo

const phoneQuery =
  typeof matchMedia === 'function'
    ? matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 520px)')
    : null;
// letto una volta e aggiornato quando cambia: chiederlo al browser a ogni punto disegnato è lento
let isPhone = !!phoneQuery?.matches;
phoneQuery?.addEventListener?.('change', (e) => (isPhone = e.matches));

/**
 * Superficie convessa (la luna): più ci si allontana dal centro, più il terreno scende, come su
 * una sfera. È 0 negli altri ambienti.
 */
export function surfaceDrop(x: number, y: number): number {
  const k = game.moonCurve || 0;
  return k ? k * (x * x + y * y) : 0;
}

/** Cambiando stanza la scena riparte dal nero e si schiarisce (dopo che è comparsa all'avvio). */
const FADE_IN = 0.45;
let fadedEnv = '';
export function fadeOnRoomChange(): void {
  const env = game.view.activeEnvironment;
  if (env === fadedEnv) return;
  const first = !fadedEnv;
  fadedEnv = env;
  const canvas: HTMLCanvasElement = game.view.canvas;
  if (first || !canvas?.dataset.revealed) return;
  canvas.style.transition = 'none';
  canvas.style.opacity = '0';
  // il nero deve arrivare a schermo prima che parta la dissolvenza
  requestAnimationFrame(() => {
    canvas.style.transition = `opacity ${FADE_IN}s ease-out`;
    canvas.style.opacity = '1';
  });
}

/**
 * Scala della scena intera: come prima sul computer, ingrandita sul telefono. Anche mentre si
 * arreda resta la stessa: la stanza non si rimpicciolisce, la telecamera segue il mobile.
 */
export function cameraScale(): number {
  const w = game.view.canvas.width,
    h = game.view.canvas.height;
  const fit = Math.min(w / 450, h / 600, 1.2);
  return isPhone ? Math.min(fit * PHONE_ZOOM, MAX_SCALE) : fit;
}

/**
 * Spostamento della telecamera in pixel interi: pavimento, oggetti e personaggi si spostano
 * tutti dello stesso numero di pixel, così non tremolano l'uno rispetto all'altro.
 */
export function cameraPx(s: number): { u: number; v: number } {
  const cam = game.cam;
  return cam ? { u: Math.round(cam.u * s), v: Math.round(cam.v * s) } : { u: 0, v: 0 };
}

/** Limiti (in unità isometriche prima della scala) di pavimento e pareti della stanza. */
function sceneExtent(): { u0: number; u1: number; v0: number; v1: number } {
  // nel cortile le palazzine (fino a 3 piani, tetto e camino) sono più alte delle pareti
  const wallH =
    game.view.activeEnvironment === 'CORTILE'
      ? 250
      : game.ENV_STYLE[game.view.activeEnvironment]?.wallH || 130;
  return {
    u0: (game.X0 - game.Y1) * 0.866 - MARGIN,
    u1: (game.X1 - game.Y0) * 0.866 + MARGIN,
    v0: (game.X0 + game.Y0) * 0.5 - wallH - MARGIN,
    v1: (game.X1 + game.Y1) * 0.5 + MARGIN + surfaceDrop(game.X1, game.Y1),
  };
}

/** Fin dove può spostarsi la telecamera; [0, 0] su un asse dove la stanza sta tutta nello schermo. */
export function cameraRange(s = cameraScale()): { u0: number; u1: number; v0: number; v1: number } {
  const w = game.view.canvas.width / s,
    h = game.view.canvas.height / s;
  const e = sceneExtent();
  const half = OFFSET_Y / s;
  let [u0, u1] = [e.u0 + w / 2, e.u1 - w / 2];
  let [v0, v1] = [e.v0 + h / 2 + half, e.v1 - h / 2 + half];
  if (u0 > u1) u0 = u1 = 0; // stanza più stretta dello schermo: resta centrata
  if (v0 > v1) v0 = v1 = 0;
  return { u0, u1, v0, v1 };
}

/**
 * Muove la telecamera verso il giocatore; al cambio di ambiente salta subito su di lui.
 * `bed`: mentre si corica (k da 0 a 1) l'inquadratura scivola sul letto insieme al personaggio.
 * `focus`: un altro punto da seguire al posto del giocatore (il mobile che si sta spostando).
 */
export function updateCamera(
  delta: number,
  bed?: { x: number; y: number; k: number } | null,
  focus?: { x: number; y: number } | null,
): void {
  const cam: CameraState = (game.cam ||= { u: 0, v: 0, env: null });
  const s = cameraScale();
  const w = game.view.canvas.width / s,
    h = game.view.canvas.height / s;
  let p = focus || game.playerPos || { x: 0, y: 0 };
  if (bed && bed.k > 0) {
    const e = bed.k * bed.k * (3 - 2 * bed.k); // stessa curva dell'animazione del personaggio
    p = { x: p.x + (bed.x - p.x) * e, y: p.y + (bed.y - p.y) * e };
  }
  const pu = (p.x - p.y) * 0.866;
  // riferito al centro dello schermo (sulla luna il terreno scende verso i bordi)
  const pv = (p.x + p.y) * 0.5 - BODY_Z + surfaceDrop(p.x, p.y) + OFFSET_Y / s;
  const snap = cam.env !== game.view.activeEnvironment;
  cam.env = game.view.activeEnvironment;
  let tu = cam.u,
    tv = cam.v;
  if (snap || (bed && bed.k > 0)) {
    tu = pu;
    tv = pv;
  } else {
    const du = DEAD_U * w,
      dv = DEAD_V * h;
    if (pu - cam.u > du) tu = pu - du;
    else if (cam.u - pu > du) tu = pu + du;
    if (pv - cam.v > dv) tv = pv - dv;
    else if (cam.v - pv > dv) tv = pv + dv;
  }
  const k = snap ? 1 : 1 - Math.exp(-FOLLOW * delta);
  const r = cameraRange(s);
  cam.u = Math.max(r.u0, Math.min(r.u1, cam.u + (tu - cam.u) * k));
  cam.v = Math.max(r.v0, Math.min(r.v1, cam.v + (tv - cam.v) * k));
}
