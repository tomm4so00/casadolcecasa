// Negozio di oggetti da collezione e mensola della stanza (le regole sono in collect-rules.ts).
//
// Comprare: si paga, poi si prende il pezzo con una transazione (se qualcuno l'ha preso un attimo
// prima, i soldi tornano indietro); infine al suo posto nell'espositore arriva un pezzo a caso. Se
// quest'ultimo passo non riesce, lo rifà il primo giocatore che entra nel negozio.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import { saveGame } from './saves.js';
import { postGossip } from './gossip.js';
import {
  type CollectState,
  SHELF_SPOTS,
  STANDS,
  collectible,
  collectionOf,
  decodeCollect,
  freeShelfSpot,
  onSale,
  pickForStand,
  shelfOf,
  standNeedsRefill,
} from './collect-rules.js';

/** Ambiente del negozio. */
export const COLLECT_ENV = 'collezionismo';

let state: CollectState = decodeCollect(null);
let started = false;
let refilling = false;

const me = (): string => game.session.myPlayerId;
const ref = (path: string): GameValue =>
  game.session.db.ref(path ? 'sims_collect/' + path : 'sims_collect');
const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;

/** Stato attuale di espositori e proprietari (per il disegno). */
export const collectState = (): CollectState => state;

const listeners = new Set<() => void>();
/** Si chiama a ogni cambio di espositori, proprietari o annunci (per esempio dal negozio dell'usato). */
export function onCollectChange(fn: () => void): void {
  listeners.add(fn);
}

/** Ascolta espositori e proprietari. */
export function startCollect(): void {
  if (started) return;
  started = true;
  ref('').on('value', (snap: GameValue): void => {
    state = decodeCollect(snap.val());
    updateStandNames();
    listeners.forEach((fn) => fn());
    if (game.view.activeEnvironment === COLLECT_ENV) void refillStands();
  });
}

/** Il nome sopra ogni espositore è quello del pezzo esposto. */
function updateStandNames(): void {
  const map: GameValue = game.collectShopFurniture;
  if (!map) return;
  for (let i = 0; i < STANDS; i++) {
    const c = onSale(state, i);
    const it = map['colStand' + i];
    if (it) it.name = c ? `${c.emoji} ${c.name}` : 'Espositore vuoto';
  }
}

/** Riempie gli espositori vuoti o con un pezzo già venduto. Si chiama entrando nel negozio. */
export async function refillStands(): Promise<void> {
  if (refilling) return;
  refilling = true;
  try {
    for (let i = 0; i < STANDS; i++) {
      if (!standNeedsRefill(state, i) || !pickForStand(state, i)) continue;
      await ref('slots/' + i).transaction((cur: GameValue) => {
        const now: CollectState = { ...state, slots: [...state.slots] };
        now.slots[i] = typeof cur === 'string' ? cur : null;
        if (!standNeedsRefill(now, i)) return undefined;
        return pickForStand(now, i) ?? undefined;
      });
    }
  } catch (error) {
    console.warn('[collezionismo]', error);
  } finally {
    refilling = false;
  }
}

// ---------------------------------------------------------------- negozio

/** Testo del pulsante vicino all'espositore `i`. */
export function standPrompt(i: number): { text: string; locked?: boolean } {
  const c = onSale(state, i);
  if (!c) return { text: '🏺 Espositore vuoto', locked: true };
  return { text: `${c.emoji} Compra ${c.name} (${euro(c.price)})` };
}

