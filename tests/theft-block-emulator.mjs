// Prova le regole del ladro beccato sul database simulato: il proprietario lo blocca solo mentre
// sta scassinando la sua cassaforte, e da lì in poi quel ladro non può più toccarne i soldi.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/theft-block-emulator.mjs"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// le regole come si pubblicano: compattate (firebase/compact-rules.mjs)
import { compactRules } from '../firebase/compact-rules.mjs';

const ns = 'demo-casadolcecasa-default-rtdb';
const base = 'http://127.0.0.1:9000';
const admin = { Authorization: 'Bearer owner' };

const loaded = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers: admin,
  body: compactRules(
    readFileSync(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
  ),
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
    owners[i] ? { id: i + 1, vaultMoney: 500, ...owners[i] } : { id: i + 1, vaultMoney: 0 },
  );
const now = Date.now();

// Anna (p1) abita nella stanza 0 del mondo di sempre e in quella di CASA-4444; Marco (p2) e
// Sara (p3) sono ladri
for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
  ['u3', 'p3'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const anna = { owner: 'Anna', ownerId: 'p1', lastSeen: now, pin: 'h123' };
assert(await put('sims_rooms_state', rooms({ 0: anna })));
assert(await put('worlds/CASA-4444/rooms_state', rooms({ 0: anna })));
const presence = (crack) => ({
  name: 'Marco',
  x: 0,
  y: 0,
  env: 'PLAYER_ROOM',
  ...(crack ? { crack } : {}),
});
const block = { by: 'p1', t: now };

const results = {};
const check = async (name, expected, run) => {
  results[name] = await run();
  assert.equal(results[name], expected, name);
};

for (const [label, prefix, rs, op] of [
  ['mondo di sempre', 'sims_theft_blocks', 'sims_rooms_state', 'sims_online_players'],
  [
    'CASA-4444',
    'worlds/CASA-4444/theft_blocks',
    'worlds/CASA-4444/rooms_state',
    'worlds/CASA-4444/online_players',
  ],
]) {
  assert(await put(`${op}/p2`, presence(null), 'u2'));
  await check(`${label}: non si blocca chi non sta scassinando`, false, () =>
    put(`${prefix}/0/p2`, block, 'u1'),
  );
  // Marco comincia lo scasso della stanza 0
  assert(await put(`${op}/p2`, presence('0'), 'u2'));
  await check(`${label}: il ladro non si blocca da solo né blocca altri`, false, () =>
    put(`${prefix}/0/p2`, { by: 'p2', t: now }, 'u2'),
  );
  await check(`${label}: un estraneo non blocca al posto di Anna`, false, () =>
    put(`${prefix}/0/p2`, { by: 'p3', t: now }, 'u3'),
  );
  await check(`${label}: Anna dà il pugno e blocca Marco`, true, () =>
    put(`${prefix}/0/p2`, block, 'u1'),
  );
  await check(`${label}: il blocco non si cancella`, false, () =>
    call('DELETE', `${prefix}/0/p2`, undefined, 'u1'),
  );
  // i soldi
  await check(`${label}: Marco non svuota più la cassaforte`, false, () =>
    put(`${rs}/0/vaultMoney`, 0, 'u2'),
  );
  // senza la prova dello scasso (il PIN, vedi safe-pin-emulator) nessuno svuota la cassaforte
  await check(`${label}: nemmeno Sara (non beccata), senza PIN`, false, () =>
    put(`${rs}/0/vaultMoney`, 0, 'u3'),
  );
  await check(`${label}: Anna rimette i suoi soldi`, true, () =>
    put(`${rs}/0/vaultMoney`, 500, 'u1'),
  );
}

console.log('Ladri beccati: ok', Object.keys(results).length, 'prove');
