import { describe, expect, it } from 'vitest';
import {
  MAX_PROOFS,
  countKinds,
  decodeFine,
  decodeTrashSave,
  describeKinds,
  fineFor,
  groupProofs,
  lastSweep,
  liveTrash,
  nextSweep,
  payable,
  splitFine,
  sweptKeys,
} from '../src/game/trash-rules.js';

// lunedì 9 novembre 2026, mercoledì 11, domenica 15
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();

describe('lo spazzino', () => {
  it('passa il lunedì alle 6', () => {
    expect(new Date(lastSweep(at(11, 15))).getDate()).toBe(9);
    expect(new Date(lastSweep(at(11, 15))).getHours()).toBe(6);
    // lunedì prima delle 6: vale ancora quello della settimana prima
    expect(new Date(lastSweep(at(9, 5))).getDate()).toBe(2);
    expect(new Date(lastSweep(at(9, 6))).getDate()).toBe(9);
    expect(new Date(nextSweep(at(15, 23))).getDate()).toBe(16);
  });

  it('quello che c’era prima del suo passaggio non c’è più', () => {
    const now = at(11, 12);
    const raw = {
      a: { k: 'bag', t: at(8, 20) },
      b: { k: 'clip', t: at(10, 9) },
      c: { k: 'boh', t: at(10, 9) },
      d: { k: 'bag', t: at(10, 10) },
    };
    expect(Object.keys(liveTrash(raw, now))).toEqual(['b', 'd']);
    expect(sweptKeys(raw, now).sort()).toEqual(['a', 'c']);
    expect(liveTrash(null, now)).toEqual({});
  });
});

describe('le prove', () => {
  it('si contano e si descrivono in italiano', () => {
    const n = countKinds([{ k: 'bag' }, { k: 'bag' }, { k: 'clip' }]);
    expect(n).toEqual({ bag: 2, clip: 1 });
    expect(describeKinds(n)).toBe('2 bustine per lo spaccio vuote e 1 graffetta per scassinare');
    expect(describeKinds({ bag: 1, clip: 0 })).toBe('1 bustina per lo spaccio vuota');
    expect(describeKinds({ bag: 0, clip: 0 })).toBe('');
  });

  it('una multa per prova: 50 Đ la bustina, 100 Đ la graffetta', () => {
    expect(fineFor('bag', 3)).toBe(150);
    expect(fineFor('clip', 2)).toBe(200);
  });

  it('metà a chi denuncia, il resto alla cassa (i centesimi alla polizia)', () => {
    expect(splitFine(100)).toEqual({ reporter: 50, police: 50 });
    expect(splitFine(75)).toEqual({ reporter: 37, police: 38 });
    expect(splitFine(1)).toEqual({ reporter: 0, police: 1 });
  });

  it('si raggruppano per colpevole e tipo, solo quelle del condominio in cui si è', () => {
    const p = (k: 'bag' | 'clip', who: string, w = 'CASA-0001') => ({
      k,
      who,
      name: who.slice(7),
      w,
      t: 1,
    });
    const groups = groupProofs(
      [
        p('bag', 'player_ada1'),
        p('bag', 'player_ada1'),
        p('clip', 'player_ada1'),
        p('bag', 'player_bea1'),
        p('bag', 'player_bea1', 'CASA-X92K'),
      ],
      'CASA-0001',
    );
    expect(groups).toEqual([
      { who: 'player_ada1', name: 'ada1', k: 'bag', n: 2, amount: 100 },
      { who: 'player_ada1', name: 'ada1', k: 'clip', n: 1, amount: 100 },
      { who: 'player_bea1', name: 'bea1', k: 'bag', n: 1, amount: 50 },
    ]);
  });
});

describe('multe da pagare', () => {
  it('si leggono solo se i conti tornano', () => {
    const ok = { k: 'bag', n: 2, amt: 100, paid: 30, to: 'player_ada1', t: 5 };
    expect(decodeFine(ok)).toEqual(ok);
    expect(decodeFine({ ...ok, amt: 90 })).toBeNull();
    expect(decodeFine({ ...ok, paid: 120 })).toBeNull();
    expect(decodeFine({ ...ok, k: 'clip' })).toBeNull();
    expect(decodeFine(null)).toBeNull();
  });

  it('il debito si paga dalla cassaforte, poi dalla banca, fin dove si arriva', () => {
    expect(payable(80, 100, 0)).toEqual({ pay: 80, fromBank: 0 });
    expect(payable(80, 30, 500)).toEqual({ pay: 80, fromBank: 50 });
    expect(payable(80, 10, 20)).toEqual({ pay: 30, fromBank: 20 });
    expect(payable(80, 0, 0)).toEqual({ pay: 0, fromBank: 0 });
  });
});

describe('salvataggio', () => {
  it('tiene posto scelto, ultimo svuotamento e prove valide', () => {
    const proof = { k: 'clip', who: 'player_ada1', name: 'Ada', w: 'CASA-0001', t: 3 };
    expect(
      decodeTrashSave({ placed: true, emptied: '2026-11-11', proofs: [proof, { k: 'x' }] }),
    ).toEqual({ placed: true, emptied: '2026-11-11', proofs: [proof] });
    expect(decodeTrashSave(undefined)).toEqual({});
    const many = Array.from({ length: MAX_PROOFS + 5 }, (_, i) => ({ ...proof, t: i }));
    expect(decodeTrashSave({ proofs: many }).proofs).toHaveLength(MAX_PROOFS);
  });
});
