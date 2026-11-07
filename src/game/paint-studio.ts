import { notePersonality } from './personality.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { hasRoom } from './saves.js';
import { askPaintingTitle, canNamePainting, paintingTitle } from './painting-titles.js';
import { quoted } from './painting-title-rules.js';
import { sfx } from './audio.js';
import {
  PAINT_H,
  PAINT_PALETTE,
  PAINT_W,
  type PaintGrid,
  blankPainting,
  encodePainting,
  floodFill,
  isBlankPainting,
  paintLine,
  MAX_ROOM_PAINTINGS,
  PAINTING_SLOTS,
  type PaintingSlot,
  firstFreeSlot,
  roomPaintings,
  slotOfKey,
} from './painting-rules.js';
import { worldNode } from './world-db.js';
import { paintingImage } from './render/scenes.js';
import { cancelAuction, startAuction } from './auctions.js';

type Tool = 1 | 3 | 6 | 'fill';
const studio = {
  grid: blankPainting(),
  color: 1,
  tool: 3 as Tool,
  undo: [] as PaintGrid[],
  drawing: false,
  last: null as { x: number; y: number } | null,
  mountedFor: null as unknown,
};

// ---------------------------------------------------------------- disegno sulla tela

function render(): void {
  const cv = dom('paint-canvas') as HTMLCanvasElement | null;
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return;
  const cw = cv.width / PAINT_W,
    ch = cv.height / PAINT_H;
  for (let y = 0; y < PAINT_H; y++)
    for (let x = 0; x < PAINT_W; x++) {
      ctx.fillStyle = PAINT_PALETTE[studio.grid[y * PAINT_W + x]];
      ctx.fillRect(x * cw, y * ch, cw, ch);
    }
  // griglia leggera per aiutare a disegnare
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < PAINT_W; x++) {
    ctx.moveTo(x * cw + 0.5, 0);
    ctx.lineTo(x * cw + 0.5, cv.height);
  }
  for (let y = 1; y < PAINT_H; y++) {
    ctx.moveTo(0, y * ch + 0.5);
    ctx.lineTo(cv.width, y * ch + 0.5);
  }
  ctx.stroke();
}

function cellAt(cv: HTMLCanvasElement, e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(PAINT_W - 1, Math.floor(((e.clientX - r.left) / r.width) * PAINT_W))),
    y: Math.max(0, Math.min(PAINT_H - 1, Math.floor(((e.clientY - r.top) / r.height) * PAINT_H))),
  };
}

function pushUndo(): void {
  studio.undo.push(studio.grid.slice());
  if (studio.undo.length > 30) studio.undo.shift();
}

function renderTools(): void {
  const pal = dom('paint-palette');
  pal.innerHTML = '';
  PAINT_PALETTE.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'paint-swatch' + (i === studio.color ? ' active' : '');
    b.style.background = c;
    b.title = i === 0 ? 'Bianco (gomma)' : 'Colore';
    b.onclick = () => {
      studio.color = i;
      renderTools();
    };
    pal.appendChild(b);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-paint-tool]').forEach((b) => {
    const value = b.dataset.paintTool === 'fill' ? 'fill' : Number(b.dataset.paintTool);
    b.classList.toggle('active', value === studio.tool);
  });
}

