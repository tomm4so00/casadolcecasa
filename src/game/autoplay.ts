// I personaggi offline vivono da soli (autoplay-rules.ts): qui si calcola dove si vedono adesso,
// cosa pubblica ognuno nella sua presenza perché gli altri possano farlo, e cosa succede al rientro
// (il diario dell'assenza e le giocate alla slot del Giocatore d'azzardo).
import type { GameValue } from './context.js';
import { game } from './context.js';
import { forecastBedAt, lowestNeed, needsCopy, rescueAt } from './absent-death-rules.js';
import { needsRules } from './needs-rules.js';
import { myCryo } from './cryo.js';
import { cryoActive, cryoRescues } from '../../shared/cryo-rules.js';
import type { CharacterState } from './models.js';
import {
  type PersonalityId,
  leadingPersonality,
  levelOf,
  obtainedPersonality,
  secondPersonality,
  slotPrize,
} from './personality-rules.js';
import {
  type AutoplayInfo,
  type AutoplayView,
  absenceDiary,
  absenceGambles,
  autoplayAt,
  minutesText,
} from './autoplay-rules.js';
import { CRYO_PODS, PLAYER_ROOM_FURNITURE } from './data/catalogues.js';

const serverNow = (): number => Date.now() + (game.session?.serverOffset || 0);

// ---------------------------------------------------------------- cosa si pubblica

let forecast = { at: 0, bedAt: 0, rescueAt: 0 };

/**
 * Cosa serve agli altri per far vivere il mio personaggio quando esco: quando tornerà a letto
 * (ricalcolato ogni minuto), il parametro più basso, la stanza, la personalità che sta nascendo,
 * il secondo tratto e, in criogenesi, fino a quando sta fermo nella capsula.
 */
export function autoplayPresence(): Record<string, unknown> {
  const now = serverNow();
  const cryo = myCryo();
  const frozen = !!cryo && cryoActive(cryo, Date.now());
  if (now - forecast.at > 60_000) {
    const needs = needsCopy(game.player as unknown as CharacterState);
    forecast = {
      at: now,
      bedAt: forecastBedAt(needs, now, needsRules()),
      // con i pass nuovi: quando entrerebbe in capsula, cioè quando starebbe per morire
      rescueAt: frozen && cryoRescues(cryo) ? rescueAt(needs, now, needsRules()) : 0,
    };
  }
  const state = game.player.personality;
  const got = obtainedPersonality(state);
  const second = secondPersonality(state);
  const lead = got ? null : state ? leadingPersonality(state) : null;
  return {
    bedAt: forecast.bedAt,
    nd: Math.round(lowestNeed(game.player as unknown as CharacterState)),
    ...(game.myAssignedRoomIdx !== null && game.myAssignedRoomIdx >= 0
      ? { home: game.myAssignedRoomIdx }
      : {}),
    ...(second ? { pers2: second } : {}),
    ...(lead ? { lead } : {}),
    // in criogenesi fino a `frz`; con i pass nuovi ci si entra solo da `rsc` (sta per morire)
    ...(frozen
      ? { frz: cryo!.until, ...(forecast.rescueAt ? { rsc: forecast.rescueAt } : {}) }
      : {}),
  };
}

// ---------------------------------------------------------------- come si vedono gli altri

const isId = (v: unknown): v is PersonalityId =>
  typeof v === 'string' &&
  [
    'artist',
    'business',
    'criminal',
    'romantic',
    'addict',
    'gambler',
    'partier',
    'animals',
    'scientist',
    'vigilante',
  ].includes(v);

// ---------------------------------------------------------------- in criogenesi

/** Il centro di criogenesi (cryo-center.ts), dove dorme chi ha la criogenesi attiva. */
export const CRYO_CENTER_ENV = 'criogenesi';

/**
 * È offline e dentro la capsula: la criogenesi è pagata fino a `frz` e, con i pass nuovi, è già
 * arrivato il momento `rsc` in cui stava per morire (lo pubblica chi esce, autoplayPresence).
 */
