import { notePersonality } from './personality.js';
import { postGossip } from './gossip.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { sfx } from './audio.js';
import { sendSocial } from './social.js';
import { engageWith, leavePartner, myPartner, partnerOf } from './couples.js';
import { isoProject, isoScale } from './render/primitives.js';
import {
  KISS_DURATION_MS,
  KISS_REQUEST_TTL_MS,
  PROPOSE_AFTER_KISSES,
  canPropose,
  canTryKiss,
  noteKiss,
  resetKisses,
  endRomance,
  noteAttention,
  trimRomance,
  unlockRomance,
} from './romance-rules.js';

// Invio dei messaggi agli altri giocatori (import circolare sicuro: viene usato solo durante il gioco).
const send = (to: string, msg: Record<string, unknown>) => sendSocial(to, msg);

const book = () => (game.player.romance ??= {});
const refreshSocialPanel = () => {
  game.socKey = '';
};

// ---------------------------------------------------------------- interesse

/** Chiamata quando ricevi un dialogo o un complimento da un altro giocatore. */
export function noteRomanticAttention(fromId: string, fromName: string): void {
  if (!fromId || fromId === game.session.myPlayerId) return;
  if (!noteAttention(book(), fromId, fromName, Date.now())) return;
  game.player.romance = trimRomance(book());
  void send(fromId, { type: 'romance' });
  refreshSocialPanel();
  saveGame(false);
  sfx('kiss');
  toast(`💘 Sembra che ${fromName} abbia degli interessi particolari per te!`, 8000);
}

/** L'altro giocatore ci ha notato: anche da questo lato compare "Prova a baciare". */
export function onRomanceUnlocked(fromId: string, fromName: string): void {
  unlockRomance(book(), fromId, fromName, Date.now());
  game.player.romance = trimRomance(book());
  refreshSocialPanel();
  saveGame(false);
}

export function canKiss(targetId: string | undefined | null): boolean {
  return canTryKiss(book(), targetId) && !kissActive();
}

// ---------------------------------------------------------------- bacio

export async function tryKiss(target: { id: string; name: string }): Promise<void> {
  const pending = game.kissPending;
  if (pending && Date.now() < pending.until) {
    toast(`⏳ Aspetta la risposta di ${pending.name}…`);
    return;
  }
  game.kissPending = { id: target.id, name: target.name, until: Date.now() + 30_000 };
  await send(target.id, { type: 'kissAsk' });
  notePersonality('kissAttempt');
  toast(`💋 Hai provato a baciare ${target.name}… aspetta la risposta!`, 4000);
}

export async function onKissAsk(m: GameValue, who: string): Promise<void> {
  if (Date.now() - (m.t || 0) > KISS_REQUEST_TTL_MS) return;
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1500));
  const res: GameValue = await openDialog({
    title: '💋 Un bacio?',
    text: `${who} vuole baciarti! Accetti?`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: '💋 Accetta', value: 'yes', color: '#ff6b81' },
    ],
  });
  if (res.action === 'yes') {
    await send(m.from, { type: 'kissYes' });
    startKiss(m.from, who);
    // lo scrive solo chi accetta, così il fatto compare una volta sola
    postGossip(`${game.player.myData.nick} e ${who} si sono baciati 💋`, [m.from], 6 * 3600_000);
  } else {
    await send(m.from, { type: 'kissNo' });
    // tra fidanzati un bacio rifiutato non chiude la storia
    if (partnerOf(game.session.myPlayerId) !== m.from) endRomance(book(), m.from, Date.now());
    refreshSocialPanel();
    saveGame(false);
    toast(`Hai rifiutato il bacio di ${who}.`, 3500);
  }
}

