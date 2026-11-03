// Combinazione della cassaforte: si salva cifrata insieme al numero della stanza.
export function hashPin(pin: unknown, salt: unknown): string {
  const s = 'sims:' + salt + ':' + pin;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}
