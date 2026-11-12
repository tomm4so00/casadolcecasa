// Prova le regole del PIN privato e dello scasso sul database simulato: il PIN lo legge solo il
// proprietario, e la cassaforte si svuota (segno `robbed`) solo con l'ultimo tentativo registrato
// giusto, dopo il tempo dello scasso e senza il pugno del proprietario.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/safe-pin-emulator.mjs"
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

/** Come shared/safe-pin-rules.ts. */
function hashPin(pin, salt) {
  const s = 'sims:' + salt + ':' + pin;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}

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
const get = (path, uid) => call('GET', path, undefined, uid);
const check = async (name, expected, run) => assert.equal(await run(), expected, name);

// Anna (p1) ha la cassaforte nella stanza 0; Marco (p2) e Sara (p3) scassinano
for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
  ['u3', 'p3'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const PIN = hashPin('243', 'p1');
assert(await put('sims_safe_pins/p1', PIN));

// ---------------------------------------------------------------- il PIN privato
await check('Anna legge il suo PIN', true, () => get('sims_safe_pins/p1', 'u1'));
await check('Marco non legge il PIN di Anna', false, () => get('sims_safe_pins/p1', 'u2'));
await check('Marco non scrive il PIN di Anna', false, () =>
  put('sims_safe_pins/p1', hashPin('111', 'p1'), 'u2'),
);
await check('Anna cambia il suo PIN', true, () => put('sims_safe_pins/p1', PIN, 'u1'));
await check('un PIN che non è cifrato non vale', false, () =>
  put('sims_safe_pins/p1', '243', 'u1'),
);

const rooms = () =>
  Array.from({ length: 64 }, (_, i) =>
    i === 0
      ? { id: 1, owner: 'Anna', ownerId: 'p1', lastSeen: Date.now(), pinSet: true, vaultMoney: 500 }
      : { id: i + 1, vaultMoney: 0 },
  );

for (const [label, rs, theft, blocks] of [
  ['mondo di sempre', 'sims_rooms_state', 'sims_theft', 'sims_theft_blocks'],
  [
    'CASA-4444',
    'worlds/CASA-4444/rooms_state',
    'worlds/CASA-4444/theft',
    'worlds/CASA-4444/theft_blocks',
  ],
]) {
  const reset = async () => {
    assert(await put(rs, rooms()));
    assert(await put(theft, null));
    assert(await put(blocks, null));
  };
  // il tentativo come lo lascia il gioco, scritto dall'admin con l'ora che serve alla prova
  const attempt = (pid, code, agoMs) =>
    put(`${theft}/${pid}/1`, {
      n: 1,
      since: Date.now() - agoMs,
      g: hashPin(code, 'p1'),
      t: Date.now() - agoMs,
    });
  const rob = (uid, by = uid.replace('u', 'p')) =>
    patch(`${rs}/0`, { vaultMoney: 0, robbed: { by, t: Date.now() - 1000 } }, uid);

  await reset();
  await check(`${label}: Anna non rimette il PIN nella stanza`, false, () =>
    put(`${rs}/0/pin`, hashPin('243', 1), 'u1'),
  );
  await check(`${label}: Anna segna che ha una combinazione`, true, () =>
    put(`${rs}/0/pinSet`, true, 'u1'),
  );
  await check(`${label}: Marco non tocca pinSet di Anna`, false, () =>
    put(`${rs}/0/pinSet`, false, 'u2'),
  );

  // i tentativi vogliono combinazione e ora
  await check(`${label}: tentativo senza combinazione rifiutato`, false, () =>
    put(`${theft}/p2/1`, { n: 1, since: Date.now() - 1000 }, 'u2'),
  );
  await check(`${label}: tentativo con combinazione e ora`, true, () =>
    put(
      `${theft}/p2/1`,
      { n: 1, since: Date.now() - 1000, g: hashPin('111', 'p1'), t: Date.now() - 1000 },
      'u2',
    ),
  );

  await reset();
  await attempt('p2', '111', 20_000);
  await check(`${label}: combinazione sbagliata, cassaforte chiusa`, false, () => rob('u2'));
  await attempt('p2', '243', 5_000);
  await check(`${label}: scasso non ancora finito`, false, () => rob('u2'));
  await attempt('p2', '243', 120_000);
  await check(`${label}: tentativo troppo vecchio`, false, () => rob('u2'));
  await attempt('p2', '243', 20_000);
  await check(`${label}: a nome di un altro no`, false, () => rob('u2', 'p3'));
  await check(`${label}: Sara non usa il tentativo di Marco`, false, () => rob('u3'));
  await check(`${label}: combinazione giusta, scasso finito: svuotata`, true, () => rob('u2'));

  await reset();
  await attempt('p3', '243', 20_000);
  assert(await put(`${blocks}/0/p3`, { by: 'p1', t: Date.now() }));
  await check(`${label}: col pugno di Anna, Sara non svuota`, false, () => rob('u3'));
}

console.log('PASS regole del PIN privato e dello scasso');
