// Zaino consultabile ovunque; gli oggetti restano collegati alle scorte del personaggio.
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { inventoryItems, inventorySlots, INVENTORY_SIZE } from './inventory-rules.js';
import { smokeJoint, smokeJointError } from './weed.js';
import { initializeInventory, inventoryChange } from './inventory-market.js';
import { drugTake } from './needs.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { toast } from './missions.js';

let selectedId: string | null = null;
let rendered = '';
let boundModal: HTMLElement | null = null;
let usingDose = false;

export function closeInventory(): void {
  dom('inventory-modal').classList.add('hidden');
  dom('btn-inventory').focus();
}

export function openInventory(): void {
  const modal = dom('inventory-modal') as HTMLElement;
  if (boundModal !== modal) {
    boundModal = modal;
    lifetime.listen(modal, 'keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeInventory();
      }
      if (event.key === 'Tab') {
        const buttons = [...modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }
  game.moveRight = game.moveForward = 0;
  game.keysPressed = { w: false, a: false, s: false, d: false };
  modal.classList.remove('hidden');
  rendered = '';
  updateInventory();
  dom('inventory-close').focus();
  void initializeInventory().then(() => updateInventory());
}

export function selectInventoryItem(id: string): void {
  selectedId = id;
  updateInventory();
}

export async function smokeInventoryJoint(): Promise<void> {
  if (await smokeJoint()) closeInventory();
  else updateInventory();
}

export async function consumeInventoryDrug(): Promise<void> {
  if (usingDose || game.socBusy() || game.player.drugStock < 1) return;
  usingDose = true;
  closeInventory();
  try {
    const answer = await openDialog({
      title: '💊 Assumere una dose?',
      text: `Consumi 1 dose e recuperi ${game.DRUG_EUPHORIA} punti felicità. Crea dipendenza e fa calare la salute per giorni.`,
      buttons: [
        { label: 'Annulla', value: null, color: '#57606f' },
        { label: 'Assumi', value: 'yes', color: '#8e44ad' },
      ],
    });
    if (answer.action !== 'yes') {
      openInventory();
      return;
    }
    if (game.socBusy()) {
      toast('Finisci prima quello che stai facendo.');
      return;
    }
    if (!(await inventoryChange((ledger) => ledger.consume('drug')))) return;
    drugTake();
    await saveGame(true);
  } finally {
    usingDose = false;
    updateInventory();
  }
}

export function updateInventory(): void {
  const modal = dom('inventory-modal') as HTMLElement | null;
  if (!modal || modal.classList.contains('hidden')) return;
  const items = inventoryItems(game.player);
  if (!items.some((item) => item.id === selectedId)) selectedId = items[0]?.id ?? null;
  const smokeButton = dom('inventory-smoke') as HTMLButtonElement;
  const showSmoke = selectedId === 'weed';
  const error = showSmoke ? smokeJointError() : null;
  smokeButton.classList.toggle('hidden', !showSmoke);
  smokeButton.disabled = !!error;
  smokeButton.title = error ?? 'Consuma 1 g · Felicità +10% · Velocità −10% per 10 minuti';
  const drugButton = dom('inventory-drug') as HTMLButtonElement;
  drugButton.classList.toggle('hidden', selectedId !== 'drug');
  drugButton.disabled = usingDose || !!game.socBusy();
  dom('inventory-trade').dataset.arg = selectedId ?? '';
  const useHint = showSmoke
    ? (error ?? 'Felicità +10% · Occhi rossi e velocità −10% per 10 minuti. Una ogni 30 minuti.')
    : selectedId === 'drug'
      ? 'Una dose dà +20 punti felicità, crea dipendenza e fa calare la salute per giorni. Puoi anche scambiarla.'
      : '';
  if (dom('inventory-use-hint').textContent !== useHint)
    dom('inventory-use-hint').textContent = useHint;
  const key = JSON.stringify([items, selectedId]);
  if (key === rendered) return;
  rendered = key;
  // Conserva il focus se le quantità cambiano mentre lo zaino è aperto.
  const focused = (document.activeElement as HTMLElement | null)?.dataset.inventoryId;
  const grid = dom('inventory-grid') as HTMLElement;
  grid.replaceChildren();
  for (const [i, item] of inventorySlots(items).entries()) {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'inventory-slot';
    if (item) {
      slot.dataset.action = 'selectInventoryItem';
      slot.dataset.arg = item.id;
      slot.dataset.inventoryId = item.id;
      slot.setAttribute('aria-label', `${item.name}: ${item.quantity} ${item.unit}`);
      slot.setAttribute('aria-pressed', String(item.id === selectedId));
      slot.title = `${item.name}: ${item.quantity} ${item.unit}`;
      for (const [className, text] of [
        ['inventory-icon', item.icon],
        ['inventory-name', item.name],
        ['inventory-quantity', `${item.quantity.toLocaleString('it-IT')} ${item.unit}`],
      ]) {
        const label = document.createElement('span');
        label.className = className;
        label.textContent = text;
        slot.append(label);
      }
    } else {
      slot.disabled = true;
      slot.setAttribute('aria-label', `Spazio ${i + 1} vuoto`);
    }
    grid.append(slot);
    if (focused && item?.id === focused) slot.focus();
  }
  dom('inventory-count').textContent = `${items.length}/${INVENTORY_SIZE} spazi occupati`;
  const selected = items.find((item) => item.id === selectedId);
  dom('inventory-details').textContent = selected
    ? `${selected.icon} ${selected.name} · ${selected.quantity.toLocaleString('it-IT')} ${selected.unit}. ${selected.description}`
    : 'Lo zaino è vuoto. Qui troverai le tue scorte di erba e le dosi.';
}
