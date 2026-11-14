// Il ponte verso il centro di criogenesi (cryo-center.ts): il menu dei posti e le interazioni lo
// usano da qui senza importarlo, perché cryo-center.ts usa finestre, messaggi e la criogenesi e
// l'import diretto creerebbe un ciclo. cryo-center.ts si aggancia quando parte il gioco (main.ts).

export const CRYO_ENV = 'criogenesi';
export const CRYO_TITLE = 'Centro di Criogenesi 🧊';

export const cryoCenterHooks = {
  /** Il testo del pulsante vicino a un oggetto del centro (null per l'uscita). */
  prompt: (_key: string): { text: string } | null => null,
  /** Cosa fa il pulsante. */
  act: async (_key: string): Promise<void> => {},
};
