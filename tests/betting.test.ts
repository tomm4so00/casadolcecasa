import { describe, expect, it } from 'vitest';
import {
  RPS_MAX_BET,
  RPS_MIN_BET,
  SLOT_BET,
  reelSymbol,
  rpsBetError,
  rpsWinner,
  slotReturnRate,
  slotWin,
} from '../src/game/betting-rules.js';

describe('slot', () => {
  it('paga tre simboli uguali e alcune coppie', () => {
    expect(slotWin(['seven', 'seven', 'seven'])).toBe(SLOT_BET * 300);
    expect(slotWin(['cherry', 'cherry', 'cherry'])).toBe(25);
    expect(slotWin(['cherry', 'lemon', 'cherry'])).toBe(5);
    expect(slotWin(['bell', 'diamond', 'diamond'])).toBe(10);
    expect(slotWin(['lemon', 'lemon', 'bell'])).toBe(0);
    expect(slotWin(['cherry', 'lemon', 'bell'])).toBe(0);
  });

  it('in media restituisce meno di quanto si gioca, ma non troppo meno', () => {
    const rate = slotReturnRate();
    expect(rate).toBeGreaterThan(0.8);
    expect(rate).toBeLessThan(0.95);
  });

  it('i simboli rari escono più di rado', () => {
    expect(reelSymbol(0)).toBe('cherry');
    expect(reelSymbol(0.999)).toBe('seven');
    expect(reelSymbol(0.5)).toBe('lemon');
  });
});

describe('morra cinese', () => {
  it('sasso batte forbici, forbici batte carta, carta batte sasso', () => {
    expect(rpsWinner('rock', 'scissors')).toBe('a');
    expect(rpsWinner('scissors', 'paper')).toBe('a');
    expect(rpsWinner('paper', 'rock')).toBe('a');
    expect(rpsWinner('rock', 'paper')).toBe('b');
    expect(rpsWinner('paper', 'paper')).toBeNull();
  });

  it('controlla la puntata', () => {
    expect(rpsBetError(50, 100)).toBeNull();
    expect(rpsBetError(RPS_MIN_BET - 1, 100)).toMatch(/da 10/);
    expect(rpsBetError(RPS_MAX_BET + 1, 10000)).toMatch(/500/);
    expect(rpsBetError(200, 100)).toMatch(/abbastanza/);
    expect(rpsBetError(12.5, 100)).toMatch(/intero/);
  });
});
