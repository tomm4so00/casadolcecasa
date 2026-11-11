// Cancellazione dell'account chiesta dal giocatore (profilo → Elimina account e dati).
// Il gioco scrive sims_deletions/<uid>; la manutenzione, a ogni giro, cancella tutto quello che
// appartiene a quell'account: tutti i suoi personaggi (anche delle vite precedenti e quelli
// recuperati con il codice), in ogni nodo del database, e infine l'account di accesso.
// Restano solo le ricevute degli acquisti (sims_cryo/<uid>): la legge chiede di tenerle 10 anni.
// Quello che la pagina condizioni.html promette di cancellare deve sparire tutto: lo controlla
// tests/deletion.test.ts, che cerca i codici dell'account in tutto il database.
import { releaseRoomsOf } from '../../shared/death-rules.js';
import { LEGACY_WORLD, WORLD_NODES, isWorldCode, worldNodePath } from '../../shared/worlds.js';

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
  'sims_auctions',
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
  'sims_arcade_records',
  'sims_arcade_global',
  'sims_arcade_board',
  'sims_arcade_top',
  // suggerimenti, assaggi lasciati agli altri, coppie, ladri bloccati, multe nate da sue denunce
  'sims_suggestions',
  'sims_gifts',
  'sims_couples',
  'sims_theft_blocks',
  'sims_fines',
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
  'sims_leaderboard_global',
  'sims_arcade_best',
  'sims_couples',
  'sims_trash',
  'sims_fines',
  // il PIN privato della cassaforte e quando ha creato l'ultimo mondo
  'sims_safe_pins',
  'sims_world_creators',
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
  add(`sims_arcade_runs/${uid}`);
  // i turni di lavoro (li scrive il Worker) e l'ora dell'ultimo suggerimento
  add(`sims_jobs/${uid}`);
  add(`sims_suggest_last/${uid}`);

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
  // aste: le sue si chiudono; altrove via le sue offerte e i suoi cuoricini
  for (const [id, a] of entries(data.sims_auctions)) {
    if (!record(a)) continue;
    if (mine(a.by)) {
      add(`sims_auctions/${id}`);
      continue;
    }
    if (record(a.bid) && mine(a.bid.by)) add(`sims_auctions/${id}/bid`);
    if (record(a.sold) && mine(a.sold.to)) add(`sims_auctions/${id}/sold`);
    for (const [pid] of entries(a.votes)) if (ids.has(pid)) add(`sims_auctions/${id}/votes/${pid}`);
  }
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
  // record del cabinato a suo nome (del condominio e mondiali): si liberano
  for (const node of ['sims_arcade_records', 'sims_arcade_global'] as const)
    for (const [g, r] of entries(data[node])) if (record(r) && mine(r.pid)) add(`${node}/${g}`);
  // le sue voci nelle classifiche del cabinato (del condominio e del mondo)
  for (const node of ['sims_arcade_board', 'sims_arcade_top'] as const)
    for (const [g, list] of entries(data[node]))
      for (const [pid] of entries(list)) if (ids.has(pid)) add(`${node}/${g}/${pid}`);
  // la casella email occupata dall'account: si libera (l'email non resta salvata)
  for (const [key, owner] of entries(data.sims_emails))
    if (owner === uid) add(`sims_emails/${key}`);
  // i suggerimenti mandati con l'account (le copie già arrivate su Telegram restano là)
  for (const [key, s] of entries(data.sims_suggestions))
    if (record(s) && s.uid === uid) add(`sims_suggestions/${key}`);
  // e quello che parla dei suoi personaggi nelle cose degli altri
  for (const path of referencePaths(ids, data)) add(path);

  // Un percorso dentro uno già cancellato è inutile (e Firebase rifiuta i percorsi annidati).
  const sorted = [...paths].sort();
  return sorted.filter(
    (path) => !sorted.some((other) => other !== path && path.startsWith(other + '/')),
  );
}

/**
 * Quello che parla dei personaggi `ids` nei nodi degli altri: suggerimenti, assaggi lasciati,
 * coppie, blocchi col pugno, multe nate da loro denunce. Serve alla cancellazione e alla pulizia
 * dei resti (cleanupLeftoversOnce).
 */
