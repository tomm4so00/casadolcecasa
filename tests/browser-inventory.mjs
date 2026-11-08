// Percorso completo: spacciatore, consumo, vendita, regalo e annullamento dallo stesso menu.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(server.resolvedUrls.local[0] + '?offline=1');
  await page.locator('#nickname').fill('Prova zaino');
  await page.locator('#start-game-btn').click();
  // giocatore nuovo: si entra nel condominio di sempre
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Salta', exact: true }).click();
  const before = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    await (await import('/src/game/economy.ts')).creditMoney(500);
    game.player.welcome = { i: 5, status: 'off', base: 0, snoozeUntil: 0 };
    // niente richiesta del PIN della cassaforte a metà prova
    game.pinPromptMoneyThreshold = Number.MAX_SAFE_INTEGER;
    return { happiness: Math.round(game.player.happinessLevel), money: game.moneyLevel };
  });
  await page.evaluate(async () => {
    void (await import('/src/game/needs.ts')).openDealer();
  });
  assert.equal(await page.locator('#dialog-buttons button').count(), 2);
  assert.equal(
    await page.getByRole('button', { name: /Compra e assumi|Compra da portare via/ }).count(),
    0,
  );
  await page.getByRole('button', { name: 'Compra (30 Đ)', exact: true }).click();
  await page.waitForFunction(
    async () => (await import('/src/game/context.ts')).game.player.drugStock === 1,
  );
  const bought = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return {
      active: game.player.drug.active,
      happiness: Math.round(game.player.happinessLevel),
      money: game.moneyLevel,
    };
  });
  assert.equal(bought.active, false);
  assert.equal(bought.happiness, before.happiness);
  assert.equal(bought.money, before.money - 30);
  await page.locator('#btn-inventory').click();
  await page.getByRole('button', { name: 'Dosi: 1 dosi', exact: true }).click();
  await page.locator('#inventory-drug').click();
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await page.locator('#inventory-modal').waitFor({ state: 'visible' });
  await page.locator('#inventory-drug').click();
  await page.getByRole('button', { name: 'Assumi', exact: true }).click();
  await page.waitForFunction(
    async () => (await import('/src/game/context.ts')).game.player.drugStock === 0,
  );
  assert.equal(
    await page.evaluate(async () => (await import('/src/game/context.ts')).game.player.drug.active),
    true,
  );

  const buyerIndex = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { worldNode } = await import('/src/game/world-db.ts');
    const { inventoryChange } = await import('/src/game/inventory-market.ts');
    await inventoryChange((ledger) => ledger.buy('drug', 4, 0));
    await inventoryChange((ledger) => ledger.buy('weed', 10, 0));
    game.view.activeEnvironment = 'CORTILE';
    game.playerPos = { x: 0, y: 150 };
    const index = game.myAssignedRoomIdx === 0 ? 1 : 0;
    await game.session.db.ref(`${worldNode('rooms_state')}/${index}`).set({
      id: index + 1,
      ownerId: 'inventory_buyer',
      owner: 'Compratore',
      vaultMoney: 200,
      inventory: { items: { weed: 0, drug: 0 } },
    });
    await game.session.db
      .ref(`${worldNode('online_players')}/inventory_buyer`)
      .set({ name: 'Compratore', x: 20, y: 150, env: 'CORTILE', t: Date.now(), sleep: 100 });
    return index;
  });
  await page.waitForFunction(async () =>
    (await import('/src/game/context.ts')).game.frameNear.some((p) => p.id === 'inventory_buyer'),
  );
  await page.locator('#btn-inventory').click();
  await page.getByRole('button', { name: 'Dosi: 4 dosi', exact: true }).click();
  await page.locator('#inventory-trade').click();
  await page.locator('#inventory-trade-modal').waitFor({ state: 'visible' });
  await page.locator('#trade-item').selectOption('drug');
  await page.locator('#trade-recipient').selectOption('inventory_buyer');
  await page.locator('#trade-quantity').fill('2');
  await page.locator('#trade-price').fill('45');
  await page.locator('#trade-send').click();
  await page.locator('#trade-pending').waitFor({ state: 'visible' });
  await page.screenshot({ path: 'test-results/inventory-trade.png' });
  assert.equal(
    await page.evaluate(async () => (await import('/src/game/context.ts')).game.player.drugStock),
    2,
  );
  const accepted = await page.evaluate(async (index) => {
    const { game } = await import('/src/game/context.ts');
    const { worldNode } = await import('/src/game/world-db.ts');
    const { InventoryLedger } = await import('/src/game/inventory-ledger.ts');
    const buyer = new InventoryLedger(
      game.session.db,
      worldNode('rooms_state'),
      index,
      'inventory_buyer',
      () => ({ items: { weed: 0, drug: 0 } }),
      () => {},
    );
    const offer = game.roomsState[game.myAssignedRoomIdx].inventory.offer;
    const ok = await buyer.answer(game.myAssignedRoomIdx, game.session.myPlayerId, offer.id, true);
    const room = (await game.session.db.ref(`${worldNode('rooms_state')}/${index}`).get()).val();
    return { ok, stock: room.inventory.items.drug, balance: room.vaultMoney };
  }, buyerIndex);
  assert.deepEqual(accepted, { ok: true, stock: 2, balance: 155 });
  await page.locator('#trade-close').click();
  assert.equal(
    await page.evaluate(async () => (await import('/src/game/context.ts')).game.moneyLevel),
    bought.money + 45,
  );

  await page.locator('#btn-inventory').click();
  await page.getByRole('button', { name: 'Erba: 10 g', exact: true }).click();
  await page.locator('#inventory-trade').click();
  await page.locator('#trade-item').selectOption('weed');
  await page.locator('#trade-quantity').fill('3');
  await page.locator('#trade-price').fill('0');
  await page.locator('#trade-send').click();
  await page.locator('#trade-pending').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Annulla offerta', exact: true }).click();
  await page.locator('#trade-form').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(async () => (await import('/src/game/context.ts')).game.player.weed.grams),
    10,
  );
  await page.locator('#trade-close').click();

  await page.evaluate(async (index) => {
    const { game } = await import('/src/game/context.ts');
    const { worldNode } = await import('/src/game/world-db.ts');
    const { InventoryLedger } = await import('/src/game/inventory-ledger.ts');
    const seller = new InventoryLedger(
      game.session.db,
      worldNode('rooms_state'),
      index,
      'inventory_buyer',
      () => ({ items: { weed: 0, drug: 0 } }),
      () => {},
    );
    await seller.offer(game.session.myPlayerId, 'drug', 1, 0, 'test_gift');
    void (await import('/src/game/social.ts')).handleSocial({
      type: 'inventoryOffer',
      from: 'inventory_buyer',
      fromName: 'Compratore',
      offerId: 'test_gift',
      room: index,
      t: Date.now(),
    });
  }, buyerIndex);
  await page.getByRole('button', { name: 'Accetta regalo', exact: true }).click();
  await page.waitForFunction(
    async () => (await import('/src/game/context.ts')).game.player.drugStock === 3,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: acquisto nello zaino, consumo confermato, vendita di dosi, annullamento erba e regalo ricevuto.',
  );
} finally {
  await browser.close();
  await server.close();
}
