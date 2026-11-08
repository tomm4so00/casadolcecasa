// Cabinato dei minigiochi nella stanza: davanti allo schermo si sceglie uno dei tre giochi e si
// gioca in una finestra a parte. Record personale, del condominio e mondiale; chi strappa il
// record del condominio o quello mondiale a qualcun altro riceve un premio in cassaforte.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { creditMoney } from './economy.js';
import { worldNode } from './world-db.js';
import { rotateAround } from './render/primitives.js';
import {
  CABINET_GAMES,
  CABINET_IDS,
  type CabinetGameId,
  type CabinetRecord,
  RECORD_PRIZE,
  beats,
  decodeBest,
  decodeRecord,
  recordPrize,
} from './cabinet-rules.js';
import { type MiniGame, type PadInput, SCREEN_H, SCREEN_W, newMiniGame } from './cabinet-games.js';

type RecordKind = keyof typeof RECORD_PRIZE;

interface CabinetState {
  item: GameValue;
  id: CabinetGameId;
  mini: MiniGame;
  /** la partita è partita (si è premuto A): la sua ora è segnata nel database */
  started: boolean;
  /** la fine della partita è già stata registrata */
  finished: boolean;
  frame: number;
  last: number;
}

let state: CabinetState | null = null;
const input: PadInput = { left: false, right: false, up: false, down: false, action: false };
const personal: Partial<Record<CabinetGameId, number>> = {};
const records: Record<RecordKind, Partial<Record<CabinetGameId, CabinetRecord | null>>> = {
  world: {},
  global: {},
};

let screen: HTMLCanvasElement | null = null;
let modal: HTMLElement | null = null;

/** Si sta giocando al cabinato (per la presenza: gli altri vedono il giocatore davanti). */
export const cabinetOpen = (): boolean => state !== null;

/** Lo schermo del gioco in corso, da mostrare anche sul cabinato nella stanza. */
export const cabinetScreen = (): HTMLCanvasElement | null => (state ? screen : null);

/** Rotazione (0-3) del cabinato: lo schermo guarda verso +y, +x, -y, -x. */
const turn = (item: GameValue): number => (((item?.rot || 0) % 4) + 4) % 4;

/**
 * Davanti al cabinato si gioca girati verso lo schermo: di spalle se il cabinato guarda verso
 * chi osserva (rotazione 0 o 1), di fronte se guarda dall'altra parte.
 */
export function cabinetFacesAway(item: GameValue): boolean {
  return turn(item) < 2;
}

/** Il posto davanti allo schermo e la direzione verso il cabinato. */
function standSpot(item: GameValue): { x: number; y: number; dir: { x: number; y: number } } {
  const k = turn(item);
  const p = rotateAround(item.x, item.y + item.h / 2 + 14, item.x, item.y, k);
  return { x: p.x, y: p.y, dir: { x: item.x - p.x, y: item.y - p.y } };
}

/** Per disegnare il mio personaggio mentre gioca: girato verso lo schermo. */
export function cabinetPlayerPose(): { dir: { x: number; y: number }; back: boolean } | null {
  if (!state) return null;
  return { dir: standSpot(state.item).dir, back: cabinetFacesAway(state.item) };
}

// ---------------------------------------------------------------- database

const db = (): GameValue => game.session.db;
const online = (): boolean => !game.session.OFFLINE && !!game.session.authUid;
const stamp = (): GameValue => (online() ? { '.sv': 'timestamp' } : Date.now());
const recordPath = (kind: RecordKind, id: CabinetGameId): string =>
  (kind === 'world' ? worldNode('arcade_records') : 'sims_arcade_global') + '/' + id;

async function loadRecords(): Promise<void> {
  const pid = game.session.myPlayerId;
  try {
    const [mine, world, global]: GameValue[] = await Promise.all([
      db()
        .ref('sims_arcade_best/' + pid)
        .get(),
      db().ref(worldNode('arcade_records')).get(),
      db().ref('sims_arcade_global').get(),
    ]);
    const m = mine?.val() || {},
      w = world?.val() || {},
      g = global?.val() || {};
    for (const id of CABINET_IDS) {
      personal[id] = Math.max(personal[id] || 0, decodeBest(m[id]));
      records.world[id] = decodeRecord(w[id]);
      records.global[id] = decodeRecord(g[id]);
    }
  } catch (e) {
    console.warn('[cabinato] record', e);
  }
  renderInfo();
}

