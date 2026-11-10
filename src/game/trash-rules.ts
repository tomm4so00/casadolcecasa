// Il cestino della stanza e le prove che ci finiscono dentro (senza dipendenze dal browser, così
// sono testabili). Chi vende erba o pillole ci lascia una bustina vuota, chi riesce in un furto la
// graffetta con cui ha scassinato. Chi le trova può denunciarlo al commissariato: una multa per
// prova, metà a chi denuncia e metà alla cassa della polizia.

export type TrashKind = 'bag' | 'clip';

export const TRASH: Record<
  TrashKind,
  { one: string; many: string; icon: string; fine: number; why: string }
> = {
  bag: {
    one: 'bustina per lo spaccio vuota',
    many: 'bustine per lo spaccio vuote',
    icon: '🛍️',
    fine: 50,
    why: 'spaccio',
  },
  clip: {
    one: 'graffetta per scassinare',
    many: 'graffette per scassinare',
    icon: '📎',
    fine: 100,
    why: 'furto',
  },
};

export const isTrashKind = (k: unknown): k is TrashKind => k === 'bag' || k === 'clip';

export interface TrashItem {
  k: TrashKind;
  /** Quando ci è finita (ora del server). */
  t: number;
}

/** Una prova presa dal cestino di un altro, da portare al commissariato. */
export interface Proof {
  k: TrashKind;
  /** Il colpevole (playerId), il suo nome e il condominio in cui abita. */
  who: string;
  name: string;
  w: string;
  /** Quando è stata trovata. */
  t: number;
}

/** Quante prove si tengono in tasca al massimo. */
export const MAX_PROOFS = 30;
/** Quante cose può contenere un cestino (le più vecchie escono). */
export const MAX_TRASH = 40;

// ---------------------------------------------------------------- lo spazzino

/** Lo spazzino passa ogni lunedì alle 6 del mattino e svuota i cestini di tutti. */
export const SWEEP_DAY = 1;
export const SWEEP_HOUR = 6;

/** L'ultimo passaggio dello spazzino prima di `now` (ora locale). */
export function lastSweep(now: number): number {
  const d = new Date(now);
  d.setHours(SWEEP_HOUR, 0, 0, 0);
  const back = (d.getDay() - SWEEP_DAY + 7) % 7;
  d.setDate(d.getDate() - back);
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}

/** Il prossimo passaggio dello spazzino. */
export function nextSweep(now: number): number {
  const d = new Date(lastSweep(now));
  d.setDate(d.getDate() + 7);
  return d.getTime();
}

/** Legge il cestino dal database: solo le cose valide e non ancora portate via dallo spazzino. */
export function liveTrash(value: unknown, now: number): Record<string, TrashItem> {
  const out: Record<string, TrashItem> = {};
  if (!value || typeof value !== 'object') return out;
  const since = lastSweep(now);
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const it = raw as Partial<TrashItem> | null;
    if (!it || !isTrashKind(it.k) || typeof it.t !== 'number' || it.t < since) continue;
    out[id] = { k: it.k, t: it.t };
  }
  return out;
}

/** Le cose da togliere dal cestino perché lo spazzino è già passato (o non valide). */
export function sweptKeys(value: unknown, now: number): string[] {
  if (!value || typeof value !== 'object') return [];
  const live = liveTrash(value, now);
  return Object.keys(value as Record<string, unknown>).filter((k) => !(k in live));
}

/** Quante bustine e quante graffette. */
export function countKinds(items: { k: TrashKind }[]): Record<TrashKind, number> {
  const n: Record<TrashKind, number> = { bag: 0, clip: 0 };
  for (const it of items) n[it.k]++;
  return n;
}

/** "2 bustine per lo spaccio vuote e 1 graffetta per scassinare". */
export function describeKinds(n: Record<TrashKind, number>): string {
  const parts = (Object.keys(TRASH) as TrashKind[])
    .filter((k) => n[k] > 0)
    .map((k) => `${n[k]} ${n[k] === 1 ? TRASH[k].one : TRASH[k].many}`);
  return parts.join(' e ');
}

// ---------------------------------------------------------------- multe

/** La multa per `n` prove di un tipo. */
export const fineFor = (k: TrashKind, n: number): number => TRASH[k].fine * n;

