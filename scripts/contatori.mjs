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
import {
  SOURCE_STEPS,
  funnelBySource,
  changeLabel,
  funnel,
  ranking,
  romeDay,
  shareOf,
} from '../shared/usage-rules.ts';
import { backNextDay } from '../shared/retention-rules.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const PROJECT = args.includes('--prova') ? 'casadolcecasa-prova' : 'casadolcecasa-6d92a';
// la classifica è la stessa del resoconto del lunedì su Telegram
export { ranking };

function read(path) {
  const dir = mkdtempSync(join(tmpdir(), 'contatori-'));
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

/** L'imbuto d'ingresso: una barra per passo, larga quanto i dispositivi rispetto al primo. */
function funnelSection(f, back) {
  const base = f.steps[0].n;
  if (!f.steps.some((s) => s.n))
    return '<h2>Imbuto d&#39;ingresso</h2><p class="muted">Ancora nessun dato: i passi si contano dalla versione nuova.</p>';
  const max = Math.max(1, ...f.steps.map((s) => s.n));
  const row = (label, n, note = '') =>
    `<tr><td>${esc(label)}</td><td class="num">${n}</td>` +
    `<td class="bar"><span style="width:${Math.round((n / max) * 100)}%"></span></td>` +
    `<td class="num">${note}</td></tr>`;
  let html =
    '<h2>Imbuto d&#39;ingresso</h2><p class="muted">Dispositivi diversi a ogni passo, sommati sui 7 giorni; la percentuale è rispetto a chi ha visto l&#39;ingresso.</p>' +
    '<table><thead><tr><th>Passo</th><th class="num">Dispositivi</th><th class="bar"></th><th class="num">Sul primo</th></tr></thead><tbody>';
  for (const [i, s] of f.steps.entries()) html += row(s.label, s.n, i ? shareOf(s.n, base) : '');
  html +=
    '</tbody></table><h2>Missioni di benvenuto</h2><table><thead><tr><th>Missione</th><th class="num">Accettata</th><th class="num">Rifiutata</th><th class="num">Rimandata</th><th class="num">Finita</th></tr></thead><tbody>';
  for (const [i, m] of f.missions.entries())
    html += `<tr><td>${i + 1}. ${esc(m.label)}</td><td class="num">${m.yes}</td><td class="num">${m.no}</td><td class="num">${m.later}</td><td class="num">${m.done}</td></tr>`;
  html +=
    `</tbody></table><p>Primo turno di lavoro: <b>${f.firstShift}</b>` +
    (back ? ` · Tornati il giorno dopo: <b>${back.back}</b> su ${back.started} nuovi` : '') +
    '</p>';
  return html;
}

/** L'imbuto diviso per provenienza (?da=itch…): una riga per provenienza. */
function sourceSection(list) {
  const head =
    '<h2>Da dove arrivano</h2><p class="muted">Chi è arrivato con un link ?da=… (itch, telegram…): dispositivi diversi a ogni passo, sommati sui 7 giorni.</p>';
  if (!list.length) return head.replace('</p>', ' Ancora nessuno.</p>');
  return (
    head +
    '<table><thead><tr><th>Provenienza</th>' +
    SOURCE_STEPS.map((s) => `<th class="num">${esc(s.label)}</th>`).join('') +
    '</tr></thead><tbody>' +
    list
      .map(
        (r) =>
          `<tr><td>${esc(r.source)}</td>` +
          r.steps.map((n) => `<td class="num">${n}</td>`).join('') +
          '</tr>',
      )
      .join('') +
    '</tbody></table>'
  );
}

function page(rows, now, f, back, sources) {
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
            `${changeLabel(r)}</td>` +
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
${funnelSection(f, back)}${sourceSection(sources)}${table('posto', 'I posti')}${table('funzione', 'Le funzioni')}
</main></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = Date.now();
  const usage = read('/sims_usage') || {};
  const rows = ranking(usage, now);
  const f = funnel(usage, now);
  const since = read('/sims_meta/retentionSince');
  const back =
    typeof since === 'string'
      ? backNextDay(read('/sims_retention'), romeDay(now - 6 * 86_400_000), romeDay(now), since)
      : null;
  const file = join(mkdtempSync(join(tmpdir(), 'classifica-')), 'contatori.html');
  const sources = funnelBySource(usage, now);
  writeFileSync(file, page(rows, now, f, back, sources));
  if (args.includes('--testo')) {
    console.log(`Classifica (${PROJECT}), ultimi 7 giorni:`);
    for (const r of rows)
      console.log(
        `${r.kind.padEnd(8)} ${r.name.padEnd(28)} ${String(r.n).padStart(6)} usi` +
          `  (prima ${r.prev}, ${changeLabel(r)})` +
          `  giocatori/giorno ${r.players}`,
      );
    if (!rows.length) console.log('Ancora nessun dato: i contatori partono con la versione nuova.');
    console.log("Imbuto d'ingresso (dispositivi, 7 giorni):");
    for (const [i, s] of f.steps.entries())
      console.log(
        `  ${s.label.padEnd(24)} ${String(s.n).padStart(5)}  ${i ? shareOf(s.n, f.steps[0].n) : ''}`,
      );
    for (const [i, m] of f.missions.entries())
      console.log(
        `  Missione ${i + 1} (${m.label}): accettata ${m.yes}, rifiutata ${m.no}, rimandata ${m.later}, finita ${m.done}`,
      );
    console.log(
      `  Primo turno ${f.firstShift}` +
        (back ? `, tornati il giorno dopo ${back.back} su ${back.started} nuovi` : ''),
    );
    console.log(
      'Da dove arrivano (?da=…, dispositivi, 7 giorni):' +
        (sources.length ? '' : ' ancora nessuno'),
    );
    for (const r of sources)
      console.log(
        `  ${r.source.padEnd(16)} ` +
          SOURCE_STEPS.map((st, i) => `${st.label} ${r.steps[i]}`).join(' · '),
      );
  }
  // si apre nel browser predefinito
  if (!args.includes('--non-aprire'))
    spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore' }).unref();
  console.log('Pagina: ' + file);
}
