// Prova le regole dell'assaggio di benvenuto sul database simulato: dove si lascia un piatto,
// chi lo toglie, i due avvisi nuovi e i limiti del cibo a scorta nel salvataggio.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/taste-emulator.mjs"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ns = 'demo-casadolcecasa-default-rtdb';
const base = 'http://127.0.0.1:9000';
const admin = { Authorization: 'Bearer owner' };

const loaded = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers: admin,
  body: readFileSync(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
});
assert.equal(loaded.ok, true, 'rules rejected: ' + (await loaded.text()));

function tokenOf(uid) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
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
  const auth = uid ? `&auth=${tokenOf(uid)}` : '';
  const res = await fetch(`${base}/${path}.json?ns=${ns}${auth}`, {
    method,
    headers: uid ? {} : admin,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}
const put = (path, body, uid) => call('PUT', path, body, uid);

const rooms = (owners) =>
  Array.from({ length: 64 }, (_, i) =>
    owners[i] ? { id: i + 1, vaultMoney: 0, ...owners[i] } : { id: i + 1, vaultMoney: 0 },
  );
const now = Date.now();

// Anna (p1) abita nella stanza 0, Luca (p2), il nuovo, nella stanza 1; Sara (p3) è un'altra vicina
for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
  ['u3', 'p3'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const owners = {
  0: { owner: 'Anna', ownerId: 'p1', lastSeen: now },
  1: { owner: 'Luca', ownerId: 'p2', lastSeen: now },
};
assert(await put('sims_rooms_state', rooms(owners)));
assert(await put('worlds/CASA-5555/rooms_state', rooms(owners)));
const dish = { name: 'Luca', x: 10, y: 20, t: now };

const results = {};
const check = async (name, expected, run) => {
  results[name] = await run();
  assert.equal(results[name], expected, name);
};

for (const [label, gifts] of [
  ['mondo di sempre', 'sims_gifts'],
  ['CASA-5555', 'worlds/CASA-5555/gifts'],
]) {
  await check(`${label}: Luca lascia l'assaggio nella stanza di Anna`, true, () =>
    put(`${gifts}/0/p2`, dish, 'u2'),
  );
  await check(`${label}: uno solo a testa per stanza`, false, () =>
    put(`${gifts}/0/p2`, { ...dish, x: 30 }, 'u2'),
  );
  await check(`${label}: non nella propria stanza`, false, () => put(`${gifts}/1/p2`, dish, 'u2'));
  await check(`${label}: non a nome di un altro`, false, () => put(`${gifts}/0/p3`, dish, 'u2'));
  await check(`${label}: non in una stanza vuota`, false, () => put(`${gifts}/9/p2`, dish, 'u2'));
  await check(`${label}: niente campi in più`, false, () =>
    put(`${gifts}/0/p3`, { ...dish, name: 'Sara', soldi: 999 }, 'u3'),
  );
  await check(`${label}: Sara non toglie il piatto di Luca`, false, () =>
    call('DELETE', `${gifts}/0/p2`, undefined, 'u3'),
  );
  await check(`${label}: Anna lo mangia (lo toglie)`, true, () =>
    call('DELETE', `${gifts}/0/p2`, undefined, 'u1'),
  );
}

// gli avvisi tra giocatori
const note = (type, from = 'p2', fromName = 'Luca') => ({ type, from, fromName, t: now });
await check('avviso: ti sta portando un assaggio', true, () =>
  put('sims_interactions/p1/k1', note('tasteComing'), 'u2'),
);
await check("avviso: grazie per l'assaggio", true, () =>
  put('sims_interactions/p2/k2', note('tasteThanks', 'p1', 'Anna'), 'u1'),
);
await check('avviso nel mondo nuovo', true, () =>
  put('worlds/CASA-5555/interactions/p1/k3', note('tasteComing'), 'u2'),
);

// il cibo a scorta nel salvataggio
const save = (inventory) => ({ savedAt: now, moneyLevel: 30, inventory });
await check('scorta: 3 crudi e 2 piatti', true, () =>
  put('sims_saves/p2', save({ hasFood: true, foodCooked: true, raw: 3, dishes: 2 }), 'u2'),
);
await check('scorta: non più di 10 piatti', false, () =>
  put('sims_saves/p2', save({ hasFood: true, foodCooked: true, raw: 0, dishes: 11 }), 'u2'),
);
await check('scorta: niente mezzi piatti', false, () =>
  put('sims_saves/p2', save({ hasFood: true, foodCooked: true, raw: 0, dishes: 1.5 }), 'u2'),
);

console.log('Assaggio di benvenuto: ok', Object.keys(results).length, 'prove');
