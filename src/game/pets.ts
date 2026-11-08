// Animali domestici nel gioco: negozio, casette nella stanza, cane e gatto che girano per la stanza,
// fame con le sue barre, cibo e passeggiata col guinzaglio. Le regole sono in pet-rules.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { sendNotify } from './needs.js';
import { openDialog } from './interface.js';
import { hasRoom, isMyRoomNow, publishRoomLayout, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { spendMoney } from './economy.js';
import { collidesAt, getSolidObstacles } from './engine.js';
import { pushOutOfCorridor } from './room-layout.js';
import {
  collarPoint,
  drawFoodBowl,
  drawLeash,
  drawPetBubble,
  drawQuadruped,
  drawTreat,
  muzzlePoint,
} from './render/pets.js';
import {
  trainingHoldsOwner,
  trainingPose,
  treatProgress,
  updateTraining,
  updateTrainingHud,
} from './dog-training.js';
import { type DogMode, clampToPark, inDogPark, nextDogMode, parkSpot } from './dog-park-rules.js';
import {
  PETS,
  PET_NAME_MAX,
  capitalized,
  petCalled,
  petNameError,
  toPetCalled,
  cleanPetName,
  PET_FOOD_PRICE,
  PET_HUNGRY,
  PET_KINDS,
  PET_DEATH_SADNESS,
  PET_STARVE_MS,
  type PetBook,
  type PetKind,
  buyPetError,
  feedPet,
  newPet,
  petHunger,
  petIsDead,
  petStarvesAt,
  petDiesAt,
  petCompanyPerHour,
  PET_DYING_WARN_MS,
  PET_HUNGER_DEPLETION_SEC,
} from './pet-rules.js';

/** Ambienti in cui si può portare il cane al guinzaglio (l'appartamento, il cortile e il parco). */
const WALK_ENVS = new Set([
  'PLAYER_ROOM',
  'SALOON',
  'KITCHEN',
  'BATHROOM',
  'CORTILE',
  'passeggiata',
]);

/** Dove compaiono le casette appena comprate (poi si spostano come i mobili). */
const HOME_SPOTS: Partial<Record<PetKind, { x: number; y: number }>> = {
  bird: { x: -30, y: 60 },
  hamster: { x: 40, y: 150 },
  snake: { x: -150, y: 140 },
  fish: { x: 150, y: 140 },
};
const HOME_NAME: Partial<Record<PetKind, string>> = {
  bird: "Gabbia dell'uccellino 🐦",
  hamster: 'Gabbia del criceto 🐹',
  snake: 'Teca del serpente 🐍',
  fish: 'Acquario del pesce 🐟',
};
const KEY: Record<PetKind, string> = {
  dog: 'petDog',
  cat: 'petCat',
  bird: 'petBird',
  hamster: 'petHamster',
  snake: 'petSnake',
  fish: 'petFish',
};
export const PET_OF_KEY: Record<string, PetKind> = Object.fromEntries(
  PET_KINDS.map((k) => [KEY[k], k]),
) as Record<string, PetKind>;

const book = (): PetBook => (game.player.pets ??= {});
// la fame degli animali scende a metà della velocità di quella del giocatore
const depletion = (): number => PET_HUNGER_DEPLETION_SEC;
const hungerOf = (kind: PetKind): number => {
  const p = book()[kind];
  return p ? petHunger(p, Date.now(), depletion()) : 100;
};
/** "al cane", "all'uccellino"… */
const toPet = (kind: PetKind) => toPetCalled(kind, book()[kind]);
/** «Fido», oppure «il tuo cane». */
const called = (kind: PetKind) => petCalled(kind, book()[kind]);
/** Il nome da mostrare sull'etichetta: il suo, oppure quello della specie. */
const shownName = (kind: PetKind) => book()[kind]?.name || PETS[kind].name;
/** Etichetta della casetta: «Gabbia di Titti 🐦», oppure «Gabbia dell'uccellino 🐦». */
function homeName(kind: PetKind): string {
  const name = book()[kind]?.name;
  const info = PETS[kind];
  return name ? `${info.home} di ${name} ${info.emoji}` : HOME_NAME[kind] || info.name;
}

// ---------------------------------------------------------------- nome

/**
 * Dai un nome al tuo animale (o cambialo). `first`: appena comprato, si può anche saltare.
 * Restituisce true se il nome è cambiato.
 */
export async function renamePet(kind: PetKind, first = false): Promise<boolean> {
  const st = book()[kind];
  if (!st) return false;
  const info = PETS[kind];
  let hint = '';
  for (;;) {
    const res: GameValue = await openDialog({
      title: first
        ? `${info.emoji} Come lo chiami?`
        : `${info.emoji} Il nome ${toPet(kind).replace(/^a /, 'di ')}`,
      text:
        (first
          ? `Dai un nome al tuo ${info.name}: lo vedrai nei messaggi e sulla sua fame, e lo vedranno anche gli amici che passano a trovarti.`
          : 'Scegli un nuovo nome (al massimo ' + PET_NAME_MAX + ' caratteri).') +
        (hint ? '\n\n❌ ' + hint : ''),
      input: {
        placeholder: 'Es. Fido, Micia, Nemo…',
        maxLength: PET_NAME_MAX,
        value: st.name || '',
      },
      buttons: [
        { label: '✅ Conferma', value: 'ok', color: '#27ae60' },
        ...(st.name && !first
          ? [{ label: '🗑️ Togli il nome', value: 'clear', color: '#e67e22' }]
          : []),
        { label: first ? 'Più tardi' : 'Annulla', value: null },
      ],
    });
    if (!book()[kind]) return false;
    if (res.action === 'clear') {
      delete st.name;
      break;
    }
    if (res.action !== 'ok') return false;
    const error = petNameError(String(res.value || ''));
    if (error) {
      hint = error;
      continue;
    }
    st.name = cleanPetName(res.value)!;
    break;
  }
  const home = homes.get(kind);
  if (home) home.name = homeName(kind);
  rowsKey = '-'; // la barra della fame mostra il nome nuovo
  sfx('success');
  toast(
    st.name ? `${info.emoji} Ciao ${st.name}!` : `${info.emoji} Ora è di nuovo «${info.name}».`,
    3000,
  );
  saveGame(true);
  publishRoomLayout();
  return true;
}

// ---------------------------------------------------------------- negozio

export async function buyPet(kind: PetKind): Promise<void> {
  if (!hasRoom()) {
    toast('Ti serve una stanza per tenere un animale.', 3500);
    return;
  }
  const info = PETS[kind];
  const error = buyPetError(book(), kind, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return;
  }
  const where = info.free
    ? 'Girerà per la tua stanza e ti verrà spesso vicino.'
    : `Starà nella sua ${info.home!.toLowerCase()}, che potrai spostare come un mobile.`;
  const res: GameValue = await openDialog({
    title: `${info.emoji} Un ${info.name} tutto per te`,
    text:
      `Costa ${info.price} Đ. ${where}\n\n` +
      `Ricordati di dargli da mangiare: la sua fame scende come la tua, ` +
      `e ogni porzione (${PET_FOOD_PRICE} Đ) gli dà +50%.`,
    buttons: [
      { label: `Compra (${info.price} Đ)`, value: 'buy', color: '#27ae60' },
      { label: 'Annulla', value: null },
    ],
  });
  if (res.action !== 'buy') return;
  if (buyPetError(book(), kind, game.moneyLevel)) return;
  if (!(await spendMoney(info.price))) {
    toast('Pagamento non riuscito, riprova.');
    return;
  }
  const spot = HOME_SPOTS[kind];
  let pos = spot;
  if (spot && info.w && info.h)
    pos = pushOutOfCorridor({ x: spot.x, y: spot.y, w: info.w, h: info.h });
  book()[kind] = newPet(Date.now(), pos);
  homes.delete(kind);
  sfx('success');
  saveGame(true);
  publishRoomLayout();
  await renamePet(kind, true);
  toast(`${info.emoji} ${capitalized(called(kind))} ti aspetta nella tua stanza!`, 4500);
}

// ---------------------------------------------------------------- casette nella stanza

/** Le casette restano gli stessi oggetti, così quando le sposti la posizione non si perde. */
const homes = new Map<PetKind, GameValue>();

/** Gabbie, teca e acquario da aggiungere alla mappa della propria stanza. */
export function petRoomItems(): Record<string, GameValue> {
  const out: Record<string, GameValue> = {};
  for (const kind of PET_KINDS) {
    const info = PETS[kind];
    const st = book()[kind];
    if (info.free || !st) continue;
    let item = homes.get(kind);
    if (!item) {
      const spot = HOME_SPOTS[kind]!;
      item = {
        x: st.x ?? spot.x,
        y: st.y ?? spot.y,
        rot: st.rot || 0,
        w: info.w,
        h: info.h,
        z: info.z,
        name: homeName(kind),
        pet: kind,
        moveable: true,
      };
      homes.set(kind, item);
    }
    out[KEY[kind]] = item;
  }
  return out;
}

/** Prima di salvare: la posizione delle casette (spostate come mobili) torna nello stato. */
export function syncPetHomes(): void {
  for (const [kind, item] of homes) {
    const st = book()[kind];
    if (!st) continue;
    st.x = Math.round(item.x);
    st.y = Math.round(item.y);
    if (item.rot) st.rot = item.rot;
    else delete st.rot;
  }
}

/** Animali liberi da far vedere a chi visita la stanza (cane e gatto, se non sono a spasso). */
export function freePetsForLayout(): Record<string, GameValue> {
  const out: Record<string, GameValue> = {};
  for (const kind of ['dog', 'cat'] as const)
    if (book()[kind] && !(kind === 'dog' && game.dogWalk))
      out[KEY[kind]] = { x: 0, y: 0, w: 1, h: 1, z: 1, name: shownName(kind), free: kind };
  return out;
}

// ---------------------------------------------------------------- cane e gatto che girano

interface Roamer {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  moving: boolean;
  /** Quando scegliere una nuova meta (secondi di gioco). */
  nextAt: number;
  say: string;
  sayUntil: number;
  nextSayAt: number;
  room: string;
}
const roamers = new Map<PetKind, Roamer>();
let lastT = 0;

/** Cani e gatti presenti nella stanza in cui ci si trova (i propri, o quelli di chi abita qui). */
function freePetsHere(): PetKind[] {
  if (game.view.activeEnvironment !== 'PLAYER_ROOM') return [];
  if (isMyRoomNow())
    return (['dog', 'cat'] as const).filter((k) => book()[k] && !(k === 'dog' && game.dogWalk));
  return (game.visitFreePets || []) as PetKind[];
}

function randomSpot(obstacles: GameValue[]): { x: number; y: number } {
  for (let i = 0; i < 20; i++) {
    const x = game.X0 + 45 + Math.random() * (game.X1 - game.X0 - 90);
    const y = game.Y0 + 45 + Math.random() * (game.Y1 - game.Y0 - 90);
    if (!collidesAt(x, y, obstacles)) return { x, y };
  }
  return { x: 0, y: 60 };
}

/** Ogni fotogramma: cani e gatti scelgono dove andare, ogni tanto vengono dal giocatore. */
export function updatePets(t: number): void {
  const dt = Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  updateDogWalk(dt);
  updateTrainingHud();
  applyCompany(dt);
  const here = freePetsHere();
  const roomKey = `${game.view.activeEnvironment}:${game.currentRoomIdx}`;
  for (const kind of [...roamers.keys()]) if (!here.includes(kind)) roamers.delete(kind);
  if (feeding && !here.includes(feeding.kind)) feeding = null;
  if (!here.length) return;
  const obstacles = getSolidObstacles();
  const mine = isMyRoomNow();
  for (const kind of here) {
    let r = roamers.get(kind);
    if (!r || r.room !== roomKey) {
      const p = game.dogLeftAt && kind === 'dog' ? game.dogLeftAt : randomSpot(obstacles);
      game.dogLeftAt = null;
      r = {
        x: p.x,
        y: p.y,
        tx: p.x,
        ty: p.y,
        dx: 1,
        dy: 0,
        moving: false,
        nextAt: t + 1,
        say: '',
        sayUntil: 0,
        nextSayAt: t + 4,
        room: roomKey,
      };
      roamers.set(kind, r);
    }
    if (feeding?.kind === kind) {
      feedStep(r, dt, t);
      continue;
    }
    const hungry = mine && hungerOf(kind) < PET_HUNGRY;
    if (!r.moving && t >= r.nextAt) {
      // spesso dal padrone (ancora più spesso se ha fame), se no un posto a caso
      const toOwner = mine && Math.random() < (hungry ? 0.8 : 0.45);
      if (toOwner) {
        const a = Math.random() * Math.PI * 2;
        r.tx = game.playerPos.x + Math.cos(a) * 26;
        r.ty = game.playerPos.y + Math.sin(a) * 26;
      } else {
        const p = randomSpot(obstacles);
        r.tx = p.x;
        r.ty = p.y;
      }
      r.moving = true;
    }
    if (r.moving) {
      const speed = kind === 'dog' ? 60 : 45;
      const ddx = r.tx - r.x,
        ddy = r.ty - r.y;
      const d = Math.hypot(ddx, ddy);
      if (d < 3) {
        r.moving = false;
        r.nextAt = t + 2 + Math.random() * (kind === 'cat' ? 6 : 4);
      } else {
        const step = Math.min(d, speed * dt);
        const nx = r.x + (ddx / d) * step,
          ny = r.y + (ddy / d) * step;
        r.dx = ddx;
        r.dy = ddy;
        if (collidesAt(nx, ny, obstacles) && !collidesAt(r.x, r.y, obstacles)) {
          // c'è un mobile in mezzo: cambia idea
          r.moving = false;
          r.nextAt = t + 0.5;
        } else {
          r.x = Math.max(game.X0 + 20, Math.min(game.X1 - 20, nx));
          r.y = Math.max(game.Y0 + 20, Math.min(game.Y1 - 20, ny));
        }
      }
    }
    // con la fame si lamenta quando il padrone è vicino
    if (
      hungry &&
      t >= r.nextSayAt &&
      Math.hypot(game.playerPos.x - r.x, game.playerPos.y - r.y) < 110
    ) {
      r.say = kind === 'dog' ? 'Bau! Bau! 🍖' : 'Miaooo! 🍖';
      r.sayUntil = t + 2.5;
      r.nextSayAt = t + 8 + Math.random() * 6;
    }
  }
}

/** Cani e gatti da disegnare nella scena (con il loro fumetto). */
export function petDrawables(t: number, drawables: GameValue[], labels: GameValue[]): void {
  for (const [kind, r] of roamers) {
    drawables.push({
      depth: r.x + r.y,
      draw: () =>
        drawQuadruped(kind as 'dog' | 'cat', r.x, r.y, t, {
          moving: r.moving,
          dx: r.dx,
          dy: r.dy,
          eat: feeding?.kind === kind && feeding.phase === 'eat' ? 1 : 0,
        }),
    });
    if (t < r.sayUntil) labels.push(() => drawPetBubble(r.x, r.y, 26, r.say));
  }
  const bowl = bowlNow(t);
  if (bowl && feeding) {
    const kind = feeding.kind;
    // per terra si ordina con gli altri; in mano sta davanti al padrone
    drawables.push({
      depth: bowl.x + bowl.y + (bowl.z > 0.5 ? 1 : 0),
      draw: () => drawFoodBowl(bowl.x, bowl.y, bowl.z, bowl.food, kind),
    });
  }
  const w = game.dogWalk;
  if (w && WALK_ENVS.has(game.view.activeEnvironment)) {
    // durante l'addestramento si siede, dà la zampa o abbaia
    const pose = trainingPose();
    drawables.push({
      depth: w.x + w.y,
      draw: () =>
        drawQuadruped('dog', w.x, w.y, t, {
          moving: w.moving,
          dx: w.dx,
          dy: w.dy,
          ...(pose ? { sit: pose.sit, paw: pose.paw, bark: pose.bark } : {}),
        }),
    });
    const px = game.playerPos.x,
      py = game.playerPos.y;
    // nell'area cani corre libero: niente guinzaglio finché non torna dal padrone
    if ((w.mode || 'leash') === 'leash')
      labels.push(() => drawLeash(px, py, collarPoint(w.x, w.y, w.dx, w.dy)));
    // il premietto passa dalla mano del padrone al muso del cane
    const treat = treatProgress();
    if (treat >= 0) labels.push(() => drawTreat(px, py, muzzlePoint(w.x, w.y, w.dx, w.dy), treat));
    if (t < (w.sayUntil || 0)) labels.push(() => drawPetBubble(w.x, w.y, 26, w.say));
  }
}

/** Cane o gatto vicino al giocatore (per il pulsante "dai da mangiare"). */
export function petSpots(): Record<string, GameValue> {
  const out: Record<string, GameValue> = {};
  if (!isMyRoomNow() || game.view.activeEnvironment !== 'PLAYER_ROOM') return out;
  for (const [kind, r] of roamers)
    out[KEY[kind]] = { x: r.x, y: r.y, w: 20, h: 12, reach: 0, pet: kind, name: shownName(kind) };
  return out;
}

// ---------------------------------------------------------------- cibo

/** Dà una porzione di cibo all'animale: 5 Đ e +50% di fame. */
export async function feed(kind: PetKind): Promise<void> {
  const st = book()[kind];
  if (!st) return;
  if (hungerOf(kind) >= 99.5) {
    toast(`${PETS[kind].emoji} ${capitalized(called(kind))} è già sazio!`);
    return;
  }
  if (feeding) {
    toast('🥣 Sta già mangiando!', 2500);
    return;
  }
  if (game.moneyLevel < PET_FOOD_PRICE) {
    toast(`Ti servono ${PET_FOOD_PRICE} Đ in cassaforte per il cibo.`);
    sfx('error');
    return;
  }
  if (!(await spendMoney(PET_FOOD_PRICE))) {
    toast('Pagamento non riuscito, riprova.');
    return;
  }
  book()[kind] = { ...feedPet(st, Date.now(), depletion()), ...pick(st) };
  sfx('coin');
  toast(`${PETS[kind].emoji} Hai dato da mangiare ${toPet(kind)} (Fame +50%)`, 3000);
  // cane e gatto nella stanza: la ciotola per terra (il fumetto arriva quando hanno finito)
  if ((kind === 'dog' || kind === 'cat') && roamers.has(kind)) startFeeding(kind);
  else saySatisfied(kind);
  saveGame();
}

/** "Gnam!" sopra l'animale (o la sua casetta) dopo che ha mangiato. */
function saySatisfied(kind: PetKind): void {
  const r = roamers.get(kind) || (kind === 'dog' ? game.dogWalk : null);
  if (r) {
    r.say = kind === 'dog' ? 'Gnam! 🐶❤️' : kind === 'cat' ? 'Purrr… 🐱❤️' : 'Gnam! ❤️';
    r.sayUntil = game.animClock + 2.5;
    r.nextSayAt = game.animClock + 10;
  } else homeSays.set(kind, { text: 'Gnam! ❤️', until: game.animClock + 2.5 });
}

// ---------------------------------------------------------------- la pappa nella ciotola
//
// Il padrone mette la ciotola per terra fra sé e l'animale, l'animale ci va, mangia (il cibo
// cala) e alla fine il padrone riprende la ciotola vuota. Intanto il padrone resta fermo.

interface Feeding {
  kind: 'dog' | 'cat';
  phase: 'place' | 'come' | 'eat' | 'pick';
  /** Inizio della fase (animClock). */
  since: number;
  /** Dove sta la ciotola per terra, e dove stava il padrone quando l'ha messa giù. */
  bowl: { x: number; y: number };
  from: { x: number; y: number };
}
let feeding: Feeding | null = null;
const PLACE_S = 0.7;
const EAT_S = 3.2;
const PICK_S = 0.6;

function startFeeding(kind: 'dog' | 'cat'): void {
  const r = roamers.get(kind)!;
  const px = game.playerPos.x,
    py = game.playerPos.y;
  // la ciotola va per terra davanti al padrone, dalla parte dell'animale
  let dx = r.x - px,
    dy = r.y - py;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    dx = 0;
    dy = 1;
  } else {
    dx /= d;
    dy /= d;
  }
  const bx = Math.max(game.X0 + 20, Math.min(game.X1 - 20, px + dx * 26)),
    by = Math.max(game.Y0 + 20, Math.min(game.Y1 - 20, py + dy * 26));
  feeding = {
    kind,
    phase: 'place',
    since: game.animClock,
    bowl: { x: bx, y: by },
    from: { x: px, y: py },
  };
  r.moving = false;
  game.mySay = kind === 'dog' ? 'Ecco la pappa! 🥣' : 'Ecco i croccantini! 🥣';
  game.mySayT = Date.now() - 3800; // il fumetto dura 6 s da qui: un paio di secondi
  sfx('click');
}

