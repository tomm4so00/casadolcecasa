import { describe, expect, it } from 'vitest';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';
import { InventoryLedger } from '../src/game/inventory-ledger.js';
import { tradeError, TRADE_TTL_MS } from '../src/game/inventory-trade-rules.js';

async function setup(path = 'sims_rooms_state') {
  const database = localDatabase(new Lifetime(), new MemoryStorage());
  await database.ref(path).set([
    { id: 1, ownerId: 'seller', vaultMoney: 100 },
    { id: 2, ownerId: 'buyer', vaultMoney: 80 },
  ]);
  let now = 1_000_000;
  const seller = new InventoryLedger(
    database,
    path,
    0,
    'seller',
    () => ({ items: { weed: 8, drug: 4 } }),
    () => {},
    () => true,
    () => now,
  );
  const buyer = new InventoryLedger(
    database,
    path,
    1,
    'buyer',
    () => ({ items: { weed: 1, drug: 2 } }),
    () => {},
    () => true,
    () => now,
  );
  await seller.initialize();
  await buyer.initialize();
  return {
    database,
    seller,
    buyer,
    read: async () => (await database.ref(path).get()).val(),
    advance: () => {
      now += TRADE_TTL_MS;
    },
  };
}

describe('fermo di polizia', () => {
  it('paga la multa conservando le scorte e rifiuta un secondo pagamento senza fondi', async () => {
    const { seller, read } = await setup();
    expect(await seller.policeResolution(100)).toBe(true);
    expect((await read())[0].vaultMoney).toBe(0);
    expect((await read())[0].inventory.items).toEqual({ weed: 8, drug: 4 });
    expect(await seller.policeResolution(100)).toBe(false);
    expect((await read())[0].vaultMoney).toBe(0);
  });
  it('sequestra entrambe le scorte e annulla anche la merce prenotata', async () => {
    const { seller, read } = await setup();
    expect(await seller.offer('buyer', 'weed', 5, 10, 'seizure')).toBe(true);
    expect(await seller.policeResolution(null)).toBe(true);
    const room = (await read())[0];
    expect(room.vaultMoney).toBe(100);
    expect(room.inventory.items).toEqual({ weed: 0, drug: 0 });
    expect(room.inventory.offer.status).toBe('cancelled');
  });
});

describe('scambi condivisi dello zaino', () => {
  it('sposta dosi e denaro insieme e impedisce di accettare due volte', async () => {
    const { seller, buyer, read } = await setup();
    expect(await seller.offer('buyer', 'drug', 2, 30, 'one')).toBe(true);
    let rooms = await read();
    expect(rooms[0].inventory.items.drug).toBe(2);
    expect(rooms[0].vaultMoney).toBe(100);
    expect(await buyer.answer(0, 'seller', 'one', true)).toBe(true);
    expect(await buyer.answer(0, 'seller', 'one', true)).toBe(false);
    rooms = await read();
    expect(rooms[0].vaultMoney).toBe(130);
    expect(rooms[1].vaultMoney).toBe(50);
    expect(rooms[0].inventory.items.drug).toBe(2);
    expect(rooms[1].inventory.items.drug).toBe(4);
  });

  it('usa lo stesso metodo per regalare erba e per venderla in un altro mondo', async () => {
    const { seller, buyer, read } = await setup('worlds/CASA-2222/rooms_state');
    expect(await seller.offer('buyer', 'weed', 3, 0, 'gift')).toBe(true);
    expect(await buyer.answer(0, 'seller', 'gift', true)).toBe(true);
    const rooms = await read();
    expect(rooms[0].inventory.items.weed).toBe(5);
    expect(rooms[1].inventory.items.weed).toBe(4);
    expect(rooms[0].vaultMoney + rooms[1].vaultMoney).toBe(180);
  });

  it('rifiuto, annullamento e scadenza restituiscono gli oggetti una sola volta', async () => {
    const { seller, buyer, read, advance } = await setup();
    await seller.offer('buyer', 'drug', 2, 20, 'refuse');
    expect(await buyer.answer(0, 'seller', 'refuse', false)).toBe(true);
    expect(await buyer.answer(0, 'seller', 'refuse', false)).toBe(false);
    await seller.offer('buyer', 'drug', 2, 20, 'cancel');
    expect(await seller.cancel('cancel')).toBe(true);
    expect(await seller.cancel('cancel')).toBe(false);
    await seller.offer('buyer', 'drug', 2, 20, 'expired');
    advance();
    expect(await buyer.answer(0, 'seller', 'expired', true)).toBe(false);
    await seller.initialize();
    await seller.initialize();
    const rooms = await read();
    expect(rooms[0].inventory.items.drug).toBe(4);
    expect(rooms[0].vaultMoney).toBe(100);
  });

  it('non paga senza saldo e non può consumare o offrire le scorte riservate', async () => {
    const { seller, buyer, read } = await setup();
    await seller.offer('buyer', 'drug', 4, 100, 'expensive');
    expect(await seller.consume('drug')).toBe(false);
    expect(await seller.offer('buyer', 'weed', 1, 0, 'second')).toBe(false);
    expect(await buyer.answer(0, 'seller', 'expensive', true)).toBe(false);
    expect((await read())[1].vaultMoney).toBe(80);
    expect(await buyer.answer(0, 'wrong-seller', 'expensive', true)).toBe(false);
  });

  it('acquisto e consumo sono atomici e non ripristina le scorte da un vecchio salvataggio', async () => {
    const { database, seller, read } = await setup();
    expect(await seller.buy('drug', 1, 30)).toBe(true);
    expect(await seller.consume('drug')).toBe(true);
    expect(await seller.buy('drug', 1, 1000)).toBe(false);
    const reloaded = new InventoryLedger(
      database,
      'sims_rooms_state',
      0,
      'seller',
      () => ({ items: { drug: 999, weed: 999 } }),
      () => {},
    );
    await reloaded.initialize();
    expect((await read())[0].inventory.items.drug).toBe(4);
    expect((await read())[0].vaultMoney).toBe(70);
    expect(await seller.harvest(100, 123)).toBe(true);
    expect(await seller.harvest(100, 123)).toBe(true);
    expect((await read())[0].inventory.items.weed).toBe(108);
  });

  it('valida quantità e prezzo senza permettere valori negativi o frazioni', () => {
    for (const [qty, price] of [
      [0, 0],
      [1.5, 2],
      [1, -1],
      [1, 2.5],
      [4, 10],
      [1, Infinity],
    ])
      expect(tradeError(qty, price, 3)).not.toBeNull();
    expect(tradeError(3, 0, 3)).toBeNull();
  });
});
