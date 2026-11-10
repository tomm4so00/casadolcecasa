// Prova le regole dei tentativi di furto sul database simulato: 3 per tutti; il Criminale come
// prima personalità arriva a 5, 7 e 9 (livelli 1, 2, 3), come secondo tratto a 4, 5 e 6.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/criminal-tries-emulator.mjs"
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

/** Fin dove arrivano i tentativi con questa personalità (si prova fino a 12). */
async function maxTries(i, personality) {
  const uid = 'u' + i,
    pid = 'player_ladro' + i;
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
  // il salvataggio lo scrive l'amministratore: qui conta solo la personalità
  assert(await put(`sims_saves/${pid}/personality`, personality));
  // qualche secondo fa: l'orologio del database non deve vederla nel futuro
  const since = Date.now() - 5000;
  let n = 0;
  while (n < 12 && (await put(`sims_theft/${pid}/0`, { n: n + 1, since }, uid))) n++;
  return n;
}

const cases = [
  ['nessuna personalità', { points: {} }, 3],
  ['Criminale livello 1', { announced: { criminal: true }, prevail: { criminal: 5 } }, 5],
  ['Criminale livello 2', { announced: { criminal: true }, prevail: { criminal: 15 } }, 7],
  ['Criminale livello 3', { announced: { criminal: true }, prevail: { criminal: 30 } }, 9],
  [
    'secondo tratto livello 1',
    { announced: { artist: true }, prevail: { artist: 9, criminal: 5 }, second: 'criminal' },
    4,
  ],
  [
    'secondo tratto livello 2',
    { announced: { artist: true }, prevail: { artist: 20, criminal: 15 }, second: 'criminal' },
    5,
  ],
  [
    'secondo tratto livello 3',
    { announced: { artist: true }, prevail: { artist: 40, criminal: 30 }, second: 'criminal' },
    6,
  ],
  ['un Artista', { announced: { artist: true }, prevail: { artist: 30 } }, 3],
];
const results = {};
for (const [i, [name, personality, expected]] of cases.entries()) {
  results[name] = await maxTries(i, personality);
  assert.equal(results[name], expected, name);
}
console.log('Tentativi del Criminale: ok', JSON.stringify(results));
