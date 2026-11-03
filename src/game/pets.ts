// Animali domestici nel gioco: negozio, casette nella stanza, cane e gatto che girano per la stanza,
// fame con le sue barre, cibo e passeggiata col guinzaglio. Le regole sono in pet-rules.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { sendNotify } from './needs.js';
import { openDialog } from './interface.js';
import { hasRoom, isMyRoomNow, publishRoomLayout, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { spendMoney } from './economy.js';
import { collidesAt, getSolidObstacles } from './engine.js';
import { pushOutOfCorridor } from './room-layout.js';
import { collarPoint, drawLeash, drawPetBubble, drawQuadruped } from './render/pets.js';
import {
  PETS,
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
} from './pet-rules.js';

/** Ambienti in cui si può portare il cane al guinzaglio (l'appartamento e il cortile). */
const WALK_ENVS = new Set(['PLAYER_ROOM', 'SALOON', 'KITCHEN', 'BATHROOM', 'CORTILE']);

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
const depletion = (): number => game.HUNGER_AWAKE_DEPLETION_SEC;
export const hungerOf = (kind: PetKind): number => {
  const p = book()[kind];
  return p ? petHunger(p, Date.now(), depletion()) : 100;
};
/** "al cane", "all'uccellino"… */
const toPet = (kind: PetKind) =>
  (/^[aeiou]/.test(PETS[kind].name) ? "all'" : 'al ') + PETS[kind].name;

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
      `Costa ${info.price} €. ${where}\n\n` +
      `Ricordati di dargli da mangiare: la sua fame scende come la tua, ` +
      `e ogni porzione (${PET_FOOD_PRICE} €) gli dà +50%.`,
    buttons: [
      { label: `Compra (${info.price} €)`, value: 'buy', color: '#27ae60' },
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
  toast(`${info.emoji} Il tuo ${info.name} ti aspetta nella tua stanza!`, 4500);
  saveGame(true);
  publishRoomLayout();
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
        name: HOME_NAME[kind],
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
      out[KEY[kind]] = { x: 0, y: 0, w: 1, h: 1, z: 1, name: PETS[kind].name, free: kind };
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
  applyCompany(dt);
  const here = freePetsHere();
  const roomKey = `${game.view.activeEnvironment}:${game.currentRoomIdx}`;
  for (const kind of [...roamers.keys()]) if (!here.includes(kind)) roamers.delete(kind);
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
        drawQuadruped(kind as 'dog' | 'cat', r.x, r.y, t, { moving: r.moving, dx: r.dx, dy: r.dy }),
    });
    if (t < r.sayUntil) labels.push(() => drawPetBubble(r.x, r.y, 26, r.say));
  }
  const w = game.dogWalk;
  if (w && WALK_ENVS.has(game.view.activeEnvironment)) {
    drawables.push({
      depth: w.x + w.y,
      draw: () => drawQuadruped('dog', w.x, w.y, t, { moving: w.moving, dx: w.dx, dy: w.dy }),
    });
    const px = game.playerPos.x,
      py = game.playerPos.y;
    labels.push(() => drawLeash(px, py, collarPoint(w.x, w.y, w.dx, w.dy)));
    if (t < (w.sayUntil || 0)) labels.push(() => drawPetBubble(w.x, w.y, 26, w.say));
  }
}

/** Cane o gatto vicino al giocatore (per il pulsante "dai da mangiare"). */
export function petSpots(): Record<string, GameValue> {
  const out: Record<string, GameValue> = {};
  if (!isMyRoomNow() || game.view.activeEnvironment !== 'PLAYER_ROOM') return out;
  for (const [kind, r] of roamers)
    out[KEY[kind]] = { x: r.x, y: r.y, w: 20, h: 12, reach: 0, pet: kind, name: PETS[kind].name };
  return out;
}

// ---------------------------------------------------------------- cibo

