import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type TokenKey, verifyFirebaseToken } from '../worker/src/firebase-auth.js';
import { type Env, handleJob } from '../worker/src/index.js';
import { endJob, startJob } from '../worker/src/job-shift.js';
import { SHIFT_MIN_MS } from '../shared/job-pay-rules.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = Date.UTC(2026, 10, 15, 9, 0, 0);
const UID = 'u1';
const PID = 'player_u1';
const ROOM = { job: 'cantiere', world: 'CASA-0001', room: 2 };
const END = NOW + SHIFT_MIN_MS + 5000;

async function world(extra: Record<string, unknown> = {}) {
  const db = localDatabase(new Lifetime(), new MemoryStorage());
  await db.ref('sims_accounts/' + UID).set({ playerId: PID });
  // nel gioco la sessione si rinnova ogni pochi secondi: qui vale per tutto il turno
  await db.ref('sims_sessions/' + PID).set({ id: 'sessione', expiresAt: END + 40_000 });
  await db.ref('sims_rooms_state/2').set({ id: 3, ownerId: PID, vaultMoney: 100 });
  await db.ref('sims_saves/' + PID).set({
    jobExperience: { cantiere: 16, ufficio: 2 },
    activeJobKey: 'cantiere',
  });
  for (const [path, value] of Object.entries(extra)) await db.ref(path).set(value);
  return db;
}
const vault = async (db: Awaited<ReturnType<typeof world>>, path = 'sims_rooms_state/2') =>
  (await db.ref(path + '/vaultMoney').get()).val();

