// Criogenesi: un pass a pagamento (30 giorni, oppure a vita) che mette il personaggio in capsula mentre il
// giocatore è via. Durante la capsula il tempo non passa per lui: i bisogni non calano, gli
// animali non hanno fame e il conto alla rovescia della morte per abbandono si ferma. Con i
// pass nuovi (cryoRescues) in capsula si entra solo quando si starebbe per morire: vedi sotto. Quando il
// giocatore è in partita si gioca normalmente: la capsula vale solo per le assenze.
//
// Queste regole le usano il gioco, la manutenzione sul server e la funzione che riceve i
// pagamenti da Stripe: devono dare tutti lo stesso risultato.

export const CRYO_DAYS = 30;
export const CRYO_MS = CRYO_DAYS * 24 * 3600000;
export const CRYO_PRICE = '1,99€';
export const CRYO_LIFETIME_PRICE = '9,99€';

/**
 * Il pass a vita è un pass come gli altri che scade il 31 dicembre 9999: così il tempo in capsula
 * si calcola con le stesse regole ovunque, e le regole del database non cambiano.
 */
export const CRYO_FOREVER_UNTIL = Date.UTC(9999, 11, 31);

/** Cosa si è comprato: 30 giorni in più o il pass a vita. */
export type CryoPlan = 'month' | 'lifetime';

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

/** Il pass non scade più. */
export const cryoForever = (pass: CryoPass | null): boolean =>
  !!pass && pass.until >= CRYO_FOREVER_UNTIL;

/**
 * Un acquisto. 30 giorni: con il pass ancora attivo i giorni si sommano; se è scaduto (o non
 * c'era) si riparte da adesso. A vita: la scadenza diventa CRYO_FOREVER_UNTIL.
 */
export function extendCryo(pass: CryoPass | null, now: number, plan: CryoPlan = 'month'): CryoPass {
  const since = pass && pass.until > now ? pass.since : now;
  if (plan === 'lifetime') return { since, until: CRYO_FOREVER_UNTIL };
  const until = pass && pass.until > now ? pass.until + CRYO_MS : now + CRYO_MS;
  return { since, until: Math.min(CRYO_FOREVER_UNTIL, until) };
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

// ---------------------------------------------------------------- il salvataggio in capsula

/**
 * Dai pass comprati da questo giorno la capsula non mette in pausa subito: mentre il giocatore è
 * via il personaggio vive come tutti, e solo quando sta per morire la capsula lo salva e da lì
 * tutto si ferma. I pass comprati prima restano come erano stati venduti: pausa da subito.
 * Un pass allungato tiene il suo `since`, quindi anche la sua regola.
 */
export const CRYO_RESCUE_SINCE = Date.UTC(2026, 10, 15);

/** Sta per morire: la salute è scesa fin qui. */
export const CRYO_RESCUE_HEALTH = 10;

/**
 * Sta per morire di abbandono: è via da così tanto (il giorno prima dei 10 giorni, dopo cui il
 * personaggio muore).
 */
export const CRYO_ABANDON_RESCUE_MS = 9 * 24 * 3600000;

/** Il pass segue la regola nuova (la capsula salva chi sta per morire). */
export const cryoRescues = (pass: CryoPass | null): boolean =>
  !!pass && pass.since >= CRYO_RESCUE_SINCE;

/**
 * Il pass come vale per un'assenza, se il personaggio entra in capsula a `rescueAt` (ms; Infinity
 * se in quell'assenza non starebbe mai per morire). Con la regola vecchia il pass resta com'è.
 */
export function rescuedPass(pass: CryoPass | null, rescueAt: number): CryoPass | null {
  if (!pass || !cryoRescues(pass)) return pass;
  const since = Math.max(pass.since, rescueAt);
  return Number.isFinite(since) && since < pass.until ? { since, until: pass.until } : null;
}

/** Il pass di un'assenza da `from` guardando solo l'abbandono (chi non ha i bisogni sotto mano). */
export const abandonRescuedPass = (pass: CryoPass | null, from: number): CryoPass | null =>
  rescuedPass(pass, from + CRYO_ABANDON_RESCUE_MS);
