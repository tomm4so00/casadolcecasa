import { countUse } from './usage.js';
// Le coppie: due giocatori sono fidanzati solo se ognuno dice di esserlo con l'altro
// (sims_couples/<giocatore> = con chi e da quando). Ognuno scrive solo il suo: se uno lascia,
// l'altro lo vede subito o al prossimo ingresso e si libera da solo.
// Vantaggi: insieme nello stesso posto la felicità non cala, dormire insieme dà salute al
// risveglio, e gli anniversari (una settimana, poi ogni mese).
import { sfx } from './audio.js';
import { game } from './context.js';
import type { GameValue } from './context.js';
import { postGossip } from './gossip.js';
import { toast } from './missions.js';
import { todayKey } from './personality-rules.js';
import {
  BREAKUP_COOLDOWN_MS,
  SLEEP_TOGETHER_HEALTH,
  SLEEP_TOGETHER_MS,
  anniversaryOn,
  anniversaryText,
} from './romance-rules.js';
import { lifetime } from './runtime.js';
import { presenceAlive, saveGame } from './saves.js';

interface CoupleEntry {
  /** Il fidanzato (codice del personaggio) e il suo nome. */
  with: string;
  name: string;
  since: number;
  /** Visto confermato da tutti e due almeno una volta. */
  ok?: boolean;
}

let couples: Record<string, CoupleEntry> = {};

const me = (): string => game.session.myPlayerId;
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
const ref = (pid: string) => game.session.db.ref('sims_couples/' + pid);

const valid = (e: unknown): e is CoupleEntry =>
  !!e &&
  typeof e === 'object' &&
  typeof (e as CoupleEntry).with === 'string' &&
  typeof (e as CoupleEntry).since === 'number';

/** Con chi sta `pid` (solo se l'altro conferma), o null. */
export function partnerOf(pid: string): string | null {
  const e = couples[pid];
  if (!valid(e)) return null;
  const other = couples[e.with];
  return valid(other) && other.with === pid ? e.with : null;
}

/** Il mio fidanzato: codice, nome e da quando. */
export function myPartner(): { id: string; name: string; since: number } | null {
  const id = partnerOf(me());
  if (!id) return null;
  const e = couples[me()];
  return { id, name: e.name, since: e.since };
}

/** " 💞" accanto al nome di chi è fidanzato. */
export const heartFor = (pid: string): string => (partnerOf(pid) ? ' 💞' : '');

/** Per la scheda di un giocatore: con chi sta. */
export function coupleText(pid: string): string {
  const other = partnerOf(pid);
  return other ? `💞 Sta con ${couples[pid].name}` : '';
}

/** Si fidanza con `id`: scrive la propria metà (l'altro scrive la sua). */
export async function engageWith(id: string, name: string): Promise<boolean> {
  countUse('coppia');
  try {
    await ref(me()).set({ with: id, name: name.slice(0, 20), since: serverNow() });
    return true;
  } catch (error) {
    console.warn('[coppie]', error);
    toast('Non è stato possibile registrare il fidanzamento: riprova.', 4000);
    return false;
  }
}

/** Ci si lascia (dal profilo, o dopo un tradimento): ognuno toglie la sua metà. */
export async function leavePartner(): Promise<void> {
  const p =
    myPartner() ||
    (valid(couples[me()]) ? { id: couples[me()].with, name: couples[me()].name } : null);
  try {
    await ref(me()).remove();
  } catch {
    toast('Riprova tra poco.');
    return;
  }
  game.player.coupleCooldownUntil = Date.now() + BREAKUP_COOLDOWN_MS;
  saveGame(false);
  if (p) {
    sfx('enemy');
    toast(`💔 Non stai più con ${p.name}.`, 5000);
    postGossip(`💔 ${game.player.myData.nick} e ${p.name} si sono lasciati`, [p.id]);
  }
}

// ---------------------------------------------------------------- insieme