export function inCryo(
  op: { offline?: unknown; frz?: unknown; rsc?: unknown } | null | undefined,
  alive: boolean,
  now: number,
): boolean {
  return (
    !!op && !!(op.offline || !alive) && (Number(op.frz) || 0) > now && now >= (Number(op.rsc) || 0)
  );
}

export interface CryoSleeper {
  id: string;
  name: string;
  /** vestiti e corpo come li pubblica nella presenza (li legge chi disegna, render/cryo.ts) */
  look: string;
  body: string;
}

let sleepersCache: { at: number; list: CryoSleeper[] } = { at: -1, list: [] };

/**
 * I vicini addormentati nelle capsule, uno per capsula (CRYO_PODS), sempre nello stesso ordine:
 * chi entra per primo in criogenesi resta nella sua capsula. Se sono più delle capsule, gli
 * ultimi arrivati non si vedono (ma per loro il tempo è fermo lo stesso).
 */
export function cryoSleepers(): CryoSleeper[] {
  const now = Date.now();
  if (now - sleepersCache.at < 500) return sleepersCache.list;
  const server = serverNow();
  const list: (CryoSleeper & { offAt: number })[] = [];
  for (const [id, op] of Object.entries(game.onlinePlayers || {})) {
    if (id === game.session.myPlayerId || !op) continue;
    // senza battito da più di due minuti è uscito anche se non è segnato offline
    const alive = !op.offline && server - (Number(op.t) || 0) < 120_000;
    if (!inCryo(op, alive, server)) continue;
    list.push({
      id,
      name: String(op.name || ''),
      look: String(op.look || ''),
      body: String(op.body || ''),
      offAt: Number(op.offAt) || 0,
    });
  }
  list.sort((a, b) => a.offAt - b.offAt || a.id.localeCompare(b.id));
  sleepersCache = { at: now, list: list.slice(0, CRYO_PODS.length) };
  return sleepersCache.list;
}

/** Cosa sappiamo di un personaggio offline per farlo vivere, oppure null (resta com'è). */
export function autoplayInfo(
  id: string,
  op: GameValue,
  alive: boolean,
  now: number,
): AutoplayInfo | null {
  if (!op || !(op.offline || !alive)) return null;
  // chi è uscito dormendo resta a letto; chi è in capsula ci resta (shownPresence lo mette lì)
  if (op.act === 'sleep' || op.act === 'rocket' || inCryo(op, alive, now)) return null;
  const offAt = Number(op.offAt) || Number(op.t) || 0;
  if (!offAt) return null;
  return {
    pid: id,
    offAt,
    bedAt: Number(op.bedAt) || 0,
    need: Number.isFinite(op.nd) ? Number(op.nd) : 100,
    ...(isId(op.pers) ? { pers: op.pers, persLv: Number(op.persLv) || 1 } : {}),
    ...(isId(op.pers2) ? { pers2: op.pers2 } : {}),
    ...(isId(op.lead) ? { lead: op.lead } : {}),
  };
}

/** Il letto della stanza `home` (come l'ha sistemato il proprietario). */
/** Altezza del materasso: chi riposa ci sta seduto sopra, sul bordo. */
export const BED_EDGE_Z = 24;

/**
 * Dove si siede chi "va a letto" in autoplay: sul bordo del letto verso chi guarda (il lato +x;
 * con il letto girato di un quarto, il lato +y), così si capisce che non sta dormendo davvero.
 */
function bedEdgeOf(home: number): { x: number; y: number; act: string } {
  const layout: GameValue = game.roomsState?.[home]?.layout?.bed;
  const bed: GameValue = layout && Number.isFinite(layout.x) ? layout : PLAYER_ROOM_FURNITURE.bed;
  const turned = (Number(bed.rot) || 0) % 2 === 1;
  const w = turned ? bed.h : bed.w,
    h = turned ? bed.w : bed.h;
  return turned
    ? { x: bed.x + 6, y: bed.y + h / 2 - 8, act: 'chair' }
    : { x: bed.x + w / 2 - 8, y: bed.y + 6, act: 'chairSide' };
}

/**
 * La presenza da mostrare: per chi è offline quella calcolata dall'autoplay (posto, posizione,
 * letto), con `view` per sapere se cammina e cosa sta facendo; per gli altri quella vera.
 */
