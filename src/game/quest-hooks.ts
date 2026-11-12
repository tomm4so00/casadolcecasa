// Il ponte verso i capitoli delle missioni (quests.ts): le missioni, la freccia e la freccetta li
// chiamano da qui senza importarli, perché quests.ts usa a sua volta salvataggi, soldi e benvenuto
// e l'import diretto creerebbe un ciclo. quests.ts si aggancia quando parte il gioco (main.ts).
import type { GuideDest } from './guide-rules.js';

export const questHooks = {
  /** Ogni secondo: missioni fatte, premi e trofei. */
  tick: async (): Promise<void> => {},
  /** La finestra «Missioni». */
  open: (): void => {},
  /** Dove porta la freccia per la missione seguita. */
  dest: (): GuideDest | null => null,
  /** L'istruzione della missione seguita, per la freccetta sui pulsanti. */
  hint: (): string => '',
};
