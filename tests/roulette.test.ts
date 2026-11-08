import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BET_KEY,
  BET_MS,
  MAX_ROUND_BET,
  ROUND_MS,
  SPIN_MS,
  WHEEL,
  addChip,
  colorOf,
  decodeBets,
  multiplier,
  payout,
  phaseAt,
  spinAngles,
  wins,
} from '../src/game/roulette-rules.js';
import { ROULETTE_BET, ROULETTE_ROUND } from '../firebase/world-rules.mjs';

describe('roulette: ruota e numeri', () => {
  it('la ruota europea ha tutti i numeri da 0 a 36, una volta sola', () => {
    expect([...WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });
  it('18 rossi, 18 neri e lo zero verde; sulla ruota si alternano', () => {
    const colors = Array.from({ length: 37 }, (_, n) => colorOf(n));
    expect(colors.filter((c) => c === 'red')).toHaveLength(18);
    expect(colors.filter((c) => c === 'black')).toHaveLength(18);
    expect(colorOf(0)).toBe('green');
    for (let i = 2; i < WHEEL.length; i++)
      expect(colorOf(WHEEL[i]), `${WHEEL[i - 1]} → ${WHEEL[i]}`).not.toBe(colorOf(WHEEL[i - 1]));
  });
});

describe('roulette: puntate e vincite', () => {
  it('ogni puntata vince con i numeri giusti', () => {
    expect(wins('n17', 17)).toBe(true);
    expect(wins('n17', 18)).toBe(false);
    expect(wins('red', 1)).toBe(true);
    expect(wins('black', 2)).toBe(true);
    expect(wins('odd', 7)).toBe(true);
    expect(wins('even', 8)).toBe(true);
    expect(wins('low', 18)).toBe(true);
    expect(wins('high', 19)).toBe(true);
    expect(wins('d1', 12)).toBe(true);
    expect(wins('d2', 13)).toBe(true);
    expect(wins('d3', 36)).toBe(true);
    expect(wins('c1', 34)).toBe(true);
    expect(wins('c2', 35)).toBe(true);
    expect(wins('c3', 36)).toBe(true);
    expect(wins('c1', 36)).toBe(false);
  });
  it('lo zero fa perdere tutte le puntate esterne', () => {
    for (const k of ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'c1'])
      expect(wins(k, 0), k).toBe(false);
    expect(wins('n0', 0)).toBe(true);
  });
  it('ogni casella ha 1, 2 o 35 volte la posta, e le puntate esterne coprono 12 o 18 numeri', () => {
    const count = (k: string) =>
      Array.from({ length: 37 }, (_, n) => n).filter((n) => wins(k, n)).length;
    for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) {
      expect(count(k), k).toBe(18);
      expect(multiplier(k)).toBe(1);
    }
    for (const k of ['d1', 'd2', 'd3', 'c1', 'c2', 'c3']) {
      expect(count(k), k).toBe(12);
      expect(multiplier(k)).toBe(2);
    }
    expect(multiplier('n5')).toBe(35);
  });
  it('si riprende la posta vincente più la vincita', () => {
    const bets = { n7: 10, red: 20, d3: 5 };
    expect(payout(bets, 7)).toBe(10 * 36 + 20 * 2); // il 7 è rosso, prima dozzina
    expect(payout(bets, 30)).toBe(20 * 2 + 5 * 3); // rosso, terza dozzina
    expect(payout(bets, 0)).toBe(0);
  });
  it('fiches valide, al massimo 500 Đ a giro e solo con i soldi in cassaforte', () => {
    expect(addChip({}, 'red', 25, 100)).toEqual({ bets: { red: 25 } });
    expect(addChip({ red: 25 }, 'red', 10, 100)).toEqual({ bets: { red: 35 } });
    expect(addChip({}, 'red', 7, 100)).toHaveProperty('error');
    expect(addChip({}, 'n37', 5, 100)).toHaveProperty('error');
    expect(addChip({ red: MAX_ROUND_BET - 5 }, 'black', 10, 1000)).toHaveProperty('error');
    expect(addChip({}, 'red', 50, 20)).toHaveProperty('error');
  });
  it('le puntate lette dal database scartano quelle rovinate', () => {
    expect(decodeBets({ red: 10, n40: 5, black: 3, odd: 'tanti', even: 600 })).toEqual({ red: 10 });
  });
  it('il database accetta le stesse caselle del gioco', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const k = rules.sims_roulette.bets.$round.$pid.bets.$k['.validate'];
    expect(k).toContain(BET_KEY.source);
    expect(rules.worlds.$worldId.roulette).toBeDefined();
  });
});

describe('roulette: il giro', () => {
  it('puntate, ruota che gira, numero in vista; uguale per tutti', () => {
    const r = 1000;
    expect(phaseAt(r * ROUND_MS)).toMatchObject({ round: r, phase: 'bet', left: BET_MS });
    expect(phaseAt(r * ROUND_MS + BET_MS).phase).toBe('spin');
    expect(phaseAt(r * ROUND_MS + BET_MS + SPIN_MS).phase).toBe('show');
    expect(phaseAt((r + 1) * ROUND_MS).round).toBe(r + 1);
    expect(ROULETTE_ROUND).toBe(ROUND_MS);
    expect(ROULETTE_BET).toBe(BET_MS);
  });
  it('a fine animazione la pallina è sulla casella del numero uscito', () => {
    for (const n of [0, 17, 36]) {
      const { wheel, ball } = spinAngles(n, 1);
      // la pallina è ferma sulla casella, che gira insieme alla ruota
      const rel = (((ball - wheel) % 1) + 1) % 1;
      expect(Math.round(rel * WHEEL.length) % WHEEL.length).toBe(WHEEL.indexOf(n));
    }
  });
});
