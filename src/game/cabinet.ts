// Cabinato dei minigiochi (nella stanza, o la console a gettone della sala giochi): si apre su un
// menù con i tre giochi e le classifiche (i primi 10 del condominio e del mondo per ogni gioco);
// si gioca a schermo intero, dentro una cornice da cabinato vero. Chi diventa primo in classifica
// togliendo il posto a qualcun altro riceve un premio in cassaforte.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import { worldNode } from './world-db.js';
import { rotateAround } from './render/primitives.js';
import { currentWorldCode } from './world-select.js';
import {
  BOARD_SIZE,
  type BoardEntry,
  CABINET_GAMES,
  CABINET_IDS,
  type CabinetGameId,
  RECORD_PRIZE,
  boardLeader,
  decodeBest,
  decodeBoard,
  recordPrize,
} from './cabinet-rules.js';
import {
  type MiniGame,
  type PadInput,
  SCREEN_H,
  SCREEN_W,
  drawCoinPrompt,
  drawOverPanel,
  newMiniGame,
} from './cabinet-games.js';

type BoardKind = keyof typeof RECORD_PRIZE;
type View = 'menu' | 'scores' | 'play';

interface CabinetState {
  item: GameValue;
  view: View;
  id: CabinetGameId;
  mini: MiniGame;
  /** la partita è partita (si è premuto A): la sua ora è segnata nel database */
  started: boolean;
  /** la fine della partita è già stata registrata */
  finished: boolean;
  /** quando è finita (per non tornare al menù con lo stesso tocco) */
  overAt: number;
  /** i record battuti, da scrivere sullo schermo di fine partita */
  overLines: string[];
  frame: number;
  last: number;
  /** prezzo di una partita (0 = gratis: il cabinato di casa) */
  coin: number;
  /** la moneta per la prossima partita è stata pagata */
  paid: boolean;
  paying: boolean;
  /** il gioco di cui si guardano le classifiche */
  boardId: CabinetGameId;
}

let state: CabinetState | null = null;
const input: PadInput = { left: false, right: false, up: false, down: false, action: false };
const personal: Partial<Record<CabinetGameId, number>> = {};
const boards: Record<BoardKind, Partial<Record<CabinetGameId, BoardEntry[]>>> = {
  world: {},
  global: {},
};

let screen: HTMLCanvasElement | null = null;
let modal: HTMLElement | null = null;

/** Si sta giocando al cabinato (per la presenza: gli altri vedono il giocatore davanti). */
export const cabinetOpen = (): boolean => state !== null;

/** Lo schermo del gioco in corso, da mostrare anche sul cabinato nella stanza. */
export const cabinetScreen = (): HTMLCanvasElement | null =>
  state?.view === 'play' ? screen : null;

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
/** La classifica di un gioco: del condominio (nodo del mondo) o del mondo intero. */
const boardPath = (kind: BoardKind, id: CabinetGameId): string =>
  (kind === 'world' ? worldNode('arcade_board') : 'sims_arcade_top') + '/' + id;

async function readBoard(kind: BoardKind, id: CabinetGameId): Promise<BoardEntry[]> {
  const snap: GameValue = await db()
    .ref(boardPath(kind, id))
    .orderByChild('score')
    .limitToLast(BOARD_SIZE)
    .get();
  return decodeBoard(snap?.val());
}

/** Record personali e classifiche di tutti e tre i giochi. */
async function loadBoards(): Promise<void> {
  try {
    const mine: GameValue = await db()
      .ref('sims_arcade_best/' + game.session.myPlayerId)
      .get();
    const m = mine?.val() || {};
    for (const id of CABINET_IDS) personal[id] = Math.max(personal[id] || 0, decodeBest(m[id]));
    await Promise.all(
      CABINET_IDS.flatMap((id) =>
        (['world', 'global'] as const).map(async (kind) => {
          boards[kind][id] = await readBoard(kind, id);
        }),
      ),
    );
  } catch (e) {
    console.warn('[cabinato] classifiche', e);
  }
  render();
}

/** La partita comincia: l'ora la segna il server (le regole confrontano i punti col tempo). */
function startRun(id: CabinetGameId): void {
  if (!online()) return;
  db()
    .ref('sims_arcade_runs/' + game.session.authUid)
    .set({ g: id, t: stamp() })
    .catch((e: unknown) => console.warn('[cabinato] partita', e));
}

/**
 * A fine partita: record personale e le due classifiche. Restituisce le righe da scrivere sullo
 * schermo (maiuscole, senza accenti: il carattere a pixel non li ha).
 */
