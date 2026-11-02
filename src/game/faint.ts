import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import {
  RESUMABLE_ENVS,
  RETURN_BUTTON_ENVS,
  SLEEP_AFTER_FAINT,
  faintedWhileAway,
} from './presence-rules.js';

const RISE_MS = 900;

/** Al rientro: chi era uscito sveglio e ha finito il sonno si ritrova svenuto (se è ancora vivo). */
export function noteFaintOnReturn(wasSleeping: boolean): void {
  game.fainted =
    game.player.healthLevel > 0 && faintedWhileAway(wasSleeping, game.player.sleepLevel);
}

/** Riporta il personaggio svenuto nel punto in cui gli altri lo hanno visto cadere. */
export async function resumeFaintSpot(): Promise<void> {
  let last: GameValue = null;
  try {
    last = (
      await game.session.db.ref('sims_online_players/' + game.session.myPlayerId).get()
    ).val();
  } catch {
    last = null;
  }
  if (last && RESUMABLE_ENVS.has(last.env)) {
    const ownRoom = last.env !== 'PLAYER_ROOM' || last.roomIdx === game.myAssignedRoomIdx;
    if (ownRoom && Number.isFinite(last.x) && Number.isFinite(last.y)) {
      game.view.activeEnvironment = last.env;
      if (last.env === 'PLAYER_ROOM') {
        game.currentRoomIdx = game.myAssignedRoomIdx;
        game.view.currentRoomTitle = 'La tua stanza 🏠';
      } else if (typeof last.place === 'string' && last.place) {
        game.view.currentRoomTitle = last.place;
      }
      if (typeof last.apt === 'number') game.currentApt = last.apt;
      game.playerPos = { x: last.x, y: last.y };
      if (RETURN_BUTTON_ENVS.has(last.env)) dom('btn-return-home').classList.remove('hidden');
    }
  }
  dom('btn-stand-up').classList.remove('hidden');
  lifetime.setTimeout(
    () =>
      toast(
        '😵 Mentre eri via il sonno è finito e sei svenuto a terra. Premi 🧍 Rialzati, poi vai a dormire!',
        7000,
      ),
    1500,
  );
}

/** Il personaggio si rialza con una breve animazione e con un po' di energia per arrivare al letto. */
export function standUp(): void {
  if (!game.fainted) return;
  game.fainted = false;
  game.faintRiseAt = performance.now();
  game.player.sleepLevel = Math.max(game.player.sleepLevel, SLEEP_AFTER_FAINT);
  dom('btn-stand-up').classList.add('hidden');
  game.socKey = '';
  sfx('wake');
  toast('🧍 Ti rialzi a fatica… Vai subito a dormire nel tuo letto!', 4500);
}

/** Quanto il personaggio è a terra: 1 = svenuto, 0 = in piedi (durante l'animazione si rialza). */
export function faintAmount(): number {
  if (game.fainted) return 1;
  if (!game.faintRiseAt) return 0;
  const k = (performance.now() - game.faintRiseAt) / RISE_MS;
  if (k >= 1) {
    game.faintRiseAt = 0;
    return 0;
  }
  return 1 - k;
}
