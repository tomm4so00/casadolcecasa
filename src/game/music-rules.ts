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
  collezionismo: 'mall',
  usato: 'mall',
  scommesse: 'casino',
  sala_giochi: 'arcade',
  banca: 'bank',
  commissariato: 'bank',
  laboratorio: 'artlab',
  galleria: 'artlab',
  ingegneria: 'engineering',
  luna: 'space',
  base_lunare: 'space',
};

export function musicFor(env?: unknown): string {
  if (typeof env === 'string' && env.indexOf('lavoro_') === 0) return 'work';
  return (typeof env === 'string' && ENV_MUSIC[env]) || 'home';
}

/** Quante volte si ripete un brano prima di passare a un altro dello stesso tema (30-40 secondi). */
export const LOOPS_PER_TRACK = 2;

/** Il brano con cui si comincia entrando in un posto: uno a caso tra i `count` del tema. */
export function firstVariant(count: number, rnd: number): number {
  return count > 1 ? Math.min(count - 1, Math.floor(rnd * count)) : 0;
}

/** Il brano successivo: un altro a caso, mai lo stesso di prima (se il tema ne ha più d'uno). */
export function nextVariant(count: number, current: number, rnd: number): number {
  if (count <= 1) return 0;
  const k = Math.min(count - 2, Math.floor(rnd * (count - 1)));
  return k >= current ? k + 1 : k;
}