export function referencePaths(ids: Set<string>, data: Partial<Record<string, unknown>>): string[] {
  const mine = (value: unknown) => typeof value === 'string' && ids.has(value);
  const paths: string[] = [];
  // i suggerimenti mandati allo staff
  for (const [key, s] of entries(data.sims_suggestions))
    if (record(s) && mine(s.pid)) paths.push(`sims_suggestions/${key}`);
  // gli assaggi di benvenuto lasciati nelle stanze degli altri, con il nome
  for (const [room, byGiver] of entries(data.sims_gifts))
    for (const [pid] of entries(byGiver)) if (ids.has(pid)) paths.push(`sims_gifts/${room}/${pid}`);
  // la metà della coppia scritta dall'altro: l'altro torna single
  for (const [pid, c] of entries(data.sims_couples))
    if (record(c) && mine(c.with)) paths.push(`sims_couples/${pid}`);
  // i blocchi col pugno: quando era lui il ladro e quando era lui a bloccare
  for (const [room, thieves] of entries(data.sims_theft_blocks))
    for (const [thief, b] of entries(thieves))
      if (ids.has(thief) || (record(b) && mine(b.by)))
        paths.push(`sims_theft_blocks/${room}/${thief}`);
  // le multe degli altri nate da sue denunce: si chiudono (la sua metà non può più averla)
  for (const [pid, fines] of entries(data.sims_fines))
    for (const [id, f] of entries(fines))
      if (record(f) && mine(f.to)) paths.push(`sims_fines/${pid}/${id}`);
  return paths;
}

/** I nodi di un mondo con il nome del mondo di sempre (sims_chat…): così vale lo stesso calcolo. */
const WORLD_PREFIX = new RegExp(`^sims_(${WORLD_NODES.join('|')})(?=/|$)`);

/**
 * I mondi (oltre a quello di sempre) in cui abitano i personaggi dell'account, letti dai loro
 * salvataggi.
 */
export function accountWorlds(ids: Iterable<string>, saves: unknown): string[] {
  const worlds = new Set<string>();
  for (const id of ids) {
    const save = record(saves) ? saves[id] : null;
    const world = record(save) ? save.worldId : null;
    if (typeof world === 'string' && world !== LEGACY_WORLD && isWorldCode(world))
      worlds.add(world);
  }
  return [...worlds];
}

/**
 * I percorsi da cancellare dentro un mondo: `data` ha i nodi di quel mondo con il nome di sempre
 * (sims_chat…); qui si tengono solo quelli del mondo, spostati sotto /worlds/{codice}.
 */
