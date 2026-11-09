// Prova degli inviti con gli emulatori di Firebase: chi arriva da un link riceve 300Đ, e
// altrettanti ne riceve chi l'ha invitato, qualunque sia il modo di accedere.
//   npm run test:invite
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Test consentito solo con gli emulatori.');
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'fake-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-casadolcecasa.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo-casadolcecasa-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-casadolcecasa',
  VITE_FIREBASE_APP_ID: 'demo-app-id',
  VITE_FIREBASE_EMULATORS: 'true',
});
const BONUS = 300;
const namespace = 'demo-casadolcecasa-default-rtdb';
const headers = { Authorization: 'Bearer owner' };
const rulesLoaded = await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${namespace}`, {
  method: 'PUT',
  headers,
  body: await readFile(
    new URL('../firebase/database.rules.proposed.json', import.meta.url),
    'utf8',
  ),
});
assert.equal(rulesLoaded.ok, true, 'regole rifiutate: ' + (await rulesLoaded.text()));
await fetch(`http://127.0.0.1:9000/.json?ns=${namespace}`, {
  method: 'PUT',
  headers,
  body: 'null',
});

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0] + '';
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const errors = [];

async function newPage() {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}

const money = (page) =>
  page.evaluate(async () => (await import('/src/game/context.ts')).game.moneyLevel);
const playerId = (page) =>
  page.evaluate(async () => (await import('/src/game/context.ts')).game.session.myPlayerId);

/** Ripete `check` nella pagina finché non è vero (waitForFunction non aspetta le funzioni async). */
async function until(page, check, arg, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(check, arg)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Aspetta che il saldo della cassaforte diventi `expected` (o fallisce col saldo vero). */
async function waitMoney(page, expected, what) {
  const ok = await until(
    page,
    async (n) => (await import('/src/game/context.ts')).game.moneyLevel === n,
    expected,
  );
  if (!ok) assert.fail(`${what}: attesi ${expected} Đ, in cassaforte ${await money(page)} Đ`);
}

const hasRoomNow = async () => {
  const { game } = await import('/src/game/context.ts');
  return (
    typeof game.myAssignedRoomIdx === 'number' && game.myAssignedRoomIdx >= 0 && game.vaultSynced
  );
};

/** Dopo l'accesso: condominio pubblico, personaggio, salto della guida. */
async function finishNewSim(page) {
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /^(Salta|Ho capito, si parte! ✅)$/ })
    .click();
  if (!(await until(page, hasRoomNow)))
    assert.fail(
      'stanza non assegnata: ' +
        (await page.locator('body').innerText()).slice(0, 800) +
        JSON.stringify(
          await page.evaluate(async () => {
            const { game } = await import('/src/game/context.ts');
            return [
              game.myAssignedRoomIdx,
              game.vaultSynced,
              game.moneyLevel,
              game.session.worldId,
            ];
          }),
        ),
    );
}

async function googleSim(page, email, nick) {
  await page.evaluate(
    async (e) => (await import('/tests/auth-fixture.ts')).signInTestUser(e),
    email,
  );
  await page.locator('#cloud-game-btn').click();
  await page.locator('#setup-new-sim').click();
  await page.locator('#setup-nickname').fill(nick);
  await page.locator('#setup-create-sim').click();
  await finishNewSim(page);
}

