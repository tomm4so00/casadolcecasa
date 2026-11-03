import { describe, expect, it } from 'vitest';
import {
  BN_CELLS,
  BN_SHIPS,
  BN_SIZE,
  C4_COLS,
  RX_TIMEOUT_MS,
  RX_TO_WIN,
  bnAllSunk,
  bnEmptyShots,
  bnFire,
  bnRandomFleet,
  c4Drop,
  c4Empty,
  c4Full,
  c4Winner,
  decodeMatch,
  newMatch,
  playBN,
  playC4,
  rxRoundWinner,
  settleRX,
} from '../src/game/arcade-rules';

/** Numeri "casuali" sempre uguali, per avere sempre la stessa flotta. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const A = { id: 'player_anna', name: 'Anna' };
const B = { id: 'player_luca', name: 'Luca' };

describe('Forza 4', () => {
  it('i gettoni cadono in fondo e la colonna piena non accetta altro', () => {
    let b = c4Empty();
    b = c4Drop(b, 3, 'a')!;
    expect(b[5 * C4_COLS + 3]).toBe('1');
    b = c4Drop(b, 3, 'b')!;
    expect(b[4 * C4_COLS + 3]).toBe('2');
    for (let i = 0; i < 4; i++) b = c4Drop(b, 3, 'a')!;
    expect(c4Drop(b, 3, 'b')).toBeNull();
    expect(c4Drop(b, 9, 'b')).toBeNull();
  });

  it('riconosce quattro in fila in tutte le direzioni', () => {
    let row = c4Empty();
    for (const c of [0, 1, 2, 3]) row = c4Drop(row, c, 'a')!;
    expect(c4Winner(row)).toBe('a');
    let col = c4Empty();
    for (let i = 0; i < 4; i++) col = c4Drop(col, 6, 'b')!;
    expect(c4Winner(col)).toBe('b');
    // diagonale: scala di gettoni
    let d = c4Empty();
    const moves: [number, 'a' | 'b'][] = [
      [0, 'a'],
      [1, 'b'],
      [1, 'a'],
      [2, 'b'],
      [2, 'b'],
      [2, 'a'],
      [3, 'b'],
      [3, 'b'],
      [3, 'b'],
      [3, 'a'],
    ];
    for (const [c, s] of moves) d = c4Drop(d, c, s)!;
    expect(c4Winner(d)).toBe('a');
    expect(c4Winner(c4Empty())).toBeNull();
    expect(c4Full(c4Empty())).toBe(false);
  });

  it('a turno: si muove solo chi tocca, e la partita finisce con la vittoria', () => {
    let m = { ...newMatch('c4', A, B, 1), status: 'play' as const };
    expect(playC4(m, 'b', 0)).toBeNull(); // non è il turno di b
    for (const [side, col] of [
      ['a', 0],
      ['b', 6],
      ['a', 1],
      ['b', 6],
      ['a', 2],
      ['b', 6],
    ] as const)
      m = playC4(m, side, col)! as typeof m;
    const end = playC4(m, 'a', 3)!;
    expect(end.status).toBe('done');
    expect(end.winner).toBe('a');
  });
});

describe('Battaglia navale', () => {
  it('la flotta ha tutte le navi, intere e che non si toccano', () => {
    for (let seed = 1; seed < 30; seed++) {
      const fleet = bnRandomFleet(seeded(seed));
      expect(fleet.length).toBe(BN_CELLS);
      BN_SHIPS.forEach((len, s) => {
        const cells = [...fleet]
          .map((v, i) => (v === String(s + 1) ? i : -1))
          .filter((i) => i >= 0);
        expect(cells.length).toBe(len);
        // in fila (orizzontale o verticale)
        const rows = new Set(cells.map((i) => Math.floor(i / BN_SIZE)));
        const cols = new Set(cells.map((i) => i % BN_SIZE));
        expect(rows.size === 1 || cols.size === 1).toBe(true);
      });
      // nessuna casella di una nave tocca un'altra nave (nemmeno in diagonale)
      for (let i = 0; i < BN_CELLS; i++) {
        if (fleet[i] === '0') continue;
        const r = Math.floor(i / BN_SIZE),
          c = i % BN_SIZE;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr,
              nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= BN_SIZE || nc >= BN_SIZE) continue;
            const v = fleet[nr * BN_SIZE + nc];
            expect(v === '0' || v === fleet[i]).toBe(true);
          }
      }
    }
  });

  it('acqua, colpito, affondato; la stessa casella non si colpisce due volte', () => {
    const fleet = bnRandomFleet(seeded(7));
    const water = fleet.indexOf('0');
    expect(bnFire(fleet, bnEmptyShots(), water)?.result).toBe('miss');
    let shots = bnEmptyShots();
    const two = [...fleet].map((v, i) => (v === '5' ? i : -1)).filter((i) => i >= 0);
    const first = bnFire(fleet, shots, two[0])!;
    expect(first.result).toBe('hit');
    shots = first.shots;
    expect(bnFire(fleet, shots, two[0])).toBeNull();
    expect(bnFire(fleet, shots, two[1])?.result).toBe('sunk');
  });

  it('vince chi affonda tutta la flotta; i turni si alternano', () => {
    let m = { ...newMatch('bn', A, B, 1, seeded(3)), status: 'play' as const };
    const targetsA = [...m.fb!].map((v, i) => (v !== '0' ? i : -1)).filter((i) => i >= 0);
    const waterB = [...m.fa!].map((v, i) => (v === '0' ? i : -1)).filter((i) => i >= 0);
    expect(playBN(m, 'b', 0)).toBeNull();
    let end = m;
    targetsA.forEach((cell, k) => {
      end = playBN(end, 'a', cell)!.match as typeof m;
      if (end.status === 'play') end = playBN(end, 'b', waterB[k])!.match as typeof m;
    });
    expect(end.status).toBe('done');
    expect(end.winner).toBe('a');
    expect(bnAllSunk(end.sa!)).toBe(true);
  });
});

describe('Riflessi', () => {
  it('vince il più veloce; chi parte prima perde la manche', () => {
    expect(rxRoundWinner(250, 300)).toBe('a');
    expect(rxRoundWinner(400, 300)).toBe('b');
    expect(rxRoundWinner(-50, 300)).toBe('b');
    expect(rxRoundWinner(200, -10)).toBe('a');
    expect(rxRoundWinner(-1, -1)).toBeNull();
    expect(rxRoundWinner(undefined, 500)).toBe('b');
    expect(rxRoundWinner(undefined, undefined)).toBeNull();
  });

  it('si va avanti a manche fino a 3 punti', () => {
    let m = { ...newMatch('rx', A, B, 0), status: 'play' as const, goAt: 1000 };
    // manche in corso: si aspetta finché non toccano entrambi (o scade il tempo)
    expect(settleRX({ ...m, ra: 200 }, 1300, 2000)).toBeNull();
    for (let r = 0; r < RX_TO_WIN; r++) {
      m = settleRX({ ...m, ra: 200, rb: 350 }, 2000, 2000)! as typeof m;
    }
    expect(m.status).toBe('done');
    expect(m.winner).toBe('a');
    expect(m.pa).toBe(RX_TO_WIN);
    // se nessuno tocca, la manche si chiude dopo il tempo massimo senza punti
    const idle = { ...newMatch('rx', A, B, 0), status: 'play' as const, goAt: 0 };
    const after = settleRX(idle, RX_TIMEOUT_MS + 1, 2000)!;
    expect([after.pa, after.pb, after.round]).toEqual([0, 0, 1]);
  });
});

describe('partita condivisa', () => {
  it('scarta i dati non validi', () => {
    const ok = newMatch('c4', A, B, 1);
    expect(decodeMatch(ok)).toEqual(ok);
    expect(decodeMatch({ ...ok, kind: 'scacchi' })).toBeNull();
    expect(decodeMatch({ ...ok, board: 'xx' })).toBeNull();
    expect(decodeMatch({ ...ok, status: 'boh' })).toBeNull();
    expect(decodeMatch(null)).toBeNull();
  });
});

describe('sala giochi nel gioco', () => {
  it('ha la vetrina nel centro commerciale e una postazione per ogni gioco', async () => {
    const { MALL_FURNITURE, ARCADE_FURNITURE } = await import('../src/game/data/catalogues');
    const shops = Object.values(MALL_FURNITURE).filter((s) => 'shop' in s) as {
      x: number;
      w: number;
      enter: string;
    }[];
    expect(shops.some((s) => s.enter === 'arcade')).toBe(true);
    // le vetrine non si sovrappongono
    const sorted = shops.slice().sort((p, q) => p.x - q.x);
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i].x - sorted[i].w / 2).toBeGreaterThanOrEqual(
        sorted[i - 1].x + sorted[i - 1].w / 2,
      );
    const games = Object.values(ARCADE_FURNITURE)
      .map((it) => (it as { game?: string }).game)
      .filter(Boolean);
    expect(games.sort()).toEqual(['bn', 'c4', 'rx']);
  });

  it('le partite le vedono e le cambiano solo i due giocatori', async () => {
    const fs = await import('node:fs');
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const g = rules.sims_games.$gid;
    expect(g['.read']).toContain("data.child('a').val() ===");
    expect(g['.write']).toContain("newData.child('b').val() === data.child('b').val()");
    expect(rules.sims_interactions.$pid.$key['.validate']).toContain('|gameInvite)');
  });
});