// Collega mouse e dita alla tela una volta per sessione di gioco.
function mount(): void {
  if (studio.mountedFor === lifetime) return;
  studio.mountedFor = lifetime;
  const cv = dom('paint-canvas') as HTMLCanvasElement;
  lifetime.listen(cv, 'pointerdown', ((e: PointerEvent) => {
    e.preventDefault();
    cv.setPointerCapture?.(e.pointerId);
    const p = cellAt(cv, e);
    pushUndo();
    if (studio.tool === 'fill') {
      floodFill(studio.grid, p.x, p.y, studio.color);
      render();
      return;
    }
    studio.drawing = true;
    studio.last = p;
    paintLine(studio.grid, p.x, p.y, p.x, p.y, studio.tool, studio.color);
    render();
  }) as EventListener);
  lifetime.listen(cv, 'pointermove', ((e: PointerEvent) => {
    if (!studio.drawing || studio.tool === 'fill') return;
    const p = cellAt(cv, e);
    const l = studio.last || p;
    paintLine(studio.grid, l.x, l.y, p.x, p.y, studio.tool, studio.color);
    studio.last = p;
    render();
  }) as EventListener);
  const stop = () => {
    studio.drawing = false;
    studio.last = null;
  };
  lifetime.listen(cv, 'pointerup', stop);
  lifetime.listen(cv, 'pointercancel', stop);
  lifetime.listen(cv, 'pointerleave', stop);
  document.querySelectorAll<HTMLButtonElement>('[data-paint-tool]').forEach((b) =>
    lifetime.listen(b, 'click', () => {
      studio.tool = b.dataset.paintTool === 'fill' ? 'fill' : (Number(b.dataset.paintTool) as Tool);
      renderTools();
    }),
  );
  lifetime.listen(dom('paint-undo'), 'click', () => {
    const prev = studio.undo.pop();
    if (prev) studio.grid = prev;
    render();
  });
  lifetime.listen(dom('paint-clear'), 'click', () => {
    pushUndo();
    studio.grid = blankPainting();
    render();
  });
  lifetime.listen(dom('paint-cancel'), 'click', () => dom('paint-modal').classList.add('hidden'));
  lifetime.listen(dom('paint-done'), 'click', () => void finishPainting());
}

// ---------------------------------------------------------------- apertura e chiusura

export function openPaintStudio(): void {
  if (!hasRoom()) {
    toast('🏠 Ti serve una stanza dove appendere il quadro: prima prendi una stanza!', 4000);
    return;
  }
  mount();
  studio.grid = blankPainting();
  studio.undo = [];
  studio.color = 1;
  studio.tool = 3;
  renderTools();
  render();
  dom('paint-modal').classList.remove('hidden');
}

