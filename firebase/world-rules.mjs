// Regole dei mondi nuovi (/worlds/{codice}/…): sono le stesse dei nodi del mondo di sempre
// (sims_rooms_state, sims_chat…), con i riferimenti tra nodi del mondo spostati dentro il mondo.
// In più: l'elenco dei mondi con i posti liberi e la classifica di tutti i mondi.
//   node firebase/world-rules.mjs   → aggiorna firebase/database.rules.proposed.json
// Un test (tests/world-rules.test.ts) controlla che il file sia aggiornato.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withInventoryRules } from './inventory-rules.mjs';
import { withWeedMarketRules } from './weed-market-rules.mjs';

/** Nodi di ogni mondo: gli stessi di shared/worlds.ts (WORLD_NODES). */
export const WORLD_NODES = [
  'rooms_state',
  'online_players',
  'chat',
  'gossip',
  'graveyard',
  'interactions',
  'projects',
  'games',
  'rps',
  'theft',
  'leaderboard',
  'auctions',
  'arcade_records',
  'roulette',
  'arcade_board',
  'theft_blocks',
];

/** Ogni giocatore crea al massimo un mondo ogni 10 minuti (come WORLD_CREATE_EVERY_MS). */
export const CREATE_EVERY_MS = 600000;

// codici dei mondi nuovi (CASA-X92K); il mondo di sempre, CASA-0001, resta nei percorsi sims_*
const CODE = '/^CASA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/';

/** Sposta dentro il mondo i riferimenti ai nodi del mondo: root.child('sims_chat') → …. */
function intoWorld(value) {
  if (typeof value === 'string') {
    let s = value;
    for (const node of WORLD_NODES)
      s = s
        .split(`root.child('sims_${node}')`)
        .join(`root.child('worlds').child($worldId).child('${node}')`);
    return s;
  }
  // le liste restano liste (".indexOn": ["playerId"]): come oggetto il database rifiuta le regole
  if (Array.isArray(value)) return value.map(intoWorld);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, intoWorld(v)]));
  return value;
}

/**
 * Cabinato dei minigiochi (come src/game/cabinet-rules.ts): punti al secondo che nessuno supera
 * giocando davvero, più un margine. Un punteggio più alto del tempo passato dall'inizio della
 * partita (segnato dal server in sims_arcade_runs) non si può scrivere.
 */
export const ARCADE_RATES = { dog: 25, bricks: 20, meteors: 40 };
const ARCADE_SLACK = 100;
const ARCADE_MAX = 1000000;

