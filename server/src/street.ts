// La strada vista dal server: annunci delle retate nei pettegolezzi e prezzo dell'erba.
import { type ActivityLog, activityTarget, dayOf } from '../../shared/activity.js';
import { type WorldNode, worldNodePath } from '../../shared/worlds.js';
import { activeRaid, raidGossip, raidOfDay } from '../../src/game/dealer-rules.js';
import {
  type WeedMarket,
  decodeWeedTrades,
  tradeReference,
  weedPush,
  NORMAL_BAG_PRICE,
} from '../../src/game/weed-market-rules.js';
import type { MaintenanceDatabase } from './maintenance.js';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
/** Una chiave come quelle di push(): in ordine di tempo, così i pettegolezzi restano in fila. */
export function pushKey(now: number, random: () => number = Math.random): string {
  let key = '';
  for (let t = now, i = 0; i < 8; i++, t = Math.floor(t / 64)) key = PUSH_CHARS[t % 64] + key;
  for (let i = 0; i < 12; i++) key += PUSH_CHARS[Math.floor(random() * 64)];
  return key;
}

/**
 * Inizio e fine di una retata nei pettegolezzi del condominio, una volta sola: in
 * sims_street_raids/<mondo> si ricorda l'ultima annunciata (start) e chiusa (end).
 * Il server gira circa una volta all'ora, quindi l'annuncio può arrivare un po' dopo.
 */
export async function announceRaids(
  database: MaintenanceDatabase,
  now: number,
  world: string,
): Promise<void> {
  const ref = database.ref('sims_street_raids/' + world);
  const seen = (await ref.get()).val();
  const state = record(seen) ? seen : {};
  const gossip = database.ref(worldNodePath(world, 'gossip' as WorldNode));
  const post = (text: string) => gossip.update({ [pushKey(now)]: { by: 'polizia', text, t: now } });
  const raid = activeRaid(world, now);
  if (raid && state.start !== raid.id) {
    await post(raidGossip(raid, false));
    await ref.update({ start: raid.id });
    return;
  }
  if (!raid && typeof state.start === 'number' && state.end !== state.start) {
    const last = raidOfDay(world, state.start);
    if (last && last.end <= now) {
      await post(raidGossip(last, true));
      await ref.update({ end: state.start });
    }
  }
}

/** Scambi d'erba da tenere: oggi e ieri (il riferimento guarda le ultime 24 ore). */
const TRADE_DAYS = 2;

/**
 * Il mercato dell'erba: riferimento dagli scambi tra giocatori e spinta dalla domanda (erba
 * comprata e scambiata, attività "canapa") meno l'offerta (raccolti, attività "raccolto").
 * Se gli scambi sono troppo pochi resta l'ultimo riferimento pubblicato, o il prezzo normale.
 */
export async function updateWeedMarket(
  database: MaintenanceDatabase,
  now: number,
  log: ActivityLog,
): Promise<WeedMarket> {
  const tradesRef = database.ref('sims_weed_trades');
  const raw = (await tradesRef.get()).val();
  const today = dayOf(now);
  if (record(raw))
    for (const day of Object.keys(raw))
      if (!/^\d+$/.test(day) || Number(day) <= today - TRADE_DAYS)
        await database.ref('sims_weed_trades/' + day).remove();
  const ref = database.ref('sims_weed_market');
  const before = (await ref.get()).val();
  const fromTrades = tradeReference(decodeWeedTrades(raw), now);
  const market: WeedMarket = {
    ref:
      fromTrades ??
      (record(before) && typeof before.ref === 'number' ? before.ref : NORMAL_BAG_PRICE),
    push: weedPush(activityTarget(log, 'canapa', now), activityTarget(log, 'raccolto', now)),
    t: now,
  };
  await ref.update({ ...market });
  return market;
}
