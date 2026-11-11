import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountPlayerIds,
  deletionPaths,
  cleanupLeftoversOnce,
  processDeletionRequests,
} from '../server/src/deletion.js';
import { maintainGame } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
/** Vuoto come lo vede Firebase, che toglie da solo gli oggetti rimasti senza figli. */
const empty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'object' && Object.values(v).every(empty));
/** Senza gli oggetti rimasti vuoti, come li vedrebbe Firebase. */
const firebaseView = (v: unknown): unknown =>
  JSON.parse(
    JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && empty(x) ? undefined : x)),
  );
const UID = 'uidAnnaxxxxxxxxxxxxxxxxxxx1';
const A = 'player_' + UID; // personaggio attuale
const A_OLD = A + '_rabc123'; // vita precedente
const A_LEGACY = 'player_vecchio1'; // recuperato con il codice
const B = 'player_uidBrunoxxxxxxxxxxxxxxxx2'; // un altro giocatore: non va toccato

/** Un database dove Anna (tre personaggi) e Bruno si incrociano dappertutto. */
function world() {
  return {
    sims_accounts: { [UID]: { playerId: A }, uidBrunoxxxxxxxxxxxxxxxx2: { playerId: B } },
    sims_legacy_claims: { [A_LEGACY]: UID, player_altrui1: 'uidAltro' },
    sims_link_requests: { [UID]: { playerId: A_LEGACY, requestedAt: 1 } },
    sims_saves: {
      [A]: { savedAt: NOW, moneyLevel: 1, nick: 'Anna' },
      [A_OLD]: { savedAt: 1, moneyLevel: 0, dead: true },
      [A_LEGACY]: { savedAt: 1, moneyLevel: 0 },
      [B]: { savedAt: NOW, moneyLevel: 5, nick: 'Bruno' },
    },
    sims_sessions: { [A]: { id: 'x', expiresAt: 1 }, [B]: { id: 'y', expiresAt: 1 } },
    sims_online_players: { [A]: { name: 'Anna' }, [B]: { name: 'Bruno' } },
    sims_leaderboard: { [A]: { name: 'Anna', wealth: 1 }, [B]: { name: 'Bruno', wealth: 2 } },
    sims_graveyard: {
      [A_OLD]: { name: 'Anna vecchia', deadAt: 1, days: 2, visitors: { [B]: 'Bruno' } },
      player_morto: { name: 'Carlo', deadAt: 1, days: 3, visitors: { [A]: 'Anna', [B]: 'Bruno' } },
    },
    sims_push: { [A]: { tokens: {} }, [B]: { tokens: {} } },
    sims_theft: { [A]: { 3: { n: 1, since: 1 } }, [B]: { 0: { n: 1, since: 1 } } },
    sims_activity: { 20000: { shop: { [A]: { n: 1, t: 1 }, [B]: { n: 2, t: 1 } } } },
    sims_chat: {
      c1: { id: A, name: 'Anna', text: 'ciao', t: 1 },
      c2: { id: B, name: 'Bruno', text: 'ehi', t: 2 },
      c3: { id: A_OLD, name: 'Anna vecchia', text: 'addio', t: 0 },
    },
    sims_gossip: {
      g1: { by: A, text: 'Anna ha comprato…', t: 1 },
      g2: { by: B, text: 'Bruno parla di Anna', t: 2, about: `${A},player_altro` },
      g3: { by: B, text: 'Bruno e basta', t: 3, about: 'player_altro' },
    },
    sims_painting_titles: {
      q1: { title: 'Alba', by: A, t: 1 },
      q2: { title: 'Notte', by: B, t: 1 },
    },
    sims_games: { p1: { a: A, b: B }, p2: { a: B, b: 'player_altro' } },
    sims_rps: { [B]: { a: A, b: B }, player_altro: { a: B, b: 'player_altro' } },
    sims_limited: {
      ltd_lamp: {
        1: { o: A, on: 'Anna', t: 1 },
        2: { o: B, on: 'Bruno', t: 1, sale: { to: A, p: 5, t: 1 } },
      },
    },
    sims_collect: {
      owners: {
        col_vase: { o: A, on: 'Anna', t: 1 },
        col_coin: { o: B, on: 'Bruno', t: 1, sale: { to: A, p: 3, t: 1, st: 1 } },
      },
      slots: { 0: 'col_vase' },
    },
    sims_ltd_offers: {
      [B]: { o1: { from: A, amt: 5 }, o2: { from: 'player_altro', amt: 6 } },
      [A]: { o3: { from: B } },
    },
    sims_ltd_sent: {
      [B]: { s1: { owner: A, amt: 5 }, s2: { owner: 'player_altro', amt: 1 } },
      [A]: { s3: { owner: B } },
    },
    sims_interactions: {
      [B]: { m1: { from: A, type: 'gift' }, m2: { from: 'player_altro', type: 'gift' } },
      [A]: { m3: { from: B } },
    },
    sims_projects: {
      rocket: {
        funded: 100,
        donors: { [A]: { name: 'Anna', amount: 50 }, [B]: { name: 'Bruno', amount: 50 } },
      },
    },
    sims_invited: { [UID]: B, uidAltro: A },
    sims_invites: {
      [B]: { [UID]: { nick: 'Anna', t: 1 } },
      [A]: { uidAltro: { nick: 'Altro', t: 1 } },
    },
    sims_cryo: { [UID]: { since: 1, until: 2, payments: { cs_1: { at: 1, amount: 299 } } } },
    // quello che prima della correzione restava (condizioni.html promette di cancellarlo)
    sims_suggestions: {
      s1: { uid: UID, pid: A, nick: 'Anna', kind: 'bug', text: 'non va', t: 1 },
      s2: {
        uid: 'uidBrunoxxxxxxxxxxxxxxxx2',
        pid: B,
        nick: 'Bruno',
        kind: 'idea',
        text: 'sì',
        t: 2,
      },
    },
    sims_suggest_last: { [UID]: 1, uidBrunoxxxxxxxxxxxxxxxx2: 2 },
    sims_gifts: {
      1: { [A]: { name: 'Anna', x: 0, y: 0, t: 1 } },
      0: { [B]: { name: 'Bruno', t: 1 } },
    },
    sims_couples: {
      [A]: { with: B, name: 'Bruno', since: 1, ok: true },
      [B]: { with: A, name: 'Anna', since: 1, ok: true },
    },
    sims_theft_blocks: {
      1: { [A]: { by: B, t: 1 } },
      0: { [B]: { by: A, t: 1 } },
      5: { player_altro: { by: B, t: 1 } },
    },
    sims_fines: {
      [B]: {
        f1: { k: 'bag', n: 1, amt: 50, paid: 50, to: A, t: 1 },
        f2: { k: 'bag', n: 1, amt: 50, paid: 0, to: 'player_altro', t: 1 },
      },
    },
    sims_world_creators: { [A]: 1, [B]: 2 },
    sims_safe_pins: { [A]: 'h1abc', [B]: 'h2def' },
    sims_jobs: {
      [UID]: { day: '2026-11-11', count: 1, imported: true },
      uidBrunoxxxxxxxxxxxxxxxx2: { day: 'x', count: 1, imported: true },
    },
    sims_deletions: { [UID]: { at: NOW } },
    sims_emails: { 'anna@gmailcom': UID, 'bruno@gmailcom': 'uidBrunoxxxxxxxxxxxxxxxx2' },
    sims_rooms_state: {
      0: {
        id: 1,
        owner: 'Anna',
        ownerId: A,
        vaultMoney: 100,
        lastSeen: NOW,
        layout: { bed: { x: 1 } },
      },
      1: {
        id: 2,
        owner: 'Bruno',
        ownerId: B,
        vaultMoney: 70,
        lastSeen: NOW,
        robbed: { by: A, t: 1 },
      },
      2: { id: 3, vaultMoney: 0, pendingDeath: { id: A_LEGACY, name: 'Anna', lastSeen: 1 } },
    },
  };
}

