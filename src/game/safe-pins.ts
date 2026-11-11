// Il PIN della mia cassaforte, nel nodo privato sims_safe_pins/<giocatore>: lo legge solo il
// proprietario (e il server). Nella stanza resta solo pinSet, "c'è una combinazione", che serve a
// chi scassina. Il PIN vecchio salvato nella stanza, leggibile da tutti, si sposta qui al primo
// ingresso; per chi non gioca lo sposta la manutenzione del server.
import { game } from './context.js';
import { worldNode } from './world-db.js';
import { hashPin, recoverPin } from '../../shared/safe-pin-rules.js';

const me = (): string => game.session.myPlayerId;
const pinRef = () => game.session.db.ref('sims_safe_pins/' + me());
const myRoomPath = (): string | null =>
  game.myAssignedRoomIdx === null || game.myAssignedRoomIdx < 0
    ? null
    : `${worldNode('rooms_state')}/${game.myAssignedRoomIdx}`;

/** Il personaggio di cui ho già letto il PIN privato. */
let loadedFor: string | null = null;
let syncing: Promise<boolean> | null = null;

function remember(hash: unknown): void {
  game.safePinCode = typeof hash === 'string' ? hash : '';
  game.hasSetSafePin = !!game.safePinCode;
}

/**
 * Il PIN vecchio della mia stanza va nel nodo privato (stesse cifre, cifrate col mio codice) e
 * sparisce dalla stanza. Se nel nodo privato ce n'è già uno, vale quello. False se non riesce:
 * il PIN vecchio resta dov'è e si riprova.
 */
async function moveOldPin(room: { id: unknown; pin?: unknown }, path: string): Promise<boolean> {
  let current: unknown = (await pinRef().get()).val();
  if (typeof current !== 'string') {
    const code = recoverPin(room.pin, room.id);
    if (!code) return false;
    current = hashPin(code, me());
    await pinRef().set(current);
  }
  await game.session.db.ref(path).update({ pin: null, pinSet: true });
  remember(current);
  return true;
}

/**
 * Tiene allineati il PIN in memoria, il nodo privato e il segno pinSet della mia stanza.
 * Si chiama a ogni aggiornamento delle stanze: lavora solo quando c'è qualcosa da fare.
 */
export function syncMyPin(): Promise<boolean> {
  return (syncing ??= (async () => {
    const path = myRoomPath();
    const room = game.roomsState[game.myAssignedRoomIdx ?? -1];
    if (!path || !room || room.ownerId !== me()) return false;
    if (room.pin) return await moveOldPin(room, path);
    if (loadedFor !== me()) {
      remember((await pinRef().get()).val());
      loadedFor = me();
    }
    // la stanza nuova (trasloco in un altro mondo) non sa ancora che ho una combinazione
    if (game.hasSetSafePin && !room.pinSet) await game.session.db.ref(path + '/pinSet').set(true);
    return true;
  })()
    .catch((error) => {
      console.warn('[pin]', error);
      return false;
    })
    .finally(() => {
      syncing = null;
    }));
}

/** Prima di traslocare: il PIN non deve più stare nella stanza, o andrebbe perso. */
export async function ensureMyPinPrivate(): Promise<boolean> {
  const room = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (!room?.pin) return true;
  await syncing;
  return syncMyPin();
}

/** La nuova combinazione (3 cifre già controllate), nel nodo privato. */
export async function saveMyPin(code: string): Promise<boolean> {
  const hash = hashPin(code, me());
  try {
    await pinRef().set(hash);
    remember(hash);
    loadedFor = me();
    const path = myRoomPath();
    if (path) await game.session.db.ref(path).update({ pin: null, pinSet: true });
    return true;
  } catch (error) {
    console.warn('[pin]', error);
    return false;
  }
}
