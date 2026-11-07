import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  CODE_RED,
  codeRedAt,
  codeRedBonus,
  codeRedPenalty,
  droppedForDefib,
  ACTION_IDS,
  STATIONS,
  STATION_IDS,
  canUseStation,
  choicesAtBed,
  handsAfterCare,
  needFor,
  rightCare,
} from '../src/game/hospital-rules';

describe('turno in ospedale', () => {
  it('quattro postazioni: monitor e farmaci in mano, i due carrelli si spingono', () => {
    expect(STATION_IDS).toEqual(['monitor', 'farmaci', 'medicazioni', 'biancheria']);
    expect(STATIONS.monitor.flow).toBe('hand');
    expect(STATIONS.farmaci.flow).toBe('hand');
    expect(STATIONS.medicazioni.flow).toBe('cart');
    expect(STATIONS.biancheria.flow).toBe('cart');
  });

  it('ogni azione appartiene alla sua postazione', () => {
    expect(STATIONS.monitor.actions).toEqual(['temperatura', 'pressione', 'saturazione']);
    expect(STATIONS.farmaci.actions).toEqual(['antibiotico', 'antidolorifico', 'vaccino']);
    expect(STATIONS.medicazioni.actions).toEqual(['cerotto', 'medicazione']);
    expect(STATIONS.biancheria.actions).toEqual(['igiene', 'lenzuola']);
    for (const st of STATION_IDS)
      for (const a of STATIONS[st].actions) expect(ACTIONS[a].station).toBe(st);
    expect(ACTION_IDS).toHaveLength(10);
  });

  it('i due pazienti non chiedono mai la stessa cosa', () => {
    for (let i = 0; i <= 20; i++) {
      const r = i / 20;
      for (const other of ACTION_IDS) expect(needFor(r, [other])).not.toBe(other);
    }
    // r agli estremi resta dentro l'elenco
    expect(ACTION_IDS).toContain(needFor(1, []));
    expect(ACTION_IDS).toContain(needFor(-1, []));
  });

  it('al letto si sceglie tra le voci di quello che si ha', () => {
    expect(choicesAtBed({ kind: 'empty' })).toEqual([]);
    expect(choicesAtBed({ kind: 'monitor' })).toEqual(STATIONS.monitor.actions);
    expect(choicesAtBed({ kind: 'drug', drug: 'vaccino' })).toEqual(['vaccino']);
    expect(choicesAtBed({ kind: 'cart', station: 'biancheria' })).toEqual(['igiene', 'lenzuola']);
  });

  it('con le mani occupate si può solo rimettere a posto quello che si ha', () => {
    for (const st of STATION_IDS) expect(canUseStation({ kind: 'empty' }, st)).toBe(true);
    expect(canUseStation({ kind: 'monitor' }, 'monitor')).toBe(true);
    expect(canUseStation({ kind: 'monitor' }, 'farmaci')).toBe(false);
    expect(canUseStation({ kind: 'drug', drug: 'antibiotico' }, 'farmaci')).toBe(true);
    expect(canUseStation({ kind: 'drug', drug: 'antibiotico' }, 'medicazioni')).toBe(false);
    for (const st of STATION_IDS)
      expect(canUseStation({ kind: 'cart', station: 'medicazioni' }, st)).toBe(false);
  });

  it('dopo la cura il farmaco è dato, il monitor resta in mano, il carrello resta al letto', () => {
    expect(handsAfterCare({ kind: 'drug', drug: 'vaccino' })).toEqual({ kind: 'empty' });
    expect(handsAfterCare({ kind: 'monitor' })).toEqual({ kind: 'monitor' });
    expect(handsAfterCare({ kind: 'cart', station: 'biancheria' })).toEqual({ kind: 'empty' });
  });

  it('va bene solo la cura che il paziente aspetta', () => {
    expect(rightCare('temperatura', 'temperatura')).toBe(true);
    expect(rightCare('temperatura', 'pressione')).toBe(false);
    expect(rightCare(null, 'cerotto')).toBe(false);
  });

  it('codice rosso: il 35% delle volte, tra il secondo 30 e il 60, con 5 secondi per la scarica', () => {
    expect(CODE_RED).toEqual({ from: 30, to: 60, chance: 0.35, seconds: 5 });
    expect(codeRedAt(0.34, 0)).toBe(30);
    expect(codeRedAt(0, 1)).toBe(60);
    expect(codeRedAt(0.1, 0.5)).toBe(45);
    expect(codeRedAt(0.35, 0.5)).toBeNull();
    expect(codeRedAt(0.9, 0.5)).toBeNull();
    // su tanti turni scatta circa una volta su tre
    let n = 0;
    for (let i = 0; i < 1000; i++) if (codeRedAt(i / 1000, 0.5) !== null) n++;
    expect(n).toBe(350);
  });

  it('salvato: il doppio di una cura; tempo scaduto: si perde una cura', () => {
    expect(codeRedBonus(6)).toBe(12);
    expect(codeRedPenalty(6)).toBe(6);
  });

  it('il defibrillatore si prende anche con le mani occupate: quello che si ha si posa', () => {
    expect(droppedForDefib({ kind: 'empty' })).toBeNull();
    expect(droppedForDefib({ kind: 'monitor' })).toBe('monitor');
    expect(droppedForDefib({ kind: 'drug', drug: 'vaccino' })).toBe('drug');
    expect(droppedForDefib({ kind: 'cart', station: 'biancheria' })).toBe('cart');
    // con il defibrillatore in mano le altre postazioni non si usano
    for (const st of STATION_IDS) expect(canUseStation({ kind: 'defib' }, st)).toBe(false);
    expect(handsAfterCare({ kind: 'defib' })).toEqual({ kind: 'defib' });
  });
});
