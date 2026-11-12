// Prova le regole dei mondi sul database simulato, senza browser: ci si collega come giocatori
// diversi (token di prova, che il simulatore accetta senza firma) e si controlla cosa passa.
//   npx firebase emulators:exec --only database --project demo-casadolcecasa "node tests/world-rules-emulator.mjs"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// le regole come si pubblicano: compattate (firebase/compact-rules.mjs)
import { compactRules } from '../firebase/compact-rules.mjs';

const ns = 'demo-casadolcecasa-default-rtdb';
const base = 'http://127.0.0.1:9000';
const admin = { Authorization: 'Bearer owner' };

// se il database rifiuta le regole resterebbero quelle aperte e la prova non varrebbe niente
const loaded = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers: admin,
  body: compactRules(
    readFileSync(new URL('../firebase/database.rules.proposed.json', import.meta.url), 'utf8'),
  ),
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

// roulette: puntate solo a giro aperto e a proprio nome, il numero una volta a puntate chiuse,
// le vincite incassate una volta. Giri relativi: il prossimo è sempre aperto, uno di 5 fa chiuso.
const RL = 'worlds/CASA-2222/roulette';
const nowRound = Math.floor(Date.now() / 40000);
const next = nowRound + 1,
  past = nowRound - 5;
const bet = (r, bets = { red: 25 }, nick = 'Ada') => ({ r, nick, bets });
await check('Ada punta sul prossimo giro', true, () =>
  put(`${RL}/bets/${next}/p1`, bet(next), 'u1'),
);
await check('Ada non punta su un giro già chiuso', false, () =>
  put(`${RL}/bets/${past}/p1`, bet(past), 'u1'),
);
await check('Ada non punta a nome di Bea', false, () =>
  put(`${RL}/bets/${next}/p2`, bet(next, { red: 25 }, 'Bea'), 'u1'),
);
await check('una casella che non esiste no', false, () =>
  put(`${RL}/bets/${next}/p1`, bet(next, { n37: 25 }), 'u1'),
);
await check('una fiche da 7 Đ no', false, () =>
  put(`${RL}/bets/${next}/p1`, bet(next, { red: 7 }), 'u1'),
);
await check('il giro nel nodo deve essere quello nei dati', false, () =>
  put(`${RL}/bets/${next}/p1`, bet(next + 1), 'u1'),
);
await check('il numero non si estrae a puntate aperte', false, () =>
  put(`${RL}/results/${next}`, { r: next, n: 17 }, 'u2'),
);
await check('a puntate chiuse il numero lo estrae il primo al tavolo', true, () =>
  put(`${RL}/results/${past}`, { r: past, n: 17 }, 'u2'),
);
await check('e nessuno lo cambia dopo', false, () =>
  put(`${RL}/results/${past}`, { r: past, n: 3 }, 'u1'),
);
await check('un numero oltre il 36 no', false, () =>
  put(`${RL}/results/${past - 1}`, { r: past - 1, n: 37 }, 'u1'),
);
await check('Ada incassa la vincita del giro', true, () =>
  put(`${RL}/paid/${past}/p1`, true, 'u1'),
);
await check('ma una volta sola', false, () => put(`${RL}/paid/${past}/p1`, true, 'u1'));
await check('Bea non incassa al posto di Ada', false, () =>
  put(`${RL}/paid/${past}/p3`, true, 'u2'),
);
await check('Bea vede le puntate del tavolo', true, () =>
  call('GET', `${RL}/bets/${next}`, undefined, 'u2'),
);

// sala giochi: sfida con il link, il posto di Bea è vuoto finché qualcuno non lo prende
assert(await put('sims_accounts/u3', { playerId: 'p3' }));
const G = 'worlds/CASA-2222/games/lk3j2a_ab12cd34';
const open = {
  kind: 'c4',
  a: 'p1',
  b: '',
  na: 'Ada',
  nb: '',
  status: 'wait',
  t: Date.now(),
  board: '0'.repeat(42),
  turn: 'a',
};
await check('Ada crea una sfida con il posto vuoto', true, () => put(G, open, 'u1'));
await check('Bea, col link, legge la sfida', true, () => call('GET', G, undefined, 'u2'));
await check('Ada non prende il posto della sua sfida', false, () =>
  put(G, { ...open, b: 'p1', nb: 'Ada', status: 'play' }, 'u1'),
);
await check('Bea non prende il posto a nome di Cri', false, () =>
  put(G, { ...open, b: 'p3', nb: 'Cri', status: 'play' }, 'u2'),
);
await check('Bea prende il posto vuoto e si comincia', true, () =>
  put(G, { ...open, b: 'p2', nb: 'Bea', status: 'play' }, 'u2'),
);
await check('Cri arriva tardi: il posto è preso', false, () =>
  put(G, { ...open, b: 'p3', nb: 'Cri', status: 'play' }, 'u3'),
);
await check('Cri non legge più la partita', false, () => call('GET', G, undefined, 'u3'));
const G2 = 'worlds/CASA-2222/games/lk3j2a_old00000';
assert(await put(G2, { ...open, t: Date.now() - 31 * 60000 }));
await check('una sfida di più di mezz’ora fa non si prende', false, () =>
  put(G2, { ...open, t: Date.now() - 31 * 60000, b: 'p2', nb: 'Bea', status: 'play' }, 'u2'),
);