export function shownPresence(
  id: string,
  op: GameValue,
  alive: boolean,
  now: number,
): { op: GameValue; view: AutoplayView | null } {
  // in criogenesi: nella sua capsula del centro (la disegna la capsula stessa, cryo.ts), anche
  // se era uscito dormendo
  if (inCryo(op, alive, now)) {
    const i = cryoSleepers().findIndex((s) => s.id === id);
    const pod = CRYO_PODS[i];
    return {
      op: {
        ...op,
        env: pod ? CRYO_CENTER_ENV : '',
        roomIdx: null,
        apt: null,
        x: pod ? pod.x : 0,
        y: pod ? pod.y : 0,
        act: 'cryo',
        say: '',
        sleep: undefined,
        place: 'In criogenesi 🧊',
      },
      view: null,
    };
  }
  const info = autoplayInfo(id, op, alive, now);
  if (!info) return { op, view: null };
  const view = autoplayAt(info, now);
  if (view.kind === 'still') return { op, view };
  // niente svenimento a sonno finito: chi vive da solo va a letto prima
  const base = { ...op, sleep: undefined, say: '' };
  if (view.kind === 'bed') {
    const home = Number(op.home);
    if (!Number.isInteger(home) || home < 0) return { op: base, view };
    const edge = bedEdgeOf(home);
    return {
      op: {
        ...base,
        env: 'PLAYER_ROOM',
        roomIdx: home,
        apt: game.aptOfRoom ? game.aptOfRoom(home) : null,
        x: edge.x,
        y: edge.y,
        // seduto sul bordo del letto, non sdraiato: non dorme davvero
        act: edge.act,
        seatZ: BED_EDGE_Z,
      },
      view,
    };
  }
  return {
    op: { ...base, env: view.env, roomIdx: null, apt: null, x: view.x, y: view.y, act: '' },
    view,
  };
}

/** L'etichetta sopra la testa: cosa sta facendo (vuota se è fermo dov'era). */
export function autoplayLabel(view: AutoplayView | null): string {
  if (!view) return '';
  if (view.kind === 'bed') return '🛏️ riposa sul letto';
  if (view.kind === 'place') return view.label;
  return '';
}

// ---------------------------------------------------------------- al rientro

/** Le informazioni sul proprio personaggio (dalla presenza rimasta quando si è usciti). */
function myInfo(op: GameValue): AutoplayInfo | null {
  return autoplayInfo(game.session.myPlayerId, { ...op, offline: true }, false, serverNow());
}

/**
 * Al rientro: cosa ha fatto il personaggio mentre il giocatore era via. `vault` sono i soldi in
 * cassaforte (servono per le giocate del Giocatore d'azzardo). Restituisce il testo del diario e
 * quanto ha vinto o perso alla slot (0 per chi non è Giocatore d'azzardo).
 */
export function absenceReport(
  op: GameValue,
  until: number,
  vault: number,
): { text: string; net: number; inBed: boolean; view: AutoplayView | null } | null {
  const info = myInfo(op);
  if (!info || until - info.offAt < 30 * 60_000) return null;
  const view = autoplayAt(info, until);
  const lines = absenceDiary(info, info.offAt, until).map(
    (d) => `• ${d.label}: ${minutesText(d.minutes)}`,
  );
  const state = game.player.personality;
  let net = 0;
  let gambleText = '';
  if (obtainedPersonality(state) === 'gambler') {
    const g = absenceGambles(info, info.offAt, until, vault, (w) =>
      slotPrize(w, levelOf(state, 'gambler')),
    );
    net = g.net;
    if (g.spins.length)
      gambleText = `\n🎰 Hai giocato ${g.spins.length} volte alla slot: ${net >= 0 ? '+' : ''}${net} Đ.`;
  }
  const inBed = view.kind === 'bed' && info.bedAt > 0 && until >= info.bedAt;
  const text =
    (lines.length ? `${lines.join('\n')}` : 'Sei rimasto quasi sempre a casa.') +
    gambleText +
    (inBed ? '\n😴 Poi, stanco, sei tornato a letto.' : '');
  return { text, net, inBed, view };
}
