import { game } from './context.js';
import { lifetime } from './runtime.js';
import { canPlaySession } from './accounts.js';
import { toast } from './missions.js';
import { RoomEconomy, decodeEconomy } from './room-economy.js';
import type { EconomyState, RoomState } from './models.js';
import { bankBalanceOf, depositChange, withdrawChange } from './bank-rules.js';
import { recordActivity } from './activity.js';

let wallet: RoomEconomy | null = null;
export function resetEconomy() {
  wallet = null;
}
/** Aspetta le operazioni in corso sui soldi, poi dimentica la stanza (prima di cambiarla). */
export async function settleEconomy(): Promise<void> {
  try {
    await wallet?.settled();
  } catch {}
  wallet = null;
}
export function syncRoomEconomy(room: RoomState) {
  // Firebase emits local speculative transaction events before the server accepts them.
  if (!wallet?.isPending()) applyConfirmedEconomy(room);
}
function applyConfirmedEconomy(room: RoomState) {
  game.vaultCache =
    Number.isSafeInteger(room.vaultMoney) && room.vaultMoney >= 0 ? room.vaultMoney : 0;
  const economy = decodeEconomy(room.economy);
  if (economy) {
    game.player.ownedItems = structuredClone(economy.ownedItems);
    game.player.ownedFurniture = structuredClone(economy.ownedFurniture);
    game.player.invest = structuredClone(economy.invest);
    game.bankBalance = bankBalanceOf(economy.bank);
  }
}
function getWallet(): RoomEconomy | null {
  if (game.myAssignedRoomIdx === null || game.myAssignedRoomIdx < 0) return null;
  const scope = lifetime;
  return (wallet ??= new RoomEconomy(
    game.session.db,
    game.myAssignedRoomIdx,
    game.session.myPlayerId,
    () => ({
      version: 1,
      ownedItems: game.player.ownedItems,
      ownedFurniture: game.player.ownedFurniture,
      invest: game.player.invest,
      bank: game.bankBalance || 0,
    }),
    applyConfirmedEconomy,
    () => scope.active && canPlaySession() && !game.player.isDead,
  ));
}
export async function updateEconomy(
  change: (economy: EconomyState, balance: number) => number | null,
): Promise<boolean> {
  const wallet = getWallet();
  if (!wallet) {
    toast('Serve una stanza con cassaforte per questa operazione.', 3500);
    return false;
  }
  try {
    const committed = await wallet.update(change);
    if (!committed) toast('Operazione non confermata: controlla saldo e sessione.', 3500);
    return committed;
  } catch (error) {
    console.warn('[economy]', error);
    toast('Operazione non confermata dal database. Riprova quando sei connesso.', 4500);
    return false;
  }
}
export function spendMoney(amount: number): Promise<boolean> {
  if (!Number.isSafeInteger(amount) || amount < 0) return Promise.resolve(false);
  return updateEconomy((_economy, balance) => (balance >= amount ? -amount : null));
}
export function creditMoney(amount: number): Promise<boolean> {
  if (!Number.isSafeInteger(amount) || amount < 0) return Promise.resolve(false);
  return updateEconomy(() => amount);
}
export function purchaseItem(
  kind: 'ownedItems' | 'ownedFurniture',
  id: string,
  price: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(price) || price < 0 || !id) return Promise.resolve(false);
  return updateEconomy((economy, balance) => {
    if (economy[kind][id] || balance < price) return null;
    economy[kind][id] = true;
    return -price;
  }).then((ok) => {
    if (ok) recordActivity('shop'); // vestiti e mobili: muovono il Mini-shop in borsa
    return ok;
  });
}
/**
 * Rivende un oggetto comprato: smette di essere tuo e ricevi `refund` euro, nella stessa
 * transazione. Le regole del database vogliono vero/falso per ogni oggetto: si segna false.
 */
export function sellItem(
  kind: 'ownedItems' | 'ownedFurniture',
  id: string,
  refund: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(refund) || refund < 0 || !id) return Promise.resolve(false);
  return updateEconomy((economy) => {
    if (!economy[kind][id]) return null;
    economy[kind][id] = false;
    return refund;
  });
}
export async function flushEconomy(): Promise<void> {
  await wallet?.settled();
}
export async function transferMoney(targetPlayerId: string, amount: number): Promise<boolean> {
  try {
    return (await getWallet()?.transfer(targetPlayerId, amount)) ?? false;
  } catch (error) {
    console.warn('[transfer]', error);
    toast('Trasferimento non confermato.', 4000);
    return false;
  }
}

/** Incassa da un altro giocatore (un'offerta accettata): false se non ha più abbastanza soldi. */
export async function collectMoneyFrom(fromPlayerId: string, amount: number): Promise<boolean> {
  try {
    return (await getWallet()?.collect(fromPlayerId, amount)) ?? false;
  } catch (error) {
    console.warn('[collect]', error);
    return false;
  }
}

// Sposta soldi dalla cassaforte al conto in banca, nella stessa transazione della stanza.
export function bankDeposit(amount: number): Promise<boolean> {
  return updateEconomy(depositChange(amount));
}
// Riporta soldi dal conto in banca alla cassaforte.
export function bankWithdraw(amount: number): Promise<boolean> {
  return updateEconomy(withdrawChange(amount));
}