/** Il padrone non si muove finché non ha ripreso la ciotola. */
export const isFeedingPet = (): boolean => !!feeding;

/** Ogni fotogramma, per l'animale che sta mangiando (al posto del solito girovagare). */
function feedStep(r: Roamer, dt: number, t: number): void {
  const f = feeding!;
  const e = t - f.since;
  const next = (phase: Feeding['phase']) => {
    f.phase = phase;
    f.since = t;
  };
  if (f.phase === 'place') {
    r.moving = false;
    if (e >= PLACE_S) next('come');
    return;
  }
  if (f.phase === 'come') {
    // si mette accanto alla ciotola, dalla sua parte, e la guarda
    let ax = r.x - f.bowl.x,
      ay = r.y - f.bowl.y;
    const ad = Math.hypot(ax, ay) || 1;
    ax /= ad;
    ay /= ad;
    const ex = f.bowl.x + ax * 10,
      ey = f.bowl.y + ay * 10;
    const ddx = ex - r.x,
      ddy = ey - r.y;
    const d = Math.hypot(ddx, ddy);
    if (d < 1.5 || e > 4) {
      r.x = ex;
      r.y = ey;
      r.moving = false;
      r.dx = f.bowl.x - r.x;
      r.dy = f.bowl.y - r.y;
      next('eat');
      sfx('munch');
      r.say = f.kind === 'dog' ? 'Gnam gnam 😋' : 'Gnam… 😋';
      r.sayUntil = t + EAT_S;
      return;
    }
    const step = Math.min(d, (f.kind === 'dog' ? 75 : 60) * dt);
    r.x += (ddx / d) * step;
    r.y += (ddy / d) * step;
    r.dx = ddx;
    r.dy = ddy;
    r.moving = true;
    return;
  }
  if (f.phase === 'eat') {
    r.moving = false;
    r.dx = f.bowl.x - r.x;
    r.dy = f.bowl.y - r.y;
    if (e >= EAT_S) {
      next('pick');
      r.say = f.kind === 'dog' ? 'Bau! 🐶❤️' : 'Purrr… 🐱❤️';
      r.sayUntil = t + 2.5;
      r.nextSayAt = t + 10;
    }
    return;
  }
  // il padrone riprende la ciotola vuota; poi l'animale torna a girare
  if (e >= PICK_S) {
    feeding = null;
    r.nextAt = t + 1.2;
  }
}

