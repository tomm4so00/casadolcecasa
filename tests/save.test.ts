import { describe, expect, it } from 'vitest';
import { decodeSaveV8, importRefactoredSave } from '../src/game/save-model.js';
import { MemoryStorage } from './helpers.js';

describe('compatibilità salvataggi', () => {
  it('legge v8 mantenendo acquisti, carriera, investimenti, corpo e sonno', () => {
    const data = {
      v: 8,
      savedAt: 123,
      nick: 'Marco',
      healthLevel: 80,
      sleepLevel: 40,
      sleeping: true,
      ownedItems: { item_hoodie: true },
      ownedFurniture: { bed_lux: true },
      jobExperience: { ufficio: 8 },
      invest: { shop: { units: 2, cost: 100 } },
      body: '1,2,3',
    };
    expect(decodeSaveV8(data)).toEqual(data);
  });
  it('accetta i vecchi salvataggi parziali senza inventare campi assenti', () => {
    expect(decodeSaveV8({ savedAt: 123, healthLevel: 50 })).toEqual({
      savedAt: 123,
      healthLevel: 50,
    });
  });
  it('rifiuta versioni future e valori corrotti che romperebbero il gioco', () => {
    for (const value of [
      null,
      {},
      { v: 99, savedAt: 123 },
      { v: 8, savedAt: NaN },
      { v: 8, savedAt: 1, healthLevel: 200 },
      { v: 8, savedAt: 1, furniturePos: { bed: { x: 'bad', y: 0 } } },
      { v: 8, savedAt: 1, invest: { shop: { units: -1, cost: 2 } } },
    ])
      expect(decodeSaveV8(value)).toBeNull();
  });
  it('importa il formato TypeScript v2 e conserva gli originali', () => {
    const storage = new MemoryStorage();
    const data = {
      version: 2,
      savedAt: 123,
      nick: 'Importato',
      needs: { health: 80, sleep: 40, hunger: 70, hygiene: 60, happiness: 90, money: 25 },
      inventory: { hasFood: true, foodCooked: false },
      furniture: { bed: { x: -80, y: -70 } },
      isSleeping: true,
    };
    storage.setItem(
      'casadolcecasa.save.v2.guest',
      JSON.stringify({ data, baseRevision: 0, pending: false }),
    );
    expect(importRefactoredSave(storage, 'offline_')).toBe(true);
    const result = JSON.parse(storage.getItem('offline_sims_save_v1')!);
    expect(result).toMatchObject({
      v: 8,
      healthLevel: 80,
      sleepLevel: 40,
      moneyLevel: 25,
      vaultOnly: false,
      sleeping: true,
      furniturePos: { base_bed: { x: -80, y: -70 } },
      inventory: { hasFood: true },
    });
    expect(storage.getItem('casadolcecasa.save.v2.guest')).not.toBeNull();
  });
  it('non sovrascrive mai un salvataggio v8 esistente', () => {
    const storage = new MemoryStorage();
    storage.setItem('offline_sims_save_v1', '{"v":8,"savedAt":123}');
    storage.setItem('casadolcecasa.save.v1', '{"savedAt":1}');
    expect(importRefactoredSave(storage, 'offline_')).toBe(false);
    expect(storage.getItem('offline_sims_save_v1')).toBe('{"v":8,"savedAt":123}');
  });
});
