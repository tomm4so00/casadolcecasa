// Le regole della vetrina della prima schermata (showcase.ts), senza browser: si provano nei test.

/** L'immagine dell'ora: giorno 7–17, tramonto 17–20, notte il resto. */
export function sceneFor(hour: number): 'giorno' | 'tramonto' | 'notte' {
  if (hour >= 7 && hour < 17) return 'giorno';
  if (hour >= 17 && hour < 20) return 'tramonto';
  return 'notte';
}

/** "1 vicino online adesso", "12 vicini online adesso". */
export const onlineText = (n: number): string =>
  n === 1 ? '1 vicino online adesso' : `${n} vicini online adesso`;

/** "1 vicino vivo", "14 vicini vivi": i personaggi vivi del condominio. */
export const aliveText = (n: number): string => (n === 1 ? '1 vicino vivo' : `${n} vicini vivi`);
