import '../css/style.css';
import { mountLatestGame } from './game/application.js';

const dispose = mountLatestGame();
if (import.meta.hot) import.meta.hot.dispose(dispose);
