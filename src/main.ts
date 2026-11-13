import '../css/style.css';
import { mountLatestGame } from './game/application.js';
import { serviceWorker } from './game/push.js';
import { receiveMove } from './game/move.js';
import { captureSource } from './game/source.js';
// i capitoli delle missioni si agganciano al gioco (game/quest-hooks.ts)
import './game/quests.js';

// prima di tutto: da dove arriva chi apre il gioco (?da=itch…), poi un eventuale trasloco dal
// vecchio indirizzo o dalla cornice di itch, prima che Firebase parta
captureSource();
receiveMove();
const dispose = mountLatestGame();
if (import.meta.hot) import.meta.hot.dispose(dispose);
// Rende il gioco installabile come app. In sviluppo no: Vite ricarica già da sé le pagine.
if (import.meta.env.PROD) window.addEventListener('load', () => void serviceWorker());
