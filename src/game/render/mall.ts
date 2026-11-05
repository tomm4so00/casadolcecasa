// Centro commerciale: vetrine dei negozi, arredi della galleria e reparti della boutique.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, setPlane } from './primitives.js';
import { parseLook, resolveLook } from '../character.js';
import { drawGlasses, drawHat, drawPlayerAvatar } from './avatars.js';
import { resetPlane, box, onFace, drawShirtShape, drawPalmProp } from './objects.js';
import { drawCollectibleArt } from './collectible-art.js';
import { doorOpenAmount } from './doors.js';

// ---------------------------------------------------------------- CENTRO COMMERCIALE
const FACADE_STYLE: Record<
  string,
  { wall: string; sign: string; text: string; awning: [string, string]; title: string }
> = {
  mobili: {
    wall: '#a0522d',
    sign: '#3e2723',
    text: '#ffcc80',
    awning: ['#d35400', '#fbe5c8'],
    title: '🛋️ ARREDO CASA',
  },
  vestiti: {
    wall: '#f8c8dc',
    sign: '#6d214f',
    text: '#ffffff',
    awning: ['#e84393', '#ffffff'],
    title: '👗 BOUTIQUE',
  },
  grow: {
    wall: '#1b3a1f',
    sign: '#0b1a0d',
    text: '#9cff57',
    awning: ['#2e7d32', '#111111'],
    title: '🌿 GROW SHOP',
  },
  animali: {
    wall: '#f6b26b',
    sign: '#7a3e0a',
    text: '#fff3e0',
    awning: ['#e67e22', '#fffaf0'],
    title: '🐾 ANIMALI',
  },
  scommesse: {
    wall: '#2c2c54',
    sign: '#120a1a',
    text: '#feca57',
    awning: ['#b33939', '#2c2c54'],
    title: '🎰 SALA SCOMMESSE',
  },
  sala: {
    wall: '#1a1030',
    sign: '#0b0518',
    text: '#00e5ff',
    awning: ['#ff2fb3', '#1a1030'],
    title: '🕹️ SALA GIOCHI',
  },
  collezione: {
    wall: '#4a3423',
    sign: '#1c120a',
    text: '#f5d76e',
    awning: ['#7d2a3c', '#f5e6c8'],
    title: '🏺 COLLEZIONI',
  },
  usato: {
    wall: '#2e7d5b',
    sign: '#14382a',
    text: '#fdf6e3',
    awning: ['#f39c12', '#fdf6e3'],
    title: "🏷️ L'USATO",
  },
};

