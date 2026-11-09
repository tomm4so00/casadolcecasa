// Coltivazione dall'inizio alla fine: vaso e semi al grow shop, semina e annaffiatura in camera,
// lampada, raccolto nello zaino. L'orologio della pagina va avanti a comando.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
/** Aspetta che la funzione (eseguita nella pagina, anche async) dia true. */
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Tempo scaduto aspettando: ' + fn);
}
const DAY = 86_400_000;
const game = (fn, arg) =>
  page.evaluate(
    async ([body, a]) => {
      const { game } = await import('/src/game/context.ts');
      return new Function('game', 'arg', `return (async () => { ${body} })()`)(game, a);
    },
    [fn, arg],
  );
const button = (name) => page.locator('#dialog-buttons').getByRole('button', { name, exact: true });
try {
  await page.clock.install({ time: new Date(2026, 10, 10, 12, 0, 0) });
  await page.goto(server.resolvedUrls.local[0] + '?offline=1');
  await page.locator('#nickname').fill('Prova orto');
  await page.locator('#start-game-btn').click();
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /^(Salta|Ho capito, si parte! ✅)$/ })
    .click();
  await game(`
    await (await import('/src/game/economy.ts')).creditMoney(3000);
    game.player.welcome = { i: 5, status: 'off', base: 0, snoozeUntil: 0 };
    game.pinPromptMoneyThreshold = Number.MAX_SAFE_INTEGER;
  `);

  // alla cassa: un vaso idroponico
  await game(`void (await import('/src/game/weed.ts')).openGrowCounter();`);
  await button('🪴 Vaso idroponico').click();
  await until(
    async () => (await import('/src/game/context.ts')).game.player.weed?.pots?.length === 1,
  );
  // all'espositore: 3 semi di Purple Haze
  await game(`void (await import('/src/game/weed.ts')).buySeeds('purple');`);
  await button('3 semi (630 Đ)').click();
  await until(
    async () => (await import('/src/game/context.ts')).game.player.weed?.seeds?.purple === 3,
  );
  assert.equal(await game('return game.moneyLevel;'), 3030 - 900 - 630);

  // in camera: si pianta (il vaso parte annaffiato)
  await game(`void (await import('/src/game/weed.ts')).tendPot(0);`);
  await button('Purple Haze (3)').click();
  await until(
    async () =>
      (await import('/src/game/context.ts')).game.player.weed?.pots?.[0]?.strain === 'purple',
  );
  // una Lampada Super sul vaso
  await game(`void (await import('/src/game/weed.ts')).openGrowCounter();`);
  await button('💡 Lampada per un vaso').click();
  await button('1. Purple Haze 🌱').click();
  await button('Lampada Super (900 Đ)').click();
  await until(
    async () => (await import('/src/game/context.ts')).game.player.weed?.pots?.[0]?.lamp === 3,
  );
  // un giorno e mezzo dopo si annaffia (l'idroponico regge 48 ore)
  // il personaggio di prova non deve morire di fame nel salto di tempo
  await game(
    `game.player.sleepLevel = game.player.hungerLevel = game.player.hygieneLevel = game.player.healthLevel = game.player.happinessLevel = 100;`,
  );
  await page.clock.fastForward(1.5 * DAY);
  await game(`void (await import('/src/game/weed.ts')).tendPot(0);`);
  await button('💧 Annaffia').click();
  await until(
    async () => (await import('/src/game/context.ts')).game.player.weed?.pots?.[0]?.missed === 0,
  );
  // pronta in 4 giorni / (1,25 × 1,5) ≈ 2,13 giorni: si raccoglie il massimo
  await game(
    `game.player.sleepLevel = game.player.hungerLevel = game.player.hygieneLevel = game.player.healthLevel = game.player.happinessLevel = 100;`,
  );
  await page.clock.fastForward(0.7 * DAY);
  assert.match(
    await game(`return (await import('/src/game/weed.ts')).potLabel(0);`),
    /Raccogli Purple Haze \(168 g\)/,
  );
  await game(`void (await import('/src/game/weed.ts')).tendPot(0);`);
  await until(async () => {
    // lo zaino si aggiorna un attimo prima del vaso: si aspettano tutti e due
    const w = (await import('/src/game/context.ts')).game.player.weed;
    return w?.grams === 168 && !w.pots?.[0]?.strain;
  });
  assert.deepEqual(await game('return game.player.weed.pots;'), [
    { kind: 'hydro', lamp: 3, x: 70, y: 118 },
  ]);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: vaso idroponico, semi, semina, Lampada Super, annaffiatura e raccolto di 168 g.',
  );
} finally {
  await browser.close();
  await server.close();
}
