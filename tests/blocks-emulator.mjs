// Prova le regole di blocco e segnalazione sul database simulato:
// - chi è bloccato non manda chiacchiere, offerte, sfide né assaggi; gli avvisi del gioco passano;
// - la lista dei bloccati la legge e la scrive solo il proprietario;
// - le segnalazioni si scrivono soltanto, una al giorno per persona, e nessun giocatore le legge.
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

// Anna (p1) blocca Bruno (p2); Carlo (p3) no
for (const [uid, pid] of [
  ['u1', 'p1'],
  ['u2', 'p2'],
  ['u3', 'p3'],
])
  assert(await put(`sims_accounts/${uid}`, { playerId: pid }));
const msg = (from, type) => ({ type, from, fromName: 'X', t: Date.now() });
let n = 0;
const key = () => 'k' + n++;

// la lista dei bloccati
await check('Bruno non scrive nella lista di Anna', false, () =>
  put('sims_blocks/p1/p2', { name: 'Bruno', t: Date.now() }, 'u2'),
);
await check('Anna blocca Bruno', true, () =>
  put('sims_blocks/p1/p2', { name: 'Bruno', t: Date.now() }, 'u1'),
);
await check('Anna non blocca sé stessa', false, () =>
  put('sims_blocks/p1/p1', { name: 'Anna', t: Date.now() }, 'u1'),
);
await check('Anna legge la sua lista', true, () => get('sims_blocks/p1', 'u1'));
await check('Bruno non legge la lista di Anna', false, () => get('sims_blocks/p1', 'u2'));

for (const [label, w] of [
  ['mondo di sempre', (n) => `sims_${n}`],
  ['CASA-4444', (n) => `worlds/CASA-4444/${n}`],
]) {
  // messaggi diretti
  await check(`${label}: Bruno non chiacchiera con Anna`, false, () =>
    put(`${w('interactions')}/p1/${key()}`, msg('p2', 'talk'), 'u2'),
  );
  await check(`${label}: né le fa offerte`, false, () =>
    put(`${w('interactions')}/p1/${key()}`, msg('p2', 'colOffer'), 'u2'),
  );
  await check(`${label}: né prova a baciarla`, false, () =>
    put(`${w('interactions')}/p1/${key()}`, msg('p2', 'kissAsk'), 'u2'),
  );
  await check(`${label}: l'avviso del furto passa`, true, () =>
    put(`${w('interactions')}/p1/${key()}`, msg('p2', 'theft'), 'u2'),
  );
  await check(`${label}: la risposta a un'offerta passa`, true, () =>
    put(`${w('interactions')}/p1/${key()}`, msg('p2', 'colNo'), 'u2'),
  );
  await check(`${label}: Carlo chiacchiera con Anna`, true, () =>
    put(`${w('interactions')}/p1/${key()}`, msg('p3', 'talk'), 'u3'),
  );
  await check(`${label}: Anna chiacchiera con Bruno (il blocco è solo verso di lei)`, true, () =>
    put(`${w('interactions')}/p2/${key()}`, msg('p1', 'talk'), 'u1'),
  );
  // sfide
  const rps = (a, b) => ({ a, b, bet: 10, state: 'invited', t: Date.now() });
  await check(`${label}: Bruno non sfida Anna`, false, () =>
    put(`${w('rps')}/p1`, rps('p2', 'p1'), 'u2'),
  );
  await check(`${label}: Carlo sfida Anna`, true, () =>
    put(`${w('rps')}/p1`, rps('p3', 'p1'), 'u3'),
  );
  // assaggi nella stanza di Anna
  assert(
    await put(
      w('rooms_state'),
      Array.from({ length: 64 }, (_, i) =>
        i === 0 ? { id: 1, ownerId: 'p1', vaultMoney: 0 } : { id: i + 1, vaultMoney: 0 },
      ),
    ),
  );
  const gift = { name: 'X', x: 0, y: 0, t: Date.now() };
  await check(`${label}: Bruno non lascia assaggi da Anna`, false, () =>
    put(`${w('gifts')}/0/p2`, gift, 'u2'),
  );
  await check(`${label}: Carlo sì`, true, () => put(`${w('gifts')}/0/p3`, gift, 'u3'));
}

// sblocco: Bruno torna a poter chiacchierare
await check('Anna sblocca Bruno', true, () => put('sims_blocks/p1/p2', null, 'u1'));
await check('ora Bruno chiacchiera con Anna', true, () =>
  put(`sims_interactions/p1/${key()}`, msg('p2', 'talk'), 'u2'),
);

// segnalazioni
const report = (extra = {}) => ({
  name: 'Bruno',
  reason: 'odio',
  world: 'CASA-0001',
  t: Date.now(),
  msgs: { 0: { text: 'brutto messaggio', t: 1 } },
  ...extra,
});
await check('Anna segnala Bruno', true, () => put('sims_reports/p1/p2', report(), 'u1'));
await check('non di nuovo nello stesso giorno', false, () =>
  put('sims_reports/p1/p2', report({ reason: 'spam' }), 'u1'),
);
await check('né la cancella', false, () => put('sims_reports/p1/p2', null, 'u1'));
await check('Carlo non segnala a nome di Anna', false, () =>
  put('sims_reports/p1/p3', report(), 'u3'),
);
await check('motivo inventato no', false, () =>
  put('sims_reports/p3/p2', report({ reason: 'antipatico' }), 'u3'),
);
await check('Carlo segnala Bruno', true, () => put('sims_reports/p3/p2', report(), 'u3'));
await check('nessun giocatore legge le segnalazioni', false, () => get('sims_reports', 'u1'));
await check('nemmeno le sue', false, () => get('sims_reports/p1', 'u1'));
// passato un giorno si può segnalare di nuovo
assert(await put('sims_reports/p1/p2/t', Date.now() - 86_400_000 - 1000));
await check('dopo un giorno Anna può segnalarlo di nuovo', true, () =>
  put('sims_reports/p1/p2', report({ reason: 'molestie' }), 'u1'),
);

console.log('PASS blocco e segnalazioni: azioni dirette fermate, avvisi sì, segnalazioni private.');
