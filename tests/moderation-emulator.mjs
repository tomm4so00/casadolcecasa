// Prova le regole della moderazione sul database simulato: moderatori (li nomina solo il gestore),
// silenzi (chi è silenziato non scrive in chat), segnalazioni leggibili e archiviabili solo dai
// moderatori, sospensioni e cancellazioni dei minorenni.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/moderation-emulator.mjs"
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/blocks-emulator.mjs"
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
const get = (path, uid) => call('GET', path, undefined, uid);
const check = async (name, expected, run) => assert.equal(await run(), expected, name);

// Anna (u1/p1) è moderatrice; Bruno (u2/p2) è silenziato; Carlo (u3/p3) gioca e basta
for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
  ['u3', 'p3'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const now = Date.now();
// si parte puliti: le prove di prima (blocks-emulator) hanno già scritto segnalazioni
for (const node of ['sims_reports', 'sims_mutes', 'sims_bans']) assert(await put(node, null));
const mute = (until) => ({ until, t: Date.now(), why: 'moderatore' });

// nessuno si nomina moderatore da solo
await check('Carlo non si fa moderatore', false, () => put('sims_mods/u3', true, 'u3'));
assert(await put('sims_mods/u1', true));
await check('Anna sa di essere moderatrice', true, () => get('sims_mods/u1', 'u1'));
await check('Carlo non legge i moderatori', false, () => get('sims_mods/u1', 'u3'));

// silenzi
await check('Carlo non silenzia Bruno', false, () =>
  put('sims_mutes/p2', mute(now + 3600000), 'u3'),
);
await check('Anna silenzia Bruno', true, () => put('sims_mutes/p2', mute(now + 3600000), 'u1'));
await check('tutti leggono i silenzi (per i fumetti)', true, () => get('sims_mutes', 'u3'));
await check('Bruno non toglie il suo silenzio', false, () => put('sims_mutes/p2', null, 'u2'));

for (const [label, chat] of [
  ['mondo di sempre', 'sims_chat'],
  ['CASA-4444', 'worlds/CASA-4444/chat'],
]) {
  const msg = (id) => ({ id, name: 'X', text: 'ciao', t: Date.now() });
  await check(`${label}: Bruno silenziato non scrive`, false, () =>
    put(`${chat}/mod_k1`, msg('p2'), 'u2'),
  );
  await check(`${label}: Carlo scrive`, true, () => put(`${chat}/mod_k2`, msg('p3'), 'u3'));
  await check(`${label}: Carlo non cancella i messaggi degli altri`, false, () =>
    put(`${chat}/mod_k2`, null, 'u2'),
  );
  await check(`${label}: la moderatrice cancella il messaggio di Carlo`, true, () =>
    put(`${chat}/mod_k2`, null, 'u1'),
  );
  await check(`${label}: ma non scrive a nome di altri`, false, () =>
    put(`${chat}/mod_k3`, msg('p3'), 'u1'),
  );
}

// silenzio scaduto: Bruno torna a scrivere
await check('Anna toglie il silenzio', true, () => put('sims_mutes/p2', mute(Date.now()), 'u1'));
await check('Bruno scrive di nuovo', true, () =>
  put('sims_chat/mod_k9', { id: 'p2', name: 'B', text: 'scusate', t: Date.now() }, 'u2'),
);

// segnalazioni: le legge e le archivia solo la moderatrice
const report = { name: 'Bruno', reason: 'odio', world: 'CASA-0001', t: Date.now() };
await check('Carlo segnala Bruno', true, () => put('sims_reports/p3/p2', report, 'u3'));
await check('Carlo non legge le segnalazioni', false, () => get('sims_reports', 'u3'));
await check('Anna le legge', true, () => get('sims_reports', 'u1'));
await check('Anna non le modifica', false, () =>
  put('sims_reports/p3/p2', { ...report, reason: 'spam' }, 'u1'),
);
await check('Anna le archivia', true, () => put('sims_reports/p3/p2', null, 'u1'));

// sospensioni
const ban = { until: Date.now() + 86400000, t: Date.now(), why: 'moderatore' };
await check('Carlo non sospende nessuno', false, () => put('sims_bans/p2', ban, 'u3'));
await check('Carlo non legge le sospensioni', false, () => get('sims_bans', 'u3'));
await check('Anna sospende Bruno', true, () => put('sims_bans/p2', ban, 'u1'));
await check('Anna chiede la cancellazione di un minorenne', true, () =>
  put('sims_bans/p3', { ...ban, why: 'minore', del: true }, 'u1'),
);
await check('niente campi inventati', false, () => put('sims_bans/p3', { ...ban, boh: 1 }, 'u1'));

console.log('PASS moderazione: silenzi, moderatori, segnalazioni e sospensioni.');
