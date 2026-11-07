// Spazio espositivo delle aste dei quadri: in ogni condominio il catalogo e quadrivendo.it espongono
// al massimo EXHIBIT_LIMIT quadri. Oltre la soglia, i quadri all'asta con meno cuoricini (a parità,
// i più vecchi) perdono il posto: parte un timer di 7 giorni in cui il pittore sceglie se appenderli in camera o
// buttarli; allo scadere il quadro viene buttato. Lo fa la manutenzione del server (server/), il
// gioco mostra l'avviso. Senza dipendenze, così è testabile.

/** Quadri esposti al massimo in un condominio. */
export const EXHIBIT_LIMIT = 128;
/** Tempo che il pittore ha per decidere, da quando parte il timer. */
export const EXPIRE_AFTER_MS = 7 * 24 * 3600 * 1000;

export interface ExpiryAuction {
  id: string;
  /** Il pittore. */
  by: string;
  t: number;
  votes: number;
  /** Offerta accettata (anche già pagata): il quadro è venduto, non si tocca. */
  sold: boolean;
  /** Quando viene buttato, se il timer è partito. */
  expiresAt?: number;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Le aste di un condominio, come le salva il database, con solo quello che serve qui. */
export function readExpiryAuctions(raw: unknown): ExpiryAuction[] {
  if (!record(raw)) return [];
  const out: ExpiryAuction[] = [];
  for (const [id, a] of Object.entries(raw)) {
    if (!record(a) || typeof a.by !== 'string' || typeof a.t !== 'number') continue;
    out.push({
      id,
      by: a.by,
      t: a.t,
      votes: record(a.votes) ? Object.keys(a.votes).filter((pid) => pid !== a.by).length : 0,
      sold: record(a.sold),
      ...(typeof a.expiresAt === 'number' ? { expiresAt: a.expiresAt } : {}),
    });
  }
  return out;
}

/**
 * Cosa fare a questo giro: `start` sono le aste a cui far partire il timer (quanto basta per
 * tornare sotto la soglia: prima quelle con meno cuoricini e, a parità, le più vecchie), `remove`
 * quelle scadute.
 * Contano solo le aste esposte: non vendute, di chi abita nel condominio, senza timer.
 */
export function expiryPlan(
  auctions: ExpiryAuction[],
  residents: Set<string>,
  now: number,
): { start: string[]; remove: string[] } {
  const remove = auctions
    .filter((a) => a.expiresAt !== undefined && a.expiresAt <= now && !a.sold)
    .map((a) => a.id);
  const shown = auctions.filter((a) => !a.sold && a.expiresAt === undefined && residents.has(a.by));
  const excess = shown.length - EXHIBIT_LIMIT;
  const start =
    excess > 0
      ? shown
          .sort((a, b) => a.votes - b.votes || a.t - b.t || a.id.localeCompare(b.id))
          .slice(0, excess)
          .map((a) => a.id)
      : [];
  return { start, remove };
}

/** Il testo dell'avviso al pittore (sul telefono e nel gioco). */
export function expiryNotice(title: string | null) {
  const what = title ? `il tuo quadro «${title}»` : 'il tuo quadro';
  return {
    title: '🖼️ Spazio espositivo terminato',
    body:
      `Le opere all'asta sono più di ${EXHIBIT_LIMIT}: la disponibilità dello spazio espositivo per ${what} è terminata. ` +
      'Entro 7 giorni scegli se appenderlo in camera o buttarlo, altrimenti verrà buttato.',
  };
}
