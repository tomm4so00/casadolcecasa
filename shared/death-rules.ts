// Cosa resta di un personaggio morto: la stanza torna libera e al cimitero c'è la sua lapide.
// Le usano il gioco (needs.ts, chi muore) e la manutenzione sul server (chi è morto ma ha lasciato
// la stanza occupata o è rimasto senza lapide, per esempio perché la rete è caduta in quel momento).

type Room = Record<string, unknown>;
const record = (value: unknown): value is Room => !!value && typeof value === 'object';

/** La stanza libera: cassaforte azzerata; il promemoria `pendingDeath` del server resta. */
export function freedRoom(room: Room): Room {
  return {
    id: room.id,
    vaultMoney: 0,
    ...(room.pendingDeath ? { pendingDeath: room.pendingDeath } : {}),
  };
}

/**
 * Libera le stanze di `playerId` (di solito una sola). Funziona sia con l'elenco del gioco sia
 * con l'oggetto letto dal database; ritorna le stanze cambiate, o null se non c'era niente da fare.
 */
export function releaseRoomsOf<T extends unknown[] | Record<string, unknown>>(
  rooms: T,
  playerId: string,
): T | null {
  const next = (Array.isArray(rooms) ? [...rooms] : { ...rooms }) as Record<string, unknown>;
  let changed = false;
  for (const [key, room] of Object.entries(next))
    if (record(room) && room.ownerId === playerId) {
      next[key] = freedRoom(room);
      changed = true;
    }
  return changed ? (next as T) : null;
}

/** La lapide si scrive con questi campi (le regole del database vogliono nome, data e giorni). */
export interface Grave {
  name: string;
  deadAt: number;
  days: number;
  lived?: number;
  epitaph?: string;
}

/** Lapide ricostruita dal salvataggio di un personaggio morto (sul server non c'è il gioco). */
export function graveFromSave(
  save: Record<string, unknown>,
  fallbackName: string,
  now: number,
): Grave {
  const deadAt = typeof save.deadAt === 'number' && save.deadAt > 0 ? save.deadAt : now;
  const name = (typeof save.nick === 'string' && save.nick.trim()) || fallbackName || 'Sconosciuto';
  const grave: Grave = {
    name: name.slice(0, 20),
    deadAt,
    days: Math.floor((Number(save.gameMinutes) || 0) / 1440) + 1,
  };
  if (typeof save.bornAt === 'number' && save.bornAt > 0)
    grave.lived = Math.max(0, deadAt - save.bornAt);
  if (typeof save.epitaph === 'string' && save.epitaph) grave.epitaph = save.epitaph.slice(0, 60);
  return grave;
}
