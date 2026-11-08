// Showroom del negozio di mobili: ogni modello sulla sua pedana, alla misura reale, con la
// fascetta della fascia e del prezzo e, sopra, quello che significa per chi guarda (tuo, in
// vendita, da sbloccare). I reparti hanno un cartello in piedi.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, drawFurnitureByKind, onFace } from './objects.js';
import { TIER_LABEL, showroomStatus, tierOf } from '../furniture-tiers.js';

const TIER_COLOR = { std: '#ff4757', premium: '#8e44ad', lux: '#d4ac0d' } as const;
/** Margine della pedana attorno al mobile. */
const PAD = 9;
const PLINTH = 6;

/** Etichetta tonda sopra il modello, in coordinate dello schermo. */
function badge(x: number, y: number, z: number, text: string, bg: string, fg = '#ffffff'): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const p = isoProject(x, y, z);
  ctx.font = `bold ${Math.round(9 * s)}px sans-serif`;
  const w = ctx.measureText(text).width + 10 * s,
    h = 14 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2 + 1, p.y - h + 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2, p.y - h, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y - h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
}

/** Un modello in esposizione: pedana, fascetta con fascia e prezzo, il mobile, il suo stato. */
export function drawShowroomItem(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const def = { id: it.showId, category: it.category, propKey: it.propKey };
  const tier = it.price === null ? 'std' : tierOf(def);
  // pedana bianca con il bordo del colore della fascia
  const plat = box(it.x, it.y, it.w + PAD * 2, it.h + PAD * 2, PLINTH, '#eef0f3', {
    top: '#fbfbfc',
  });
  onFace(plat, 'top', (W: number, H: number): void => {
    ctx.strokeStyle = TIER_COLOR[tier];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(2, 2, W - 4, H - 4);
  });
  onFace(plat, 'left', (W: number, H: number): void => {
    ctx.fillStyle = TIER_COLOR[tier];
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 4.6px sans-serif';
    ctx.textAlign = 'center';
    const price = it.price === null ? 'in ogni stanza' : `${it.price} Đ`;
    ctx.fillText(`${TIER_LABEL[tier].replace(/ .*/, '').toUpperCase()} · ${price}`, W / 2, H - 1.4);
  });
  // il mobile vero, sulla pedana
  const shown = { ...it, zb: PLINTH };
  if (it.wallShow) {
    // la cassaforte è a muro: un pannellino bianco a cui è appesa
    box(it.x, it.y - it.h / 2 + 3, it.w + 12, 4, 66, '#dfe4ea', { z0: PLINTH });
    drawFurnitureByKind(it.propKey, { ...shown, y: it.y - it.h / 2 + 9, h: 8, zb: PLINTH + 18 });
  } else drawFurnitureByKind(it.propKey, shown, t, lights);
  // sopra: cosa vuol dire per chi guarda
  const status = showroomStatus(game.furnitureCatalog, game.player.ownedFurniture, def);
  const top = PLINTH + (it.z || 40) + 14;
  if (status === 'mine') badge(it.x, it.y, top, '✓ TUO', '#27ae60');
  else if (status === 'better') badge(it.x, it.y, top, '✓ MEGLIO A CASA', '#7f8c8d');
  else if (status === 'next') badge(it.x, it.y, top, '🛒 IN VENDITA', TIER_COLOR[tier]);
  // si sale di una fascia alla volta: per il lusso serve prima il pregiato
  else
    badge(
      it.x,
      it.y,
      top,
      tier === 'lux' ? '🔒 PRIMA IL PREGIATO' : '🔒 PRIMA LO STANDARD',
      '#2f3640',
    );
}

/** Cartello in piedi di un reparto: palo e pannello con il nome. */
export function drawShowSign(it: GameValue): void {
  const ctx = game.view.ctx;
  box(it.x, it.y, 22, 14, 3, '#2f3640');
  box(it.x, it.y, 3, 3, 70, '#57606f', { z0: 3 });
  const panel = box(it.x, it.y, 46, 4, 18, '#d35400', { z0: 66, top: '#e67e22' });
  onFace(panel, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${String(it.label).length > 9 ? 5 : 6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(it.label), W / 2, H / 2 + 2);
  });
  onFace(panel, 'right', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(1, H / 2 - 0.5, W - 2, 1);
  });
}
