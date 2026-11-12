import { describe, expect, it } from 'vitest';
// @ts-expect-error lo strumento di verifica è JavaScript
import { runtimeSpecifiers, cyclicEdges, newCyclicEdges } from '../scripts/dependency-cycles.mjs';

describe('controllo delle dipendenze circolari', () => {
  it('ignora i tipi, include import misti, effetti collaterali ed esportazioni a esecuzione', () => {
    expect(
      runtimeSpecifiers(`
      import type { A } from './a.js';
      import { type B } from './b.js';
      import { type C, run } from './c.js';
      import './effects.js';
      export type { D } from './d.js';
      export { type E } from './e.js';
      export { value } from './value.js';
      export * from './all.js';
      const lazy = () => import('./lazy.js');
    `),
    ).toEqual(['./c.js', './effects.js', './value.js', './all.js']);
  });

  it('non considera cicliche le catene senza ritorno', () => {
    expect(
      cyclicEdges(
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', []],
        ]),
      ),
    ).toEqual([]);
  });

  it('trova i cicli senza includere le dipendenze esterne al ciclo', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['a', 'c']],
      ['c', []],
      ['self', ['self']],
    ]);
    expect(cyclicEdges(graph)).toEqual(['a -> b', 'b -> a', 'self -> self']);
  });

  it('rileva nuovi archi anche dentro un gruppo già ciclico', () => {
    const old = cyclicEdges(
      new Map([
        ['a', ['b']],
        ['b', ['c']],
        ['c', ['a']],
      ]),
    );
    const now = cyclicEdges(
      new Map([
        ['a', ['b', 'c']],
        ['b', ['c']],
        ['c', ['a']],
      ]),
    );
    expect(newCyclicEdges(now, old)).toEqual(['a -> c']);
  });

  it('permette di eliminare cicli senza aumentare il limite', () => {
    expect(newCyclicEdges([], ['a -> b', 'b -> a'])).toEqual([]);
    expect(newCyclicEdges(['a -> b'], ['a -> b', 'b -> a'])).toEqual([]);
  });
});
