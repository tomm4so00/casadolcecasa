// Moderazione (passo 3), senza browser: silenzi, sospensioni, silenzio automatico e i testi degli
// avvisi su Telegram. Usate dal gioco (pannello del moderatore), dal server (server/src/
// moderation.ts) e dai test. Le segnalazioni stanno in sims_reports/<chi segnala>/<segnalato>.
import { REPORT_REASONS } from './block-rules.js';

const DAY = 86_400_000;
/** Il silenzio automatico: 3 persone diverse in 24 ore → 24 ore senza chat né fumetto. */
export const AUTO_MUTE_REPORTERS = 3;
export const AUTO_MUTE_WINDOW_MS = DAY;
export const AUTO_MUTE_MS = DAY;
/** "Per sempre": la data più lontana che JavaScript sa scrivere. */
export const FOREVER = 8_640_000_000_000_000;
/** Silenzi e sospensioni finiti restano 6 mesi (condizioni.html), poi la manutenzione li toglie. */
export const MOD_KEEP_MS = 183 * DAY;

/** Le durate del pannello. */
export const MUTE_CHOICES = [
  { id: 'm1', label: '🔇 1 giorno', ms: DAY },
  { id: 'm7', label: '🔇 7 giorni', ms: 7 * DAY },
  { id: 'mf', label: '🔇 Per sempre', ms: FOREVER },
] as const;
export const BAN_CHOICES = [
  { id: 'b7', label: '⛔ Sospendi 7 giorni', ms: 7 * DAY },
  { id: 'bf', label: '⛔ Chiudi l’account', ms: FOREVER },
] as const;

/** Un silenzio (sims_mutes/<giocatore>): fino a quando, deciso quando, perché. */
export interface Mute {
  until: number;
  t: number;
  why: string;
}
/** Una sospensione (sims_bans/<giocatore>): `del` = cancellare l'account (minorenne). */
export interface Ban {
  until: number;
  t: number;
  why: string;
  del?: boolean;
  /** il server ha già disattivato l'accesso */
  applied?: boolean;
}

const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function decodeMute(v: unknown): Mute | null {
  if (!rec(v)) return null;
  return { until: num(v.until), t: num(v.t), why: str(v.why) };
}
export function decodeBan(v: unknown): Ban | null {
  if (!rec(v)) return null;
  return {
    until: num(v.until),
    t: num(v.t),
    why: str(v.why),
    ...(v.del === true ? { del: true } : {}),
    ...(v.applied === true ? { applied: true } : {}),
  };
}

export const isActive = (m: { until: number } | null, now: number): boolean => !!m && m.until > now;

/** "fino alle 21:30 del 12/11", oppure "per sempre". */
export function untilText(until: number): string {
  if (until >= FOREVER / 2) return 'per sempre';
  const d = new Date(until);
  const opts = { timeZone: 'Europe/Rome' } as const;
  const hour = d.toLocaleTimeString('it-IT', { ...opts, hour: '2-digit', minute: '2-digit' });
  const day = d.toLocaleDateString('it-IT', { ...opts, day: '2-digit', month: '2-digit' });
  return `fino alle ${hour} del ${day}`;
}

export const reasonLabel = (id: string): string =>
  REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

export interface ReportEntry {
  by: string;
  who: string;
  name: string;
  reason: string;
  note: string;
  world: string;
  t: number;
  msgs: { text: string; t: number }[];
  /** già mandata sul gruppo Telegram */
  tg: boolean;
}

/** Tutte le segnalazioni valide, dalla più vecchia. */
export function listReports(tree: unknown): ReportEntry[] {
  const out: ReportEntry[] = [];
  if (!rec(tree)) return out;
  for (const [by, list] of Object.entries(tree))
    for (const [who, r] of Object.entries(rec(list) ? list : {})) {
      if (!rec(r) || typeof r.t !== 'number') continue;
      out.push({
        by,
        who,
        name: str(r.name) || 'Giocatore',
        reason: str(r.reason),
        note: str(r.note),
        world: str(r.world),
        t: r.t,
        msgs: Object.values(rec(r.msgs) ? r.msgs : {})
          .filter((m): m is { text: string; t: number } => rec(m) && typeof m.text === 'string')
          .map((m) => ({ text: m.text, t: num(m.t) }))
          .sort((a, b) => a.t - b.t),
        tg: r.tg === true,
      });
    }
  return out.sort((a, b) => a.t - b.t);
}

/** Quante persone diverse hanno segnalato `who` nelle ultime 24 ore (dopo `since`). */
export function reportersOf(reports: ReportEntry[], who: string, now: number, since = 0): number {
  const from = Math.max(now - AUTO_MUTE_WINDOW_MS, since);
  return new Set(reports.filter((r) => r.who === who && r.t > from).map((r) => r.by)).size;
}

/**
 * Chi va silenziato da solo adesso: 3 persone diverse in 24 ore, senza un silenzio attivo. Contano
 * solo le segnalazioni arrivate dopo l'ultima decisione su di lui (se il moderatore ha tolto il
 * silenzio, quelle di prima non lo fanno ripartire).
 */
export function autoMutes(reports: ReportEntry[], mutes: unknown, now: number): string[] {
  const all = rec(mutes) ? mutes : {};
  const who = [...new Set(reports.map((r) => r.who))];
  return who.filter((pid) => {
    const m = decodeMute(all[pid]);
    if (isActive(m, now)) return false;
    return reportersOf(reports, pid, now, m?.t ?? 0) >= AUTO_MUTE_REPORTERS;
  });
}

const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** L'avviso sul gruppo: nome, motivi, quante persone. Mai chi ha segnalato né i messaggi. */
export function reportTelegramText(name: string, reasons: string[], people: number): string {
  const why = [...new Set(reasons)].map(reasonLabel).join(', ');
  return (
    `🚩 <b>${esc(name)}</b> segnalato: ${esc(why)}\n` +
    `👥 ${people} ${people === 1 ? 'persona' : 'persone'} nelle ultime 24 ore`
  );
}

export function autoMuteTelegramText(name: string): string {
  return `🔇 <b>${esc(name)}</b> silenziato per 24 ore: ${AUTO_MUTE_REPORTERS} persone diverse l'hanno segnalato in un giorno.`;
}
