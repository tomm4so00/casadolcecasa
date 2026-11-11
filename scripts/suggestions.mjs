// La cassetta "Suggerimenti e bug" dal PC, con la Firebase CLI (serve "npx firebase login" con un
// account che ha accesso al progetto):
//   node scripts/suggestions.mjs                    → gli ultimi messaggi (🆕 = non ancora letti)
//   node scripts/suggestions.mjs letti              → segna tutti come letti
//   node scripts/suggestions.mjs staff              → chi può leggerli nel gioco
//   node scripts/suggestions.mjs staff + <nome>     → aggiunge un collaboratore (nome nel gioco o uid)
//   node scripts/suggestions.mjs staff - <nome>     → lo toglie
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT = process.env.FIREBASE_PROJECT || 'casadolcecasa-6d92a';
const CLI = resolve('node_modules/firebase-tools/lib/bin/firebase.js');
const KIND = { idea: '💡 Idea', bug: '🐞 Bug' };

function firebase(args) {
  return execFileSync(process.execPath, [CLI, ...args, '--project', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Legge un percorso del database (con le opzioni della CLI, per esempio un ordinamento). */
function read(path, extra = []) {
  const file = join(mkdtempSync(join(tmpdir(), 'cassetta-')), 'out.json');
  firebase(['database:get', path, '-o', file, ...extra]);
  return JSON.parse(readFileSync(file, 'utf8') || 'null');
}

function write(path, value) {
  firebase(['database:set', path, '--data', JSON.stringify(value), '--force']);
}

function remove(path) {
  firebase(['database:remove', path, '--force']);
}

const when = (t) =>
  new Date(t).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    dateStyle: 'short',
    timeStyle: 'short',
  });

function list() {
  // tutta la cassetta, ordinata qui: non serve l'indice del database
  const raw = read('/sims_suggestions') || {};
  const all = Object.entries(raw)
    .map(([id, s]) => ({ id, ...s }))
    .filter((s) => typeof s.text === 'string')
    .sort((a, b) => a.t - b.t)
    .slice(-50);
  if (!all.length) return console.log('📭 La cassetta è vuota.');
  for (const s of all) {
    const meta = [when(s.t), s.v ? 'v' + s.v : '', s.world || ''].filter(Boolean).join(' · ');
    console.log(`${s.seen ? '  ' : '🆕'} ${KIND[s.kind] || s.kind} da ${s.nick} (${meta})`);
    console.log('   ' + s.text.replaceAll('\n', '\n   ') + '\n');
  }
  const fresh = all.filter((s) => !s.seen).length;
  console.log(`📬 ${all.length} messaggi, ${fresh} non letti.`);
}

function markSeen() {
  const raw = read('/sims_suggestions') || {};
  const ids = Object.entries(raw)
    .filter(([, s]) => s && !s.seen)
    .map(([id]) => id);
  for (const id of ids) write(`/sims_suggestions/${id}/seen`, true);
  console.log(`✅ ${ids.length} messaggi segnati come letti.`);
}

/** L'uid di un giocatore dal suo nome nel gioco (o l'uid stesso). */
function findUid(who) {
  const board = read('/sims_leaderboard_global') || {};
  const pids = Object.entries(board)
    .filter(
      ([, e]) => e && typeof e.name === 'string' && e.name.toLowerCase() === who.toLowerCase(),
    )
    .map(([pid]) => pid);
  if (!pids.length) {
    // forse è già un uid
    if (read(`/sims_accounts/${who}/playerId`)) return { uid: who, name: who };
    throw new Error(`Nessun giocatore si chiama "${who}" (deve essere vivo e in classifica).`);
  }
  if (pids.length > 1)
    throw new Error(
      `Ci sono ${pids.length} giocatori di nome "${who}": usa l'uid del suo account.`,
    );
  const accounts = read('/sims_accounts', ['--order-by', 'playerId', '--equal-to', pids[0]]) || {};
  const uid = Object.keys(accounts)[0];
  if (!uid) throw new Error(`Non trovo l'account di "${who}".`);
  return { uid, name: board[pids[0]].name };
}

function staff(op, who) {
  if (op === '+' || op === '-') {
    if (!who) throw new Error('Manca il nome: node scripts/suggestions.mjs staff + <nome>');
    const { uid, name } = findUid(who);
    if (op === '+') write(`/sims_staff/${uid}`, name);
    else remove(`/sims_staff/${uid}`);
    console.log(op === '+' ? `✅ ${name} ora legge la cassetta.` : `✅ ${name} tolto.`);
  }
  const all = read('/sims_staff') || {};
  const names = Object.entries(all).map(([uid, n]) => `• ${n} (${uid})`);
  console.log(names.length ? '👥 Collaboratori:\n' + names.join('\n') : '👥 Nessun collaboratore.');
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (!cmd) list();
  else if (cmd === 'letti') markSeen();
  else if (cmd === 'staff') staff(rest[0], rest.slice(1).join(' '));
  else throw new Error('Comandi: (niente), letti, staff, staff + <nome>, staff - <nome>');
} catch (e) {
  console.error('⚠️ ' + (e.stderr?.toString().trim() || e.message));
  process.exit(1);
}
