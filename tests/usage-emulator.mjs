// Prova le regole dei contatori d'uso (sims_usage) sul database simulato: i giocatori possono
// solo aggiungere 1 (come fa il gioco con ServerValue.increment), non leggerli né scriverci altro.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/usage-emulator.mjs"
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
const inc = (n) => ({ '.sv': { increment: n } });
const check = async (name, expected, run) => assert.equal(await run(), expected, name);

assert(await call('PUT', 'sims_accounts/u1', { playerId: 'p1' }));
const P = 'sims_usage/2026-11-12/posto:bar';

await check('il primo uso del giorno', true, () =>
  call('PATCH', P, { n: inc(1), p: inc(1) }, 'u1'),
);
await check('un altro uso, stesso giocatore', true, () =>
  call('PATCH', P, { n: inc(1), p: inc(0) }, 'u1'),
);
await check('un altro giocatore', true, () => call('PATCH', P, { n: inc(1), p: inc(1) }, 'u1'));
const value = await (await fetch(`${base}/${P}.json?ns=${ns}`, { headers: admin })).json();
assert.deepEqual(value, { n: 3, p: 2 }, 'i conti tornano');

await check('non si salta avanti', false, () => call('PATCH', P, { n: 100 }, 'u1'));
await check('non si torna indietro', false, () => call('PATCH', P, { n: inc(-1) }, 'u1'));
await check('i giocatori non si aggiungono a 2 alla volta', false, () =>
  call('PATCH', P, { n: inc(1), p: inc(2) }, 'u1'),
);
await check('non si cancella', false, () => call('DELETE', P, undefined, 'u1'));
await check('niente campi in più', false, () => call('PATCH', P, { n: inc(1), chi: 'p1' }, 'u1'));
await check('voce con lettere strane', false, () =>
  call('PATCH', 'sims_usage/2026-11-12/Posto Bar', { n: inc(1) }, 'u1'),
);
await check('giorno inventato', false, () =>
  call('PATCH', 'sims_usage/domani/posto:bar', { n: inc(1) }, 'u1'),
);
// u9 lo creano altre prove (ospiti, suggerimenti): qui serve un utente mai visto
await check('senza account', false, () => call('PATCH', P, { n: inc(1) }, 'nessuno'));
await check('i giocatori non li leggono', false, () => call('GET', 'sims_usage', undefined, 'u1'));

// l'imbuto d'ingresso: i passi prima dell'account si contano anche senza accesso, solo +1
async function anon(method, path, body) {
  const res = await fetch(`${base}/${path}.json?ns=${ns}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}
const I = 'sims_usage/2026-11-12/ingresso:visto';
await check('ingresso visto, senza accesso', true, () =>
  anon('PATCH', I, { n: inc(1), p: inc(1) }),
);
await check('ingresso, anche da un account senza personaggio', true, () =>
  call('PATCH', I, { n: inc(1), p: inc(0) }, 'nessuno'),
);
await check('senza accesso non si salta avanti', false, () => anon('PATCH', I, { n: 50 }));
await check('senza accesso non si cancella', false, () => anon('DELETE', I));
await check('senza accesso solo i passi d’ingresso', false, () => anon('PATCH', P, { n: inc(1) }));
await check('senza accesso non si legge', false, () => anon('GET', 'sims_usage'));

console.log(
  'PASS contatori d’uso: si aggiunge solo 1, li legge solo il server; ingresso anche senza account.',
);