/** Vetrina di un negozio del centro commerciale: insegna, tenda, due vetrine e la porta a vetri. */
export function drawShopFacade(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const st = FACADE_STYLE[it.shop] || FACADE_STYLE.mobili;
  const front: GameValue = box(it.x, it.y, it.w, it.h, it.z, st.wall);
  // la porta del negozio si apre a chi le arriva vicino
  const open = it.enter ? doorOpenAmount('mall:' + it.shop, it.x, it.y, true, true) : 0;
  // le vetrine sulla parete di sinistra guardano verso destra: si disegna sull'altra faccia
  onFace(front, it.side === 'left' ? 'right' : 'left', (W: number, H: number): void => {
    // insegna
    ctx.fillStyle = st.sign;
    ctx.fillRect(4, 6, W - 8, 22);
    ctx.fillStyle = st.text;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (it.shop === 'scommesse') {
      // insegna al neon che lampeggia
      const on = Math.floor((t || 0) * 2) % 2 === 0;
      ctx.shadowColor = '#feca57';
      ctx.shadowBlur = on ? 8 : 2;
      ctx.fillStyle = on ? '#feca57' : '#c79a2b';
    }
    // il titolo si rimpicciolisce se non ci sta nell'insegna
    let size = 11;
    while (size > 7 && ctx.measureText(st.title).width > W - 14) {
      size -= 0.5;
      ctx.font = `bold ${size}px sans-serif`;
    }
    ctx.fillText(st.title, W / 2, 17);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
    // tenda a strisce
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = st.awning[i % 2];
      const sw = (W - 8) / 12;
      ctx.beginPath();
      ctx.moveTo(4 + i * sw, 30);
      ctx.lineTo(4 + (i + 1) * sw, 30);
      ctx.lineTo(4 + (i + 1) * sw, 40);
      ctx.quadraticCurveTo(4 + (i + 0.5) * sw, 45, 4 + i * sw, 40);
      ctx.fill();
    }
    // vetrine ai lati della porta
    const doorW = 30,
      doorX = W / 2 - doorW / 2,
      top = 50,
      bottom = H - 4;
    const win = (x: number, w: number) => {
      const g = ctx.createLinearGradient(x, top, x + w, bottom);
      g.addColorStop(0, 'rgba(190,225,245,0.95)');
      g.addColorStop(1, 'rgba(120,170,210,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(x, top, w, bottom - top - 8);
      ctx.strokeStyle = '#636e72';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, w, bottom - top - 8);
      drawWindowDisplay(it.shop, x, top, w, bottom - top - 8, t || 0);
      // riflesso sul vetro
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 6, top + 18);
      ctx.lineTo(x + 18, top + 6);
      ctx.stroke();
    };
    win(6, doorX - 12);
    win(doorX + doorW + 6, W - (doorX + doorW + 6) - 6);
    // vano della porta: dentro il negozio illuminato (telaio e ante sono in 3D, vedi drawShopDoor)
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(1, '#e8cf9f');
    ctx.fillStyle = g;
    ctx.fillRect(doorX, top, doorW, bottom - top);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(doorX, bottom - 8, doorW, 8);
  });
  if (it.enter) drawShopDoor(it, open);
}

/** Larghezza e altezza della porta a vetri dei negozi (la stessa per tutti). */
const SHOP_DOOR_W = 30;
const SHOP_DOOR_H = 74;

/**
 * Porta a vetri scorrevole dei negozi, in 3D: telaio in metallo che sporge dalla facciata e due ante
 * di vetro con il loro spessore, che scorrono verso i lati quando ci si avvicina (`open` da 0 a 1).
 * Vale per le facciate sul muro di fondo e per quelle sul muro di sinistra (`side: 'left'`).
 */
function drawShopDoor(it: GameValue, open: number): void {
  const left = it.side === 'left';
  // `a` lungo la facciata (da sinistra verso destra per chi guarda), `out` verso la sala
  const face = left ? it.x + it.w / 2 : it.y + it.h / 2;
  const at = (
    a: number,
    out: number,
    wA: number,
    dOut: number,
    h: number,
    color: string,
    z0: number,
    o: GameValue = {},
  ) =>
    left
      ? box(face + out, it.y - a, dOut, wA, h, color, { z0, ...o })
      : box(it.x + a, face + out, wA, dOut, h, color, { z0, ...o });
  const W = SHOP_DOOR_W,
    H = SHOP_DOOR_H,
    metal = '#4b5563',
    z0 = 4;
  // soglia, stipiti e architrave
  at(0, 2, W + 8, 4, 1.5, '#9aa3ab', 0);
  at(-W / 2 - 1.5, 2, 3, 4, H, metal, z0);
  at(W / 2 + 1.5, 2, 3, 4, H, metal, z0);
  at(0, 2.5, W + 6, 5, 5, metal, z0 + H);
  // binario sopra le ante
  at(0, 4.5, W + 2, 1.5, 2, '#2d3436', z0 + H - 2);
  // due ante di vetro che scorrono verso i lati, una un po' davanti all'altra
  const slide = (W / 2 - 3) * open;
  const glass = 'rgba(170,215,240,0.55)';
  const sides = { top: 'rgba(120,150,170,0.9)', left: glass, right: 'rgba(130,180,210,0.6)' };
  for (const [k, depth] of [
    [-1, 3],
    [1, 4.2],
  ]) {
    const a = k * (W / 4 + slide);
    at(a, depth, W / 2 - 1, 1.2, H - 3, glass, z0, sides);
    // profilo in alluminio intorno al vetro e maniglia verticale verso il centro
    at(a, depth, W / 2 - 1, 1.4, 2, '#7f8c8d', z0);
    at(a, depth, W / 2 - 1, 1.4, 2, '#7f8c8d', z0 + H - 5);
    at(a - k * (W / 4 - 3), depth + 0.8, 1.2, 1.4, 16, '#dfe6e9', z0 + H * 0.35);
  }
}

