import '../css/style.css';
import { mountLatestGame } from './game/application.js';
import { serviceWorker } from './game/push.js';
import { receiveMove } from './game/move.js';

// prima di tutto: un eventuale trasloco dal vecchio indirizzo, prima che Firebase parta
receiveMove();
const dispose = mountLatestGame();
if (import.meta.hot) import.meta.hot.dispose(dispose);
// Rende il gioco installabile come app. In sviluppo no: Vite ricarica già da sé le pagine.
if (import.meta.env.PROD) window.addEventListener('load', () => void serviceWorker());