export function onKissAnswer(m: GameValue, who: string, accepted: boolean): void {
  if (game.kissPending?.id === m.from) game.kissPending = null;
  if (accepted) {
    toast(`💕 ${who} ha accettato il tuo bacio!`, 4000);
    startKiss(m.from, who);
  } else {
    const partners = partnerOf(game.session.myPlayerId) === m.from;
    if (!partners) endRomance(book(), m.from, Date.now());
    refreshSocialPanel();
    saveGame(false);
    toast(
      partners
        ? `💔 ${who} non ha voglia di baci adesso: riprova più tardi.`
        : `💔 ${who} ha rifiutato il bacio.`,
      4000,
    );
  }
}

function startKiss(partnerId: string, partnerName: string): void {
  const now = performance.now();
  game.kissAnim = { partnerId, partnerName, start: now, until: now + KISS_DURATION_MS };
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 10);
  game.player.stats.kisses = (game.player.stats.kisses || 0) + 1;
  notePersonality('kissAccepted');
  sfx('kiss');
  // i baci della coppia: al quinto ci si può proporre di fidanzarsi
  const kisses = noteKiss(book(), partnerId, partnerName, Date.now());
  saveGame(false);
  if (kisses === PROPOSE_AFTER_KISSES && canProposeTo(partnerId))
    toast(
      `💞 Tu e ${partnerName} vi siete baciati ${PROPOSE_AFTER_KISSES} volte: ora potete fidanzarvi! (💍 nel pannello vicino a lui o a lei)`,
      8000,
    );
  // il tradimento: chi è fidanzato e bacia un altro lo fa sapere al fidanzato (e al gossip)
  const mine = myPartner();
  if (mine && mine.id !== partnerId) {
    void send(mine.id, { type: 'cheat', who: partnerName.slice(0, 20) });
    postGossip(
      `👀 ${game.player.myData.nick} ha baciato ${partnerName}… ma non stava con ${mine.name}?`,
      [mine.id, partnerId],
    );
  }
  refreshSocialPanel();
}

// ---------------------------------------------------------------- fidanzamento

/** 💍 nel pannello: dopo 5 baci con quella persona, se nessuno dei due è fidanzato. */
export function canProposeTo(id: string | undefined | null): boolean {
  if (!id) return false;
  return canPropose({
    kisses: book()[id]?.kisses || 0,
    mine: partnerOf(game.session.myPlayerId),
    theirs: partnerOf(id),
    cooldownUntil: game.player.coupleCooldownUntil || 0,
    now: Date.now(),
  });
}

/** Proposta in sospeso (una alla volta, come il bacio). */
let proposal: { id: string; until: number } | null = null;

export async function proposeEngagement(target: { id: string; name: string }): Promise<void> {
  if (!canProposeTo(target.id)) return;
  if (proposal && Date.now() < proposal.until) {
    toast(`⏳ Aspetta la risposta di ${target.name}…`);
    return;
  }
  proposal = { id: target.id, until: Date.now() + 60_000 };
  await send(target.id, { type: 'engageAsk' });
  sfx('kiss');
  toast(`💍 Hai chiesto a ${target.name} di fidanzarvi… aspetta la risposta!`, 5000);
}

export async function onEngageAsk(m: GameValue, who: string): Promise<void> {
  if (Date.now() - (m.t || 0) > KISS_REQUEST_TTL_MS) return;
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1500));
  // nel frattempo uno dei due si è fidanzato con qualcun altro
  if (partnerOf(game.session.myPlayerId) || partnerOf(m.from)) {
    await send(m.from, { type: 'engageNo' });
    return;
  }
  sfx('kiss');
  const res: GameValue = await openDialog({
    title: '💍 Una proposta!',
    text: `${who} ti chiede di fidanzarvi!\n\nSe dici di no, il conto dei vostri baci riparte da zero (ma potete ancora baciarvi).`,
    buttons: [
      { label: '❌ No', value: 'no', color: '#57606f' },
      { label: '💞 Sì!', value: 'yes', color: '#ff6b81' },
    ],
  });
  if (res.action === 'yes' && (await engageWith(m.from, who))) {
    await send(m.from, { type: 'engageYes' });
    celebrate(m.from, who);
    // lo scrive solo chi accetta, così il fatto compare una volta sola
    postGossip(`💍 ${game.player.myData.nick} e ${who} si sono fidanzati! 💞`, [m.from]);
    return;
  }
  await send(m.from, { type: 'engageNo' });
  resetKisses(book(), m.from);
  saveGame(false);
  refreshSocialPanel();
  toast(`Hai detto di no a ${who}.`, 3500);
}

