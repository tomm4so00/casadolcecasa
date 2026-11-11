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

/** Libera: nessun giocatore la abita. */
export const isFreeRoom = (r: { owner?: unknown; ownerId?: unknown } | undefined): boolean =>
  !!r && !r.owner && !r.ownerId;

/**
 * Come si chiama una stanza per chi gioca: appartamento e numero sulla porta del salone, che conta
 * tutte le stanze del condominio (nell'appartamento 2 le porte vanno da 9 a 16).
 */
export function roomLabel(idx: number, perApt = 8): string {
  return `Appartamento ${Math.floor(idx / perApt) + 1} · Stanza ${idx + 1}`;
}

/**
 * Sposta tutto ciò che sta nella stanza del giocatore (cassaforte, acquisti, arredi, quadri…)
 * nella stanza libera `target`; quella vecchia torna libera e vuota.
 * Restituisce il nuovo elenco, o null se non si può (stanza occupata, nessuna stanza, stessa stanza).
 * Il promemoria `pendingDeath` resta dov'era: riguarda chi abitava prima quella stanza.
 * La combinazione non viaggia: sta nel nodo privato del giocatore (sims_safe_pins), cifrata col
 * suo codice. Un PIN vecchio rimasto nella stanza si sposta lì prima del trasloco (safe-pins.ts).
 */
export function moveRoom(
  rooms: MovableRoom[],
  playerId: string,
  target: number,
  now: number,
): MovableRoom[] | null {
  const from = rooms.findIndex((r) => r?.ownerId === playerId);
  const dest = rooms[target];
  if (from < 0 || from === target || !dest || !isFreeRoom(dest)) return null;
  const { pendingDeath: oldReceipt, pin: _oldPin, ...mine } = rooms[from];
  const out = rooms.slice();
  out[target] = {
    ...mine,
    id: dest.id,
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
