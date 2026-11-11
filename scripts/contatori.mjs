// La classifica settimanale dei contatori d'uso (sims_usage, vedi src/game/usage.ts): cosa si
// usa di più e di meno negli ultimi 7 giorni, rispetto ai 7 prima. Legge il database con la
// Firebase CLI già collegata (npx firebase login), crea una pagina e la apre nel browser.
//   node scripts/contatori.mjs            → gioco vero
//   node scripts/contatori.mjs --prova    → gioco di prova
//   node scripts/contatori.mjs --testo    → anche il riepilogo nel terminale (per /contatori)
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const PROJECT = args.includes('--prova') ? 'casadolcecasa-prova' : 'casadolcecasa-6d92a';
const DAY = 86_400_000;

/** Il giorno (AAAA-MM-GG) a Roma, come lo scrive il gioco. */
const romeDay = (ms) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms));

/** Somma usi (n) e giocatori-giorno (p) per voce, nei giorni dati. */
export function totals(usage, days) {
  const out = {};
  for (const day of days)
    for (const [what, v] of Object.entries(usage?.[day] || {})) {
      const t = (out[what] ??= { n: 0, p: 0 });
      t.n += Number(v?.n) || 0;
      t.p += Number(v?.p) || 0;
    }
  return out;
}

/** La classifica: voce, usi della settimana, prima, variazione, giocatori al giorno. */
export function ranking(usage, now) {
  const week = [...Array(7)].map((_, i) => romeDay(now - i * DAY));
  const before = [...Array(7)].map((_, i) => romeDay(now - (i + 7) * DAY));
  const a = totals(usage, week);
  const b = totals(usage, before);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys]
    .map((what) => {
      const n = a[what]?.n || 0;
      const prev = b[what]?.n || 0;
      return {
        what,
        kind: what.startsWith('posto:') ? 'posto' : 'funzione',
        name: what.replace(/^posto:/, ''),
        n,
        prev,
        change: prev ? Math.round(((n - prev) / prev) * 100) : null,
        players: Math.round(((a[what]?.p || 0) / 7) * 10) / 10,
      };
    })
    .sort((x, y) => y.n - x.n);
}

function readUsage() {
  const dir = mkdtempSync(join(tmpdir(), 'contatori-'));
  const file = join(dir, 'usage.json');
  const cli = resolve(ROOT, 'node_modules/firebase-tools/lib/bin/firebase.js');
  execFileSync(
    process.execPath,
    [cli, 'database:get', '/sims_usage', '--project', PROJECT, '-o', file, '--non-interactive'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(readFileSync(file, 'utf8') || 'null') || {};
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function page(rows, now) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const table = (kind, title) => {
    const list = rows.filter((r) => r.kind === kind);
    if (!list.length) return `<h2>${title}</h2><p class="muted">Ancora nessun dato.</p>`;
    return (
      `<h2>${title}</h2><table><thead><tr><th>${kind === 'posto' ? 'Posto' : 'Funzione'}</th>` +
      '<th class="num">Usi (7 giorni)</th><th class="bar"></th><th class="num">Settimana prima</th>' +
      '<th class="num">Variazione</th><th class="num">Giocatori al giorno</th></tr></thead><tbody>' +
      list
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td class="num">${r.n}</td>` +
            `<td class="bar"><span style="width:${Math.round((r.n / max) * 100)}%"></span></td>` +
            `<td class="num">${r.prev}</td>` +
            `<td class="num ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}">` +
            `${r.change === null ? 'nuovo' : (r.change > 0 ? '+' : '') + r.change + '%'}</td>` +
            `<td class="num">${r.players}</td></tr>`,
        )
        .join('') +
      '</tbody></table>'
    );
  };
  const when = new Date(now).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contatori della settimana</title><style>
:root{--bg:#f6f7f9;--fg:#1d2329;--muted:#66717c;--line:#dde3e8;--bar:#4a7fa7;--up:#1e8e4f;--down:#c0392b;--card:#fff}
@media (prefers-color-scheme: dark){:root{--bg:#15191d;--fg:#e8edf1;--muted:#97a3ae;--line:#2c343b;--bar:#6aa3cf;--up:#4cd28a;--down:#ff7b6b;--card:#1c2227}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,'Segoe UI',sans-serif;margin:0;padding:24px 16px}
main{max-width:920px;margin:0 auto}h1{margin:0 0 4px}h2{margin:28px 0 8px}
.muted{color:var(--muted)}table{width:100%;border-collapse:collapse;background:var(--card);border-radius:8px;overflow:hidden}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left}th{font-size:13px;color:var(--muted);font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.bar{width:28%}
.bar span{display:block;height:10px;border-radius:5px;background:var(--bar)}.up{color:var(--up)}.down{color:var(--down)}
</style></head><body><main>
<h1>Contatori della settimana</h1>
<p class="muted">${PROJECT === 'casadolcecasa-prova' ? 'Gioco di prova' : 'Gioco di tutti'} · ultimi 7 giorni
rispetto ai 7 prima · aggiornato il ${esc(when)}. "Giocatori al giorno": quanti giocatori diversi
in media ogni giorno, senza nomi.</p>
${table('posto', 'I posti')}${table('funzione', 'Le funzioni')}
</main></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = Date.now();
  const rows = ranking(readUsage(), now);
  const file = join(mkdtempSync(join(tmpdir(), 'classifica-')), 'contatori.html');
  writeFileSync(file, page(rows, now));
  if (args.includes('--testo')) {
    console.log(`Classifica (${PROJECT}), ultimi 7 giorni:`);
    for (const r of rows)
      console.log(
        `${r.kind.padEnd(8)} ${r.name.padEnd(28)} ${String(r.n).padStart(6)} usi` +
          `  (prima ${r.prev}, ${r.change === null ? 'nuovo' : (r.change > 0 ? '+' : '') + r.change + '%'})` +
          `  giocatori/giorno ${r.players}`,
      );
    if (!rows.length) console.log('Ancora nessun dato: i contatori partono con la versione nuova.');
  }
  // si apre nel browser predefinito
  if (!args.includes('--non-aprire'))
    spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
  console.log('Pagina: ' + file);
}