describe('Worker del lavoro: il turno', () => {
  it('apre il turno con la carriera del salvataggio e versa la paga una volta sola', async () => {
    const db = await world();
    const start = await startJob(db, UID, ROOM, NOW, () => 't1');
    // 16 turni nel salvataggio: il 17° si paga 45 Đ + 6 Đ a oggetto
    expect(start).toEqual({
      status: 200,
      body: { ok: true, shift: 't1', base: 45, perItem: 6, exp: 16, left: 3 },
    });
    const end = await endJob(db, UID, { shift: 't1', delivered: 10, tips: 0, fine: 0 }, END);
    expect(end).toEqual({ status: 200, body: { ok: true, pay: 105, exp: 17 } });
    expect(await vault(db)).toBe(205);
    // la stessa richiesta di nuovo (rete che ripete): stessa risposta, niente soldi in più
    const again = await endJob(db, UID, { shift: 't1', delivered: 40, tips: 0, fine: 0 }, END);
    expect(again).toEqual({ status: 200, body: { ok: true, pay: 105, already: true } });
    expect(await vault(db)).toBe(205);
    // il salvataggio non si rilegge più: la carriera ora la tiene il server
    await db.ref('sims_saves/' + PID + '/jobExperience/cantiere').set(999);
    const next = await startJob(db, UID, ROOM, END + 1000, () => 't2');
    expect(next.body).toMatchObject({ base: 45, exp: 17, left: 2 });
  });

  it('niente paga prima della fine del turno, né per un turno mai aperto', async () => {
    const db = await world();
    await startJob(db, UID, ROOM, NOW, () => 't1');
    const early = await endJob(db, UID, { shift: 't1', delivered: 3 }, NOW + 10_000);
    expect(early).toMatchObject({ status: 400, body: { error: 'troppo presto' } });
    const fake = await endJob(db, UID, { shift: 'inventato', delivered: 3 }, END);
    expect(fake).toMatchObject({ status: 404, body: { error: 'nessun turno' } });
    expect(await vault(db)).toBe(100);
  });

  it('serve il personaggio aperto nel gioco e la propria stanza', async () => {
    const closed = await world({ ['sims_sessions/' + PID]: { id: 's', expiresAt: NOW - 600_000 } });
    expect(await startJob(closed, UID, ROOM, NOW, () => 't1')).toMatchObject({
      status: 403,
      body: { error: 'sessione' },
    });
    const db = await world({
      'sims_rooms_state/5': { id: 6, ownerId: 'player_altro', vaultMoney: 9 },
    });
    expect(await startJob(db, UID, { ...ROOM, room: 5 }, NOW, () => 't1')).toMatchObject({
      status: 403,
      body: { error: 'stanza' },
    });
    expect(await startJob(db, 'sconosciuto', ROOM, NOW, () => 't1')).toMatchObject({
      status: 403,
      body: { error: 'account' },
    });
    for (const bad of [
      { ...ROOM, job: 'astronauta' },
      { ...ROOM, world: 'CASA-????' },
      { ...ROOM, room: 64 },
      { ...ROOM, room: -1 },
    ])
      expect((await startJob(db, UID, bad, NOW, () => 't1')).status).toBe(400);
  });

  it('se la stanza nel frattempo non è più sua, la paga è persa (e non si richiede più)', async () => {
    const db = await world();
    await startJob(db, UID, ROOM, NOW, () => 't1');
    await db.ref('sims_rooms_state/2/ownerId').set('player_nuovo');
    const end = await endJob(db, UID, { shift: 't1', delivered: 5 }, END);
    expect(end).toMatchObject({ status: 409, body: { error: 'stanza' } });
    expect(await vault(db)).toBe(100);
    expect(await endJob(db, UID, { shift: 't1', delivered: 5 }, END)).toMatchObject({
      body: { ok: true, pay: 0, already: true },
    });
  });

  it('nei mondi nuovi la paga va nella stanza di quel mondo', async () => {
    const db = await world({
      'worlds/CASA-AB23/rooms_state/0': { id: 1, ownerId: PID, vaultMoney: 7 },
    });
    await startJob(db, UID, { ...ROOM, world: 'CASA-AB23', room: 0 }, NOW, () => 't1');
    await endJob(db, UID, { shift: 't1', delivered: 0 }, END);
    expect(await vault(db, 'worlds/CASA-AB23/rooms_state/0')).toBe(52);
    expect(await vault(db)).toBe(100);
  });

  it('la cassaforte non supera il milione', async () => {
    const db = await world({ 'sims_rooms_state/2/vaultMoney': 999_990 });
    await startJob(db, UID, ROOM, NOW, () => 't1');
    await endJob(db, UID, { shift: 't1', delivered: 4 }, END);
    expect(await vault(db)).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------- chi chiama

const PROJECT = 'casadolcecasa-prova';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY: TokenKey = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'k1' };
const keys = async () => [KEY];

function firebaseToken(claims: Record<string, unknown> = {}, kid = 'k1'): string {
  const seconds = NOW / 1000;
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = {
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: UID,
    iat: seconds - 60,
    exp: seconds + 3000,
    auth_time: seconds - 600,
    firebase: { sign_in_provider: 'google.com' },
    ...claims,
  };
  const unsigned = `${part({ alg: 'RS256', kid, typ: 'JWT' })}.${part(body)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

describe('Worker del lavoro: il token di Firebase', () => {
  const check = (token: string) => verifyFirebaseToken(token, PROJECT, NOW, keys);

  it('riconosce il giocatore da un token firmato da Google', async () => {
    expect(await check(firebaseToken())).toEqual({ uid: UID, provider: 'google.com' });
    expect(
      await check(firebaseToken({ firebase: { sign_in_provider: 'anonymous' } })),
    ).toMatchObject({ uid: UID });
  });

  it('rifiuta token scaduti, di altri progetti, falsi o con email non confermata', async () => {
    const seconds = NOW / 1000;
    expect(await check(firebaseToken({ exp: seconds - 3600 }))).toBeNull();
    expect(await check(firebaseToken({ aud: 'altro-progetto' }))).toBeNull();
    expect(await check(firebaseToken({ iss: 'https://securetoken.google.com/altro' }))).toBeNull();
    expect(await check(firebaseToken({}, 'chiave-sconosciuta'))).toBeNull();
    expect(
      await check(
        firebaseToken({ firebase: { sign_in_provider: 'password' }, email_verified: false }),
      ),
    ).toBeNull();
    expect(await check(firebaseToken({ sub: '' }))).toBeNull();
    // contenuto cambiato dopo la firma
    const [header, , signature] = firebaseToken().split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'altro' })).toString('base64url');
    expect(await check(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await check('non-un-token')).toBeNull();
  });
});

describe('Worker del lavoro: le richieste dal browser', () => {
  const env = {
    FIREBASE_PROJECT_ID: PROJECT,
    GAME_ORIGINS: 'https://tomm4so00.github.io',
  } as Env;
  const ORIGIN = 'https://tomm4so00.github.io';
  const request = (path: string, init: RequestInit = {}, origin = ORIGIN) =>
    new Request('https://worker.example' + path, {
      method: 'POST',
      ...init,
      headers: { origin, 'content-type': 'application/json', ...init.headers },
    });

  it('dal sito del gioco, con il token giusto, il turno si apre', async () => {
    const db = await world();
    const response = await handleJob(
      request('/lavoro/inizio', {
        body: JSON.stringify(ROOM),
        headers: { authorization: 'Bearer ' + firebaseToken() },
      }),
      env,
      NOW,
      keys,
      async () => db,
      () => 't1',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await response.json()).toMatchObject({ ok: true, shift: 't1' });
  });

  it('senza token non si apre niente; gli altri siti non leggono le risposte', async () => {
    const db = await world();
    const anonymous = await handleJob(
      request('/lavoro/inizio', { body: JSON.stringify(ROOM) }),
      env,
      NOW,
      keys,
      async () => db,
    );
    expect(anonymous.status).toBe(401);
    expect((await db.ref('sims_jobs/' + UID).get()).val()).toBeNull();
    const preflight = await handleJob(
      request('/lavoro/fine', { method: 'OPTIONS' }, 'https://sito-strano.example'),
      env,
      NOW,
      keys,
      async () => db,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });
});