describe("cancellazione dell'account su richiesta", () => {
  it("trova tutti i personaggi dell'account: attuale, vite precedenti e recuperati", () => {
    expect(accountPlayerIds(UID, world()).sort()).toEqual([A, A_OLD, A_LEGACY].sort());
  });

  it('non indica mai percorsi annidati (Firebase li rifiuterebbe)', () => {
    const paths = deletionPaths(UID, world());
    for (const p of paths) expect(paths.some((o) => o !== p && p.startsWith(o + '/'))).toBe(false);
  });

  it('cancella tutto di Anna, niente di Bruno, e tiene le ricevute', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('').update(world());
    const logins: string[] = [];
    expect(await processDeletionRequests(database, async (uid) => void logins.push(uid))).toBe(1);
    expect(logins).toEqual([UID]);
    const all = (await database.ref('').get()).val();
    // nessuna traccia dei tre personaggi di Anna né del suo account, in nessun nodo
    const text = JSON.stringify(all);
    for (const id of [A, A_OLD, A_LEGACY]) expect(text).not.toContain(id);
    expect(Object.keys(all.sims_accounts)).toEqual(['uidBrunoxxxxxxxxxxxxxxxx2']);
    expect(empty(all.sims_link_requests)).toBe(true);
    expect(empty(all.sims_deletions)).toBe(true);
    // la sua stanza è libera; il promemoria di morte del vecchio personaggio è sparito
    expect(all.sims_rooms_state[0]).toEqual({ id: 1, vaultMoney: 0 });
    expect(all.sims_rooms_state[2]).toEqual({ id: 3, vaultMoney: 0 });
    // Bruno ha tutto: salvataggio, stanza, messaggi, offerte, classifica…
    expect(all.sims_saves[B].nick).toBe('Bruno');
    expect(all.sims_rooms_state[1].ownerId).toBe(B);
    // …e i suoi suggerimenti, regali, PIN, turni, blocchi e multe di altri; la coppia si scioglie
    expect(Object.keys(all.sims_suggestions)).toEqual(['s2']);
    expect(firebaseView(all.sims_gifts)).toEqual({ 0: { [B]: { name: 'Bruno', t: 1 } } });
    expect(all.sims_safe_pins).toEqual({ [B]: 'h2def' });
    expect(Object.keys(all.sims_jobs)).toEqual(['uidBrunoxxxxxxxxxxxxxxxx2']);
    expect(firebaseView(all.sims_theft_blocks)).toEqual({ 5: { player_altro: { by: B, t: 1 } } });
    expect(Object.keys(all.sims_fines[B])).toEqual(['f2']);
    expect(empty(all.sims_couples)).toBe(true);
    expect(all.sims_rooms_state[1].robbed).toBeUndefined();
    expect(Object.keys(all.sims_chat)).toEqual(['c2']);
    expect(Object.keys(all.sims_gossip)).toEqual(['g3']);
    expect(all.sims_painting_titles).toEqual({ q2: { title: 'Notte', by: B, t: 1 } });
    expect(Object.keys(all.sims_games)).toEqual(['p2']);
    expect(Object.keys(all.sims_rps)).toEqual(['player_altro']);
    expect(all.sims_limited.ltd_lamp).toEqual({ 2: { o: B, on: 'Bruno', t: 1 } });
    expect(all.sims_collect.owners).toEqual({ col_coin: { o: B, on: 'Bruno', t: 1 } });
    expect(all.sims_ltd_offers).toEqual({ [B]: { o2: { from: 'player_altro', amt: 6 } } });
    expect(all.sims_ltd_sent).toEqual({ [B]: { s2: { owner: 'player_altro', amt: 1 } } });
    expect(all.sims_interactions).toEqual({ [B]: { m2: { from: 'player_altro', type: 'gift' } } });
    expect(all.sims_projects.rocket.donors).toEqual({ [B]: { name: 'Bruno', amount: 50 } });
    expect(all.sims_projects.rocket.funded).toBe(100);
    expect(all.sims_graveyard).toEqual({
      player_morto: { name: 'Carlo', deadAt: 1, days: 3, visitors: { [B]: 'Bruno' } },
    });
    expect(all.sims_activity[20000].shop).toEqual({ [B]: { n: 2, t: 1 } });
    expect(all.sims_leaderboard).toEqual({ [B]: { name: 'Bruno', wealth: 2 } });
    expect(all.sims_legacy_claims).toEqual({ player_altrui1: 'uidAltro' });
    // inviti: via quello con cui è arrivata Anna e quelli che ha fatto lei
    expect(empty(all.sims_invited)).toBe(true);
    expect(empty(all.sims_invites)).toBe(true);
    // la sua casella email si libera, quella di Bruno resta
    expect(all.sims_emails).toEqual({ 'bruno@gmailcom': 'uidBrunoxxxxxxxxxxxxxxxx2' });
    // le ricevute degli acquisti restano (obbligo di legge)
    expect(all.sims_cryo[UID].payments.cs_1.amount).toBe(299);
  });

  it("se non si riesce a togliere l'accesso, la richiesta resta e il giro dopo riprova", async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('').update(world());
    const failing = async () => {
      throw new Error('permesso negato');
    };
    expect(await processDeletionRequests(database, failing)).toBe(0);
    expect((await database.ref('sims_deletions/' + UID).get()).exists()).toBe(true);
    // i dati sono già cancellati: rifarlo non fa danni
    expect((await database.ref('sims_saves/' + A).get()).exists()).toBe(false);
    expect(await processDeletionRequests(database, async () => {})).toBe(1);
    expect((await database.ref('sims_deletions/' + UID).get()).exists()).toBe(false);
  });

  it('dopo la cancellazione la manutenzione non ricrea lapide né salvataggio', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('').update(world());
    await processDeletionRequests(database, async () => {});
    await maintainGame(database, NOW + 200 * 3600000);
    const text = JSON.stringify((await database.ref('').get()).val());
    for (const id of [A, A_OLD, A_LEGACY]) expect(text).not.toContain(id);
  });

  it('le regole: la richiesta la scrive solo il proprietario, una volta', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const node = r.sims_deletions.$uid;
    expect(node['.write']).toContain('auth.uid === $uid && !data.exists() && newData.exists()');
    expect(node['.read']).toContain('auth.uid === $uid');
    expect(node.$other['.validate']).toBe(false);
  });
});