/** Cosa si vede in vetrina: mobili, abiti sui manichini o slot machine. */
function drawWindowDisplay(shop: string, x: number, y: number, w: number, h: number, t: number) {
  const ctx = game.view.ctx;
  const base = y + h;
  if (shop === 'mobili') {
    // divano e lampada
    ctx.fillStyle = '#6c5ce7';
    ctx.fillRect(x + 6, base - 18, w * 0.55, 12);
    ctx.fillRect(x + 6, base - 26, w * 0.55, 8);
    ctx.fillStyle = '#4834d4';
    ctx.fillRect(x + 4, base - 22, 4, 16);
    ctx.fillRect(x + 6 + w * 0.55 - 2, base - 22, 4, 16);
    ctx.fillStyle = '#636e72';
    ctx.fillRect(x + w - 14, base - 34, 2, 30);
    ctx.fillStyle = '#feca57';
    ctx.beginPath();
    ctx.moveTo(x + w - 19, base - 34);
    ctx.lineTo(x + w - 7, base - 34);
    ctx.lineTo(x + w - 10, base - 44);
    ctx.lineTo(x + w - 16, base - 44);
    ctx.fill();
  } else if (shop === 'vestiti') {
    // due manichini con abiti colorati
    const colors = ['#e84393', '#0984e3'];
    for (let i = 0; i < 2; i++) {
      const cx = x + (w * (i + 1)) / 3;
      ctx.fillStyle = '#dfe6e9';
      ctx.beginPath();
      ctx.arc(cx, base - 40, 4, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.moveTo(cx - 6, base - 35);
      ctx.lineTo(cx + 6, base - 35);
      ctx.lineTo(cx + 8, base - 14);
      ctx.lineTo(cx - 8, base - 14);
      ctx.fill();
      ctx.fillStyle = '#636e72';
      ctx.fillRect(cx - 0.5, base - 14, 1, 12);
      ctx.fillRect(cx - 5, base - 3, 10, 2);
    }
  } else if (shop === 'animali') {
    // cuccia con una zampa disegnata e una bolla di pesce che sale
    ctx.fillStyle = '#8d5524';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, base - 6, w * 0.32, 5, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#c68642';
    ctx.beginPath();
    ctx.arc(x + w / 2, base - 13 + Math.sin(t * 3) * 0.6, 6, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#8d5524';
    ctx.beginPath();
    ctx.ellipse(x + w / 2 - 5, base - 14, 2, 4, 0.3, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x + w / 2 + 2, base - 14, 0.9, 0, 6.3);
    ctx.fill();
    // impronte di zampa sul vetro
    ctx.fillStyle = 'rgba(122,62,10,0.45)';
    for (const [px, py] of [
      [x + 6, y + 8],
      [x + w - 10, y + 14],
    ]) {
      ctx.beginPath();
      ctx.arc(px, py + 3, 2.2, 0, 6.3);
      for (const d of [-2.5, 0, 2.5]) ctx.arc(px + d, py - 0.5, 0.9, 0, 6.3);
      ctx.fill();
    }
  } else if (shop === 'grow') {
    // piantine in vaso sotto la luce viola
    const glow = ctx.createLinearGradient(0, y, 0, base);
    glow.addColorStop(0, 'rgba(200,120,255,0.55)');
    glow.addColorStop(1, 'rgba(200,120,255,0.1)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 3; i++) {
      const px = x + (w * (i + 0.5)) / 3;
      ctx.fillStyle = '#b5651d';
      ctx.fillRect(px - 5, base - 9, 10, 8);
      ctx.fillStyle = ['#7cb342', '#388e3c', '#2e7d32'][i];
      for (let l = 0; l < 4; l++) {
        ctx.beginPath();
        ctx.ellipse(px, base - 14 - l * 5, 7 - l, 2.2, l % 2 ? 0.4 : -0.4, 0, 6.3);
        ctx.fill();
      }
      ctx.fillStyle = ['#d4e157', '#a5d6a7', '#8e24aa'][i];
      ctx.beginPath();
      ctx.arc(px, base - 34, 2.5, 0, 6.3);
      ctx.fill();
    }
  } else if (shop === 'usato') {
    // pezzi di seconda mano con il cartellino del prezzo
    const pieces = ['col_giradischi', 'col_cactus'];
    for (let i = 0; i < 2; i++) {
      const px = x + (w * (i + 0.5)) / 2;
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(px - 7, base - 4, 14, 3);
      drawCollectibleArt(ctx, pieces[i], px, base - 4, 14, t);
      // cartellino appeso
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(px + 4, y + 4);
      ctx.lineTo(px + 4, y + 9);
      ctx.stroke();
      ctx.fillStyle = '#fdf6e3';
      ctx.fillRect(px + 1, y + 9, 7, 5);
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 3.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('€', px + 4.5, y + 13);
    }
  } else if (shop === 'collezione') {
    // due piedistalli con un pezzo ciascuno, sotto una luce calda
    const glow = ctx.createRadialGradient(x + w / 2, y + 4, 2, x + w / 2, y + 4, h);
    glow.addColorStop(0, 'rgba(255,225,150,0.5)');
    glow.addColorStop(1, 'rgba(255,225,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
    const pieces = ['col_globo', 'col_clessidra'];
    for (let i = 0; i < 2; i++) {
      const px = x + (w * (i + 0.5)) / 2;
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(px - 6, base - 14, 12, 13);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(px - 7, base - 15, 14, 2);
      drawCollectibleArt(ctx, pieces[i], px, base - 15, 16, t);
    }
  } else if (shop === 'sala') {
    // cabinati con gli schermi colorati che lampeggiano
    for (let i = 0; i < 3; i++) {
      const cw = w / 3 - 6,
        cx = x + 4 + i * (w / 3);
      ctx.fillStyle = ['#ff2fb3', '#6c2bd9', '#00b8d4'][i];
      ctx.fillRect(cx, base - 38, cw, 36);
      const on = Math.floor(t * 3 + i) % 2 === 0;
      ctx.fillStyle = on ? '#2ed573' : '#0b0518';
      ctx.fillRect(cx + 3, base - 33, cw - 6, 12);
      ctx.fillStyle = '#feca57';
      ctx.beginPath();
      ctx.arc(cx + cw / 2, base - 12, 2.5, 0, 6.3);
      ctx.fill();
    }
  } else {
    // slot machine con le luci
    for (let i = 0; i < 2; i++) {
      const sx = x + 6 + i * (w / 2);
      ctx.fillStyle = i ? '#8e44ad' : '#c0392b';
      ctx.fillRect(sx, base - 36, w / 2 - 12, 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 3, base - 30, w / 2 - 18, 10);
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('777', sx + (w / 2 - 12) / 2, base - 22);
      const on = Math.floor(t * 4 + i) % 2 === 0;
      ctx.fillStyle = on ? '#feca57' : '#7f6000';
      ctx.beginPath();
      ctx.arc(sx + (w / 2 - 12) / 2, base - 40, 2.5, 0, 6.3);
      ctx.fill();
    }
  }
}

/** Colonna bianca con base e capitello dorati, con una lampada che illumina la vetrina. */
/**
 * Colonna quadrata tra due vetrine: base e capitello dorati, fusto di marmo scanalato e la
 * lampada accesa sul lato verso la galleria (`side: 'left'` per quelle sul muro di sinistra).
 */
export function drawMallColumnProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x, it.y, it.w + 8, it.h + 8, 10, '#c9a227', { top: '#d4ac0d' });
  const shaft: GameValue = box(it.x, it.y, it.w, it.h, it.z - 24, '#f5f0e6', { z0: 10 });
  const flutes = (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 3; i < W - 2; i += 5) ctx.fillRect(i, 4, 2, H - 8);
    ctx.strokeStyle = 'rgba(201,162,39,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  };
  onFace(shaft, 'left', flutes);
  onFace(shaft, 'right', flutes);
  box(it.x, it.y, it.w + 6, it.h + 6, 4, '#c9a227', { z0: it.z - 14 });
  box(it.x, it.y, it.w + 10, it.h + 10, 10, '#d4ac0d', { z0: it.z - 10 });
  // lampada da parete accesa, sul lato che guarda la galleria
  const p =
    it.side === 'left'
      ? isoProject(it.x + it.w / 2 + 2, it.y, it.z - 36)
      : isoProject(it.x, it.y + it.h / 2 + 2, it.z - 36);
  const glow = 0.55 + 0.1 * Math.sin((t || 0) * 2 + it.x + it.y);
  const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 22 * isoScale());
  g.addColorStop(0, `rgba(255,236,170,${glow})`);
  g.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 22 * isoScale(), 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#fff4c2';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3 * isoScale(), 0, 6.3);
  ctx.fill();
}