/** Dove si disegna la ciotola adesso: scende dalla mano, sta per terra, risale. */
function bowlNow(t: number): { x: number; y: number; z: number; food: number } | null {
  const f = feeding;
  if (!f) return null;
  const e = t - f.since;
  const ease = (k: number) => {
    const c = Math.max(0, Math.min(1, k));
    return c * c * (3 - 2 * c);
  };
  // la mano del padrone: un po' davanti a lui, verso la ciotola
  const hx = f.from.x + (f.bowl.x - f.from.x) * 0.45,
    hy = f.from.y + (f.bowl.y - f.from.y) * 0.45;
  const at = (k: number, food: number) => ({
    x: hx + (f.bowl.x - hx) * k,
    y: hy + (f.bowl.y - hy) * k,
    z: 20 * (1 - k),
    food,
  });
  if (f.phase === 'place') return at(ease(e / PLACE_S), 1);
  if (f.phase === 'come') return at(1, 1);
  if (f.phase === 'eat') return at(1, 1 - e / EAT_S);
  return at(1 - ease(e / PICK_S), 0);
}
const pick = (st: GameValue) => ({
  ...(st.x !== undefined ? { x: st.x, y: st.y } : {}),
  ...(st.rot ? { rot: st.rot } : {}),
});

/** Fumetto sopra le casette (dopo aver dato da mangiare, o quando hanno fame). */
const homeSays = new Map<PetKind, { text: string; until: number }>();
export function homeBubble(kind: PetKind, t: number): string {
  const s = homeSays.get(kind);
  if (s && t < s.until) return s.text;
  if (isMyRoomNow() && hungerOf(kind) < PET_HUNGRY && Math.floor(t / 4) % 3 === 0) return '🍖?';
  return '';
}

