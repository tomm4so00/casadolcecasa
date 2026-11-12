import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page
    .getByRole('button', { name: '🧪 Entra con Sim di prova (salta login)', exact: true })
    .click();
  await page.locator('#dev-test-tools').waitFor();
  const state = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return {
      offline: game.session.OFFLINE,
      nick: game.player.myData.nick,
      room: game.myAssignedRoomIdx,
      bodyChosen: game.bodyChosen,
      body: game.myBody,
      environment: game.view.activeEnvironment,
      money: game.moneyLevel,
      pinSet: game.hasSetSafePin,
      pin: (await game.session.db.ref('sims_safe_pins/' + game.session.myPlayerId).get()).val(),
      expectedPin: (await import('/src/game/safe-pin.ts')).hashPin('123', game.session.myPlayerId),
    };
  });
  assert.equal(state.offline, true);
  assert.equal(state.nick, 'Sim di prova');
  assert.notEqual(state.room, null);
  assert.equal(state.bodyChosen, true);
  assert.ok(state.body);
  assert.equal(state.environment, 'SALOON');
  assert.equal(state.money, 200);
  assert.equal(state.pinSet, true);
  assert.equal(state.pin, state.expectedPin);
  assert.equal(await page.getByRole('button', { name: 'Senza droga', exact: true }).count(), 0);
  assert.equal(await page.locator('#creator-modal').isVisible(), false);
  assert.equal(await page.locator('#world-modal').isVisible(), false);
  for (const [key, title] of Object.entries({
    cantiere: 'Cantiere',
    ospedale: 'Ospedale',
    ristorante: 'Ristorante',
    ufficio: 'Ufficio',
  })) {
    await page.getByRole('button', { name: 'Scenario lavori', exact: true }).click();
    await page
      .locator('#dev-work-choices')
      .getByRole('button', { name: title, exact: true })
      .click();
    await page.locator('#work-start').waitFor({ state: 'visible' });
    const shift = await page.evaluate(async () => {
      const { game } = await import('/src/game/context.ts');
      return {
        environment: game.view.activeEnvironment,
        job: game.activeShift.jobKey,
        remaining: game.activeShift.remaining,
        duration: game.SHIFT_SECONDS,
      };
    });
    assert.equal(shift.environment, 'lavoro_' + key);
    assert.equal(shift.job, key);
    assert.equal(shift.remaining, shift.duration);
    await page.locator('#work-start').waitFor({ state: 'detached' });
  }
  await page.getByRole('button', { name: 'Scenario poliziotto', exact: true }).click();
  await page.locator('#dev-test-tools[data-scenario="police"]').waitFor();
  // L'inseguimento non scade per tempo, distanza o ostacoli: termina uscendo dal luogo.
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { updatePolice, policeLine } = await import('/src/game/raid-police.ts');
    const { getSolidObstacles } = await import('/src/game/engine.ts');
    const bot = game.simulationBots.find((b) => b.dealer && b.env === 'passeggiata');
    const realNow = Date.now;
    const start = realNow();
    try {
      if (policeLine(bot).some((line) => line.includes('scappare')))
        throw new Error('Minaccia prima del sospetto');
      game.playerPos = { x: bot.x + 35, y: bot.y };
      updatePolice(bot, 0, getSolidObstacles());
      if (policeLine(bot).some((line) => line.includes('scappare')))
        throw new Error('Minaccia prima del fumetto odore');
      Date.now = () => start + 60_000;
      game.playerPos = { x: 300, y: 210 };
      updatePolice(bot, 0.1, getSolidObstacles());
      if (!policeLine(bot).some((line) => line.includes('scappare')))
        throw new Error('Inseguimento terminato per tempo o distanza');
      game.view.activeEnvironment = 'CORTILE';
      updatePolice(bot, 0, []);
      if (policeLine(bot).some((line) => line.includes('scappare')))
        throw new Error('Inseguimento ancora attivo dopo uscita');
    } finally {
      Date.now = realNow;
    }
    await window.testGame.police();
  });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.view.activeEnvironment === 'passeggiata' &&
      game.player.weed.grams === 20 &&
      game.player.drugStock === 3
    );
  });
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const bot = game.simulationBots.find((b) => b.dealer && b.env === 'passeggiata');
    if (Math.hypot(game.playerPos.x - bot.x, game.playerPos.y - bot.y) < 100)
      throw new Error('Spawn troppo vicino');
    game.playerPos = { x: bot.x + 35, y: bot.y };
  });
  // Nessun pulsante di dialogo: la vicinanza avvia il fumetto e poi l'inseguimento.
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    const bot = game.simulationBots.find((b) => b.dealer && b.env === 'passeggiata');
    return Math.hypot(bot.vx, bot.vy) > 0;
  });
  await page.getByRole('button', { name: 'Paga multa (100 Đ)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Paga multa (100 Đ)', exact: true }).click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.moneyLevel === 100 && game.player.weed.grams === 20 && game.player.drugStock === 3;
  });
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Ricomincia', exact: true }).click(),
  ]);
  await page.locator('#dev-test-tools').waitFor();

  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.view.activeEnvironment === 'passeggiata' &&
      game.player.weed.grams === 20 &&
      game.player.drugStock === 3
    );
  });
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const bot = game.simulationBots.find((b) => b.dealer && b.env === 'passeggiata');
    if (Math.hypot(game.playerPos.x - bot.x, game.playerPos.y - bot.y) < 100)
      throw new Error('Spawn troppo vicino');
    game.playerPos = { x: bot.x + 35, y: bot.y };
  });
  await page.getByRole('button', { name: 'Consegna tutta la droga', exact: true }).click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.player.drugStock === 0 && game.player.weed.grams === 0;
  });
  await page.getByRole('button', { name: 'Salta attesa 15 min', exact: true }).click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.simulationBots.some((b) => b.dealer && b.env === 'passeggiata' && b.policeSmoking);
  });
  await page.evaluate(async () =>
    (await import('/src/game/dealers.ts')).openStreetDealer('passeggiata'),
  );
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.simulationBots.some((b) => b.dealer && b.say === 'CIRCOLAREEE');
  });
  // Le uscite dei luoghi ricreativi sono zone attraversabili a piedi.
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.playerPos = { x: 0, y: 150 };
  });
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { checkWalkThrough } = await import('/src/game/interactions.ts');
    game.playerPos = { x: 0, y: 305 };
    game.isWalking = true;
    checkWalkThrough();
  });
  await page.waitForFunction(
    async () => (await import('/src/game/context.ts')).game.view.activeEnvironment === 'CORTILE',
  );
  await page.getByRole('button', { name: 'Senza droga', exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(
    await page.getByRole('button', { name: 'Consegna tutta la droga', exact: true }).isVisible(),
    false,
  );
  await page.evaluate(async () => {
    void (await import('/src/game/dealers.ts')).openStreetDealer('passeggiata');
  });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.simulationBots.some((b) => b.dealer && b.say?.includes('Controllo di polizia'));
  });
  await page.getByRole('button', { name: 'Test generico', exact: true }).click();
  await page.locator('#dev-test-tools[data-scenario="generic"]').waitFor();
  const fresh = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return {
      env: game.view.activeEnvironment,
      money: game.moneyLevel,
      weed: game.player.weed?.grams ?? 0,
      pills: game.player.drugStock,
    };
  });
  assert.deepEqual(fresh, { env: 'SALOON', money: 200, weed: 0, pills: 0 });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: accesso diretto, inseguimento automatico, multa, sequestro, easter egg, uscita a piedi e controllo senza droga.',
  );
} finally {
  await browser.close();
  await server.close();
}