/** Palma in un grande vaso di marmo. */
export function drawMallPalmProp(it?: GameValue, t?: GameValue): GameValue {
  box(it.x, it.y, 30, 30, 18, '#efe6d6', { top: '#6d4c41' });
  box(it.x, it.y, 32, 32, 3, '#c9a227', { z0: 15 });
  const ctx = game.view.ctx;
  ctx.save();
  ctx.translate(0, -18 * isoScale());
  drawPalmProp({ ...it, x: it.x, y: it.y }, t);
  ctx.restore();
}

/** Carretto dei gelati con l'ombrellone a strisce e i coni in fila. */
export function drawIceCreamCartProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  for (const dx of [-1, 1]) {
    const w = isoProject(it.x + dx * (it.w / 2 - 4), it.y + it.h / 2, 7);
    ctx.fillStyle = '#2d3436';
    ctx.beginPath();
    ctx.arc(w.x, w.y, 6 * s, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#b2bec3';
    ctx.beginPath();
    ctx.arc(w.x, w.y, 2.5 * s, 0, 6.3);
    ctx.fill();
  }
  const cart: GameValue = box(it.x, it.y, it.w, it.h, 26, '#fdfdfd', { z0: 6 });
  onFace(cart, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(0, H * 0.3, W, H * 0.25);
    ctx.fillStyle = '#e84393';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GELATI', W / 2, H * 0.5);
  });
  // coni sul banco
  const flavours = ['#ff9ff3', '#feca57', '#55efc4', '#a0522d'];
  flavours.forEach((c, i) => {
    const p = isoProject(it.x - it.w / 2 + 8 + i * ((it.w - 16) / 3), it.y, 34);
    ctx.fillStyle = '#e1b12c';
    ctx.beginPath();
    ctx.moveTo(p.x - 2.5 * s, p.y);
    ctx.lineTo(p.x + 2.5 * s, p.y);
    ctx.lineTo(p.x, p.y + 6 * s);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 1 * s, 3.2 * s, 0, 6.3);
    ctx.fill();
  });
  // ombrellone
  box(it.x, it.y, 2, 2, 40, '#dfe6e9', { z0: 32 });
  const top = isoProject(it.x, it.y, 78);
  const sway = Math.sin((t || 0) * 0.8) * 0.04;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + sway,
      a1 = ((i + 1) / 8) * Math.PI * 2 + sway;
    const p0 = isoProject(it.x + Math.cos(a0) * 34, it.y + Math.sin(a0) * 34, 66),
      p1 = isoProject(it.x + Math.cos(a1) * 34, it.y + Math.sin(a1) * 34, 66);
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff6b81';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Banchetto dei palloncini che ondeggiano. */
export function drawBalloonStandProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  box(it.x, it.y, it.w, it.h, 22, '#6c5ce7');
  box(it.x, it.y, it.w + 4, it.h + 4, 3, '#a29bfe', { z0: 22 });
  const colors = ['#ff4757', '#feca57', '#2ed573', '#1e90ff', '#ff6b81', '#a55eea'];
  const base = isoProject(it.x, it.y, 25);
  colors.forEach((c, i) => {
    const ang = (i / colors.length) * Math.PI * 2;
    const bob = Math.sin((t || 0) * 1.5 + i) * 3;
    const p = isoProject(
      it.x + Math.cos(ang) * 14 + Math.sin((t || 0) + i) * 2,
      it.y + Math.sin(ang) * 8,
      80 + (i % 3) * 10 + bob,
    );
    ctx.strokeStyle = 'rgba(80,80,80,0.6)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.quadraticCurveTo((base.x + p.x) / 2 + 3 * s, (base.y + p.y) / 2, p.x, p.y + 8 * s);
    ctx.stroke();
    const g = ctx.createRadialGradient(p.x - 2.5 * s, p.y - 3 * s, 1, p.x, p.y, 9 * s);
    g.addColorStop(0, game.lighten(c, 0.5));
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 7 * s, 8.5 * s, 0, 0, 6.3);
    ctx.fill();
  });
}

