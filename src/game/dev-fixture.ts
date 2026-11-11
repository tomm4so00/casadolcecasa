// Base comune per tutte le prove manuali: ogni scenario parte da questi stessi dati.
import { game } from './context.js';
import { updateEconomy } from './economy.js';
import { initializeInventory } from './inventory-market.js';
import { saveMyPin } from './safe-pins.js';
import { newWelcome } from './welcome-rules.js';

export const DEV_PIN = '123';
export const DEV_MONEY = 200;

export async function prepareDevFixture(): Promise<void> {
  game.player.healthLevel = game.player.sleepLevel = game.player.hungerLevel = 100;
  game.player.happinessLevel = game.player.hygieneLevel = 100;
  game.player.welcome = { ...newWelcome(), status: 'off' };
  const index = game.myAssignedRoomIdx;
  if (index === null || index < 0) throw new Error('La partita di prova non ha una stanza.');
  if (!(await saveMyPin(DEV_PIN))) throw new Error('PIN di prova non preparato.');
  if (!(await updateEconomy((_economy, balance) => DEV_MONEY - balance)))
    throw new Error('Saldo di prova non preparato.');
  if (!(await initializeInventory())) throw new Error('Zaino di prova non preparato.');
}
