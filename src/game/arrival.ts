// L'arrivo del giocatore nuovo (regole in arrival-rules.ts): il riquadro in basso con il passo da
// fare, la freccia (guide.ts), la valigia in cortile e la lampada in regalo nella stanza. Il passo
// sta nella memoria del dispositivo: su un altro telefono si continua con le missioni di sempre.
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { hasRoom, saveGame } from './saves.js';
import { countUse } from './usage.js';
import { isoProject, isoScale } from './render/primitives.js';
import { getCurrentFurnitureMap } from './world.js';
import type { GuideDest } from './guide-rules.js';
import {
  ARRIVAL_MISSIONS,
  LOW_NEED_TIP,
  type ArrivalStep,
  arrivalDest,
  coachFor,
  coachPill,
  isArrivalStep,
  lowNeed,
  nextArrival,
} from './arrival-rules.js';
import {
  acceptWelcomeMission,
  updateWelcomeHud,
  welcomeIndex,
  welcomeHint,
  welcomeOffering,
} from './welcome.js';

const key = (what: string): string => `${game.session.LS_PREFIX}sims_arrival_${what}`;
const read = (what: string): string | null => {
  try {
    return localStorage.getItem(key(what));
  } catch {
    return null;
  }
};
const write = (what: string, value: string): void => {
  try {
    localStorage.setItem(key(what), value);
  } catch {
    // memoria bloccata: l'arrivo vale per questa visita
  }
};

let step: ArrivalStep = 'done';
let loaded = false;
/** Fino a quando brilla la lampada appena regalata. */
let glowUntil = 0;

function current(): ArrivalStep {
  if (!loaded) {
    loaded = true;
    const saved = read('step');
    step = isArrivalStep(saved) ? saved : 'done';
  }
  return step;
}

function setStep(next: ArrivalStep): void {
  step = next;
  write('step', next);
  // l'imbuto d'ingresso (usage.ts): quanti arrivano a ogni passo
  if (next !== 'done') countUse('ingresso:arrivo_' + next);
}

/** L'arrivo è in corso: niente proposte di missione né riga delle missioni sotto i parametri. */
export const arrivalActive = (): boolean => current() !== 'done';

const myRoom = (): number | null => (hasRoom() ? game.myAssignedRoomIdx : null);
const myApt = (): number => {
  const room = myRoom();
  return room === null ? 0 : game.aptOfRoom(room);
};

/** Il personaggio nuovo arriva in cortile con la valigia e le chiavi in mano. */
export function startArrival(): void {
  // già fatto su questo dispositivo (anche con un personaggio di prima): non si ripete
  if (!hasRoom() || read('step') === 'done') return;
  loaded = true;
  setStep('keys');
  game.currentApt = myApt();
  game.view.activeEnvironment = 'CORTILE';
  game.view.currentRoomTitle = '';
  // un prato libero dal lato del suo palazzo, lontano da cassetta, bacheche e panchine (niente
  // pulsanti che si accendono appena arrivati)
  const door = game.courtyardDoors?.['doorApt' + game.currentApt];
  game.playerPos = door && door.x > 0 ? { x: 260, y: 110 } : { x: -330, y: 60 };
  game.cam = null;
}

/** Per la freccia: dove andare in questo passo (o null: decidono le missioni). */
export function arrivalGuide(): GuideDest | null {
  if (!arrivalActive()) return null;
  return arrivalDest(current(), myApt(), myRoom());
}

/** La lampada da terra in regalo, se non ne ha già una. */
function giveLamp(): void {
  const owned = game.player.ownedFurniture;
  if (!Object.keys(owned).some((id) => id.startsWith('lamp_') && owned[id])) {
    owned.lamp_std = true;
    saveGame(true);
  }
  glowUntil = Date.now() + 5000;
  sfx('mission');
  toast('🎁 Un regalo dal condominio: una lampada per la casa nuova!', 5000, false);
}

/** Ogni secondo: si va avanti quando si è arrivati, si accettano le missioni dell'assaggio. */
export function tickArrival(): void {
  if (!game.session.saveReady) return;
  tipLowNeeds();
  if (!arrivalActive()) return hideCoach();
  const env: string = game.view.activeEnvironment;
  const before = current();
  // in cucina e dopo, le missioni dell'assaggio partono da sole (niente finestra da accettare)
  if (before === 'cook' && welcomeOffering() && welcomeIndex() < ARRIVAL_MISSIONS)
    acceptWelcomeMission();
  const next = nextArrival(before, {
    env,
    inMyApt: (game.currentApt ?? 0) === myApt(),
    inOwnRoom: env === 'PLAYER_ROOM' && game.currentRoomIdx === myRoom(),
    mission: welcomeIndex(),
  });
  if (next !== before) {
    setStep(next);
    if (next === 'gift') giveLamp();
    if (next === 'cook' && welcomeOffering()) acceptWelcomeMission();
    if (next === 'done') {
      sfx('mission');
      toast('🎉 Ora sei uno di casa!', 5000, false);
    }
  }
  showCoach();
}

