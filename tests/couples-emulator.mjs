// Prova le regole delle coppie sul database simulato: ognuno scrive solo la sua metà, niente
// coppie con se stessi né campi in più, e gli avvisi del fidanzamento passano.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/couples-emulator.mjs"
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

const now = Date.now();
for (const [uid, pid] of [
  ['u1', 'player_marco'],
  ['u2', 'player_giulia'],
  ['u3', 'player_sara'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));

const results = {};
const check = async (name, expected, run) => {
  results[name] = await run();
  assert.equal(results[name], expected, name);
};

const half = (other, name) => ({ with: other, name, since: now });
await check('Marco scrive la sua metà', true, () =>
  put('sims_couples/player_marco', half('player_giulia', 'Giulia'), 'u1'),
);
await check('Giulia scrive la sua', true, () =>
  put('sims_couples/player_giulia', half('player_marco', 'Marco'), 'u2'),
);
await check('Sara non scrive al posto di Giulia', false, () =>
  put('sims_couples/player_giulia', half('player_sara', 'Sara'), 'u3'),
);
await check('nessuno sta con se stesso', false, () =>
  put('sims_couples/player_sara', half('player_sara', 'Sara'), 'u3'),
);
await check('niente campi in più', false, () =>
  put('sims_couples/player_sara', { ...half('player_marco', 'Marco'), soldi: 1 }, 'u3'),
);
await check('confermata', true, () => put('sims_couples/player_marco/ok', true, 'u1'));
await check('chiunque legge le coppie', true, () => call('GET', 'sims_couples', undefined, 'u3'));
await check('Giulia lascia (toglie la sua metà)', true, () =>
  call('DELETE', 'sims_couples/player_giulia', undefined, 'u2'),
);
await check('Sara non toglie quella di Marco', false, () =>
  call('DELETE', 'sims_couples/player_marco', undefined, 'u3'),
);
const note = (type, from, fromName) => ({ type, from, fromName, t: now });
for (const type of ['engageAsk', 'engageYes', 'engageNo'])
  await check(`avviso ${type}`, true, () =>
    put(`sims_interactions/player_giulia/${type}`, note(type, 'player_marco', 'Marco'), 'u1'),
  );
await check('avviso del tradimento', true, () =>
  put(
    'worlds/CASA-6666/interactions/player_giulia/k',
    { ...note('cheat', 'player_marco', 'Marco'), who: 'Sara' },
    'u1',
  ),
);

console.log('Coppie: ok', Object.keys(results).length, 'prove');
