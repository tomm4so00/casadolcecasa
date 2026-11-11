// Il permesso di addebito: chi fa un'offerta (pezzo da collezione, quadro all'asta) scrive nella
// propria stanza "X può prendere fino a N Đ dalla mia cassaforte" (rooms_state/<n>/allow/<X>).
// Chi accetta prende i soldi e, nella stessa scrittura, toglie dal permesso quello che ha preso.
// Le regole del database lasciano abbassare la cassaforte di un altro solo così (o con la prova
// dello scasso, o al server). Regole senza browser, usate dal gioco e dai test.

/** Un permesso vale due settimane: un'offerta dimenticata non resta aperta per sempre. */
export const DEBIT_DAYS = 14;
export const DEBIT_MS = DEBIT_DAYS * 86_400_000;
/** Il massimo che si può permettere (come il massimo di una cassaforte). */
export const DEBIT_MAX = 1_000_000;

export interface Debit {
  /** dindini che si possono ancora prendere */
  amt: number;
  /** quando è stato scritto (o allungato) l'ultima volta */
  t: number;
}

const whole = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** Il permesso letto dal database, se è valido e non è scaduto. */
export function decodeDebit(value: unknown, now: number): Debit | null {
  if (!value || typeof value !== 'object') return null;
  const { amt, t } = value as Record<string, unknown>;
  if (!whole(amt) || amt < 1 || amt > DEBIT_MAX || typeof t !== 'number') return null;
  return now - t < DEBIT_MS ? { amt, t } : null;
}

/** Il permesso dopo un'offerta nuova di `amount`: si somma a quello che c'è già. */
export function grantDebit(current: unknown, amount: number, now: number): Debit | null {
  if (!whole(amount) || amount < 1) return null;
  const old = decodeDebit(current, now)?.amt ?? 0;
  return { amt: Math.min(DEBIT_MAX, old + amount), t: now };
}

/** Il permesso dopo che un'offerta di `amount` non serve più (rifiutata, superata, pagata da sé). */
export function reduceDebit(current: unknown, amount: number, now: number): Debit | null {
  const old = decodeDebit(current, now);
  if (!old || !whole(amount)) return null;
  const left = old.amt - amount;
  return left >= 1 ? { amt: left, t: old.t } : null;
}

/**
 * Chi accetta prende `amount`: false se il permesso non basta (o non c'è), altrimenti quello che
 * resta (null: finito, si cancella). Il momento non cambia: le regole lo controllano.
 */
export function useDebit(current: unknown, amount: number, now: number): Debit | null | false {
  const old = decodeDebit(current, now);
  if (!old || !whole(amount) || amount < 1 || amount > old.amt) return false;
  const left = old.amt - amount;
  return left >= 1 ? { amt: left, t: old.t } : null;
}
