// La cassetta "Suggerimenti e bug" (shared/suggestion-rules.ts): a ogni giro il server manda sul
// gruppo Telegram dei collaboratori i messaggi non ancora mandati e li segna con `tg`.
import { isSuggestion, telegramText } from '../../shared/suggestion-rules.js';

/**
 * Solo quello che serve del database di firebase-admin: così il modulo (e il suo test) non dipende
 * dal pacchetto del server, che nel controllo dei tipi del gioco non c'è.
 */
interface Query {
  orderByChild(key: string): Query;
  limitToLast(count: number): Query;
  get(): Promise<{ val(): unknown }>;
}
interface SuggestionDatabase {
  ref(path: string): Query & { set(value: unknown): Promise<unknown> };
}

/** Manda un messaggio Telegram (HTML). Vero se è partito. */
export type TelegramSender = (html: string) => Promise<boolean>;

/** Il mittente vero, oppure null senza TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID. */
export function telegramFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramSender | null {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;
  return async (html) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  };
}

/** Quanti messaggi al massimo per giro: se ne arrivano tanti, gli altri partono al giro dopo. */
const PER_RUN = 20;

/** Manda i messaggi nuovi, dal più vecchio; restituisce quanti ne sono partiti. */
export async function forwardSuggestions(
  database: SuggestionDatabase,
  send: TelegramSender,
): Promise<number> {
  const raw = (
    await database.ref('sims_suggestions').orderByChild('t').limitToLast(200).get()
  ).val();
  const pending = Object.entries((raw || {}) as Record<string, unknown>)
    .filter(([, s]) => isSuggestion(s) && !s.tg)
    .map(([id, s]) => ({ id, s: s as Parameters<typeof telegramText>[0] }))
    .sort((a, b) => a.s.t - b.s.t)
    .slice(0, PER_RUN);
  let sent = 0;
  for (const { id, s } of pending) {
    // se Telegram non risponde ci si ferma: si riprova al giro dopo, senza saltarne nessuno
    if (!(await send(telegramText(s)))) break;
    await database.ref(`sims_suggestions/${id}/tg`).set(true);
    sent++;
  }
  return sent;
}
