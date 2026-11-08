import { describe, expect, it } from 'vitest';
import {
  BETTING_FURNITURE,
  CLOTHES_STORE_FURNITURE,
  COLLECT_SHOP_FURNITURE,
  GROWSHOP_FURNITURE,
  PETSHOP_FURNITURE,
  SHOP_CLERK_LINES,
  SIMULATION_BOTS,
  STORE_FLOOR_FURNITURE,
  USED_SHOP_FURNITURE,
} from '../src/game/data/catalogues.js';

// i mobili di ogni negozio con il suo bancone
const SHOPS: Record<string, Record<string, { x: number; y: number }>> = {
  negozio_mobili: STORE_FLOOR_FURNITURE,
  negozio_vestiti: CLOTHES_STORE_FURNITURE,
  negozio_animali: PETSHOP_FURNITURE,
  growshop: GROWSHOP_FURNITURE,
  collezionismo: COLLECT_SHOP_FURNITURE,
  usato: USED_SHOP_FURNITURE,
  // la croupier dietro il tavolo della roulette
  scommesse: BETTING_FURNITURE,
};

describe('commessi dei negozi', () => {
  const clerks = SIMULATION_BOTS.filter((b) => 'clerk' in b && b.clerk);

  it('ogni negozio del centro commerciale ha un commesso (la sala scommesse la croupier), con le sue frasi', () => {
    expect(clerks.map((c) => c.env).sort()).toEqual(Object.keys(SHOPS).sort());
    for (const c of clerks) expect(SHOP_CLERK_LINES[c.env]?.length).toBeGreaterThan(0);
  });

  it('i commessi stanno fermi, appena dietro il bancone', () => {
    for (const c of clerks) {
      expect(c.vx).toBe(0);
      expect(c.vy).toBe(0);
      const counter = Object.entries(SHOPS[c.env]).find(([k]) =>
        /Counter$|^rouletteTable$/.test(k),
      )?.[1];
      expect(counter, c.env).toBeDefined();
      // dietro = più verso il fondo (y più piccola), e vicino
      expect(c.y).toBeLessThan(counter!.y);
      expect(Math.hypot(c.x - counter!.x, c.y - counter!.y)).toBeLessThan(45);
    }
  });
});
