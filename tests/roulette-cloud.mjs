// Prova della roulette con gli emulatori di Firebase: Ada e Bea sono allo stesso tavolo, puntano,
// vedono le puntate l'una dell'altra, vedono lo stesso numero e incassano quello che devono.
//   npm run test:roulette
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
// le regole come si pubblicano: compattate (firebase/compact-rules.mjs)
import { compactRules } from '../firebase/compact-rules.mjs';

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
const namespace = 'demo-casadolcecasa-default-rtdb';
const headers = { Authorization: 'Bearer owner' };
const db = (path) => `http://127.0.0.1:9000/${path}.json?ns=${namespace}`;
const rulesLoaded = await fetch(db('.settings/rules'), {
  method: 'PUT',
  headers,
  body: compactRules(
    await readFile(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
  ),
});
assert.equal(rulesLoaded.ok, true, 'regole rifiutate: ' + (await rulesLoaded.text()));
await fetch(db(''), { method: 'PUT', headers, body: 'null' });

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0] + '';
const browser = await chromium.launch(
  process.platform === 'win32' ? { channel: 'msedge', args: ['--disable-gpu'] } : {},
);
const errors = [];

async function newPage() {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, check, arg, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(check, arg)) return true;
    await sleep(250);
  }
  return false;
}
const money = (page) =>
  page.evaluate(async () => (await import('/src/game/context.ts')).game.moneyLevel);

async function newSim(page, email, nick) {
  await page.evaluate(
    async (e) => (await import('/tests/auth-fixture.ts')).signInTestUser(e),
    email,
  );
  await page.locator('.setup-have').click();
  await page.locator('#cloud-game-btn').click();
  await page.locator('#setup-new-sim').click();
  await page.locator('#setup-nickname').fill(nick);
  await page.locator('#setup-create-sim').click();
  await acceptTerms(page);
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /^(Salta|Ho capito, si parte! ✅)$/ })
    .click();
  assert(
    await until(page, async () => {
      const { game } = await import('/src/game/context.ts');
      return game.myAssignedRoomIdx >= 0 && game.moneyLevel === 30;
    }),
    nick + ' non è entrato',
  );
  // qualche soldo per puntare, poi alla sala scommesse e al tavolo
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.pinPromptMoneyThreshold = 1e9;
    await (await import('/src/game/economy.ts')).creditMoney(470);
    await (await import('/src/game/world.ts')).doActivity('betting');
    (await import('/src/game/roulette.ts')).openRoulette();
  });
  assert(await until(page, async () => !!document.querySelector('#roulette-modal [data-bet]')));
}

/** Il giro, la fase e il tempo che manca, con l'ora del server della pagina. */
const phase = (page) =>
  page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { phaseAt } = await import('/src/game/roulette-rules.ts');
    return phaseAt(Date.now() + (game.session.serverOffset || 0));
  });

