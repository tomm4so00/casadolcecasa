// Da dove arrivano i giocatori (vedi source-rules.ts): il link ?da=… si legge all'avvio e la
// prima provenienza resta nella memoria del dispositivo; per gli account appena nati va anche in
// sims_sources/<uid>, che la ritenzione del server divide per provenienza.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import {
  NEW_ACCOUNT_MS,
  SOURCE_KEY,
  SOURCE_RE,
  shouldRememberSource,
  sourceFromSearch,
} from './source-rules.js';
import { game } from './context.js';

/** Prima di tutto (main.ts): un ?da= nel link di chi arriva per la prima volta. */
export function captureSource(): void {
  try {
    const stored = localStorage.getItem(SOURCE_KEY);
    // ha già giocato qui: c'è memoria del gioco (nome, preferenze, contatori…)
    let playedBefore = false;
    for (let i = 0; i < localStorage.length && !playedBefore; i++)
      playedBefore = /sims_/.test(localStorage.key(i) || '') && localStorage.key(i) !== SOURCE_KEY;
    const fromLink = sourceFromSearch(location.search);
    if (shouldRememberSource(fromLink, stored, playedBefore))
      localStorage.setItem(SOURCE_KEY, fromLink!);
  } catch {
    // memoria del browser bloccata: non si sa da dove arriva, pazienza
  }
}

/** La provenienza di questo dispositivo, o null (arrivato da solo, o da prima). */
export function currentSource(): string | null {
  try {
    const s = localStorage.getItem(SOURCE_KEY);
    return s && SOURCE_RE.test(s) ? s : null;
  } catch {
    return null;
  }
}

/**
 * All'ingresso: un account nato nelle ultime 24 ore prende la provenienza del dispositivo, una
 * volta sola (le regole non la lasciano cambiare). Gli account di prima restano senza.
 */
export function recordSource(): void {
  const source = currentSource();
  if (!source || game.session.OFFLINE) return;
  try {
    const user = firebase.auth().currentUser;
    const created = Date.parse(user?.metadata.creationTime || '');
    if (!user || !Number.isFinite(created) || Date.now() - created > NEW_ACCOUNT_MS) return;
    void game.session.db
      .ref('sims_sources/' + user.uid)
      .set(source)
      .catch(() => {
        /* già segnata, o regole vecchie: va bene così */
      });
  } catch {
    // Firebase non pronto: si riproverà al prossimo ingresso
  }
}
