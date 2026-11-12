// La ritenzione (sims_retention, vedi shared/retention-rules.ts): quanti giocatori tornano dopo il
// primo giorno, per settimana d'inizio, e quanti hanno giocato negli ultimi 7 giorni. Legge il
// database con la Firebase CLI già collegata (npx firebase login), crea una pagina e la apre.
//   node scripts/ritenzione.mjs            → gioco vero
//   node scripts/ritenzione.mjs --prova    → gioco di prova
//   node scripts/ritenzione.mjs --testo    → anche il riepilogo nel terminale (per /ritenzione)
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WINDOWS,
  backLabel,
  dayIndex,
  dayString,
  retentionReport,
  romeDay,
} from '../shared/retention-rules.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const PROJECT = args.includes('--prova') ? 'casadolcecasa-prova' : 'casadolcecasa-6d92a';

function read(path) {
  const dir = mkdtempSync(join(tmpdir(), 'ritenzione-'));
  const file = join(dir, 'dati.json');
  const cli = resolve(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js');
  execFileSync(
    process.execPath,
    [cli, 'database:get', path, '--project', PROJECT, '-o', file, '--non-interactive'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(readFileSync(file, 'utf8') || 'null');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (day) => day.slice(5).split('-').reverse().join('/');
const weekLabel = (monday) => `${short(monday)}–${short(dayString(dayIndex(monday) + 6))}`;

function page(r, since) {
  const rows = r.cohorts
    .map(
      (c) =>
        `<tr><td>${weekLabel(c.week)}</td><td class="num">${c.size}</td>` +
        c.back
          .map((n) => {
            const pct = n === null || !c.size ? null : Math.round((n / c.size) * 100);
            return (
              `<td class="num">${esc(backLabel(n, c.size))}` +
              (pct === null ? '' : `<span class="bar"><span style="width:${pct}%"></span></span>`) +
              '</td>'
            );
          })
          .join('') +
        '</tr>',
    )
    .join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ritenzione dei giocatori</title><style>
:root{--bg:#f6f7f9;--fg:#1d2329;--muted:#66717c;--line:#dde3e8;--bar:#4a7fa7;--card:#fff}
@media (prefers-color-scheme: dark){:root{--bg:#15191d;--fg:#e8edf1;--muted:#97a3ae;--line:#2c343b;--bar:#6aa3cf;--card:#1c2227}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,'Segoe UI',sans-serif;margin:0;padding:24px 16px}
main{max-width:860px;margin:0 auto}h1{margin:0 0 4px}h2{margin:28px 0 8px}.muted{color:var(--muted)}
.cards{display:flex;gap:12px;flex-wrap:wrap}.card{background:var(--card);border-radius:8px;padding:12px 16px;min-width:140px}
.card b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border-radius:8px;overflow:hidden}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left}th{font-size:13px;color:var(--muted);font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar{display:block;height:6px;border-radius:3px;background:var(--line);margin-top:4px}
.bar span{display:block;height:6px;border-radius:3px;background:var(--bar)}
</style></head><body><main>
<h1>Ritenzione dei giocatori</h1>
<p class="muted">${PROJECT === 'casadolcecasa-prova' ? 'Gioco di prova' : 'Gioco di tutti'} ·
ultimi 7 giorni: dal ${short(r.from)} al ${short(r.to)} · giorni giocati segnati dal ${short(since)}.
Si contano le persone (account), non i personaggi.</p>
<div class="cards"><div class="card"><b>${r.active}</b>attivi</div>
<div class="card"><b>${r.newPlayers}</b>nuovi</div><div class="card"><b>${r.returning}</b>di ritorno</div></div>
<h2>Chi torna, per settimana d'inizio</h2>
${
  r.cohorts.length
    ? `<div class="wrap"><table><thead><tr><th>Iniziati</th><th class="num">Nuovi</th>` +
      WINDOWS.map(
        (w) => `<th class="num">${w.label}${w.from === w.to ? '' : ` (${w.from}–${w.to})`}</th>`,
      ).join('') +
      `</tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">"—": il periodo non è ancora finito per tutti quelli della settimana.</p>`
    : '<p class="muted">Ancora nessun giocatore nuovo da seguire.</p>'
}
</main></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const since = read('/sims_meta/retentionSince');
  // gli ultimi 7 giorni finiti: fino a ieri
  const last = romeDay(Date.now() - 86_400_000);
  const r =
    typeof since === 'string'
      ? retentionReport(read('/sims_retention'), last, since)
      : retentionReport({}, last, last);
  const file = join(mkdtempSync(join(tmpdir(), 'ritenzione-')), 'ritenzione.html');
  writeFileSync(file, page(r, typeof since === 'string' ? since : last));
  if (args.includes('--testo')) {
    console.log(`Ritenzione (${PROJECT}), dal ${r.from} al ${r.to}:`);
    if (typeof since !== 'string')
      console.log('Ancora nessun dato: il server segna i giorni giocati dalla versione nuova.');
    else console.log(`Giorni giocati segnati dal ${since}.`);
    console.log(`Attivi ${r.active} (nuovi ${r.newPlayers}, di ritorno ${r.returning})`);
    for (const c of r.cohorts)
      console.log(
        `Iniziati ${weekLabel(c.week)}: ${c.size} → ` +
          WINDOWS.map((w, i) => `${w.label}: ${backLabel(c.back[i], c.size)}`).join(' · '),
      );
  }
  if (!args.includes('--non-aprire'))
    spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
  console.log('Pagina: ' + file);
}
