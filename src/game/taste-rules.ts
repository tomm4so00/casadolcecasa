// L'assaggio di benvenuto: a chi lo porta il nuovo arrivato. Un vicino online nel condominio,
// altrimenti uno che non è in casa (si lascia nella sua stanza), altrimenti, se non abita nessun
// altro, un personaggio del gioco. Senza dipendenze dal browser, così è testabile.

/** I posti del condominio: lì un vicino online si raggiunge a piedi. */
export const HOME_ENVS = ['SALOON', 'KITCHEN', 'BATHROOM', 'PLAYER_ROOM', 'CORTILE'];

/**
 * Personaggi del gioco a cui portarlo quando nel condominio non abita nessun altro: sempre al
 * loro posto, senza orari né biglietto d'ingresso.
 */
export const TASTE_BOTS: { name: string; env: string; where: string }[] = [
  { name: 'Signora Rosa 🏷️', env: 'usato', where: "al negozio dell'usato" },
  { name: 'Antiquario Ettore 🏺', env: 'collezionismo', where: 'al negozio del collezionismo' },
  { name: 'Lucia 🐾', env: 'negozio_animali', where: 'al negozio di animali' },
  { name: 'Commesso Marco 🛋️', env: 'negozio_mobili', where: 'al negozio di mobili' },
  { name: 'Commessa Giulia 👗', env: 'negozio_vestiti', where: 'al negozio di vestiti' },
];

/** Un piatto lasciato in una stanza non si mostra più dopo una settimana. */
export const GIFT_TTL_MS = 7 * 24 * 3600000;

export type TasteTarget =
  | { mode: 'online'; id: string; name: string; env: string; roomIdx: number | null }
  | { mode: 'room'; idx: number; name: string; ownerId: string }
  | { mode: 'bot'; name: string; env: string; where: string };

export interface TasteInput {
  me: string;
  myApt: number;
  perApt: number;
  /** Giocatori online nel mondo (già senza chi è uscito). */
  online: { id: string; name: string; env: string; apt?: number | null; roomIdx?: number | null }[];
  /** Le stanze abitate (indice, proprietario). */
  rooms: { idx: number; ownerId: string; owner: string }[];
  previous: TasteTarget | null;
  /** Per scegliere sempre lo stesso personaggio del gioco per lo stesso giocatore. */
  seed: string;
}

const aptOf = (idx: number, perApt: number) => Math.floor(idx / perApt);

/** Il vicino a cui portare l'assaggio adesso. Se il precedente va ancora bene, resta lui. */
export function chooseTasteTarget(input: TasteInput): TasteTarget {
  const { me, myApt, perApt, previous } = input;
  const reachable = input.online.filter((p) => p.id !== me && HOME_ENVS.includes(p.env));
  const sameApt = (p: TasteInput['online'][number]) =>
    p.env === 'PLAYER_ROOM'
      ? typeof p.roomIdx === 'number' && aptOf(p.roomIdx, perApt) === myApt
      : (p.apt ?? -1) === myApt;
  if (reachable.length) {
    const still =
      previous?.mode === 'online' ? reachable.find((p) => p.id === previous.id) : undefined;
    const p = still || reachable.find(sameApt) || reachable[0];
    return {
      mode: 'online',
      id: p.id,
      name: p.name,
      env: p.env,
      roomIdx: typeof p.roomIdx === 'number' ? p.roomIdx : null,
    };
  }
  const others = input.rooms.filter((r) => r.ownerId && r.ownerId !== me);
  if (others.length) {
    const still =
      previous?.mode === 'room' ? others.find((r) => r.idx === previous.idx) : undefined;
    const r = still || others.find((x) => aptOf(x.idx, perApt) === myApt) || others[0];
    return { mode: 'room', idx: r.idx, name: r.owner || 'il vicino', ownerId: r.ownerId };
  }
  let h = 0;
  for (const ch of input.seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bot = TASTE_BOTS[h % TASTE_BOTS.length];
  return { mode: 'bot', ...bot };
}

/** Dove si trova un vicino online, detto in parole semplici. */
export function placeText(
  env: string,
  roomIdx: number | null,
  name: string,
  owner: string | null,
): string {
  switch (env) {
    case 'KITCHEN':
      return 'in cucina';
    case 'BATHROOM':
      return 'in bagno';
    case 'SALOON':
      return 'nel salone';
    case 'CORTILE':
      return 'nel cortile';
    case 'PLAYER_ROOM':
      return owner && owner !== name ? `nella stanza di ${owner}` : 'nella sua stanza';
    default:
      return roomIdx === null ? 'nel condominio' : 'in una stanza';
  }
}
