// Cancellazione dell'account chiesta dal giocatore (profilo → Elimina account e dati).
// Il gioco scrive sims_deletions/<uid>; la manutenzione, a ogni giro, cancella tutto quello che
// appartiene a quell'account: tutti i suoi personaggi (anche delle vite precedenti e quelli
// recuperati con il codice), in ogni nodo del database, e infine l'account di accesso.
// Restano solo le ricevute degli acquisti (sims_cryo/<uid>): la legge chiede di tenerle 10 anni.
import { releaseRoomsOf } from '../../shared/death-rules.js';

interface Snapshot {
  val(): unknown;
}
interface Reference {
  get(): Promise<Snapshot>;
  update(value: Record<string, unknown>): Promise<void>;
  transaction(
    update: (value: unknown) => unknown,
  ): Promise<{ committed: boolean; snapshot: Snapshot }>;
  on?(event: 'value', callback: (snapshot: Snapshot) => void): unknown;
  off?(event: 'value', callback?: (snapshot: Snapshot) => void): void;
}
export interface DeletionDatabase {
  ref(path: string): Reference;
}

type Tree = Record<string, unknown>;
const record = (value: unknown): value is Tree => !!value && typeof value === 'object';
const entries = (value: unknown): [string, unknown][] =>
  record(value) ? Object.entries(value) : [];

/** I nodi da leggere per sapere cosa cancellare. */
export const DELETION_NODES = [
  'sims_accounts',
  'sims_legacy_claims',
  'sims_saves',
  'sims_activity',
  'sims_chat',
  'sims_gossip',
  'sims_painting_titles',
  'sims_games',
  'sims_limited',
  'sims_collect',
  'sims_ltd_offers',
  'sims_ltd_sent',
  'sims_interactions',
  'sims_projects',
  'sims_graveyard',
  'sims_rps',
  'sims_invites',
  'sims_invited',
  'sims_emails',
] as const;

/** I nodi in cui ogni giocatore ha una voce tutta sua, con il codice come chiave. */
const PER_PLAYER = [
  'sims_saves',
  'sims_sessions',
  'sims_online_players',
  'sims_leaderboard',
  'sims_graveyard',
  'sims_push',
  'sims_interactions',
  'sims_theft',
  'sims_ltd_offers',
  'sims_ltd_sent',
  'sims_rps',
  'sims_invites',
];

/**
 * Tutti i personaggi dell'account: quello attuale, quelli delle vite precedenti
 * (player_<uid>_r…) e quelli di prima dell'accesso con Google recuperati con il codice.
 */
export function accountPlayerIds(uid: string, data: Partial<Record<string, unknown>>): string[] {
  const ids = new Set<string>();
  const account = record(data.sims_accounts) ? data.sims_accounts[uid] : null;
  if (record(account) && typeof account.playerId === 'string') ids.add(account.playerId);
  const own = 'player_' + uid;
  for (const [pid] of entries(data.sims_saves))
    if (pid === own || pid.startsWith(own + '_r')) ids.add(pid);
  for (const [pid, owner] of entries(data.sims_legacy_claims)) if (owner === uid) ids.add(pid);
  ids.add(own);
  return [...ids];
}

/**
 * I percorsi da cancellare per l'account `uid`, letti i nodi di DELETION_NODES. Le stanze no:
 * si liberano con una transazione a parte (vedi deleteAccount).
 */
