import { NETWORK_SYNC_MS } from '../config.js';
import { FIREBASE_CONFIG, isFirebaseConfigured } from '../firebase-config.js';
import { state } from '../state.js';

// Sincronizzazione in tempo reale dei giocatori tramite Firebase Realtime Database.
// Struttura dati: players/{playerId} = { name, x, y, env }

export function initMultiplayer() {
  if (!isFirebaseConfigured()) {
    console.info('[multiplayer] Firebase non configurato (js/firebase-config.js): modalità offline.');
    return;
  }
  if (!window.firebase) {
    console.warn('[multiplayer] SDK Firebase non caricato: modalità offline.');
    return;
  }

  window.firebase.initializeApp(FIREBASE_CONFIG);
  const db = window.firebase.database();

  const playerRef = db.ref('players/' + state.playerId);
  playerRef.onDisconnect().remove();

  setInterval(() => {
    playerRef.set({
      name: state.nick,
      x: state.pos.x,
      y: state.pos.y,
      env: state.envId,
    });
  }, NETWORK_SYNC_MS);

  db.ref('players').on('value', (snapshot) => {
    state.onlinePlayers = snapshot.val() || {};
  });
}
