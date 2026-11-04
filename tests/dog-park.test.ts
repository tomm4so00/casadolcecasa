import { describe, expect, it } from 'vitest';
import {
  DOG_GATE,
  DOG_PARK,
  GATE_INSIDE,
  GATE_OUTSIDE,
  TRAIN_DOG_SPOT,
  TRAIN_SPOT,
  bounceOffPark,
  clampToPark,
  dogParkFence,
  inDogPark,
  nextDogMode,
  parkSpot,
} from '../src/game/dog-park-rules';

describe('area cani del parco', () => {
  it('il cancello porta da fuori a dentro il recinto', () => {
    expect(inDogPark(GATE_OUTSIDE.x, GATE_OUTSIDE.y)).toBe(false);
    expect(inDogPark(GATE_INSIDE.x, GATE_INSIDE.y)).toBe(true);
  });

  it('il recinto sta dentro il parco (400×360) e lontano dalla fontana', () => {
    expect(DOG_PARK.x1).toBeLessThan(200);
    expect(DOG_PARK.y0).toBeGreaterThan(-180);
    // fontana 70×70 al centro: tra lei e il recinto passa un giocatore (raggio 9)
    expect(DOG_PARK.x0 - 35).toBeGreaterThanOrEqual(18);
    expect(-35 - DOG_PARK.y1).toBeGreaterThanOrEqual(18);
  });

  it('entrando si slega il cane, col fischio torna e si rimette il guinzaglio', () => {
    expect(nextDogMode('leash', false, false)).toBe('leash');
    expect(nextDogMode('leash', true, false)).toBe('free');
    expect(nextDogMode('free', true, false)).toBe('free');
    expect(nextDogMode('called', true, false)).toBe('called');
    expect(nextDogMode('called', true, true)).toBe('leash');
    // tornati a casa con il cane libero: è di nuovo al guinzaglio
    expect(nextDogMode('free', false, false)).toBe('leash');
  });

  it('la staccionata chiude il recinto tranne il cancello', () => {
    const fence = dogParkFence();
    const blocks = (x: number, y: number) =>
      fence.some((f) => Math.abs(x - f.x) <= f.w / 2 + 0.01 && Math.abs(y - f.y) <= f.h / 2 + 0.01);
    // ogni lato è coperto da un capo all'altro
    for (let x = DOG_PARK.x0; x <= DOG_PARK.x1; x += 2) expect(blocks(x, DOG_PARK.y0)).toBe(true);
    for (let y = DOG_PARK.y0; y <= DOG_PARK.y1; y += 2) {
      expect(blocks(DOG_PARK.x0, y)).toBe(true);
      expect(blocks(DOG_PARK.x1, y)).toBe(true);
    }
    // davanti si passa solo dal cancello
    for (let x = DOG_PARK.x0; x <= DOG_PARK.x1; x += 2) {
      const inGate = Math.abs(x - DOG_GATE.x) < DOG_GATE.w / 2 - 0.5;
      expect(blocks(x, DOG_PARK.y1)).toBe(!inGate);
    }
    // pezzi corti, per l'ordine in profondità
    for (const f of fence) expect(Math.max(f.w, f.h)).toBeLessThan(30);
  });

  it("l'addestramento si fa dentro il recinto, lontano dal pulsante del cancello", () => {
    expect(inDogPark(TRAIN_SPOT.x, TRAIN_SPOT.y, -20)).toBe(true);
    expect(inDogPark(TRAIN_DOG_SPOT.x, TRAIN_DOG_SPOT.y, -12)).toBe(true);
    // i pulsanti compaiono entro 65 dall'oggetto (checkProximity)
    expect(Math.hypot(TRAIN_SPOT.x - DOG_GATE.x, TRAIN_SPOT.y - DOG_GATE.y)).toBeGreaterThan(65);
  });

  it('il cane libero resta dentro il recinto', () => {
    for (const r of [0, 0.5, 1])
      expect(inDogPark(parkSpot(r, 1 - r).x, parkSpot(r, 1 - r).y)).toBe(true);
    const c = clampToPark(500, -500);
    expect(inDogPark(c.x, c.y)).toBe(true);
  });

  it('i passanti rimbalzano sul recinto', () => {
    // arriva da sinistra: si gira solo in orizzontale
    const left = bounceOffPark(30, -100, 41, -100, 25, 10);
    expect(left).toEqual({ vx: -25, vy: 10, hit: true });
    // arriva da davanti
    const front = bounceOffPark(120, -30, 120, -41, 5, -20);
    expect(front).toEqual({ vx: 5, vy: 20, hit: true });
    // lontano dal recinto non cambia niente
    expect(bounceOffPark(-50, 50, -49, 51, 1, 1).hit).toBe(false);
    // partito da dentro: va verso il bordo più vicino
    const inside = bounceOffPark(60, -60, 61, -61, 10, -10);
    expect(inside.vx).toBeLessThan(0);
    expect(inside.vy).toBeGreaterThan(0);
  });
});
