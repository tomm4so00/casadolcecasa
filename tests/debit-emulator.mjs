// Prova le regole del permesso di addebito sul database simulato: la cassaforte di un altro si
// abbassa solo col suo permesso (rooms_state/<n>/allow/<chi>), di quanto copre, e il permesso
// scende di quanto si è preso. Chi lo riceve non può alzarlo; scaduto non vale.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/debit-emulator.mjs"
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
const patch = (path, body, uid) => call('PATCH', path, body, uid);
const check = async (name, expected, run) => assert.equal(await run(), expected, name);

// Anna (p1) fa offerte a Bruno (p2); Carlo (p3) è un terzo
for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
  ['u3', 'p3'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const now = Date.now();
const rooms = () =>
  Array.from({ length: 64 }, (_, i) =>
    i === 0
      ? { id: 1, owner: 'Anna', ownerId: 'p1', lastSeen: now, vaultMoney: 500 }
      : i === 1
        ? { id: 2, owner: 'Bruno', ownerId: 'p2', lastSeen: now, vaultMoney: 100 }
        : { id: i + 1, vaultMoney: 0 },
  );

for (const [label, rs] of [
  ['mondo di sempre', 'sims_rooms_state'],
  ['CASA-4444', 'worlds/CASA-4444/rooms_state'],
]) {
  assert(await put(rs, rooms()));
  // senza permesso nessuno prende niente
  await check(`${label}: Bruno senza permesso non prende`, false, () =>
    patch(rs, { '0/vaultMoney': 400, '1/vaultMoney': 200 }, 'u2'),
  );
  // il permesso lo scrive solo Anna, nella sua stanza
  await check(`${label}: Carlo non scrive permessi per Anna`, false, () =>
    put(`${rs}/0/allow/p3`, { amt: 300, t: Date.now() }, 'u3'),
  );
  await check(`${label}: Anna permette 300 a Bruno`, true, () =>
    put(`${rs}/0/allow/p2`, { amt: 300, t: Date.now() }, 'u1'),
  );
  await check(`${label}: Bruno non alza il permesso`, false, () =>
    patch(`${rs}/0/allow/p2`, { amt: 900 }, 'u2'),
  );
  // si prende quanto copre e il permesso scende insieme
  await check(`${label}: Bruno prende 100 e il permesso scende a 200`, true, () =>
    patch(rs, { '0/vaultMoney': 400, '0/allow/p2/amt': 200, '1/vaultMoney': 200 }, 'u2'),
  );
  await check(`${label}: ma non lascia il permesso com'era`, false, () =>
    patch(rs, { '0/vaultMoney': 350, '1/vaultMoney': 250 }, 'u2'),
  );
  await check(`${label}: né prende più di quanto resta`, false, () =>
    patch(rs, { '0/vaultMoney': 100, '0/allow/p2': null, '1/vaultMoney': 500 }, 'u2'),
  );
  await check(`${label}: Carlo non usa il permesso di Bruno`, false, () =>
    patch(rs, { '0/vaultMoney': 300, '0/allow/p2/amt': 100 }, 'u3'),
  );
  await check(`${label}: Bruno prende il resto e il permesso sparisce`, true, () =>
    patch(rs, { '0/vaultMoney': 200, '0/allow/p2': null, '1/vaultMoney': 400 }, 'u2'),
  );
  await check(`${label}: finito il permesso, basta`, false, () =>
    patch(rs, { '0/vaultMoney': 150, '1/vaultMoney': 450 }, 'u2'),
  );
  // un permesso scaduto (più di 14 giorni) non vale
  assert(await put(`${rs}/0/allow/p2`, { amt: 50, t: Date.now() - 15 * 86_400_000 }));
  await check(`${label}: permesso scaduto non vale`, false, () =>
    patch(rs, { '0/vaultMoney': 150, '0/allow/p2': null, '1/vaultMoney': 450 }, 'u2'),
  );
  // Anna spende i suoi soldi come sempre
  await check(`${label}: Anna spende i suoi`, true, () => put(`${rs}/0/vaultMoney`, 10, 'u1'));
}

console.log('PASS permesso di addebito: solo con il permesso, di quanto copre, una volta.');
