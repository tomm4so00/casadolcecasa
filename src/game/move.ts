// Il nuovo sito riceve il trasloco (vedi move-rules.ts): prima che Firebase parta, salva l'accesso e
// la memoria del gioco arrivati dal vecchio indirizzo, e toglie subito i dati dal link.
import { FIREBASE_CONFIG } from '../firebase-config.js';
import { OLD_APP_KEY, authStorageKey, readMove } from './move-rules.js';

/** Vero se è appena arrivato un accesso dal vecchio indirizzo: si entra da soli, senza tocchi. */
export let movedIn = false;

/** L'accesso salvato qui (JSON di Firebase) è dell'account `uid`? */
function sameUser(saved: string, uid: unknown): boolean {
  try {
    return typeof uid === 'string' && (JSON.parse(saved) as { uid?: unknown }).uid === uid;
  } catch {
    return false;
  }
}

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
      const here = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      if (here === null) {
        (payload.session ? sessionStorage : localStorage).setItem(
          key,
          JSON.stringify(payload.user),
        );
        movedIn = true;
      } else if (sameUser(here, payload.user.uid)) {
        // lo stesso account (dalla cornice di itch, nei browser che non separano la memoria):
        // si entra da soli lo stesso, come col trasloco
        movedIn = true;
      }
    }
  } catch {
    // memoria del browser bloccata: si entra come chi arriva per la prima volta
  }
}
