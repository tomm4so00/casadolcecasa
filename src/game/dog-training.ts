// Addestramento del cane nell'area cani: il padrone va al centro del recinto e fischia, il cane gli
// si mette davanti e aspetta un comando ("seduto", "dà la zampa"). Se obbedisce e riceve subito
// il premietto (1 Đ), la volta dopo obbedirà più spesso. Le probabilità sono in
// dog-training-rules.ts; il cane libero e il guinzaglio in pets.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { spendMoney } from './economy.js';
import { saveGame } from './saves.js';
import { TRAIN_DOG_SPOT, TRAIN_SPOT, clampToPark, inDogPark } from './dog-park-rules.js';
import {
  COMMAND_NAME,
  TREAT_PRICE,
  type DogReaction,
  type LastSuccess,
  type TrainCommand,
  chancePercent,
  reactTo,
  rewarded,
  treatTeaches,
} from './dog-training-rules.js';

type Phase = 'walk' | 'call' | 'ready' | 'act';

interface Session {
  phase: Phase;
  /** Inizio della fase (animClock). */
  since: number;
  /** Cosa sta facendo il cane dopo il comando (fase 'act'). */
  act: DogReaction | null;
  /** Dove va annusando quando si allontana un attimo. */
  sniffAt: { x: number; y: number } | null;
  /** Ultimo comando eseguito bene, finché non arriva il premietto. */
  last: LastSuccess | null;
  /** Quando è partito il premietto (animClock), -1 se non c'è. */
  treatAt: number;
  /** Posa del cane: quanto è seduto, quanto alza la zampa, se abbaia. */
  sitK: number;
  paw: number;
  bark: boolean;
}

let session: Session | null = null;

/** Quanto dura l'esecuzione di un comando (seduto o zampa) prima che si rialzi. */
const HOLD_S = 3.5;
const TREAT_S = 0.9;
/** Allontanandosi così dal punto dell'addestramento lo si interrompe. */
const LEAVE_R = 25;

const dogState = () => game.player.pets?.dog;
const now = () => game.animClock;

/** Il cane è libero nel recinto insieme al padrone: si può cominciare. */
function canTrain(): boolean {
  const w = game.dogWalk;
  return (
    !!w &&
    w.mode === 'free' &&
    game.view.activeEnvironment === 'passeggiata' &&
    inDogPark(game.playerPos.x, game.playerPos.y)
  );
}

/** Andando al centro e mentre il cane arriva il padrone non si muove da solo. */
export function trainingHoldsOwner(): boolean {
  return !!session && (session.phase === 'walk' || session.phase === 'call');
}

// ---------------------------------------------------------------- pulsanti

export function startDogTraining(): void {
  if (!canTrain() || session || performance.now() < game.smokeUntil) return;
  session = {
    phase: 'walk',
    since: now(),
    act: null,
    sniffAt: null,
    last: null,
    treatAt: -1,
    sitK: 0,
    paw: 0,
    bark: false,
  };
}

export function stopDogTraining(): void {
  if (!session) return;
  session = null;
  const w = game.dogWalk;
  if (w) {
    w.moving = false;
    w.nextAt = now() + 0.5;
  }
}

/** "Seduto!" o "Dammi la zampa!": il cane obbedisce o si distrae. */
export function dogCommand(cmd: TrainCommand): void {
  const w = game.dogWalk;
  if (!session || !w || session.phase !== 'ready') return;
  game.mySay = cmd === 'sit' ? 'Seduto! ✋' : 'Dammi la zampa! 🤝';
  // il fumetto dura 6 s da mySayT: così resta un paio di secondi
  game.mySayT = Date.now() - 3800;
  const r = reactTo(cmd, dogState()?.train, Math.random(), Math.random());
  session.phase = 'act';
  session.since = now();
  session.act = r;
  session.last = null;
  if (r === 'bark') {
    w.say = 'Bau! Bau! 🐶';
    w.sayUntil = now() + 1.8;
    sfx('bark');
  } else if (r === 'wander') {
    const a = Math.random() * Math.PI * 2;
    session.sniffAt = clampToPark(w.x + Math.cos(a) * 50, w.y + Math.sin(a) * 50, 18);
    w.say = '👃 Sniff…';
    w.sayUntil = now() + 2.5;
  } else if (r === 'spin') {
    w.say = '🌀';
    w.sayUntil = now() + 1.5;
  }
}

