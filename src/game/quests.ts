// I capitoli delle missioni (regole in quests-rules.ts): ogni secondo si controlla se le missioni
// in corso sono fatte, si danno i premi e i trofei della mensola. La finestra «Missioni» mostra
// tutti i capitoli con il pulsante «Segui», che sceglie dove portano la freccia e la freccetta.
import { game } from './context.js';
import { sfx } from './audio.js';
import { toast } from './missions.js';
import { countUse } from './usage.js';
import { creditMoney } from './economy.js';
import { hasRoom, mySafeLevel, saveGame } from './saves.js';
import { relationKind } from './relations-rules.js';
import { missionsOf, welcomeFinished } from './welcome-rules.js';
import { restartWelcome, welcomeHint } from './welcome.js';
import type { GuideDest } from './guide-rules.js';
import { questHooks } from './quest-hooks.js';
import {
  BONUS,
  CHAPTERS,
  type Quest,
  type QuestState,
  type QuestView,
  QUEST_PLACES,
  advanceQuests,
  chapterDone,
  currentQuest,
  earnedTrophies,
  followed,
  newQuests,
} from './quests-rules.js';

let busy = false;

const state = (): QuestState => (game.player.quests ??= newQuests());
const welcomeDone = (): boolean => !!game.player.welcome && welcomeFinished(game.player.welcome);
/** I capitoli 2–6 si aprono finito il benvenuto (o subito, per chi giocava già). */
export const chaptersOpen = (): boolean => welcomeDone() || !!state().old;

function view(): QuestView {
  const p = game.player;
  const s = state();
  return {
    env: game.view.activeEnvironment,
    visited: s.visited,
    chats: p.stats.chats || 0,
    praises: p.stats.praises || 0,
    friends: Object.values(p.relations ?? {}).filter((e) => relationKind(e?.score) === 'friend')
      .length,
    shifts: p.stats.shifts || 0,
    holdings: Object.values(p.invest || {}).filter((i) => i && i.units > 0).length,
    bank: game.bankBalance || 0,
    clothes: Object.values(p.ownedItems || {}).filter(Boolean).length,
    trashEmptied: p.stats.trashEmptied || 0,
    gossipRead: p.stats.gossipRead || 0,
    safeLevel: mySafeLevel(),
    paintings: p.stats.paintings || 0,
    pets: Object.values(p.pets ?? {}).filter(Boolean).length,
    rocketDonor: (game.rocketDonors?.[game.session.myPlayerId] || 0) > 0,
    moonTrips: p.stats.moonTrips || 0,
    suggestions: p.stats.suggestions || 0,
  };
}

/** Ogni secondo (da checkMissions): posti visti, missioni fatte, premi e trofei. */
export async function tickQuests(): Promise<void> {
  if (!game.session.saveReady || game.player.isDead || busy) return;
  const s = state();
  const env: string = game.view.activeEnvironment;
  if (QUEST_PLACES.includes(env) && !s.visited[env]) s.visited = { ...s.visited, [env]: true };
  const { state: next, rewards } = advanceQuests(s, view(), chaptersOpen());
  if (rewards.length) {
    busy = true;
    try {
      const total = rewards.reduce((a, r) => a + r.reward, 0);
      if (!(await creditMoney(total))) return; // si riprova al prossimo giro
      game.player.quests = next;
      announce(rewards, total);
    } finally {
      busy = false;
    }
  }
  const trophies = earnedTrophies(state(), welcomeDone());
  if (rewards.length || trophies.join() !== (game.player.trophies || []).join()) {
    game.player.trophies = trophies;
    saveGame(true);
  }
}