/** La partita comincia: l'ora la segna il server (le regole confrontano i punti col tempo). */
function startRun(id: CabinetGameId): void {
  if (!online()) return;
  db()
    .ref('sims_arcade_runs/' + game.session.authUid)
    .set({ g: id, t: stamp() })
    .catch((e: unknown) => console.warn('[cabinato] partita', e));
}

/** A fine partita: record personale, del condominio e mondiale, con gli eventuali premi. */
async function finishRun(id: CabinetGameId, score: number): Promise<string[]> {
  const lines: string[] = [];
  if (score <= 0) return lines;
  const pid: string = game.session.myPlayerId;
  const nick = String(game.player.myData.nick || 'Giocatore').slice(0, 20);
  if (score > (personal[id] || 0)) {
    try {
      await db().ref(`sims_arcade_best/${pid}/${id}`).set({ score, t: stamp() });
      personal[id] = score;
      lines.push('🏅 Nuovo record personale!');
    } catch (e) {
      console.warn('[cabinato] record personale', e);
    }
  }
  for (const kind of ['world', 'global'] as const) {
    const path = recordPath(kind, id);
    let before: CabinetRecord | null = null;
    try {
      before = decodeRecord((await db().ref(path).get()).val());
    } catch {
      continue;
    }
    if (!beats(score, before)) {
      records[kind][id] = before;
      continue;
    }
    // il database accetta solo un punteggio più alto di quello che c'è (e credibile)
    try {
      await db().ref(path).set({ score, pid, nick, t: stamp() });
    } catch (e) {
      console.warn('[cabinato] record', kind, e);
      continue;
    }
    records[kind][id] = { score, pid, nick, t: Date.now() };
    lines.push(kind === 'world' ? '🏢 Record del condominio!' : '🌍 Record mondiale!');
    const prize = recordPrize(id, kind, score, before, pid);
    if (prize && (await creditMoney(prize))) {
      lines.push(`💰 Premio: +${prize} € in cassaforte`);
      sfx('coin');
    }
  }
  return lines;
}

