// La pagina "La tua personalità" (dal profilo): a che punto si è oggi e in totale, come si diventa
// ogni personalità e che premi dà. Da qui si apre la classifica delle personalità del condominio.
import { game } from './context.js';
import type { GameValue } from './context.js';
import { worldNode } from './world-db.js';
import { toast } from './missions.js';
import { currentWorldCode } from './world-select.js';
import {
  LEVEL_PREVAIL,
  PERSONALITIES,
  PERSONALITY_BADGE,
  PERSONALITY_ACTIONS,
  PERSONALITY_DAILY_MAX,
  PERSONALITY_IDS,
  PERSONALITY_TITLES,
  PREVAIL_MIN_POINTS,
  PREVAIL_TO_BECOME,
  SECOND_MIN_PREVAIL,
  type PersonalityId,
  type PersonalityState,
  actionDailyMax,
  actionPoints,
  actionsOf,
  emptyPersonality,
  fmtPoints,
  obtainedPersonality,
  personalityLevel,
  personalityPerk,
  levelOf,
  secondLevel,
  secondPerkLines,
  secondPersonality,
  todayProgress,
} from './personality-rules.js';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** La finestra (una sola, riusata dalla pagina e dalla classifica). */
function modal(): HTMLElement {
  let el = document.getElementById('personality-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'personality-modal';
    el.className = 'fullscreen-modal';
    document.body.appendChild(el);
    // un tocco fuori dalla scheda la chiude
    el.addEventListener('click', (e) => {
      if (e.target === el) el!.classList.add('hidden');
    });
  }
  return el;
}

const label = (id: PersonalityId) => `${PERSONALITY_BADGE[id].emoji} ${PERSONALITIES[id].name}`;

/** Una barra di avanzamento: `value` su `max`, con un segno facoltativo (soglia). */
function bar(value: number, max: number, color: string, mark?: number): string {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    `<div class="pp-bar"><div class="pp-fill" style="width:${w}%;background:${color}"></div>` +
    (mark ? `<div class="pp-mark" style="left:${(mark / max) * 100}%"></div>` : '') +
    `</div>`
  );
}

/** In alto: chi si è, il livello e il secondo tratto. */
function headerHtml(state: PersonalityState): string {
  const got = obtainedPersonality(state);
  if (!got)
    return (
      `<div class="pp-hero"><div class="pp-hero-title">✨ Ancora nessuna personalità</div>` +
      `<div class="pp-hero-sub">Ogni giorno prevale la personalità con più punti (almeno ${PREVAIL_MIN_POINTS}). ` +
      `Dopo ${PREVAIL_TO_BECOME} giornate la diventi.</div></div>`
    );
  const lv = personalityLevel(state);
  const days = state.prevail?.[got] || 0;
  const next = lv < 3 ? LEVEL_PREVAIL[lv as 1 | 2] : 0;
  const second = secondPersonality(state);
  return (
    `<div class="pp-hero" style="border-color:${PERSONALITY_BADGE[got].color}">` +
    `<div class="pp-hero-title">${PERSONALITY_BADGE[got].emoji} ${esc(PERSONALITY_TITLES[got][lv - 1])} · livello ${lv}</div>` +
    `<div class="pp-hero-sub">${esc(PERSONALITIES[got].name)} da ${days} ${days === 1 ? 'giornata' : 'giornate'}` +
    (next ? ` · livello ${lv + 1} a ${next}` : ' · livello massimo') +
    `</div>` +
    (next ? bar(days, next, PERSONALITY_BADGE[got].color) : '') +
    `<div class="pp-perk">🎁 ${esc(personalityPerk(got, lv))}</div>` +
    (second
      ? `<div class="pp-second">➕ Secondo tratto: un po' ${label(second)} · livello ${secondLevel(state)}<br>` +
        `<span>🎁 ${esc(personalityPerk(second, levelOf(state, second)))}</span></div>`
      : '') +
    `</div>`
  );
}

/** Oggi: i punti di ogni personalità, con la soglia per prevalere. */
function todayHtml(state: PersonalityState): string {
  const today = todayProgress(state, new Date());
  const rows = today.length
    ? today
        .map(
          (p) =>
            `<div class="pp-row"><span class="pp-name">${label(p.id)}</span>` +
            `<span class="pp-val">${fmtPoints(p.points)}/${PERSONALITY_DAILY_MAX}</span></div>` +
            bar(p.points, PERSONALITY_DAILY_MAX, PERSONALITY_BADGE[p.id].color, PREVAIL_MIN_POINTS),
        )
        .join('')
    : '<div class="pp-empty">Oggi non hai ancora fatto punti.</div>';
  return (
    `<h4>📅 Oggi</h4>${rows}` +
    `<div class="pp-note">Ogni personalità prende al massimo ${PERSONALITY_DAILY_MAX} punti al giorno. ` +
    `Stanotte prevale quella più alta, se ha almeno ${PREVAIL_MIN_POINTS} punti (la linea bianca).</div>`
  );
}

