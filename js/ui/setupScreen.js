import { DEFAULT_NICK } from '../config.js';

// Schermata iniziale: chiede il nome e chiama onStart(nick) una sola volta.
export function initSetupScreen(onStart) {
  const screen = document.getElementById('ui-setup-screen');
  const input = document.getElementById('nickname');
  const button = document.getElementById('start-game-btn');
  let started = false;

  const start = (e) => {
    e.preventDefault();
    if (started) return;
    started = true;
    screen.classList.add('hidden');
    onStart(input.value.trim() || DEFAULT_NICK);
  };

  button.addEventListener('click', start);
  button.addEventListener('touchstart', start);
}