// cabinato: la partita la data il server, i record devono essere credibili e solo a proprio nome
const sv = { '.sv': 'timestamp' };
await check('Ada comincia una partita a Cane in fuga', true, () =>
  put('sims_arcade_runs/u1', { g: 'dog', t: sv }, 'u1'),
);
await check("Ada non retrodata l'inizio della partita", false, () =>
  put('sims_arcade_runs/u1', { g: 'dog', t: Date.now() - 3600000 }, 'u1'),
);
await check('Ada non comincia una partita a nome di Bea', false, () =>
  put('sims_arcade_runs/u2', { g: 'dog', t: sv }, 'u1'),
);
const rec = (score, pid = 'p1', nick = 'Ada') => ({ score, pid, nick, t: sv });
await check('un punteggio piccolo appena cominciato passa (margine)', true, () =>
  put('sims_arcade_global/dog', rec(60), 'u1'),
);
await check('un punteggio impossibile per il tempo giocato no', false, () =>
  put('sims_arcade_global/dog', rec(5000), 'u1'),
);
await check('un record più basso di quello che c’è no', false, () =>
  put('sims_arcade_global/dog', rec(50), 'u1'),
);
await check('un record a nome di Bea no', false, () =>
  put('sims_arcade_global/dog', rec(90, 'p2', 'Bea'), 'u1'),
);
await check('un record di un altro gioco da quello della partita no', false, () =>
  put('sims_arcade_global/bricks', rec(60), 'u1'),
);
// un minuto di partita: a Cane in fuga al massimo 25 punti al secondo, più il margine di 100
assert(await put('sims_arcade_runs/u1', { g: 'dog', t: Date.now() - 60000 }));
await check('dopo un minuto 1500 punti sono credibili', true, () =>
  put('sims_arcade_global/dog', rec(1500), 'u1'),
);
await check('dopo un minuto 1700 punti no', false, () =>
  put('sims_arcade_global/dog', rec(1700), 'u1'),
);
await check('Ada batte il record del suo condominio', true, () =>
  put('worlds/CASA-2222/arcade_records/dog', rec(1500), 'u1'),
);
await check('Ada salva il suo record personale', true, () =>
  put('sims_arcade_best/p1/dog', { score: 1500, t: sv }, 'u1'),
);
await check('Bea non tocca il record personale di Ada', false, () =>
  put('sims_arcade_best/p1/dog', { score: 1600, t: sv }, 'u2'),
);
await check('Bea non legge il record personale di Ada', false, () =>
  call('GET', 'sims_arcade_best/p1', undefined, 'u2'),
);
await check('Bea legge la classifica mondiale', true, () =>
  call('GET', 'sims_arcade_global', undefined, 'u2'),
);
// classifiche (top 10): una voce per giocatore, a proprio nome, solo se migliora
const top = (score, nick = 'Ada') => ({ score, nick, t: sv });
await check('Ada entra nella classifica del mondo', true, () =>
  put('sims_arcade_top/dog/p1', top(1200), 'u1'),
);
await check('e in quella del suo condominio', true, () =>
  put('worlds/CASA-2222/arcade_board/dog/p1', top(1200), 'u1'),
);
await check('ma non con un punteggio più basso del suo', false, () =>
  put('sims_arcade_top/dog/p1', top(900), 'u1'),
);
await check('né con un punteggio impossibile per il tempo giocato', false, () =>
  put('sims_arcade_top/dog/p1', top(9000), 'u1'),
);
await check('né a nome di Bea', false, () => put('sims_arcade_top/dog/p2', top(1300, 'Bea'), 'u1'));
await check('Bea legge la top 10 ordinata per punti', true, () =>
  call('GET', 'sims_arcade_top/dog', undefined, 'u2'),
);

console.log(results);
console.log(
  'PASS: world rules (rooms, world creation limit, world list, global leaderboard, chat, roulette, cabinet records).',
);