/** Dà una porzione di cibo all'animale: 5 € e +50% di fame. */
export async function feed(kind: PetKind): Promise<void> {
  const st = book()[kind];
  if (!st) return;
  if (hungerOf(kind) >= 99.5) {
    toast(`${PETS[kind].emoji} Il tuo ${PETS[kind].name} è già sazio!`);
    return;
  }
  if (game.moneyLevel < PET_FOOD_PRICE) {
    toast(`Ti servono ${PET_FOOD_PRICE} € in cassaforte per il cibo.`);
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
  const r = roamers.get(kind) || (kind === 'dog' ? game.dogWalk : null);
  if (r) {
    r.say = kind === 'dog' ? 'Gnam! 🐶❤️' : kind === 'cat' ? 'Purrr… 🐱❤️' : 'Gnam! ❤️';
    r.sayUntil = game.animClock + 2.5;
    r.nextSayAt = game.animClock + 10;
  } else homeSays.set(kind, { text: 'Gnam! ❤️', until: game.animClock + 2.5 });
  saveGame();
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
  };
  roamers.delete('dog');
  sfx('click');
  toast('🦮 Hai messo il guinzaglio al cane: ti seguirà nell’appartamento e nel cortile.', 4000);
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
    // fuori dall'appartamento e dal cortile il cane non viene: torna da solo nella stanza
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
    // si cambia stanza insieme: il cane compare accanto al giocatore
    w.env = env;
    w.x = px - 22;
    w.y = py + 10;
  }
  const ddx = px - w.x,
    ddy = py - w.y;
  const d = Math.hypot(ddx, ddy);
  const LEASH = 28;
  if (d > LEASH) {
    const k = Math.min(1, dt * 8);
    w.x += (ddx / d) * (d - LEASH) * k;
    w.y += (ddy / d) * (d - LEASH) * k;
    w.dx = ddx;
    w.dy = ddy;
    w.moving = true;
  } else w.moving = false;
  // anche al guinzaglio si lamenta se ha fame
  if (hungerOf('dog') < PET_HUNGRY && game.animClock >= (w.nextSayAt || 0)) {
    w.say = 'Bau! Bau! 🍖';
    w.sayUntil = game.animClock + 2.5;
    w.nextSayAt = game.animClock + 10;
  }
}

// ---------------------------------------------------------------- barre della fame

let rowsKey = '';
/** Una barra "Fame (cane)" per ogni animale, nel pannello dei bisogni. */
export function updatePetHud(): void {
  checkPetHealth();
  const box = dom('pet-rows');
  if (!box) return;
  const kinds = PET_KINDS.filter((k) => book()[k]);
  const key = kinds.join(',');
  if (key !== rowsKey) {
    rowsKey = key;
    box.innerHTML = kinds
      .map(
        (k) => `<div class="need-row pet-row">
      <div class="need-info"><span>${PETS[k].emoji} Fame (${PETS[k].name})</span><span id="pet-text-${k}"></span></div>
      <div class="bar-bg"><div id="pet-bar-${k}" class="bar-fill" style="width: 0%; background: #e1b12c"></div></div>
    </div>`,
      )
      .join('');
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
      ...kinds.map((k) => ({ label: `${PETS[k].emoji} Il ${PETS[k].name}`, value: k })),
      { label: 'Annulla', value: null },
    ],
  });
  const kind = res.action as PetKind | null;
  if (!kind || !book()[kind]) return;
  const ok: GameValue = await openDialog({
    title: `${PETS[kind].emoji} Sei sicuro?`,
    text: `Il tuo ${PETS[kind].name} andrà a vivere con un'altra famiglia e non tornerà più.
I soldi spesi per comprarlo non ti verranno restituiti.`,
    buttons: [
      { label: 'Sì, dallo in adozione', value: 'yes', color: '#e67e22' },
      { label: 'No, lo tengo', value: null },
    ],
  });
  if (ok.action !== 'yes' || !book()[kind]) return;
  removePet(kind);
  sfx('click');
  toast(`🏡 Il tuo ${PETS[kind].name} troverà una nuova famiglia. Ciao ${PETS[kind].emoji}!`, 4500);
  saveGame(true);
  publishRoomLayout();
}

const starvingWarned = new Set<PetKind>();
const dyingWarned = new Set<PetKind>();

/**
 * Controlla gli animali: avvisa quando la fame arriva a zero e, se restano senza cibo per 24 ore,
 * muoiono e il giocatore perde il 50% di felicità. Vale anche per il tempo a gioco chiuso.
 */
export function checkPetHealth(): void {
  if (!game.session.saveReady || game.player.isDead) return;
  const now = Date.now();
  for (const kind of PET_KINDS) {
    const st = book()[kind];
    if (!st) continue;
    const info = PETS[kind];
    if (petIsDead(st, now, depletion())) {
      removePet(kind);
      game.player.happinessLevel = Math.max(0, game.player.happinessLevel - PET_DEATH_SADNESS);
      const msg = `💔 Il tuo ${info.name} è morto di fame. (Felicità −${PET_DEATH_SADNESS}%)`;
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
      const msg = `🆘 Il tuo ${info.name} ${info.emoji} sta per morire di fame! Hai ancora ${h} ${h === 1 ? 'ora' : 'ore'} per dargli da mangiare.`;
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
      const msg = `⚠️ Il tuo ${info.name} ${info.emoji} non mangia da troppo: se non gli dai da mangiare entro ${hoursLeft} ore morirà!`;
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
        : `💞 Stare con il tuo ${info.name} ti rende felice (+${company.rate}% di felicità all'ora)`,
      4000,
    );
  }
}