// ---------------------------------------------------------------- finestra

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function buildModal(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'cabinet-modal';
  el.className = 'fullscreen-modal hidden';
  el.innerHTML = `
    <div class="cab-shell">
      <div class="cab-marquee">🕹️ CABINATO CDC</div>
      <div class="cab-tabs">${CABINET_IDS.map(
        (id) =>
          `<button type="button" data-cab-game="${id}">${CABINET_GAMES[id].emoji} ${CABINET_GAMES[id].name}</button>`,
      ).join('')}</div>
      <div class="cab-bezel"><canvas class="cab-screen" width="${SCREEN_W}" height="${SCREEN_H}"></canvas></div>
      <div class="cab-info"></div>
      <div class="cab-pad">
        <div class="cab-arrows">
          <button type="button" data-cab-key="up">▲</button>
          <button type="button" data-cab-key="left">◀</button>
          <button type="button" data-cab-key="down">▼</button>
          <button type="button" data-cab-key="right">▶</button>
        </div>
        <button type="button" class="cab-a" data-cab-key="action">A</button>
      </div>
      <div class="cab-actions">
        <button type="button" class="cab-again">🔄 Nuova partita</button>
        <button type="button" class="cab-close">✖ Esci</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  screen = el.querySelector('canvas');
  el.querySelectorAll<HTMLButtonElement>('[data-cab-game]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx('click');
      selectGame(b.dataset.cabGame as CabinetGameId);
    }),
  );
  el.querySelector('.cab-again')!.addEventListener('click', () => state && selectGame(state.id));
  el.querySelector('.cab-close')!.addEventListener('click', closeCabinet);
  // pulsanti del telefono: premuti finché il dito resta giù
  el.querySelectorAll<HTMLButtonElement>('[data-cab-key]').forEach((b) => {
    const key = b.dataset.cabKey as keyof PadInput;
    const set = (v: boolean) => (e: Event) => {
      e.preventDefault();
      (input as unknown as Record<string, boolean>)[key] = v;
    };
    b.addEventListener('pointerdown', set(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'])
      b.addEventListener(ev, set(false));
  });
  // il dito sullo schermo: tocco = A, trascinando si sposta racchetta o razzo
  const toScreen = (e: PointerEvent): number => {
    const r = screen!.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * SCREEN_W;
  };
  screen!.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    screen!.setPointerCapture(e.pointerId);
    input.action = true;
    if (state?.id !== 'dog') input.pointerX = toScreen(e);
  });
  screen!.addEventListener('pointermove', (e) => {
    if (input.action && state?.id !== 'dog') input.pointerX = toScreen(e);
  });
  for (const ev of ['pointerup', 'pointercancel'])
    screen!.addEventListener(ev, () => {
      input.action = false;
      input.pointerX = null;
    });
  return el;
}

/** Tastiera: frecce o WASD, Spazio/Invio = A, Esc per uscire. */
const KEYS: Record<string, keyof PadInput> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'action',
  Enter: 'action',
  KeyK: 'action',
};
function onKey(e: KeyboardEvent): void {
  if (!state) return;
  if (e.code === 'Escape') {
    if (e.type === 'keydown') closeCabinet();
    return;
  }
  const key = KEYS[e.code];
  if (!key) return;
  e.preventDefault();
  e.stopPropagation();
  (input as unknown as Record<string, boolean>)[key] = e.type === 'keydown';
}

function renderInfo(): void {
  if (!modal || !state) return;
  const id = state.id;
  const rec = (r: CabinetRecord | null | undefined) =>
    r ? `${r.score.toLocaleString('it-IT')} · ${esc(r.nick)}` : 'nessuno';
  modal
    .querySelectorAll<HTMLButtonElement>('[data-cab-game]')
    .forEach((b) => b.classList.toggle('active', b.dataset.cabGame === id));
  const info = modal.querySelector('.cab-info')!;
  info.innerHTML = `
    <p class="cab-how">${CABINET_GAMES[id].how}</p>
    <ul class="cab-records">
      <li>👤 Il tuo record: <b>${(personal[id] || 0).toLocaleString('it-IT')}</b></li>
      <li>🏢 Condominio: <b>${rec(records.world[id])}</b> <span>premio ${RECORD_PRIZE.world} €</span></li>
      <li>🌍 Mondiale: <b>${rec(records.global[id])}</b> <span>premio ${RECORD_PRIZE.global} €</span></li>
    </ul>`;
}

function selectGame(id: CabinetGameId): void {
  if (!state) return;
  state.id = id;
  state.mini = newMiniGame(id);
  state.started = false;
  state.finished = false;
  modal?.classList.toggle('cab-pointer', id !== 'dog');
  renderInfo();
}

function loop(now: number): void {
  if (!state || !screen) return;
  const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
  state.last = now;
  const s = state;
  s.mini.update(dt, input);
  if (!s.started && !s.mini.waiting) {
    s.started = true;
    startRun(s.id);
  }
  if (s.mini.over && !s.finished) {
    s.finished = true;
    sfx('error');
    const id = s.id,
      score = s.mini.score;
    void finishRun(id, score).then((lines) => {
      if (lines.length) {
        toast(`🕹️ ${CABINET_GAMES[id].name}: ${score} punti. ${lines.join(' ')}`, 6000);
        sfx('success');
      }
      if (state?.id === id) renderInfo();
    });
  }
  const ctx = screen.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  s.mini.draw(ctx, now / 1000);
  s.frame = requestAnimationFrame(loop);
}

/** Davanti al cabinato: ci si mette in posizione e si apre lo schermo. */
export function openCabinet(item: GameValue): void {
  if (state || !item) return;
  if (game.player.isSleeping || game.benchSit) {
    toast('🕹️ Prima alzati!');
    return;
  }
  modal ||= buildModal();
  const spot = standSpot(item);
  game.playerPos = { x: spot.x, y: spot.y };
  game.keysPressed = { w: false, a: false, s: false, d: false };
  game.moveForward = 0;
  game.moveRight = 0;
  game.isWalking = false;
  Object.assign(input, {
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    pointerX: null,
  });
  const first = CABINET_IDS[0];
  state = {
    item,
    id: first,
    mini: newMiniGame(first),
    started: false,
    finished: false,
    frame: 0,
    last: performance.now(),
  };
  selectGame(first);
  modal.classList.remove('hidden');
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  sfx('coin');
  void loadRecords();
  state.frame = requestAnimationFrame(loop);
}

export function closeCabinet(): void {
  if (!state) return;
  cancelAnimationFrame(state.frame);
  state = null;
  modal?.classList.add('hidden');
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKey, true);
}
