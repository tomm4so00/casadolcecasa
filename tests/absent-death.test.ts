import { describe, expect, it } from 'vitest';
import {
  NEEDS_RULES,
  absentDeath,
  needsStateFromSave,
  rescueAt,
} from '../src/game/absent-death-rules';
import {
  CRYO_ABANDON_RESCUE_MS,
  CRYO_RESCUE_SINCE,
  abandonRescuedPass,
  cryoRescues,
  rescuedPass,
} from '../shared/cryo-rules';
import { advanceNeeds } from '../src/game/simulation';
import { maintainGame } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const H = 3600000;
/**
 * Quasi senza salute, con fame, sonno e igiene a zero da più di un giorno (passate le 24 ore di
 * grazia): la salute cala di 100 ogni 48 ore.
 */
const starving = (savedAt: number) => ({
  savedAt,
  moneyLevel: 0,
  nick: 'Laura',
  healthLevel: 10,
  sleepLevel: 0,
  hungerLevel: 0,
  hygieneLevel: 0,
  happinessLevel: 100,
  gameMinutes: 2000,
  needsZeroSince: savedAt - 25 * H,
});

describe('morte mentre si è via', () => {
  it('trova il momento in cui la salute arriva a zero', () => {
    const save = starving(NOW - 10 * H);
    // 10 punti di salute a 100 ogni 172800 s = 17280 s = 4,8 ore
    const death = absentDeath(save, {}, NOW)!;
    expect(Math.abs(death.deadAt - (save.savedAt + 17_280_000))).toBeLessThan(6000);
    expect(death.gameMinutes).toBeCloseTo(2000 + 17280 / 60, 0);
    // prima di quel momento era ancora vivo
    expect(absentDeath(save, {}, save.savedAt + 4 * H)).toBeNull();
  });

  it('dà lo stesso risultato del gioco al rientro', () => {
    const save = starving(NOW - 10 * H);
    const state = needsStateFromSave(save);
    advanceNeeds(state, 10 * 3600, NOW, NEEDS_RULES);
    expect(state.healthLevel).toBe(0);
    const ok = { ...save, hungerLevel: 100, sleepLevel: 100, hygieneLevel: 100, healthLevel: 80 };
    const alive = needsStateFromSave(ok);
    advanceNeeds(alive, 10 * 3600, NOW, NEEDS_RULES);
    expect(alive.healthLevel).toBeGreaterThan(0);
    expect(absentDeath(ok, {}, NOW)).toBeNull();
  });

  it("con i bisogni a zero si resta all'1% finché non sono tutti a zero da 24 ore", () => {
    // solo la fame a zero: la salute scende ma non arriva mai a zero
    const hungry = { ...starving(NOW - 10 * H), sleepLevel: 100, hygieneLevel: 100 };
    delete (hungry as { needsZeroSince?: number }).needsZeroSince;
    const state = needsStateFromSave(hungry);
    advanceNeeds(state, 10 * 3600, NOW, NEEDS_RULES);
    expect(state.healthLevel).toBe(1);
    expect(absentDeath(hungry, {}, NOW)).toBeNull();
    // tutti a zero da adesso: vivo per 24 ore, poi l'1% rimasto dura circa mezz'ora
    const empty = { ...starving(NOW - 30 * H), needsZeroSince: 0 };
    const death = absentDeath(empty, {}, NOW)!;
    expect(death.deadAt - empty.savedAt).toBeGreaterThan(24 * H);
    expect(death.deadAt - empty.savedAt).toBeLessThan(25 * H);
  });

  it('chi è già morto o non ha un salvataggio datato non si tocca', () => {
    expect(absentDeath({ ...starving(NOW - 10 * H), dead: true }, {}, NOW)).toBeNull();
    expect(absentDeath({ healthLevel: 0 }, {}, NOW)).toBeNull();
  });

  it('muore anche chi non ha una stanza ma è rimasto a terra, collegato o no', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_saves/p_senza').set({ ...starving(NOW - 10 * H), nick: 'Gino' });
    await db
      .ref('sims_online_players/p_senza')
      .set({ name: 'Gino', x: 0, y: 0, env: 'CORTILE', offline: true, offAt: NOW - 10 * H });
    await maintainGame(db, NOW);
    expect((await db.ref('sims_saves/p_senza/dead').get()).val()).toBe(true);
    expect((await db.ref('sims_graveyard/p_senza/name').get()).val()).toBe('Gino');
    expect((await db.ref('sims_online_players/p_senza').get()).exists()).toBe(false);
  });

  it('il server segna la morte nel momento giusto e libera la stanza; chi sta giocando no', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_accounts/a').set({ playerId: 'p_via' });
    await db.ref('sims_accounts/b').set({ playerId: 'p_gioca' });
    await db.ref('sims_accounts/c').set({ playerId: 'p_online' });
    await db.ref('sims_rooms_state').set({
      0: { id: 1, ownerId: 'p_via', owner: 'Laura', vaultMoney: 20, lastSeen: NOW - 9 * H },
      1: { id: 2, ownerId: 'p_gioca', owner: 'Marco', vaultMoney: 5, lastSeen: NOW - 60000 },
      2: { id: 3, ownerId: 'p_online', owner: 'Sara', vaultMoney: 5, lastSeen: NOW - 9 * H },
    });
    await db.ref('sims_saves/p_via').set(starving(NOW - 10 * H));
    await db.ref('sims_saves/p_gioca').set({ ...starving(NOW - 10 * H), nick: 'Marco' });
    await db.ref('sims_saves/p_online').set({ ...starving(NOW - 10 * H), nick: 'Sara' });
    // Laura è svenuta a terra (offline); Sara manda ancora la posizione
    await db
      .ref('sims_online_players/p_via')
      .set({ name: 'Laura', x: 0, y: 0, env: 'PLAYER_ROOM', offline: true, offAt: NOW - 9 * H });
    await db
      .ref('sims_online_players/p_online')
      .set({ name: 'Sara', x: 0, y: 0, env: 'SALOON', t: NOW - 30000 });

    await maintainGame(db, NOW);

    const save = (await db.ref('sims_saves/p_via').get()).val();
    expect(save.dead).toBe(true);
    expect(Math.abs(save.deadAt - (NOW - 10 * H + 17_280_000))).toBeLessThan(6000);
    const grave = (await db.ref('sims_graveyard/p_via').get()).val();
    expect(grave).toMatchObject({ name: 'Laura', deadAt: save.deadAt });
    expect(grave.days).toBeGreaterThanOrEqual(1);
    expect((await db.ref('sims_rooms_state/0').get()).val()).toEqual({ id: 1, vaultMoney: 0 });
    expect((await db.ref('sims_online_players/p_via').get()).exists()).toBe(false);
    // chi si è fatto vedere da poco resta com'è: ci pensa il suo gioco
    for (const id of ['p_gioca', 'p_online'])
      expect((await db.ref('sims_saves/' + id + '/dead').get()).exists()).toBe(false);
    expect((await db.ref('sims_rooms_state/1/ownerId').get()).val()).toBe('p_gioca');
    expect((await db.ref('sims_rooms_state/2/ownerId').get()).val()).toBe('p_online');
  });
});

