// Titoli dei quadri (senza dipendenze dal browser, così sono testabili).
// Il titolo è legato al quadro con un'"impronta" calcolata dai suoi colori: così lo segue
// quando viene venduto e appeso in un'altra stanza.

export const TITLE_MAX = 40;

/** Impronta del quadro: la stessa per lo stesso disegno, diversa (in pratica) per disegni diversi. */
export function paintingId(code: string): string {
  let a = 5381,
    b = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    a = ((a << 5) + a + c) | 0;
    b = Math.imul(b ^ c, 16777619);
  }
  return 'q' + (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/** Il titolo come va salvato: spazi in ordine, al massimo TITLE_MAX caratteri. */
export const cleanTitle = (title: string): string =>
  title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);

/** Spiega cosa non va nel titolo, oppure null. */
export function titleError(title: string): string | null {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) return 'Scrivi un titolo per il quadro.';
  if (t.length > TITLE_MAX) return `Il titolo può avere al massimo ${TITLE_MAX} caratteri.`;
  return null;
}

export interface PaintingTitle {
  title: string;
  /** Chi ha dato il nome (di solito chi l'ha dipinto): solo lui può cambiarlo. */
  by: string;
  t: number;
}

/** Legge un titolo dal database scartando i valori non validi. */
export function decodeTitle(value: unknown): PaintingTitle | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || typeof v.by !== 'string') return null;
  const title = cleanTitle(v.title);
  if (!title) return null;
  return { title, by: v.by, t: Number.isFinite(v.t) ? (v.t as number) : 0 };
}

/** Come si scrive il titolo nei testi: «Tramonto sul mare». */
export const quoted = (title: string | null | undefined): string => (title ? `«${title}»` : '');
