// Prova le regole del cestino, delle multe e della cassa della polizia sul database simulato:
// nel cestino scrive solo il proprietario e gli altri possono solo togliere; le multe le scrive
// chi denuncia a proprio nome; la cassa cresce soltanto; la multa si prende dalla cassaforte.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/trash-emulator.mjs"
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
const del = (path, uid) => call('DELETE', path, undefined, uid);

const now = Date.now();
// Dino (u1) spaccia, Ada (u2) fruga e denuncia, Sara (u3) guarda
for (const [uid, pid] of [
  ['u1', 'player_dino'],
  ['u2', 'player_ada1'],
  ['u3', 'player_sara'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const rooms = (owners) =>
  Array.from({ length: 64 }, (_, i) =>
    owners[i] ? { id: i + 1, vaultMoney: 500, ...owners[i] } : { id: i + 1, vaultMoney: 0 },
  );
const room = (owner, ownerId) => ({ owner, ownerId, lastSeen: now, pin: 'h123' });

const results = {};
const check = async (name, expected, run) => {
  results[name] = await run();
  assert.equal(results[name], expected, name);
};

for (const [label, w] of [
  ['mondo di sempre', (n) => `sims_${n}`],
  ['CASA-5555', (n) => `worlds/CASA-5555/${n}`],
]) {
  assert(
    await put(
      w('rooms_state'),
      rooms({ 0: room('Dino', 'player_dino'), 1: room('Ada', 'player_ada1') }),
    ),
  );
  const bag = { k: 'bag', t: now };
  // il cestino
  await check(`${label}: Dino butta una bustina nel suo cestino`, true, () =>
    put(`${w('trash')}/player_dino/a1`, bag, 'u1'),
  );
  await check(`${label}: e una graffetta`, true, () =>
    put(`${w('trash')}/player_dino/a2`, { k: 'clip', t: now }, 'u1'),
  );
  await check(`${label}: Ada non mette niente nel cestino di Dino`, false, () =>
    put(`${w('trash')}/player_dino/a3`, bag, 'u2'),
  );
  await check(`${label}: niente cose strane nel cestino`, false, () =>
    put(`${w('trash')}/player_dino/a4`, { k: 'oro', t: now }, 'u1'),
  );
  await check(`${label}: né campi in più`, false, () =>
    put(`${w('trash')}/player_dino/a4`, { ...bag, soldi: 5 }, 'u1'),
  );
  await check(`${label}: tutti possono guardare nei cestini`, true, () =>
    call('GET', w('trash'), undefined, 'u3'),
  );
  await check(`${label}: Ada fruga e prende la bustina`, true, () =>
    del(`${w('trash')}/player_dino/a1`, 'u2'),
  );
  await check(`${label}: ma non svuota tutto il cestino di Dino`, false, () =>
    del(`${w('trash')}/player_dino`, 'u2'),
  );
  await check(`${label}: Dino svuota il suo`, true, () => del(`${w('trash')}/player_dino`, 'u1'));
  // la multa: 50 Đ, Ada ne prende 25 dalla cassaforte di Dino e 25 vanno alla cassa
  await check(`${label}: Ada riscuote la multa dalla cassaforte di Dino`, true, () =>
    patch(w('rooms_state'), { '0/vaultMoney': 450, '1/vaultMoney': 525 }, 'u2'),
  );
  await check(`${label}: la metà della polizia va nella cassa`, true, () =>
    put(w('police_fund'), 25, 'u2'),
  );
  await check(`${label}: la cassa non cala`, false, () => put(w('police_fund'), 10, 'u3'));
  await check(`${label}: né cresce a dismisura`, false, () => put(w('police_fund'), 99999, 'u3'));
  await check(`${label}: tutti vedono la cassa`, true, () =>
    call('GET', w('police_fund'), undefined, 'u3'),
  );
  const fine = { k: 'bag', n: 1, amt: 50, paid: 50, to: 'player_ada1', t: now };
  await check(`${label}: Ada scrive la multa a Dino`, true, () =>
    put(`${w('fines')}/player_dino/f1`, fine, 'u2'),
  );
  await check(`${label}: non a nome di un altro`, false, () =>
    put(`${w('fines')}/player_dino/f2`, { ...fine, to: 'player_sara' }, 'u2'),
  );
  await check(`${label}: né con l'importo sbagliato`, false, () =>
    put(`${w('fines')}/player_dino/f3`, { ...fine, amt: 500 }, 'u2'),
  );
  await check(`${label}: né a se stessa`, false, () =>
    put(`${w('fines')}/player_ada1/f4`, fine, 'u2'),
  );
  await check(`${label}: e non la riscrive`, false, () =>
    put(`${w('fines')}/player_dino/f1`, { ...fine, paid: 0 }, 'u2'),
  );
  await check(`${label}: Sara non legge le multe di Dino`, false, () =>
    call('GET', `${w('fines')}/player_dino`, undefined, 'u3'),
  );
  await check(`${label}: Dino le legge`, true, () =>
    call('GET', `${w('fines')}/player_dino`, undefined, 'u1'),
  );
  await check(`${label}: Dino segna quanto ha pagato`, true, () =>
    put(`${w('fines')}/player_dino/f1/paid`, 50, 'u1'),
  );
  await check(`${label}: e la chiude`, true, () => del(`${w('fines')}/player_dino/f1`, 'u1'));
  // il Giustiziere prende di più (fino all'80%)
  await check(`${label}: multa con la quota del Giustiziere`, true, () =>
    put(`${w('fines')}/player_dino/f5`, { ...fine, pct: 70 }, 'u2'),
  );
  await check(`${label}: ma non oltre l'80%`, false, () =>
    put(`${w('fines')}/player_dino/f6`, { ...fine, pct: 90 }, 'u2'),
  );
  // la personalità nella classifica del condominio
  const rank = { name: 'Ada', wealth: 10, t: now };
  await check(`${label}: Ada pubblica la sua personalità`, true, () =>
    put(
      `${w('leaderboard')}/player_ada1`,
      { ...rank, pers: 'vigilante', persLv: 2, persDays: 16, pers2: 'addict' },
      'u2',
    ),
  );
  await check(`${label}: non una personalità inventata`, false, () =>
    put(`${w('leaderboard')}/player_ada1`, { ...rank, pers: 'mago', persLv: 1 }, 'u2'),
  );
}

console.log('Cestini e multe: ok', Object.keys(results).length, 'prove');
