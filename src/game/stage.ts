// L'ambiente in cui gira il gioco: quello di tutti o quello di prova, con il suo progetto Firebase
// e il suo sito (docs/ambiente-di-prova.md). Lo dice VITE_STAGE, messo dal workflow prova.yml.
export const STAGE: string = import.meta.env.VITE_STAGE || '';

/** Il gioco di prova: scritta PROVA accanto alla versione, niente pagamenti veri. */
export const isTestStage = (): boolean => STAGE === 'prova';