/** Premietto da 1 Đ: insegna qualcosa solo se arriva subito dopo un comando eseguito. */
export async function dogTreat(): Promise<void> {
  const s = session;
  const w = game.dogWalk;
  const dog = dogState();
  if (!s || !w || !dog || (s.phase !== 'ready' && s.phase !== 'act')) return;
  if (s.treatAt >= 0 && now() - s.treatAt < TREAT_S) return;
  if (game.moneyLevel < TREAT_PRICE) {
    toast(`Ti serve ${TREAT_PRICE} Đ in cassaforte per il premietto.`);
    sfx('error');
    return;
  }
  if (!(await spendMoney(TREAT_PRICE))) {
    toast('Pagamento non riuscito, riprova.');
    return;
  }
  if (session !== s) return; // nel frattempo l'addestramento è finito
  s.treatAt = now();
  game.mySay = 'Bravo! 🦴';
  game.mySayT = Date.now() - 4000;
  const last = s.last;
  if (last && treatTeaches(last, now())) {
    const before = chancePercent(last.cmd, dog.train);
    dog.train = rewarded(dog.train, last.cmd);
    const after = chancePercent(last.cmd, dog.train);
    s.last = null;
    sfx('success');
    toast(
      `🦴 Bravo! Ha capito "${COMMAND_NAME[last.cmd]}": ora obbedisce il ${after}% delle volte` +
        (after > before ? ` (prima ${before}%).` : '.'),
      4000,
    );
    saveGame();
  } else {
    sfx('coin');
    toast('🦴 Gnam! Ma il premietto funziona solo subito dopo un comando eseguito bene.', 3500);
  }
}

// ---------------------------------------------------------------- ogni fotogramma

/** Un passo verso (tx, ty); dice se è arrivato. */
function step(w: GameValue, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - w.x,
    dy = ty - w.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) {
    w.x = tx;
    w.y = ty;
    return true;
  }
  const k = Math.min(d, speed * dt) / d;
  w.x += dx * k;
  w.y += dy * k;
  w.dx = dx;
  w.dy = dy;
  return false;
}

/** Il cane guarda il padrone. */
function facePlayer(w: GameValue): void {
  w.dx = game.playerPos.x - w.x;
  w.dy = game.playerPos.y - w.y;
}

const ease = (k: number) => Math.max(0, Math.min(1, k));

/**
 * Muove padrone e cane durante l'addestramento. Ritorna false se non si sta addestrando (allora
 * il cane corre libero come sempre).
 */