export function deletionPaths(uid: string, data: Partial<Record<string, unknown>>): string[] {
  const ids = new Set(accountPlayerIds(uid, data));
  const mine = (value: unknown) => typeof value === 'string' && ids.has(value);
  const paths = new Set<string>();
  const add = (path: string) => paths.add(path);

  for (const pid of ids) for (const node of PER_PLAYER) add(`${node}/${pid}`);
  for (const [pid, owner] of entries(data.sims_legacy_claims))
    if (owner === uid) add(`sims_legacy_claims/${pid}`);
  add(`sims_accounts/${uid}`);
  add(`sims_link_requests/${uid}`);
  add(`sims_invited/${uid}`);

  // contatori delle attività in borsa: giorno → attività → giocatore
  for (const [day, byBiz] of entries(data.sims_activity))
    for (const [biz, byPlayer] of entries(byBiz))
      for (const [pid] of entries(byPlayer))
        if (ids.has(pid)) add(`sims_activity/${day}/${biz}/${pid}`);
  // messaggi, pettegolezzi (scritti da lui o che parlano di lui), titoli dei quadri
  for (const [key, m] of entries(data.sims_chat))
    if (record(m) && mine(m.id)) add(`sims_chat/${key}`);
  for (const [key, g] of entries(data.sims_gossip)) {
    if (!record(g)) continue;
    const about = typeof g.about === 'string' ? g.about.split(',') : [];
    if (mine(g.by) || about.some((id) => ids.has(id))) add(`sims_gossip/${key}`);
  }
  for (const [key, t] of entries(data.sims_painting_titles))
    if (record(t) && mine(t.by)) add(`sims_painting_titles/${key}`);
  // partite in corso con lui
  for (const [key, g] of entries(data.sims_games))
    if (record(g) && (mine(g.a) || mine(g.b))) add(`sims_games/${key}`);
  for (const [key, g] of entries(data.sims_rps))
    if (record(g) && (mine(g.a) || mine(g.b))) add(`sims_rps/${key}`);
  // copie in edizione limitata e pezzi da collezione: tornano liberi; via le sue offerte
  for (const [item, copies] of entries(data.sims_limited))
    for (const [n, copy] of entries(copies)) {
      if (!record(copy)) continue;
      if (mine(copy.o)) add(`sims_limited/${item}/${n}`);
      else if (record(copy.sale) && mine(copy.sale.to)) add(`sims_limited/${item}/${n}/sale`);
    }
  const collect = record(data.sims_collect) ? data.sims_collect : {};
  for (const [item, piece] of entries(collect.owners)) {
    if (!record(piece)) continue;
    if (mine(piece.o)) add(`sims_collect/owners/${item}`);
    else if (record(piece.sale) && mine(piece.sale.to)) add(`sims_collect/owners/${item}/sale`);
  }
  for (const [owner, offers] of entries(data.sims_ltd_offers))
    for (const [id, o] of entries(offers))
      if (record(o) && mine(o.from)) add(`sims_ltd_offers/${owner}/${id}`);
  for (const [buyer, sent] of entries(data.sims_ltd_sent))
    for (const [id, s] of entries(sent))
      if (record(s) && mine(s.owner)) add(`sims_ltd_sent/${buyer}/${id}`);
  // messaggi e regali che ha mandato agli altri
  for (const [pid, inbox] of entries(data.sims_interactions))
    for (const [key, m] of entries(inbox))
      if (record(m) && mine(m.from)) add(`sims_interactions/${pid}/${key}`);
  // donazioni ai progetti comuni, visite alle lapidi degli altri
  for (const [project, p] of entries(data.sims_projects))
    for (const [pid] of entries(record(p) ? p.donors : null))
      if (ids.has(pid)) add(`sims_projects/${project}/donors/${pid}`);
  for (const [grave, g] of entries(data.sims_graveyard))
    for (const [pid] of entries(record(g) ? g.visitors : null))
      if (ids.has(pid)) add(`sims_graveyard/${grave}/visitors/${pid}`);
  // inviti: quello con cui è arrivato lui, e il suo nome nell'invito di chi ha invitato lui
  for (const [inviter, invited] of entries(data.sims_invites))
    if (record(invited) && uid in invited) add(`sims_invites/${inviter}/${uid}`);
  for (const [other, inviter] of entries(data.sims_invited))
    if (mine(inviter)) add(`sims_invited/${other}`);
  // la casella email occupata dall'account: si libera (l'email non resta salvata)
  for (const [key, owner] of entries(data.sims_emails))
    if (owner === uid) add(`sims_emails/${key}`);

  // Un percorso dentro uno già cancellato è inutile (e Firebase rifiuta i percorsi annidati).
  const sorted = [...paths].sort();
  return sorted.filter(
    (path) => !sorted.some((other) => other !== path && path.startsWith(other + '/')),
  );
}

/** Libera le stanze dei suoi personaggi e toglie i promemoria di morte che li riguardano. */
function releaseRooms(rooms: unknown, ids: Set<string>): unknown {
  if (!record(rooms) && !Array.isArray(rooms)) return undefined;
  let next: Record<string, unknown> | unknown[] = rooms as Record<string, unknown>;
  let changed = false;
  for (const id of ids) {
    const released: Record<string, unknown> | unknown[] | null = releaseRoomsOf(next, id);
    if (released) {
      next = released;
      changed = true;
    }
  }
  const list = (Array.isArray(next) ? [...next] : { ...next }) as Record<string, unknown>;
  for (const [key, room] of Object.entries(list))
    if (record(room) && record(room.pendingDeath) && ids.has(String(room.pendingDeath.id))) {
      const { pendingDeath: _gone, ...rest } = room;
      list[key] = rest;
      changed = true;
    }
  return changed ? list : undefined;
}

/**
 * Cancella un account. `deleteLogin` toglie l'accesso (Firebase Authentication): se fallisce,
 * la richiesta resta e il giro dopo riprova (i dati sono già cancellati, rifarlo non fa danni).
 */
export async function deleteAccount(
  database: DeletionDatabase,
  uid: string,
  deleteLogin: (uid: string) => Promise<void>,
): Promise<{ paths: number }> {
  const data: Record<string, unknown> = {};
  for (const node of DELETION_NODES) data[node] = (await database.ref(node).get()).val();
  const ids = new Set(accountPlayerIds(uid, data));
  const rooms = database.ref('sims_rooms_state');
  // in ascolto mentre si scrive: vedi liveTransaction in maintenance.ts
  const keep = () => {};
  rooms.on?.('value', keep);
  try {
    await rooms.get();
    await rooms.transaction((value) => releaseRooms(value, ids));
  } finally {
    rooms.off?.('value', keep);
  }
  const paths = deletionPaths(uid, data);
  if (paths.length) await database.ref('/').update(Object.fromEntries(paths.map((p) => [p, null])));
  await deleteLogin(uid);
  await database.ref('/').update({ [`sims_deletions/${uid}`]: null });
  return { paths: paths.length };
}

/** A ogni giro della manutenzione: esegue le richieste di cancellazione arrivate. */
export async function processDeletionRequests(
  database: DeletionDatabase,
  deleteLogin: (uid: string) => Promise<void>,
): Promise<number> {
  const requests = (await database.ref('sims_deletions').get()).val();
  let done = 0;
  for (const [uid] of entries(requests)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) continue;
    // un account che non si riesce a cancellare non ferma gli altri: riprova al giro dopo
    try {
      await deleteAccount(database, uid, deleteLogin);
      done++;
    } catch (error) {
      console.log('Account deletion retried next run:', String(error));
    }
  }
  return done;
}
