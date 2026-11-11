// Bacheca immobiliare del cortile: trasferirsi in una stanza libera (regole, senza grafica).

/** Una stanza come sta nel database (si spostano tutti i suoi campi, anche quelli non elencati). */
interface MovableRoom {
  id: number;
  owner?: string | null;
  ownerId?: string | null;
  pin?: string | null;
  vaultMoney?: number;
  lastSeen?: number;
  pendingDeath?: unknown;
  [key: string]: unknown;
}

type PinHash = (pin: string, roomId: number) => string;

/** Libera: nessun giocatore la abita. */
export const isFreeRoom = (r: MovableRoom | undefined): boolean => !!r && !r.owner && !r.ownerId;

/**
 * Come si chiama una stanza per chi gioca: appartamento e numero sulla porta del salone, che conta
 * tutte le stanze del condominio (nell'appartamento 2 le porte vanno da 9 a 16).
 */
export function roomLabel(idx: number, perApt = 8): string {
  return `Appartamento ${Math.floor(idx / perApt) + 1} · Stanza ${idx + 1}`;
}

/**
 * La combinazione è cifrata insieme al numero della stanza: cambiando stanza va cifrata di nuovo.
 * Le combinazioni possibili sono poche (3 cifre da 1 a 5, comprese quelle vecchie col 5), quindi
 * si ritrova quella giusta provandole tutte. null = nessuna combinazione (o non riconosciuta).
 */
export function rehashPin(
  pin: unknown,
  fromId: number,
  toId: number,
  hash: PinHash,
): string | null {
  if (typeof pin !== 'string' || !pin) return null;
  if (!pin.startsWith('h')) return hash(pin, toId); // vecchio PIN salvato in chiaro
  for (let a = 1; a <= 5; a++)
    for (let b = 1; b <= 5; b++)
      for (let c = 1; c <= 5; c++) {
        const code = `${a}${b}${c}`;
        if (hash(code, fromId) === pin) return hash(code, toId);
      }
  return null;
}

/**
 * Sposta tutto ciò che sta nella stanza del giocatore (cassaforte, acquisti, arredi, quadri,
 * combinazione…) nella stanza libera `target`; quella vecchia torna libera e vuota.
 * Restituisce il nuovo elenco, o null se non si può (stanza occupata, nessuna stanza, stessa stanza).
 * Il promemoria `pendingDeath` resta dov'era: riguarda chi abitava prima quella stanza.
 */
export function moveRoom(
  rooms: MovableRoom[],
  playerId: string,
  target: number,
  hash: PinHash,
  now: number,
): MovableRoom[] | null {
  const from = rooms.findIndex((r) => r?.ownerId === playerId);
  const dest = rooms[target];
  if (from < 0 || from === target || !dest || !isFreeRoom(dest)) return null;
  const { pendingDeath: oldReceipt, ...mine } = rooms[from];
  const out = rooms.slice();
  out[target] = {
    ...mine,
    id: dest.id,
    pin: rehashPin(mine.pin, rooms[from].id, dest.id, hash),
    lastSeen: now,
    ...(dest.pendingDeath ? { pendingDeath: dest.pendingDeath } : {}),
  };
  out[from] = {
    id: rooms[from].id,
    vaultMoney: 0,
    ...(oldReceipt ? { pendingDeath: oldReceipt } : {}),
  };
  return out;
}
