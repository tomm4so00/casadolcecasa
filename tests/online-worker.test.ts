import { beforeEach, describe, expect, it } from 'vitest';
import { type Env, handleOnline } from '../worker/src/index.js';
import { ONLINE_CACHE_MS, countOnline, countPresent, forgetOnline } from '../worker/src/online.js';

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
    p1: { x: 1 },
    p2: { offline: true, offAt: 1 },
    p3: { x: 2, offline: false },
  },
  worlds: { 'CASA-X92K': {}, 'CASA-3333': {}, strano: {} },
  'worlds/CASA-X92K/online_players': { q1: { x: 1 } },
  'worlds/CASA-3333/online_players': { q2: { offline: true } },
};

beforeEach(() => forgetOnline());

describe('quanti sono online', () => {
  it('conta chi non è segnato offline, in tutti i mondi', async () => {
    expect(countPresent(DATA.sims_online_players)).toBe(2);
    expect(countPresent(null)).toBe(0);
    expect(await countOnline(reader(DATA).read)).toBe(3);
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
    expect(await first.json()).toEqual({ n: 3 });
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
    expect(await res.json()).toEqual({ n: null });
  });
});
