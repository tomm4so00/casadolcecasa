// Erba: piante comprate al grow shop che crescono in camera, barattolo, canne da fumare e da vendere.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { hasRoom, publishRoomLayout, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { spendMoney, transferMoney } from './economy.js';
import { sendSocial } from './social.js';
import { inventoryChange } from './inventory-market.js';
import { openInventoryTrade } from './inventory-trade.js';
import { trainingHoldsOwner } from './dog-training.js';
import { LAB_WALL_Y } from './data/catalogues.js';
import {
  JOINT_ANIMATION_MS,
  JOINT_EFFECT_MS,
  JOINT_COOLDOWN_MS,
  jointReadyAt,
  jointOutdoors,
  jointUseError,
} from './joint-rules.js';
import {
  JOINT_HAPPY,
  HARVEST_GRAMS,
  JOINT_PRICE,
  STRAINS,
  type StrainId,
  type WeedState,
  buyPlantError,
  emptyWeed,
  growLeftText,
  growProgress,
  growTimeText,
  harvest,
} from './weed-rules.js';

/** Dove stanno il vaso e il barattolo nella camera (davanti a destra, fuori dal passaggio). */
const POT_SPOT = { x: 70, y: 118 };
const JAR_SPOT_WITH_POT = { x: 70, y: 82 };

const weed = (): WeedState => (game.player.weed ??= emptyWeed());
const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;

/** Il vaso resta lo stesso oggetto finché la pianta cresce, così quando lo sposti la posizione resta. */
let pot: GameValue = null;

/** Dove sta il vaso: dove l'ha messo il giocatore, oppure il posto di partenza. */
const potSpot = (w: WeedState) => (w.potX !== undefined ? { x: w.potX, y: w.potY! } : POT_SPOT);

/** Anche il barattolo resta lo stesso oggetto, così si può spostare. */
let jar: GameValue = null;

/** Prima di salvare: la posizione di vaso e barattolo (spostati come mobili) torna nello stato. */
export function syncWeedPot(): void {
  const w = game.player.weed;
  if (!w) return;
  if (pot) {
    w.potX = Math.round(pot.x);
    w.potY = Math.round(pot.y);
  }
  if (jar && w.grams > 0) {
    w.jarX = Math.round(jar.x);
    w.jarY = Math.round(jar.y);
  }
}

/** Oggetti da aggiungere alla mappa della propria stanza: il vaso con la pianta e il barattolo. */
export function weedRoomItems(): Record<string, GameValue> {
  const w = weed();
  const items: Record<string, GameValue> = {};
  if (w.plantedAt && w.strain) {
    if (!pot || pot.grow.p !== w.plantedAt)
      pot = {
        ...potSpot(w),
        w: 24,
        h: 24,
        z: 40,
        name: `${STRAINS[w.strain].name} 🌱`,
        grow: { s: w.strain, p: w.plantedAt },
        moveable: true,
      };
    items.weedPot = pot;
  } else pot = null;
  if (w.grams > 0) {
    if (!jar) {
      // dove l'ha messo il giocatore; se no accanto al vaso, o al posto del vaso se è vuoto
      const base = pot ? { x: pot.x, y: pot.y } : potSpot(w);
      const start =
        w.jarX !== undefined
          ? { x: w.jarX, y: w.jarY! }
          : pot
            ? { x: base.x, y: base.y - (POT_SPOT.y - JAR_SPOT_WITH_POT.y) }
            : base;
      jar = { ...start, w: 14, h: 14, z: 24, name: 'Barattolo di erba 🌿', moveable: true };
    }
    jar.jar = { g: w.grams, s: w.jarStrain || 'amnesia' };
    items.weedJar = jar;
  } else jar = null;
  return items;
}

// ---------------------------------------------------------------- grow shop

export async function buyPlant(strain: StrainId): Promise<void> {
  if (!hasRoom()) {
    toast('Ti serve una stanza per coltivare.', 3500);
    return;
  }
  const s = STRAINS[strain];
  const error = buyPlantError(weed(), strain, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 5000);
    return;
  }
  const res: GameValue = await openDialog({
    title: `🌱 ${s.name}`,
    text: `Una pianta di ${s.name} costa ${dindini(s.price)}.\nLa troverai nella tua stanza: cresce in ${growTimeText(strain)} (le varietà più care crescono un po' più in fretta), poi potrai raccoglierla e avere 100 grammi d'erba.`,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: `Compra (${dindini(s.price)})`, value: 'ok', color: '#2e7d32' },
    ],
  });
  if (res.action !== 'ok' || !(await spendMoney(s.price))) return;
  game.player.weed = { ...weed(), strain, plantedAt: Date.now() };
  sfx('coin');
  saveGame(true);
  publishRoomLayout();
  toast(`🌱 Hai comprato una pianta di ${s.name}: la trovi nella tua stanza!`, 5000);
}

// ---------------------------------------------------------------- in camera

export function plantLabel(): string {
  const w = weed();
  if (!w.plantedAt || !w.strain) return '';
  const name = STRAINS[w.strain].name;
  return growProgress(w.plantedAt, Date.now(), w.strain) >= 1
    ? `🌿 Raccogli ${name}`
    : `🌱 ${name}: pronta tra ${growLeftText(w.plantedAt, Date.now(), w.strain)}`;
}

