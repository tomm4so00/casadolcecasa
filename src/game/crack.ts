// Lo scasso in corso: la presenza online lo pubblica (crack = indice della stanza), così il
// proprietario vede il ladro davanti alla cassaforte e può fermarlo con un pugno.

export interface Crack {
  /** Indice della stanza (in rooms_state) di cui si scassina la cassaforte. */
  roomIdx: number;
  /** Quando è cominciato (ora del dispositivo, ms). */
  startAt: number;
}

let current: Crack | null = null;

export const currentCrack = (): Crack | null => current;

export function setCrack(crack: Crack | null): void {
  current = crack;
}