// ---------------------------------------------------------------- passeggiata col guinzaglio

/** Mette il guinzaglio al cane: ti segue nell'appartamento e nel cortile. */
export function startDogWalk(): void {
  const r = roamers.get('dog');
  if (!r || game.dogWalk) return;
  game.dogWalk = {
    x: r.x,
    y: r.y,
    dx: r.dx,
    dy: r.dy,
    moving: false,
    say: 'Bau! 🦮',
    sayUntil: game.animClock + 2,
    nextSayAt: 0,
    env: game.view.activeEnvironment,
    mode: 'leash' as DogMode,
  };
  roamers.delete('dog');
  sfx('click');
  toast(
    '🦮 Hai messo il guinzaglio al cane: ti seguirà nell’appartamento, nel cortile e al parco.',
    4000,
  );
  // subito dopo, dove si va ad addestrarlo
  lifetime.setTimeout(
    () =>
      toast(
        '🎓 Esci di casa e vai alla Passeggiata: nell’area cani del parco puoi addestrare il tuo cane!',
        6000,
      ),
    1500,
  );
  publishRoomLayout();
}

/** Toglie il guinzaglio: il cane resta nella stanza. */
export function leaveDogHome(): void {
  const w = game.dogWalk;
  if (!w) return;
  game.dogLeftAt = { x: w.x, y: w.y };
  game.dogWalk = null;
  toast('🏠 Il cane resta a casa.', 2500);
  publishRoomLayout();
}