/** Compra il pezzo dell'espositore `i`. */
export async function buyFromStand(i: number): Promise<void> {
  const c = onSale(state, i);
  if (!c) {
    toast('🏺 Qui non c’è niente in vendita in questo momento.', 3000);
    return;
  }
  if (game.moneyLevel < c.price) {
    toast(`❌ Ti servono ${euro(c.price)} per ${c.name}.`, 4000);
    return;
  }
  const res = await openDialog({
    title: `${c.emoji} ${c.name}`,
    text: `Pezzo unico: ne esiste una sola copia in tutto il gioco. Se lo compri sarà solo tuo e potrai metterlo sulla mensola della tua stanza.\n\nPrezzo: ${euro(c.price)}.`,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: `🏺 Compra (${euro(c.price)})`, value: 'ok', color: '#8e44ad' },
    ],
  });
  if (res.action !== 'ok') return;
  // nel frattempo qualcuno potrebbe averlo comprato
  if (onSale(state, i)?.id !== c.id) {
    toast('🏺 Qualcuno l’ha comprato un attimo prima di te!', 4000);
    return;
  }
  if (!(await spendMoney(c.price))) return;
  let got = false;
  const shelf = freeShelfSpot(state, me());
  try {
    const r = await ref('owners/' + c.id).transaction((cur: GameValue) =>
      cur
        ? undefined
        : {
            o: me(),
            on: game.player.myData.nick,
            t: Date.now(),
            // va subito sulla mensola, se c'è posto
            ...(shelf !== null ? { s: shelf } : {}),
          },
    );
    got = !!r?.committed && r.snapshot?.val()?.o === me();
  } catch (error) {
    console.warn('[collezionismo]', error);
  }
  if (!got) {
    await creditMoney(c.price);
    toast('🏺 Qualcuno l’ha comprato un attimo prima di te: soldi restituiti.', 5000);
    return;
  }
  sfx('personality');
  toast(
    `${c.emoji} ${c.name} è tuo!` +
      (shelf !== null
        ? ' L’ho messo sulla mensola della tua stanza.'
        : ' Sistemalo dalla mensola.'),
    5000,
  );
  postGossip(`${game.player.myData.nick} ha comprato il pezzo unico ${c.emoji} ${c.name}`);
  saveGame(true);
  await refillStands();
}

// ---------------------------------------------------------------- mensola

/** Testo del pulsante vicino alla mensola. */
export function shelfPrompt(mine: boolean): { text: string } {
  return { text: mine ? '🏺 Sistema la mensola' : '🏺 Guarda la mensola' };
}

/** La mensola della mia stanza: si scelgono fino a tre pezzi da esporre. */
export async function openShelf(
  mine: boolean,
  ownerId?: string,
  ownerName?: string,
): Promise<void> {
  if (!mine) {
    const shown = ownerId ? shelfOf(state, ownerId).filter(Boolean) : [];
    await openDialog({
      title: '🏺 Mensola dei collezionabili',
      text: shown.length
        ? `Pezzi unici di ${ownerName || 'questo giocatore'}:\n\n` +
          shown.map((c) => `${c!.emoji} ${c!.name}`).join('\n')
        : 'La mensola è vuota.',
      buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
    });
    return;
  }
  for (;;) {
    const owned = collectionOf(state, me());
    const shelf = shelfOf(state, me());
    const count = shelf.filter(Boolean).length;
    const res = await openDialog({
      title: '🏺 La tua mensola',
      text: owned.length
        ? `Sulla mensola ci stanno ${SHELF_SPOTS} pezzi (ora ${count}). Tocca un pezzo per metterlo o toglierlo.\nPer spostare la mensola usa la modalità Arreda.`
        : 'Non hai ancora pezzi da collezione. Li trovi nel negozio di oggetti da collezione, al centro commerciale: ogni pezzo esiste in una sola copia!',
      buttons: [
        ...owned.map((c) => {
          const on = state.owners[c.id]?.s !== undefined;
          return {
            // 🏷️ = in vendita al negozio dell'usato
            label: `${on ? '✅' : '➕'} ${c.emoji} ${c.name}${state.owners[c.id]?.sale ? ' 🏷️' : ''}`,
            value: c.id,
            color: on ? '#2e86de' : '#636e72',
          };
        }),
        { label: 'Chiudi', value: null, color: '#57606f' },
      ],
    });
    const c = collectible(res.action);
    if (!c) return;
    await toggleOnShelf(c.id);
  }
}

async function toggleOnShelf(id: string): Promise<void> {
  const entry = state.owners[id];
  if (!entry || entry.o !== me()) return;
  if (entry.s !== undefined) {
    await ref(`owners/${id}/s`).set(null);
    return;
  }
  const spot = freeShelfSpot(state, me());
  if (spot === null) {
    toast(`🏺 La mensola è piena: togli prima un pezzo (massimo ${SHELF_SPOTS}).`, 4000);
    return;
  }
  await ref(`owners/${id}/s`).set(spot);
}
