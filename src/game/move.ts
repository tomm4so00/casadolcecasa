// Il nuovo sito riceve il trasloco (vedi move-rules.ts): prima che Firebase parta, salva l'accesso e
// la memoria del gioco arrivati dal vecchio indirizzo, e toglie subito i dati dal link.
import { FIREBASE_CONFIG } from '../firebase-config.js';
import { OLD_APP_KEY, authStorageKey, readMove } from './move-rules.js';

/** Vero se è appena arrivato un accesso dal vecchio indirizzo: si entra da soli, senza tocchi. */
export let movedIn = false;

export function receiveMove(): void {
  if (!location.hash.includes('trasloco=')) return;
  const payload = readMove(location.hash, Date.now(), String(FIREBASE_CONFIG.apiKey));
  // i dati non restano nel link né nella cronologia
  history.replaceState(null, '', location.pathname + location.search);
  if (!payload) return;
  try {
    // arriva dalla vecchia app: l'avviso in basso (install.ts) propone quella nuova
    if (payload.app) localStorage.setItem(OLD_APP_KEY, '1');
    // la memoria del gioco: solo dove questo sito non ha già qualcosa di suo
    for (const [key, value] of Object.entries(payload.ls))
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    if (payload.user) {
      const key = authStorageKey(String(FIREBASE_CONFIG.apiKey));
      // se qui c'è già un accesso, vince quello: Firebase lo trova prima
      if (localStorage.getItem(key) === null && sessionStorage.getItem(key) === null) {
        (payload.session ? sessionStorage : localStorage).setItem(
          key,
          JSON.stringify(payload.user),
        );
        movedIn = true;
      }
    }
  } catch {
    // memoria del browser bloccata: si entra come chi arriva per la prima volta
  }
}
