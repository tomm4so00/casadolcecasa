import { NEEDS } from '../data/needs.js';
import { state, currentEnv } from '../state.js';
import { toggleSprint, returnHome } from '../game/world.js';
import { placeFurniture } from '../game/furniture.js';

// HUD: barre dei bisogni + pulsanti fissi (sprint, torna a casa, lascia mobile).
// updateHud() sincronizza il DOM con lo stato a ogni frame.

const bars = {};   // key -> { fill, text, last }
let btnSprint, btnReturnHome, btnPlaceFurniture;

export function initHud() {
  const container = document.getElementById('needs-hud');
  container.replaceChildren(...NEEDS.map(createNeedRow));
  container.classList.remove('hidden');
  document.getElementById('hud-actions').classList.remove('hidden');

  btnSprint = document.getElementById('btn-sprint');
  btnReturnHome = document.getElementById('btn-return-home');
  btnPlaceFurniture = document.getElementById('btn-place-furniture');

  btnSprint.addEventListener('click', toggleSprint);
  btnReturnHome.addEventListener('click', returnHome);
  btnPlaceFurniture.addEventListener('click', placeFurniture);
}

function createNeedRow(need) {
  const row = document.createElement('div');
  row.className = 'need-row';
  row.innerHTML = `
    <div class="need-info"><span>${need.icon} ${need.name}</span><span></span></div>
    <div class="bar-bg"><div class="bar-fill" style="background:${need.color}"></div></div>`;
  bars[need.key] = {
    text: row.querySelector('.need-info span:last-child'),
    fill: row.querySelector('.bar-fill'),
    last: null,
  };
  return row;
}

export function updateHud() {
  for (const need of NEEDS) {
    const bar = bars[need.key];
    const value = Math.round(state.needs[need.key]);
    if (value === bar.last) continue;
    bar.last = value;
    bar.text.textContent = `${value}%`;
    bar.fill.style.width = `${value}%`;
  }

  btnSprint.classList.toggle('active', state.sprinting);
  btnReturnHome.classList.toggle('hidden', !currentEnv().isActivity);
  btnPlaceFurniture.classList.toggle('hidden', !state.movingObjectKey);
}
