import { creditMoney } from './economy.js';
import { reopenCoach, tickArrival } from './arrival.js';
import type { LeaderboardScope } from './leaderboard.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { sfx } from './audio.js';
import { saveGame, withTimeout } from './saves.js';
import { openDialog } from './interface.js';
import { RELAX_COOLDOWN_MS, RELAX_GAIN } from './furniture-benefits.js';
import { tierOfPlaced } from './furniture-tiers.js';
import { openWelcomeList, tickWelcome, updateWelcomeHud } from './welcome.js';
import { livedRows, wealthRows } from './leaderboard-rules.js';
import { showLeaderboard } from './leaderboard.js';
import { worldNode } from './world-db.js';
// ---------- Divano e TV ----------
/** Pausa su divano o TV. Con `quiet` non avvisa se è troppo presto. Restituisce true se è andata. */
export function relaxWith(kind?: GameValue, item?: GameValue, quiet = false): boolean {
  const now: GameValue = Date.now();
  if (now < game.relaxCooldownUntil) {
    if (!quiet) {
      const left = game.relaxCooldownUntil - now;
      toast(
        `⏳ Hai appena fatto una pausa: riprova tra ${
          left >= 60_000 ? Math.ceil(left / 60_000) + ' min' : Math.ceil(left / 1000) + ' s'
        }`,
      );
    }
    return false;
  }
  const gain: number = RELAX_GAIN[kind === 'tv' ? 'tv' : 'sofa'][tierOfPlaced(item)];
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + gain);
  if (kind === 'tv') game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
  else game.player.sleepLevel = Math.min(100, game.player.sleepLevel + 3);
  game.player.stats.relax++;
  game.relaxCooldownUntil = now + RELAX_COOLDOWN_MS;
  toast(
    kind === 'tv'
      ? `📺 Ti sei goduto un po' di TV (Felicità +${gain}%)`
      : `🛋️ Ti sei rilassato sul divano (Felicità +${gain}%)`,
  );
  return true;
}

export function getWealth(..._args: GameValue[]): GameValue {
  return (
    game.moneyLevel +
    (game.bankBalance || 0) +
    Math.round(typeof game.investedTotal === 'function' ? game.investedTotal() : 0)
  );
}

export function updateMissionHud(..._args: GameValue[]): GameValue {
  // senza missioni a punti si mostrano quelle di benvenuto
  if (!game.MISSIONS.length) return updateWelcomeHud();
  const m: GameValue = game.MISSIONS[game.player.missionIndex];
  const el: GameValue = dom('mission-text');
  el.style.display = game.MISSIONS.length ? '' : 'none'; // senza missioni il riquadro sparisce
  el.textContent = m ? `📋 ${m.text} (+${m.reward} Đ)` : '🏆 Tutte le missioni completate!';
}

export async function checkMissions(..._args: GameValue[]): Promise<void> {
  if (!game.session.saveReady) return;
  // l'arrivo del giocatore nuovo (arrival.ts) guida anche le prime missioni
  tickArrival();
  if (!game.MISSIONS.length) {
    await tickWelcome();
    updateWelcomeHud();
    return;
  }
  const m: GameValue = game.MISSIONS[game.player.missionIndex];
  if (m) {
    if (m.skip && m.skip()) {
      game.player.missionIndex++;
    } else if (m.check()) {
      game.player.missionIndex++;
      if (!(await creditMoney(m.reward))) {
        game.player.missionIndex--;
        return;
      }
      sfx('mission');
      toast(`🏆 Missione completata: ${m.text} (+${m.reward} Đ)`, 4000, false);
      saveGame(true);
    }
  }
  updateMissionHud();
}

export function openMissions(..._args: GameValue[]): GameValue {
  // durante l'arrivo la riga gialla riapre il riquadro della guida
  if (reopenCoach()) return void updateWelcomeHud();
  if (!game.MISSIONS.length) return void openWelcomeList();
  const lines: GameValue = game.MISSIONS.map(
    (m?: GameValue, i?: GameValue): GameValue =>
      `${i < game.player.missionIndex ? '✅' : i === game.player.missionIndex ? '👉' : '⬜'} ${m.text} · ${m.reward} Đ`,
  ).join('\n');
  openDialog({
    title: `📋 Missioni (${Math.min(game.player.missionIndex, game.MISSIONS.length)}/${game.MISSIONS.length})`,
    text: lines,
    buttons: [{ label: 'Chiudi', value: null }],
  });
}

// ---------- Classifica ----------
export function fmtDuration(ms?: GameValue): GameValue {
  const m: GameValue = Math.max(0, Math.floor(ms / 60000)),
    h: GameValue = Math.floor(m / 60),
    d: GameValue = Math.floor(h / 24);
  if (d >= 2) return `${d} g ${h % 24} h`;
  if (h >= 1) return `${h} h ${m % 60} min`;
  return `${m} min`;
}

/**
 * La classifica del proprio condominio o, col pulsante sopra l'elenco, quella di tutti i mondi
 * (lì i più longevi sono solo quelli vivi: le lapidi sono di ogni condominio).
 */
export async function openLeaderboard(
  mode: GameValue = 'wealth',
  scope: LeaderboardScope = 'world',
): Promise<GameValue> {
  saveGame(true);
  const read = async (path: string): Promise<GameValue> => {
    try {
      const snap: GameValue = await withTimeout(game.session.db.ref(path).once('value'), 5000);
      return (snap && snap.val()) || {};
    } catch (e: GameValue) {
      return {};
    }
  };
  const all = scope === 'all';
  const lb: GameValue = await read(all ? 'sims_leaderboard_global' : worldNode('leaderboard'));
  const lived = mode === 'lived';
  // tutti i giocatori, in un elenco che si scorre (vedi leaderboard.ts)
  const rows = lived
    ? livedRows(lb, all ? {} : await read(worldNode('graveyard')), Date.now())
    : wealthRows(lb);
  showLeaderboard(
    lived ? 'lived' : 'wealth',
    rows,
    game.session.myPlayerId,
    (r) => (lived ? fmtDuration(r.value) : `${r.value.toLocaleString('it-IT')} Đ`),
    (m) => void openLeaderboard(m, scope),
    { scope, world: game.session.worldId, onScope: (sc) => void openLeaderboard(mode, sc) },
  );
}

export function toast(msg?: GameValue, ms: GameValue = 2600, sound: GameValue = null): GameValue {
  if (sound !== false) {
    if (/^(❌|🚫|🚨|😵|⏳)/u.test(msg)) sfx('error');
    else if (/^(✅|🎉|✨)/u.test(msg)) sfx('success');
    else sfx('click');
  }
  const box: GameValue = dom('toast-container');
  const el: GameValue = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  lifetime.setTimeout((): GameValue => {
    el.classList.add('out');
    lifetime.setTimeout((): GameValue => el.remove(), 300);
  }, ms);
}