/** Account con email e password, già confermata (il link dell'email lo dà per fatto). */
async function passwordSim(page, email, password) {
  const auth = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
  const created = await (
    await fetch(`${auth}/accounts:signUp?key=fake-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: 'Nuova', returnSecureToken: true }),
    })
  ).json();
  assert(created.localId, 'account non creato: ' + JSON.stringify(created));
  const verified = await fetch(`${auth}/projects/demo-casadolcecasa/accounts:update`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: created.localId, emailVerified: true }),
  });
  assert(verified.ok, 'email non confermata: ' + (await verified.text()));
  await page.evaluate(async () => {
    const { firebaseClient } = await import('/src/game/runtime.ts');
    const a = firebaseClient.auth();
    if (!a.emulatorConfig) a.useEmulator('http://127.0.0.1:9099');
  });
  await page.locator('#setup-username').fill(email);
  await page.locator('#setup-password').fill(password);
  await page.locator('#setup-password-login').click();
  await finishNewSim(page);
}

let failed = false;
try {
  // Chi invita: un giocatore qualunque. Il suo saldo iniziale è quello di ogni nuovo arrivato.
  const anna = await newPage();
  await anna.goto(url);
  await googleSim(anna, 'anna@example.com', 'Anna');
  const start = await money(anna);
  const annaId = await playerId(anna);
  assert.equal(start, 30, 'saldo iniziale di un nuovo arrivato');
  const link = `${url}?invito=${encodeURIComponent(annaId)}`;
  let annaExpected = start;

  const check = async (what, page, pageExpected) => {
    await waitMoney(page, pageExpected, what + ' (invitato)');
    annaExpected += BONUS;
    await waitMoney(anna, annaExpected, what + ' (Anna, in partita)');
    console.log('PASS:', what);
  };

  // 1. Google, dal link
  const bruno = await newPage();
  await bruno.goto(link);
  await googleSim(bruno, 'bruno@example.com', 'Bruno');
  await check('Google dal link', bruno, start + BONUS);
  assert.equal(new URL(bruno.url()).searchParams.has('invito'), false, 'codice tolto dal link');

  // 2. Email e password, dal link
  const carla = await newPage();
  await carla.goto(link);
  await passwordSim(carla, 'carla@example.com', 'segreta123');
  await check('email e password dal link', carla, start + BONUS);

  // 3. Il link aperto, poi la pagina ricaricata senza codice (accesso con Google che ricarica)
  const dario = await newPage();
  await dario.goto(link);
  await dario.goto(url);
  await googleSim(dario, 'dario@example.com', 'Dario');
  await check('Google dopo una pagina ricaricata', dario, start + BONUS);

  // 4. Chi invita è fuori dal gioco: ritira il bonus al prossimo ingresso
  await anna.context().close();
  const elena = await newPage();
  await elena.goto(link);
  await googleSim(elena, 'elena@example.com', 'Elena');
  await waitMoney(elena, start + BONUS, 'Anna assente (invitata)');
  const anna2 = await newPage();
  await anna2.goto(url);
  await anna2.evaluate(
    async (e) => (await import('/tests/auth-fixture.ts')).signInTestUser(e),
    'anna@example.com',
  );
  await anna2.locator('#cloud-game-btn').click();
  annaExpected += BONUS;
  await waitMoney(anna2, annaExpected, 'Anna assente (al rientro)');
  console.log('PASS: chi invita era fuori dal gioco e ritira al rientro');

  // 5. Chi gioca già e riapre il link non riceve niente (e neanche Anna)
  await bruno.goto(link);
  await bruno.evaluate(
    async (e) => (await import('/tests/auth-fixture.ts')).signInTestUser(e),
    'bruno@example.com',
  );
  await bruno.locator('#cloud-game-btn').click();
  assert(await until(bruno, hasRoomNow), 'Bruno senza stanza al rientro');
  // il saldo arriva dalla stanza; poi si lascia il tempo a un eventuale bonus sbagliato
  await waitMoney(bruno, start + BONUS, 'chi gioca già, al rientro');
  await bruno.waitForTimeout(4000);
  assert.equal(await money(bruno), start + BONUS, 'chi gioca già non riceve un secondo bonus');
  assert.equal(await money(anna2), annaExpected, 'niente bonus per un giocatore che c’era già');
  console.log('PASS: nessun bonus a chi gioca già');

  // nel database: ogni cassaforte col suo bonus, ogni invito segnato come pagato
  const all = await (
    await fetch(`http://127.0.0.1:9000/.json?ns=${namespace}`, { headers })
  ).json();
  const vaults = Object.fromEntries(
    Object.values(all.sims_rooms_state)
      .filter((r) => r?.ownerId)
      .map((r) => [r.owner, r.vaultMoney]),
  );
  assert.deepEqual(vaults, {
    Anna: start + 4 * BONUS,
    Bruno: start + BONUS,
    Nuova: start + BONUS,
    Dario: start + BONUS,
    Elena: start + BONUS,
  });
  const invites = Object.values(all.sims_invites[annaId]);
  assert.equal(invites.length, 4);
  assert(invites.every((i) => i.paid === true));
  assert.deepEqual(errors, []);
  console.log('PASS: inviti con Google, email e password, pagina ricaricata, invitante assente.');
} catch (e) {
  failed = true;
  console.error('FAIL:', e.message);
  console.error('Errori della pagina:', errors);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