export async function onEngageAnswer(m: GameValue, who: string, yes: boolean): Promise<void> {
  if (proposal?.id === m.from) proposal = null;
  if (yes && (await engageWith(m.from, who))) {
    celebrate(m.from, who);
    return;
  }
  resetKisses(book(), m.from);
  saveGame(false);
  refreshSocialPanel();
  toast(`💔 ${who} ha detto di no. Il conto dei vostri baci riparte da zero.`, 5000);
}

/** Fidanzati: cuori sopra tutti e due e un avviso. */
function celebrate(partnerId: string, partnerName: string): void {
  const now = performance.now();
  game.kissAnim = { partnerId, partnerName, start: now, until: now + KISS_DURATION_MS };
  sfx('levelUp');
  toast(`💞 Ora stai con ${partnerName}! Insieme la felicità non cala.`, 7000);
  refreshSocialPanel();
}

/** Il mio fidanzato ha baciato un'altra persona. */
export async function onCheat(m: GameValue, who: string): Promise<void> {
  if (partnerOf(game.session.myPlayerId) !== m.from) return;
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1500));
  sfx('enemy');
  const other = typeof m.who === 'string' ? m.who.slice(0, 20) : 'qualcuno';
  const res: GameValue = await openDialog({
    title: '👀 Ma come…',
    text: `${who} ha appena baciato ${other}…`,
    buttons: [
      { label: '🤝 Perdona', value: 'forgive', color: '#2e86de' },
      { label: '💔 Lascia', value: 'leave', color: '#c0392b' },
    ],
  });
  if (res.action === 'leave') await leavePartner();
  else toast(`🤝 Hai perdonato ${who}.`, 3500);
}

export function kissActive(): boolean {
  if (game.kissAnim && performance.now() > game.kissAnim.until) {
    game.kissAnim = null;
    refreshSocialPanel();
  }
  return !!game.kissAnim;
}

/** Durante il bacio il personaggio si avvicina da solo all'altro. */
export function approachKissPartner(delta: number): void {
  const partner = game.kissAnim && game.remoteSmooth[game.kissAnim.partnerId];
  if (!partner) return;
  const dx = partner.x - game.playerPos.x,
    dy = partner.y - game.playerPos.y;
  const dist = Math.hypot(dx, dy);
  const gap = 15;
  if (dist <= gap) return;
  const step = Math.min(dist - gap, 70 * delta);
  game.playerPos.x += (dx / dist) * step;
  game.playerPos.y += (dy / dist) * step;
}

/** Cuori che salgono sopra un personaggio che sta baciando. */
export function drawKissHearts(x: number, y: number, since: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const t = (performance.now() - since) / 1000;
  const head = isoProject(x, y, 66);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.55 + i / 6) % 1;
    const alpha = Math.min(1, t * 2) * (1 - ph);
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.round((9 + ph * 7) * s)}px sans-serif`;
    ctx.fillText(
      i % 3 === 0 ? '💕' : '❤️',
      head.x + Math.sin(t * 2 + i * 1.7) * 9 * s,
      head.y - ph * 42 * s,
    );
  }
  // "💋" che pulsa a metà animazione
  const pop = Math.max(0, Math.sin(Math.min(1, t / 1.2) * Math.PI));
  if (pop > 0.02) {
    ctx.globalAlpha = pop;
    ctx.font = `${Math.round((12 + pop * 8) * s)}px sans-serif`;
    ctx.fillText('💋', head.x, head.y - 18 * s);
  }
  ctx.restore();
}
