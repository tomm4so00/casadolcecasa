// Viaggi sulla luna con il razzo, dopo il primo lancio: biglietto da 500 €, decollo animato
// (lo vede chi è lì vicino) e arrivo dall'altra parte; il ritorno è compreso nel biglietto.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import {
  FLIGHT_ARRIVE_MS,
  FLIGHT_TOTAL_MS,
  MOON_TRIP_PRICE,
  launchPhase,
  rocketFlight,
} from './project-rules.js';

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Volo del razzo sulla Terra (primo lancio o ultimo viaggio) e di quello sulla luna. */
export const earthFlight = () =>
  rocketFlight(Math.max(game.rocketLaunchAt || 0, game.rocketTripAt || 0), serverNow());
export const moonFlight = () => rocketFlight(game.moonTripAt || 0, serverNow());

/** true dopo che il razzo è stato lanciato la prima volta. */
export const moonOpen = (): boolean =>
  launchPhase(game.rocketStage || 0, game.rocketLaunchAt, serverNow()).phase === 'launched';

const waitText = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s > 60 ? `${Math.ceil(s / 60)} minuti` : `${s} secondi`;
};

/** Prenota il decollo (uno alla volta): restituisce l'ora del decollo, o null se il razzo è occupato. */
async function book(path: 'trip' | 'moonTrip'): Promise<number | null> {
  const at = serverNow() + 1000;
  try {
    const res = await game.session.db
      .ref('sims_projects/rocket/' + path)
      .transaction((cur: GameValue) =>
        cur && typeof cur.at === 'number' && serverNow() - cur.at < FLIGHT_TOTAL_MS
          ? undefined
          : { at, by: String(game.player.myData.nick || 'Giocatore').slice(0, 20) },
      );
    return res.committed ? at : null;
  } catch (e) {
    console.warn('[luna]', e);
    return null;
  }
}

function busyTraveler(): boolean {
  if (game.activeShift || game.player.isSleeping || game.fainted || game.rocketTrip) return true;
  return false;
}

export async function travelToMoon(): Promise<void> {
  if (busyTraveler()) return;
  if (!moonOpen()) {
    toast(
      '🚀 Il razzo non è ancora stato lanciato: completate il progetto e premete il pulsante rosso!',
      5000,
    );
    return;
  }
  const flight = earthFlight();
  if (flight.phase !== 'idle') {
    toast(
      `🚀 Il razzo è in viaggio: sarà di nuovo sulla rampa tra ${waitText(flight.readyIn)}.`,
      4500,
    );
    return;
  }
  if (game.moneyLevel < MOON_TRIP_PRICE) {
    toast(
      `🌙 Il biglietto per la luna costa ${MOON_TRIP_PRICE} €: non hai abbastanza soldi in cassaforte.`,
      5000,
    );
    return;
  }
  const res: GameValue = await openDialog({
    title: '🌙 Viaggio sulla luna',
    text: `Il biglietto costa ${MOON_TRIP_PRICE} € (andata e ritorno).\nSali sul razzo e parti?`,
    buttons: [
      { label: 'Resto qui', value: null, color: '#57606f' },
      { label: `🚀 Parto (${MOON_TRIP_PRICE} €)`, value: 'ok', color: '#0984e3' },
    ],
  });
  if (res.action !== 'ok' || !(await spendMoney(MOON_TRIP_PRICE))) return;
  const at = await book('trip');
  if (!at) {
    await creditMoney(MOON_TRIP_PRICE);
    toast(
      '🚀 Qualcun altro è appena partito: i tuoi soldi sono tornati in cassaforte. Riprova tra poco.',
      5000,
    );
    return;
  }
  board('up', at, game.engineeringYardFurniture.rocketPad);
  game.player.stats.moonTrips = (game.player.stats.moonTrips || 0) + 1;
  saveGame(false);
}

export async function returnToEarth(): Promise<void> {
  if (busyTraveler()) return;
  const flight = moonFlight();
  if (flight.phase !== 'idle') {
    toast(`🚀 Il razzo è in viaggio: sarà di nuovo qui tra ${waitText(flight.readyIn)}.`, 4500);
    return;
  }
  const at = await book('moonTrip');
  if (!at) {
    toast('🚀 Il razzo sta già partendo con qualcun altro: riprova tra poco.', 4500);
    return;
  }
  board('down', at, game.moonFurniture.moonRocket);
}

/** Il personaggio sale a bordo: sparisce dentro il razzo e la telecamera resta sulla rampa. */
function board(dir: 'up' | 'down', at: number, pad: GameValue): void {
  game.rocketTrip = { dir, at };
  game.playerPos = { x: pad.x + 70, y: pad.y + 80 };
  dom('pop-interaction').classList.add('hidden');
  sfx('mission');
  toast(dir === 'up' ? '🚀 Sei a bordo! Decollo…' : '🚀 Si torna a casa! Decollo…', 3500);
}

/** Si chiama a ogni fotogramma: quando il razzo è alto nel cielo si arriva a destinazione. */
export function updateRocketTrip(): void {
  const trip = game.rocketTrip;
  if (!trip || serverNow() - trip.at < FLIGHT_ARRIVE_MS || trip.dir === undefined) return;
  const fade = dom('travel-fade');
  if (fade.classList.contains('on')) return;
  fade.classList.add('on');
  lifetime.setTimeout(() => {
    if (trip.dir === 'up') {
      const r: GameValue = game.moonFurniture.moonRocket;
      game.view.activeEnvironment = 'luna';
      game.view.currentRoomTitle = 'Luna 🌙';
      game.playerPos = { x: r.x + 70, y: r.y + 90 };
      toast('🌙 Benvenuto sulla luna! Quando vuoi tornare, sali sul razzo.', 5500);
    } else {
      const r: GameValue = game.engineeringYardFurniture.rocketPad;
      game.view.activeEnvironment = 'ingegneria_esterno';
      game.view.currentRoomTitle = 'Zona esterna del laboratorio 🚀';
      game.playerPos = { x: r.x + 120, y: r.y + 150 };
      toast('🌍 Bentornato sulla Terra!', 4000);
    }
    game.rocketTrip = null;
    dom('btn-return-home').classList.add('hidden');
    lifetime.setTimeout(() => fade.classList.remove('on'), 150);
  }, 700);
}
