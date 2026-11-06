import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyCryoPayment } from '../worker/src/cryo-payment.js';
import {
  CRYO_MS,
  awakeMs,
  awakeSpans,
  cryoActive,
  decodeCryo,
  extendCryo,
  frozenMs,
  realTimeAfterAwake,
} from '../shared/cryo-rules.js';
import {
  type PushSender,
  maintainGame,
  sendDeathWarnings,
  sendPetWarnings,
} from '../server/src/maintenance.js';
import {
  NEEDS_RULES,
  absentDeath,
  advanceAbsence,
  needsStateFromSave,
} from '../src/game/absent-death-rules.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const H = 3600000;
const D = 24 * H;

describe('criogenesi: il pass', () => {
  it('un acquisto vale 30 giorni; con il pass attivo i giorni si sommano', () => {
    const first = extendCryo(null, NOW);
    expect(first).toEqual({ since: NOW, until: NOW + CRYO_MS });
    const again = extendCryo(first, NOW + 5 * D);
    expect(again).toEqual({ since: NOW, until: NOW + 2 * CRYO_MS });
    // scaduto: si riparte da adesso
    const late = NOW + 40 * D;
    expect(extendCryo(first, late)).toEqual({ since: late, until: late + CRYO_MS });
  });

  it('attivo solo fra inizio e scadenza; i dati rovinati non valgono', () => {
    const pass = { since: NOW, until: NOW + CRYO_MS };
    expect(cryoActive(pass, NOW + D)).toBe(true);
    expect(cryoActive(pass, NOW + CRYO_MS)).toBe(false);
    expect(cryoActive(null, NOW)).toBe(false);
    expect(decodeCryo({ since: NOW, until: NOW - 1 })).toBeNull();
    expect(decodeCryo({ since: 'x', until: NOW })).toBeNull();
    expect(decodeCryo({ since: NOW, until: NOW + D, payments: {} })).toEqual({
      since: NOW,
      until: NOW + D,
    });
  });
});

describe("criogenesi: il tempo dell'assenza", () => {
  const pass = { since: NOW + 10 * H, until: NOW + 30 * H };

  it('conta solo il tempo fuori dalla capsula', () => {
    // via da NOW a NOW+40h: 20 ore in capsula, 20 fuori
    expect(frozenMs(pass, NOW, NOW + 40 * H)).toBe(20 * H);
    expect(awakeMs(pass, NOW, NOW + 40 * H)).toBe(20 * H);
    expect(awakeSpans(pass, NOW, NOW + 40 * H)).toEqual([
      [NOW, NOW + 10 * H],
      [NOW + 30 * H, NOW + 40 * H],
    ]);
    // assenza tutta dentro la capsula: niente da simulare
    expect(awakeSpans(pass, NOW + 12 * H, NOW + 20 * H)).toEqual([]);
    // senza pass, tutto il tempo conta
    expect(awakeMs(null, NOW, NOW + 40 * H)).toBe(40 * H);
    expect(awakeSpans(null, NOW, NOW + H)).toEqual([[NOW, NOW + H]]);
  });

  it('la capsula comprata mentre si giocava conta solo da quando si esce', () => {
    const bought = { since: NOW - 5 * D, until: NOW + 2 * D };
    expect(frozenMs(bought, NOW, NOW + D)).toBe(D);
  });

  it('sposta in avanti le scadenze di quanto dura la capsula', () => {
    // 80 ore di assenza "vera" partendo da NOW: la capsula ne congela 20
    expect(realTimeAfterAwake(pass, NOW, 80 * H)).toBe(NOW + 100 * H);
    // scadenza prima della capsula: non cambia
    expect(realTimeAfterAwake(pass, NOW, 5 * H)).toBe(NOW + 5 * H);
    expect(realTimeAfterAwake(null, NOW, 80 * H)).toBe(NOW + 80 * H);
    // coerente con awakeMs
    const t = realTimeAfterAwake(pass, NOW, 25 * H);
    expect(awakeMs(pass, NOW, t)).toBe(25 * H);
    // un animale senza cibo da prima che il padrone uscisse: la capsula conta da quando è uscito
    expect(realTimeAfterAwake(pass, NOW - 50 * H, 70 * H, NOW + 15 * H)).toBe(NOW + 35 * H);
  });
});

