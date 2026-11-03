// Finestra delle classifiche: tutti i giocatori in un elenco che si scorre, con la propria riga
// evidenziata e già in vista, e le schede per passare da una classifica all'altra.
import { type LeaderboardMode, type LeaderboardRow, rankLabel } from './leaderboard-rules.js';

const TITLES: Record<LeaderboardMode, string> = {
  wealth: '🏆 Classifica dei più ricchi',
  lived: '⏳ Classifica dei più longevi',
};
const NOTES: Record<LeaderboardMode, string> = {
  wealth: 'Conta i soldi in cassaforte.',
  lived: 'Tempo di vita del personaggio. I vivi crescono ogni ora, ⚰️ = morto.',
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Mostra la classifica. `format` scrive il valore; `onTab` carica l'altra classifica. */
export function showLeaderboard(
  mode: LeaderboardMode,
  rows: LeaderboardRow[],
  myId: string,
  format: (row: LeaderboardRow) => string,
  onTab: (mode: LeaderboardMode) => void,
): void {
  let el = document.getElementById('leaderboard-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'leaderboard-modal';
    el.className = 'fullscreen-modal';
    document.body.appendChild(el);
  }
  const myPos = rows.findIndex((r) => r.id === myId);
  const list = rows.length
    ? rows
        .map(
          (r, i) =>
            `<li class="lb-row${r.id === myId ? ' lb-me' : ''}${i < 3 ? ' lb-top' : ''}">` +
            `<span class="lb-rank">${rankLabel(i)}</span>` +
            `<span class="lb-name">${esc(r.name)}${r.id === myId ? ' (tu)' : ''}</span>` +
            `<span class="lb-value">${esc(format(r))}${r.dead ? ' ⚰️' : ''}</span></li>`,
        )
        .join('')
    : '<li class="lb-empty">Ancora nessun giocatore in classifica.</li>';
  el.innerHTML =
    `<div class="card lb-card">` +
    `<div class="lb-tabs">` +
    `<button type="button" class="lb-tab${mode === 'wealth' ? ' sel' : ''}" data-mode="wealth">💰 Più ricchi</button>` +
    `<button type="button" class="lb-tab${mode === 'lived' ? ' sel' : ''}" data-mode="lived">⏳ Più longevi</button>` +
    `</div>` +
    `<h3>${TITLES[mode]}</h3>` +
    `<div class="lb-count">${rows.length} ${rows.length === 1 ? 'giocatore' : 'giocatori'}` +
    (myPos >= 0 ? ` · sei ${myPos + 1}°` : '') +
    `</div>` +
    `<ol class="lb-list">${list}</ol>` +
    `<div class="lb-note">${NOTES[mode]}</div>` +
    `<button type="button" class="btn-primary lb-close" style="background:#57606f">Chiudi</button>` +
    `</div>`;
  el.classList.remove('hidden');
  el.querySelectorAll<HTMLElement>('.lb-tab').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.mode as LeaderboardMode;
      if (m !== mode) onTab(m);
    }),
  );
  el.querySelector('.lb-close')?.addEventListener('click', () => el!.classList.add('hidden'));
  // la propria riga è subito in vista, al centro dell'elenco
  const me = el.querySelector<HTMLElement>('.lb-me');
  const box = el.querySelector<HTMLElement>('.lb-list');
  if (me && box) box.scrollTop = Math.max(0, me.offsetTop - box.clientHeight / 2);
}
