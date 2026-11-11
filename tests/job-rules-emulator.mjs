// Prova le regole della paga dei turni sul database simulato: il Worker (utente ridotto
// job-worker) può solo alzare la cassaforte e scrivere sims_jobs; i giocatori leggono i propri
// turni ma non li scrivono.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/job-rules-emulator.mjs"
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

/** Un giocatore (uid), il Worker ('worker': chiave piena ridotta a job-worker) o l'admin. */
async function call(method, path, body, who) {
  let query = '';
  if (who === 'worker')
    query = '&auth_variable_override=' + encodeURIComponent(JSON.stringify({ uid: 'job-worker' }));
  else if (who) query = `&auth=${tokenOf(who)}`;
  const res = await fetch(`${base}/${path}.json?ns=${ns}${query}`, {
    method,
    headers: who && who !== 'worker' ? {} : admin,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}
const put = (path, body, who) => call('PUT', path, body, who);
const get = (path, who) => call('GET', path, undefined, who);

const now = Date.now();
const rooms = (owners) =>
  Array.from({ length: 64 }, (_, i) =>
    owners[i] ? { id: i + 1, vaultMoney: 100, ...owners[i] } : { id: i + 1, vaultMoney: 0 },
  );
const anna = { owner: 'Anna', ownerId: 'p1', lastSeen: now };

for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));

const check = async (name, expected, run) => assert.equal(await run(), expected, name);

for (const [label, rs] of [
  ['mondo di sempre', 'sims_rooms_state'],
  ['CASA-4444', 'worlds/CASA-4444/rooms_state'],
]) {
  assert(await put(rs, rooms({ 0: anna })));
  await check(`${label}: il Worker versa la paga`, true, () =>
    put(`${rs}/0/vaultMoney`, 145, 'worker'),
  );
  await check(`${label}: il Worker non toglie soldi`, false, () =>
    put(`${rs}/0/vaultMoney`, 10, 'worker'),
  );
  await check(`${label}: il Worker non tocca il resto della stanza`, false, () =>
    put(`${rs}/0/owner`, 'Zero', 'worker'),
  );
  await check(`${label}: il Worker non riscrive le stanze`, false, () =>
    put(rs, rooms({ 0: { ...anna, vaultMoney: 999 } }), 'worker'),
  );
}

const state = { day: '2026-11-15', count: 1, imported: true, exp: { cantiere: 3 } };
await check('il Worker scrive i turni', true, () => put('sims_jobs/u1', state, 'worker'));
await check('i turni senza giorno non valgono', false, () =>
  put('sims_jobs/u1', { count: 1 }, 'worker'),
);
await check('il giocatore legge i suoi turni', true, () => get('sims_jobs/u1', 'u1'));
await check('ma non quelli degli altri', false, () => get('sims_jobs/u1', 'u2'));
await check('e non li scrive', false, () =>
  put('sims_jobs/u1', { ...state, exp: { cantiere: 60 } }, 'u1'),
);
await check('il Worker della criogenesi non scrive i turni', false, async () => {
  const query =
    '&auth_variable_override=' + encodeURIComponent(JSON.stringify({ uid: 'cryo-webhook' }));
  const res = await fetch(`${base}/sims_jobs/u2.json?ns=${ns}${query}`, {
    method: 'PUT',
    headers: admin,
    body: JSON.stringify(state),
  });
  return res.ok;
});

console.log('PASS regole della paga dei turni');
