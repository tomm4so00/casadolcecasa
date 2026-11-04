// Turno al ristorante: i clienti entrano dal portone, si siedono e ordinano con un fumetto. La pizza
// si cuoce nel forno a legna e la pasta sui fornelli; vino, dolce e caffè si prendono da
// cantina, carrello e bancone; poi si portano ai tavoli. Chi aspetta troppo se ne va.
// Le regole stanno in restaurant-rules.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { sfx } from './audio.js';
import { botLook } from './character.js';
import { mgHud, mgPop, mgScore } from './jobs.js';
import { drawPlayerAvatar } from './render/avatars.js';
import { setTableGuestDrawer } from './render/objects.js';
import { isoProject, isoScale } from './render/primitives.js';
import {
  type CookStation,
  DISHES,
  type DishId,
  EAT_SECONDS,
  MAX_GUESTS,
  type Station,
  WALK_SPEED,
  arrivalGap,
  missing,
  moodOf,
  nextCookDish,
  orderFor,
  patienceFor,
  tipFor,
} from './restaurant-rules.js';

type Pt = { x: number; y: number };

/** Mobili della sala che fanno da postazione. */
const STATION_OF: Record<string, Station> = {
  pizzaOven: 'oven',
  wineRack: 'cellar',
  chefStove: 'stove',
  bottleShelf: 'cellar',
  dessertCart: 'dessert',
  restCounter: 'counter',
};
/** Cosa si prende subito da ogni postazione (forno e fornelli invece cucinano). */
type InstantStation = Exclude<Station, CookStation>;
const INSTANT: Record<InstantStation, DishId> = {
  cellar: 'vino',
  dessert: 'dolce',
  counter: 'caffe',
};
const isCook = (st: Station): st is CookStation => st === 'oven' || st === 'stove';
const NAMES = ['Giulia', 'Marco', 'Sara', 'Luca', 'Elena', 'Paolo', 'Chiara', 'Davide', 'Marta'];

interface Guest {
  name: string;
  table: number;
  /** percorso dalla porta alla sedia (all'uscita si fa al contrario) */
  path: Pt[];
  step: number;
  x: number;
  y: number;
  dir: Pt;
  state: 'in' | 'wait' | 'eat' | 'out';
  order: DishId[];
  served: DishId[];
  patience: number;
  max: number;
  timer: number;
  angry: boolean;
  gone: boolean;
}

interface Service {
  clock: number;
  nextAt: number;
  guests: Guest[];
  tables: GameValue[];
  stations: GameValue[];
  /** cosa cuoce in ogni cucina, e il piatto pronto che aspetta di essere preso */
  cooking: Partial<Record<CookStation, { dish: DishId; left: number; total: number }>>;
  ready: Partial<Record<CookStation, DishId>>;
  /** dove entrano ed escono i clienti (davanti al portone) */
  door: Pt;
  doorId: string;
  served: number;
  lost: number;
  seq: number;
  t: number;
}

let svc: Service | null = null;

export const serviceOn = (): boolean => !!svc;

export function startService(): void {
  const props = (game.ENV_PROPS[game.view.activeEnvironment] || []) as GameValue[];
  const entrance: GameValue = props.find((p) => p.kind === 'wallEntrance');
  svc = {
    clock: 0,
    nextAt: 1,
    guests: [],
    tables: props.filter((p) => p.kind === 'dinnerTable'),
    stations: props.filter((p) => STATION_OF[p.kind]),
    cooking: {},
    ready: {},
    door: entrance
      ? entrance.side === 'back'
        ? { x: entrance.x, y: game.Y0 + 24 }
        : { x: game.X0 + 24, y: entrance.y }
      : { x: 0, y: game.Y1 - 20 },
    doorId: entrance?.door || '',
    served: 0,
    lost: 0,
    seq: 0,
    t: 0,
  };
  game.MG.carry = null;
  setTableGuestDrawer(drawSeatedGuest);
  rebuildMap();
  mgHud();
}

export function stopService(): void {
  svc = null;
  setTableGuestDrawer(null);
}

/** Parte del turno già passata: 0 all'inizio, 1 alla fine. */
function progress(): number {
  const s: GameValue = game.activeShift;
  return s ? 1 - s.remaining / game.SHIFT_SECONDS : 0;
}

