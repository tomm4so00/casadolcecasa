import { creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { sfx } from './audio.js';
import { saveGame, withTimeout } from './saves.js';
import { openDialog } from './interface.js';
import { RELAX_GAIN } from './furniture-benefits.js';
import { tierOfPlaced } from './furniture-tiers.js';
// ---------- Divano e TV ----------
export function relaxWith(kind?: GameValue, item?: GameValue): GameValue {
  const now: GameValue = Date.now();
  if (now < game.relaxCooldownUntil) {
    toast(
      `⏳ Hai appena fatto una pausa: riprova tra ${Math.ceil((game.relaxCooldownUntil - now) / 1000)} s`,
    );
    return;
  }
  const gain: number = RELAX_GAIN[kind === 'tv' ? 'tv' : 'sofa'][tierOfPlaced(item)];
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + gain);
  if (kind === 'tv') game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
  else game.player.sleepLevel = Math.min(100, game.player.sleepLevel + 3);
  game.player.stats.relax++;
  game.relaxCooldownUntil = now + 30000;
  toast(
    kind === 'tv'
      ? `📺 Ti sei goduto un po' di TV (Felicità +${gain}%)`
      : `🛋️ Ti sei rilassato sul divano (Felicità +${gain}%)`,
  );
}

export function getWealth(..._args: GameValue[]): GameValue {
  return (
    game.moneyLevel +
    (game.bankBalance || 0) +
    Math.round(typeof game.investedTotal === 'function' ? game.investedTotal() : 0)
  );
}

export function updateMissionHud(..._args: GameValue[]): GameValue {
  const m: GameValue = game.MISSIONS[game.player.missionIndex];
  const el: GameValue = dom('mission-text');
  el.style.display = game.MISSIONS.length ? '' : 'none'; // senza missioni il riquadro sparisce
  el.textContent = m ? `📋 ${m.text} (+${m.reward} €)` : '🏆 Tutte le missioni completate!';
}

export async function checkMissions(..._args: GameValue[]): Promise<void> {
  if (!game.session.saveReady) return;
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
      toast(`🏆 Missione completata: ${m.text} (+${m.reward} €)`, 4000, false);
      saveGame(true);
    }
  }
  updateMissionHud();
}

export function openMissions(..._args: GameValue[]): GameValue {
  const lines: GameValue = game.MISSIONS.map(
    (m?: GameValue, i?: GameValue): GameValue =>
      `${i < game.player.missionIndex ? '✅' : i === game.player.missionIndex ? '👉' : '⬜'} ${m.text} · ${m.reward} €`,
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

export async function openLeaderboard(mode: GameValue = 'wealth'): Promise<GameValue> {
  saveGame(true);
  let lb: GameValue = {},
    gy: GameValue = {};
  try {
    const snap: GameValue = await withTimeout(
      game.session.db.ref('sims_leaderboard').once('value'),
      5000,
    );
    lb = (snap && snap.val()) || {};
  } catch (e: GameValue) {}
  if (mode === 'lived') {
    try {
      gy =
        (
          (await withTimeout(game.session.db.ref('sims_graveyard').once('value'), 5000)) || {
            val: (): GameValue => ({}),
          }
        ).val() || {};
    } catch (e: GameValue) {}
  }
  const medals: GameValue = ['🥇', '🥈', '🥉'];
  let list: GameValue, text: GameValue, title: GameValue;
  if (mode === 'lived') {
    const now: GameValue = Date.now();
    list = Object.keys(lb)
      .filter((id?: GameValue): GameValue => lb[id].bornAt)
      .map(
        (id?: GameValue): GameValue => ({
          id,
          name: lb[id].name,
          ms: now - lb[id].bornAt,
          dead: false,
        }),
      )
      .concat(
        Object.keys(gy)
          .filter((id?: GameValue): GameValue => typeof gy[id].lived === 'number')
          .map(
            (id?: GameValue): GameValue => ({
              id,
              name: gy[id].name,
              ms: gy[id].lived,
              dead: true,
            }),
          ),
      );
    list.sort((a?: GameValue, b?: GameValue): GameValue => b.ms - a.ms);
    const line: GameValue = (p?: GameValue, i?: GameValue): GameValue =>
      `${medals[i] || i + 1 + '.'} ${p.name}${p.id === game.session.myPlayerId ? ' (tu)' : ''} — ${fmtDuration(p.ms)}${p.dead ? ' 🪦' : ''}`;
    text = list.slice(0, 10).map(line).join('\n') || 'Ancora nessuno in classifica.';
    const myPos: GameValue = list.findIndex(
      (p?: GameValue): GameValue => p.id === game.session.myPlayerId,
    );
    if (myPos >= 10)
      text += `\n…\n${myPos + 1}. ${list[myPos].name} (tu) — ${fmtDuration(list[myPos].ms)}`;
    text += '\n\nTempo di vita del personaggio. I vivi crescono ogni ora, 🪦 = morto.';
    title = '⏳ Classifica dei più longevi';
  } else {
    list = Object.keys(lb)
      .map((id?: GameValue): GameValue => Object.assign({ id }, lb[id]))
      .filter((p?: GameValue): GameValue => typeof p.wealth === 'number');
    list.sort((a?: GameValue, b?: GameValue): GameValue => b.wealth - a.wealth);
    const myPos: GameValue = list.findIndex(
      (p?: GameValue): GameValue => p.id === game.session.myPlayerId,
    );
    text =
      list
        .slice(0, 10)
        .map(
          (p?: GameValue, i?: GameValue): GameValue =>
            `${medals[i] || i + 1 + '.'} ${p.name}${p.id === game.session.myPlayerId ? ' (tu)' : ''} — ${p.wealth} €`,
        )
        .join('\n') || 'Ancora nessun giocatore in classifica.';
    if (myPos >= 10)
      text += `\n…\n${myPos + 1}. ${list[myPos].name} (tu) — ${list[myPos].wealth} €`;
    text += '\n\nConta i soldi in cassaforte.';
    title = '🏆 Classifica dei più ricchi';
  }
  const res: GameValue = await openDialog({
    title,
    text,
    buttons: [
      { label: 'Chiudi', value: null },
      {
        label: mode === 'lived' ? '💰 Più ricchi' : '⏳ Più longevi',
        value: 'toggle',
        color: '#e67e22',
      },
    ],
  });
  if (res.action === 'toggle') openLeaderboard(mode === 'lived' ? 'wealth' : 'lived');
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