function updateDogWalk(dt: number): void {
  const w = game.dogWalk;
  const btn = dom('btn-leave-dog');
  if (!w) {
    btn?.classList.add('hidden');
    return;
  }
  if (!book().dog) {
    game.dogWalk = null;
    return;
  }
  const env = game.view.activeEnvironment;
  if (!WALK_ENVS.has(env)) {
    // nei negozi e negli altri posti il cane non viene: torna da solo nella stanza
    game.dogWalk = null;
    toast('🐶 Il cane è tornato da solo nella tua stanza.', 3500);
    publishRoomLayout();
    btn?.classList.add('hidden');
    return;
  }
  btn?.classList.toggle('hidden', !(env === 'PLAYER_ROOM' && isMyRoomNow()));
  const px = game.playerPos.x,
    py = game.playerPos.y;
  if (w.env !== env) {
    // si cambia stanza insieme: il cane compare accanto al giocatore, al guinzaglio
    w.env = env;
    w.x = px - 22;
    w.y = py + 10;
    w.mode = 'leash';
  }
  // area cani: entrando si slega, col fischio torna e si rimette il guinzaglio
  const before: DogMode = w.mode || 'leash';
  const inPark = env === 'passeggiata' && inDogPark(px, py);
  const atOwner = Math.hypot(px - w.x, py - w.y) < DOG_AT_OWNER;
  if (!inPark) w.leavingPark = false;
  w.mode = w.leavingPark ? 'leash' : nextDogMode(before, inPark, atOwner);
  if (before === 'leash' && w.mode === 'free') unleashInPark(w);
  else if (before === 'called' && w.mode === 'leash') leashAndLeave(w);
  // libero: corre per il recinto, a meno che non lo si stia addestrando
  if (w.mode === 'free') {
    if (!updateTraining(w, dt)) roamInPark(w, dt);
  } else if (w.mode === 'called') runToOwner(w, dt);
  else followOnLeash(w, dt);
  // anche al guinzaglio si lamenta se ha fame
  if (hungerOf('dog') < PET_HUNGRY && game.animClock >= (w.nextSayAt || 0)) {
    w.say = 'Bau! Bau! 🍖';
    w.sayUntil = game.animClock + 2.5;
    w.nextSayAt = game.animClock + 10;
  }
}

