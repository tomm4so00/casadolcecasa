// Controlla sul database simulato le regole del mercato dell'erba: registro degli scambi, attività
// della Canapa Verde e prezzo pubblicato dal server.
//   firebase emulators:exec --only database --project demo-casadolcecasa "node tests/weed-market-emulator.mjs"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// le regole come si pubblicano: compattate (firebase/compact-rules.mjs)
import { compactRules } from '../firebase/compact-rules.mjs';

const base = 'http://127.0.0.1:9000';
const ns = 'demo-casadolcecasa-default-rtdb';
const admin = { Authorization: 'Bearer owner' };
const loaded = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers: admin,
  body: compactRules(
    readFileSync(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
  ),
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}

for (const id of ['buyer', 'other'])
  assert(await call('PUT', `sims_accounts/wm_${id}`, { playerId: id }));
const day = Math.floor(Date.now() / 86_400_000);
const trade = { g: 10, price: 30, seller: 'seller', buyer: 'buyer', t: Date.now() };

// registro degli scambi
assert(
  await call('PUT', `sims_weed_trades/${day}/o1`, trade, 'wm_buyer'),
  'il compratore scrive lo scambio',
);
assert.equal(
  await call('PUT', `sims_weed_trades/${day}/o1`, trade, 'wm_buyer'),
  false,
  'una volta sola',
);
assert.equal(
  await call('PUT', `sims_weed_trades/${day}/o2`, trade, 'wm_other'),
  false,
  'solo chi compra',
);
assert.equal(
  await call('PUT', `sims_weed_trades/${day}/o3`, { ...trade, g: 1.5 }, 'wm_buyer'),
  false,
  'grammi interi',
);
assert.equal(
  await call(
    'PUT',
    `sims_weed_trades/${day}/o4`,
    { ...trade, t: Date.now() - 86_400_000 },
    'wm_buyer',
  ),
  false,
  "con l'ora del server",
);
assert.equal(
  await call('GET', `sims_weed_trades/${day}`, undefined, 'wm_buyer'),
  false,
  'nessuno legge il registro',
);

// attività: domanda e offerta d'erba
for (const biz of ['canapa', 'raccolto'])
  assert(
    await call('PUT', `sims_activity/${day}/${biz}/buyer`, { n: 1, t: Date.now() }, 'wm_buyer'),
    biz,
  );
assert.equal(
  await call('PUT', `sims_activity/${day}/erba/buyer`, { n: 1, t: Date.now() }, 'wm_buyer'),
  false,
  'attività sconosciuta',
);

// prezzo pubblicato dal server: lo leggono i giocatori, non lo scrivono
assert(await call('PUT', 'sims_weed_market', { ref: 25, push: 0, t: Date.now() }));
assert(await call('GET', 'sims_weed_market', undefined, 'wm_buyer'), 'si legge');
assert.equal(
  await call('PUT', 'sims_weed_market', { ref: 1, push: -1, t: Date.now() }, 'wm_buyer'),
  false,
  'non si scrive',
);

// quote della Canapa Verde nella propria stanza
const rooms = Array.from({ length: 64 }, (_, i) => ({ id: i + 1, vaultMoney: 0 }));
rooms[0] = {
  id: 1,
  ownerId: 'buyer',
  owner: 'Compratore',
  vaultMoney: 100,
  economy: { version: 1, ownedItems: {}, ownedFurniture: {}, invest: {} },
};
assert(await call('PUT', 'sims_rooms_state', rooms));
assert(
  await call(
    'PATCH',
    'sims_rooms_state/0/economy/invest',
    { canapa: { units: 2, cost: 50 } },
    'wm_buyer',
  ),
  'il proprietario investe nella Canapa Verde',
);
assert.equal(
  await call(
    'PATCH',
    'sims_rooms_state/0/economy/invest',
    { canapa: { units: 9, cost: 50 } },
    'wm_other',
  ),
  false,
  'gli altri no',
);
console.log('PASS: mercato dell’erba (scambi, attività, prezzo, Canapa Verde).');
