// Il gioco dentro la cornice di un altro sito (itch.io: itch/index.html mostra il sito con
// ?da=itch). Lì dentro non si installa come app e l'accesso con Google spesso è bloccato, e la
// memoria del browser è separata da quella del sito: un ospite che passasse al sito ripartirebbe
// da zero. Allora il sito si apre in una scheda nuova portando con sé l'account e la memoria del
// gioco, con lo stesso trasloco del vecchio indirizzo (move-rules.ts, move.ts).
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { FIREBASE_CONFIG } from '../firebase-config.js';
import { authStorageKey, movableStorage, moveUrl, type MovePayload } from './move-rules.js';
import { dom } from './runtime.js';

/** Vero se il gioco è mostrato dentro un'altra pagina. */
export function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // la pagina di fuori è di un altro sito e non si lascia guardare: è una cornice
    return true;
  }
}

/** L'indirizzo del gioco, senza ?da= e il resto. */
const siteUrl = (): string => location.origin + location.pathname;

/** L'accesso e la memoria del gioco di questa cornice, per il trasloco. */
function payload(): MovePayload {
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
  try {
    const user = firebase.auth().currentUser;
    if (user) {
      out.user = user.toJSON() as Record<string, unknown>;
      out.session = sessionStorage.getItem(authStorageKey(String(FIREBASE_CONFIG.apiKey))) !== null;
    }
  } catch {
    // Firebase non pronto: si va senza accesso
  }
  return out;
}

/**
 * Apre il gioco sul sito in una scheda nuova. `withAccount`: con l'account e la memoria di qui
 * (stesso personaggio, anche da ospite); senza, per chi vuole entrare col suo account.
 */
export function openSite(withAccount: boolean): void {
  const url = withAccount ? moveUrl(siteUrl(), '', payload()) : siteUrl();
  window.open(url, '_blank', 'noopener');
}

/** Il pulsante ⛶: schermo intero e ritorno. */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/** All'avvio: nella cornice compare il pulsante dello schermo intero. */
export function initEmbed(): void {
  if (!inFrame()) return;
  document.body.classList.add('in-frame');
  dom('btn-fullscreen')?.classList.toggle('hidden', !document.fullscreenEnabled);
}