export async function tendPlant(): Promise<void> {
  const w = weed();
  if (!w.plantedAt || !w.strain) return;
  const done = harvest(w, Date.now());
  if (!done) {
    toast(
      `🌱 La tua ${STRAINS[w.strain].name} sta crescendo: sarà pronta tra ${growLeftText(w.plantedAt, Date.now(), w.strain)}.`,
      4500,
    );
    return;
  }
  if (!(await inventoryChange((ledger) => ledger.harvest(HARVEST_GRAMS, w.plantedAt!)))) return;
  done.grams = weed().grams;
  // la pianta diventa un barattolo: compare dove c'era il vaso (se il barattolo c'era già, resta lì)
  if (pot && !jar) {
    done.jarX = Math.round(pot.x);
    done.jarY = Math.round(pot.y);
  }
  game.player.weed = done;
  sfx('mission');
  saveGame(true);
  publishRoomLayout();
  toast(
    `🌿 Raccolto! Nel barattolo ora ci sono ${done.grams} grammi di ${STRAINS[done.jarStrain!].name}.`,
    5000,
  );
}

export const isSmoking = (): boolean => performance.now() < game.smokeUntil;

export function smokeJointError(): string | null {
  const env = game.view.activeEnvironment;
  return jointUseError(
    weed().grams,
    jointOutdoors(env, !!game.ENV_STYLE[env]?.outdoor, game.playerPos.y, LAB_WALL_Y),
    jointReadyAt(game.player.jointReadyAt, game.player.stonedUntil),
    Date.now(),
    !!(
      game.socBusy() ||
      game.rocketTrip ||
      game.benchSit ||
      game.coinToss ||
      game.iceCream ||
      game.kissAnim ||
      game.dogWalk?.mode === 'called' ||
      trainingHoldsOwner()
    ),
  );
}

/** Un grammo, sette secondi di animazione, dieci minuti di effetto e trenta di attesa. */
let smoking = false;
export async function smokeJoint(): Promise<boolean> {
  if (smoking) return false;
  const error = smokeJointError();
  if (error) {
    toast(error, 4000);
    return false;
  }
  smoking = true;
  try {
    if (!(await inventoryChange((ledger) => ledger.consume('weed')))) return false;
    enjoyJoint();
    await saveGame(true);
    publishRoomLayout();
    toast(
      `🌿 Felicità +${JOINT_HAPPY}%. Per 10 minuti: occhi rossi e velocità −10%. Puoi fumare di nuovo tra 30 minuti. Nello zaino restano ${weed().grams} g.`,
      4500,
    );
    return true;
  } finally {
    smoking = false;
  }
}

/** Se il proprio personaggio ha ancora gli occhi rossi. */
export const isStoned = (): boolean => game.player.stonedUntil > Date.now();

/** Effetto di una canna: felicità, fumetto e nuvolette di fumo (le vedono anche gli altri). */
function enjoyJoint(): void {
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + JOINT_HAPPY);
  game.smokeUntil = performance.now() + JOINT_ANIMATION_MS;
  const now = Date.now();
  game.player.stonedUntil = now + JOINT_EFFECT_MS;
  game.player.jointReadyAt = now + JOINT_COOLDOWN_MS;
  game.moveRight = game.moveForward = 0;
  game.keysPressed = { w: false, a: false, s: false, d: false };
  game.isWalking = false;
  game.mySay = '💨 Che relax…';
  game.mySayT = Date.now();
}

// ---------------------------------------------------------------- vendita agli altri

export const canSellJoint = (): boolean => weed().grams >= 1;

/** Propone una canna a un giocatore vicino: il grammo si mette da parte finché non risponde. */
export async function offerJoint(target: { id: string; name: string }): Promise<void> {
  await openInventoryTrade('weed', target.id);
}

export async function onJointOffer(m: GameValue, who: string): Promise<void> {
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1500));
  const res: GameValue = await openDialog({
    title: '🌿 Una canna?',
    text: `${who} ti propone 1 g di erba per ${dindini(JOINT_PRICE)}.\nLo ritroverai nello zaino e potrai fumarlo all’aperto. La compri?`,
    buttons: [
      { label: 'No grazie', value: 'no', color: '#57606f' },
      { label: `Compra (${dindini(JOINT_PRICE)})`, value: 'yes', color: '#2e7d32' },
    ],
  });
  if (res.action !== 'yes') {
    sendSocial(m.from, { type: 'weedNo' });
    return;
  }
  if (game.moneyLevel < JOINT_PRICE || !(await transferMoney(m.from, JOINT_PRICE))) {
    toast('Non hai abbastanza soldi in cassaforte (o il pagamento non è riuscito).', 4000);
    sendSocial(m.from, { type: 'weedNo' });
    return;
  }
  sendSocial(m.from, { type: 'weedPaid', price: JOINT_PRICE });
  if (!(await inventoryChange((ledger) => ledger.buy('weed', 1, 0)))) return;
  saveGame(true);
  publishRoomLayout();
  toast(`🌿 Hai comprato 1 g di erba da ${who}: lo trovi nello zaino.`, 4500);
}

export function onJointPaid(who: string): void {
  sfx('coin');
  toast(`🪙 ${who} ha comprato la tua canna: +${dindini(JOINT_PRICE)} in cassaforte!`, 4500);
}

export async function onJointRefused(who: string): Promise<void> {
  if (!(await inventoryChange((ledger) => ledger.buy('weed', 1, 0)))) return;
  saveGame(true);
  publishRoomLayout();
  toast(`${who} non ha preso la canna: il grammo è tornato nel barattolo.`, 4000);
}
