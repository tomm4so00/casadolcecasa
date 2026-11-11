// Blocco e segnalazione (passo 2 della moderazione). Bloccare qualcuno nasconde i suoi messaggi
// in chat e i suoi fumetti; le regole del database gli impediscono di mandarmi chiacchiere, baci,
// offerte, regali e sfide (passano solo gli avvisi del gioco: shared/block-rules.ts). Non ferma i
// furti. Chi è bloccato non lo sa. La segnalazione arriva al gestore con una copia dei suoi
// ultimi messaggi in chat; i giocatori non possono leggerla.
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { worldNode } from './world-db.js';
import { leavePartner, myPartner } from './couples.js';
import {
  type Blocked,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  chatProof,
  decodeBlocks,
} from '../../shared/block-rules.js';
import { maskText } from '../../shared/text-filter-rules.js';

let blocked: Record<string, Blocked> = {};
let started = false;
const listeners = new Set<() => void>();

const me = () => game.session.myPlayerId;
const blocksRef = (pid?: string) =>
  game.session.db.ref(`sims_blocks/${me()}${pid ? '/' + pid : ''}`);

/** Si ascolta la mia lista dei bloccati (una volta sola). */
export function startBlocks(): void {
  if (started || !me()) return;
  started = true;
  blocksRef().on('value', (snap) => {
    blocked = decodeBlocks(snap.val());
    // il pannello vicino ai giocatori si ricostruisce, la chat si ridisegna
    game.socKey = '';
    for (const fn of listeners) fn();
  });
}

/** Chiamata quando la lista dei bloccati cambia (per esempio dalla chat). */
export function onBlocksChange(fn: () => void): void {
  listeners.add(fn);
}

/** Ho bloccato questo giocatore? */
export const isBlocked = (pid: unknown): boolean =>
  typeof pid === 'string' && Object.prototype.hasOwnProperty.call(blocked, pid);

export async function blockPlayer(pid: string, name: string): Promise<boolean> {
  if (!pid || pid === me()) return false;
  const res = await openDialog({
    title: `🚫 Blocca ${name}`,
    text:
      `Non vedrai più i messaggi di ${name} in chat né i suoi fumetti, e non potrà più ` +
      'mandarti chiacchiere, baci, offerte, regali o sfide. Non lo saprà.\n\n' +
      'Il blocco non ferma i furti. Puoi sbloccarlo quando vuoi dal profilo (🚫 Persone bloccate).' +
      (myPartner()?.id === pid ? `\n\n💔 State insieme: bloccandolo vi lasciate.` : ''),
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: '🚫 Blocca', value: 'block', color: '#c0392b' },
    ],
  });
  if (res.action !== 'block') return false;
  try {
    await blocksRef(pid).set({ name: name.slice(0, 20), t: Date.now() });
  } catch (error) {
    console.warn('[blocco]', error);
    toast('❌ Non è stato possibile bloccarlo. Riprova tra poco.', 4000);
    return false;
  }
  // non ha senso restare fidanzati con chi si è bloccato
  if (myPartner()?.id === pid) await leavePartner();
  toast(`🚫 Hai bloccato ${name}.`, 3500);
  return true;
}

export async function unblockPlayer(pid: string, name: string): Promise<void> {
  try {
    await blocksRef(pid).remove();
    toast(`✅ Hai sbloccato ${name}.`, 3500);
  } catch (error) {
    console.warn('[blocco]', error);
    toast('❌ Non è stato possibile sbloccarlo. Riprova tra poco.', 4000);
  }
}

/** Profilo → Persone bloccate: tocchi un nome per sbloccarlo. */
export async function openBlockedList(): Promise<void> {
  const list = Object.entries(blocked).sort((a, b) => b[1].t - a[1].t);
  const res = await openDialog({
    title: '🚫 Persone bloccate',
    text: list.length
      ? 'Tocca un nome per sbloccarlo.'
      : 'Non hai bloccato nessuno. Per bloccare qualcuno toccalo nel gioco o tocca un suo messaggio in chat.',
    buttons: [
      ...list.slice(0, 20).map(([pid, b]) => ({
        label: `🔓 ${b.name}`,
        value: pid,
        color: '#636e72',
        wide: true,
      })),
      { label: 'Chiudi', value: null, color: '#57606f', wide: true },
    ],
  });
  const pid = res.action;
  if (pid && blocked[pid]) await unblockPlayer(pid, blocked[pid].name);
}