export function worldDeletionPaths(
  uid: string,
  data: Partial<Record<string, unknown>>,
  world: string,
): string[] {
  return deletionPaths(uid, data)
    .filter((path) => WORLD_PREFIX.test(path))
    .map((path) =>
      path.replace(WORLD_PREFIX, (_m, node) =>
        worldNodePath(world, node as (typeof WORLD_NODES)[number]),
      ),
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
  for (const [key, room] of Object.entries(list)) {
    if (record(room) && record(room.pendingDeath) && ids.has(String(room.pendingDeath.id))) {
      const { pendingDeath: _gone, ...rest } = room;
      list[key] = rest;
      changed = true;
    }
    // il segno del furto riuscito, nelle stanze che ha svuotato
    const now = list[key];
    if (record(now) && record(now.robbed) && ids.has(String(now.robbed.by))) {
      const { robbed: _gone, ...rest } = now;
      list[key] = rest;
      changed = true;
    }
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
  const worlds = accountWorlds(ids, data.sims_saves);
  for (const world of [LEGACY_WORLD, ...worlds]) {
    const rooms = database.ref(worldNodePath(world, 'rooms_state'));
    // in ascolto mentre si scrive: vedi liveTransaction in maintenance.ts
    const keep = () => {};
    rooms.on?.('value', keep);
    try {
      await rooms.get();
      await rooms.transaction((value) => releaseRooms(value, ids));
    } finally {
      rooms.off?.('value', keep);
    }
  }
  const paths = deletionPaths(uid, data);
  // e quello che ha lasciato nei condomini nuovi in cui abitava
  for (const world of worlds) {
    const inWorld: Record<string, unknown> = { ...data };
    for (const node of WORLD_NODES)
      inWorld['sims_' + node] = (await database.ref(worldNodePath(world, node)).get()).val();
    paths.push(...worldDeletionPaths(uid, inWorld, world));
  }
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

// ---------------------------------------------------------------- resti di prima

/**
 * Il segno che la pulizia dei resti è stata fatta. Fino a novembre 2026 la cancellazione
 * lasciava suggerimenti, assaggi, coppie, blocchi e multe che nominano personaggi non più
 * esistenti: si tolgono una volta, poi questo segno ferma la pulizia.
 */
export const LEFTOVERS_MARK = 'sims_meta/leftoversCleaned';

/**
 * Una volta sola: toglie quello che nomina personaggi che non esistono più (senza salvataggio
 * in sims_saves), nel mondo di sempre e in quelli in `worlds`. Restituisce quanti percorsi ha
 * cancellato, o null se era già stata fatta.
 */
export async function cleanupLeftoversOnce(
  database: DeletionDatabase,
  worlds: string[],
): Promise<number | null> {
  if ((await database.ref(LEFTOVERS_MARK).get()).val() === true) return null;
  const read = async (path: string) => (await database.ref(path).get()).val();
  const global: Tree = {};
  for (const node of ['sims_suggestions', 'sims_couples', 'sims_world_creators'])
    global[node] = await read(node);
  const perWorld = new Map<string, Tree>();
  for (const world of new Set([LEGACY_WORLD, ...worlds])) {
    const data: Tree = {};
    for (const node of ['gifts', 'theft_blocks', 'fines'] as const)
      data['sims_' + node] = await read(worldNodePath(world, node));
    perWorld.set(world, data);
  }
  // tutti i personaggi nominati in questi nodi
  const named = new Set<string>();
  const note = (value: unknown) => {
    if (typeof value === 'string' && /^player_[A-Za-z0-9_-]+$/.test(value)) named.add(value);
  };
  for (const [, s] of entries(global.sims_suggestions)) if (record(s)) note(s.pid);
  for (const [pid, c] of entries(global.sims_couples)) {
    note(pid);
    if (record(c)) note(c.with);
  }
  for (const [pid] of entries(global.sims_world_creators)) note(pid);
  for (const data of perWorld.values()) {
    for (const [, givers] of entries(data.sims_gifts))
      for (const [pid] of entries(givers)) note(pid);
    for (const [, thieves] of entries(data.sims_theft_blocks))
      for (const [thief, b] of entries(thieves)) {
        note(thief);
        if (record(b)) note(b.by);
      }
    for (const [pid, fines] of entries(data.sims_fines)) {
      note(pid);
      for (const [, f] of entries(fines)) if (record(f)) note(f.to);
    }
  }
  // non esistono più quelli senza salvataggio (i morti lo tengono, con il segno di morte)
  const gone = new Set<string>();
  for (const pid of named) if ((await read(`sims_saves/${pid}/savedAt`)) === null) gone.add(pid);
  const paths: string[] = [];
  if (gone.size) {
    for (const pid of gone) {
      paths.push(`sims_couples/${pid}`, `sims_world_creators/${pid}`);
      for (const world of perWorld.keys()) paths.push(`${worldNodePath(world, 'fines')}/${pid}`);
    }
    for (const [world, data] of perWorld) {
      const found = referencePaths(gone, world === LEGACY_WORLD ? { ...global, ...data } : data);
      paths.push(
        ...(world === LEGACY_WORLD
          ? found
          : found
              .filter((path) => WORLD_PREFIX.test(path))
              .map((path) =>
                path.replace(WORLD_PREFIX, (_m, node) =>
                  worldNodePath(world, node as (typeof WORLD_NODES)[number]),
                ),
              )),
      );
    }
    const unique = [...new Set(paths)].sort();
    const outer = unique.filter((p) => !unique.some((o) => o !== p && p.startsWith(o + '/')));
    await database.ref('/').update(Object.fromEntries(outer.map((p) => [p, null])));
    paths.splice(0, paths.length, ...outer);
  }
  await database.ref('/').update({ [LEFTOVERS_MARK]: true });
  return paths.length;
}
