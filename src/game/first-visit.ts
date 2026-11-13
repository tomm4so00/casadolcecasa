// La riga «prima volta qui» (regole in first-visit-rules.ts): entrando per la prima volta in un
// posto, un avviso breve in alto con un "ding" leggero. I posti visti stanno nel salvataggio, così
// non si ripete su un altro telefono. Durante l'arrivo no: parla già la guida.
import { game } from './context.js';
import { sfx } from './audio.js';
import { toast } from './missions.js';
import { arrivalActive } from './arrival.js';
import { saveGame } from './saves.js';
import { FIRST_VISIT, firstVisitKey } from './first-visit-rules.js';

/** Quanto resta la riga. */
const SHOW_MS = 6500;

/** Ogni secondo (da tickQuests): se si è in un posto mai visto, la sua riga. */
export function tickFirstVisit(): void {
  if (!game.session.saveReady || game.player.isDead || arrivalActive()) return;
  const env: string = game.view.activeEnvironment;
  const key = firstVisitKey(
    env,
    env === 'PLAYER_ROOM' && game.currentRoomIdx === game.myAssignedRoomIdx,
  );
  if (!key) return;
  const seen = (game.player.placesSeen ??= []);
  if (seen.includes(key)) return;
  seen.push(key);
  sfx('hint');
  toast(FIRST_VISIT[key], SHOW_MS, false);
  saveGame(false);
}