export function drawClothesRack(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, z }: GameValue = it;
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === it.slot && !i.starter,
  );
  box(x, y, w, 12, 3, '#636e72');
  box(x - w / 2 + 3, y, 4, 4, z, '#b2bec3', { z0: 3 });
  box(x, y, w, 3, 3, '#dfe6e9', { z0: z - 1 });
  items.forEach((g?: GameValue, i?: GameValue): GameValue => {
    const gx: GameValue = x - w / 2 + 9 + (i * (w - 18)) / Math.max(1, items.length - 1);
    setPlane([gx - 8, y + (i % 2 ? -1.5 : 1.5), z - 3], [1, 0, 0], [0, 0, -1]);
    drawShirtShape(
      8,
      2,
      15,
      it.slot === 'pants' ? 34 : 27,
      g.color,
      it.slot === 'pants' ? 'pants' : 'top',
    );
    if (g.style === 'stripes') {
      ctx.fillStyle = g.color2;
      for (let v: GameValue = 8; v < 27; v += 4) ctx.fillRect(3, v, 10, 1.5);
    }
    resetPlane();
  });
  box(x + w / 2 - 3, y, 4, 4, z, '#b2bec3', { z0: 3 });
  const sign: GameValue = box(x, y + 8, 22, 2, 10, '#ffffff', { z0: 3 });
  onFace(sign, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#e84393';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.SLOT_INFO[it.slot].label.toUpperCase(), W / 2, H - 3);
  });
}