function announce(rewards: ReturnType<typeof advanceQuests>['rewards'], total: number): void {
  sfx('mission');
  const missions = rewards.filter((r) => !r.chapterTitle);
  for (const r of missions) countUse(`missione:${r.id}:fine`);
  // tante insieme (chi le aveva già fatte prima dei capitoli): un solo riepilogo
  if (missions.length > 2)
    toast(`🏆 Avevi già fatto ${missions.length} missioni: +${total} Đ`, 6000, false);
  else
    for (const r of missions)
      toast(`🏆 Missione completata: ${r.title} (+${r.reward} Đ)`, 5000, false);
  for (const r of rewards.filter((x) => x.chapterTitle)) {
    countUse(`capitolo:${r.id}:fine`);
    toast(
      `🏆 Capitolo finito: ${r.chapterTitle}! Il trofeo è sulla mensola della tua stanza (+${r.bonus} Đ)`,
      7000,
      false,
    );
  }
  // la prossima missione di quello che si segue, così si sa cosa fare
  const id = followed(state());
  const q = id ? currentQuest(state(), id) : null;
  if (q && missions.length <= 2) toast(`👉 Prossima: ${q.title}`, 5000, false);
}

// ---------------------------------------------------------------- freccia e freccetta

/** Il benvenuto ha la precedenza: i capitoli guidano solo quando è finito (o messo da parte). */
const welcomeBusy = (): boolean => {
  const w = game.player.welcome;
  return !!w && !welcomeFinished(w) && w.status !== 'off';
};

/** La missione seguita adesso (o null). */
function followedQuest(): Quest | null {
  if (welcomeBusy()) return null;
  const s = state();
  const id = followed(s);
  if (!id) return null;
  // un capitolo si segue solo quando è aperto; i bonus sempre
  if (!chaptersOpen() && CHAPTERS.some((c) => c.id === id)) return null;
  return currentQuest(s, id);
}

/** L'istruzione della missione seguita, per la freccetta sui pulsanti (o ""). */
export const questHint = (): string => followedQuest()?.hint || '';

/** Dove porta la freccia sul pavimento per la missione seguita (o null). */
export function questDest(): GuideDest | null {
  const q = followedQuest();
  if (!q) return null;
  const env: string = game.view.activeEnvironment;
  switch (q.id) {
    case 'gossip':
      return { env: 'CORTILE', point: { x: -176, y: 130 } };
    case 'idea':
      return { env: 'CORTILE', point: { x: 103, y: 130 } };
    case 'trash':
      return hasRoom()
        ? { env: 'PLAYER_ROOM', roomIdx: game.myAssignedRoomIdx ?? 0, key: 'trashBin' }
        : null;
    case 'shifts':
      return game.activeShift || env.startsWith('lavoro_')
        ? null
        : { env: 'CORTILE', key: 'exitHouse' };
  }
  return q.env ? { env: q.env } : null;
}

// ---------------------------------------------------------------- la finestra «Missioni»

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function questRow(q: { title: string; reward: number }, mark: string): string {
  return `<li><span>${mark} ${esc(q.title)}</span><span class="qs-reward">${q.reward} Đ</span></li>`;
}

function followButton(id: string, now: string | null): string {
  return now === id
    ? `<button type="button" class="qs-follow on" data-follow="none">🧭 La segui</button>`
    : `<button type="button" class="qs-follow" data-follow="${id}">🧭 Segui</button>`;
}

function welcomeSection(): string {
  const w = game.player.welcome;
  const s = state();
  const done = welcomeDone() || !!s.old;
  const list = w ? missionsOf(w) : [];
  const rows =
    s.old && !welcomeDone()
      ? '<li class="qs-note">Le sai già fare: questo capitolo vale come fatto.</li>'
      : list.map((m, i) => questRow(m, i < (w?.i ?? 0) ? '✅' : i === w?.i ? '👉' : '⬜')).join('');
  const now = !done && w?.status === 'active' ? welcomeHint() : '';
  const restart =
    !done && w && w.status !== 'active'
      ? `<button type="button" class="qs-follow" data-welcome="1">▶️ ${w.status === 'off' ? 'Riattiva' : 'Inizia ora'}</button>`
      : '';
  return (
    `<section class="qs-chapter${done ? ' done' : ''}">` +
    `<div class="qs-head"><b>🏠 Benvenuto</b><span>${done ? '🏆' : `${Math.min(w?.i ?? 0, list.length)}/${list.length}`}</span>${restart}</div>` +
    `<ul>${rows}</ul>` +
    (now ? `<div class="qs-now">${esc(now)}</div>` : '') +
    `</section>`
  );
}

