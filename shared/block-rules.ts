// Blocco e segnalazione (passo 2 della moderazione), senza browser: usate dal gioco, dal server
// e dai test. Le regole del database (sims_blocks, sims_reports, sims_interactions) devono dire
// le stesse cose: lo controlla tests/block-rules.test.ts.

/**
 * I messaggi diretti che passano anche da chi è bloccato: avvisi del gioco e risposte a cose già
 * avviate (soldi e scambi non restano a metà). Tutti gli altri iniziano un contatto e si fermano.
 */
export const PASS_THROUGH_BLOCK = [
  'money_notice',
  'drugReturn',
  'kissYes',
  'kissNo',
  'artSold',
  'weedPaid',
  'weedNo',
  'theft',
  'ltdAccept',
  'ltdNo',
  'ltdGone',
  'usedSold',
  'bizRetired',
  'colDone',
  'colNo',
  'artAccept',
  'artNo',
  'tasteThanks',
  'engageYes',
  'engageNo',
  'cheat',
] as const;

/** Un messaggio di questo tipo arriva anche se il destinatario ha bloccato chi lo manda? */
export const passesBlock = (type: unknown): boolean =>
  typeof type === 'string' && (PASS_THROUGH_BLOCK as readonly string[]).includes(type);

/** I motivi di una segnalazione, nell'ordine in cui si mostrano. */
export const REPORT_REASONS = [
  { id: 'molestie', label: '😠 Insulti o molestie' },
  { id: 'odio', label: '🚫 Odio (razzismo, omofobia…)' },
  { id: 'sessuale', label: '🔞 Contenuti sessuali' },
  { id: 'dati', label: '📵 Chiede contatti o dati personali' },
  { id: 'spam', label: '📢 Spam o truffa' },
  { id: 'minore', label: '🧒 Sembra minorenne' },
  { id: 'altro', label: '✏️ Altro' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** La stessa persona si segnala al massimo una volta al giorno (anche nelle regole). */
export const REPORT_EVERY_MS = 86_400_000;
/** Le segnalazioni restano 6 mesi, poi le cancella la manutenzione (condizioni.html). */
export const REPORT_KEEP_DAYS = 183;
/** Quanti messaggi della chat si copiano come prova, e quanto può essere lunga la nota. */
export const REPORT_MSGS = 10;
export const REPORT_NOTE_MAX = 200;

export interface Blocked {
  name: string;
  t: number;
}

/** La mia lista dei bloccati letta dal database (sims_blocks/<io>). */
export function decodeBlocks(value: unknown): Record<string, Blocked> {
  const out: Record<string, Blocked> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [pid, v] of Object.entries(value as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const { name, t } = v as Record<string, unknown>;
    out[pid] = {
      name: typeof name === 'string' && name ? name.slice(0, 20) : 'Giocatore',
      t: typeof t === 'number' ? t : 0,
    };
  }
  return out;
}

export interface ChatProof {
  text: string;
  t: number;
}

/**
 * La prova di una segnalazione: gli ultimi messaggi di `pid` nella chat così come sono stati
 * scritti (senza i *** del filtro), dal più vecchio al più nuovo.
 */
export function chatProof(chat: unknown, pid: string, limit = REPORT_MSGS): ChatProof[] {
  if (!chat || typeof chat !== 'object') return [];
  return Object.keys(chat as Record<string, unknown>)
    .sort()
    .map((k) => (chat as Record<string, unknown>)[k])
    .filter(
      (m): m is { id: string; text: string; t: number } =>
        !!m &&
        typeof m === 'object' &&
        (m as Record<string, unknown>).id === pid &&
        typeof (m as Record<string, unknown>).text === 'string' &&
        typeof (m as Record<string, unknown>).t === 'number',
    )
    .slice(-limit)
    .map((m) => ({ text: m.text.slice(0, 200), t: m.t }));
}
