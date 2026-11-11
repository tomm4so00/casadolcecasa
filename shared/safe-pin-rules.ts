// Combinazione della cassaforte: regole senza browser, usate dal gioco, dal server (che sposta i
// PIN vecchi nel nodo privato sims_safe_pins) e dal Worker (l'indizio di Zero).
//
// La combinazione si salva cifrata in sims_safe_pins/<giocatore>, che legge solo il proprietario.
// Il "sale" è il codice del giocatore: il PIN lo segue in ogni stanza e in ogni mondo.
// Prima stava nella stanza (sims_rooms_state/<n>/pin), leggibile da tutti, col numero della
// stanza come sale: con così poche combinazioni la si scopriva provandole tutte.

/** La combinazione cifrata insieme al sale (prima il numero della stanza, ora il giocatore). */
export function hashPin(pin: unknown, salt: unknown): string {
  const s = 'sims:' + salt + ':' + pin;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}

/** Com'è fatto un PIN cifrato (le regole del database vogliono lo stesso). */
export const PIN_HASH_RE = /^h[0-9a-z]{1,7}$/;

/** Ogni combinazione possibile: 3 cifre da 1 a `top` (4 al livello 1, 5 al livello 2). */
export function allPins(top = 5): string[] {
  const out: string[] = [];
  for (let a = 1; a <= top; a++)
    for (let b = 1; b <= top; b++) for (let c = 1; c <= top; c++) out.push(`${a}${b}${c}`);
  return out;
}

/**
 * Le 3 cifre di un PIN salvato col sale `salt`: provandole tutte, perché sono poche. Vale anche
 * per i PIN vecchissimi salvati in chiaro. null se non si riconosce.
 */
export function recoverPin(pin: unknown, salt: unknown): string | null {
  if (typeof pin !== 'string' || !pin) return null;
  // in chiaro: si tiene com'è (come faceva il trasloco), anche se oggi non sarebbe valido
  if (!pin.startsWith('h')) return pin;
  return allPins().find((code) => hashPin(code, salt) === pin) ?? null;
}