/** La quota di chi denuncia (in percentuale): la metà, di più per il Giustiziere. */
export const REPORTER_PCT = 50;
export const REPORTER_PCT_MAX = 80;

/** A chi denuncia la sua quota (arrotondata in giù), il resto alla cassa della polizia. */
export function splitFine(
  amount: number,
  pct = REPORTER_PCT,
): { reporter: number; police: number } {
  const reporter = Math.floor((amount * pct) / 100);
  return { reporter, police: amount - reporter };
}

/** Le prove raggruppate per colpevole e per tipo: una multa per ogni gruppo. */
export function groupProofs(
  proofs: Proof[],
  world: string,
): { who: string; name: string; k: TrashKind; n: number; amount: number }[] {
  const groups = new Map<
    string,
    { who: string; name: string; k: TrashKind; n: number; amount: number }
  >();
  for (const p of proofs) {
    if (p.w !== world) continue;
    const key = p.who + '|' + p.k;
    const g = groups.get(key) ?? { who: p.who, name: p.name, k: p.k, n: 0, amount: 0 };
    g.n++;
    g.amount = fineFor(p.k, g.n);
    g.name = p.name;
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Legge le prove dal salvataggio scartando quelle rovinate. */
export function decodeProofs(value: unknown): Proof[] {
  if (!Array.isArray(value)) return [];
  const out: Proof[] = [];
  for (const raw of value) {
    const p = raw as Partial<Proof> | null;
    if (
      !p ||
      !isTrashKind(p.k) ||
      typeof p.who !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.w !== 'string' ||
      typeof p.t !== 'number'
    )
      continue;
    out.push({ k: p.k, who: p.who, name: p.name.slice(0, 20), w: p.w, t: p.t });
  }
  return out.slice(-MAX_PROOFS);
}

// ---------------------------------------------------------------- multe da pagare

/** Una multa scritta da chi denuncia: `paid` l'ha già preso dalla cassaforte, il resto è debito. */
export interface Fine {
  k: TrashKind;
  n: number;
  amt: number;
  paid: number;
  /** Chi ha denunciato (riceve la sua quota di quello che si paga dopo). */
  to: string;
  t: number;
  /** La quota di chi ha denunciato, in percentuale (manca nelle multe di prima: la metà). */
  pct?: number;
}

export function decodeFine(value: unknown): Fine | null {
  const f = value as Partial<Fine> | null;
  if (!f || !isTrashKind(f.k)) return null;
  const n = Number(f.n),
    amt = Number(f.amt),
    paid = Number(f.paid);
  if (!Number.isSafeInteger(n) || n < 1 || amt !== fineFor(f.k, n)) return null;
  if (!Number.isSafeInteger(paid) || paid < 0 || paid > amt) return null;
  if (typeof f.to !== 'string' || typeof f.t !== 'number') return null;
  const pct = Number(f.pct);
  const ok = Number.isSafeInteger(pct) && pct >= REPORTER_PCT && pct <= REPORTER_PCT_MAX;
  return { k: f.k, n, amt, paid, to: f.to, t: f.t, ...(ok ? { pct } : {}) };
}

/** Quanto si riesce a pagare del debito con i soldi che si hanno (cassaforte più banca). */
export function payable(
  debt: number,
  vault: number,
  bank: number,
): { fromBank: number; pay: number } {
  const pay = Math.max(0, Math.min(debt, vault + bank));
  return { pay, fromBank: Math.max(0, pay - vault) };
}

// ---------------------------------------------------------------- salvataggio

/** Quello che il giocatore si porta dietro nel salvataggio. */
export interface TrashSave {
  /** Ha già scelto dove mettere il cestino. */
  placed?: boolean;
  /** Il giorno (todayKey) in cui l'ha svuotato l'ultima volta. */
  emptied?: string;
  /** Le prove trovate nei cestini degli altri. */
  proofs?: Proof[];
}

export function decodeTrashSave(value: unknown): TrashSave {
  const v = value as Partial<TrashSave> | null;
  if (!v || typeof v !== 'object') return {};
  const out: TrashSave = {};
  if (v.placed === true) out.placed = true;
  if (typeof v.emptied === 'string' && v.emptied.length <= 20) out.emptied = v.emptied;
  const proofs = decodeProofs(v.proofs);
  if (proofs.length) out.proofs = proofs;
  return out;
}
