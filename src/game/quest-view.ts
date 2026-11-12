// I pezzi della finestra «Missioni» comuni a capitoli (quests.ts) e missioni del giorno (daily.ts):
// la riga di una missione, che toccando il nome apre la sua descrizione, e il pulsante «Segui».

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Una missione: segno, nome (si tocca per la descrizione), premio e, se c'è, un pulsante. */
export function missionRow(
  mark: string,
  title: string,
  reward: number,
  desc: string,
  tail = '',
): string {
  return (
    `<li class="qs-row" role="button" tabindex="0" title="Tocca per la descrizione">` +
    `<span>${mark} ${esc(title)} <span class="qs-more">ⓘ</span></span>` +
    `<span class="qs-reward">${reward} Đ</span>${tail}</li>` +
    `<li class="qs-desc hidden">${esc(desc)}</li>`
  );
}

/** Il pulsante per far seguire una missione a freccia e freccetta (o smettere, se è già seguita). */
export function followButton(id: string, now: string | null): string {
  return now === id
    ? `<button type="button" class="qs-follow on" data-follow="none">✅ Missione seguita</button>`
    : `<button type="button" class="qs-follow" data-follow="${id}">🧭 Segui missione</button>`;
}

/** Toccando il nome di una missione si apre e chiude la sua descrizione. */
export function bindMissionRows(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.qs-row').forEach((row) => {
    const toggle = (): void => {
      row.classList.toggle('open');
      row.nextElementSibling?.classList.toggle('hidden');
    };
    row.addEventListener('click', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('button')) toggle();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}
