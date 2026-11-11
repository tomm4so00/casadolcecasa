// Contatori d'uso: quante volte si entra in ogni posto e si usa ogni funzione, giorno per giorno
// (sims_usage/<giorno>/<cosa> = { n: usi, p: giocatori diversi }). Servono a decidere cosa
// sviluppare e cosa togliere: la classifica la fa scripts/contatori.mjs.
// Niente nomi né codici dei giocatori: ognuno si conta una volta al giorno per voce grazie a un
// segno nella memoria del dispositivo. Le regole lasciano solo aggiungere 1; li legge il server.
// In modalità prova (?offline=1) non si conta niente.
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { romeDay } from '../../shared/job-pay-rules.js';

/** Com'è fatta una voce: "posto:bar", "lavoro:ufficio", "chat"… (le regole vogliono lo stesso). */
export const USAGE_KEY_RE = /^[a-z0-9_:-]{1,40}$/;

const seenKey = (day: string, what: string) => `sims_usage_seen:${day}:${what}`;

/** Conta un uso di `what` (e, la prima volta oggi su questo dispositivo, un giocatore). */
export function countUse(what: string): void {
  if (game.session.OFFLINE || !USAGE_KEY_RE.test(what)) return;
  const day = romeDay(Date.now());
  let first = false;
  try {
    first = localStorage.getItem(seenKey(day, what)) !== '1';
    if (first) localStorage.setItem(seenKey(day, what), '1');
  } catch {
    /* memoria del browser bloccata: si conta l'uso, non il giocatore */
  }
  const inc = firebase.database.ServerValue.increment;
  void game.session.db
    .ref(`sims_usage/${day}/${what}`)
    .update({ n: inc(1), p: inc(first ? 1 : 0) })
    .catch(() => {
      /* un contatore perso non conta: non si disturba il giocatore */
    });
}

/** Ogni posto in cui si entra: si guarda una volta al secondo dove si è. */
export function startUsage(): void {
  if (game.session.OFFLINE) return;
  let last = '';
  lifetime.setInterval(() => {
    const env = String(game.view.activeEnvironment || '').toLowerCase();
    if (!env || env === last) return;
    last = env;
    countUse('posto:' + env.replace(/[^a-z0-9_-]/g, '_').slice(0, 34));
  }, 1000);
}