export function drawDisplayShelf(it?: GameValue, _t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h }: GameValue = it;
  void box(x, y - h / 2 + 2, w, 4, it.z + 26, '#f5f6fa');
  const low: GameValue = box(x, y + 2, w, h - 4, it.z * 0.45, '#ffffff');
  onFace(low, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    ctx.fillStyle = '#e84393';
    ctx.fillRect(0, 2, W, 3);
  });
  box(x, y - 2, w, h - 10, 3, '#dfe6e9', { z0: it.z + 6 });
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === it.slot && !i.starter,
  );
  const s: GameValue = isoScale();
  items.forEach((g?: GameValue, i?: GameValue): GameValue => {
    const upper: GameValue = i % 2 === 0,
      k: GameValue = Math.floor(i / 2);
    const gx: GameValue =
      x - w / 2 + 10 + (k * (w - 20)) / Math.max(1, Math.ceil(items.length / 2) - 1);
    const gz: GameValue = upper ? it.z + 9 : it.z * 0.45;
    const gy: GameValue = upper ? y - 6 : y + 4;
    if (it.slot === 'shoes') {
      box(gx - 3, gy, 5, 10, 4, g.color, { z0: gz });
      box(gx + 3, gy + 1, 5, 10, 4, g.color, { z0: gz });
    } else {
      const hp: GameValue = isoProject(gx, gy, gz + 7);
      ctx.fillStyle = '#ced6e0';
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 6 * s, 0, 6.3);
      ctx.fill();
      box(gx, gy, 3, 3, 2, '#a4b0be', { z0: gz });
      drawHat({ x: hp.x, y: hp.y + 1 * s }, s * 0.66, g);
    }
  });
}

