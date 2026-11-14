// Le regole della vetrina della prima schermata (showcase.ts), senza browser: si provano nei test.

/** L'immagine dell'ora: giorno 7–17, tramonto 17–20, notte il resto. */
export function sceneFor(hour: number): 'giorno' | 'tramonto' | 'notte' {
  if (hour >= 7 && hour < 17) return 'giorno';
  if (hour >= 17 && hour < 20) return 'tramonto';
  return 'notte';
}

/** Una scritta della prima schermata: il pallino verde solo se qualcuno gioca davvero adesso. */
export interface CountPill {
  live: boolean;
  icon: string;
  text: string;
}

const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

/**
 * Le scritte sopra "Gioca subito", dai numeri del Worker (n online, vivi, stanze libere). Un numero
 * piccolo non invoglia: con 1 o 2 online si dice "qualcuno", con nessuno si parla di chi ci vive e
 * dei posti liberi. Se il Worker non risponde non c'è niente da dire.
 */
export function countPills(data: { n?: unknown; vivi?: unknown; liberi?: unknown }): CountPill[] {
  const online = count(data.n);
  const alive = count(data.vivi);
  const free = count(data.liberi);
  if (online === null) return [];
  const out: CountPill[] = [];
  if (online >= 3) out.push({ live: true, icon: '', text: `${online} vicini online adesso` });
  else if (online > 0) out.push({ live: true, icon: '', text: 'Qualcuno è in cortile adesso' });
  if (online > 0) {
    if (alive)
      out.push({
        live: false,
        icon: '🏠',
        text: `${alive} ${alive === 1 ? 'vive' : 'vivono'} qui`,
      });
    return out;
  }
  if (alive)
    out.push({
      live: false,
      icon: '🏠',
      text: alive === 1 ? '1 vicino vive qui' : `${alive} vicini vivono qui`,
    });
  if (free)
    out.push({
      live: false,
      icon: '🔑',
      text: free === 1 ? '1 stanza libera' : `${free} stanze libere`,
    });
  return out;
}
