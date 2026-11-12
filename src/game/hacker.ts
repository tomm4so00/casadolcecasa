// L'attacco hacker di Zero, lo scassinatore (regole in shared/hacker-rules.ts): la riga sotto i
// parametri, l'annuncio delle 11:45, l'effetto durante i 10 minuti, e la difesa: chi vede un ladro
// davanti alla propria cassaforte gli dà un pugno e quel ladro non potrà più aprirla.
import {
  CRACK_MS,
  HACKER_NAME,
  HACKER_SHORT,
  clockText,
  hackerDay,
  hackerExplanation,
  hackerPhase,
  untilText,
  type HackerPhase,
} from '../../shared/hacker-rules.js';
import { sfx } from './audio.js';
import { game } from './context.js';
import { postGossip } from './gossip.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { dom, lifetime } from './runtime.js';
import { hasRoom, presenceAlive } from './saves.js';
import { getCurrentFurnitureMap, spawnAtDoor } from './world.js';
import { worldNode } from './world-db.js';
import { notePersonality } from './personality.js';

/** Ora del server: l'attacco è uguale per tutti, anche con l'orologio del telefono sbagliato. */
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Durante i 10 minuti di Zero la prima cifra di ogni combinazione è scoperta. */
export const hackerActive = (): boolean => hackerPhase(serverNow()) === 'active';

const seenKey = (what: string) => `${game.session.LS_PREFIX}sims_hacker_${what}`;
function seenToday(what: string, day: string): boolean {
  try {
    return localStorage.getItem(seenKey(what)) === day;
  } catch {
    return false;
  }
}
function markSeen(what: string, day: string): void {
  try {
    localStorage.setItem(seenKey(what), day);
  } catch {
    // al peggio l'avviso si ripete
  }
}

/** La riga sotto i parametri: solo con l'attacco annunciato o in corso (vuota si nasconde). */
function tagText(now: number): { text: string; hot: boolean } {
  const d = hackerDay(now);
  switch (hackerPhase(now, d)) {
    case 'announced':
      return {
        text: `💻 Hack alle ${clockText(d.startAt)}`,
        hot: d.startAt - now < 15 * 60000,
      };
    case 'active':
      return { text: `⚠️ Casseforti indebolite · ${untilText(d.endAt - now)}`, hot: true };
    default:
      return { text: '', hot: false };
  }
}

/** Nelle ore tranquille, al posto della riga fissa, un promemoria ogni 2 ore. */
const REMINDER_MS = 2 * 60 * 60000;
const reminderKey = (): string => `${game.session.LS_PREFIX}sims_hacker_reminder`;
function remindQuiet(now: number, phase: HackerPhase): void {
  if (phase !== 'quiet' && phase !== 'over') return;
  let last = 0;
  try {
    last = Number(localStorage.getItem(reminderKey())) || 0;
  } catch {
    // senza memoria del browser il promemoria resta legato alla sessione
  }
  if (!last) {
    // la prima volta non si avvisa subito: si parte a contare da adesso
    last = now;
  } else if (now - last < REMINDER_MS) return;
  else {
    last = now;
    toast(
      phase === 'quiet'
        ? `💻 Alle 11:45 ${HACKER_SHORT} annuncia a che ora attaccherà le casseforti`
        : `💻 ${HACKER_SHORT} torna domani alle 11:45`,
      6000,
    );
  }
  try {
    localStorage.setItem(reminderKey(), String(last));
  } catch {
    // al peggio il promemoria arriva un po' prima
  }
}

/** L'annuncio: spiega bene come funziona, una volta al giorno. */
async function announce(startAt: number): Promise<void> {
  sfx('alarm');
  await openDialog({
    title: `💻 ${HACKER_NAME}: attacco alle ${clockText(startAt)}`,
    text: hackerExplanation(startAt),
    buttons: [{ label: 'Ho capito', value: 'ok', color: '#00b894' }],
  });
}

/** Mentre si gioca: riga, annuncio, inizio e fine dell'attacco, ladri alla mia cassaforte. */
export function startHacker(): void {
  if (game.session.OFFLINE) return;
  let glitch = false;
  const tick = (): void => {
    const now = serverNow();
    const d = hackerDay(now);
    const phase = hackerPhase(now, d);
    const tag = dom('hacker-tag');
    if (tag) {
      const { text, hot } = tagText(now);
      if (tag.textContent !== text) tag.textContent = text;
      tag.classList.toggle('hot', hot);
    }
    remindQuiet(now, phase);
    // l'annuncio arriva quando c'è, anche entrando più tardi (prima della fine dell'attacco)
    if ((phase === 'announced' || phase === 'active') && !seenToday('announce', d.day)) {
      if (!game.dialogResolve) {
        markSeen('announce', d.day);
        void announce(d.startAt);
      }
    }
    if (phase === 'active' && !seenToday('start', d.day)) {
      markSeen('start', d.day);
      sfx('alarm');
      toast(
        `⚠️ ${HACKER_SHORT} è entrato nel sistema: per 10 minuti le casseforti sono indebolite. Occhio alla tua stanza!`,
        7000,
      );
    }
    if ((phase === 'active') !== glitch) {
      glitch = phase === 'active';
      document.body.classList.toggle('hacker-glitch', glitch);
    }
    watchMySafe();
  };
  tick();
  lifetime.setInterval(tick, 1000);
}