describe('pulizia una volta sola dei resti di prima', () => {
  it('toglie solo quello che nomina personaggi che non esistono più, poi si ferma', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const GONE = 'player_cancellato1';
    await database.ref('').update({
      sims_saves: {
        [B]: { savedAt: NOW, nick: 'Bruno' },
        player_morto: { savedAt: 1, dead: true },
      },
      sims_suggestions: {
        s1: { uid: 'uidVia', pid: GONE, nick: 'Via', kind: 'bug', text: 'x', t: 1 },
        s2: { uid: 'uidBruno', pid: B, nick: 'Bruno', kind: 'idea', text: 'y', t: 2 },
      },
      sims_couples: { [B]: { with: GONE, name: 'Via', since: 1 } },
      sims_world_creators: { [GONE]: 1, [B]: 2 },
      sims_gifts: { 3: { [GONE]: { name: 'Via', t: 1 }, [B]: { name: 'Bruno', t: 1 } } },
      sims_theft_blocks: { 1: { [GONE]: { by: B, t: 1 } }, 2: { player_morto: { by: B, t: 1 } } },
      sims_fines: { [B]: { f1: { to: GONE, amt: 5 }, f2: { to: 'player_morto', amt: 5 } } },
      worlds: { 'CASA-AB23': { gifts: { 0: { [GONE]: { name: 'Via', t: 1 } } } } },
    });
    expect(await cleanupLeftoversOnce(database, ['CASA-AB23'])).toBeGreaterThan(0);
    const all = (await database.ref('').get()).val();
    expect(JSON.stringify(firebaseView(all))).not.toContain(GONE);
    // chi esiste ancora (anche morto, con il suo salvataggio) non si tocca
    expect(Object.keys(all.sims_suggestions)).toEqual(['s2']);
    expect(all.sims_world_creators).toEqual({ [B]: 2 });
    expect(firebaseView(all.sims_gifts)).toEqual({ 3: { [B]: { name: 'Bruno', t: 1 } } });
    expect(firebaseView(all.sims_theft_blocks)).toEqual({ 2: { player_morto: { by: B, t: 1 } } });
    expect(Object.keys(all.sims_fines[B])).toEqual(['f2']);
    // la seconda volta non fa niente
    await database.ref('sims_gifts/9').set({ [GONE]: { name: 'Via', t: 1 } });
    expect(await cleanupLeftoversOnce(database, ['CASA-AB23'])).toBeNull();
    expect((await database.ref('sims_gifts/9').get()).val()).not.toBeNull();
  });
});
