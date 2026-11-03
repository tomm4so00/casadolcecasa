import { describe, expect, it } from 'vitest';
import { livedRows, rankLabel, wealthRows } from '../src/game/leaderboard-rules';

describe('classifiche', () => {
  it('più ricchi: tutti, dal più ricco, senza limite di 10', () => {
    const lb: Record<string, { name: string; wealth?: number }> = {};
    for (let i = 0; i < 40; i++) lb['player_p' + i] = { name: 'P' + i, wealth: i * 10 };
    lb.player_x = { name: 'Senza soldi' }; // senza patrimonio: escluso
    const rows = wealthRows(lb);
    expect(rows).toHaveLength(40);
    expect(rows[0]).toEqual({ id: 'player_p39', name: 'P39', value: 390 });
    expect(rows[39].value).toBe(0);
  });

  it('più longevi: vivi e morti insieme', () => {
    const rows = livedRows(
      { player_a: { name: 'Anna', bornAt: 1000 }, player_b: { name: 'Bea' } },
      { player_c: { name: 'Carlo', lived: 5000 } },
      4000,
    );
    expect(rows).toEqual([
      { id: 'player_c', name: 'Carlo', value: 5000, dead: true },
      { id: 'player_a', name: 'Anna', value: 3000 },
    ]);
  });

  it('medaglie per i primi tre, poi il numero', () => {
    expect([0, 1, 2, 3, 9].map(rankLabel)).toEqual(['🥇', '🥈', '🥉', '4.', '10.']);
  });
});
