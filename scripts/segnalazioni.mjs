// Le segnalazioni dei giocatori (sims_reports, vedi src/game/blocks.ts) dal PC, con la Firebase
// CLI (serve "npx firebase login" con un account che ha accesso al progetto):
//   node scripts/segnalazioni.mjs                        → le segnalazioni, raggruppate per segnalato
//   node scripts/segnalazioni.mjs chiudi <segnalato>     → cancella quelle su di lui (gestite)
//   node scripts/segnalazioni.mjs moderatore             → chi vede il pannello 🛡️ Moderazione
//   node scripts/segnalazioni.mjs moderatore + <nome>    → lo dà a un giocatore (nome o uid)
//   node scripts/segnalazioni.mjs moderatore - <nome>    → lo toglie
// Restano comunque al massimo 6 mesi: poi le cancella la manutenzione (pruneReports).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT = process.env.FIREBASE_PROJECT || 'casadolcecasa-6d92a';
const CLI = resolve('node_modules/firebase-tools/lib/bin/firebase.js');
const REASON = {
  molestie: '😠 Insulti o molestie',
  odio: '🚫 Odio',
  sessuale: '🔞 Contenuti sessuali',
  dati: '📵 Chiede contatti o dati personali',
  spam: '📢 Spam o truffa',
  minore: '🧒 Sembra minorenne',
  altro: '✏️ Altro',
};

function firebase(args) {
  return execFileSync(process.execPath, [CLI, ...args, '--project', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function read(path) {
  const file = join(mkdtempSync(join(tmpdir(), 'segnalazioni-')), 'out.json');
  firebase(['database:get', path, '-o', file]);
  return JSON.parse(readFileSync(file, 'utf8') || 'null');
}

const when = (t) =>
  new Date(t).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    dateStyle: 'short',
    timeStyle: 'short',
  });

/** Tutte le segnalazioni, raggruppate per giocatore segnalato. */
function grouped() {
  const raw = read('/sims_reports') || {};
  const byWho = new Map();
  for (const [by, list] of Object.entries(raw))
    for (const [who, r] of Object.entries(list || {})) {
      if (!r || typeof r.t !== 'number') continue;
      if (!byWho.has(who)) byWho.set(who, []);
      byWho.get(who).push({ by, ...r });
    }
  return byWho;
}

function list() {
  const byWho = grouped();
  if (!byWho.size) return console.log('📭 Nessuna segnalazione.');
  const names = read('/sims_leaderboard_global') || {};
  const nameOf = (pid) => names[pid]?.name || pid;
  // prima chi è stato segnalato da più persone, poi il più recente
  const order = [...byWho.entries()].sort(
    (a, b) =>
      b[1].length - a[1].length ||
      Math.max(...b[1].map((r) => r.t)) - Math.max(...a[1].map((r) => r.t)),
  );
  for (const [who, reports] of order) {
    console.log(`🚩 ${reports[0].name || nameOf(who)} (${who}): ${reports.length} segnalazioni`);
    for (const r of reports.sort((a, b) => a.t - b.t)) {
      console.log(
        `   • ${REASON[r.reason] || r.reason} da ${nameOf(r.by)} · ${when(r.t)} · ${r.world || ''}`,
      );
      if (r.note) console.log(`     📝 ${r.note.replaceAll('\n', ' ')}`);
      for (const m of Object.values(r.msgs || {}).sort((a, b) => a.t - b.t))
        console.log(`     💬 ${when(m.t)}  ${m.text.replaceAll('\n', ' ')}`);
    }
    console.log('');
  }
  console.log(`📬 ${order.length} giocatori segnalati.`);
}

function close(who) {
  if (!who) throw new Error('Manca il codice: node scripts/segnalazioni.mjs chiudi <segnalato>');
  const reports = grouped().get(who) || [];
  for (const r of reports) firebase(['database:remove', `/sims_reports/${r.by}/${who}`, '--force']);
  console.log(`✅ Tolte ${reports.length} segnalazioni su ${who}.`);
}

/** L'uid di un giocatore dal suo nome nel gioco (o l'uid stesso), come in suggestions.mjs. */
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
  const accounts = read('/sims_accounts') || {};
  const uid = Object.keys(accounts).find((u) => accounts[u]?.playerId === pids[0]);
  if (!uid) throw new Error(`Non trovo l'account di "${who}".`);
  return { uid, name: board[pids[0]].name };
}

function moderators(op, who) {
  if (op === '+' || op === '-') {
    if (!who) throw new Error('Manca il nome: node scripts/segnalazioni.mjs moderatore + <nome>');
    const { uid, name } = findUid(who);
    if (op === '+') firebase(['database:set', `/sims_mods/${uid}`, '--data', 'true', '--force']);
    else firebase(['database:remove', `/sims_mods/${uid}`, '--force']);
    console.log(op === '+' ? `✅ ${name} ora vede il pannello Moderazione.` : `✅ ${name} tolto.`);
  }
  const all = read('/sims_mods') || {};
  const uids = Object.keys(all).filter((u) => all[u] === true);
  console.log(
    uids.length
      ? '🛡️ Moderatori:\n' + uids.map((u) => '• ' + u).join('\n')
      : '🛡️ Nessun moderatore.',
  );
}

const [cmd, arg, ...rest] = process.argv.slice(2);
try {
  if (!cmd) list();
  else if (cmd === 'chiudi') close(arg);
  else if (cmd === 'moderatore') moderators(arg, rest.join(' '));
  else
    throw new Error(
      'Comandi: (niente), chiudi <segnalato>, moderatore, moderatore + <nome>, moderatore - <nome>',
    );
} catch (e) {
  console.error('⚠️ ' + (e.stderr?.toString().trim() || e.message));
  process.exit(1);
}
