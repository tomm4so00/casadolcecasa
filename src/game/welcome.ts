// Missioni di benvenuto: proposta con tre pulsanti, istruzioni passo passo e premio in denaro.
import { game } from './context.js';
import { countUse } from './usage.js';
import { dom } from './runtime.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { creditMoney } from './economy.js';
import { hasRoom, saveGame } from './saves.js';
import type { GuideDest } from './guide-rules.js';
import { tasteHint, tasteTarget } from './taste.js';
import { arrivalActive, arrivalHudText } from './arrival.js';
import {
  missionsOf,
  type WelcomeState,
  type WelcomeView,
  answerOffer,
  completeIfDone,
  newWelcome,
  shouldOffer,
  welcomeFinished,
} from './welcome-rules.js';

/** Prima proposta: qualche secondo dopo l'ingresso, così non copre la guida iniziale. */
const FIRST_OFFER_DELAY_MS = 15_000;
const startedAt = Date.now();
let offering = false;
let completing = false;

const state = (): WelcomeState => (game.player.welcome ??= newWelcome());

/**
 * Il passo dell'assaggio (a chi portarlo): solo durante quella missione, perché sceglie il vicino
 * e lo avvisa che sta arrivando.
 */
function tasteStep(): string {
  const s = game.player.welcome;
  if (!s || !s.v || s.status !== 'active' || missionsOf(s)[s.i]?.id !== 'taste_give') return '';
  return tasteHint(tasteTarget(true));
}

/** Quello che serve sapere del personaggio adesso. */
function view(): WelcomeView {
  const p = game.player;
  const env: string = game.view.activeEnvironment;
  return {
    env,
    inOwnRoom: env === 'PLAYER_ROOM' && game.currentRoomIdx === game.myAssignedRoomIdx,
    meals: p.stats.meals || 0,
    showers: p.stats.showers || 0,
    shifts: p.stats.shifts || 0,
    sleeping: !!p.isSleeping,
    pinSet: !!game.hasSetSafePin,
    hasFood: p.rawFood + p.dishes > 0,
    foodCooked: p.dishes > 0,
    rawFood: p.rawFood,
    dishes: p.dishes,
    tastes: p.stats.tastes || 0,
    tasteHint: tasteStep(),
    working: !!game.activeShift || env.startsWith('lavoro_'),
  };
}

/**
 * Dove deve arrivare il giocatore per la missione in corso (per la freccia attorno al personaggio),
 * oppure null: nessuna missione accettata, o il passo non ha un posto (per esempio durante il turno).
 */
export function welcomeDest(): GuideDest | null {
  const s = game.player.welcome;
  if (!s || s.status !== 'active' || welcomeFinished(s)) return null;
  const id = missionsOf(s)[s.i]?.id;
  const p = game.player;
  const home = hasRoom() ? game.myAssignedRoomIdx : null;
  const myApt = home !== null ? game.aptOfRoom(home) : 0;
  const kitchen = (key: string): GuideDest => ({ env: 'KITCHEN', apt: myApt, key });
  const room = (key: string): GuideDest | null =>
    home === null ? null : { env: 'PLAYER_ROOM', roomIdx: home, key };
  switch (id) {
    case 'taste_cook':
      return kitchen(p.rawFood > 0 ? 'stove' : 'fridge');
    case 'eat':
      return kitchen(p.rawFood + p.dishes > 0 ? 'stove' : 'fridge');
    case 'shower':
      return { env: 'BATHROOM', apt: myApt, key: 'shower' };
    case 'pin':
      return room('safe');
    case 'sleep':
      return room('bed');
    case 'work':
      return game.activeShift || String(game.view.activeEnvironment).startsWith('lavoro_')
        ? null
        : { env: 'CORTILE', key: 'exitHouse' };
    case 'taste_give':
      return p.dishes > 0 ? tasteDest() : kitchen(p.rawFood > 0 ? 'stove' : 'fridge');
    default:
      return null;
  }
}

/** Il vicino a cui portare l'assaggio: dove si trova lui, la sua stanza o il personaggio del gioco. */
function tasteDest(): GuideDest | null {
  const t = tasteTarget(false);
  if (t.mode === 'room') return { env: 'PLAYER_ROOM', roomIdx: t.idx };
  if (t.mode === 'online') {
    const op = game.onlinePlayers?.[t.id];
    if (!op || !t.env) return null;
    const point = { x: Number(op.x) || 0, y: Number(op.y) || 0 };
    if (t.env === 'PLAYER_ROOM' && t.roomIdx !== null)
      return { env: t.env, roomIdx: t.roomIdx, point };
    return { env: t.env, apt: Number(op.apt) || 0, point };
  }
  const bot = (game.simulationBots || []).find(
    (b: { name?: string; env?: string }) => b.name === t.name && b.env === t.env,
  );
  return { env: t.env, ...(bot ? { point: { x: bot.x, y: bot.y } } : {}) };
}

// ---------------------------------------------------------------- per l'arrivo (arrival.ts)

/** La missione di benvenuto a cui si è arrivati (WELCOME_MISSIONS.length = finite). */
export const welcomeIndex = (): number => state().i;
/** La missione è da proporre (non accettata, non rifiutata). */
export const welcomeOffering = (): boolean =>
  !welcomeFinished(state()) && state().status === 'offer';