/** Il fidanzato è qui con me (stesso posto, stessa stanza o stesso appartamento)? */
export function togetherWithPartner(): boolean {
  const p = myPartner();
  if (!p) return false;
  const op = game.onlinePlayers?.[p.id];
  if (!op || op.offline || !presenceAlive(p.id, op, Date.now())) return false;
  const env = game.view.activeEnvironment;
  if (op.env !== env) return false;
  if (env === 'PLAYER_ROOM') return op.roomIdx === game.currentRoomIdx;
  if (game.APT_ENVS?.includes(env)) return (op.apt || 0) === game.currentApt;
  return true;
}

let wasTogether = false;
let wasSleeping = false;

/** Dorme nel mio stesso letto (stessa stanza, addormentato)? */
function partnerSleepsHere(): boolean {
  const p = myPartner();
  if (!p || game.view.activeEnvironment !== 'PLAYER_ROOM') return false;
  const op = game.onlinePlayers?.[p.id] as GameValue;
  return !!op && op.act === 'sleep' && op.roomIdx === game.currentRoomIdx;
}

function tick(): void {
  checkMine();
  const p = myPartner();
  // insieme: un avviso ogni volta che ci si ritrova
  const together = togetherWithPartner();
  if (together && !wasTogether && p) {
    sfx('kiss');
    toast(`💞 Sei con ${p.name}: insieme la felicità non cala.`, 5000);
  }
  wasTogether = together;
  // dormire insieme: da quando si è visti a letto insieme; al risveglio, dopo un'ora, il premio
  const sleeping = !!game.player.isSleeping;
  if (sleeping && partnerSleepsHere() && !game.player.sleptTogetherSince)
    game.player.sleptTogetherSince = Date.now();
  if (wasSleeping && !sleeping) {
    const since = game.player.sleptTogetherSince || 0;
    game.player.sleptTogetherSince = 0;
    if (since && Date.now() - since >= SLEEP_TOGETHER_MS && p) {
      game.player.healthLevel = Math.min(100, game.player.healthLevel + SLEEP_TOGETHER_HEALTH);
      toast(`💞 Hai dormito con ${p.name}: +${SLEEP_TOGETHER_HEALTH}% salute!`, 6000);
    }
    saveGame(false);
  }
  wasSleeping = sleeping;
  checkAnniversary();
}

/** La mia metà: confermata la prima volta, tolta se l'altro non c'è più. */
function checkMine(): void {
  const mine = couples[me()];
  if (!valid(mine)) return;
  if (partnerOf(me())) {
    if (!mine.ok)
      void ref(me())
        .update({ ok: true })
        .catch(() => {});
    return;
  }
  // l'altro ha lasciato (o la proposta non si è mai completata, dopo qualche minuto)
  if (mine.ok || serverNow() - mine.since > 5 * 60000) {
    void ref(me())
      .remove()
      .catch(() => {});
    if (mine.ok) {
      game.player.coupleCooldownUntil = Date.now() + BREAKUP_COOLDOWN_MS;
      saveGame(false);
      sfx('enemy');
      toast(`💔 ${mine.name} ti ha lasciato.`, 7000);
    }
  }
}

/** Anniversario: una settimana, poi ogni mese; una volta al giorno per dispositivo. */
function checkAnniversary(): void {
  const p = myPartner();
  if (!p || game.dialogResolve) return;
  const today = todayKey(new Date());
  const a = anniversaryOn(todayKey(new Date(p.since)), today);
  if (!a) return;
  const key = game.session.LS_PREFIX + 'sims_anniversary';
  try {
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
  } catch {
    return;
  }
  sfx('kiss');
  toast(anniversaryText(p.name, a), 8000);
}

/** All'avvio: le coppie di tutti (per i cuori accanto ai nomi) e i controlli ogni secondo. */
export function startCouples(): void {
  game.session.db.ref('sims_couples').on('value', (snap?: GameValue): void => {
    const v = snap?.val();
    couples = v && typeof v === 'object' ? v : {};
  });
  lifetime.setInterval(tick, 1000);
}
