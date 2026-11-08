import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => console.log('REQUEST', request.url()));
page.setDefaultTimeout(12000);
try {
  await page.goto(server.resolvedUrls.local[0] + '?offline=1');
  await page.locator('#nickname').fill('Verifica v8');
  await page.locator('#start-game-btn').click();
  // giocatore nuovo: prima sceglie il condominio (in prova c'è solo quello di sempre, CASA-0001)
  await page.locator('#world-modal [data-w="public"]').click();
  await page.locator('#creator-modal').waitFor({ state: 'visible' });
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.myAssignedRoomIdx !== null &&
      game.roomsState[game.myAssignedRoomIdx]?.ownerId === game.session.myPlayerId
    );
  });
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Salta', exact: true }).click();
  const catalog = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.pinPromptMoneyThreshold = 1e9;
    const { creditMoney } = await import('/src/game/economy.ts');
    await creditMoney(10000);
    return {
      rooms: game.roomsState.length,
      clothes: game.shopCatalog.length,
      furniture: game.furnitureCatalog.length,
      jobs: Object.keys(game.WORK_JOBS).length,
      business: game.BIZ.length,
      version: game.GAME_VERSION,
    };
  });
  assert.equal(catalog.version, 8);
  console.log('CATALOG', catalog);
  assert.equal(catalog.rooms, 64);
  assert(
    catalog.clothes === 78 &&
      catalog.furniture === 23 &&
      catalog.jobs === 4 &&
      catalog.business === 9,
  );
  await page.evaluate(async () => (await import('/src/game/character.ts')).openClothesShop('top'));
  await page.locator('#clothes-modal').waitFor({ state: 'visible' });
  await page.evaluate(async () =>
    (await import('/src/game/character.ts')).buyClothing('item_hoodie'),
  );
  await page.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('clothes-modal'),
  );
  // si sale di una fascia alla volta: il lusso senza il pregiato no, poi pregiato e lusso sì
  const skipped = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { buyFurnitureItem } = await import('/src/game/world.ts');
    await buyFurnitureItem('bed_lux');
    const skippedLux = !!game.player.ownedFurniture.bed_lux;
    await buyFurnitureItem('bed_pre');
    await buyFurnitureItem('bed_lux');
    return skippedLux;
  });
  assert.equal(skipped, false, 'il lusso non si compra prima del pregiato');
  await page.locator('#furniture-shop-modal').waitFor({ state: 'visible' });
  await page.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('furniture-shop-modal'),
  );
  await page.evaluate(async () => (await import('/src/game/business.ts')).openBizSite());
  await page.locator('#biz-modal').waitFor({ state: 'visible' });
  // si clicca il pulsante vero, su un'attività aggiunta dopo le tre di partenza
  await page.locator('#biz-modal [data-action="bizInvest"][data-arg="pizza"]').click();
  await page.locator('#dialog-input').fill('100');
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: 'Investi', exact: true })
    .click();
  await page.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('biz-modal'),
  );
  await page.evaluate(async () =>
    (await import('/src/game/world.ts')).chooseOrGoToJob('ufficio', 'Ufficio'),
  );
  const shift = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.activeShift.remaining = 0.1;
    await (await import('/src/game/jobs.ts')).updateShift(1);
    return {
      turns: game.player.jobExperience.ufficio,
      owned: game.player.ownedItems.item_hoodie,
      bed: game.player.ownedFurniture.bed_lux,
      invest: game.player.invest.pizza?.cost,
    };
  });
  assert.deepEqual(shift, { turns: 1, owned: true, bed: true, invest: 100 });
  // A fine turno compare il riepilogo della paga: lo chiude come farebbe il giocatore.
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Ok', exact: true }).click();
  await page.evaluate(async () => (await import('/src/game/chat.ts')).openGlobalChat());
  await page.locator('#gchat-input').fill('Messaggio di prova offline');
  await page.evaluate(async () => (await import('/src/game/chat.ts')).sendChat());
  await page.getByText('Messaggio di prova offline', { exact: true }).waitFor();
  await page.evaluate(async () => (await import('/src/game/chat.ts')).closeGlobalChat());
  await page.locator('#btn-inventory').click();
  await page.locator('#inventory-modal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.inventory-slot').count(), 20);
  assert.equal(await page.locator('#inventory-count').textContent(), '0/20 spazi occupati');
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { inventoryChange } = await import('/src/game/inventory-market.ts');
    await inventoryChange((ledger) => ledger.buy('weed', 42, 0));
    await inventoryChange((ledger) => ledger.buy('drug', 3, 0));
    game.player.weed = { grams: 42, jarStrain: 'lemon' };
    (await import('/src/game/inventory.ts')).updateInventory();
  });
  await page.getByRole('button', { name: 'Erba: 42 g', exact: true }).click();
  assert.match(await page.locator('#inventory-details').textContent(), /Lemon Haze/);
  assert.equal(await page.locator('#inventory-smoke').isDisabled(), true);
  assert.match(await page.locator('#inventory-use-hint').textContent(), /all’aperto/);
  await page.getByRole('button', { name: 'Dosi: 3 dosi', exact: true }).click();
  assert.match(await page.locator('#inventory-details').textContent(), /3 dosi/);
  assert.equal(await page.locator('#inventory-count').textContent(), '2/20 spazi occupati');
  await page.keyboard.press('Escape');
  await page.locator('#inventory-modal').waitFor({ state: 'hidden' });
  assert.equal(
    await page.locator('#btn-inventory').evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('#btn-inventory').click();
  assert.equal(await page.locator('#inventory-count').textContent(), '2/20 spazi occupati');
  await page.getByRole('button', { name: 'Chiudi lo zaino', exact: true }).click();
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { applyRoomBounds } = await import('/src/game/room-size.ts');
    game.view.activeEnvironment = 'CORTILE';
    applyRoomBounds('CORTILE');
    game.playerPos = { x: 0, y: 150 };
    game.player.happinessLevel = 50;
  });
  await page.locator('#btn-inventory').click();
  await page.getByRole('button', { name: 'Erba: 42 g', exact: true }).click();
  assert.equal(await page.locator('#inventory-smoke').isEnabled(), true);
  await page.locator('#inventory-smoke').click();
  await page.locator('#inventory-modal').waitFor({ state: 'hidden' });
  const joint = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { isSmoking, smokeJoint } = await import('/src/game/weed.ts');
    const { renderEnvironment } = await import('/src/game/engine.ts');
    const { buildSaveData } = await import('/src/game/saves.ts');
    const before = { ...game.playerPos };
    game.moveRight = 1;
    renderEnvironment(0.1, game.animClock);
    const blocked = game.playerPos.x === before.x && game.playerPos.y === before.y;
    game.moveRight = 0;
    return {
      grams: game.player.weed.grams,
      happiness: Math.round(game.player.happinessLevel),
      smoking: isSmoking(),
      blocked,
      canRepeat: await smokeJoint(),
      persisted:
        buildSaveData().stonedUntil === game.player.stonedUntil &&
        buildSaveData().jointReadyAt === game.player.jointReadyAt,
      remaining: game.player.stonedUntil - Date.now(),
      cooldown: game.player.jointReadyAt - Date.now(),
    };
  });
  assert.equal(joint.grams, 41);
  assert.equal(joint.happiness, 60);
  assert.equal(joint.smoking, true);
  assert.equal(joint.blocked, true);
  assert.equal(joint.canRepeat, false);
  assert.equal(joint.persisted, true);
  assert(joint.remaining > 590_000 && joint.remaining <= 600_000);
  assert(joint.cooldown > 1_790_000 && joint.cooldown <= 1_800_000);
  const jointReload = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { buildSaveData, applySave } = await import('/src/game/saves.ts');
    const { smokeJointError, isStoned } = await import('/src/game/weed.ts');
    // Gli effetti sono finiti; l'attesa deve restare nel salvataggio e al caricamento.
    game.player.stonedUntil = Date.now() - 1;
    const data = JSON.parse(JSON.stringify(buildSaveData()));
    game.player.jointReadyAt = 0;
    applySave(data);
    return { stoned: isStoned(), error: smokeJointError(), cooldown: data.jointReadyAt };
  });
  assert.equal(jointReload.stoned, false);
  assert.match(jointReload.error, /Aspetta ancora/);
  assert(jointReload.cooldown > 0);
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { worldNode } = await import('/src/game/world-db.ts');
    await game.session.db
      .ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}/inventory/items`)
      .set({ weed: 0, drug: 0 });
    game.player.weed = { grams: 0 };
    game.player.drugStock = 0;
    game.player.stonedUntil = 0;
    game.player.jointReadyAt = 0;
    game.smokeUntil = 0;
  });
  const bankCollision = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { getSolidObstacles, collidesAt } = await import('/src/game/engine.ts');
    game.view.activeEnvironment = 'banca';
    const obstacles = getSolidObstacles();
    return {
      leftCorner: collidesAt(-105, -60, obstacles),
      rightCorner: collidesAt(105, -60, obstacles),
      counterEdge: collidesAt(0, -30, obstacles),
      frontAccess: collidesAt(0, -20, obstacles),
      leftPassage: collidesAt(-125, -60, obstacles),
    };
  });
  assert.deepEqual(bankCollision, {
    leftCorner: true,
    rightCorner: true,
    counterEdge: true,
    frontAccess: false,
    leftPassage: false,
  });
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    for (const env of [
      'SALOON',
      'CORTILE',
      'KITCHEN',
      'BATHROOM',
      'PLAYER_ROOM',
      'passeggiata',
      'bar',
      'viaggio',
      'discoteca',
      'negozio_vestiti',
      'negozio_mobili',
      'banca',
      'laboratorio',
      'CIMITERO',
      'lavoro_cantiere',
      'lavoro_ospedale',
      'lavoro_ristorante',
      'lavoro_ufficio',
    ]) {
      game.view.activeEnvironment = env;
      game.currentRoomIdx = game.myAssignedRoomIdx;
      (await import('/src/game/engine.ts')).renderEnvironment(0, game.animClock);
    }
    game.view.activeEnvironment = 'PLAYER_ROOM';
    await (await import('/src/game/saves.ts')).saveGame(true);
  });
  const before = await page.evaluate(async () =>
    JSON.parse(localStorage.getItem('offline_sims_save_v1')),
  );
  assert.equal(before.ownedItems.item_hoodie, true);
  assert.equal(before.ownedFurniture.bed_lux, true);
  assert.equal(before.jobExperience.ufficio, 1);
  await page.screenshot({ path: 'test-results/latest-v8.png' });
  await page.reload();
  await page.locator('#ui-setup-screen').waitFor({ state: 'visible' });
  await page.locator('#start-game-btn').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'hidden' });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.player.ownedItems.item_hoodie &&
      game.player.jobExperience.ufficio === 1 &&
      game.player.invest.pizza?.cost === 100
    );
  });
  await page.reload();
  await page.locator('#start-game-btn').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'hidden' });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.player.ownedFurniture.bed_lux && game.player.ownedItems.item_hoodie;
  });
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { lifetime } = await import('/src/game/runtime.ts');
    const { buildSaveData } = await import('/src/game/saves.ts');
    game.player.healthLevel = 50;
    game.player.sleepLevel = 50;
    game.player.hungerLevel = 80;
    game.player.hygieneLevel = 80;
    game.player.isSleeping = true;
    game.player.sleepGainedSinceLastHealthBoost = 0;
    const save = buildSaveData();
    save.savedAt = Date.now() - 2 * 3600000;
    lifetime.dispose();
    await game.session.db.ref('sims_saves/' + game.session.myPlayerId).set(save);
    localStorage.setItem(game.session.SAVE_KEY, JSON.stringify(save));
  });
  await page.reload();
  await page.locator('#start-game-btn').click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.player.isSleeping &&
      game.player.sleepLevel >= 86 &&
      game.player.sleepLevel <= 89 &&
      game.player.healthLevel >= 55 &&
      game.view.activeEnvironment === 'PLAYER_ROOM'
    );
  });
  console.log('PASS: two hours of offline sleep with luxury bed, health bonus and bedroom resume.');
  // trasloco in un condominio nuovo: la stanza (cassaforte compresa) viene con il giocatore
  const beforeMove = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const room = game.roomsState[game.myAssignedRoomIdx];
    return { world: game.session.worldId, idx: game.myAssignedRoomIdx, vault: room.vaultMoney };
  });
  assert.equal(beforeMove.world, 'CASA-0001');
  await page.evaluate(() => {
    void import('/src/game/interface.ts').then((m) => m.openProfile());
  });
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /Cambia condominio/ })
    .click();
  await page.locator('#world-modal [data-w="create"]').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'visible' });
  await page.locator('#start-game-btn').click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      /^CASA-/.test(game.session.worldId) &&
      game.session.worldId !== 'CASA-0001' &&
      game.roomsState[game.myAssignedRoomIdx]?.ownerId === game.session.myPlayerId
    );
  });
  const moved = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const old = (await game.session.db.ref('sims_rooms_state').get()).val() || [];
    const index = (await game.session.db.ref('sims_worlds/' + game.session.worldId).get()).val();
    return {
      vault: game.roomsState[game.myAssignedRoomIdx].vaultMoney,
      stillInOld: Object.values(old).some((r) => r && r.ownerId === game.session.myPlayerId),
      free: index?.free,
    };
  });
  assert.equal(moved.vault, beforeMove.vault);
  assert.equal(moved.stillInOld, false);
  assert.equal(moved.free, 63);
  console.log('PASS: new world, room and vault moved, old room freed, 63 free rooms left.');
  console.log('CATALOG', catalog);
  console.log('ERRORS', errors);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: v8 creator, 64 rooms, clothes, furniture, investments, jobs, chat, 16 scenes and saves.',
  );
} finally {
  await browser.close();
  await server.close();
}