describe('criogenesi: il server', () => {
  const uid = 'uidCriogenesi01';
  const pid = 'player_' + uid;
  const setup = async (lastSeen: number, pass: { since: number; until: number } | null) => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('sims_accounts/' + uid).set({ playerId: pid });
    if (pass) await database.ref('sims_cryo/' + uid).set(pass);
    await database.ref('sims_rooms_state/0').set({
      id: 1,
      ownerId: pid,
      owner: 'Gelo',
      lastSeen,
      vaultMoney: 100,
    });
    return database;
  };

  it('80 ore di assenza contano solo fuori dalla capsula', async () => {
    // via da 100 ore, di cui 50 in capsula: per il personaggio ne sono passate 50
    const capsule = { since: NOW - 90 * H, until: NOW - 40 * H };
    const kept = await setup(NOW - 100 * H, capsule);
    await maintainGame(kept, NOW);
    expect((await kept.ref('sims_rooms_state/0/ownerId').get()).val()).toBe(pid);
    // senza capsula muore
    const gone = await setup(NOW - 100 * H, null);
    await maintainGame(gone, NOW);
    expect((await gone.ref('sims_rooms_state/0/ownerId').get()).exists()).toBe(false);
    // con la capsula finita da tanto, alla fine muore lo stesso; la data tiene conto della pausa
    const late = await setup(NOW - 200 * H, { since: NOW - 190 * H, until: NOW - 140 * H });
    await maintainGame(late, NOW);
    expect((await late.ref('sims_rooms_state/0/ownerId').get()).exists()).toBe(false);
    // 72 ore fuori dalla capsula: 10 prima, 50 di capsula, poi altre 62
    expect((await late.ref(`sims_saves/${pid}/deadAt`).get()).val()).toBe(NOW - 200 * H + 122 * H);
  });

  it('niente avviso di morte mentre il conto alla rovescia è fermo', async () => {
    const sent: string[] = [];
    const send: PushSender = async (_token, message) => {
      sent.push(message.body);
      return 'sent';
    };
    const push = { tokens: { k: { token: 'tok_'.padEnd(30, 'x'), t: NOW } } };
    // via da 75 ore: senza capsula partirebbe l'avviso
    const plain = await setup(NOW - 75 * H, null);
    await plain.ref('sims_push/' + pid).set(push);
    expect(await sendDeathWarnings(plain, NOW, send)).toBe(1);
    expect(sent[0]).toContain('entro 5 ore');
    // con 30 di quelle ore in capsula: ne contano 45, nessun avviso
    const cold = await setup(NOW - 75 * H, { since: NOW - 60 * H, until: NOW - 30 * H });
    await cold.ref('sims_push/' + pid).set(push);
    expect(await sendDeathWarnings(cold, NOW, send)).toBe(0);
  });

  it('in capsula non si muore di fame', () => {
    const save = {
      savedAt: NOW - 10 * H,
      moneyLevel: 0,
      healthLevel: 10,
      sleepLevel: 100,
      hungerLevel: 0,
      hygieneLevel: 100,
      happinessLevel: 100,
      gameMinutes: 2000,
    };
    expect(absentDeath(save, {}, NOW)).not.toBeNull();
    expect(
      absentDeath(save, {}, NOW, undefined, { since: NOW - 20 * H, until: NOW + D }),
    ).toBeNull();
    // la capsula copre solo le ultime 8 ore: nelle prime 2 resta vivo (gliene servono 4,8)
    expect(
      absentDeath(save, {}, NOW, undefined, { since: NOW - 8 * H, until: NOW + D }),
    ).toBeNull();
    const state = needsStateFromSave(save);
    advanceAbsence(state, save.savedAt, NOW, NEEDS_RULES, { since: NOW - 8 * H, until: NOW + D });
    expect(state.healthLevel).toBeGreaterThan(0);
    expect(state.gameMinutes).toBeCloseTo(2000 + 120, 0); // invecchia solo di 2 ore
  });

  it("l'animale del padrone in capsula non riceve l'avviso di fame", async () => {
    const sent: string[] = [];
    const send: PushSender = async () => (sent.push('x'), 'sent');
    // sfamato al 10% quando il padrone è uscito, 25,8 ore fa: a zero dopo 4,8 ore, morto 24 ore
    // dopo. Senza capsula mancano 3 ore; con la capsula il tempo per lui non è passato.
    const savedAt = NOW - 25.8 * H;
    const pets = { dog: { hunger: 10, at: savedAt } };
    const plain = await setup(NOW - H, null);
    await plain.ref('sims_saves/' + pid).set({ savedAt, moneyLevel: 0, pets });
    await plain
      .ref('sims_push/' + pid)
      .set({ tokens: { k: { token: 'tok_'.padEnd(30, 'x'), t: NOW } } });
    const before = await sendPetWarnings(plain, NOW, send);
    const cold = await setup(NOW - H, { since: savedAt, until: NOW + D });
    await cold.ref('sims_saves/' + pid).set({ savedAt, moneyLevel: 0, pets });
    await cold
      .ref('sims_push/' + pid)
      .set({ tokens: { k: { token: 'tok_'.padEnd(30, 'x'), t: NOW } } });
    expect(before).toBe(1);
    expect(await sendPetWarnings(cold, NOW, send)).toBe(0);
  });
});

