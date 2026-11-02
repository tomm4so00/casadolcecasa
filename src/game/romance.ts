import { notePersonality } from './personality.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { sfx } from './audio.js';
import { sendSocial } from './social.js';
import { isoProject, isoScale } from './render/primitives.js';
import {
  KISS_DURATION_MS,
  KISS_REQUEST_TTL_MS,
  canTryKiss,
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
  } else {
    await send(m.from, { type: 'kissNo' });
    endRomance(book(), m.from, Date.now());
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
    endRomance(book(), m.from, Date.now());
    refreshSocialPanel();
    saveGame(false);
    toast(`💔 ${who} ha rifiutato il bacio.`, 4000);
  }
}

function startKiss(partnerId: string, partnerName: string): void {
  const now = performance.now();
  game.kissAnim = { partnerId, partnerName, start: now, until: now + KISS_DURATION_MS };
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 10);
  game.player.stats.kisses = (game.player.stats.kisses || 0) + 1;
  notePersonality('kissAccepted');
  sfx('kiss');
  refreshSocialPanel();
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
