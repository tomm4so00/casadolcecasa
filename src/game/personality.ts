import { game } from './context.js';
import { lifetime } from './runtime.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { sfx } from './audio.js';
import {
  BEDTIME_THOUGHTS,
  PERSONALITIES,
  type PersonalityAction,
  type PersonalityId,
  addPersonalityPoints,
  emptyPersonality,
  leadingPersonality,
} from './personality-rules.js';

/** Registra un'azione che fa crescere una personalità; alla soglia mostra il messaggio. */
export function notePersonality(action: PersonalityAction): void {
  if (game.player.isDead) return;
  const state = (game.player.personality ??= emptyPersonality());
  const reached = addPersonalityPoints(state, action, new Date());
  saveGame(false);
  if (reached) void announcePersonality(reached);
}

async function announcePersonality(id: PersonalityId): Promise<void> {
  // Lascia prima aprire le finestre che l'azione stessa mostra (es. il riepilogo di fine turno),
  // poi aspetta che vengano chiuse: altrimenti si coprirebbero a vicenda.
  const wait = (ms: number) => new Promise((r) => lifetime.setTimeout(r, ms));
  await wait(800);
  while (game.dialogResolve) await wait(700);
  sfx('mission');
  await openDialog({
    title: '✨ La tua personalità',
    text: PERSONALITIES[id].message,
    buttons: [{ label: 'Ok', value: 'ok', color: '#6c5ce7' }],
  });
}

/** Quando il personaggio si corica, un fumetto suggerisce che personalità sta diventando. */
export function bedtimeThought(): void {
  const id = leadingPersonality(game.player.personality ?? emptyPersonality());
  if (!id) return;
  const thoughts = BEDTIME_THOUGHTS[id];
  // lo stesso fumetto che usano le chiacchiere: lo vedono anche gli altri giocatori vicini
  game.mySay = '💭 ' + thoughts[Math.floor(Math.random() * thoughts.length)];
  game.mySayT = Date.now();
}
