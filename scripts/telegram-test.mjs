// Prova del gruppo Telegram: manda un messaggio finto per ogni cosa che il gruppo riceve, con i
// testi veri (gli stessi moduli del server). Lo lancia telegram-test.yml, dopo la build del server.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { telegramText } from '../server/lib/shared/suggestion-rules.js';
import { autoMuteTelegramText, reportTelegramText } from '../server/lib/shared/moderation-rules.js';
import { ranking, usageReportText } from '../server/lib/shared/usage-rules.js';
import { retentionReport, retentionTelegramText } from '../server/lib/shared/retention-rules.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
if (!token || !chat) {
  console.error('Mancano i segreti TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.');
  process.exit(1);
}

let failed = 0;
/** Come il server, ma stampa la risposta di Telegram: serve a capire cosa non va. */
async function send(what, html) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: html, parse_mode: 'HTML' }),
  });
  if (res.ok) console.log(`OK: ${what}`);
  else {
    failed++;
    console.error(`NO: ${what} → ${res.status} ${await res.text()}`);
  }
}

// prima il bot: un token sbagliato si vede già qui
const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
console.log(`Bot: ${me.status} ${await me.text()}`);

// 1. i commit: lo script vero, con un push finto
const event = join(tmpdir(), 'evento-finto.json');
writeFileSync(
  event,
  JSON.stringify({
    commits: [
      {
        message:
          '🧪 Messaggio di prova dei commit\n\nSe lo leggi, le notifiche dei commit funzionano.',
        url: 'https://github.com/tomm4so00/casadolcecasa',
        author: { name: 'Prova Telegram' },
      },
    ],
  }),
);
try {
  execFileSync('node', ['scripts/telegram-push.mjs'], {
    env: { ...process.env, GITHUB_EVENT_PATH: event },
    stdio: 'inherit',
  });
  console.log('OK: commit');
} catch {
  failed++;
  console.error('NO: commit');
}

// 2. la cassetta "Suggerimenti e bug"
await send(
  'cassetta',
  telegramText({
    uid: 'prova',
    pid: 'prova',
    nick: 'Prova Telegram',
    kind: 'bug',
    text: '🧪 Messaggio di prova della cassetta: se lo leggi, i suggerimenti e i bug arrivano.',
    t: Date.now(),
    v: 'prova',
  }),
);

// 3. le segnalazioni dei giocatori
await send('segnalazione', reportTelegramText('🧪 Giocatore di prova', ['altro'], 1));

// 4. il silenzio automatico (3 segnalazioni in un giorno)
await send('silenzio automatico', autoMuteTelegramText('🧪 Giocatore di prova'));

// 5. il resoconto del lunedì, con contatori finti
const yesterday = Date.now() - 86_400_000;
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(yesterday);
await send(
  'resoconto settimanale',
  usageReportText(
    ranking(
      {
        [day]: {
          'posto:saloon': { n: 37, p: 3 },
          'posto:cortile': { n: 14, p: 3 },
          chat: { n: 9, p: 2 },
        },
      },
      yesterday,
    ),
    yesterday,
  ).replace('Contatori della settimana', '🧪 Contatori della settimana (prova, numeri finti)'),
);

// 6. la ritenzione del lunedì, con giocatori finti
const fake = (c, ...days) => ({ c, a: Object.fromEntries(days.map((d) => [String(d), 1])) });
await send(
  'ritenzione settimanale',
  retentionTelegramText(
    retentionReport(
      {
        a: fake('2026-10-05', 0, 1, 8, 31),
        b: fake('2026-10-06', 0, 1),
        c: fake('2026-10-07', 0),
        d: fake('2026-10-12', 0, 1, 9),
        e: fake('2026-11-11', 0, 1),
        f: fake('2026-11-14', 0),
      },
      '2026-11-15',
      '2026-10-05',
    ),
  ).replace('Ritenzione', '🧪 Ritenzione (prova, numeri finti)'),
);

if (failed) process.exit(1);
console.log('Tutti i messaggi di prova sono partiti.');