/** In totale: le giornate in cui ogni personalità ha prevalso. */
function totalHtml(state: PersonalityState): string {
  const got = obtainedPersonality(state);
  const ids = PERSONALITY_IDS.filter((id) => (state.prevail?.[id] || 0) > 0).sort(
    (a, b) => (state.prevail?.[b] || 0) - (state.prevail?.[a] || 0),
  );
  const rows = ids.length
    ? ids
        .map((id) => {
          const days = state.prevail?.[id] || 0;
          const goal =
            id === got
              ? (LEVEL_PREVAIL.find((n) => n > days) ?? LEVEL_PREVAIL[2])
              : Math.max(PREVAIL_TO_BECOME, SECOND_MIN_PREVAIL);
          const what =
            id === got
              ? 'la tua personalità'
              : days >= SECOND_MIN_PREVAIL
                ? 'abbastanza per il secondo tratto'
                : `${days}/${goal} per ${got ? 'il secondo tratto' : 'diventarla'}`;
          return (
            `<div class="pp-row"><span class="pp-name">${label(id)}</span>` +
            `<span class="pp-val">${days} ${days === 1 ? 'giornata' : 'giornate'}</span></div>` +
            bar(Math.min(days, goal), goal, PERSONALITY_BADGE[id].color) +
            `<div class="pp-sub">${what}</div>`
          );
        })
        .join('')
    : '<div class="pp-empty">Nessuna personalità ha ancora prevalso in una giornata.</div>';
  return `<h4>📈 In totale</h4>${rows}`;
}

/** Come si diventa ogni personalità e che premi dà. */
function guideHtml(state: PersonalityState): string {
  const got = obtainedPersonality(state);
  const cards = PERSONALITY_IDS.map((id) => {
    const actions = actionsOf(id)
      .map(
        (a) =>
          `<li>${esc(PERSONALITY_ACTIONS[a].label)} <b>+${fmtPoints(actionPoints(a))}</b>` +
          ` <span>(fino a ${fmtPoints(actionDailyMax(a))} al giorno)</span></li>`,
      )
      .join('');
    const perks = [1, 2, 3]
      .map(
        (lv) =>
          `<li><b>${esc(PERSONALITY_TITLES[id][lv - 1])}</b> (livello ${lv}, ${LEVEL_PREVAIL[lv - 1]} giornate): ${esc(personalityPerk(id, lv))}</li>`,
      )
      .join('');
    return (
      `<details class="pp-card"${id === got ? ' open' : ''} style="border-left-color:${PERSONALITY_BADGE[id].color}">` +
      `<summary>${label(id)}${id === got ? ' · la tua' : ''}</summary>` +
      `<div class="pp-card-h">Fa punti con</div><ul>${actions}</ul>` +
      `<div class="pp-card-h">Premi</div><ul>${perks}` +
      `</ul><div class="pp-card-h">Come secondo tratto</div><ul>` +
      secondPerkLines(id)
        .map((l) => `<li>${esc(l)}</li>`)
        .join('') +
      `</ul>` +
      `</details>`
    );
  }).join('');
  return (
    `<h4>📖 Come si diventa</h4>` +
    `<div class="pp-note">I punti di ogni azione dipendono da quanto costa farla: tempo, soldi, ` +
    `rischio e se serve un altro giocatore. Con una personalità, un'altra che prevale per ` +
    `${SECOND_MIN_PREVAIL} giornate diventa il secondo tratto, con un premio più leggero.</div>` +
    cards
  );
}

/** La pagina della propria personalità. */
export function openPersonalityPage(): void {
  const state = game.player.personality ?? emptyPersonality();
  const el = modal();
  el.innerHTML =
    `<div class="card lb-card pp-card-main">` +
    `<h3>✨ La tua personalità</h3>` +
    `<div class="pp-scroll">${headerHtml(state)}${todayHtml(state)}${totalHtml(state)}${guideHtml(state)}</div>` +
    `<button type="button" class="btn-primary pp-rank" style="background:#6c5ce7">🏆 Classifica delle personalità del condominio</button>` +
    `<button type="button" class="btn-primary lb-close" style="background:#57606f">Chiudi</button>` +
    `</div>`;
  el.classList.remove('hidden');
  el.querySelector('.lb-close')?.addEventListener('click', () => el.classList.add('hidden'));
  el.querySelector('.pp-rank')?.addEventListener('click', () => void openPersonalityRanking());
}

