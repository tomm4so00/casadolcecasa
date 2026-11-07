import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXHIBIT_LIMIT,
  EXPIRE_AFTER_MS,
  expiryNotice,
  expiryPlan,
  readExpiryAuctions,
} from '../shared/auction-expiry.js';

/** `n` aste di pittori che abitano nel condominio: la i-esima ha i cuoricini di `votes(i)`. */
function many(n: number, votes: (i: number) => number = () => 0) {
  const raw: Record<string, unknown> = {};
  for (let i = 0; i < n; i++)
    raw['q' + String(i).padStart(4, '0')] = {
      by: 'player_p' + (i % 5),
      t: 1000 + i,
      votes: Object.fromEntries(Array.from({ length: votes(i) }, (_, k) => ['player_v' + k, 1])),
    };
  return raw;
}
const here = new Set(['player_p0', 'player_p1', 'player_p2', 'player_p3', 'player_p4']);

describe('spazio espositivo delle aste', () => {
  it('fino a 128 quadri esposti nessun timer', () => {
    expect(expiryPlan(readExpiryAuctions(many(EXHIBIT_LIMIT)), here, 5).start).toEqual([]);
  });

  it('oltre la soglia: prima i quadri con meno cuoricini, a parità i più vecchi', () => {
    // 131 quadri: i primi 10 hanno 3 cuoricini, gli altri 1, tranne due recenti senza
    const raw = many(EXHIBIT_LIMIT + 3, (i) => (i < 10 ? 3 : i === 120 || i === 125 ? 0 : 1));
    const { start } = expiryPlan(readExpiryAuctions(raw), here, 5);
    // i due senza cuoricini (anche se recenti), poi il più vecchio con un cuoricino
    expect(start).toEqual(['q0120', 'q0125', 'q0010']);
  });

  it('i quadri già col timer, venduti o di chi non abita qui non contano', () => {
    const raw = many(EXHIBIT_LIMIT + 2);
    (raw.q0000 as Record<string, unknown>).expiresAt = 9e15;
    (raw.q0001 as Record<string, unknown>).sold = { to: 'x', amt: 1, t: 1 };
    expect(expiryPlan(readExpiryAuctions(raw), here, 5).start).toEqual([]);
    raw.q9999 = { by: 'player_trasferito', t: 1, votes: {} };
    expect(expiryPlan(readExpiryAuctions(raw), here, 5).start).toEqual([]);
  });

  it('allo scadere il quadro si butta, ma non se intanto è stato venduto', () => {
    const raw = {
      qa: { by: 'player_p0', t: 1, expiresAt: 100 },
      qb: { by: 'player_p0', t: 1, expiresAt: 100, sold: { to: 'x', amt: 5, t: 2 } },
      qc: { by: 'player_p0', t: 1, expiresAt: 500 },
    };
    expect(expiryPlan(readExpiryAuctions(raw), here, 100).remove).toEqual(['qa']);
  });

  it('il pittore non conta come cuoricino; il timer dura 7 giorni', () => {
    const [a] = readExpiryAuctions({
      qa: { by: 'player_p0', t: 1, votes: { player_p0: 1, x: 1 } },
    });
    expect(a.votes).toBe(1);
    expect(EXPIRE_AFTER_MS).toBe(7 * 24 * 3600 * 1000);
    expect(expiryNotice('Notte').body).toContain('«Notte»');
    expect(expiryNotice(null).body).toMatch(/appenderlo in camera o buttarlo/);
  });

  it('le regole: il timer lo mette solo il server, che butta i quadri scaduti', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const a = r.sims_auctions.$id;
    expect(a.expiresAt['.write']).toBe("auth != null && auth.uid === 'market-publisher'");
    expect(a['.write']).toContain(
      "auth.uid === 'market-publisher' && data.exists() && !newData.exists()",
    );
    // aprendo l'asta non si può darle una scadenza più lontana di 7 giorni
    expect(a['.write']).toContain("newData.child('expiresAt').val() <= now + 604800000");
  });
});

describe('il server e lo spazio espositivo', () => {
  it('fa partire il timer, avvisa il pittore sul telefono e butta i quadri scaduti', async () => {
    const { expireAuctions } = await import('../server/src/auctions.js');
    const { localDatabase } = await import('../src/game/database.js');
    const { Lifetime } = await import('../src/game/lifetime.js');
    const { MemoryStorage } = await import('./helpers.js');
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    const now = Date.UTC(2026, 10, 7, 12);
    const auctions = many(EXHIBIT_LIMIT + 1, (i) => (i === 0 ? 0 : 1));
    auctions.qold = { by: 'player_p1', t: 1, expiresAt: now - 1, votes: {} };
    await db.ref('sims_auctions').set(auctions);
    await db
      .ref('sims_rooms_state')
      .set([...here].map((ownerId, i) => ({ id: i + 1, ownerId, vaultMoney: 0 })));
    await db.ref('sims_push/player_p0/tokens/t1').set({ token: 'tok' });
    await db.ref('sims_painting_titles/q0000').set({ title: 'Alba', by: 'player_p0', t: 1 });
    const sent: { token: string; title: string; body: string }[] = [];
    const result = await expireAuctions(db, now, async (token, m) => {
      sent.push({ token, title: m.title, body: m.body });
      return 'sent';
    });
    expect(result).toEqual({ started: 1, removed: 1 });
    expect((await db.ref('sims_auctions/q0000/expiresAt').get()).val()).toBe(now + EXPIRE_AFTER_MS);
    expect((await db.ref('sims_auctions/qold').get()).val()).toBeNull();
    expect(sent).toEqual([{ token: 'tok', ...expiryNotice('Alba') }]);
    // al giro dopo il timer c'è già: nessun nuovo avviso
    await expireAuctions(db, now + 60000, async () => 'sent');
    expect((await db.ref('sims_auctions/q0001/expiresAt').get()).val()).toBeNull();
  });
});