/** Il cane al guinzaglio sta a questa distanza dal padrone; se è più lontano viene tirato. */
const LEASH = 28;
/** Il cane richiamato è arrivato quando è così vicino al padrone. */
const DOG_AT_OWNER = 26;

function followOnLeash(w: GameValue, dt: number): void {
  const ddx = game.playerPos.x - w.x,
    ddy = game.playerPos.y - w.y;
  const d = Math.hypot(ddx, ddy);
  if (d > LEASH) {
    const k = Math.min(1, dt * 8);
    w.x += (ddx / d) * (d - LEASH) * k;
    w.y += (ddy / d) * (d - LEASH) * k;
    w.dx = ddx;
    w.dy = ddy;
    w.moving = true;
  } else w.moving = false;
}

/** Fa un passo verso (tx, ty) a `speed` al secondo; dice se è arrivato. */
function stepDog(w: GameValue, tx: number, ty: number, speed: number, dt: number): boolean {
  const ddx = tx - w.x,
    ddy = ty - w.y;
  const d = Math.hypot(ddx, ddy);
  if (d < 3) return true;
  const step = Math.min(d, speed * dt);
  w.x += (ddx / d) * step;
  w.y += (ddy / d) * step;
  w.dx = ddx;
  w.dy = ddy;
  return false;
}

// ---------------------------------------------------------------- area cani del parco

const PARK_BARKS = ['Bau! 🎾', 'Woof! 🐾', 'Bau bau! 💨', 'Arf! 🐶'];

function unleashInPark(w: GameValue): void {
  w.moving = false;
  w.nextAt = game.animClock + 0.6;
  w.say = 'Bau! Bau! 🎉';
  w.sayUntil = game.animClock + 2;
  w.nextSayAt = game.animClock + 6;
  sfx('click');
  toast('🐕 Hai sciolto il guinzaglio: il cane è libero di correre nell’area cani!', 3500);
}

/** Libero nel recinto: corre di qua e di là, ogni tanto torna dal padrone e abbaia. */
function roamInPark(w: GameValue, dt: number): void {
  const t = game.animClock;
  if (!w.moving && t >= (w.nextAt || 0)) {
    const toOwner = Math.random() < 0.35;
    const a = Math.random() * Math.PI * 2;
    const p = toOwner
      ? clampToPark(game.playerPos.x + Math.cos(a) * 24, game.playerPos.y + Math.sin(a) * 24)
      : parkSpot(Math.random(), Math.random());
    w.tx = p.x;
    w.ty = p.y;
    w.run = !toOwner && Math.random() < 0.6;
    w.moving = true;
  }
  if (w.moving && stepDog(w, w.tx, w.ty, w.run ? 115 : 65, dt)) {
    w.moving = false;
    w.nextAt = t + 0.8 + Math.random() * 2.5;
  }
  const c = clampToPark(w.x, w.y);
  w.x = c.x;
  w.y = c.y;
  if (t >= (w.nextSayAt || 0)) {
    w.say = PARK_BARKS[Math.floor(Math.random() * PARK_BARKS.length)];
    w.sayUntil = t + 2;
    w.nextSayAt = t + 7 + Math.random() * 6;
  }
}

/** Dopo il fischio corre dal padrone (se resta incastrato, dopo un po' arriva comunque). */
function runToOwner(w: GameValue, dt: number): void {
  const px = game.playerPos.x,
    py = game.playerPos.y;
  w.moving = true;
  if (game.animClock - (w.calledAt || 0) > 4) {
    w.x = px - 20;
    w.y = py + 8;
    return;
  }
  const d = Math.hypot(px - w.x, py - w.y);
  if (d > DOG_AT_OWNER - 6) stepDog(w, px, py, 170, dt);
}

/** Arrivato dal fischio: guinzaglio, e si esce insieme dal cancello. */
function leashAndLeave(w: GameValue): void {
  w.say = 'Bau! ❤️';
  w.sayUntil = game.animClock + 2;
  w.moving = false;
  toast('🦮 Il cane è tornato di corsa: gli hai rimesso il guinzaglio.', 3500);
  w.leavingPark = true;
}

/** Il cane richiamato arriva, si va al centro per l'addestramento o l'animale mangia: il padrone resta fermo. */
export function petHoldsOwner(): boolean {
  return game.dogWalk?.mode === 'called' || trainingHoldsOwner() || isFeedingPet();
}