async function finishRun(id: CabinetGameId, score: number): Promise<string[]> {
  const lines: string[] = [];
  if (score <= 0) return lines;
  const pid: string = game.session.myPlayerId;
  const nick = String(game.player.myData.nick || 'Giocatore').slice(0, 20);
  if (score > (personal[id] || 0)) {
    try {
      await db().ref(`sims_arcade_best/${pid}/${id}`).set({ score, t: stamp() });
      personal[id] = score;
      lines.push('RECORD PERSONALE!');
    } catch (e) {
      console.warn('[cabinato] record personale', e);
    }
  }
  for (const kind of ['world', 'global'] as const) {
    const where = kind === 'world' ? 'CONDOMINIO' : 'MONDO';
    let before: BoardEntry[];
    try {
      before = await readBoard(kind, id);
    } catch {
      continue;
    }
    // il database tiene il proprio miglior punteggio: si scrive solo se lo migliora
    try {
      await db()
        .ref(`${boardPath(kind, id)}/${pid}`)
        .set({ score, nick, t: stamp() });
    } catch {
      boards[kind][id] = before;
      continue;
    }
    const after = await readBoard(kind, id).catch(() => before);
    boards[kind][id] = after;
    const place = after.findIndex((e) => e.pid === pid) + 1;
    const leader = boardLeader(before);
    if (place === 1 && (!leader || score > leader.score)) {
      lines.push(`PRIMO NEL ${where}!`);
      const prize = recordPrize(id, kind, score, leader, pid);
      if (prize && (await creditMoney(prize))) {
        lines.push(`PREMIO +${prize} DINDINI`);
        sfx('coin');
        toast(`🏆 Primo in classifica (${where.toLowerCase()}): +${prize} Đ in cassaforte!`, 5000);
      }
    } else if (place > 0) lines.push(`${place} POSTO NEL ${where}`);
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
    <div class="cab-shell cab-menu">
      <div class="cab-marquee"></div>
      <div class="cab-games"></div>
      <p class="cab-coin"></p>
      <div class="cab-actions">
        <button type="button" data-cab="scores">🏆 Classifiche</button>
        <button type="button" class="cab-close" data-cab="close">✖ Esci</button>
      </div>
    </div>
    <div class="cab-shell cab-scores">
      <div class="cab-marquee">🏆 CLASSIFICHE</div>
      <div class="cab-tabs">${CABINET_IDS.map(
        (id) =>
          `<button type="button" data-cab-board="${id}">${CABINET_GAMES[id].emoji} ${CABINET_GAMES[id].name}</button>`,
      ).join('')}</div>
      <div class="cab-boards"></div>
      <p class="cab-prize">Il primo di ogni classifica vince un premio quando qualcuno lo supera:
        ${RECORD_PRIZE.world} Đ nel condominio, ${RECORD_PRIZE.global} Đ nel mondo.</p>
      <div class="cab-actions"><button type="button" data-cab="menu">⬅ Menù</button></div>
    </div>
    <div class="cab-play">
      <div class="cab-frame">
        <div class="cab-glass"><canvas class="cab-screen" width="${SCREEN_W}" height="${SCREEN_H}"></canvas></div>
        <button type="button" class="cab-x" data-cab="menu" title="Torna al menù">✕</button>
      </div>
      <div class="cab-arrows">
        <button type="button" data-cab-key="up">▲</button>
        <button type="button" data-cab-key="left">◀</button>
        <button type="button" data-cab-key="down">▼</button>
        <button type="button" data-cab-key="right">▶</button>
      </div>
      <button type="button" class="cab-a" data-cab-key="action">A</button>
    </div>`;
  document.body.appendChild(el);
  screen = el.querySelector('canvas');
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-cab],[data-cab-game],[data-cab-board]',
    );
    if (!t || !state) return;
    if (t.dataset.cabGame) play(t.dataset.cabGame as CabinetGameId);
    else if (t.dataset.cabBoard) {
      state.boardId = t.dataset.cabBoard as CabinetGameId;
      render();
    } else if (t.dataset.cab === 'scores') show('scores');
    else if (t.dataset.cab === 'menu') show('menu');
    else if (t.dataset.cab === 'close') closeCabinet();
    sfx('click');
  });
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

/** Tastiera: frecce o WASD, Spazio/Invio = A, Esc per tornare indietro (e poi uscire). */
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
    if (e.type === 'keydown') state.view === 'menu' ? closeCabinet() : show('menu');
    return;
  }
  // nel menù la tastiera serve ai pulsanti (Invio, Tab): solo mentre si gioca è del gioco
  if (state.view !== 'play') return;
  const key = KEYS[e.code];
  if (!key) return;
  e.preventDefault();
  e.stopPropagation();
  (input as unknown as Record<string, boolean>)[key] = e.type === 'keydown';
}

function clearInput(): void {
  Object.assign(input, {
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    pointerX: null,
  });
}

/** Cambia schermata (menù, classifiche o gioco a schermo intero). */
function show(view: View): void {
  if (!state || !modal) return;
  state.view = view;
  modal.dataset.view = view;
  clearInput();
  render();
}

/** Dal menù: si comincia a giocare a un gioco, a schermo intero. */
function play(id: CabinetGameId): void {
  if (!state) return;
  state.id = id;
  state.mini = newMiniGame(id);
  // la moneta vale per una partita: cominciata quella, se ne serve un'altra
  if (state.started) state.paid = false;
  state.started = false;
  state.finished = false;
  state.overLines = [];
  modal?.classList.toggle('cab-pointer', id !== 'dog');
  show('play');
}

function boardHtml(list: BoardEntry[] | undefined): string {
  if (!list) return '<p class="cab-empty">Caricamento…</p>';
  if (!list.length)
    return '<p class="cab-empty">Ancora nessun punteggio: il primo posto è tuo!</p>';
  const me = game.session.myPlayerId;
  return `<ol>${list
    .map(
      (e) =>
        `<li class="${e.pid === me ? 'me' : ''}"><span>${esc(e.nick)}</span><b>${e.score.toLocaleString('it-IT')}</b></li>`,
    )
    .join('')}</ol>`;
}

function render(): void {
  if (!modal || !state) return;
  if (state.view === 'menu') {
    modal.querySelector('.cab-menu .cab-marquee')!.textContent = state.coin
      ? '🕹️ CONSOLE A GETTONE'
      : '🕹️ CABINATO CDC';
    modal.querySelector('.cab-games')!.innerHTML = CABINET_IDS.map(
      (id) => `<button type="button" class="cab-game" data-cab-game="${id}">
        <span class="cab-game-icon">${CABINET_GAMES[id].emoji}</span>
        <span class="cab-game-name">${CABINET_GAMES[id].name}</span>
        <span class="cab-game-how">${CABINET_GAMES[id].how}</span>
        <span class="cab-game-best">👤 Il tuo record: <b>${(personal[id] || 0).toLocaleString('it-IT')}</b></span>
      </button>`,
    ).join('');
    modal.querySelector('.cab-coin')!.textContent = state.coin
      ? `🪙 ${state.coin} Đ a partita${state.paid ? ' · moneta già inserita ✅' : ''}`
      : '';
  } else if (state.view === 'scores') {
    const id = state.boardId;
    modal
      .querySelectorAll<HTMLElement>('[data-cab-board]')
      .forEach((b) => b.classList.toggle('active', b.dataset.cabBoard === id));
    modal.querySelector('.cab-boards')!.innerHTML = `
      <div><h4>🏢 Condominio ${esc(currentWorldCode())}</h4>${boardHtml(boards.world[id])}</div>
      <div><h4>🌍 Mondo</h4>${boardHtml(boards.global[id])}</div>`;
  }
}

function loop(now: number): void {
  if (!state || !screen) return;
  const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
  state.last = now;
  const s = state;
  s.frame = requestAnimationFrame(loop);
  if (s.view !== 'play') return;
  if (s.coin && !s.paid) {
    // console a gettone: il gioco aspetta la moneta (A per pagare)
    if ((input.action || input.up) && !s.paying) {
      s.paying = true;
      input.action = input.up = false;
      void spendMoney(s.coin).then((ok) => {
        s.paying = false;
        if (ok) {
          s.paid = true;
          sfx('coin');
        } else toast(`🪙 Ti servono ${s.coin} Đ in cassaforte per giocare.`, 3000);
      });
    }
  } else if (!s.mini.over) s.mini.update(dt, input);
  else {
    // a fine partita (dopo un attimo, per non saltarla con lo stesso tocco) A torna al menù
    s.mini.update(dt, input);
    if (now - s.overAt > 900 && (input.action || input.up)) {
      show('menu');
      return;
    }
  }
  if (!s.started && !s.mini.waiting) {
    s.started = true;
    startRun(s.id);
  }
  if (s.mini.over && !s.finished) {
    s.finished = true;
    s.overAt = now;
    sfx('error');
    const id = s.id,
      score = s.mini.score;
    void finishRun(id, score).then((lines) => {
      if (state && state.id === id) state.overLines = lines;
      if (lines.length) sfx('success');
    });
  }
  const ctx = screen.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  s.mini.draw(ctx, now / 1000);
  if (s.coin && !s.paid) drawCoinPrompt(ctx, s.coin, now / 1000);
  if (s.mini.over) drawOverPanel(ctx, s.mini.score, s.overLines, now / 1000);
}

/** Davanti al cabinato: ci si mette in posizione e si apre il menù. */
/** `coin`: prezzo di una partita (la console della sala giochi); il cabinato di casa è gratis. */
export function openCabinet(item: GameValue, coin = 0): void {
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
  const first = CABINET_IDS[0];
  state = {
    item,
    view: 'menu',
    id: first,
    mini: newMiniGame(first),
    started: false,
    finished: false,
    overAt: 0,
    overLines: [],
    frame: 0,
    last: performance.now(),
    coin,
    paid: false,
    paying: false,
    boardId: first,
  };
  show('menu');
  modal.classList.remove('hidden');
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  sfx('coin');
  void loadBoards();
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
