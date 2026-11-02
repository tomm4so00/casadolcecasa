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
