// Prova le regole degli ospiti (accesso anonimo) sul database simulato: entrano e giocano, leggono
// la chat ma non ci scrivono, non registrano inviti; salvando il personaggio il segno "guest" si
// toglie e l'account diventa pieno.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/guest-rules-emulator.mjs"
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

/** Token di prova: `provider` è come si è entrati (anonymous, google.com). */
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
const get = (path, who) => call('GET', path, undefined, who);

const now = Date.now();
const guest = { uid: 'g1', provider: 'anonymous' };
const saved = { uid: 'g1', provider: 'google.com' };
const friend = { uid: 'u2', provider: 'google.com' };
const stranger = { uid: 'u3', provider: 'anonymous' };
const message = (id) => ({ id, name: 'Ospite', text: 'ciao', t: now });

assert(await put('sims_accounts/u2', { playerId: 'player_u2' }));

const results = {};
const check = async (name, expected, run) => {
  results[name] = await run();
  assert.equal(results[name], expected, name);
};

// l'ospite crea il suo personaggio, con il segno "guest"
await check('ospite: personaggio di un altro', false, () =>
  put('sims_accounts/g1', { playerId: 'player_u2', guest: now }, guest),
);
await check('ospite: crea il suo personaggio', true, () =>
  put('sims_accounts/g1', { playerId: 'player_g1', guest: now }, guest),
);
await check('Google: non può fingersi ospite', false, () =>
  put(
    'sims_accounts/u9',
    { playerId: 'player_u9', guest: now },
    { uid: 'u9', provider: 'google.com' },
  ),
);
await check('ospite: legge il suo account', true, () => get('sims_accounts/g1', guest));

// gioca: salvataggio e presenza nel condominio
await check('ospite: salva il personaggio', true, () =>
  put('sims_saves/player_g1', { savedAt: now, moneyLevel: 30 }, guest),
);
await check('ospite: legge la classifica', true, () => get('sims_leaderboard', guest));

// la chat: la legge, non ci scrive (né nel mondo di sempre né nei mondi nuovi)
await check('ospite: legge la chat', true, () => get('sims_chat', guest));
await check('ospite: non scrive in chat', false, () =>
  put('sims_chat/k1', message('player_g1'), guest),
);
await check('ospite: non scrive nella chat di un mondo nuovo', false, () =>
  put('worlds/CASA-2222/chat/k1', message('player_g1'), guest),
);
await check('Google: scrive in chat', true, () =>
  put('sims_chat/k2', { ...message('player_u2'), name: 'Bea' }, friend),
);

// inviti: l'ospite non li registra (il bonus arriva quando salva)
await check('ospite: non registra un invito', false, () =>
  put('sims_invited/g1', 'player_u2', guest),
);

// un altro ospite non può togliere il segno all'account del primo
await check('altro ospite: non tocca un account non suo', false, () =>
  put('sims_accounts/g1', { playerId: 'player_g1' }, stranger),
);
// finché è ospite, il segno resta
await check('ospite: non si toglie il segno da solo', false, () =>
  put('sims_accounts/g1', { playerId: 'player_g1' }, guest),
);
// salvato con Google (stesso uid): il segno si toglie, il personaggio resta lo stesso
await check('salvato: non cambia personaggio', false, () =>
  put('sims_accounts/g1', { playerId: 'player_u2' }, saved),
);
await check('salvato: toglie il segno', true, () =>
  put('sims_accounts/g1', { playerId: 'player_g1' }, saved),
);
await check('salvato: ora scrive in chat', true, () =>
  put('sims_chat/k3', message('player_g1'), saved),
);

console.log('Regole degli ospiti: ok', Object.keys(results).length, 'prove');
