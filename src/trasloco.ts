// La pagina del vecchio indirizzo dopo il trasloco (vedi game/move-rules.ts): legge l'accesso di
// Firebase e la memoria del gioco di questo browser e li porta al nuovo indirizzo.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { authStorageKey, movableStorage, moveUrl, type MovePayload } from './game/move-rules.js';

const TARGET = import.meta.env.VITE_MOVE_TO || 'https://casadolcecasa.web.app/';

/** L'accesso salvato qui, se c'è (Firebase lo carica da sé dalla memoria del browser). */
function currentUser(): Promise<firebase.User | null> {
  const auth = firebase.initializeApp(FIREBASE_CONFIG).auth();
  return new Promise((resolve) => {
    // senza risposta in 5 secondi si parte lo stesso, senza accesso
    const timer = setTimeout(() => resolve(null), 5000);
    const stop = auth.onAuthStateChanged((user) => {
      clearTimeout(timer);
      stop();
      resolve(user);
    });
  });
}

/** Aperta dall'icona della vecchia app, non da una scheda del browser. */
const installed =
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function payload(): Promise<MovePayload> {
  const ls: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key === null ? null : localStorage.getItem(key);
      if (key !== null && value !== null) ls.push([key, value]);
    }
  } catch {
    // memoria bloccata: si porta solo l'accesso
  }
  const out: MovePayload = { v: 1, t: Date.now(), ls: movableStorage(ls) };
  if (installed) out.app = true;
  try {
    const user = await currentUser();
    if (user) {
      out.user = user.toJSON() as Record<string, unknown>;
      // "non ricordarmi": l'accesso stava solo nella scheda
      out.session = sessionStorage.getItem(authStorageKey(String(FIREBASE_CONFIG.apiKey))) !== null;
    }
  } catch {
    // Firebase non risponde: si va senza accesso
  }
  return out;
}

const button = document.getElementById('go') as HTMLAnchorElement;
const status = document.getElementById('status') as HTMLElement;
button.href = TARGET + location.search;
// Dalla vecchia app il nuovo sito si apre nel browser vero: dentro l'app non si può installare.
if (installed) button.target = '_blank';

void payload().then((p) => {
  const url = moveUrl(TARGET, location.search, p);
  button.href = url;
  button.classList.remove('wait');
  if (installed) {
    // dall'app installata non si salta via: prima si legge come reinstallarla
    document.getElementById('app-note')!.hidden = false;
    status.textContent = p.user ? 'Il tuo accesso viene con te.' : '';
    return;
  }
  status.textContent = p.user ? 'Porto con te il tuo accesso…' : 'Ti porto al nuovo indirizzo…';
  location.replace(url);
});
