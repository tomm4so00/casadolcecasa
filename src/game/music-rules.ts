// Quale tema musicale suona in ogni ambiente (senza dipendenze dal browser, così è testabile).

/** Tema musicale di ogni ambiente (gli ambienti di casa senza un tema loro usano "home"). */
export const ENV_MUSIC: Record<string, string> = {
  bar: 'bar',
  discoteca: 'disco',
  CIMITERO: 'grave',
  passeggiata: 'outdoor',
  viaggio: 'outdoor',
  PLAYER_ROOM: 'room',
  CORTILE: 'courtyard',
  centro_commerciale: 'mall',
  negozio_mobili: 'mall',
  negozio_vestiti: 'mall',
  negozio_animali: 'mall',
  growshop: 'mall',
  scommesse: 'casino',
  sala_giochi: 'arcade',
  banca: 'bank',
  laboratorio: 'artlab',
  ingegneria: 'engineering',
  ingegneria_esterno: 'engineering',
  luna: 'space',
  base_lunare: 'space',
};

export function musicFor(env?: unknown): string {
  if (typeof env === 'string' && env.indexOf('lavoro_') === 0) return 'work';
  return (typeof env === 'string' && ENV_MUSIC[env]) || 'home';
}