export function drawGlassesStand(it?: GameValue, _t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 18, '#ffffff');
  onFace(b, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    ctx.fillStyle = '#e84393';
    ctx.fillRect(0, 3, W, 2.5);
  });
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === 'glasses',
  );
  const s: GameValue = isoScale();
  items.forEach((g?: GameValue, i?: GameValue): GameValue => {
    const gx: GameValue = it.x - it.w / 2 + 7 + (i * (it.w - 14)) / Math.max(1, items.length - 1);
    box(gx, it.y, 3, 3, 8, '#a4b0be', { z0: it.z - 18 });
    const hp: GameValue = isoProject(gx, it.y, it.z - 2);
    ctx.fillStyle = '#ced6e0';
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 7 * s, 0, 6.3);
    ctx.fill();
    drawGlasses({ x: hp.x, y: hp.y - 1 * s }, s * 0.8, g);
  });
}

export function drawBoutiqueCounter(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, '#e84393');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let u: GameValue = 6; u < W; u += 12) ctx.fillRect(u, 0, 4, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BOUTIQUE', W / 2, H / 2 + 3);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 5, '#ffffff', { z0: it.z - 5 });
  const reg: GameValue = box(it.x + it.w * 0.28, it.y, 22, 16, 12, '#2d3436', { z0: it.z });
  onFace(reg, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    ctx.fillStyle = '#fd79a8';
    ctx.fillRect(3, 2, W - 6, 5);
  });
  [
    ['#ffffff', -0.3],
    ['#fd79a8', -0.12],
  ].forEach(([c, k]: GameValue = {}): GameValue => {
    const bag: GameValue = box(it.x + it.w * k, it.y, 14, 8, 16, c, { z0: it.z });
    onFace(bag, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(W / 2, 0, 4, Math.PI, 0);
      ctx.stroke();
    });
  });
}

export function drawBoutiqueItem(k?: GameValue, item?: GameValue, t?: GameValue): GameValue {
  if (k === 'clothesCounter') return drawBoutiqueCounter(item);
  if (k.startsWith('rack')) return drawClothesRack(item);
  if (k === 'standGlasses') return drawGlassesStand(item, t);
  return drawDisplayShelf(item, t);
}

export function drawMannequinProp(it?: GameValue, _t?: GameValue): GameValue {
  box(it.x, it.y, 18, 18, 3, '#2d3436');
  const look: GameValue = resolveLook(parseLook(it.look));
  look.mannequin = true;
  drawPlayerAvatar(it.x, it.y, '', 0, look, false, '');
}
