// Il cibo nello zaino (food-rules.ts): mangiare un piatto ovunque e regalarlo a chi è vicino,
// un giocatore o un personaggio del gioco. Regalare un piatto conta anche per l'assaggio di
// benvenuto (taste.ts).
import { sfx } from './audio.js';
import { game } from './context.js';
import type { GameValue } from './context.js';
import { DISH_HUNGER, type FoodStock } from './food-rules.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { notePersonality } from './personality.js';
import { saveGame } from './saves.js';
import { myLine } from './personality.js';
import { saySocial, sendSocial } from './social.js';
import { leaveDishHere, nearbyBots, noteTasteGiven, othersRoomHere, thankBot } from './taste.js';

export const food = (): FoodStock => ({ raw: game.player.rawFood, dishes: game.player.dishes });

/** Mangia un piatto dallo zaino: +50% fame, dove si vuole. */
export function eatDish(): boolean {
  if (game.player.dishes <= 0) return false;
  game.player.dishes--;
  game.player.hungerLevel = Math.min(100, game.player.hungerLevel + DISH_HUNGER);
  game.player.stats.meals = (game.player.stats.meals || 0) + 1;
  game.view.fridgeIsOpen = false;
  sfx('munch');
  toast(
    `😋 Gnam! Fame +${DISH_HUNGER}%` +
      (game.player.dishes > 0 ? ` · piatti nello zaino: ${game.player.dishes}` : ''),
  );
  saveGame(false);
  return true;
}

/** Dà un piatto a un giocatore vicino (anche dalla sua scheda, "Dai cibo"). */
export function giveDishTo(id: string, name: string): boolean {
  if (game.player.dishes <= 0) return false;
  game.player.dishes--;
  saySocial(myLine('food'));
  void sendSocial(id, { type: 'food' });
  toast(`🍽️ Hai dato un piatto a ${name}`);
  notePersonality('giveFood');
  noteTasteGiven();
  saveGame(false);
  return true;
}

/** "Regala" dallo zaino: a chi si dà il piatto, tra i giocatori e i personaggi vicini. */
export async function giveDishFromInventory(): Promise<void> {
  if (game.player.dishes <= 0) return;
  const players: GameValue[] = (game.frameNear || []).slice(0, 4);
  const bots = nearbyBots().slice(0, 2);
  // nella stanza di un altro: si può lasciare il piatto lì, lo troverà quando torna
  const roomIdx = othersRoomHere();
  const owner = roomIdx !== null ? game.roomsState[roomIdx]?.owner || 'il vicino' : '';
  if (!players.length && !bots.length && roomIdx === null) {
    toast('🍽️ Non c’è nessuno vicino a te: avvicinati a qualcuno e riprova.', 4000);
    return;
  }
  const res = await openDialog({
    title: '🎁 A chi regali il piatto?',
    text: 'Chi lo riceve recupera il 50% di fame.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      ...players.map((p) => ({ label: `🧑 ${p.name}`, value: 'p:' + p.id, color: '#e67e22' })),
      ...bots.map((b) => ({ label: `🙂 ${b.name}`, value: 'b:' + b.name, color: '#16a085' })),
      ...(roomIdx !== null
        ? [{ label: `🍝 Lascialo qui per ${owner}`, value: 'room', color: '#8e44ad', wide: true }]
        : []),
    ],
  });
  const choice = String(res.action || '');
  if (choice === 'room') {
    await leaveDishHere();
    return;
  }
  if (choice.startsWith('p:')) {
    const p = players.find((x) => 'p:' + x.id === choice);
    if (p) giveDishTo(p.id, p.name);
  } else if (choice.startsWith('b:')) {
    const b = bots.find((x) => 'b:' + x.name === choice);
    if (b && game.player.dishes > 0) {
      game.player.dishes--;
      thankBot(b);
      noteTasteGiven();
      saveGame(false);
    }
  }
}
