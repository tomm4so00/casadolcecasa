import { beforeEach, describe, expect, it } from 'vitest';
import { type Env, handleOnline } from '../worker/src/index.js';
import {
  ONLINE_CACHE_MS,
  countFreeRooms,
  countOnline,
  countPresent,
  forgetOnline,
} from '../worker/src/online.js';

const NOW = Date.UTC(2026, 10, 12, 18, 0, 0);
const env = { GAME_ORIGINS: 'https://casadolcecasa.web.app' } as Env;

/** Un database finto: percorso → valore; `shallow` restituisce solo le chiavi. */
function reader(data: Record<string, unknown>) {
  const calls: string[] = [];
  const read = async (path: string, shallow?: boolean) => {
    calls.push(path);
    const value = data[path];
    if (!shallow || !value || typeof value !== 'object') return value ?? null;
    return Object.fromEntries(Object.keys(value).map((k) => [k, true]));
  };
  return { read, calls };
}

const DATA = {
  sims_online_players: {
    p1: { x: 1, t: NOW - 5_000 },
    p2: { offline: true, offAt: 1, t: NOW - 5_000 },
    p3: { x: 2, offline: false, t: NOW - 1_000 },
    // il telefono si è spento senza avvisare: non è segnato offline, ma non gioca da 3 giorni
    p4: { x: 3, t: NOW - 3 * 86_400_000 },
  },
  worlds: { 'CASA-X92K': {}, 'CASA-3333': {}, strano: {} },
  sims_worlds: { 'CASA-0001': { free: 49 }, 'CASA-X92K': { free: 60, createdAt: 1 } },
  'worlds/CASA-X92K/online_players': { q1: { x: 1, t: NOW } },
  'worlds/CASA-3333/online_players': { q2: { offline: true } },
};

beforeEach(() => forgetOnline());

describe('quanti sono online', () => {
  it('online chi manda il battito da poco, vivi tutte le schede, in tutti i mondi', async () => {
    expect(countPresent(DATA.sims_online_players, NOW)).toEqual({ online: 2, alive: 4 });
    expect(countPresent(null, NOW)).toEqual({ online: 0, alive: 0 });
    expect(await countOnline(reader(DATA).read, NOW)).toEqual({ online: 3, alive: 6, free: 109 });
  });

  it('risponde con il solo numero, ai siti del gioco, e lo riusa per un minuto', async () => {
    const r = reader(DATA);
    const ask = (now: number, origin = 'https://casadolcecasa.web.app') =>
      handleOnline(
        new Request('https://w.example/online', { headers: { origin } }),
        env,
        now,
        r.read,
      );
    const first = await ask(NOW);
    expect(await first.json()).toEqual({ n: 3, vivi: 6, liberi: 109 });
    expect(first.headers.get('access-control-allow-origin')).toBe('https://casadolcecasa.web.app');
    const reads = r.calls.length;
    await ask(NOW + ONLINE_CACHE_MS - 1);
    expect(r.calls.length).toBe(reads);
    await ask(NOW + ONLINE_CACHE_MS + 1);
    expect(r.calls.length).toBeGreaterThan(reads);
    // da un altro sito il browser non può leggere la risposta
    const other = await ask(NOW, 'https://altro.example');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('se il database non risponde dice che non lo sa', async () => {
    const res = await handleOnline(new Request('https://w.example/online'), env, NOW, async () => {
      throw new Error('giù');
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ n: null, vivi: null, liberi: null });
  });

  it('somma le stanze libere dei mondi, ignorando i valori strani', () => {
    expect(countFreeRooms(null)).toBe(0);
    expect(
      countFreeRooms({
        a: { free: 3 },
        b: { free: -2 },
        c: { free: 999 },
        d: null,
        e: { free: 'x' },
      }),
    ).toBe(67);
  });
});