/** Le regole del cabinato: mobile acquistabile, partita in corso, record. */
function withArcadeRules(r, player) {
  const me = "root.child('sims_accounts').child(auth.uid).child('playerId').val()";
  const run = "root.child('sims_arcade_runs').child(auth.uid)";
  const games = Object.keys(ARCADE_RATES);
  const isGame = (v) => '(' + games.map((g) => `${v} === '${g}'`).join(' || ') + ')';
  // il punteggio: intero, positivo, credibile per il gioco della partita in corso
  const score = (s) =>
    `${s}.isNumber() && ${s}.val() % 1 === 0 && ${s}.val() > 0 && ${s}.val() <= ${ARCADE_MAX} && ` +
    `${run}.child('g').val() === $game && (` +
    games
      .map(
        (g) =>
          `($game === '${g}' && ${s}.val() <= (now - ${run}.child('t').val()) * ${ARCADE_RATES[g] / 1000} + ${ARCADE_SLACK})`,
      )
      .join(' || ') +
    ')';
  const better = "(!data.exists() || newData.child('score').val() > data.child('score').val())";
  // record del condominio e mondiale: solo a proprio nome e più alto di quello che c'è
  const record = {
    $game: {
      '.write': `${player} && ${isGame('$game')}`,
      '.validate':
        `newData.hasChildren(['score','pid','nick','t']) && ${better} && ` +
        score("newData.child('score')"),
      score: { '.validate': 'newData.isNumber()' },
      pid: { '.validate': `newData.val() === ${me}` },
      nick: { '.validate': 'newData.isString() && newData.val().length <= 20' },
      t: { '.validate': 'newData.val() === now' },
      $other: { '.validate': false },
    },
  };
  r.sims_arcade_records = { '.read': player, ...structuredClone(record) };
  r.sims_arcade_global = { '.read': player, ...structuredClone(record) };
  // classifiche (la top 10): il miglior punteggio di ogni giocatore, a proprio nome e solo se
  // migliora; del condominio (arcade_board, nodo del mondo) e del mondo intero (arcade_top)
  const board = {
    $game: {
      '.indexOn': ['score'],
      $pid: {
        '.write': `${player} && $pid === ${me} && ${isGame('$game')}`,
        '.validate':
          `newData.hasChildren(['score','nick','t']) && ${better} && ` +
          score("newData.child('score')"),
        score: { '.validate': 'newData.isNumber()' },
        nick: { '.validate': 'newData.isString() && newData.val().length <= 20' },
        t: { '.validate': 'newData.val() === now' },
        $other: { '.validate': false },
      },
    },
  };
  r.sims_arcade_board = { '.read': player, ...structuredClone(board) };
  r.sims_arcade_top = { '.read': player, ...structuredClone(board) };
  // il record personale di ogni gioco
  r.sims_arcade_best = {
    $pid: {
      '.read': `${player} && $pid === ${me}`,
      $game: {
        '.write': `${player} && $pid === ${me} && ${isGame('$game')}`,
        '.validate':
          `newData.hasChildren(['score','t']) && ${better} && ` + score("newData.child('score')"),
        score: { '.validate': 'newData.isNumber()' },
        t: { '.validate': 'newData.val() === now' },
        $other: { '.validate': false },
      },
    },
  };
  // la partita in corso: quale gioco e quando è cominciata (l'ora la mette il server)
  r.sims_arcade_runs = {
    $uid: {
      '.read': `${player} && auth.uid === $uid`,
      '.write': `${player} && auth.uid === $uid`,
      '.validate': "newData.hasChildren(['g','t'])",
      g: { '.validate': isGame('newData.val()') },
      t: { '.validate': 'newData.val() === now' },
      $other: { '.validate': false },
    },
  };
  // il cabinato si compra come gli altri mobili: negli acquisti della stanza e protetto
  // dalle scritture degli altri (come ogni mobile, vedi la regola della stanza)
  const room = r.sims_rooms_state.$room;
  room.economy.ownedFurniture.cabinet_std = { '.validate': 'newData.isBoolean()' };
  const guard =
    "newData.child('economy/ownedFurniture/cabinet_std').val() === data.child('economy/ownedFurniture/cabinet_std').val()";
  const anchor =
    "newData.child('economy/ownedFurniture/sofa_std').val() === data.child('economy/ownedFurniture/sofa_std').val()";
  if (!room['.validate'].includes(guard)) {
    if (!room['.validate'].includes(anchor)) throw new Error('regola della stanza cambiata');
    room['.validate'] = room['.validate'].replace(anchor, `${anchor} && ${guard}`);
  }
}

/**
 * Roulette della sala scommesse (come src/game/roulette-rules.ts): giri di ROULETTE_ROUND ms,
 * puntate aperte per i primi ROULETTE_BET. Il giro è il numero nel nome del nodo e nel campo r.
 */
export const ROULETTE_ROUND = 40000;
export const ROULETTE_BET = 25000;
/** I giri più vecchi di così si possono cancellare (da chiunque: è solo pulizia). */
const ROULETTE_KEEP = 3600000;