let failed = false;
try {
  const ada = await newPage();
  const bea = await newPage();
  await ada.goto(url);
  await bea.goto(url);
  await newSim(ada, 'ada@example.com', 'Ada');
  await newSim(bea, 'bea@example.com', 'Bea');
  // si aspetta l'inizio di un giro, con le puntate aperte per un bel po'
  for (;;) {
    const p = await phase(ada);
    if (p.phase === 'bet' && p.left > 15000) break;
    await sleep(500);
  }
  const round = (await phase(ada)).round;
  // Ada punta 25 Đ sul rosso (fiche da 25), Bea 10 Đ sul 17 (fiche da 10)
  await ada.locator('#roulette-modal [data-chip="25"]').click();
  await ada.locator('#roulette-modal [data-bet="red"]').click();
  await bea.locator('#roulette-modal [data-chip="10"]').click();
  await bea.locator('#roulette-modal [data-bet="n17"]').click();
  assert(
    await until(ada, async () => (await import('/src/game/context.ts')).game.moneyLevel === 475),
  );
  assert(
    await until(bea, async () => (await import('/src/game/context.ts')).game.moneyLevel === 490),
  );
  console.log('PASS: le puntate tolgono i soldi dalla cassaforte');
  // ognuna vede la puntata dell'altra al tavolo
  assert(
    await until(ada, async () =>
      /Bea<\/b>: 10 Đ/.test(document.querySelector('#roulette-modal .rl-players')?.innerHTML || ''),
    ),
    'Ada non vede la puntata di Bea',
  );
  assert(
    await until(bea, async () =>
      /Ada<\/b>: 25 Đ/.test(document.querySelector('#roulette-modal .rl-players')?.innerHTML || ''),
    ),
    'Bea non vede la puntata di Ada',
  );
  console.log('PASS: allo stesso tavolo si vedono le puntate degli altri');
  // con SHOT_DIR si fotografano il tavolo e la sala (per controllare a occhio)
  const shots = process.env.SHOT_DIR;
  if (shots) {
    await ada.screenshot({ path: `${shots}/roulette-puntate.png` });
    for (;;) {
      const p = await phase(ada);
      if (p.phase === 'spin' && p.since > 28000) break;
      await sleep(200);
    }
    await ada.screenshot({ path: `${shots}/roulette-gira.png` });
    await bea.evaluate(async () => (await import('/src/game/roulette.ts')).closeRoulette());
    await bea.evaluate(async () => {
      (await import('/src/game/context.ts')).game.playerPos = { x: -20, y: 175 };
    });
    await sleep(600);
    await bea.screenshot({ path: `${shots}/roulette-sala.png` });
  }
  // dopo le puntate la ruota gira; il numero è lo stesso per tutte e due
  let n = null;
  for (let i = 0; i < 160 && n === null; i++) {
    const res = await (await fetch(db('sims_roulette/results/' + round), { headers })).json();
    if (res && Number.isInteger(res.n)) n = res.n;
    else await sleep(250);
  }
  assert(n !== null, 'nessuno ha estratto il numero');
  console.log('PASS: il numero è uscito:', n);
  const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
  const adaExpected = 475 + (red ? 50 : 0);
  const beaExpected = 490 + (n === 17 ? 360 : 0);
  const waitMoney = async (page, expected, who) =>
    assert(
      await until(
        page,
        async (e) => (await import('/src/game/context.ts')).game.moneyLevel === e,
        expected,
        30000,
      ),
      `${who}: attesi ${expected} Đ, in cassaforte ${await money(page)} Đ`,
    );
  await waitMoney(ada, adaExpected, 'Ada');
  await waitMoney(bea, beaExpected, 'Bea');
  console.log(`PASS: vincite giuste (Ada ${adaExpected} Đ, Bea ${beaExpected} Đ)`);
  // il giro si chiude per tutte e due (anche chi perde lo segna), e nessuno incassa due volte
  let paid = {};
  for (let i = 0; i < 160 && Object.keys(paid || {}).length < 2; i++) {
    paid = await (await fetch(db('sims_roulette/paid/' + round), { headers })).json();
    await sleep(250);
  }
  assert.equal(Object.keys(paid || {}).length, 2, 'il giro non si è chiuso per tutte e due');
  await sleep(3000);
  assert.equal(await money(ada), adaExpected, 'Ada ha incassato due volte');
  assert.equal(await money(bea), beaExpected, 'Bea ha incassato due volte');
  // le puntate del giro chiuso si tolgono dal database
  const left = await (await fetch(db('sims_roulette/bets/' + round), { headers })).json();
  assert.equal(left, null, 'le puntate del giro chiuso sono rimaste');
  console.log('PASS: ognuna chiude il giro una volta sola');
  assert.deepEqual(errors, []);
  console.log('PASS: roulette multigiocatore (puntate, tavolo condiviso, numero unico, vincite).');
} catch (e) {
  failed = true;
  console.error('FAIL:', e.message);
  console.error('Errori della pagina:', errors);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

/** Il primo personaggio (first-entry.ts): la casella dei 18 anni, poi "Entra in casa". */
async function acceptTerms(p) {
  await p.locator('#creator-adult-check').check();
  await p.locator('#creator-ok').click();
}