/** Postazioni e tavoli occupati sono gli oggetti vicino a cui compare il pulsante. */
function rebuildMap(): void {
  if (!svc) return;
  const map: GameValue = {};
  svc.stations.forEach((p, i) => {
    map['st_' + i] = {
      kind: 'station',
      station: STATION_OF[p.kind],
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      name: '',
      reach: 8,
    };
  });
  for (const g of svc.guests)
    if (g.state === 'wait' || g.state === 'eat') {
      const t = svc.tables[g.table];
      map['tb_' + g.table] = {
        kind: 'table',
        idx: g.table,
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        name: '',
      };
    }
  game.MG.map = map;
}

/** Un cliente nuovo: entra dal portone e va alla sedia dietro il tavolo, passando dal lato destro. */
function addGuest(table: number): void {
  if (!svc) return;
  const t = svc.tables[table];
  const door = svc.door;
  const seat = { x: t.x, y: t.y - t.h / 2 - 2 };
  const side = t.x + t.w / 2 + 22;
  const path = [door, { x: side, y: door.y + 30 }, { x: side, y: seat.y }, seat];
  openEntrance();
  const p = progress();
  const max = patienceFor(p);
  svc.guests.push({
    name: NAMES[svc.seq++ % NAMES.length],
    table,
    path,
    step: 1,
    x: door.x,
    y: door.y,
    dir: { x: 0, y: -1 },
    state: 'in',
    order: orderFor(p, Math.random(), Math.random(), Math.random()),
    served: [],
    patience: max,
    max,
    timer: 0,
    angry: false,
    gone: false,
  });
}

/** Avanza lungo il percorso; true quando è arrivato in fondo. */
function walk(g: Guest, delta: number, backwards: boolean): boolean {
  const target = g.path[g.step];
  const dx = target.x - g.x,
    dy = target.y - g.y,
    d = Math.hypot(dx, dy),
    move = WALK_SPEED * delta;
  if (d > 0.01) g.dir = { x: dx / d, y: dy / d };
  if (d > move) {
    g.x += (dx / d) * move;
    g.y += (dy / d) * move;
    return false;
  }
  g.x = target.x;
  g.y = target.y;
  const next = g.step + (backwards ? -1 : 1);
  if (next < 0 || next >= g.path.length) return true;
  g.step = next;
  return false;
}

/** Il portone si spalanca per chi entra o esce. */
function openEntrance(): void {
  if (svc?.doorId) game.doorForce[svc.doorId] = performance.now() + 900;
}

function leave(g: Guest, angry: boolean): void {
  g.state = 'out';
  g.angry = angry;
  g.step = g.path.length - 2;
}

/** A ogni fotogramma del turno: arrivi, cottura, pazienza, pasti e uscite. */
export function tickService(delta: number): void {
  const s = svc;
  if (!s) return;
  s.clock += delta;
  const shift: GameValue = game.activeShift;
  if (s.clock >= s.nextAt) {
    const busy = new Set(s.guests.map((g) => g.table));
    const free = s.tables.map((_, i) => i).filter((i) => !busy.has(i));
    const inRoom = s.guests.filter((g) => g.state !== 'out').length;
    // negli ultimi secondi non entra più nessuno: non farebbe in tempo a mangiare
    if (free.length && inRoom < MAX_GUESTS && (shift?.remaining ?? 0) > 8)
      addGuest(free[Math.floor(Math.random() * free.length)]);
    s.nextAt = s.clock + arrivalGap(progress(), Math.random());
  }
  for (const st of ['oven', 'stove'] as CookStation[]) {
    const c = s.cooking[st];
    if (!c) continue;
    c.left -= delta;
    if (c.left <= 0) {
      const d = DISHES[c.dish];
      s.ready[st] = c.dish;
      delete s.cooking[st];
      sfx('door');
      mgPop(`🔔 ${d.e} ${d.label} pronta`);
    }
  }
  for (const g of s.guests) {
    if (g.state === 'in') {
      if (walk(g, delta, false)) g.state = 'wait';
    } else if (g.state === 'wait') {
      g.patience -= delta;
      if (g.patience <= 0) {
        leave(g, true);
        s.lost++;
        mgScore(-0.5);
        sfx('error');
        mgPop('😠 Cliente perso', false);
        mgHud();
      }
    } else if (g.state === 'eat') {
      g.timer -= delta;
      if (g.timer <= 0) leave(g, false);
    } else {
      if (g.step === 0) openEntrance();
      if (walk(g, delta, true)) g.gone = true;
    }
  }
  s.guests = s.guests.filter((g) => !g.gone);
  rebuildMap();
}

const guestAt = (table: number): Guest | undefined =>
  svc?.guests.find((g) => g.table === table && (g.state === 'wait' || g.state === 'eat'));

