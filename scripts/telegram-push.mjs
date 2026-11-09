// Manda al gruppo Telegram i commit appena arrivati su main: lo lancia telegram.yml a ogni push.
// Senza TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID non fa niente (per esempio nei fork).
import { readFileSync } from 'node:fs';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
if (!token || !chat) {
  console.log('Telegram non configurato: niente messaggio.');
  process.exit(0);
}
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const commits = event.commits ?? [];
if (!commits.length) process.exit(0);

// Telegram accetta al massimo 4096 caratteri per messaggio: si resta larghi
const LIMIT = 3800;
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
/** Il messaggio del commit senza le righe di firma (Co-Authored-By e simili). */
const body = (msg) =>
  msg
    .split('\n')
    .filter((l) => !/^co-authored-by:/i.test(l.trim()))
    .join('\n')
    // nei commit gli elenchi vanno a capo a 100 colonne: su Telegram la riga è una sola
    .replace(/\n {2,}(?=\S)/g, ' ')
    .trim();

const parts = commits.map((c) => {
  const [title, ...rest] = body(c.message).split('\n');
  const text = rest.join('\n').trim();
  return (
    `🔹 <a href="${c.url}">${esc(title)}</a>\n` +
    `<i>${esc(c.author?.name ?? '')}</i>` +
    (text ? `\n${esc(text)}` : '')
  );
});
const who = event.pusher?.name ?? event.sender?.login ?? '';
let text = `🚀 <b>Nuova versione online</b>${who ? ` (push di ${esc(who)})` : ''}\n\n`;
for (const p of parts) {
  if (text.length + p.length > LIMIT) {
    text += `\n…e altri commit: <a href="${event.compare}">tutte le modifiche</a>`;
    break;
  }
  text += p + '\n\n';
}

const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chat,
    text: text.trim(),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }),
});
if (!res.ok) {
  console.error('Telegram ha rifiutato il messaggio:', res.status, await res.text());
  process.exit(1);
}
console.log(`Mandati ${commits.length} commit al gruppo.`);
