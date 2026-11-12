// Le missioni del giorno (regole in daily-rules.ts): ogni secondo, insieme ai capitoli, si segnano
// i posti visti oggi e si premiano le missioni fatte; finite tutte e tre arriva il premio della
// serie e, al 7° giorno di fila, la medaglia della settimana perfetta. Si vedono in cima alla
// finestra «Missioni».
import { game } from './context.js';
import { sfx } from './audio.js';
import { toast } from './missions.js';
import { countUse } from './usage.js';
import { creditMoney } from './economy.js';
import { romeClock } from '../../shared/hacker-rules.js';
import type { Quest } from './quests-rules.js';
import { missionRow } from './quest-view.js';
import {
  DAILY_PLACES,
  NEIGHBOUR_VISIT,
  WEEK_DAYS,
  WEEK_MEDAL,
  type DailyState,
  advanceDaily,
  dailyFor,
  dailyPick,
  dailyProgress,
  liveStreak,
  streakBonus,
} from './daily-rules.js';

const today = (): string => romeClock(Date.now() + (game.session.serverOffset || 0)).day;

/** Lo stato di oggi (se è cambiato giorno riparte dai totali di adesso). */
function state(): DailyState {
  const s = dailyFor(game.player.today, today(), game.player.stats);
  if (s !== game.player.today) game.player.today = s;
  return s;
}

/** Ogni secondo (da tickQuests, solo a capitoli aperti). True se ha dato dei premi. */
export async function tickDaily(): Promise<boolean> {
  const s = state();
  const env: string = game.view.activeEnvironment;
  const seen =
    env === 'PLAYER_ROOM' && game.currentRoomIdx !== game.myAssignedRoomIdx
      ? NEIGHBOUR_VISIT
      : DAILY_PLACES.includes(env)
        ? env
        : null;
  if (seen && !s.seen[seen]) s.seen = { ...s.seen, [seen]: true };
  const { state: next, rewards } = advanceDaily(s, game.player.stats);
  if (!rewards.length) return false;
  if (!(await creditMoney(rewards.reduce((a, r) => a + r.reward, 0)))) return false;
  game.player.today = next;
  sfx('mission');
  for (const r of rewards) {
    if (r.streak) {
      countUse('oggi:tutte');
      toast(
        `🌅 Missioni di oggi finite! +${r.reward} Đ` +
          (r.streak > 1 ? ` (${r.streak} giorni di fila)` : ''),
        6000,
        false,
      );
      if (r.medal)
        toast('🏅 Settimana perfetta! La medaglia è sulla mensola della tua stanza.', 7000, false);
    } else {
      countUse(`oggi:${r.id}`);
      toast(`🌅 Missione di oggi: ${r.title} (+${r.reward} Đ)`, 5000, false);
    }
  }
  return true;
}

/** La medaglia della settimana perfetta, se guadagnata. */
export const weekMedal = (): string[] => (game.player.today?.week ? [WEEK_MEDAL] : []);

/** Una missione di oggi da seguire (quella chiesta, o la prima da fare), come una missione dei capitoli. */
export function dailyQuest(id: string | null): Quest | null {
  const s = state();
  const list = dailyPick(s.day).filter((m) => !s.done[m.id]);
  const m = id ? list.find((x) => x.id === id) : list[0];
  if (!m) return null;
  return {
    id: 'oggi:' + m.id,
    title: m.title,
    hint: m.hint,
    reward: m.reward,
    env: m.env,
    done: () => false,
  };
}

/** La sezione in cima alla finestra «Missioni». `follow` disegna il pulsante Segui. */
export function dailySection(follow: (id: string) => string): string {
  const s = state();
  const streak = liveStreak(s);
  const rows = dailyPick(s.day)
    .map((m) => {
      const p = dailyProgress(s, m, game.player.stats);
      const done = !!s.done[m.id];
      return missionRow(
        done ? '✅' : '⬜',
        m.title + (!done && p.need > 1 ? ` (${p.have}/${p.need})` : ''),
        m.reward,
        m.hint,
        done ? '' : follow('oggi:' + m.id),
      );
    })
    .join('');
  const next = s.full ? streak : streak + 1;
  const note = s.full
    ? `🎉 Fatte tutte: ci vediamo domani${streak > 1 ? ` (${streak} giorni di fila)` : ''}!`
    : `Finite tutte: +${streakBonus(next)} Đ${next > 1 ? ` (giorno ${next} di fila)` : ''}` +
      (s.week ? '' : ` · ${WEEK_DAYS} giorni di fila: medaglia 🏅`);
  return (
    `<section class="qs-chapter qs-daily${s.full ? ' done' : ''}">` +
    `<div class="qs-head"><b>🌅 Missioni di oggi</b><span>${streak ? `🔥 ${streak}` : 'cambiano a mezzanotte'}</span></div>` +
    `<ul>${rows}<li class="qs-note">${note}</li></ul></section>`
  );
}