/** Piatti di questa cucina già sul fuoco, pronti o in mano: non vanno cucinati di nuovo. */
function cookBusy(st: CookStation): DishId[] {
  if (!svc) return [];
  const out: DishId[] = [];
  const c = svc.cooking[st],
    r = svc.ready[st];
  if (c) out.push(c.dish);
  if (r) out.push(r);
  if (game.MG.carry) out.push(game.MG.carry.id);
  return out;
}

function nextFor(st: CookStation): DishId | null {
  if (!svc) return null;
  return nextCookDish(
    st,
    svc.guests.map((g) => ({ ...g, waiting: g.state === 'wait' || g.state === 'in' })),
    cookBusy(st),
  );
}

const carryOf = (d: DishId) => ({ id: d, e: DISHES[d].e, label: DISHES[d].label });

/** Testo del pulsante vicino a una postazione o a un tavolo. */
export function servicePrompt(item: GameValue): { text: string; locked?: boolean } {
  const s = svc;
  const c: GameValue = game.MG.carry;
  if (!s) return { text: '', locked: true };
  if (item.kind === 'station') {
    if (c) return { text: `↩️ Posa ${c.e} ${c.label}` };
    const st: Station = item.station;
    if (isCook(st)) {
      const ready = s.ready[st],
        cooking = s.cooking[st];
      if (ready) return { text: `✋ Prendi ${DISHES[ready].e} ${DISHES[ready].label}` };
      if (cooking) {
        const d = DISHES[cooking.dish];
        return { text: `⏳ ${d.e} ${d.label} sul fuoco…`, locked: true };
      }
      const next = nextFor(st);
      const verb = st === 'oven' ? '🔥 Inforna' : '🍳 Cucina';
      if (next) return { text: `${verb} ${DISHES[next].e} ${DISHES[next].label}` };
      return {
        text: st === 'oven' ? '🔥 Nessuno aspetta la pizza' : '🍳 Nessuno aspetta la pasta',
        locked: true,
      };
    }
    const d = DISHES[INSTANT[st]];
    return { text: `✋ Prendi ${d.e} ${d.label}` };
  }
  const g = guestAt(item.idx);
  if (!g) return { text: '', locked: true };
  if (g.state === 'eat') return { text: '😋 Sta mangiando', locked: true };
  const want = missing(g.order, g.served);
  if (c && want.includes(c.id)) return { text: `🍽️ Servi ${c.e} ${c.label}` };
  return { text: `📝 Vuole ${want.map((d) => DISHES[d].e).join(' ')}`, locked: true };
}

/** Pulsante premuto vicino a una postazione o a un tavolo. */
export function serviceInteract(item: GameValue): void {
  const s = svc;
  if (!s) return;
  const c: GameValue = game.MG.carry;
  if (item.kind === 'station') {
    if (c) {
      game.MG.carry = null;
      mgPop(`↩️ ${c.e} posato`);
    } else if (isCook(item.station)) {
      const st: CookStation = item.station;
      const ready = s.ready[st];
      if (ready) {
        game.MG.carry = carryOf(ready);
        delete s.ready[st];
        sfx('door');
      } else if (!s.cooking[st]) {
        const next = nextFor(st);
        if (!next) return;
        s.cooking[st] = { dish: next, left: DISHES[next].cook, total: DISHES[next].cook };
        sfx('door');
      }
    } else {
      game.MG.carry = carryOf(INSTANT[item.station as InstantStation]);
      sfx('door');
    }
    mgHud();
    return;
  }
  const g = guestAt(item.idx);
  if (!g || g.state !== 'wait') return;
  const want = missing(g.order, g.served);
  if (!c || !want.includes(c.id)) {
    sfx('error');
    mgPop(`❌ Vuole ${want.map((d) => DISHES[d].e).join(' ')}`, false);
    return;
  }
  const shift: GameValue = game.activeShift;
  const perItem: number = shift?.perItem ?? 0;
  g.served.push(c.id);
  game.MG.carry = null;
  s.served++;
  if (shift) shift.delivered = (shift.delivered || 0) + 1;
  mgScore(1);
  sfx('coin');
  if (missing(g.order, g.served).length) mgPop(`✅ +${perItem} €`);
  else {
    const tip = tipFor(g.patience / g.max, perItem);
    if (shift) shift.tips = (shift.tips || 0) + tip;
    g.state = 'eat';
    g.timer = EAT_SECONDS;
    mgPop(`😋 +${perItem} €${tip ? ` · mancia ${tip} €` : ''}`);
  }
  mgHud();
}

