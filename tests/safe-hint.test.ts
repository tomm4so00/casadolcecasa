import { describe, expect, it } from 'vitest';
import { safeHint } from '../worker/src/safe-hint.js';
import { hackerDay } from '../shared/hacker-rules.js';
import { hashPin } from '../shared/safe-pin-rules.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

// un giorno qualsiasi: l'attacco di Zero comincia a un'ora che dipende dalla data
const DAY = Date.UTC(2026, 10, 15, 9, 0, 0);
const ATTACK = hackerDay(DAY).startAt + 60_000;
const ROOM = { world: 'CASA-0001', room: 4 };

async function world(now: number) {
  const db = localDatabase(new Lifetime(), new MemoryStorage());
  await db.ref('sims_accounts/u_ladro').set({ playerId: 'p_ladro' });
  await db.ref('sims_sessions/p_ladro').set({ id: 's', expiresAt: now + 40_000 });
  await db
    .ref('sims_rooms_state/4')
    .set({ id: 5, ownerId: 'p_anna', pinSet: true, vaultMoney: 80 });
  await db.ref('sims_safe_pins/p_anna').set(hashPin('352', 'p_anna'));
  return db;
}

describe('Worker: l’indizio di Zero', () => {
  it('durante l’attacco dice la prima cifra del PIN privato, e nient’altro', async () => {
    const db = await world(ATTACK);
    expect(await safeHint(db, 'u_ladro', ROOM, ATTACK)).toEqual({
      status: 200,
      body: { ok: true, digit: '3' },
    });
  });

  it('fuori dall’attacco non dice niente', async () => {
    const before = hackerDay(DAY).startAt - 60_000;
    const db = await world(before);
    expect(await safeHint(db, 'u_ladro', ROOM, before)).toMatchObject({
      status: 403,
      body: { error: 'zero' },
    });
  });

  it('non per la propria cassaforte, né per una stanza vuota o senza PIN', async () => {
    const db = await world(ATTACK);
    await db.ref('sims_accounts/u_anna').set({ playerId: 'p_anna' });
    await db.ref('sims_sessions/p_anna').set({ id: 's', expiresAt: ATTACK + 40_000 });
    expect((await safeHint(db, 'u_anna', ROOM, ATTACK)).status).toBe(400);
    expect((await safeHint(db, 'u_ladro', { ...ROOM, room: 9 }, ATTACK)).status).toBe(400);
    await db.ref('sims_safe_pins/p_anna').remove();
    expect((await safeHint(db, 'u_ladro', ROOM, ATTACK)).body).toEqual({ ok: true, digit: '' });
    expect((await safeHint(db, 'u_ladro', { ...ROOM, room: 64 }, ATTACK)).status).toBe(400);
  });
});
