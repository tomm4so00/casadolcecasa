import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CABINET_IDS,
  MAX_POINTS_PER_SECOND,
  PRIZE_MIN_SCORE,
  RECORD_PRIZE,
  decodeBest,
  decodeRecord,
  plausibleScore,
  recordPrize,
} from '../src/game/cabinet-rules.js';
import {
  Bricks,
  DogRun,
  Meteors,
  type PadInput,
  SCREEN_W,
  newMiniGame,
} from '../src/game/cabinet-games.js';
import { ARCADE_RATES } from '../firebase/world-rules.mjs';

const idle = (): PadInput => ({ left: false, right: false, up: false, down: false, action: false });
/** Numeri "casuali" sempre uguali, per partite ripetibili. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('regole del cabinato', () => {
  it('il punteggio deve essere credibile per il tempo giocato', () => {
    expect(plausibleScore('dog', 100, 0)).toBe(true); // il margine iniziale
    expect(plausibleScore('dog', 350, 10_000)).toBe(true);
    expect(plausibleScore('dog', 351, 10_000)).toBe(false);
    expect(plausibleScore('meteors', 0, 10_000)).toBe(false);
    expect(plausibleScore('bricks', 2.5, 10_000)).toBe(false);
  });

  it('le regole del database usano gli stessi limiti del gioco', () => {
    expect(ARCADE_RATES).toEqual(MAX_POINTS_PER_SECOND);
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    for (const node of [rules.sims_arcade_global, rules.sims_arcade_records])
      for (const id of CABINET_IDS) expect(node.$game['.write']).toContain(`'${id}'`);
    expect(rules.worlds.$worldId.arcade_records).toBeDefined();
    // il cabinato si compra come gli altri mobili ed è protetto dalle scritture degli altri
    const room = rules.sims_rooms_state.$room;
    expect(room.economy.ownedFurniture).toHaveProperty('cabinet_std');
    expect(room['.validate']).toContain("economy/ownedFurniture/cabinet_std'");
  });

  it('il premio va a chi strappa il record a qualcun altro, sopra la soglia', () => {
    const other = { score: 500, pid: 'player_b', nick: 'B', t: 0 };
    const mine = { ...other, pid: 'player_a' };
    const ok = PRIZE_MIN_SCORE.dog + 200;
    expect(recordPrize('dog', 'world', ok, null, 'player_a')).toBe(RECORD_PRIZE.world);
    expect(recordPrize('dog', 'global', ok, other, 'player_a')).toBe(RECORD_PRIZE.global);
    // chi migliora il proprio record non incassa di nuovo
    expect(recordPrize('dog', 'world', ok, mine, 'player_a')).toBe(0);
    // sotto la soglia o senza battere il record: niente
    expect(recordPrize('dog', 'world', PRIZE_MIN_SCORE.dog - 1, null, 'player_a')).toBe(0);
    expect(recordPrize('dog', 'world', 400, other, 'player_a')).toBe(0);
  });

  it('legge record e punteggi salvati, scartando quelli rovinati', () => {
    expect(decodeRecord({ score: 10, pid: 'p', nick: 'Anna', t: 5 })).toEqual({
      score: 10,
      pid: 'p',
      nick: 'Anna',
      t: 5,
    });
    expect(decodeRecord({ score: -1, pid: 'p', nick: 'x' })).toBeNull();
    expect(decodeRecord(null)).toBeNull();
    expect(decodeBest({ score: 42 })).toBe(42);
    expect(decodeBest({ score: 'tanti' })).toBe(0);
  });
});

describe('Cane in fuga', () => {
  it('parte quando si salta e finisce contro un ostacolo', () => {
    const g = new DogRun(seeded());
    g.update(1, idle());
    expect(g.waiting).toBe(true);
    g.update(0.02, { ...idle(), up: true });
    expect(g.waiting).toBe(false);
    // senza mai saltare prima o poi si sbatte contro qualcosa
    for (let i = 0; i < 2000 && !g.over; i++) g.update(0.02, idle());
    expect(g.over).toBe(true);
    expect(g.score).toBeGreaterThan(0);
  });

  it('anche andando al massimo non supera il limite di punti al secondo', () => {
    // velocità massima: 175 punti schermo al secondo, un punto ogni 8
    expect(175 / 8).toBeLessThan(MAX_POINTS_PER_SECOND.dog);
  });
});

describe('Mattoncini', () => {
  it('la pallina parte con A, rompe i mattoncini e a palle finite la partita finisce', () => {
    const g = new Bricks(seeded());
    g.update(0.5, idle());
    expect(g.waiting).toBe(true);
    // la racchetta resta ferma: la pallina sale, rompe qualcosa e poi cade
    for (let i = 0; i < 20000 && !g.over; i++) g.update(0.016, { ...idle(), action: true });
    expect(g.score).toBeGreaterThan(0);
    expect(g.over).toBe(true);
  });

  it('un giocatore perfetto supera i livelli e resta sotto il limite di punti al secondo', () => {
    for (const seed of [3, 5, 9]) {
      const g = new Bricks(seeded(seed));
      let t = 0;
      // la racchetta segue la pallina, colpendola ogni volta in un punto un po' diverso
      for (; t < 300 && !g.over; t += 0.016) {
        const ball = (g as unknown as { ballX: number }).ballX;
        g.update(0.016, { ...idle(), action: true, pointerX: ball + Math.sin(t * 3) * 6 });
      }
      expect(g.level, `seme ${seed}`).toBeGreaterThan(1);
      expect(g.score / t, `seme ${seed}`).toBeLessThan(MAX_POINTS_PER_SECOND.bricks);
    }
  });

  it('colpita al centro della racchetta la pallina non torna dritta in verticale', () => {
    const g = new Bricks(seeded());
    for (let t = 0; t < 60 && !g.over; t += 0.016) {
      const ball = (g as unknown as { ballX: number }).ballX;
      g.update(0.016, { ...idle(), action: true, pointerX: ball });
    }
    // prima rimbalzava per sempre nella stessa colonna e i punti restavano fermi
    expect(g.score).toBeGreaterThan(60);
  });
});

describe('Pioggia di meteore', () => {
  it('sparando si fanno punti; ferma sotto le meteore prima o poi si viene colpiti', () => {
    const g = new Meteors(seeded());
    g.update(0.1, { ...idle(), action: true });
    for (let i = 0; i < 30000 && !g.over; i++) g.update(0.016, { ...idle(), action: true });
    expect(g.over).toBe(true);
    expect(g.score).toBeGreaterThan(0);
  });

  it('sparando di continuo e schivando resta sotto il limite di punti al secondo', () => {
    type M = { x: number; y: number };
    for (const seed of [11, 4, 8]) {
      const g = new Meteors(seeded(seed));
      let t = 0;
      // si schivano le meteore vicine, altrimenti ci si mette sotto la più bassa e si spara
      for (; t < 300 && !g.over; t += 0.016) {
        const inner = g as unknown as { meteors: M[]; shipX: number };
        const sx = inner.shipX;
        const danger = inner.meteors.filter((m) => m.y > 75 && Math.abs(m.x - sx) < 14);
        let target = sx;
        if (danger.length) target = sx + (danger[0].x > sx ? -30 : 30);
        else {
          const low = inner.meteors
            .filter((m) => m.y < 80)
            .reduce<M | null>((a, m) => (m.y > (a?.y ?? -1e9) ? m : a), null);
          if (low) target = low.x;
        }
        const pointerX = Math.max(4, Math.min(SCREEN_W - 4, target));
        g.update(0.016, { ...idle(), action: true, pointerX });
      }
      expect(t, `seme ${seed}`).toBeGreaterThan(20);
      expect(g.score / t, `seme ${seed}`).toBeLessThan(MAX_POINTS_PER_SECOND.meteors);
    }
  });

  it('ogni gioco del cabinato si crea dal suo nome', () => {
    for (const id of CABINET_IDS) expect(newMiniGame(id).id).toBe(id);
  });
});