/** L'istruzione del passo della missione in corso, o "". */
export function welcomeHint(): string {
  const s = state();
  if (welcomeFinished(s) || s.status !== 'active') return '';
  return missionsOf(s)[s.i].hint(view());
}
/** Accetta la missione proposta senza la finestra: durante l'arrivo si segue il riquadro. */
export function acceptWelcomeMission(): void {
  const s = state();
  if (welcomeFinished(s) || s.status !== 'offer') return;
  game.player.welcome = answerOffer(s, 'yes', view(), Date.now());
  countUse(`missione:${missionsOf(s)[s.i].id}:si`);
  saveGame(false);
  updateWelcomeHud();
}

/** C'è già una finestra aperta (guida, creazione del personaggio, negozio…)? */
const screenBusy = (): boolean =>
  !!game.dialogResolve || !!document.querySelector('.fullscreen-modal:not(.hidden)');

/** Ogni secondo: completa la missione accettata, dà le istruzioni o propone la prossima. */
export async function tickWelcome(): Promise<void> {
  if (!game.session.saveReady || game.player.isDead || completing) return;
  const s = state();
  if (welcomeFinished(s) || s.status === 'off') return;
  const v = view();
  if (s.status === 'active') {
    const next = completeIfDone(s, v);
    if (next) {
      completing = true;
      try {
        await finishMission(s, next);
      } finally {
        completing = false;
      }
      return;
    }
    // Il prossimo passo è già visibile nel riquadro delle missioni.
    return;
  }
  // l'arrivo (arrival.ts) accetta da sé le missioni dell'assaggio
  if (arrivalActive()) return;
  if (
    shouldOffer(s, Date.now()) &&
    !offering &&
    !game.player.isSleeping &&
    Date.now() - startedAt > FIRST_OFFER_DELAY_MS &&
    !screenBusy()
  )
    void offerMission();
}

async function finishMission(s: WelcomeState, next: WelcomeState): Promise<void> {
  const m = missionsOf(s)[s.i];
  if (!(await creditMoney(m.reward))) return; // si riprova al prossimo giro
  game.player.welcome = { ...next, snoozeUntil: Date.now() + 4000 };
  countUse(`missione:${m.id}:fine`);
  sfx('mission');
  toast(`🏆 Missione completata: ${m.title} (+${m.reward} Đ)`, 5000, false);
  if (welcomeFinished(game.player.welcome))
    toast('🎉 Hai completato le missioni di benvenuto: ora sai come far vivere il tuo Sim!', 6000);
  saveGame(true);
}

/** Il messaggio con le istruzioni della missione e i tre pulsanti. */
async function offerMission(): Promise<void> {
  const s = state();
  if (welcomeFinished(s) || offering) return;
  const m = missionsOf(s)[s.i];
  offering = true;
  try {
    sfx('mission');
    const res = await openDialog({
      title: `📋 Missione ${s.i + 1} di ${missionsOf(s).length}: ${m.title}`,
      text: `${m.intro}\n\n🎁 Premio: ${m.reward} Đ`,
      buttons: [
        { label: '🚫 Non seguire le missioni', value: 'no', color: '#57606f' },
        { label: '⏰ Più tardi', value: 'later', color: '#e67e22' },
        { label: '✅ Accetta', value: 'yes', color: '#2ed573' },
      ],
    });
    // finestra chiusa da un'altra (es. un invito): si ripropone tra poco
    const answer = res.action === 'yes' || res.action === 'no' ? res.action : 'later';
    game.player.welcome = answerOffer(state(), answer, view(), Date.now());
    countUse(`missione:${m.id}:${answer === 'yes' ? 'si' : answer === 'no' ? 'no' : 'dopo'}`);
    if (res.action !== 'yes' && res.action !== 'no' && res.action !== 'later')
      game.player.welcome.snoozeUntil = Date.now() + 60_000;
    saveGame(false);
    updateWelcomeHud();
    if (answer === 'no')
      toast('Va bene! Se cambi idea, tocca 📋 Missioni sotto i parametri.', 5000);
    else if (answer === 'later') toast('⏰ Te la ripropongo tra 5 minuti.', 3500);
    else void tickWelcome(); // subito la prima istruzione
  } finally {
    offering = false;
  }
}

/**
 * Le missioni di benvenuto sono in corso (né rifiutate né finite): la quinta insegna a scegliere
 * la combinazione, quindi la richiesta automatica della cassaforte aspetta.
 */
export function welcomeTeachesPin(): boolean {
  const s = state();
  return !welcomeFinished(s) && s.status !== 'off';
}

/** Scritta sotto i parametri: la missione in corso e il passo da fare. */
function welcomeHudText(): string | null {
  const s = state();
  if (welcomeFinished(s)) return null;
  const m = missionsOf(s)[s.i];
  if (s.status === 'off') return '📋 Missioni di benvenuto (tocca per riattivarle)';
  if (s.status === 'offer') return `📋 ${m.title} · tocca per iniziare`;
  return `📋 ${m.title}: ${m.hint(view())} (+${m.reward} Đ)`;
}

/** Riattiva le missioni di benvenuto (o propone subito la prossima). */
export function restartWelcome(): void {
  game.player.welcome = { ...state(), status: 'offer', snoozeUntil: 0 };
  void offerMission();
}

/**
 * L'icona «Missioni» sotto i parametri: il passo da fare è nella sua finestra e lo indicano le
 * frecce. Si illumina quando c'è da guardarci: la guida dell'arrivo ridotta o una missione da
 * iniziare.
 */
export function updateWelcomeHud(): void {
  const el = dom('mission-text');
  if (!el) return;
  const s = state();
  const alert = arrivalActive() ? !!arrivalHudText() : !welcomeFinished(s) && s.status === 'offer';
  el.classList.toggle('alert', alert);
  el.title = (arrivalActive() ? arrivalHudText() : welcomeHudText()) || 'Apri le missioni';
}