/** Testo del pulsante del cancello dell'area cani, da fuori e da dentro. */
export function dogGatePrompt(): { text: string; locked?: boolean } {
  const w = game.dogWalk;
  if (!inDogPark(game.playerPos.x, game.playerPos.y))
    return { text: w ? '🐕 Entra nell’area cani e sciogli il cane' : '🐕 Entra nell’area cani' };
  if (w?.mode === 'called') return { text: '😗 Il cane sta arrivando…', locked: true };
  if (w?.mode === 'free') return { text: '😗 Fischia al cane ed esci' };
  return { text: '🚪 Esci dall’area cani' };
}

/** Il pulsante del cancello: si entra, oppure si fischia al cane (o si esce, se non c'è). */
export function useDogGate(): void {
  const w = game.dogWalk;
  if (!inDogPark(game.playerPos.x, game.playerPos.y)) {
    toast('Attraversa il cancello camminando per entrare nell’area cani.', 3500);
    if (!w && book().dog)
      toast(
        '🐶 Il tuo cane è a casa: mettigli il guinzaglio nella tua stanza e portalo qui!',
        4000,
      );
    return;
  }
  if (w?.mode === 'called') return;
  if (w?.mode !== 'free') {
    toast('Attraversa il cancello camminando per uscire dall’area cani.', 3500);
    return;
  }
  w.mode = 'called';
  w.calledAt = game.animClock;
  w.moving = true;
  w.say = '❗';
  w.sayUntil = game.animClock + 1.2;
  // il fischio si vede sopra il giocatore (anche dagli altri) per un paio di secondi: il fumetto
  // dura 6 s da mySayT, che quindi parte un po' nel passato
  game.mySay = 'Fiiiù! 🎵';
  game.mySayT = Date.now() - 3500;
  sfx('whistle');
}

// ---------------------------------------------------------------- barre della fame

let rowsKey = '';
/** Una barra "Fame (cane)" per ogni animale, nel pannello dei bisogni. */
export function updatePetHud(): void {
  checkPetHealth();
  const box = dom('pet-rows');
  if (!box) return;
  const kinds = PET_KINDS.filter((k) => book()[k]);
  // anche il nome: cambiandolo la barra si rifà
  const key = kinds.map((k) => k + ':' + shownName(k)).join(',');
  if (key !== rowsKey) {
    rowsKey = key;
    box.innerHTML = kinds
      .map(
        (k) => `<div class="need-row pet-row">
      <div class="need-info"><span>${PETS[k].emoji} Fame (${shownName(k)}) <button type="button" class="pet-rename" data-pet="${k}" title="Dai un nome">✏️</button></span><span id="pet-text-${k}"></span></div>
      <div class="bar-bg"><div id="pet-bar-${k}" class="bar-fill" style="width: 0%; background: #e1b12c"></div></div>
    </div>`,
      )
      .join('');
    (box as HTMLElement).querySelectorAll<HTMLElement>('[data-pet]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        // solo la matita: il resto del pannello passa dalle percentuali alle barre
        e.stopPropagation();
        void renamePet(btn.dataset.pet as PetKind);
      }),
    );
  }
  for (const k of kinds) {
    const v = hungerOf(k);
    const bar = dom('pet-bar-' + k),
      txt = dom('pet-text-' + k);
    if (bar) {
      bar.style.width = Math.round(v) + '%';
      bar.style.background = v < PET_HUNGRY ? '#ff6b6b' : '#e1b12c';
    }
    // 💞 = in questo momento ti tiene compagnia e ti rende più felice
    if (txt) txt.textContent = (company.kind === k ? '💞 ' : '') + Math.round(v) + '%';
  }
}

// ---------------------------------------------------------------- adozione e morte

/** Toglie l'animale dal gioco (casetta, cane o gatto in giro, guinzaglio). */
function removePet(kind: PetKind): void {
  delete book()[kind];
  homes.delete(kind);
  roamers.delete(kind);
  starvingWarned.delete(kind);
  dyingWarned.delete(kind);
  if (kind === 'dog') {
    game.dogWalk = null;
    game.dogLeftAt = null;
  }
  rowsKey = '-'; // le barre della fame vanno rifatte
}

/** Al bancone del negozio: si sceglie un animale da dare in adozione (i soldi non tornano). */
export async function giveUpForAdoption(): Promise<void> {
  const kinds = PET_KINDS.filter((k) => book()[k]);
  if (!kinds.length) {
    toast('🏡 Non hai animali da dare in adozione.');
    return;
  }
  const res: GameValue = await openDialog({
    title: '🏡 Dare in adozione',
    text: 'Quale animale vuoi affidare a una nuova famiglia?',
    buttons: [
      ...kinds.map((k) => ({
        label: book()[k]?.name
          ? `${PETS[k].emoji} ${book()[k]!.name} (${PETS[k].name})`
          : `${PETS[k].emoji} Il ${PETS[k].name}`,
        value: k,
      })),
      { label: 'Annulla', value: null },
    ],
  });
  const kind = res.action as PetKind | null;
  if (!kind || !book()[kind]) return;
  const ok: GameValue = await openDialog({
    title: `${PETS[kind].emoji} Sei sicuro?`,
    text: `${capitalized(called(kind))} andrà a vivere con un'altra famiglia e non tornerà più.
I soldi spesi per comprarlo non ti verranno restituiti.`,
    buttons: [
      { label: 'Sì, dallo in adozione', value: 'yes', color: '#e67e22' },
      { label: 'No, lo tengo', value: null },
    ],
  });
  if (ok.action !== 'yes' || !book()[kind]) return;
  const who = capitalized(called(kind));
  removePet(kind);
  sfx('click');
  toast(`🏡 ${who} troverà una nuova famiglia. Ciao ${PETS[kind].emoji}!`, 4500);
  saveGame(true);
  publishRoomLayout();
}

