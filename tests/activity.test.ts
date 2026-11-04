import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CAP,
  ACTIVITY_WEIGHT,
  DAY_MS,
  type ActivityLog,
  activityTarget,
  dayActivity,
  dayOf,
  nextActivity,
} from '../shared/activity.js';
import { advanceMarket, BUSINESSES, MARKET_EPOCH, RETIRED_BUSINESSES } from '../shared/market.js';
import { cleanOldActivity, retireBusinesses } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = MARKET_EPOCH + 40 * DAY_MS + 12 * 3600_000; // a mezzogiorno
const TODAY = dayOf(NOW);

/** `per` giocatori con `n` azioni ciascuno, in un giorno. */
function day(log: ActivityLog, d: number, business: string, players: number, n: number) {
  const rows: Record<string, unknown> = {};
  for (let p = 0; p < players; p++) rows['player_p' + p] = { n, t: d * DAY_MS + 3600_000 };
  (log[d] ??= {})[business] = rows;
}
/** Una settimana normale: 5 giocatori al giorno con 2 azioni ciascuno (10 al giorno). */
function usualWeek(business = 'games'): ActivityLog {
  const log: ActivityLog = {};
  for (let d = TODAY - 8; d <= TODAY - 2; d++) day(log, d, business, 5, 2);
  return log;
}

describe('borsa legata al gioco', () => {
  it('ogni giocatore conta al massimo ACTIVITY_CAP azioni, e solo nel giorno in cui ha scritto', () => {
    const log: ActivityLog = {
      [TODAY]: {
        games: {
          player_a: { n: 500, t: NOW },
          player_b: { n: 3, t: NOW },
          player_c: { n: 9, t: NOW + 2 * DAY_MS }, // data falsa: non conta
          player_d: { n: 'tante', t: NOW },
        },
      },
    };
    expect(dayActivity(log, TODAY, 'games')).toBe(ACTIVITY_CAP + 3);
  });

  it('senza una settimana di storia non c’è nessuna spinta', () => {
    const log: ActivityLog = {};
    day(log, TODAY, 'games', 30, 5);
    expect(activityTarget(log, 'games', NOW)).toBe(0);
  });

  it('più attività del solito spinge su, meno attività spinge giù, con un massimo', () => {
    const busy = usualWeek();
    day(busy, TODAY - 1, 'games', 10, 2); // ieri il doppio
    day(busy, TODAY, 'games', 10, 1);
    expect(activityTarget(busy, 'games', NOW)).toBeGreaterThan(0.05);

    const quiet = usualWeek();
    expect(activityTarget(quiet, 'games', NOW)).toBeLessThan(-0.05);

    const crazy = usualWeek();
    day(crazy, TODAY, 'games', 200, 10);
    expect(activityTarget(crazy, 'games', NOW)).toBeCloseTo(ACTIVITY_WEIGHT);

    // un'attività non c'entra con l'altra
    expect(activityTarget(busy, 'pizza', NOW)).toBe(0);
  });

  it('la spinta si avvicina piano all’obiettivo', () => {
    let act = 0;
    for (let i = 0; i < 5; i++) act = nextActivity(act, 0.1);
    expect(act).toBeGreaterThan(0.03);
    expect(act).toBeLessThan(0.1);
    expect(nextActivity(undefined, 0)).toBe(0);
  });

  it('la quotazione sale con la spinta dell’attività', () => {
    const start = advanceMarket(null, NOW, () => 0)!;
    const later = NOW + 15 * 60_000;
    const flat = advanceMarket(start, later, () => 0, undefined, undefined, { games: 0 })!;
    const pushed = advanceMarket(start, later, () => 0, undefined, undefined, { games: 0.1 })!;
    expect(pushed.quotes.games.act).toBeGreaterThan(0);
    expect(pushed.quotes.games.price).toBeGreaterThan(flat.quotes.games.price);
    // le altre attività non si muovono
    expect(pushed.quotes.pizza.price).toBe(flat.quotes.pizza.price);
  });

  it('il server cancella i giorni che non servono più', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    for (const d of [TODAY - 20, TODAY - 9, TODAY - 8, TODAY])
      await db.ref(`sims_activity/${d}/games/player_a`).set({ n: 1, t: d * DAY_MS });
    expect(await cleanOldActivity(db, NOW)).toBe(2);
    expect(Object.keys((await db.ref('sims_activity').get()).val()).sort()).toEqual(
      [TODAY - 8, TODAY].map(String),
    );
  });

  it('il database: ognuno scrive solo i propri contatori, con l’ora vera', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const row = r.sims_activity.$day.$biz.$pid;
    expect(row['.write']).toContain('=== $pid');
    expect(row['.read']).toContain('=== $pid');
    expect(row.t['.validate']).toContain('now - 600000');
    expect(row.$other['.validate']).toBe(false);
  });
});