/** Il riquadro del passo di adesso (o null). */
function coachNow() {
  const room = myRoom();
  return coachFor(current(), {
    nick: String(game.player.myData.nick || ''),
    apt: myApt(),
    // lo stesso numero della porta e della riga sotto i parametri (su tutto il condominio)
    room: room === null ? 1 : room + 1,
    mission: welcomeIndex(),
    hint: welcomeHint(),
  });
}

/** Ridotto con la ✕: resta la riga gialla sotto i parametri, che lo riapre. */
const collapsed = (): boolean => read('min') === '1';

/** La riga gialla sotto i parametri (welcome.ts), solo con il riquadro ridotto. */
export function arrivalHudText(): string | null {
  if (!arrivalActive() || !collapsed()) return null;
  const c = coachNow();
  return c ? coachPill(c) : null;
}

/** Tocco sulla riga gialla: il riquadro si riapre. Vero se c'era da riaprire. */
export function reopenCoach(): boolean {
  if (!arrivalActive() || !collapsed()) return false;
  write('min', '0');
  showCoach();
  return true;
}

/** Il riquadro in basso: si aggiorna solo quando cambia il testo. */
function showCoach(): void {
  const box = dom('coach');
  if (!box) return;
  if (collapsed()) return hideCoach();
  const c = coachNow();
  if (!c) return hideCoach();
  const sig = JSON.stringify(c);
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    dom('coach-label').textContent = c.label;
    dom('coach-label').classList.toggle('hidden', !c.label);
    dom('coach-title').textContent = c.title || '';
    dom('coach-title').classList.toggle('hidden', !c.title);
    dom('coach-text').textContent = c.text;
  }
  box.classList.remove('hidden');
  // il pulsante "Arreda" della stanza sale sopra il riquadro, finché il riquadro c'è
  document.body.classList.add('coach-open');
  document.body.style.setProperty('--coach-h', box.offsetHeight + 'px');
}

function hideCoach(): void {
  dom('coach')?.classList.add('hidden');
  document.body.classList.remove('coach-open');
}

/** Chiude l'arrivo (gli script degli screenshot). */
export function finishArrival(): void {
  loaded = true;
  setStep('done');
  hideCoach();
}

/** La ✕ del riquadro: lo riduce alla riga gialla sotto i parametri (la guida va avanti lo stesso). */
export function bindCoach(): void {
  lifetime.listen(dom('coach-close'), 'click', () => {
    write('min', '1');
    hideCoach();
    updateWelcomeHud();
  });
}

/** La prima volta che un parametro scende sotto il 30%, cosa vuol dire. */
function tipLowNeeds(): void {
  if (read('lowtip') === '1') return;
  const p = game.player;
  if (!lowNeed([p.hungerLevel, p.sleepLevel, p.hygieneLevel, p.happinessLevel])) return;
  write('lowtip', '1');
  toast(LOW_NEED_TIP, 8000);
}

/** La valigia accanto al personaggio, in cortile, finché non entra nel portone. */
export function drawSuitcase(): void {
  const s = current();
  if ((s !== 'keys' && s !== 'door') || game.view.activeEnvironment !== 'CORTILE') return;
  const ctx = game.view.ctx;
  const k = isoScale();
  const p = isoProject(game.playerPos.x + 16, game.playerPos.y + 10, 0);
  const w = 16 * k,
    h = 20 * k;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w * 0.7, 4 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9c5b2e';
  ctx.strokeStyle = '#5e3416';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  ctx.roundRect(p.x - w / 2, p.y - h, w, h, 3 * k);
  ctx.fill();
  ctx.stroke();
  // le cinghie e il manico
  ctx.fillStyle = '#e1b382';
  ctx.fillRect(p.x - w / 2, p.y - h * 0.62, w, 2 * k);
  ctx.fillRect(p.x - w / 2, p.y - h * 0.3, w, 2 * k);
  ctx.beginPath();
  ctx.strokeStyle = '#3d2210';
  ctx.lineWidth = 2 * k;
  ctx.moveTo(p.x - 4 * k, p.y - h);
  ctx.lineTo(p.x - 4 * k, p.y - h - 4 * k);
  ctx.lineTo(p.x + 4 * k, p.y - h - 4 * k);
  ctx.lineTo(p.x + 4 * k, p.y - h);
  ctx.stroke();
  ctx.restore();
}

/** La lampada appena regalata brilla qualche secondo, così si nota. */
export function drawGiftGlow(t: number): void {
  if (Date.now() > glowUntil || game.view.activeEnvironment !== 'PLAYER_ROOM') return;
  const lamp = getCurrentFurnitureMap().lamp;
  if (!lamp) return;
  const ctx = game.view.ctx;
  const k = isoScale();
  const c = isoProject(lamp.x, lamp.y, 60);
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = t * 2 + (i * Math.PI) / 4;
    const r = (26 + Math.sin(t * 6 + i) * 6) * k;
    const x = c.x + Math.cos(a) * r,
      y = c.y + Math.sin(a) * r * 0.7;
    ctx.fillStyle = `rgba(255, 228, 120, ${0.55 + 0.4 * Math.sin(t * 8 + i)})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