describe('criogenesi: la capsula salva chi sta per morire', () => {
  const D = 24 * H;
  it('pass nuovo: muore solo chi non è coperto; il pass vecchio mette in pausa da subito', () => {
    const save = starving(NOW - 10 * H);
    // pass nuovo, comprato dopo il cambio di regola: entra in capsula a salute 10 e non muore
    const nuovo = { since: CRYO_RESCUE_SINCE + 1000, until: CRYO_RESCUE_SINCE + 400 * D };
    const at = save.savedAt;
    const s = { ...save, savedAt: Math.max(at, nuovo.since) };
    expect(absentDeath(s, {}, s.savedAt + 30 * H, NEEDS_RULES, nuovo)).toBeNull();
    // senza pass muore
    expect(absentDeath(s, {}, s.savedAt + 30 * H)).not.toBeNull();
  });

  it('il momento del salvataggio: salute al 10% o il giorno prima dei 10 giorni', () => {
    const from = CRYO_RESCUE_SINCE + D;
    // già a salute 10: subito
    expect(rescueAt(needsStateFromSave(starving(from)), from, NEEDS_RULES)).toBe(from);
    // con i bisogni pieni la salute regge quasi 9 giorni: si entra prima dell'abbandono
    const full = needsStateFromSave({ savedAt: from });
    const at = rescueAt(full, from, NEEDS_RULES);
    expect(at).toBeGreaterThan(from + 5 * D);
    expect(at).toBeLessThanOrEqual(from + CRYO_ABANDON_RESCUE_MS);
  });

  it('il pass di un’assenza: regola nuova dal salvataggio, vecchia da subito', () => {
    const vecchio = { since: CRYO_RESCUE_SINCE - D, until: CRYO_RESCUE_SINCE + 30 * D };
    const nuovo = { since: CRYO_RESCUE_SINCE, until: CRYO_RESCUE_SINCE + 30 * D };
    const from = CRYO_RESCUE_SINCE + D;
    expect(cryoRescues(vecchio)).toBe(false);
    expect(rescuedPass(vecchio, from + 3 * D)).toEqual(vecchio);
    expect(rescuedPass(nuovo, from + 3 * D)).toEqual({ since: from + 3 * D, until: nuovo.until });
    // si salverebbe dopo la scadenza: niente capsula
    expect(rescuedPass(nuovo, nuovo.until + 1)).toBeNull();
    expect(abandonRescuedPass(nuovo, from)?.since).toBe(from + CRYO_ABANDON_RESCUE_MS);
  });
});
