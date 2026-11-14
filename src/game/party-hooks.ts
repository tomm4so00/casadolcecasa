// Il ponte verso la festa del condominio (party.ts): avvio, bacheca e disegno la usano da qui senza
// importarla, perché party.ts usa salvataggi e messaggi e l'import diretto creerebbe un ciclo.
// party.ts si aggancia quando parte il gioco (main.ts).

type Spot = { x: number; y: number };

export const partyHooks = {
  /** Avvisi e spilla della serata (interface.ts, all'ingresso nel gioco). */
  start: (): void => {},
  /** Il testo della bacheca nella stanza. */
  boardText: (_mine: boolean, _count: number, _owner: string): string => '',
  /** Si è nella propria stanza? */
  isMyRoom: (): boolean => false,
  /** La disposizione dei mobili della propria stanza. */
  myRoomMap: (): Record<string, Spot> => ({}),
};
