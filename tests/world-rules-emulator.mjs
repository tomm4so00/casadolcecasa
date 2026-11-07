// Prova le regole dei mondi sul database simulato, senza browser: ci si collega come giocatori
// diversi (token di prova, che il simulatore accetta senza firma) e si controlla cosa passa.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/world-rules-emulator.mjs"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ns = 'demo-casadolcecasa-default-rtdb';
const base = 'http://127.0.0.1:9000';
const admin = { Authorization: 'Bearer owner' };

// se il database rifiuta le regole resterebbero quelle aperte e la prova non varrebbe niente
const loaded = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers: admin,
  body: readFileSync(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
});
assert.equal(loaded.ok, true, 'rules rejected: ' + (await loaded.text()));

/** Token di prova di un giocatore entrato con Google. */
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

const rooms = (owners) =>
  Array.from({ length: 64 }, (_, i) =>
    owners[i] ? { id: i + 1, vaultMoney: 30, ...owners[i] } : { id: i + 1, vaultMoney: 0 },
  );
const now = Date.now();
const W = 'worlds/CASA-2222/rooms_state';

// due giocatori con un account; Bea abita nella stanza 1 del condominio CASA-2222
assert(await put('sims_accounts/u1', { playerId: 'p1' }));
assert(await put('sims_accounts/u2', { playerId: 'p2' }));
assert(await put('sims_worlds/CASA-2222', { free: 63, createdAt: now - 7200000, by: 'p2' }));
assert(await put(W, rooms({ 0: { owner: 'Bea', ownerId: 'p2', lastSeen: now, pin: 'h123' } })));

const results = {};
const check = async (name, expected, run) => {
  results[name] = await run();
  assert.equal(results[name], expected, name);
};

// stanze
await check('Ada prende una stanza libera per sé', true, () =>
  put(
    W,
    rooms({
      0: { owner: 'Bea', ownerId: 'p2', lastSeen: now, pin: 'h123' },
      1: { owner: 'Ada', ownerId: 'p1', lastSeen: now },
    }),
    'u1',
  ),
);
await check('Ada non può prendersi la stanza di Bea', false, () =>
  put(`${W}/0`, { id: 1, vaultMoney: 30, owner: 'Ada', ownerId: 'p1', lastSeen: now }, 'u1'),
);
await check('Ada non può cambiare il PIN di Bea', false, () => put(`${W}/0/pin`, 'h999', 'u1'));
await check('Ada non può dare una stanza libera a Bea', false, () =>
  put(`${W}/2`, { id: 3, vaultMoney: 0, owner: 'Bea', ownerId: 'p2', lastSeen: now }, 'u1'),
);
await check('Ada lascia la sua stanza', true, () => put(`${W}/1`, { id: 2, vaultMoney: 0 }, 'u1'));

// mondi nuovi: uno ogni 10 minuti, solo a proprio nome
const t = Date.now() - 1000;
await check('Ada crea un condominio', true, () =>
  patch(
    '',
    {
      'sims_worlds/CASA-3333': { free: 64, createdAt: t, by: 'p1' },
      'sims_world_creators/p1': t,
    },
    'u1',
  ),
);
await check('Ada non ne crea subito un altro', false, () =>
  patch(
    '',
    {
      'sims_worlds/CASA-4444': { free: 64, createdAt: t + 1, by: 'p1' },
      'sims_world_creators/p1': t + 1,
    },
    'u1',
  ),
);
await check('senza segnare l’ora non si crea un condominio', false, () =>
  put('sims_worlds/CASA-5555', { free: 64, createdAt: t, by: 'p2' }, 'u2'),
);
await check('Bea non crea un condominio a nome di Ada', false, () =>
  patch(
    '',
    {
      'sims_worlds/CASA-6666': { free: 64, createdAt: t, by: 'p1' },
      'sims_world_creators/p2': t,
    },
    'u2',
  ),
);
await check('chiunque aggiorna i posti liberi', true, () =>
  put('sims_worlds/CASA-3333/free', 63, 'u2'),
);
await check('nessuno cambia chi l’ha creato', false, () =>
  put('sims_worlds/CASA-3333/by', 'p2', 'u2'),
);
await check('nessuno cancella un condominio dall’elenco', false, () =>
  call('DELETE', 'sims_worlds/CASA-3333', undefined, 'u2'),
);

// classifica di tutti i mondi: ognuno la sua riga
await check('Ada scrive la sua riga nella classifica di tutti', true, () =>
  put('sims_leaderboard_global/p1', { name: 'Ada', wealth: 30, world: 'CASA-3333' }, 'u1'),
);
await check('Ada non scrive la riga di Bea', false, () =>
  put('sims_leaderboard_global/p2', { name: 'Bea', wealth: 1e6, world: 'CASA-2222' }, 'u1'),
);

// dentro un mondo nuovo valgono le regole di sempre (qui: la chat)
await check('Ada scrive nella chat del suo condominio', true, () =>
  put('worlds/CASA-2222/chat/m1', { id: 'p1', name: 'Ada', text: 'ciao', t: Date.now() }, 'u1'),
);
await check('Ada non scrive un messaggio a nome di Bea', false, () =>
  put('worlds/CASA-2222/chat/m2', { id: 'p2', name: 'Bea', text: 'ciao', t: Date.now() }, 'u1'),
);

console.log(results);
console.log(
  'PASS: world rules (rooms, world creation limit, world list, global leaderboard, chat).',
);