interface RankRow {
  id: string;
  name: string;
  pers: PersonalityId;
  lv: number;
  days: number;
  second?: PersonalityId;
}

const isId = (v: unknown): v is PersonalityId =>
  typeof v === 'string' && (PERSONALITY_IDS as string[]).includes(v);

/** Dalla classifica del condominio: chi ha una personalità, dal livello più alto. */
export function personalityRows(lb: unknown): RankRow[] {
  const out: RankRow[] = [];
  if (!lb || typeof lb !== 'object') return out;
  for (const [id, raw] of Object.entries(lb as Record<string, GameValue>)) {
    if (!raw || !isId(raw.pers)) continue;
    out.push({
      id,
      name: String(raw.name || 'Giocatore').slice(0, 20),
      pers: raw.pers,
      lv: [1, 2, 3].includes(raw.persLv) ? raw.persLv : 1,
      days: Number.isFinite(raw.persDays) ? Math.max(0, raw.persDays) : 0,
      ...(isId(raw.pers2) ? { second: raw.pers2 } : {}),
    });
  }
  return out.sort((a, b) => b.lv - a.lv || b.days - a.days || a.name.localeCompare(b.name));
}

/** La classifica delle personalità del condominio: quante ce ne sono e chi è più avanti. */
export async function openPersonalityRanking(): Promise<void> {
  let lb: unknown = null;
  try {
    lb = (await game.session.db.ref(worldNode('leaderboard')).get()).val();
  } catch {
    toast('Non è stato possibile leggere la classifica: riprova tra poco.', 4000);
    return;
  }
  const rows = personalityRows(lb);
  // la propria riga è sempre aggiornata, anche prima del prossimo salvataggio
  const mine = rows.find((r) => r.id === game.session.myPlayerId);
  const counts = PERSONALITY_IDS.map((id) => ({
    id,
    n: rows.filter((r) => r.pers === id).length,
  })).sort((a, b) => b.n - a.n);
  const most = Math.max(1, ...counts.map((c) => c.n));
  const present = counts.filter((c) => c.n > 0);
  const absent = counts.filter((c) => c.n === 0);
  const countHtml =
    present
      .map(
        (c) =>
          `<div class="pp-row"><span class="pp-name">${label(c.id)}</span><span class="pp-val">${c.n}</span></div>` +
          bar(c.n, most, PERSONALITY_BADGE[c.id].color),
      )
      .join('') +
    (absent.length
      ? `<div class="pp-note">Ancora nessuno: ${absent.map((c) => label(c.id)).join(', ')}.</div>`
      : '');
  const list = rows.length
    ? rows
        .map(
          (r, i) =>
            `<li class="lb-row${r.id === game.session.myPlayerId ? ' lb-me' : ''}">` +
            `<span class="lb-rank">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1 + '.'}</span>` +
            `<span class="lb-name">${esc(r.name)}${r.id === game.session.myPlayerId ? ' (tu)' : ''}` +
            `<br><small>${PERSONALITY_BADGE[r.pers].emoji} ${esc(PERSONALITY_TITLES[r.pers][r.lv - 1])}` +
            (r.second ? ` · un po' ${PERSONALITY_BADGE[r.second].emoji}` : '') +
            `</small></span>` +
            `<span class="lb-value">Lv ${r.lv} · ${r.days} gg</span></li>`,
        )
        .join('')
    : '<li class="lb-empty">Nel condominio nessuno ha ancora una personalità.</li>';
  const el = modal();
  el.innerHTML =
    `<div class="card lb-card pp-card-main">` +
    `<h3>🏆 Personalità del condominio ${esc(currentWorldCode())}</h3>` +
    `<div class="pp-scroll"><h4>Chi è più avanti</h4><ol class="lb-list pp-list">${list}</ol>` +
    `<div class="pp-note">Livello e giornate in cui la personalità ha prevalso.` +
    (mine ? '' : ' Chi non ha ancora una personalità non compare.') +
    `</div><h4>Quante ce ne sono</h4>${countHtml}</div>` +
    `<button type="button" class="btn-primary pp-back" style="background:#6c5ce7">✨ Torna alla tua personalità</button>` +
    `<button type="button" class="btn-primary lb-close" style="background:#57606f">Chiudi</button>` +
    `</div>`;
  el.classList.remove('hidden');
  el.querySelector('.lb-close')?.addEventListener('click', () => el.classList.add('hidden'));
  el.querySelector('.pp-back')?.addEventListener('click', () => openPersonalityPage());
}
