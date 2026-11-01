// Popup con le azioni disponibili sull'oggetto vicino.
// showActions() viene chiamata a ogni frame, ma il DOM viene ricostruito
// solo quando la lista di azioni cambia.

const VARIANT_CLASS = {
  main: '',
  action: 'btn-pop-action',
  exit: 'btn-pop-exit',
  alt: 'btn-pop-alt',
  locked: 'btn-pop-locked',
};

let el = null;
let currentActions = [];
let currentSignature = null;

export function initPopup() {
  el = document.getElementById('pop-interaction');
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-idx]');
    if (btn) currentActions[Number(btn.dataset.idx)]?.run();
  });
}

export function showActions(actions) {
  currentActions = actions;

  const signature = actions.map(a => `${a.variant}:${a.label}`).join('|');
  if (signature === currentSignature) return;
  currentSignature = signature;

  el.replaceChildren(...actions.map((a, i) => {
    const btn = document.createElement('button');
    btn.className = `btn-pop ${VARIANT_CLASS[a.variant] ?? ''}`.trim();
    btn.textContent = a.label;
    btn.dataset.idx = i;
    if (a.variant === 'locked') btn.disabled = true;
    return btn;
  }));
  el.classList.toggle('hidden', actions.length === 0);
}
