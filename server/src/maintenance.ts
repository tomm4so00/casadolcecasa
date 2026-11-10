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
import { graveFromSave, releaseRoomsOf } from '../../shared/death-rules.js';
import { type CryoPass, awakeMs, decodeCryo, realTimeAfterAwake } from '../../shared/cryo-rules.js';
import { ACTIVE_MARGIN_MS, absentDeath } from '../../src/game/absent-death-rules.js';
import { ABANDON_DAYS, ABANDON_MS } from '../../src/game/autoplay-rules.js';
import { encodeDeathCauses } from '../../src/game/death-cause-rules.js';
import { announceRaids } from './street.js';
import { dayNumber } from '../../src/game/game-clock.js';
import {
  LEGACY_WORLD,
  type WorldNode,
  countFree,
  isWorldCode,
  releaseExtraRooms,
  worldIsEmpty,
  worldNodePath,
} from '../../shared/worlds.js';

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
  on?(event: 'value', callback: (snapshot: Snapshot) => void): unknown;
  off?(event: 'value', callback?: (snapshot: Snapshot) => void): void;
  once?(event: 'value'): Promise<Snapshot>;
}
export interface MaintenanceDatabase {
  ref(path: string): Reference;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

/**
 * I pass di criogenesi, per codice del personaggio. Il pass è dell'account (sims_cryo/<uid>):
 * vale per il personaggio che l'account ha adesso (sims_accounts/<uid>/playerId).
 */
export async function cryoByPlayer(database: MaintenanceDatabase): Promise<Map<string, CryoPass>> {
  const passes = (await database.ref('sims_cryo').get()).val();
  const result = new Map<string, CryoPass>();
  if (!record(passes)) return result;
  const accounts = (await database.ref('sims_accounts').get()).val();
  if (!record(accounts)) return result;
  for (const [uid, value] of Object.entries(passes)) {
    const pass = decodeCryo(value);
    const account = accounts[uid];
    if (pass && record(account) && typeof account.playerId === 'string')
      result.set(account.playerId, pass);
  }
  return result;
}

/**
 * Transazione con i dati veri fin dal primo giro. Se nessuno è in ascolto, Firebase chiama
 * `update` la prima volta con null (i dati non li ha ancora in memoria): rispondendo "nessuna
 * modifica", come fa chi trova null, la transazione finisce lì senza aver cambiato niente e senza
 * errori. Per questo le stanze dei morti non si liberavano. Come per la borsa (index.ts), si resta
 * in ascolto mentre si scrive.
 */
export async function liveTransaction(
  reference: Reference,
  update: (value: unknown) => unknown,
): Promise<{ committed: boolean; snapshot: Snapshot }> {
  const keep = () => {};
  reference.on?.('value', keep);
  try {
    await (reference.once ? reference.once('value') : reference.get());
    return await reference.transaction(update);
  } finally {
    reference.off?.('value', keep);
  }
}

/** Tutti i mondi: quello di sempre e quelli dell'elenco (sims_worlds). */
export async function worldIds(database: MaintenanceDatabase): Promise<string[]> {
  const index = (await database.ref('sims_worlds').get()).val();
  const ids = new Set([LEGACY_WORLD]);
  if (record(index)) for (const code of Object.keys(index)) if (isWorldCode(code)) ids.add(code);
  return [...ids];
}

/**
 * Morti per assenza e per salute a zero, in ogni mondo: se ne occupa il server, non un altro
 * giocatore. Valgono per tutti, anche per i personaggi di prima dell'accesso con Google non
 * ancora collegati. Alla fine si cancellano i mondi rimasti senza nessuno.
 */
export async function maintainGame(database: MaintenanceDatabase, now: number): Promise<void> {
  // il tempo passato in criogenesi non conta per le 80 ore di assenza
  const cryo = await cryoByPlayer(database);
  for (const world of await worldIds(database)) {
    if (world === LEGACY_WORLD) {
      await maintainWorld(database, now, world, cryo);
      continue;
    }
    // un mondo con dati strani non blocca gli altri
    try {
      await maintainWorld(database, now, world, cryo);
    } catch (error) {
      console.log(`World ${world} skipped:`, (error as { code?: string }).code || String(error));
    }
  }
  const removed = await removeEmptyWorlds(database, now);
  if (removed.length) console.log(`Empty worlds removed: ${removed.join(', ')}`);
}

/** Morti, lapidi, stanze liberate e pulizie di un mondo. */
export async function maintainWorld(
  database: MaintenanceDatabase,
  now: number,
  world: string = LEGACY_WORLD,
  cryo: Map<string, CryoPass> = new Map(),
): Promise<void> {
  const p = (node: WorldNode) => worldNodePath(world, node);
  const rooms = database.ref(p('rooms_state'));
  let expired: { id: string; name: string; lastSeen: number }[] = [];
  const result = await liveTransaction(rooms, (value) => {
    expired = [];
    if (!record(value)) return undefined;
    const next = structuredClone(value);
    for (const [key, room] of Object.entries(next)) {
      if (
        !record(room) ||
        room.pendingDeath ||
        typeof room.ownerId !== 'string' ||
        typeof room.lastSeen !== 'number' ||
        awakeMs(cryo.get(room.ownerId) ?? null, room.lastSeen, now) <= DEATH_AFTER_MS
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
      const deadAt = realTimeAfterAwake(cryo.get(player.id) ?? null, player.lastSeen, ABANDON_MS);
      await reference.update({
        ...(!record(stored) ? save : {}),
        dead: true,
        deadAt,
        deathCause: encodeDeathCauses(['abandoned']),
      });
      const grave: Record<string, unknown> = {
        name: player.name,
        deadAt,
        days: Math.floor((Number(save.gameMinutes) || 0) / 1440) + 1,
      };
      if (typeof save.bornAt === 'number') grave.lived = Math.max(0, deadAt - save.bornAt);
      if (typeof save.epitaph === 'string') grave.epitaph = save.epitaph.slice(0, 60);
      await database.ref(p('graveyard') + '/' + player.id).update(grave);
      await removeFromBoards(database, world, player.id);
      await database.ref(p('online_players') + '/' + player.id).remove();
      await liveTransaction(
        database.ref(p('rooms_state') + '/' + roomIndex + '/pendingDeath'),
        (value) => (record(value) && value.id === player.id ? null : undefined),
      );
    }
  await markAbsentDeaths(database, now, cryo, world);
  await tidyDeadPlayers(database, now, world);
  // retate: annuncio nei pettegolezzi (un errore qui non blocca il resto del mondo)
  try {
    await announceRaids(database, now, world);
  } catch (error) {
    console.log(
      `World ${world}: raid gossip skipped:`,
      (error as { code?: string }).code || String(error),
    );
  }
  // una stanza per giocatore: quelle in più tornano libere (le regole non possono contarle)
  let freed = 0;
  const fixed = await liveTransaction(rooms, (value) => {
    const r = releaseExtraRooms(value);
    freed = r ? r.freed : 0;
    return r ? r.rooms : undefined;
  });
  if (freed) console.log(`World ${world}: extra rooms released: ${freed}`);
  // i posti liberi nell'elenco li scrive il gioco: qui si rimettono quelli veri
  const index = database.ref('sims_worlds/' + world);
  const entry = (await index.get()).val();
  if (record(entry) || world === LEGACY_WORLD)
    await index.update({
      free: countFree(fixed.snapshot.val() as Record<string, never> | null),
      ...(record(entry) ? {} : { createdAt: 0 }),
    });
  const chat = (await database.ref(p('chat')).get()).val();
  if (record(chat)) {
    const oldKeys = Object.keys(chat).sort().slice(0, -500);
    if (oldKeys.length)
      await database.ref(p('chat')).update(Object.fromEntries(oldKeys.map((key) => [key, null])));
  }
  // sala giochi: le partite più vecchie di un giorno si cancellano
  const games = (await database.ref(p('games')).get()).val();
  if (record(games)) {
    const old = Object.entries(games)
      .filter(([, g]) => !record(g) || !(typeof g.t === 'number' && now - g.t < 24 * 3600000))
      .map(([key]) => key);
    if (old.length)
      await database.ref(p('games')).update(Object.fromEntries(old.map((key) => [key, null])));
  }
  // bacheca dei pettegolezzi: si tengono solo i fatti più recenti
  const gossip = (await database.ref(p('gossip')).get()).val();
  if (record(gossip)) {
    const oldKeys = Object.keys(gossip).sort().slice(0, -200);
    if (oldKeys.length)
      await database.ref(p('gossip')).update(Object.fromEntries(oldKeys.map((key) => [key, null])));
  }
}

/** Chi muore esce dalla classifica del suo mondo e da quella di tutti i mondi. */
async function removeFromBoards(database: MaintenanceDatabase, world: string, id: string) {
  await database.ref(worldNodePath(world, 'leaderboard') + '/' + id).remove();
  await database.ref('sims_leaderboard_global/' + id).remove();
}

/** Dopo quanto tempo un mondo appena creato e rimasto vuoto si può cancellare. */
export const EMPTY_WORLD_GRACE_MS = 3600000;

/**
 * Mondi senza più nessuno (tutti morti, andati altrove o account cancellati): si cancellano
 * interi, stanze, chat, cimitero e la voce nell'elenco. Il mondo di sempre resta.
 * Restituisce i codici dei mondi cancellati.
 */
export async function removeEmptyWorlds(
  database: MaintenanceDatabase,
  now: number,
): Promise<string[]> {
  const index = (await database.ref('sims_worlds').get()).val();
  if (!record(index)) return [];
  const removed: string[] = [];
  for (const [code, entry] of Object.entries(index)) {
    if (code === LEGACY_WORLD || !isWorldCode(code)) continue;
    const createdAt = record(entry) ? Number(entry.createdAt) || 0 : 0;
    const rooms = (await database.ref(worldNodePath(code, 'rooms_state')).get()).val();
    if (!worldIsEmpty(rooms, createdAt, now, EMPTY_WORLD_GRACE_MS)) continue;
    await database.ref('worlds/' + code).remove();
    await database.ref('sims_worlds/' + code).remove();
    removed.push(code);
  }
  return removed;
}

/**
 * Chi non sta giocando ma con i bisogni andati a zero sarebbe morto mentre era via: si segna morto
 * nel momento esatto in cui la salute è arrivata a zero (lo stesso calcolo che il gioco farebbe al
 * rientro). Si guardano tutti quelli che hanno lasciato una traccia: una stanza, il personaggio
 * visibile agli altri (anche svenuto a terra) o un posto in classifica. Lapide e stanza le
 * sistema poi tidyDeadPlayers.
 */
export async function markAbsentDeaths(
  database: MaintenanceDatabase,
  now: number,
  cryo: Map<string, CryoPass> = new Map(),
  world: string = LEGACY_WORLD,
): Promise<void> {
  const read = async (path: string) => {
    const v = (await database.ref(path).get()).val();
    return record(v) ? v : {};
  };
  const p = (node: WorldNode) => worldNodePath(world, node);
  const rooms = await read(p('rooms_state'));
  const online = await read(p('online_players'));
  const board = await read(p('leaderboard'));
  const roomOf = new Map<string, Record<string, unknown>>();
  for (const room of Object.values(rooms))
    if (record(room) && typeof room.ownerId === 'string' && !room.pendingDeath)
      roomOf.set(room.ownerId, room);
  const ids = new Set([...roomOf.keys(), ...Object.keys(online), ...Object.keys(board)]);
  for (const id of ids) {
    const room = roomOf.get(id);
    // si è fatto vedere da poco: se è in gioco, ci pensa il suo gioco
    if (room && typeof room.lastSeen === 'number' && now - room.lastSeen < ACTIVE_MARGIN_MS)
      continue;
    const here = online[id];
    if (record(here)) {
      // offline: da quando è uscito; online: l'ultimo invio della posizione (t)
      const at = here.offline ? here.offAt : here.t;
      if (typeof at !== 'number' || now - at < ACTIVE_MARGIN_MS) continue;
    }
    const save = (await database.ref('sims_saves/' + id).get()).val();
    if (!record(save) || save.dead === true) continue;
    if (typeof save.savedAt !== 'number' || now - save.savedAt < ACTIVE_MARGIN_MS) continue;
    const economy = room && record(room.economy) ? room.economy : {};
    const furniture = record(economy.ownedFurniture)
      ? (economy.ownedFurniture as Record<string, boolean>)
      : record(save.ownedFurniture)
        ? (save.ownedFurniture as Record<string, boolean>)
        : {};
    const death = absentDeath(save, furniture, now, undefined, cryo.get(id) ?? null);
    if (!death) continue;
    await database.ref('sims_saves/' + id).update({
      dead: true,
      deadAt: death.deadAt,
      healthLevel: 0,
      gameMinutes: death.gameMinutes,
      deathCause: encodeDeathCauses(death.causes),
    });
    const shown = record(here) && typeof here.name === 'string' ? here.name : '';
    // la lapide con il giorno come lo conta il gioco
    await database.ref(p('graveyard') + '/' + id).update({
      ...graveFromSave(
        { ...save, deadAt: death.deadAt },
        room && typeof room.owner === 'string' ? room.owner : shown,
        now,
      ),
      days: dayNumber(death.gameMinutes, new Date(death.deadAt)),
    });
  }
}

/**
 * Chi è morto nel gioco (salvataggio con dead: true) ma ha ancora la stanza, il personaggio
 * visibile agli altri o un posto in classifica, oppure non ha la lapide: si sistema qui. Succede se
 * il telefono ha perso la rete proprio mentre il personaggio moriva.
 */
export async function tidyDeadPlayers(
  database: MaintenanceDatabase,
  now: number,
  world: string = LEGACY_WORLD,
): Promise<void> {
  const keysOf = async (path: string) => {
    const v = (await database.ref(path).get()).val();
    return record(v) ? v : {};
  };
  const p = (node: WorldNode) => worldNodePath(world, node);
  const rooms = await keysOf(p('rooms_state'));
  const online = await keysOf(p('online_players'));
  const board = await keysOf(p('leaderboard'));
  const ownerName = new Map<string, string>();
  for (const room of Object.values(rooms))
    if (record(room) && typeof room.ownerId === 'string')
      ownerName.set(room.ownerId, typeof room.owner === 'string' ? room.owner : '');
  const ids = new Set([...ownerName.keys(), ...Object.keys(online), ...Object.keys(board)]);
  for (const id of ids) {
    // si legge solo il segno di morte: i salvataggi interi sono grandi
    if ((await database.ref('sims_saves/' + id + '/dead').get()).val() !== true) continue;
    const save = (await database.ref('sims_saves/' + id).get()).val();
    const grave = (await database.ref(p('graveyard') + '/' + id).get()).val();
    if (!record(grave) || typeof grave.name !== 'string')
      await database
        .ref(p('graveyard') + '/' + id)
        .update({ ...graveFromSave(record(save) ? save : {}, ownerName.get(id) || '', now) });
    await removeFromBoards(database, world, id);
    await database.ref(p('online_players') + '/' + id).remove();
    if (ownerName.has(id))
      await liveTransaction(database.ref(p('rooms_state')), (value) =>
        record(value) ? (releaseRoomsOf(value, id) ?? undefined) : undefined,
      );
  }
}

// ---------------------------------------------------------------- avviso prima della morte

/**
 * Dopo ABANDON_DAYS giorni (più 8 ore di margine) senza entrare il personaggio muore: l'avviso
 * parte 12 ore prima.
 */
export const DEATH_AFTER_MS = ABANDON_MS + 8 * 3600000;
export const WARN_BEFORE_MS = 12 * 3600000;
export const GAME_URL = 'https://tomm4so00.github.io/casadolcecasa/';

export type PushResult = 'sent' | 'gone' | 'error';
export type PushSender = (
  token: string,
  message: { title: string; body: string; link: string; tag: string },
) => Promise<PushResult>;

/** Testo dell'avviso, con le ore che restano prima della morte (la criogenesi le allunga). */
export function deathWarningText(
  name: string,
  lastSeen: number,
  now: number,
  cryo: CryoPass | null = null,
) {
  const diesAt = realTimeAfterAwake(cryo, lastSeen, DEATH_AFTER_MS);
  const hours = Math.max(1, Math.round((diesAt - now) / 3600000));
  return {
    title: `⚠️ ${name} sta per morire!`,
    body: `Non entri in Casa dolce casa da più di ${ABANDON_DAYS} giorni. Entra entro ${hours} ${hours === 1 ? 'ora' : 'ore'}, altrimenti il tuo personaggio morirà.`,
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
  const accounts = await database.ref('sims_accounts').get();
  const linked = new Set(
    record(accounts.val())
      ? Object.values(accounts.val() as Record<string, unknown>).flatMap((a) =>
          record(a) && typeof a.playerId === 'string' ? [a.playerId] : [],
        )
      : [],
  );
  // le stanze di tutti i mondi
  const roomList: unknown[] = [];
  for (const world of await worldIds(database)) {
    const rooms = (await database.ref(worldNodePath(world, 'rooms_state')).get()).val();
    if (record(rooms)) roomList.push(...Object.values(rooms));
  }
  if (!roomList.length) return 0;
  const cryo = await cryoByPlayer(database);
  let sent = 0;
  for (const room of roomList) {
    if (!record(room) || room.pendingDeath) continue;
    const { ownerId, lastSeen } = room;
    if (typeof ownerId !== 'string' || !linked.has(ownerId) || typeof lastSeen !== 'number')
      continue;
    const pass = cryo.get(ownerId) ?? null;
    // in criogenesi il conto alla rovescia è fermo: conta solo il tempo fuori dalla capsula
    const away = awakeMs(pass, lastSeen, now);
    if (away < DEATH_AFTER_MS - WARN_BEFORE_MS || away >= DEATH_AFTER_MS) continue;
    const pushRef = database.ref('sims_push/' + ownerId);
    const push = (await pushRef.get()).val();
    if (!record(push) || push.warnedFor === lastSeen || !record(push.tokens)) continue;
    const name = typeof room.owner === 'string' ? room.owner : 'Il tuo personaggio';
    const text = deathWarningText(name, lastSeen, now, pass);
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
  const cryo = await cryoByPlayer(database);
  let sent = 0;
  for (const [playerId, save] of Object.entries(saves)) {
    if (!record(save) || save.dead || !record(save.pets)) continue;
    // chi ha salvato negli ultimi minuti sta giocando: lo avvisa il gioco stesso
    if (typeof save.savedAt === 'number' && now - save.savedAt < 10 * 60000) continue;
    const pets = decodePets(save.pets);
    // con il padrone in criogenesi l'animale non ha fame: la sua fine si sposta in avanti
    const pass = cryo.get(playerId) ?? null;
    const absentFrom = typeof save.savedAt === 'number' ? save.savedAt : now;
    const diesAtOf = (k: PetKind) => {
      const p = pets[k]!;
      return realTimeAfterAwake(
        pass,
        p.at,
        petDiesAt(p, PET_HUNGER_DEPLETION_SEC) - p.at,
        absentFrom,
      );
    };
    const dying = PET_KINDS.filter((k) => {
      if (!pets[k]) return false;
      const left = diesAtOf(k) - now;
      return left > 0 && left <= PET_DYING_WARN_MS;
    });
    if (!dying.length) continue;
    const pushRef = database.ref('sims_push/' + playerId);
    const push = (await pushRef.get()).val();
    if (!record(push) || !record(push.tokens)) continue;
    const warned = record(push.petWarned) ? push.petWarned : {};
    for (const kind of dying) {
      const diesAt = Math.round(diesAtOf(kind));
      if (warned[kind] === diesAt) continue;
      const text = petWarningText(kind, diesAt, now, pets[kind]?.name);
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
export function petWarningText(kind: PetKind, diesAt: number, now: number, name?: string) {
  const info = PETS[kind];
  const hours = Math.max(1, Math.round((diesAt - now) / 3600000));
  return {
    title: `🆘 ${name || 'Il tuo ' + info.name} ${info.emoji} sta per morire!`,
    body: `Non mangia da troppo tempo. Entra in Casa dolce casa e dagli da mangiare entro ${hours} ${hours === 1 ? 'ora' : 'ore'}.`,
  };
}

// ---------------------------------------------------------------- razzo quasi pronto

/** Soglie del razzo (come nel gioco: project-rules.ts). */
export const ROCKET_GOAL = 15000;
export const ROCKET_NOTIFY_AT = 14000;

/**
 * Quando i giocatori di un condominio arrivano a 14.000 Đ per il loro razzo, avvisa sul telefono
 * chi abita lì: manca poco e, a 15.000 Đ, qualcuno potrà premere il pulsante rosso per lanciarlo.
 * Succede una volta sola per razzo. Restituisce quanti avvisi sono partiti in tutti i mondi (-1
 * se in nessun mondo era il momento di avvisare).
 */
export async function notifyRocketAlmostReady(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  let total = -1;
  for (const world of await worldIds(database)) {
    const n = await notifyRocketInWorld(database, now, send, world);
    if (n >= 0) total = Math.max(0, total) + n;
  }
  return total;
}

async function notifyRocketInWorld(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
  world: string,
): Promise<number> {
  const rocket = worldNodePath(world, 'projects') + '/rocket';
  const current = (await database.ref(rocket).get()).val();
  if (!record(current) || current.notified || current.launchAt) return -1;
  const funded = Number(current.funded) || 0;
  if (funded < ROCKET_NOTIFY_AT) return -1;
  const result = await database
    .ref(rocket + '/notified')
    .transaction((value) => (value ? undefined : now));
  if (!result.committed) return -1;
  const left = ROCKET_GOAL - funded;
  const message =
    left > 0
      ? {
          title: '🚀 Il razzo è quasi pronto!',
          body: `Mancano solo ${left.toLocaleString('it-IT')} Đ per completare il razzo. Al traguardo si potrà premere il pulsante rosso per lanciarlo: entra in Casa dolce casa!`,
        }
      : {
          title: '🚀 Il razzo è pronto!',
          body: 'Il razzo è completo: entra in Casa dolce casa, vai nella zona esterna del laboratorio ingegneristico e premi il pulsante rosso per lanciarlo!',
        };
  // chi abita in questo condominio
  const rooms = (await database.ref(worldNodePath(world, 'rooms_state')).get()).val();
  const residents = new Set<string>();
  if (record(rooms))
    for (const room of Object.values(rooms))
      if (record(room) && typeof room.ownerId === 'string') residents.add(room.ownerId);
  let sent = 0;
  for (const pid of residents) {
    const push = (await database.ref('sims_push/' + pid).get()).val();
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
    body: `${fromName} ti offre ${amount.toLocaleString('it-IT')} Đ per ${name}. Entra in Casa dolce casa per accettare o rifiutare.`,
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
  const holds = (room: unknown): boolean =>
    record(room) &&
    record(room.economy) &&
    record(room.economy.invest) &&
    retired.some(
      (biz) => (room.economy as { invest: Record<string, unknown> }).invest[biz] !== undefined,
    );
  let refunded = 0;
  // le stanze di ogni mondo, una alla volta
  for (const world of await worldIds(database)) {
    const roomsPath = worldNodePath(world, 'rooms_state');
    const all = (await database.ref(roomsPath).get()).val();
    if (!record(all)) continue;
    for (const [index, room] of Object.entries(all)) {
      if (!holds(room)) continue;
      let paid: { player: string; biz: string; amount: number }[] = [];
      try {
        const result = await liveTransaction(database.ref(roomsPath + '/' + index), (value) => {
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
          await database.ref(`${worldNodePath(world, 'interactions')}/${p.player}`).update({
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
  }
  return refunded;
}
