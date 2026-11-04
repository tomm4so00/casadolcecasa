import { RETIRED_BUSINESSES } from '../../shared/market.js';
import { ACTIVITY_DAYS, dayOf } from '../../shared/activity.js';
import {
  PETS,
  PET_DYING_WARN_MS,
  PET_HUNGER_DEPLETION_SEC,
  PET_KINDS,
  type PetKind,
  decodePets,
  petDiesAt,
} from '../../shared/pet-rules.js';

interface Snapshot {
  val(): unknown;
}
interface Reference {
  get(): Promise<Snapshot>;
  update(value: Record<string, unknown>): Promise<void>;
  remove(): Promise<void>;
  transaction(
    update: (value: unknown) => unknown,
  ): Promise<{ committed: boolean; snapshot: Snapshot }>;
}
export interface MaintenanceDatabase {
  ref(path: string): Reference;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

/** Legacy absence/death handling belongs to the trusted process, not another player. */
export async function maintainGame(database: MaintenanceDatabase, now: number): Promise<void> {
  const accounts = (await database.ref('sims_accounts').get()).val();
  const linkedPlayers = new Set(
    record(accounts)
      ? Object.values(accounts).flatMap((account) =>
          record(account) && typeof account.playerId === 'string' ? [account.playerId] : [],
        )
      : [],
  );
  const rooms = database.ref('sims_rooms_state');
  await rooms.get();
  let expired: { id: string; name: string; lastSeen: number }[] = [];
  const result = await rooms.transaction((value) => {
    expired = [];
    if (!record(value)) return undefined;
    const next = structuredClone(value);
    for (const [key, room] of Object.entries(next)) {
      if (
        !record(room) ||
        room.pendingDeath ||
        typeof room.ownerId !== 'string' ||
        !linkedPlayers.has(room.ownerId) ||
        typeof room.lastSeen !== 'number' ||
        now - room.lastSeen <= 80 * 3600000
      )
        continue;
      expired.push({
        id: room.ownerId,
        name: typeof room.owner === 'string' ? room.owner : 'Sconosciuto',
        lastSeen: room.lastSeen,
      });
      next[key] = { id: room.id, vaultMoney: 0, pendingDeath: expired[expired.length - 1] };
    }
    return expired.length ? next : undefined;
  });
  // Keep a receipt in the room until all private records are updated. A later run can recover after a network failure.
  const pending = result.snapshot.val();
  if (record(pending))
    for (const [roomIndex, room] of Object.entries(pending)) {
      if (!record(room) || !record(room.pendingDeath)) continue;
      const player = room.pendingDeath as { id: string; name: string; lastSeen: number };
      if (typeof player.id !== 'string' || typeof player.lastSeen !== 'number') continue;
      const reference = database.ref('sims_saves/' + player.id);
      const stored = (await reference.get()).val();
      const save = record(stored) ? stored : { savedAt: now, moneyLevel: 0, gameMinutes: 0 };
      const deadAt = player.lastSeen + 72 * 3600000;
      await reference.update({ ...(!record(stored) ? save : {}), dead: true, deadAt });
      const grave: Record<string, unknown> = {
        name: player.name,
        deadAt,
        days: Math.floor((Number(save.gameMinutes) || 0) / 1440) + 1,
      };
      if (typeof save.bornAt === 'number') grave.lived = Math.max(0, deadAt - save.bornAt);
      if (typeof save.epitaph === 'string') grave.epitaph = save.epitaph.slice(0, 60);
      await database.ref('sims_graveyard/' + player.id).update(grave);
      await database.ref('sims_leaderboard/' + player.id).remove();
      await database.ref('sims_online_players/' + player.id).remove();
      await database
        .ref('sims_rooms_state/' + roomIndex + '/pendingDeath')
        .transaction((value) => (record(value) && value.id === player.id ? null : undefined));
    }
  const chat = (await database.ref('sims_chat').get()).val();
  if (record(chat)) {
    const oldKeys = Object.keys(chat).sort().slice(0, -500);
    if (oldKeys.length)
      await database.ref('sims_chat').update(Object.fromEntries(oldKeys.map((key) => [key, null])));
  }
  // sala giochi: le partite più vecchie di un giorno si cancellano
  const games = (await database.ref('sims_games').get()).val();
  if (record(games)) {
    const old = Object.entries(games)
      .filter(([, g]) => !record(g) || !(typeof g.t === 'number' && now - g.t < 24 * 3600000))
      .map(([key]) => key);
    if (old.length)
      await database.ref('sims_games').update(Object.fromEntries(old.map((key) => [key, null])));
  }
  // bacheca dei pettegolezzi: si tengono solo i fatti più recenti
  const gossip = (await database.ref('sims_gossip').get()).val();
  if (record(gossip)) {
    const oldKeys = Object.keys(gossip).sort().slice(0, -200);
    if (oldKeys.length)
      await database
        .ref('sims_gossip')
        .update(Object.fromEntries(oldKeys.map((key) => [key, null])));
  }
}

// ---------------------------------------------------------------- avviso prima della morte

/** Dopo 80 ore senza entrare il personaggio muore: l'avviso parte 12 ore prima. */
export const DEATH_AFTER_MS = 80 * 3600000;
export const WARN_BEFORE_MS = 12 * 3600000;
export const GAME_URL = 'https://tomm4so00.github.io/casadolcecasa/';

export type PushResult = 'sent' | 'gone' | 'error';
export type PushSender = (
  token: string,
  message: { title: string; body: string; link: string; tag: string },
) => Promise<PushResult>;

/** Testo dell'avviso, con le ore che restano prima della morte. */
export function deathWarningText(name: string, lastSeen: number, now: number) {
  const hours = Math.max(1, Math.round((lastSeen + DEATH_AFTER_MS - now) / 3600000));
  return {
    title: `⚠️ ${name} sta per morire!`,
    body: `Non entri in Casa dolce casa da più di 3 giorni. Entra entro ${hours} ${hours === 1 ? 'ora' : 'ore'}, altrimenti il tuo personaggio morirà.`,
  };
}

/**
 * Manda l'avviso sul telefono a chi sta per morire per assenza. Ogni assenza viene avvisata una
 * volta sola (warnedFor = lastSeen); i dispositivi non più validi vengono tolti.
 * Restituisce quanti avvisi sono partiti.
 */
export async function sendDeathWarnings(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const [rooms, accounts] = await Promise.all([
    database.ref('sims_rooms_state').get(),
    database.ref('sims_accounts').get(),
  ]);
  const linked = new Set(
    record(accounts.val())
      ? Object.values(accounts.val() as Record<string, unknown>).flatMap((a) =>
          record(a) && typeof a.playerId === 'string' ? [a.playerId] : [],
        )
      : [],
  );
  const roomList = rooms.val();
  if (!record(roomList)) return 0;
  let sent = 0;
  for (const room of Object.values(roomList)) {
    if (!record(room) || room.pendingDeath) continue;
    const { ownerId, lastSeen } = room;
    if (typeof ownerId !== 'string' || !linked.has(ownerId) || typeof lastSeen !== 'number')
      continue;
    const away = now - lastSeen;
    if (away < DEATH_AFTER_MS - WARN_BEFORE_MS || away >= DEATH_AFTER_MS) continue;
    const pushRef = database.ref('sims_push/' + ownerId);
    const push = (await pushRef.get()).val();
    if (!record(push) || push.warnedFor === lastSeen || !record(push.tokens)) continue;
    const name = typeof room.owner === 'string' ? room.owner : 'Il tuo personaggio';
    const text = deathWarningText(name, lastSeen, now);
    for (const [key, entry] of Object.entries(push.tokens)) {
      if (!record(entry) || typeof entry.token !== 'string') continue;
      const result = await send(entry.token, { ...text, link: GAME_URL, tag: 'sims-death' });
      if (result === 'sent') sent++;
      if (result === 'gone') await database.ref(`sims_push/${ownerId}/tokens/${key}`).remove();
    }
    await pushRef.update({ warnedFor: lastSeen });
  }
  return sent;
}

// ---------------------------------------------------------------- animali che stanno per morire

/**
 * Avvisa sul telefono chi ha un animale che sta per morire di fame (nelle ultime 6 ore) e non
 * sta giocando in questo momento (chi gioca riceve l'avviso nel gioco). Ogni pericolo viene
 * avvisato una volta sola: in sims_push/<id>/petWarned/<animale> resta l'ora prevista della morte.
 * Restituisce quanti avvisi sono partiti.
 */
export async function sendPetWarnings(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const saves = (await database.ref('sims_saves').get()).val();
  if (!record(saves)) return 0;
  let sent = 0;
  for (const [playerId, save] of Object.entries(saves)) {
    if (!record(save) || save.dead || !record(save.pets)) continue;
    // chi ha salvato negli ultimi minuti sta giocando: lo avvisa il gioco stesso
    if (typeof save.savedAt === 'number' && now - save.savedAt < 10 * 60000) continue;
    const pets = decodePets(save.pets);
    const dying = PET_KINDS.filter((k) => {
      const p = pets[k];
      if (!p) return false;
      const left = petDiesAt(p, PET_HUNGER_DEPLETION_SEC) - now;
      return left > 0 && left <= PET_DYING_WARN_MS;
    });
    if (!dying.length) continue;
    const pushRef = database.ref('sims_push/' + playerId);
    const push = (await pushRef.get()).val();
    if (!record(push) || !record(push.tokens)) continue;
    const warned = record(push.petWarned) ? push.petWarned : {};
    for (const kind of dying) {
      const diesAt = Math.round(petDiesAt(pets[kind]!, PET_HUNGER_DEPLETION_SEC));
      if (warned[kind] === diesAt) continue;
      const text = petWarningText(kind, diesAt, now);
      for (const [key, entry] of Object.entries(push.tokens)) {
        if (!record(entry) || typeof entry.token !== 'string') continue;
        const result = await send(entry.token, {
          ...text,
          link: GAME_URL,
          tag: 'sims-pet-' + kind,
        });
        if (result === 'sent') sent++;
        if (result === 'gone') await database.ref(`sims_push/${playerId}/tokens/${key}`).remove();
      }
      await database.ref(`sims_push/${playerId}/petWarned`).update({ [kind]: diesAt });
    }
  }
  return sent;
}

/** Testo dell'avviso per l'animale, con le ore che restano. */
export function petWarningText(kind: PetKind, diesAt: number, now: number) {
  const info = PETS[kind];
  const hours = Math.max(1, Math.round((diesAt - now) / 3600000));
  return {
    title: `🆘 Il tuo ${info.name} ${info.emoji} sta per morire!`,
    body: `Non mangia da troppo tempo. Entra in Casa dolce casa e dagli da mangiare entro ${hours} ${hours === 1 ? 'ora' : 'ore'}.`,
  };
}

// ---------------------------------------------------------------- razzo quasi pronto

/** Soglie del razzo (come nel gioco: project-rules.ts). */
export const ROCKET_GOAL = 15000;
export const ROCKET_NOTIFY_AT = 14000;

/**
 * Quando i giocatori arrivano a 14.000 € avvisa tutti sul telefono: manca poco e, a 15.000 €,
 * qualcuno potrà premere il pulsante rosso per lanciare il razzo. Succede una volta sola.
 * Restituisce quanti avvisi sono partiti (-1 se non era il momento di avvisare).
 */
export async function notifyRocketAlmostReady(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const current = (await database.ref('sims_projects/rocket').get()).val();
  if (!record(current) || current.notified || current.launchAt) return -1;
  const funded = Number(current.funded) || 0;
  if (funded < ROCKET_NOTIFY_AT) return -1;
  const result = await database
    .ref('sims_projects/rocket/notified')
    .transaction((value) => (value ? undefined : now));
  if (!result.committed) return -1;
  const left = ROCKET_GOAL - funded;
  const message =
    left > 0
      ? {
          title: '🚀 Il razzo è quasi pronto!',
          body: `Mancano solo ${left.toLocaleString('it-IT')} € per completare il razzo. Al traguardo si potrà premere il pulsante rosso per lanciarlo: entra in Casa dolce casa!`,
        }
      : {
          title: '🚀 Il razzo è pronto!',
          body: 'Il razzo è completo: entra in Casa dolce casa, vai nella zona esterna del laboratorio ingegneristico e premi il pulsante rosso per lanciarlo!',
        };
  const everyone = (await database.ref('sims_push').get()).val();
  if (!record(everyone)) return 0;
  let sent = 0;
  for (const [pid, push] of Object.entries(everyone)) {
    if (!record(push) || !record(push.tokens)) continue;
    for (const [key, entry] of Object.entries(push.tokens)) {
      if (!record(entry) || typeof entry.token !== 'string') continue;
      const res = await send(entry.token, { ...message, link: GAME_URL, tag: 'sims-rocket' });
      if (res === 'sent') sent++;
      if (res === 'gone') await database.ref(`sims_push/${pid}/tokens/${key}`).remove();
    }
  }
  return sent;
}

// ---------------------------------------------------------------- offerte per l'edizione limitata

/** Testo della notifica per un'offerta ricevuta (come nel gioco: limited-rules.ts). */
export function limitedOfferText(fromName: string, amount: number, name: string) {
  return {
    title: '💎 Hai ricevuto un’offerta!',
    body: `${fromName} ti offre ${amount.toLocaleString('it-IT')} € per ${name}. Entra in Casa dolce casa per accettare o rifiutare.`,
  };
}

/**
 * Avvisa sul telefono chi ha ricevuto un'offerta per un oggetto in edizione limitata e non sta
 * giocando (chi gioca la vede nel gioco). Ogni offerta si avvisa una volta sola: le resta
 * `notified`. Le offerte non scadono: restano finché il proprietario non risponde.
 * Restituisce quanti avvisi sono partiti.
 */
export async function notifyLimitedOffers(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const all = (await database.ref('sims_ltd_offers').get()).val();
  if (!record(all)) return 0;
  let sent = 0;
  for (const [owner, box] of Object.entries(all)) {
    if (!record(box)) continue;
    const pending = Object.entries(box).filter(([, o]) => record(o) && o.notified !== true);
    if (!pending.length) continue;
    // chi ha salvato negli ultimi minuti sta giocando: l'offerta gli compare nel gioco
    const savedAt = (await database.ref(`sims_saves/${owner}/savedAt`).get()).val();
    if (typeof savedAt === 'number' && now - savedAt < 10 * 60000) continue;
    const push = (await database.ref('sims_push/' + owner).get()).val();
    for (const [id, raw] of pending) {
      const o = raw as Record<string, unknown>;
      const text = limitedOfferText(
        typeof o.fromName === 'string' ? o.fromName : 'Un giocatore',
        Number(o.amt) || 0,
        typeof o.name === 'string' ? o.name : 'un oggetto in edizione limitata',
      );
      if (record(push) && record(push.tokens))
        for (const [key, entry] of Object.entries(push.tokens)) {
          if (!record(entry) || typeof entry.token !== 'string') continue;
          const result = await send(entry.token, {
            ...text,
            link: GAME_URL,
            tag: 'sims-offer-' + id,
          });
          if (result === 'sent') sent++;
          if (result === 'gone') await database.ref(`sims_push/${owner}/tokens/${key}`).remove();
        }
      await database.ref(`sims_ltd_offers/${owner}/${id}`).update({ notified: true });
    }
  }
  return sent;
}

/** Cancella i giorni di attività che non servono più alla borsa (più vecchi di ACTIVITY_DAYS). */
export async function cleanOldActivity(
  database: MaintenanceDatabase,
  now: number,
): Promise<number> {
  const oldest = dayOf(now) - ACTIVITY_DAYS + 1;
  const days = (await database.ref('sims_activity').get()).val();
  if (!record(days)) return 0;
  const stale = Object.keys(days).filter((day) => !/^\d+$/.test(day) || Number(day) < oldest);
  for (const day of stale) await database.ref('sims_activity/' + day).remove();
  return stale.length;
}

/** Massimo che può stare in una cassaforte (regole del database). */
const VAULT_MAX = 1_000_000;

/**
 * Attività tolte dalla borsa: chi ci aveva investito riceve in cassaforte il valore delle sue quote
 * all'ultima quotazione (senza commissione; se la quotazione manca, quanto aveva versato) e un
 * avviso. Le quote spariscono dalla stanza, quindi ogni giocatore viene pagato una volta sola.
 * Si lavora una stanza alla volta: una stanza con dati non validi non blocca le altre.
 */
export async function retireBusinesses(
  database: MaintenanceDatabase,
  now: number,
): Promise<number> {
  const retired = Object.keys(RETIRED_BUSINESSES);
  if (!retired.length) return 0;
  const market = (await database.ref('sims_market').get()).val();
  const quotes = record(market) && record(market.quotes) ? market.quotes : {};
  const lastPrice = (id: string): number => {
    const q = quotes[id];
    const p = record(q) ? Number(q.price) : 0;
    return Number.isFinite(p) && p > 0 ? p : 0;
  };
  const all = (await database.ref('sims_rooms_state').get()).val();
  if (!record(all)) return 0;
  const holds = (room: unknown): boolean =>
    record(room) &&
    record(room.economy) &&
    record(room.economy.invest) &&
    retired.some(
      (biz) => (room.economy as { invest: Record<string, unknown> }).invest[biz] !== undefined,
    );
  let refunded = 0;
  for (const [index, room] of Object.entries(all)) {
    if (!holds(room)) continue;
    let paid: { player: string; biz: string; amount: number }[] = [];
    try {
      const result = await database.ref('sims_rooms_state/' + index).transaction((value) => {
        paid = [];
        if (!holds(value)) return undefined;
        const next = structuredClone(value) as Record<string, unknown>;
        const invest = (next.economy as { invest: Record<string, unknown> }).invest;
        let vault = Number(next.vaultMoney);
        if (!Number.isSafeInteger(vault)) vault = 0;
        for (const biz of retired) {
          const holding = invest[biz];
          if (holding === undefined) continue;
          const units = record(holding) ? Number(holding.units) || 0 : 0;
          const cost = record(holding) ? Number(holding.cost) || 0 : 0;
          const price = lastPrice(biz);
          const amount = Math.max(0, Math.floor(price > 0 ? units * price : cost));
          // la cassaforte è piena: le quote restano dove sono, si riprova al prossimo giro
          if (vault + amount > VAULT_MAX) continue;
          delete invest[biz];
          vault += amount;
          if (amount >= 1 && typeof next.ownerId === 'string')
            paid.push({ player: next.ownerId, biz, amount });
        }
        next.vaultMoney = vault;
        return next;
      });
      if (!result.committed) continue;
    } catch (error) {
      console.log(
        'Retired business refund skipped for a room:',
        (error as { code?: string }).code || 'unknown error',
      );
      continue;
    }
    refunded += paid.length;
    for (const p of paid) {
      const key = now.toString(36) + Math.random().toString(36).slice(2, 6);
      try {
        await database.ref(`sims_interactions/${p.player}`).update({
          [key]: {
            type: 'bizRetired',
            from: 'borsa',
            fromName: 'Borsa',
            t: now,
            biz: p.biz,
            amt: Math.min(p.amount, 1_000_000),
          },
        });
      } catch {
        // i soldi sono già in cassaforte: l'avviso è solo una cortesia
      }
    }
  }
  return refunded;
}