const starvingWarned = new Set<PetKind>();
const dyingWarned = new Set<PetKind>();

/**
 * Controlla gli animali: avvisa quando la fame arriva a zero e, se restano senza cibo per 24 ore,
 * muoiono e il giocatore perde il 50% di felicità. Vale anche per il tempo a gioco chiuso.
 */
function checkPetHealth(): void {
  if (!game.session.saveReady || game.player.isDead) return;
  const now = Date.now();
  for (const kind of PET_KINDS) {
    const st = book()[kind];
    if (!st) continue;
    const info = PETS[kind];
    if (petIsDead(st, now, depletion())) {
      const who = capitalized(called(kind));
      removePet(kind);
      game.player.happinessLevel = Math.max(0, game.player.happinessLevel - PET_DEATH_SADNESS);
      const msg = `💔 ${who} è morto di fame. (Felicità −${PET_DEATH_SADNESS}%)`;
      if (document.hidden) sendNotify('Casa dolce casa', msg, 'sims-pet-' + kind);
      toast(msg, 7000);
      sfx('error');
      saveGame(true);
      publishRoomLayout();
      continue;
    }
    // ultime ore: avviso che sta per morire
    const dyingIn = petDiesAt(st, depletion()) - now;
    if (dyingIn <= PET_DYING_WARN_MS && !dyingWarned.has(kind)) {
      dyingWarned.add(kind);
      starvingWarned.add(kind); // basta questo avviso, non anche quello della fame a zero
      const h = Math.max(1, Math.ceil(dyingIn / 3_600_000));
      const msg = `🆘 ${capitalized(called(kind))} ${info.emoji} sta per morire di fame! Hai ancora ${h} ${h === 1 ? 'ora' : 'ore'} per dargli da mangiare.`;
      sendNotify('🆘 Casa dolce casa: il tuo animale sta per morire', msg, 'sims-pet-' + kind);
      toast(msg, 8000);
      sfx('error');
    } else if (dyingIn > PET_DYING_WARN_MS) dyingWarned.delete(kind);
    const starving = now >= petStarvesAt(st, depletion());
    if (starving && !starvingWarned.has(kind)) {
      starvingWarned.add(kind);
      const hoursLeft = Math.max(
        1,
        Math.ceil((petStarvesAt(st, depletion()) + PET_STARVE_MS - now) / 3_600_000),
      );
      const msg = `⚠️ ${capitalized(called(kind))} ${info.emoji} non mangia da troppo: se non gli dai da mangiare entro ${hoursLeft} ore morirà!`;
      if (document.hidden) sendNotify('⚠️ Casa dolce casa: urgente', msg, 'sims-pet-' + kind);
      else toast(msg, 6000);
    } else if (!starving) starvingWarned.delete(kind);
  }
}

// ---------------------------------------------------------------- compagnia

/** Animale che in questo momento ti tiene compagnia (il più "felicitante" tra quelli vicini). */
const company: { kind: PetKind | null; rate: number } = { kind: null, rate: 0 };
const companyToasted = new Set<string>();
/** Quanto vicino deve essere l'animale per fare compagnia. */
const COMPANY_RANGE = 90;

/**
 * Stare vicino a un proprio animale (che non sta morendo di fame) dà un po' di felicità ogni ora;
 * con il cane al guinzaglio il doppio. Conta solo l'animale migliore, non si sommano.
 */
function applyCompany(dt: number): void {
  company.kind = null;
  company.rate = 0;
  if (!game.session.saveReady || game.player.isDead || game.player.isSleeping) return;
  const px = game.playerPos.x,
    py = game.playerPos.y;
  const consider = (kind: PetKind, x: number, y: number, walking: boolean) => {
    if (hungerOf(kind) <= 0) return; // affamato non fa compagnia
    if (!walking && Math.hypot(px - x, py - y) > COMPANY_RANGE) return;
    const rate = petCompanyPerHour(kind, walking);
    if (rate > company.rate) {
      company.kind = kind;
      company.rate = rate;
    }
  };
  const w = game.dogWalk;
  if (w && WALK_ENVS.has(game.view.activeEnvironment)) consider('dog', w.x, w.y, true);
  if (game.view.activeEnvironment === 'PLAYER_ROOM' && isMyRoomNow()) {
    for (const [kind, r] of roamers) consider(kind, r.x, r.y, false);
    for (const [kind, it] of homes) if (book()[kind]) consider(kind, it.x, it.y, false);
  }
  // (TypeScript non vede che consider() cambia company: lo rileggo così)
  const best = company.kind as PetKind | null;
  if (!best) return;
  game.player.happinessLevel = Math.min(
    100,
    game.player.happinessLevel + (company.rate * dt) / 3600,
  );
  // la prima volta (per animale e modo) spiega cosa succede
  const key = best + (w && best === 'dog' ? ':walk' : '');
  if (!companyToasted.has(key)) {
    companyToasted.add(key);
    const info = PETS[best];
    toast(
      w && best === 'dog'
        ? `🦮 Passeggiare con il tuo cane ti rende felice (+${company.rate}% di felicità all'ora)`
        : `💞 Stare con ${book()[best]?.name || 'il tuo ' + info.name} ti rende felice (+${company.rate}% di felicità all'ora)`,
      4000,
    );
  }
}
