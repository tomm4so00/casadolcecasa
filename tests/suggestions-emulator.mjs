// Prova le regole della cassetta "Suggerimenti e bug" sul database simulato: scrive solo chi ha un
// account (non gli ospiti), a nome suo e al massimo una volta ogni 10 minuti; leggono, segnano
// come letti e cancellano solo i collaboratori (sims_staff).
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/suggestions-emulator.mjs"
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

function tokenOf(uid, provider) {
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
      firebase: { sign_in_provider: provider, identities: {} },
    }),
    '',
  ].join('.');
}

async function call(method, path, body, who) {
  const auth = who ? `&auth=${tokenOf(who.uid, who.provider)}` : '';
  const res = await fetch(`${base}/${path}.json?ns=${ns}${auth}`, {
    method,
    headers: who ? {} : admin,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}
const put = (path, body, who) => call('PUT', path, body, who);
const patch = (path, body, who) => call('PATCH', path, body, who);
const get = (path, who) => call('GET', path, undefined, who);
const del = (path, who) => call('DELETE', path, undefined, who);

const ada = { uid: 'u1', provider: 'google.com' };
const guest = { uid: 'g1', provider: 'anonymous' };
const boss = { uid: 'u9', provider: 'google.com' };
assert(await put('sims_accounts/u1', { playerId: 'player_u1' }));
assert(await put('sims_accounts/g1', { playerId: 'player_g1', guest: 1 }));
assert(await put('sims_accounts/u9', { playerId: 'player_u9' }));
assert(await put('sims_staff/u9', 'Capo'));

const note = (who, t, more = {}) => ({
  uid: who.uid,
  pid: 'player_' + who.uid,
  nick: 'Ada',
  kind: 'idea',
  text: 'Aggiungete i gatti',
  t,
  v: '0.26.0',
  ...more,
});
/** Messaggio e ora dell'ultimo, insieme (come fa il gioco). */
const send = (who, id, t, more) =>
  patch(
    '',
    { [`sims_suggestions/${id}`]: note(who, t, more), [`sims_suggest_last/${who.uid}`]: t },
    who,
  );

const check = async (name, expected, run) => {
  assert.equal(await run(), expected, name);
};
const now = Date.now();

await check('ospite: non scrive', false, () => send(guest, 'g', now));
await check('senza aggiornare l’ultimo invio: no', false, () =>
  put('sims_suggestions/x', note(ada, now), ada),
);
await check('a nome di un altro: no', false, () =>
  patch(
    '',
    { 'sims_suggestions/y': { ...note(ada, now), pid: 'player_u9' }, 'sims_suggest_last/u1': now },
    ada,
  ),
);
await check('già segnato come letto o mandato: no', false, () => send(ada, 'z', now, { tg: true }));
await check('troppo corto: no', false, () => send(ada, 'z', now, { text: 'ok' }));
await check('con un account: scrive', true, () => send(ada, 'a1', now));
await check('subito un altro: no (10 minuti)', false, () => send(ada, 'a2', now + 1000));
await check('non riscrive il suo', false, () =>
  put('sims_suggestions/a1', note(ada, now, { text: 'cambiato tutto' }), ada),
);
await check('il giocatore non legge i messaggi', false, () => get('sims_suggestions', ada));
await check('il giocatore legge il suo ultimo invio', true, () => get('sims_suggest_last/u1', ada));
await check('il collaboratore legge', true, () => get('sims_suggestions', boss));
await check('il giocatore non segna come letto', false, () =>
  put('sims_suggestions/a1/seen', true, ada),
);
await check('il collaboratore segna come letto', true, () =>
  put('sims_suggestions/a1/seen', true, boss),
);
await check('il collaboratore non cambia il testo', false, () =>
  put('sims_suggestions/a1/text', 'altro testo', boss),
);
await check('nessuno si aggiunge ai collaboratori', false, () => put('sims_staff/u1', 'Ada', ada));
await check('il giocatore non cancella', false, () => del('sims_suggestions/a1', ada));
await check('il collaboratore cancella', true, () => del('sims_suggestions/a1', boss));
console.log('OK: regole della cassetta dei suggerimenti');
