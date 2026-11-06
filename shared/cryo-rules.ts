// Criogenesi: un pass a pagamento (30 giorni) che mette il personaggio in capsula mentre il
// giocatore è via. Durante la capsula il tempo non passa per lui: i bisogni non calano, gli
// animali non hanno fame e il conto alla rovescia della morte per abbandono si ferma. Quando il
// giocatore è in partita si gioca normalmente: la capsula vale solo per le assenze.
//
// Queste regole le usano il gioco, la manutenzione sul server e la funzione che riceve i
// pagamenti da Stripe: devono dare tutti lo stesso risultato.

export const CRYO_DAYS = 30;
export const CRYO_MS = CRYO_DAYS * 24 * 3600000;
export const CRYO_PRICE = '2,99€';

/** Il pass: la capsula è disponibile da `since` a `until` (ms). */
export interface CryoPass {
  since: number;
  until: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function decodeCryo(value: unknown): CryoPass | null {
  if (!value || typeof value !== 'object') return null;
  const { since, until } = value as Record<string, unknown>;
  return finite(since) && finite(until) && until > since ? { since, until } : null;
}

export function cryoActive(pass: CryoPass | null, now: number): boolean {
  return !!pass && pass.since <= now && now < pass.until;
}

/**
 * Un acquisto: 30 giorni in più. Con il pass ancora attivo i giorni si sommano; se è scaduto
 * (o non c'era) si riparte da adesso.
 */
export function extendCryo(pass: CryoPass | null, now: number): CryoPass {
  return pass && pass.until > now
    ? { since: pass.since, until: pass.until + CRYO_MS }
    : { since: now, until: now + CRYO_MS };
}

/** Quanto di un'assenza da `from` a `to` è passato in capsula (ms). */
export function frozenMs(pass: CryoPass | null, from: number, to: number): number {
  if (!pass || to <= from) return 0;
  return Math.max(0, Math.min(to, pass.until) - Math.max(from, pass.since));
}

/** Quanto di un'assenza è passato davvero per il personaggio, cioè fuori dalla capsula (ms). */
export function awakeMs(pass: CryoPass | null, from: number, to: number): number {
  return Math.max(0, to - from - frozenMs(pass, from, to));
}

/**
 * I tratti di un'assenza fuori dalla capsula, in ordine: [inizio, fine] in ms. Il gioco li
 * simula uno alla volta, così febbre e droghe seguono comunque l'ora vera.
 */
export function awakeSpans(pass: CryoPass | null, from: number, to: number): [number, number][] {
  if (to <= from) return [];
  if (!frozenMs(pass, from, to)) return [[from, to]];
  const spans: [number, number][] = [];
  const start = Math.max(from, pass!.since);
  const end = Math.min(to, pass!.until);
  if (start > from) spans.push([from, start]);
  if (to > end) spans.push([end, to]);
  return spans;
}

/**
 * Il momento (ms) in cui, partendo da `from`, saranno passati `awake` ms fuori dalla capsula.
 * Serve per sapere quando scadono le 80 ore di assenza, o quando un animale morirà di fame.
 * `absentFrom`: da quando il giocatore è via (la capsula conta solo da lì in poi).
 */
export function realTimeAfterAwake(
  pass: CryoPass | null,
  from: number,
  awake: number,
  absentFrom = from,
): number {
  const plain = from + awake;
  if (!pass) return plain;
  const start = Math.max(pass.since, absentFrom, from);
  if (pass.until <= start || plain <= start) return plain;
  return plain + (pass.until - start);
}
