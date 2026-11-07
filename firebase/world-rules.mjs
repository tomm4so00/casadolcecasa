// Regole dei mondi nuovi (/worlds/{codice}/…): sono le stesse dei nodi del mondo di sempre
// (sims_rooms_state, sims_chat…), con i riferimenti tra nodi del mondo spostati dentro il mondo.
// In più: l'elenco dei mondi con i posti liberi e la classifica di tutti i mondi.
//   node firebase/world-rules.mjs   → aggiorna firebase/database.rules.proposed.json
// Un test (tests/world-rules.test.ts) controlla che il file sia aggiornato.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/** Le regole complete: quelle di oggi più mondi, elenco dei mondi e classifica globale. */
export function withWorldRules(rules) {
  const r = { ...rules.rules };
  // chi ha un personaggio (stessa condizione della lettura della classifica)
  const player = r.sims_leaderboard['.read'];
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
