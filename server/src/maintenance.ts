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