describe('criogenesi: il pagamento da Stripe', () => {
  const uid = 'uidPagante01';
  const LINK = 'plink_criogenesi';
  const session = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    client_reference_id: uid,
    payment_status: 'paid',
    payment_link: LINK,
    amount_total: 299,
    currency: 'eur',
    livemode: false,
    ...extra,
  });

  it('un pagamento attiva 30 giorni; lo stesso avviso ripetuto non aggiunge niente', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    expect(await applyCryoPayment(database, session('cs_1'), LINK, NOW)).toBe('attivata');
    expect(await applyCryoPayment(database, session('cs_1'), LINK, NOW + H)).toBe('già registrato');
    const stored = (await database.ref('sims_cryo/' + uid).get()).val();
    expect(decodeCryo(stored)).toEqual({ since: NOW, until: NOW + CRYO_MS });
    expect(stored.payments.cs_1).toEqual({ at: NOW, amount: 299, currency: 'eur', live: false });
    // secondo acquisto prima della scadenza: i giorni si sommano
    expect(await applyCryoPayment(database, session('cs_2'), LINK, NOW + 5 * D)).toBe('attivata');
    const after = (await database.ref('sims_cryo/' + uid).get()).val();
    expect(decodeCryo(after)).toEqual({ since: NOW, until: NOW + 2 * CRYO_MS });
    expect(Object.keys(after.payments)).toEqual(['cs_1', 'cs_2']);
  });

  it('ignora altri prodotti, pagamenti non riusciti e account mancanti', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    expect(
      await applyCryoPayment(database, session('a', { payment_link: 'plink_altro' }), LINK, NOW),
    ).toBe('altro prodotto');
    expect(await applyCryoPayment(database, session('b', { payment_link: null }), LINK, NOW)).toBe(
      'altro prodotto',
    );
    expect(await applyCryoPayment(database, session('c'), '', NOW)).toBe('altro prodotto');
    expect(
      await applyCryoPayment(database, session('d', { payment_status: 'unpaid' }), LINK, NOW),
    ).toBe('non ancora pagato');
    expect(
      await applyCryoPayment(database, session('e', { client_reference_id: null }), LINK, NOW),
    ).toBe('account mancante');
    expect(
      await applyCryoPayment(database, session('f', { client_reference_id: 'a/b' }), LINK, NOW),
    ).toBe('account mancante');
    expect((await database.ref('sims_cryo').get()).exists()).toBe(false);
    // Stripe a volte manda il link come oggetto
    expect(
      await applyCryoPayment(database, session('g', { payment_link: { id: LINK } }), LINK, NOW),
    ).toBe('attivata');
  });

  it('le regole: il pass lo legge solo il suo account e lo scrive solo il Worker', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    expect(r.sims_cryo.$uid['.read']).toContain('auth.uid === $uid');
    expect(r.sims_cryo.$uid['.read']).toContain("auth.uid === 'cryo-webhook'");
    expect(r.sims_cryo.$uid['.write']).toBe("auth != null && auth.uid === 'cryo-webhook'");
    expect(r.sims_cryo['.write']).toBeUndefined();
  });
});