describe('Antiquariato al posto delle Auto elettriche', () => {
  it('in borsa c’è l’Antiquariato e non più le Auto elettriche', () => {
    const ids = BUSINESSES.map((b) => b.id as string);
    expect(ids).toContain('antiques');
    expect(ids).not.toContain('ev');
    expect(RETIRED_BUSINESSES.ev.name).toBe('Auto elettriche');
    // la nuova attività nasce al primo aggiornamento, con la sua storia
    const start = advanceMarket(null, NOW, () => 0)!;
    delete (start.quotes as Record<string, unknown>).antiques;
    const next = advanceMarket(start, NOW + 15 * 60_000, () => 0)!;
    expect(next.quotes.antiques.price).toBeGreaterThan(0);
  });

  it('chi aveva quote di Auto elettriche le ritrova in cassaforte, una volta sola', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_market/quotes/ev').set({ price: 150, log: 0, history: {} });
    await db.ref('sims_rooms_state').set([
      {
        id: 1,
        ownerId: 'player_anna',
        vaultMoney: 100,
        economy: {
          version: 1,
          invest: { ev: { units: 2, cost: 250 }, pizza: { units: 1, cost: 90 } },
        },
      },
      { id: 2, ownerId: 'player_luca', vaultMoney: 5, economy: { version: 1, invest: {} } },
    ]);
    expect(await retireBusinesses(db, NOW)).toBe(1);
    const anna = (await db.ref('sims_rooms_state/0').get()).val();
    expect(anna.vaultMoney).toBe(400);
    expect(anna.economy.invest).toEqual({ pizza: { units: 1, cost: 90 } });
    expect((await db.ref('sims_rooms_state/1/vaultMoney').get()).val()).toBe(5);
    const notes = Object.values((await db.ref('sims_interactions/player_anna').get()).val());
    expect(notes).toEqual([expect.objectContaining({ type: 'bizRetired', biz: 'ev', amt: 300 })]);
    // al giro dopo non c'è più niente da pagare
    expect(await retireBusinesses(db, NOW + 1)).toBe(0);
    expect((await db.ref('sims_rooms_state/0/vaultMoney').get()).val()).toBe(400);
  });

  it('senza quotazione si restituisce quanto era stato versato', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_rooms_state').set([
      {
        id: 1,
        ownerId: 'player_anna',
        vaultMoney: 0,
        economy: { invest: { ev: { units: 3, cost: 120 } } },
      },
    ]);
    expect(await retireBusinesses(db, NOW)).toBe(1);
    expect((await db.ref('sims_rooms_state/0/vaultMoney').get()).val()).toBe(120);
  });

  it('il database accetta l’Antiquariato nei contatori, negli investimenti e il nuovo avviso', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    expect(r.sims_activity.$day.$biz.$pid['.validate']).toContain('|antiques|');
    expect(r.sims_activity.$day.$biz.$pid['.validate']).not.toContain('|ev|');
    expect(r.sims_rooms_state.$room.economy.invest.antiques).toBeDefined();
    expect(r.sims_interactions.$pid.$key['.validate']).toContain('|bizRetired');
  });
});
