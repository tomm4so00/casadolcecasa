// La guida del pulsante ❓ (testi in data/guide-topics.ts): un indice di argomenti e, toccandone
// uno, la sua pagina con «◀ Argomenti» per tornare indietro. Una finestra a sé, come quella delle
// missioni.
import { GUIDE_TOPICS } from './data/guide-topics.js';
import { esc } from './quest-view.js';

function modal(): HTMLElement {
  let el = document.getElementById('guide-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'guide-modal';
    el.className = 'fullscreen-modal';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t === el || t.closest('.gb-close')) return el!.classList.add('hidden');
      const topic = t.closest<HTMLElement>('[data-topic]');
      if (topic) showTopic(topic.dataset.topic || '');
      else if (t.closest('.gb-back')) showIndex();
    });
  }
  return el;
}

const closeButton =
  '<button type="button" class="btn-primary gb-close" style="background:#57606f">Chiudi</button>';

function showIndex(): void {
  const el = modal();
  el.innerHTML =
    `<div class="card gb-card"><h3>❓ Guida</h3><div class="gb-sub">Cosa vuoi sapere?</div>` +
    `<div class="gb-list">` +
    GUIDE_TOPICS.map(
      (t) => `<button type="button" class="gb-topic" data-topic="${t.id}">${esc(t.title)}</button>`,
    ).join('') +
    `</div>${closeButton}</div>`;
  el.classList.remove('hidden');
}

function showTopic(id: string): void {
  const t = GUIDE_TOPICS.find((x) => x.id === id);
  if (!t) return showIndex();
  const el = modal();
  el.innerHTML =
    `<div class="card gb-card"><h3>${esc(t.title)}</h3>` +
    `<div class="gb-text">${esc(t.text)}</div>` +
    `<div class="gb-row"><button type="button" class="btn-primary gb-back" style="background:#3498db">◀ Argomenti</button>${closeButton}</div></div>`;
  el.classList.remove('hidden');
}

/** Il pulsante ❓: l'indice degli argomenti. */
export function openGuide(): void {
  showIndex();
}
