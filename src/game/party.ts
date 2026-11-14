// La festa del condominio nel gioco (gli orari sono in party-rules.ts): l'avviso un quarto d'ora
// prima e all'inizio, e la spilla della serata a chi resta in cortile PARTY_STAY_MS. La spilla va
// nel salvataggio e la bacheca della stanza ne pubblica il numero, per chi viene in visita.
// Nel gioco di prova (e in sviluppo) ?festa=1 fa partire una festa subito, per provarla.
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { getMyRoomMap, isMyRoomNow, publishParties, saveGame } from './saves.js';
import { partyHooks } from './party-hooks.js';
import { isTestStage } from './stage.js';
import {
  PARTY_MAX_PINS,
  PARTY_STAY_MS,
  forceParty,
  nextPartyText,
  partyAt,
  partyDayText,
  partySoon,
} from './party-rules.js';

const SEEN_KEY = 'sims_party_seen';
const TICK_MS = 1000;
const STAY_MIN = Math.round(PARTY_STAY_MS / 60_000);

/** Gli avvisi già dati ("2026-11-20:warn"), per non ripeterli ricaricando la pagina. */
function seen(key: string): boolean {
  try {
    return (localStorage.getItem(SEEN_KEY) || '').split(',').includes(key);
  } catch {
    return false;
  }
}
function markSeen(key: string): void {
  try {
    // si tengono solo gli ultimi, bastano per la festa di stasera
    const list = (localStorage.getItem(SEEN_KEY) || '').split(',').filter(Boolean).slice(-10);
    localStorage.setItem(SEEN_KEY, [...list, key].join(','));
  } catch {
    // senza memoria del browser al peggio l'avviso torna dopo un ricaricamento
  }
}

const now = (): number => Date.now() + (game.session.serverOffset || 0);
const hasPin = (id: string): boolean => (game.player.parties || []).includes(id);

/** Quanto si è stati in cortile durante la festa di oggi (si azzera ricaricando: va bene così). */
let stay = { id: '', ms: 0 };

function givePin(id: string): void {
  const list = [...(game.player.parties || []), id].sort().slice(-PARTY_MAX_PINS);
  game.player.parties = list;
  publishParties();
  void saveGame(false);
  sfx('levelUp');
  toast(
    `📌 Spilla della festa del ${partyDayText(id)}! L’ho appesa sulla bacheca della tua stanza (${list.length} ${list.length === 1 ? 'festa' : 'feste'}).`,
    7000,
  );
}

function tick(): void {
  if (game.player.isDead || !game.player.myData?.nick) return;
  const t = now();
  const soon = partySoon(t);
  if (soon && !seen(soon.id + ':warn')) {
    markSeen(soon.id + ':warn');
    sfx('hint');
    toast(
      `🎉 Tra ${soon.minutes} ${soon.minutes === 1 ? 'minuto' : 'minuti'} c’è la festa del condominio in cortile! Chi resta ${STAY_MIN} minuti riceve la spilla della serata.`,
      8000,
    );
  }
  const party = partyAt(t);
  if (!party) return;
  if (!seen(party.id + ':start')) {
    markSeen(party.id + ':start');
    sfx('hint');
    toast(
      game.view.activeEnvironment === 'CORTILE'
        ? `🎉 La festa del condominio è cominciata! Resta qui ${STAY_MIN} minuti per la spilla della serata.`
        : `🎉 La festa del condominio è cominciata: scendi in cortile! Chi resta ${STAY_MIN} minuti riceve la spilla della serata.`,
      8000,
    );
  }
  if (hasPin(party.id)) return;
  if (stay.id !== party.id) stay = { id: party.id, ms: 0 };
  if (game.view.activeEnvironment !== 'CORTILE') return;
  stay.ms += TICK_MS;
  if (stay.ms >= PARTY_STAY_MS) givePin(party.id);
}

/** Il testo della bacheca nella stanza: quante feste e quando c'è la prossima. */
function partyBoardText(mine: boolean, count: number, owner: string): string {
  const next = nextPartyText(now());
  const when =
    next === 'adesso' ? '🎉 La festa è adesso, in cortile!' : `Prossima festa in cortile: ${next}.`;
  if (mine)
    return count
      ? `📌 Sei stato a ${count} ${count === 1 ? 'festa' : 'feste'} del condominio. ${when}`
      : `📌 Qui appendi le spille delle feste del condominio: martedì, venerdì e domenica alle 21 in cortile. ${when}`;
  return `📌 ${owner || 'Chi abita qui'} è stato a ${count} ${count === 1 ? 'festa' : 'feste'} del condominio. ${when}`;
}

function startParty(): void {
  try {
    if (
      (isTestStage() || import.meta.env.DEV || game.session.OFFLINE) &&
      new URLSearchParams(location.search).get('festa') === '1'
    )
      forceParty(now());
  } catch {
    // senza indirizzo, niente festa di prova
  }
  tick();
  lifetime.setInterval(tick, TICK_MS);
}

partyHooks.start = startParty;
partyHooks.boardText = partyBoardText;
partyHooks.isMyRoom = isMyRoomNow;
partyHooks.myRoomMap = () => getMyRoomMap() as Record<string, { x: number; y: number }>;
