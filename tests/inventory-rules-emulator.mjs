// Controlla sul database simulato che una vendita non separi pagamento e consegna.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = 'http://127.0.0.1:9000';
const ns = 'demo-casadolcecasa-default-rtdb';
const admin = { Authorization: 'Bearer owner' };
const loaded = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers: admin,
  body: readFileSync(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
});
assert(loaded.ok, await loaded.text());
function token(uid) {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [
    enc({ alg: 'none', typ: 'JWT' }),
    enc({
      sub: uid,
      user_id: uid,
      aud: 'demo-casadolcecasa',
      iss: 'https://securetoken.google.com/demo-casadolcecasa',
      iat: now,
      exp: now + 3600,
      auth_time: now,
      firebase: { sign_in_provider: 'google.com', identities: {} },
    }),
    '',
  ].join('.');
}
async function call(method, path, body, uid) {
  const res = await fetch(`${base}/${path}.json?ns=${ns}${uid ? `&auth=${token(uid)}` : ''}`, {
    method,
    headers: uid ? {} : admin,
    body: JSON.stringify(body),
  });
  return res.ok;
}
for (const id of ['seller', 'buyer', 'stranger'])
  assert(await call('PUT', `sims_accounts/inv_${id}`, { playerId: id }));
for (const path of ['sims_rooms_state', 'worlds/CASA-3333/rooms_state']) {
  const offer = {
    id: 'offer',
    item: 'drug',
    quantity: 2,
    price: 30,
    buyer: 'buyer',
    buyerRoom: 1,
    expiresAt: Date.now() + 120000,
    status: 'pending',
  };
  const rooms = Array.from({ length: 64 }, (_, i) => ({ id: i + 1, vaultMoney: 0 }));
  rooms[0] = {
    id: 1,
    ownerId: 'seller',
    owner: 'Venditore',
    vaultMoney: 100,
    inventory: { items: { weed: 3, drug: 2 }, offer },
  };
  rooms[1] = {
    id: 2,
    ownerId: 'buyer',
    owner: 'Compratore',
    vaultMoney: 80,
    inventory: { items: { weed: 0, drug: 2 } },
  };
  assert(await call('PUT', path, rooms));
  const accept = {
    '0/inventory/offer/status': 'accepted',
    '0/vaultMoney': 130,
    '1/vaultMoney': 50,
    '1/inventory/items/drug': 4,
  };
  assert.equal(await call('PATCH', path, accept, 'inv_stranger'), false, 'un estraneo non accetta');
  assert.equal(
    await call('PATCH', path, { '0/inventory/offer/quantity': 1 }, 'inv_buyer'),
    false,
    'quantità immutabile',
  );
  assert.equal(
    await call('PATCH', path, { '0/inventory': null }, 'inv_buyer'),
    false,
    'nessuno cancella lo zaino altrui',
  );
  assert.equal(
    await call(
      'PATCH',
      path,
      { '0/inventory/offer/status': 'accepted', '0/vaultMoney': 130 },
      'inv_buyer',
    ),
    false,
    'niente acquisto senza pagamento e consegna',
  );
  assert.equal(
    await call('PATCH', path, { ...accept, '1/inventory/items/drug': 2 }, 'inv_buyer'),
    false,
    'niente pagamento senza merce',
  );
  assert(await call('PATCH', path, accept, 'inv_buyer'), 'scambio completo consentito');
  assert(
    await call('PATCH', path, accept, 'inv_buyer'),
    'ripetere lo stesso risultato non accredita di nuovo',
  );
  assert.equal(
    await call('PATCH', path, { '0/inventory/items/drug': 0 }, 'inv_buyer'),
    false,
    'non si sottrae altro dal venditore',
  );
  assert(await call('PUT', path, rooms));
  assert(
    await call(
      'PATCH',
      path,
      { '0/inventory/offer/status': 'refused', '0/inventory/items/drug': 4 },
      'inv_buyer',
    ),
    'rifiuto con restituzione',
  );
  assert(await call('PUT', path, rooms));
  assert(
    await call(
      'PATCH',
      path,
      { '0/inventory/offer/status': 'cancelled', '0/inventory/items/drug': 4 },
      'inv_seller',
    ),
    'annullamento del venditore',
  );
  console.log(`PASS: scambi zaino e permessi in ${path}`);
}

// la proposta arriva al compratore come messaggio: il tipo deve essere permesso dalle regole
for (const path of ['sims_interactions', 'worlds/CASA-3333/interactions']) {
  const message = {
    type: 'inventoryOffer',
    from: 'seller',
    fromName: 'Venditore',
    t: Date.now(),
    offerId: 'offer',
    room: 0,
  };
  assert(
    await call('PUT', `${path}/buyer/k1`, message, 'inv_seller'),
    'il venditore manda la proposta',
  );
  assert.equal(
    await call('PUT', `${path}/buyer/k2`, message, 'inv_stranger'),
    false,
    'nessuno la manda a nome di un altro',
  );
  console.log(`PASS: proposta di scambio in ${path}`);
}