export function updateTraining(w: GameValue, dt: number): boolean {
  const s = session;
  if (!s) return false;
  if (!canTrain()) {
    session = null;
    return false;
  }
  const t = now() - s.since;
  const px = game.playerPos.x,
    py = game.playerPos.y;
  if (s.phase === 'walk') {
    // il padrone va da solo al centro del recinto (il cane intanto gioca)
    const d = Math.hypot(TRAIN_SPOT.x - px, TRAIN_SPOT.y - py);
    const k = d < 1 ? 1 : Math.min(d, 80 * dt) / d;
    game.playerPos = { x: px + (TRAIN_SPOT.x - px) * k, y: py + (TRAIN_SPOT.y - py) * k };
    game.isWalking = d >= 1;
    if (d >= 1 && t < 6) return false;
    game.playerPos = { ...TRAIN_SPOT };
    s.phase = 'call';
    s.since = now();
    game.mySay = 'Fiiiù! 🎵';
    game.mySayT = Date.now() - 3500;
    sfx('whistle');
    w.say = '❗';
    w.sayUntil = now() + 1.2;
    return true;
  }
  // allontanandosi dal punto l'addestramento finisce
  if (Math.hypot(TRAIN_SPOT.x - px, TRAIN_SPOT.y - py) > LEAVE_R) {
    stopDogTraining();
    toast('🐕 Addestramento finito: il cane torna a giocare.', 2500);
    return false;
  }
  // la posa torna normale piano piano (tranne mentre esegue un comando)
  const relax = () => {
    s.sitK = Math.max(0, s.sitK - dt * 3);
    s.paw = Math.max(0, s.paw - dt * 4);
    s.bark = false;
  };
  if (s.phase === 'call') {
    relax();
    w.moving = true;
    // corre davanti al padrone (se resta incastrato, dopo un po' arriva comunque)
    let there = step(w, TRAIN_DOG_SPOT.x, TRAIN_DOG_SPOT.y, 170, dt);
    if (!there && t > 4) {
      w.x = TRAIN_DOG_SPOT.x;
      w.y = TRAIN_DOG_SPOT.y;
      there = true;
    }
    if (there) {
      s.phase = 'ready';
      s.since = now();
      w.moving = false;
      facePlayer(w);
      toast('🎓 Il cane ti guarda e aspetta: dagli un comando!', 3000);
    }
    return true;
  }
  if (s.phase === 'ready') {
    relax();
    // se si è spostato (dopo un giretto) torna al suo posto
    w.moving = !step(w, TRAIN_DOG_SPOT.x, TRAIN_DOG_SPOT.y, 60, dt);
    if (!w.moving) facePlayer(w);
    return true;
  }
  // fase 'act': il cane esegue il comando o si distrae
  const back = () => {
    s.phase = 'ready';
    s.since = now();
    s.act = null;
    s.sniffAt = null;
  };
  const act = s.act;
  if (act === 'sit' || act === 'paw') {
    w.moving = false;
    facePlayer(w);
    s.sitK = ease(t / 0.45);
    s.paw = act === 'paw' ? ease((t - 0.5) / 0.4) * (0.85 + Math.sin(now() * 7) * 0.15) : 0;
    const doneAt = act === 'sit' ? 0.45 : 0.9;
    if (t >= doneAt && !s.last && t < HOLD_S) {
      // eseguito: da qui parte la finestra per il premietto
      s.last = { cmd: act, at: s.since + doneAt };
      w.say = act === 'sit' ? '🐕 ✔️' : '🐾 ✔️';
      w.sayUntil = now() + 1.5;
      toast(
        act === 'sit'
          ? '🐶 Si è seduto! Dagli subito un premietto.'
          : '🐶 Ti ha dato la zampa! Dagli subito un premietto.',
        2500,
      );
    }
    if (t >= HOLD_S) back();
  } else if (act === 'bark') {
    w.moving = false;
    facePlayer(w);
    s.sitK = 0;
    s.bark = t < 1.6;
    if (t >= 1.6) back();
  } else if (act === 'wander') {
    relax();
    // va ad annusare un posto lì vicino, ci resta un attimo e torna
    const target = t < 2.2 ? s.sniffAt! : TRAIN_DOG_SPOT;
    const there = step(w, target.x, target.y, t < 2.2 ? 75 : 95, dt);
    w.moving = !there;
    if ((t >= 2.2 && there) || t > 7) back();
  } else if (act === 'spin') {
    relax();
    // due giretti stretti accanto al padrone
    const a = (t / 1.8) * Math.PI * 4;
    const r = 11;
    w.x = TRAIN_DOG_SPOT.x + Math.sin(a) * r;
    w.y = TRAIN_DOG_SPOT.y - r + Math.cos(a) * r;
    w.dx = Math.cos(a);
    w.dy = -Math.sin(a);
    w.moving = true;
    if (t >= 1.8) {
      w.x = TRAIN_DOG_SPOT.x;
      w.y = TRAIN_DOG_SPOT.y;
      back();
    }
  } else back();
  return true;
}

/** Posa del cane durante l'addestramento, per il disegno. */
export function trainingPose(): { sit: number; paw: number; bark: boolean } | null {
  if (!session) return null;
  return { sit: session.sitK, paw: session.paw, bark: session.bark };
}

/** Avanzamento del premietto (0 in mano, 1 in bocca), o -1 se non c'è. */
export function treatProgress(): number {
  if (!session || session.treatAt < 0) return -1;
  const k = (now() - session.treatAt) / TREAT_S;
  if (k >= 1) {
    session.treatAt = -1;
    const w = game.dogWalk;
    if (w) {
      w.say = 'Gnam! ❤️';
      w.sayUntil = now() + 1.5;
    }
    return -1;
  }
  return k;
}

// ---------------------------------------------------------------- pannello

let hudKey = '';
/** Mostra "Addestra cane" o i tre comandi, con quanto obbedisce adesso. */
export function updateTrainingHud(): void {
  const s = session;
  const show = s ? 'cmds' : canTrain() ? 'start' : '';
  const ready = s?.phase === 'ready';
  const canTreat = !!s && (s.phase === 'ready' || s.phase === 'act');
  const tr = dogState()?.train;
  const key = [show, ready, canTreat, tr?.sit || 0, tr?.paw || 0].join('|');
  if (key === hudKey) return;
  hudKey = key;
  dom('dog-train')?.classList.toggle('hidden', !show);
  dom('btn-dog-train')?.classList.toggle('hidden', show !== 'start');
  dom('dog-train-cmds')?.classList.toggle('hidden', show !== 'cmds');
  for (const id of ['btn-dog-sit', 'btn-dog-paw']) {
    const b = dom(id) as HTMLButtonElement | null;
    if (b) b.disabled = !ready;
  }
  const treat = dom('btn-dog-treat') as HTMLButtonElement | null;
  if (treat) treat.disabled = !canTreat;
  const skill = dom('dog-train-skill');
  if (skill)
    skill.textContent = `🎓 Obbedisce: seduto ${chancePercent('sit', tr)}% · zampa ${chancePercent('paw', tr)}%`;
}
