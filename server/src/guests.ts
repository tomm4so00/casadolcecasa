// Ospiti spariti ("Gioca subito" senza mai salvare il personaggio): dopo 7 giorni senza entrare
// si cancellano come un account eliminato, così non tengono occupate le stanze dei condomini.
// Chi è ospite lo dice il segno "guest" in sims_accounts; prima di cancellare si controlla anche
// l'accesso (Firebase Authentication): se nel frattempo ha collegato Google o l'email, resta.
import { type DeletionDatabase, deleteAccount } from './deletion.js';

const DAY = 24 * 3600000;
/** Come GUEST_KEEP_DAYS in src/game/guest.ts. */
export const GUEST_KEEP_MS = 7 * DAY;
/** Al massimo tanti ospiti per giro: la manutenzione gira ogni 15 minuti. */
export const GUEST_CLEANUP_LIMIT = 25;

type Tree = Record<string, unknown>;
const record = (value: unknown): value is Tree => !!value && typeof value === 'object';
const time = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Un ospite: il suo account, il personaggio e quando è nato l'account. */
export interface GuestAccount {
  uid: string;
  playerId: string;
  since: number;
}

/** Gli account ospite letti da sims_accounts. */
export function guestAccounts(accounts: unknown): GuestAccount[] {
  if (!record(accounts)) return [];
  const out: GuestAccount[] = [];
  for (const [uid, value] of Object.entries(accounts)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !record(value)) continue;
    if (typeof value.playerId !== 'string' || typeof value.guest !== 'number') continue;
    out.push({ uid, playerId: value.playerId, since: time(value.guest) });
  }
  return out;
}

/** Sparito: né l'account né l'ultimo salvataggio sono degli ultimi 7 giorni. */
export function guestGone(guest: GuestAccount, savedAt: unknown, now: number): boolean {
  return now - Math.max(guest.since, time(savedAt)) > GUEST_KEEP_MS;
}

/**
 * A ogni giro: cancella gli ospiti spariti. `stillGuest` chiede all'accesso se l'account è
 * ancora anonimo; `deleteLogin` toglie l'accesso, come per le cancellazioni chieste dal giocatore.
 */
export async function cleanupGuests(
  database: DeletionDatabase,
  now: number,
  stillGuest: (uid: string) => Promise<boolean>,
  deleteLogin: (uid: string) => Promise<void>,
): Promise<number> {
  const guests = guestAccounts((await database.ref('sims_accounts').get()).val());
  let deleted = 0;
  for (const guest of guests) {
    if (deleted >= GUEST_CLEANUP_LIMIT) break;
    const savedAt = (await database.ref(`sims_saves/${guest.playerId}/savedAt`).get()).val();
    if (!guestGone(guest, savedAt, now)) continue;
    // un errore su un ospite non ferma gli altri: si riprova al giro dopo
    try {
      if (!(await stillGuest(guest.uid))) continue;
      await deleteAccount(database, guest.uid, deleteLogin);
      deleted++;
    } catch (error) {
      console.log('Guest cleanup retried next run:', String(error));
    }
  }
  return deleted;
}