function withRouletteRules(r, player) {
  const me = "root.child('sims_accounts').child(auth.uid).child('playerId').val()";
  const round = (d) => `${d}.child('r').val()`;
  // il nodo del giro è proprio quello del campo r
  const sameRound = `${round('newData')} + '' === $round`;
  const old = `!newData.exists() && ${round('data')} * ${ROULETTE_ROUND} < now - ${ROULETTE_KEEP}`;
  r.sims_roulette = {
    '.read': player,
    bets: {
      $round: {
        $pid: {
          // le proprie puntate, finché sono aperte (cancellarle si può sempre); e la pulizia
          '.write':
            `${player} && (($pid === ${me} && (!newData.exists() || (${sameRound} && ` +
            `${round('newData')} * ${ROULETTE_ROUND} + ${ROULETTE_BET} > now && ` +
            `${round('newData')} * ${ROULETTE_ROUND} <= now + 60000))) || (${old}))`,
          '.validate': "newData.hasChildren(['r','nick','bets'])",
          r: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0' },
          nick: { '.validate': 'newData.isString() && newData.val().length <= 20' },
          bets: {
            $k: {
              '.validate':
                '$k.matches(/^(n([0-9]|[12][0-9]|3[0-6])|red|black|odd|even|low|high|d[123]|c[123])$/) && ' +
                'newData.isNumber() && newData.val() >= 5 && newData.val() <= 500 && newData.val() % 5 === 0',
            },
          },
          $other: { '.validate': false },
        },
      },
    },
    // il numero uscito: lo scrive una volta il primo al tavolo, a puntate chiuse
    results: {
      $round: {
        '.write':
          `${player} && ((!data.exists() && ${sameRound} && ` +
          `now >= ${round('newData')} * ${ROULETTE_ROUND} + ${ROULETTE_BET}) || (${old}))`,
        '.validate': "newData.hasChildren(['r','n'])",
        r: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0' },
        n: {
          '.validate':
            'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0 && newData.val() <= 36',
        },
        $other: { '.validate': false },
      },
    },
    // le vincite incassate: una volta per giro e per giocatore
    paid: {
      $round: {
        $pid: {
          // si cancella solo quando il numero del giro non c'è più (pulizia dei giri vecchi):
          // così non si incassa due volte
          '.write':
            `${player} && (($pid === ${me} && !data.exists()) || ` +
            `(!newData.exists() && !root.child('sims_roulette').child('results').child($round).exists()))`,
          '.validate': 'newData.val() === true',
        },
      },
    },
  };
}

/** Le regole complete: quelle di oggi più mondi, elenco dei mondi e classifica globale. */
export function withWorldRules(rules) {
  const r = { ...rules.rules };
  // chi ha un personaggio (stessa condizione della lettura della classifica)
  const player = r.sims_leaderboard['.read'];
  withArcadeRules(r, player);
  withRouletteRules(r, player);
  withInventoryRules(r.sims_rooms_state.$room);
  withWeedMarketRules(r, player);
  const worlds = { $worldId: { '.validate': `$worldId.matches(${CODE})` } };
  for (const node of WORLD_NODES) worlds.$worldId[node] = intoWorld(r['sims_' + node]);
  r.worlds = worlds;
  // il personaggio di chi scrive
  const me = "root.child('sims_accounts').child(auth.uid).child('playerId').val()";
  r.sims_worlds = {
    '.read': player,
    $code: {
      // si crea e si aggiorna, non si cancella (lo fa il server quando un mondo si svuota).
      // Un mondo nuovo lo crea chi ha segnato l'ora in sims_world_creators nella stessa scrittura:
      // così ne crea al massimo uno ogni CREATE_EVERY_MS.
      '.write':
        `${player} && newData.exists() && ($code === 'CASA-0001' || $code.matches(${CODE})) && ` +
        `(data.exists() || $code === 'CASA-0001' || (newData.child('by').val() === ${me} && ` +
        `newData.parent().parent().child('sims_world_creators').child(${me}).val() === newData.child('createdAt').val()))`,
      '.validate': "newData.hasChildren(['free'])",
      free: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 64' },
      createdAt: {
        '.validate': 'newData.isNumber() && (!data.exists() || newData.val() === data.val())',
      },
      by: {
        '.validate': 'newData.isString() && (!data.exists() || newData.val() === data.val())',
      },
      $other: { '.validate': false },
    },
  };
  // quando ognuno ha creato il suo ultimo mondo: uno ogni CREATE_EVERY_MS
  r.sims_world_creators = {
    $pid: {
      '.read': `${player} && $pid === ${me}`,
      '.write':
        `${player} && $pid === ${me} && newData.isNumber() && newData.val() <= now && ` +
        `newData.val() > now - 60000 && (!data.exists() || data.val() < now - ${CREATE_EVERY_MS})`,
    },
  };
  const lb = structuredClone(r.sims_leaderboard);
  lb.$pid.world = {
    '.validate': `newData.isString() && (newData.val() === 'CASA-0001' || newData.val().matches(${CODE}))`,
  };
  r.sims_leaderboard_global = lb;
  return { ...rules, rules: r };
}

const FILE = new URL('./database.rules.proposed.json', import.meta.url);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const current = JSON.parse(readFileSync(FILE, 'utf8'));
  writeFileSync(FILE, JSON.stringify(withWorldRules(current), null, 2) + '\n');
  console.log('Regole dei mondi aggiornate in firebase/database.rules.proposed.json');
}