/** Riga del riquadro del turno. */
export function serviceHudLine(): string {
  const s = svc;
  if (!s) return '';
  const c: GameValue = game.MG.carry;
  const hand = c ? `🤲 ${c.e} ${c.label}` : '🧑‍🍳 Servi i clienti';
  return `<span class="${c ? 'held' : ''}">${hand}</span> <small>😋${s.served} 😠${s.lost}</small>`;
}

// ---------------------------------------------------------------- disegno

/** Clienti che camminano, fumetti con l'ordine e il fornello: si aggiungono ai disegni della scena. */
export function serviceDrawables(drawables: GameValue[], t: number): void {
  const s = svc;
  if (!s) return;
  s.t = t;
  for (const g of s.guests) {
    if (g.state === 'in' || g.state === 'out')
      drawables.push({
        depth: g.x + g.y,
        draw: () =>
          drawPlayerAvatar(g.x, g.y, g.name, t, botLook('Cliente ' + g.name), true, '', {
            walkDir: g.dir,
            speed: WALK_SPEED,
          }),
      });
    drawables.push({ depth: 1e9 - 1, draw: () => drawGuestBubble(g) });
  }
  for (const p of s.stations) {
    const st = STATION_OF[p.kind];
    if (isCook(st) && (s.cooking[st] || s.ready[st]))
      drawables.push({ depth: 1e9 - 2, draw: () => drawStoveState(p, st, t) });
  }
}

/** Il cliente seduto dietro questo tavolo: si disegna tra la sedia e il piano del tavolo. */
function drawSeatedGuest(it: GameValue): void {
  const s = svc;
  if (!s) return;
  const table = s.tables.indexOf(it);
  const g = table >= 0 ? guestAt(table) : undefined;
  if (!g) return;
  drawPlayerAvatar(g.x, g.y, g.name, s.t, botLook('Cliente ' + g.name), false, '', {
    pose: 'bench',
  });
}

const MOOD_COLOR = { ok: '#2ecc71', warn: '#f1c40f', bad: '#e74c3c' };

/** Fumetto sopra la testa: piatti che mancano e anello di pazienza; 😋 mangiando, 😠 uscendo. */
function drawGuestBubble(g: Guest): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  let text = '';
  if (g.state === 'wait')
    text = missing(g.order, g.served)
      .map((d) => DISHES[d].e)
      .join(' ');
  else if (g.state === 'eat') text = '😋';
  else if (g.state === 'out' && g.angry) text = '😠';
  if (!text) return;
  const p = isoProject(g.x, g.y, g.state === 'out' ? 92 : 84);
  ctx.save();
  ctx.font = `${Math.round(15 * s)}px serif`;
  const ring = g.state === 'wait';
  const tw = ctx.measureText(text).width;
  const w = tw + (ring ? 26 : 12) * s,
    h = 22 * s,
    x = p.x - w / 2,
    y = p.y - h;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, 8 * s) : ctx.rect(x, y, w, h);
  ctx.moveTo(p.x - 4 * s, y + h);
  ctx.lineTo(p.x, y + h + 5 * s);
  ctx.lineTo(p.x + 4 * s, y + h);
  ctx.fill();
  ctx.stroke();
  if (ring) {
    // anello di pazienza: si svuota e cambia colore
    const left = Math.max(0, g.patience / g.max);
    const cx = x + 11 * s,
      cy = y + h / 2,
      r = 6 * s;
    ctx.lineWidth = 2.6 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.3);
    ctx.stroke();
    ctx.strokeStyle = MOOD_COLOR[moodOf(left)];
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + (ring ? 20 : 6) * s, y + h / 2 + 1);
  ctx.restore();
}

/** Sopra il fornello: il piatto che cuoce con il cerchio che si riempie, o quello pronto. */
function drawStoveState(stove: GameValue, st: CookStation, t: number): void {
  const s = svc;
  if (!s) return;
  const ctx = game.view.ctx;
  const sc: number = isoScale();
  const cooking = s.cooking[st];
  const dish = cooking ? cooking.dish : s.ready[st];
  if (!dish) return;
  const bob = cooking ? 0 : Math.sin(t * 5) * 2;
  const p = isoProject(stove.x, stove.y, (stove.z || 55) + 26 + bob);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13 * sc, 0, 6.3);
  ctx.fill();
  if (cooking) {
    const k = 1 - cooking.left / cooking.total;
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 3 * sc;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13 * sc, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 3 * sc;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13 * sc, 0, 6.3);
    ctx.stroke();
  }
  ctx.font = `${Math.round(16 * sc)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(DISHES[dish].e, p.x, p.y + 1);
  ctx.restore();
}
