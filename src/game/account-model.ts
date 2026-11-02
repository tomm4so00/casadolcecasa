export interface AccountBinding {
  playerId: string;
}
export function googlePlayerId(uid: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Identità Google non valida.');
  return 'player_' + uid;
}
export function decodeAccountBinding(value: unknown): AccountBinding | null {
  if (!value || typeof value !== 'object' || !('playerId' in value)) return null;
  const id = value.playerId;
  return typeof id === 'string' && /^player_[A-Za-z0-9_-]{4,128}$/.test(id)
    ? { playerId: id }
    : null;
}
export function onlineSaveKey(playerId: string): string {
  return 'sims_save_v1:' + playerId;
}

// ---------------------------------------------------------------- ricominciare dopo la morte

/**
 * Codice del nuovo personaggio di chi ricomincia dopo la morte: legato allo stesso account Google,
 * ma diverso dal precedente, così il nuovo personaggio parte da zero e il vecchio resta al cimitero.
 */
export function rebirthPlayerId(uid: string, now: number): string {
  return googlePlayerId(uid) + '_r' + Math.floor(now).toString(36);
}

/** Spiega perché il nome scelto per il nuovo personaggio non va bene, oppure null. */
export function rebirthNameError(name: string, deadName: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Scrivi il nome del nuovo personaggio.';
  if (clean.length > 20) return 'Il nome può avere al massimo 20 caratteri.';
  if (clean.toLocaleLowerCase('it-IT') === deadName.trim().toLocaleLowerCase('it-IT'))
    return `Scegli un nome diverso da ${deadName.trim()}: quel personaggio riposa al cimitero.`;
  return null;
}
