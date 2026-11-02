import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { hasRoom } from './saves.js';
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
  type PaintingSlot,
  firstFreeSlot,
  slotOfKey,
} from './painting-rules.js';

type Tool = 1 | 2 | 4 | 'fill';
const studio = {
  grid: blankPainting(),
  color: 1,
  tool: 2 as Tool,
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
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
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
  studio.tool = 2;
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
      'Che capolavoro! Vuoi appenderlo nella tua stanza?' +
      (free
        ? `\n\nNella tua stanza puoi appendere fino a ${MAX_ROOM_PAINTINGS} quadri.`
        : `\n\nHai già ${MAX_ROOM_PAINTINGS} quadri appesi: dovrai sceglierne uno da sostituire.`),
    buttons: [
      { label: 'Torna a dipingere', value: 'back', color: '#57606f' },
      { label: '🗑️ Butta via', value: 'discard', color: '#636e72' },
      { label: '🖼️ Appendi', value: 'hang', color: '#2ed573' },
    ],
  });
  if (res.action === 'back') {
    dom('paint-modal').classList.remove('hidden');
    return;
  }
  if (res.action !== 'hang') {
    toast('Il quadro è finito nel cestino.', 2500);
    return;
  }
  const slot = free ?? (await chooseSlotToReplace());
  if (!slot) {
    dom('paint-modal').classList.remove('hidden');
    return;
  }
  try {
    await game.session.db
      .ref(`sims_rooms_state/${game.myAssignedRoomIdx}/paintings/${slot}`)
      .set(encodePainting(studio.grid));
    game.player.stats.paintings = (game.player.stats.paintings || 0) + 1;
    sfx('success');
    toast(
      free
        ? '🖼️ Il tuo quadro è appeso nella tua stanza! Puoi spostarlo con 🖐️ Sposta Mobile.'
        : '🖼️ Quadro sostituito!',
      4000,
    );
  } catch (error) {
    console.warn('[painting]', error);
    toast('Non sono riuscito ad appendere il quadro. Riprova quando sei connesso.', 4000);
  }
}

const SLOT_PLACE: Record<PaintingSlot, string> = {
  p1: 'quadro 1',
  p2: 'quadro 2',
  p3: 'quadro 3',
};

async function chooseSlotToReplace(): Promise<PaintingSlot | null> {
  const res: GameValue = await openDialog({
    title: '🖼️ Quale quadro sostituisci?',
    text: 'Le pareti sono piene. Avvicinandoti a un quadro nella stanza vedi il suo numero.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Quadro 1', value: 'p1', color: '#e17055' },
      { label: 'Quadro 2', value: 'p2', color: '#e17055' },
      { label: 'Quadro 3', value: 'p3', color: '#e17055' },
    ],
  });
  return (res.action as PaintingSlot) || null;
}

/** Nella propria stanza: spiegazione e possibilità di staccare il quadro dalla parete. */
export async function managePainting(key: string): Promise<void> {
  const slot = slotOfKey(key);
  if (!slot) return;
  const res: GameValue = await openDialog({
    title: `🖼️ Il tuo ${SLOT_PLACE[slot]}`,
    text: 'Per spostarlo lungo le pareti usa 🖐️ Sposta Mobile.\nSe lo togli, liberi il posto per un nuovo quadro del Laboratorio Artistico.',
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      { label: '🗑️ Togli dalla parete', value: 'remove', color: '#d63031' },
    ],
  });
  if (res.action !== 'remove') return;
  try {
    await game.session.db
      .ref(`sims_rooms_state/${game.myAssignedRoomIdx}/paintings/${slot}`)
      .remove();
    toast('Il quadro è stato tolto dalla parete.', 3000);
  } catch (error) {
    console.warn('[painting]', error);
    toast('Non sono riuscito a togliere il quadro. Riprova quando sei connesso.', 4000);
  }
}