async function finishPainting(): Promise<void> {
  if (isBlankPainting(studio.grid)) {
    toast('🖌️ La tela è ancora bianca: dipingi qualcosa prima di finire!', 3000);
    return;
  }
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  const free = firstFreeSlot(room);
  dom('paint-modal').classList.add('hidden');
  const res: GameValue = await openDialog({
    title: '🖼️ Quadro finito!',
    text:
      'Che capolavoro! Cosa ne fai?\n\n' +
      "🔨 All'asta: lo vedono tutti su quadrivendo.it e nel catalogo della Galleria d'Arte, riceve cuoricini e offerte e tu accetti quella che preferisci.\n" +
      '🖼️ In casa: lo appendi nella tua stanza ed è tuo per sempre (niente offerte).' +
      (free
        ? `\n\nNella tua stanza puoi appendere fino a ${MAX_ROOM_PAINTINGS} quadri.`
        : `\n\nHai già ${MAX_ROOM_PAINTINGS} quadri appesi: per appenderlo dovrai sceglierne uno da sostituire.`),
    buttons: [
      { label: 'Torna a dipingere', value: 'back', color: '#57606f' },
      { label: '🗑️ Butta via', value: 'discard', color: '#636e72' },
      { label: "🔨 Metti all'asta", value: 'auction', color: '#e17055' },
      { label: '🖼️ Appendi in casa', value: 'hang', color: '#2ed573' },
    ],
  });
  if (res.action === 'back') {
    dom('paint-modal').classList.remove('hidden');
    return;
  }
  if (res.action === 'auction') {
    // se non riesce si torna alla tela: il quadro non va perso
    if (!(await startAuction(encodePainting(studio.grid))))
      dom('paint-modal').classList.remove('hidden');
    return;
  }
  if (res.action !== 'hang') {
    toast('Il quadro è finito nel cestino.', 2500);
    return;
  }
  const code = encodePainting(studio.grid);
  const spot = await pickWallSlot(code);
  if (!spot) {
    dom('paint-modal').classList.remove('hidden');
    return;
  }
  const slot = spot.slot;
  let hung = false;
  try {
    await game.session.db.ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}`).update({
      [`paintings/${slot}`]: code,
      [`sale/${slot}`]: null,
    });
    game.player.stats.paintings = (game.player.stats.paintings || 0) + 1;
    notePersonality('paint');
    sfx('success');
    toast(
      free
        ? '🖼️ Il tuo quadro è appeso nella tua stanza! Puoi spostarlo con 🖐️ Sposta Mobile.'
        : '🖼️ Quadro sostituito!',
      4000,
    );
    hung = true;
  } catch (error) {
    console.warn('[painting]', error);
    await spot.undo();
    toast('Non sono riuscito ad appendere il quadro. Riprova quando sei connesso.', 4000);
  }
  // appena appeso, gli si dà un nome
  if (hung) await askPaintingTitle(code, '🖼️ Il tuo quadro è appeso! Come si chiama?');
}

const SLOT_PLACE: Record<PaintingSlot, string> = {
  p1: 'quadro 1',
  p2: 'quadro 2',
  p3: 'quadro 3',
};

/** Anteprima di un quadro, con i quadretti netti. */
function previewOf(code: string, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const img = paintingImage(code);
  if (ctx && img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
  }
  return cv;
}

/** Il posto sulla parete per un quadro, e come rimettere le cose a posto se poi non si appende. */
export interface WallSpot {
  slot: PaintingSlot;
  /** Annulla quello che si è fatto del quadro tolto (lo toglie dall'asta). */
  undo: () => Promise<void>;
}

const noUndo = async (): Promise<void> => {};

/**
 * Dove appendere il quadro `incoming`: il primo posto libero, oppure quello di un quadro da
 * sostituire. Il quadro che lascia la parete si mette all'asta o si butta via. L'asta si apre
 * prima di appendere il nuovo: se poi appenderlo non riesce, `undo` la chiude e nulla va perso.
 */
export async function pickWallSlot(incoming: string): Promise<WallSpot | null> {
  const free = firstFreeSlot(game.roomsState[game.myAssignedRoomIdx ?? -1]);
  if (free) return { slot: free, undo: noUndo };
  for (;;) {
    const slot = await chooseSlotToReplace(incoming);
    if (!slot) return null;
    const old = roomPaintings(game.roomsState[game.myAssignedRoomIdx ?? -1])[slot];
    if (!old) return { slot, undo: noUndo };
    const title = paintingTitle(old);
    const res: GameValue = await openDialog({
      title: '🖼️ E il quadro che togli?',
      text:
        `${title ? quoted(title) : `Il ${SLOT_PLACE[slot]}`} lascia la parete.\n\n` +
        "🔨 All'asta: lo vedono tutti su quadrivendo.it e nel catalogo della Galleria d'Arte, e tu accetti l'offerta che preferisci.\n" +
        '🗑️ Buttandolo via, invece, va perso per sempre.',
      buttons: [
        { label: '↩️ Scegli un altro', value: 'back', color: '#57606f' },
        { label: '🗑️ Butta via', value: 'discard', color: '#636e72' },
        { label: "🔨 Metti all'asta", value: 'auction', color: '#e17055' },
      ],
    });
    if (res.action === 'discard') return { slot, undo: noUndo };
    if (res.action === 'back') continue;
    if (res.action !== 'auction') return null;
    // se non si riesce a metterlo all'asta si torna alla scelta: il quadro resta appeso
    if (!(await startAuction(old, { resale: true }))) continue;
    return { slot, undo: () => cancelAuction(old) };
  }
}

/**
 * Le pareti sono piene: si sceglie quale quadro togliere guardando le anteprime dei tre appesi
 * (e, sopra, quello che arriva). Che fine fa quello tolto lo decide pickWallSlot.
 */
export function chooseSlotToReplace(incoming?: string): Promise<PaintingSlot | null> {
  return chooseHungPainting({
    title: '🖼️ Quale quadro sostituisci?',
    sub: "Le pareti sono piene: tocca il quadro da togliere. Dopo scegli se metterlo <b>all'asta</b> o buttarlo via.",
    action: 'sostituisci',
    incoming,
  });
}

/**
 * Le anteprime dei quadri appesi nella propria stanza, da toccare per sceglierne uno: quello da
 * sostituire, o quello da mettere all'asta. `incoming`: il quadro nuovo, mostrato sopra.
 */
export function chooseHungPainting(opt: {
  title: string;
  sub: string;
  action: string;
  incoming?: string;
}): Promise<PaintingSlot | null> {
  const { incoming } = opt;
  const hung = roomPaintings(game.roomsState[game.myAssignedRoomIdx ?? -1]);
  let el = document.getElementById('replace-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'replace-modal';
    el.className = 'fullscreen-modal hidden';
    document.body.appendChild(el);
  }
  const modal = el;
  modal.innerHTML =
    `<div class="card replace-card">` +
    `<h3>${opt.title}</h3>` +
    (incoming
      ? `<div class="replace-new"><div class="replace-frame"></div><span>Il quadro nuovo</span></div>`
      : '') +
    `<p class="replace-sub">${opt.sub}</p>` +
    `<div class="replace-grid"></div>` +
    `<button type="button" class="btn-primary replace-cancel">Annulla</button></div>`;
  if (incoming)
    modal.querySelector('.replace-new .replace-frame')!.appendChild(previewOf(incoming, 120, 90));
  return new Promise((resolve) => {
    const done = (slot: PaintingSlot | null) => {
      modal.classList.add('hidden');
      resolve(slot);
    };
    const grid = modal.querySelector('.replace-grid')!;
    for (const slot of PAINTING_SLOTS) {
      const code = hung[slot];
      // si sceglie solo fra i quadri appesi (sostituendo, le pareti sono comunque piene)
      if (!code) continue;
      const title = paintingTitle(code);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'replace-slot';
      const frame = document.createElement('div');
      frame.className = 'replace-frame';
      frame.appendChild(previewOf(code, 120, 90));
      b.appendChild(frame);
      const label = document.createElement('div');
      label.className = 'replace-label';
      // il titolo, e il numero che si vede avvicinandosi al quadro nella stanza
      label.textContent = title ? `«${title}»` : `Quadro ${slot.slice(1)}`;
      b.appendChild(label);
      const hint = document.createElement('div');
      hint.className = 'replace-hint';
      hint.textContent = title
        ? `Quadro ${slot.slice(1)} · ${opt.action}`
        : opt.action[0].toUpperCase() + opt.action.slice(1);
      b.appendChild(hint);
      b.onclick = () => done(slot);
      grid.appendChild(b);
    }
    modal.querySelector<HTMLButtonElement>('.replace-cancel')!.onclick = () => done(null);
    modal.onclick = (e) => {
      if (e.target === modal) done(null);
    };
    modal.classList.remove('hidden');
  });
}

/** Nella propria stanza: spiegazione e possibilità di staccare il quadro dalla parete. */
export async function managePainting(key: string): Promise<void> {
  const slot = slotOfKey(key);
  if (!slot) return;
  const code = roomPaintings(game.roomsState[game.myAssignedRoomIdx ?? -1])[slot];
  const title = paintingTitle(code);
  const res: GameValue = await openDialog({
    title: `🖼️ ${title ? quoted(title) : `Il tuo ${SLOT_PLACE[slot]}`}`,
    text: 'Per spostarlo lungo le pareti usa 🖐️ Sposta Mobile.\nSe lo togli, liberi il posto per un nuovo quadro del Laboratorio Artistico.',
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      ...(code && canNamePainting(code)
        ? [{ label: title ? '✏️ Cambia nome' : '✏️ Dai un nome', value: 'name', color: '#6c5ce7' }]
        : []),
      { label: '🗑️ Togli dalla parete', value: 'remove', color: '#d63031' },
    ],
  });
  if (res.action === 'name' && code) {
    await askPaintingTitle(code, 'Come si chiama questo quadro?');
    return;
  }
  if (res.action !== 'remove') return;
  try {
    await game.session.db.ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}`).update({
      [`paintings/${slot}`]: null,
      [`sale/${slot}`]: null,
    });
    toast('Il quadro è stato tolto dalla parete.', 3000);
  } catch (error) {
    console.warn('[painting]', error);
    toast('Non sono riuscito a togliere il quadro. Riprova quando sei connesso.', 4000);
  }
}
