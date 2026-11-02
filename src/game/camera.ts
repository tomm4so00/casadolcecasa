// Telecamera: sul telefono la scena è più grande e segue il giocatore, con una zona morta
// al centro (si muove solo quando ti avvicini al bordo) e senza mai uscire dalla stanza.
import type { GameValue } from './context.js';
import { game } from './context.js';

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

/** Scala della scena intera: come prima sul computer, ingrandita sul telefono. */
export function cameraScale(): number {
  const w = game.view.canvas.width,
    h = game.view.canvas.height;
  const fit = Math.min(w / 450, h / 600, 1.2);
  return phoneQuery?.matches ? Math.min(fit * PHONE_ZOOM, MAX_SCALE) : fit;
}

/** Limiti (in unità isometriche prima della scala) di pavimento e pareti della stanza. */
function sceneExtent(): { u0: number; u1: number; v0: number; v1: number } {
  const wallH = 130;
  return {
    u0: (game.X0 - game.Y1) * 0.866 - MARGIN,
    u1: (game.X1 - game.Y0) * 0.866 + MARGIN,
    v0: (game.X0 + game.Y0) * 0.5 - wallH - MARGIN,
    v1: (game.X1 + game.Y1) * 0.5 + MARGIN,
  };
}

function clampAxis(c: number, lo: number, hi: number): number {
  return lo > hi ? 0 : Math.max(lo, Math.min(hi, c)); // stanza più piccola dello schermo: resta centrata
}

/** Muove la telecamera verso il giocatore; al cambio di ambiente salta subito su di lui. */
export function updateCamera(delta: number): void {
  const cam: GameValue = (game.cam ||= { u: 0, v: 0, env: null });
  const s = cameraScale();
  const w = game.view.canvas.width / s,
    h = game.view.canvas.height / s;
  const p = game.playerPos || { x: 0, y: 0 };
  const pu = (p.x - p.y) * 0.866;
  const pv = (p.x + p.y) * 0.5 - BODY_Z + OFFSET_Y / s; // riferito al centro dello schermo
  const snap = cam.env !== game.view.activeEnvironment;
  cam.env = game.view.activeEnvironment;
  let tu = cam.u,
    tv = cam.v;
  if (snap) {
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
  const e = sceneExtent();
  const half = OFFSET_Y / s;
  cam.u = clampAxis(cam.u + (tu - cam.u) * k, e.u0 + w / 2, e.u1 - w / 2);
  cam.v = clampAxis(cam.v + (tv - cam.v) * k, e.v0 + h / 2 + half, e.v1 - h / 2 + half);
}