function chapterSection(c: (typeof CHAPTERS)[number], following: string | null): string {
  const s = state();
  const i = s.ch[c.id] ?? 0;
  const done = chapterDone(s, c);
  const open = chaptersOpen();
  const rows = c.quests
    .map((q, k) => questRow(q, k < i ? '✅' : k === i && open ? '👉' : '⬜'))
    .join('');
  const now = open && !done ? c.quests[i].hint : '';
  return (
    `<section class="qs-chapter${done ? ' done' : ''}">` +
    `<div class="qs-head"><b>${esc(c.title)}</b><span>${done ? '🏆' : `${i}/${c.quests.length}`}</span>` +
    (open && !done ? followButton(c.id, following) : '') +
    `</div><ul>${rows}<li class="qs-note">🏆 Capitolo finito: trofeo sulla mensola e +${c.bonus} Đ</li></ul>` +
    (now ? `<div class="qs-now">${esc(now)}</div>` : '') +
    `</section>`
  );
}

function bonusSection(following: string | null): string {
  const s = state();
  const rows = BONUS.map(
    (b) =>
      `<li><span>${s.bonus[b.id] ? '🏅' : '⬜'} ${esc(b.title)}</span><span class="qs-reward">${b.reward} Đ</span>` +
      (s.bonus[b.id] ? '' : followButton(b.id, following)) +
      `</li>` +
      (s.bonus[b.id] ? '' : `<li class="qs-now">${esc(b.hint)}</li>`),
  ).join('');
  return `<section class="qs-chapter qs-bonus"><div class="qs-head"><b>⭐ Missioni bonus</b><span>medaglie</span></div><ul>${rows}</ul></section>`;
}

/** La finestra con tutti i capitoli, i premi e cosa si sta seguendo. */
export function openQuests(): void {
  let el = document.getElementById('quests-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'quests-modal';
    el.className = 'fullscreen-modal';
    document.body.appendChild(el);
  }
  const s = state();
  const following = s.follow === 'none' ? null : followed(s);
  const trophies = earnedTrophies(s, welcomeDone()).filter((t) => t.startsWith('trofeo_')).length;
  el.innerHTML =
    `<div class="card qs-card">` +
    `<h3>📋 Missioni</h3>` +
    `<div class="qs-sub">🏆 ${trophies}/6 trofei sulla mensola della tua stanza</div>` +
    `<div class="qs-list">` +
    welcomeSection() +
    (chaptersOpen()
      ? ''
      : '<div class="qs-lock">🔒 Gli altri capitoli si aprono finito il Benvenuto.</div>') +
    CHAPTERS.map((c) => chapterSection(c, following)).join('') +
    bonusSection(following) +
    `</div>` +
    `<button type="button" class="btn-primary qs-close" style="background:#57606f">Chiudi</button>` +
    `</div>`;
  el.classList.remove('hidden');
  const close = (): void => el!.classList.add('hidden');
  el.querySelector('.qs-close')?.addEventListener('click', close);
  el.onclick = (e) => {
    if (e.target === el) close();
  };
  el.querySelectorAll<HTMLElement>('[data-follow]').forEach((b) =>
    b.addEventListener('click', () => {
      game.player.quests = { ...state(), follow: b.dataset.follow };
      saveGame(false);
      openQuests();
    }),
  );
  el.querySelector<HTMLElement>('[data-welcome]')?.addEventListener('click', () => {
    close();
    restartWelcome();
  });
}

// le missioni, la freccia e la freccetta ci chiamano attraverso il ponte (quest-hooks.ts)
Object.assign(questHooks, { tick: tickQuests, open: openQuests, dest: questDest, hint: questHint });