/** I suoi ultimi messaggi in chat come prova, così come li ha scritti (senza i ***). */
async function proofOf(pid: string) {
  try {
    let q = game.session.db.ref(worldNode('chat'));
    if (typeof q.limitToLast === 'function') q = q.limitToLast(150);
    return chatProof((await q.get()).val(), pid);
  } catch {
    return [];
  }
}

/** Segnala un giocatore al gestore, poi propone di bloccarlo. */
export async function reportPlayer(pid: string, name: string): Promise<void> {
  if (!pid || pid === me()) return;
  if (game.session.OFFLINE) {
    toast('🧪 In modalità prova le segnalazioni non partono.', 3500);
    return;
  }
  const res = await openDialog({
    title: `🚩 Segnala ${name}`,
    text:
      'Cosa è successo? La segnalazione arriva solo al gestore del gioco, insieme a una copia ' +
      `degli ultimi messaggi di ${name} in chat. ${name} non saprà chi l'ha segnalato.\n\n` +
      'Le regole della comunità sono in Condizioni e privacy → Regole della comunità.',
    buttons: [
      ...REPORT_REASONS.map((r) => ({ label: r.label, value: r.id, color: '#636e72', wide: true })),
      { label: 'Annulla', value: null, color: '#57606f', wide: true },
    ],
  });
  const reason = REPORT_REASONS.find((r) => r.id === res.action);
  if (!reason) return;
  let note = '';
  if (reason.id === 'altro') {
    const more = await openDialog({
      title: `🚩 Segnala ${name}`,
      text: 'Raccontaci in breve cosa è successo.',
      input: { placeholder: 'Cosa è successo…', maxLength: REPORT_NOTE_MAX, multiline: true },
      buttons: [
        { label: 'Annulla', value: null, color: '#57606f' },
        { label: '🚩 Manda', value: 'send', color: '#c0392b' },
      ],
    });
    if (more.action !== 'send') return;
    note = more.value.slice(0, REPORT_NOTE_MAX);
  }
  const msgs = await proofOf(pid);
  try {
    await game.session.db.ref(`sims_reports/${me()}/${pid}`).set({
      name: maskText(name).slice(0, 20),
      reason: reason.id,
      ...(note ? { note } : {}),
      world: String(game.session.worldId || '').slice(0, 20),
      t: Date.now(),
      ...(msgs.length ? { msgs: Object.fromEntries(msgs.map((m, i) => [String(i), m])) } : {}),
    });
  } catch (error) {
    console.warn('[segnalazione]', error);
    // le regole ne accettano una al giorno per la stessa persona
    toast(`Hai già segnalato ${name} nelle ultime 24 ore: la segnalazione è arrivata.`, 5000);
    return;
  }
  if (isBlocked(pid)) {
    toast('🚩 Grazie: la segnalazione è arrivata al gestore.', 4000);
    return;
  }
  const next = await openDialog({
    title: '🚩 Segnalazione inviata',
    text: `Grazie: la segnalazione è arrivata al gestore.\n\nVuoi anche bloccare ${name}?`,
    buttons: [
      { label: 'No', value: null, color: '#57606f' },
      { label: '🚫 Blocca', value: 'block', color: '#c0392b' },
    ],
  });
  if (next.action === 'block') await blockPlayer(pid, name);
}

/** Toccando un messaggio di un altro in chat: segnala, blocca o sblocca. */
export async function playerOptions(pid: string, name: string): Promise<void> {
  if (!pid || pid === me()) return;
  const isOff = isBlocked(pid);
  const res = await openDialog({
    title: `👤 ${name}`,
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      { label: '🚩 Segnala', value: 'report', color: '#e67e22' },
      isOff
        ? { label: '🔓 Sblocca', value: 'unblock', color: '#636e72' }
        : { label: '🚫 Blocca', value: 'block', color: '#c0392b' },
    ],
  });
  if (res.action === 'report') await reportPlayer(pid, name);
  if (res.action === 'block') await blockPlayer(pid, name);
  if (res.action === 'unblock') await unblockPlayer(pid, name);
}
