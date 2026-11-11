// Scenario specifico: estende la base comune senza cambiare il normale avvio di test.
import { game } from './context.js';
import { setDevelopmentRaid, type DealerPlace } from './dealer-rules.js';
import { applyRoomBounds } from './room-size.js';
import { inventoryChange } from './inventory-market.js';
import { creditMoney } from './economy.js';
import { POLICE_EASTER_EGG_MS } from './raid-police.js';
import { toast } from './missions.js';

export async function police(place: DealerPlace = 'passeggiata', suspicious = true): Promise<void> {
  const ready = await inventoryChange(async (ledger) => {
    if (!(await ledger.policeResolution(null))) return false;
    if (!suspicious) return true;
    return (await ledger.buy('weed', 20, 0)) && (await ledger.buy('drug', 3, 0));
  });
  if (!ready) throw new Error('Impossibile preparare lo zaino della prova poliziotto.');
  if (game.moneyLevel < 200) await creditMoney(200 - game.moneyLevel);
  const now = Date.now();
  setDevelopmentRaid({ id: -1, place, start: now, end: now + 3_600_000 });
  game.view.activeEnvironment = place;
  game.view.currentRoomTitle = 'Prova poliziotto';
  document.getElementById('btn-return-home')?.classList.add('hidden');
  applyRoomBounds(place);
  game.playerPos = { x: 0, y: place === 'passeggiata' ? 210 : 100 };
  toast(
    suspicious
      ? 'Prova pronta: 20 g di erba e 3 pillole nello zaino. Avvicinati al poliziotto.'
      : 'Zaino senza droga: il poliziotto non ti inseguirà.',
    6000,
  );
}

export function smoke(): void {
  const bot = game.simulationBots.find(
    (b: { dealer?: boolean; env: string }) => b.dealer && b.env === game.view.activeEnvironment,
  );
  if (bot?.policeSeizedWeed) bot.policeWait = POLICE_EASTER_EGG_MS;
}