// ---------------------------------------------------------------- difesa: il pugno

/** Ladri già segnalati (id e inizio dello scasso), per avvisare una volta sola. */
const warned = new Set<string>();

/** Chi sta scassinando adesso la mia cassaforte (con l'inizio dello scasso). */
function thievesAtMySafe(now: number): { id: string; name: string; since: number }[] {
  if (!hasRoom()) return [];
  const mine = String(game.myAssignedRoomIdx);
  const out: { id: string; name: string; since: number }[] = [];
  for (const [id, op] of Object.entries(game.onlinePlayers || {})) {
    if (id === game.session.myPlayerId || !op || (op as { crack?: unknown }).crack !== mine)
      continue;
    if (!presenceAlive(id, op, now)) continue;
    const since = Number((op as { crackT?: unknown }).crackT) || 0;
    out.push({ id, name: op.name || 'Qualcuno', since });
  }
  return out;
}

/** Sta scassinando proprio la mia cassaforte? */
export function crackingMySafe(id: string): boolean {
  return thievesAtMySafe(Date.now()).some((t) => t.id === id);
}

function watchMySafe(): void {
  for (const thief of thievesAtMySafe(Date.now())) {
    const key = thief.id + '|' + thief.since;
    if (warned.has(key)) continue;
    warned.add(key);
    void warnVictim(thief.name);
  }
}

/** Il proprietario scopre il ladro: se è a casa lo vede, altrimenti può correre. */
async function warnVictim(name: string): Promise<void> {
  sfx('alarm');
  const atHome =
    game.view.activeEnvironment === 'PLAYER_ROOM' && game.currentRoomIdx === game.myAssignedRoomIdx;
  if (atHome) {
    toast(`🚨 ${name} sta scassinando la tua cassaforte! Avvicinati e dagli un pugno 👊`, 8000);
    return;
  }
  const res = await openDialog({
    title: '🚨 Ladro in casa!',
    text:
      `${name} sta scassinando la tua cassaforte: ha ${CRACK_MS / 1000} secondi.\n\n` +
      'Corri a casa e dagli un pugno 👊: lo scasso fallisce e la tua cassaforte, per lui, resta chiusa per sempre.',
    buttons: [
      { label: 'Lascia stare', value: null, color: '#57606f' },
      { label: '🏃 Corri a casa', value: 'run', color: '#e74c3c' },
    ],
  });
  if (res.action === 'run') runHome();
}

/** Dritto nella propria stanza, se non si è impegnati (lavoro, minigiochi, letto…). */
function runHome(): void {
  if (!hasRoom()) return;
  if (game.activeShift || game.MG?.active || game.rocketTrip || game.socBusy()) {
    toast('Adesso non puoi correre a casa!');
    return;
  }
  game.currentApt = game.aptOfRoom(game.myAssignedRoomIdx);
  game.currentRoomIdx = game.myAssignedRoomIdx;
  game.view.activeEnvironment = 'PLAYER_ROOM';
  game.view.currentRoomTitle = 'La tua stanza 🏠';
  spawnAtDoor(getCurrentFurnitureMap().doorExit);
}

/**
 * Il pugno a chi sta scassinando la mia cassaforte: il database segna il ladro e da lì in poi non
 * può più toccarne i soldi. Vero se l'ha fermato.
 */
export async function catchThief(id: string, name: string): Promise<boolean> {
  if (!hasRoom() || !crackingMySafe(id)) return false;
  try {
    await game.session.db
      .ref(`${worldNode('theft_blocks')}/${game.myAssignedRoomIdx}/${id}`)
      .set({ by: game.session.myPlayerId, t: serverNow() });
  } catch (error) {
    console.warn('[ladro]', error);
    return false;
  }
  sfx('enemy');
  notePersonality('punchThief');
  toast(`👊 Hai fermato ${name}! Non potrà mai più aprire la tua cassaforte.`, 6000);
  postGossip(
    `${game.player.myData.nick} ha beccato ${name} mentre gli scassinava la cassaforte 👊🕵️`,
    [id],
  );
  return true;
}
