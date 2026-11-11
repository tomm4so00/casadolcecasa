// Erba: semi, vasi e lampade del grow shop, piante da annaffiare in camera, barattolo e canne.
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
import { recordActivity } from './activity.js';
import { dropInTrash } from './trash.js';
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
  JOINT_PRICE,
  LAMPS,
  MAX_POTS,
  POTS,
  POT_KINDS,
  STRAINS,
  STRAIN_IDS,
  type Pot,
  type PotKind,
  type StrainId,
  type WeedState,
  afterSmoke,
  buyLampError,
  buyPotError,
  durationText,
  emptyWeed,
  expectedGrams,
  growTimeText,
  harvestPot,
  jointHappiness,
  plant,
  potGrowInfo,
  potProgress,
  potReadyAt,
  setLamp,
  water,
  waterDueIn,
} from './weed-rules.js';
import { addictHappiness, levelOf } from './personality-rules.js';
import { notePersonality } from './personality.js';

/** Dove compaiono i vasi nella camera (davanti a destra, fuori dal passaggio), uno accanto all'altro. */
const POT_SPOTS = [
  { x: 70, y: 118 },
  { x: 30, y: 118 },
  { x: -10, y: 118 },
];

const weed = (): WeedState => (game.player.weed ??= emptyWeed());
const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;

/** La chiave nella stanza del vaso numero `i`: il primo resta "weedPot" come prima. */
export const potKey = (i: number): string => (i === 0 ? 'weedPot' : `weedPot${i + 1}`);
export const POT_KEYS = Array.from({ length: MAX_POTS }, (_, i) => potKey(i));
export const potIndex = (key: string): number => POT_KEYS.indexOf(key);

/** I vasi restano gli stessi oggetti finché ci sono, così quando li sposti la posizione resta. */
const potItems: GameValue[] = [];

/** Prima di salvare: la posizione dei vasi (spostati come mobili) torna nello stato. */
export function syncWeedPot(): void {
  const w = game.player.weed;
  if (!w) return;
  w.pots?.forEach((pot, i) => {
    const item = potItems[i];
    if (item) {
      pot.x = Math.round(item.x);
      pot.y = Math.round(item.y);
    }
  });
}

const potSpot = (pot: Pot, i: number) =>
  pot.x !== undefined ? { x: pot.x, y: pot.y! } : (POT_SPOTS[i] ?? POT_SPOTS[0]);

function potName(pot: Pot): string {
  const lamp = pot.lamp ? ` · ${LAMPS[pot.lamp as 1 | 2 | 3].name}` : '';
  return (pot.strain ? `${STRAINS[pot.strain].name} 🌱` : POTS[pot.kind].name) + lamp;
}

/** Oggetti da aggiungere alla mappa della propria stanza: i vasi (l'erba sta nello zaino). */
export function weedRoomItems(): Record<string, GameValue> {
  const w = weed();
  const items: Record<string, GameValue> = {};
  const now = Date.now();
  const pots = w.pots ?? [];
  potItems.length = Math.min(potItems.length, pots.length);
  pots.forEach((pot, i) => {
    const item = (potItems[i] ??= { ...potSpot(pot, i), w: 24, h: 24, z: 40, moveable: true });
    item.name = potName(pot);
    item.pot = { k: pot.kind, l: pot.lamp ?? 0 };
    item.grow = potGrowInfo(pot) ?? undefined;
    // la goccia sopra il vaso: la pianta ha sete
    item.thirsty =
      !!pot.strain && !pot.legacy && potProgress(pot, now) < 1 && waterDueIn(pot, now) < 0;
    items[potKey(i)] = item;
  });
  return items;
}

/** Salva e mostra subito i vasi aggiornati agli altri. */
function commit(): void {
  saveGame(true);
  publishRoomLayout();
}

// ---------------------------------------------------------------- grow shop

/** Semi di una varietà (dall'espositore). */
export async function buySeeds(strain: StrainId): Promise<void> {
  const s = STRAINS[strain];
  const res: GameValue = await openDialog({
    title: `🌱 Semi di ${s.name}`,
    text:
      `Un seme costa ${dindini(s.price)} e finisce nello zaino.\n` +
      `In un vaso di terra cresce in ${growTimeText(strain)} e dà fino a ${s.grams} g, se lo annaffi sempre. ` +
      'Vasi e lampade migliori (alla cassa) la fanno crescere più in fretta e rendere di più.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: `1 seme (${dindini(s.price)})`, value: '1', color: '#2e7d32' },
      { label: `3 semi (${dindini(s.price * 3)})`, value: '3', color: '#1b5e20' },
    ],
  });
  const n = Number(res.action);
  if (!n) return;
  if (!(await spendMoney(s.price * n))) {
    toast('Non hai abbastanza soldi in cassaforte.', 3500);
    return;
  }
  const w = weed();
  w.seeds = { ...w.seeds, [strain]: (w.seeds?.[strain] ?? 0) + n };
  sfx('coin');
  saveGame(true);
  toast(
    `🌱 ${n} ${n === 1 ? 'seme' : 'semi'} di ${s.name} nello zaino. Piantali in un vaso vuoto nella tua stanza.`,
    5000,
  );
}

/** Alla cassa: vasi e lampade. */
export async function openGrowCounter(): Promise<void> {
  if (!hasRoom()) {
    toast('Ti serve una stanza per coltivare.', 3500);
    return;
  }
  const pots = weed().pots ?? [];
  const potLines = POT_KINDS.map((k) => {
    const p = POTS[k];
    const fast =
      p.speed > 1
        ? `cresce il ${Math.round((p.speed - 1) * 100)}% più in fretta`
        : 'velocità normale';
    const more = p.yield > 1 ? `, +${Math.round((p.yield - 1) * 100)}% di raccolto` : '';
    return `• ${p.name} (${dindini(p.price)}): ${fast}${more}, acqua ogni ${p.waterMs / 3_600_000} ore.`;
  });
  const lampLine = ([1, 2, 3] as const)
    .map(
      (l) =>
        `${LAMPS[l].name} ${dindini(LAMPS[l].price)} (+${Math.round((LAMPS[l].speed - 1) * 100)}%)`,
    )
    .join(', ');
  const res: GameValue = await openDialog({
    title: '🪴 Vasi e lampade',
    text:
      `Vasi nella tua stanza: ${pots.length}/${MAX_POTS}.\n\n` +
      potLines.join('\n') +
      `\n\nLampade, una per vaso, per crescere più in fretta: ${lampLine}.`,
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      ...POT_KINDS.map((k) => ({
        label: `🪴 ${POTS[k].name}`,
        value: 'pot:' + k,
        color: '#8d6e63',
      })),
      ...(pots.length
        ? [{ label: '💡 Lampada per un vaso', value: 'lamp', color: '#6c5ce7' }]
        : []),
    ],
  });
  const action = String(res.action ?? '');
  if (action.startsWith('pot:')) await buyPot(action.slice(4) as PotKind);
  else if (action === 'lamp') await chooseLamp();
}

async function buyPot(kind: PotKind): Promise<void> {
  const error = buyPotError(weed(), kind, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return;
  }
  if (!(await spendMoney(POTS[kind].price))) return;
  const w = weed();
  w.pots = [...(w.pots ?? []), { kind }];
  sfx('coin');
  commit();
  toast(`🪴 ${POTS[kind].name} comprato: lo trovi nella tua stanza, pronto per un seme.`, 5000);
}

async function chooseLamp(): Promise<void> {
  const pots = weed().pots ?? [];
  const which: GameValue = await openDialog({
    title: '💡 Su quale vaso?',
    text: 'La lampada resta sul vaso e lo fa crescere più in fretta, anche a pianta già piantata.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      ...pots.map((p, i) => ({
        label: `${i + 1}. ${potName(p)}`,
        value: String(i),
        color: '#8d6e63',
      })),
    ],
  });
  if (which.action === null || which.action === undefined) return;
  const index = Number(which.action);
  const pot = pots[index];
  if (!pot) return;
  const choices = ([1, 2, 3] as const).filter((l) => l > (pot.lamp ?? 0));
  if (!choices.length) {
    toast('💡 Su questo vaso c’è già la Lampada Super.', 3500);
    return;
  }
  const level: GameValue = await openDialog({
    title: '💡 Che lampada?',
    text: `Vaso ${index + 1}: ${potName(pot)}.`,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      ...choices.map((l) => ({
        label: `${LAMPS[l].name} (${dindini(LAMPS[l].price)})`,
        value: String(l),
        color: '#6c5ce7',
      })),
    ],
  });
  const lamp = Number(level.action) as 1 | 2 | 3;
  if (!lamp) return;
  const error = buyLampError(pot, lamp, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return;
  }
  if (!(await spendMoney(LAMPS[lamp].price))) return;
  const w = weed();
  w.pots = w.pots!.map((p, i) => (i === index ? setLamp(p, lamp, Date.now()) : p));
  sfx('coin');
  commit();
  toast(`💡 ${LAMPS[lamp].name} montata sul vaso ${index + 1}.`, 4000);
}

// ---------------------------------------------------------------- in camera

/** Il testo del pulsante vicino al vaso. */
export function potLabel(index: number): string {
  const pot = weed().pots?.[index];
  if (!pot) return '';
  const now = Date.now();
  if (!pot.strain) return `🪴 ${POTS[pot.kind].name}: pianta un seme`;
  const name = STRAINS[pot.strain].name;
  if (potProgress(pot, now) >= 1) return `🌿 Raccogli ${name} (${expectedGrams(pot, now)} g)`;
  if (!pot.legacy && waterDueIn(pot, now) < 0) return `💧 ${name} ha sete: annaffiala`;
  return `🌱 ${name}: pronta tra ${durationText(potReadyAt(pot, now) - now)}`;
}

/** Vicino al vaso: piantare, annaffiare o raccogliere. */
export async function tendPot(index: number): Promise<void> {
  const pot = weed().pots?.[index];
  if (!pot) return;
  const now = Date.now();
  if (!pot.strain) return plantSeed(index);
  if (potProgress(pot, now) >= 1) return harvestNow(index);
  const due = waterDueIn(pot, now);
  const care = pot.legacy
    ? 'È una pianta di prima: non serve annaffiarla e darà 100 g.'
    : (due < 0
        ? '💧 Ha sete! Ogni annaffiatura saltata toglie il 15% del raccolto.'
        : `💧 Da annaffiare entro ${durationText(due)}.`) +
      `\nRaccolto previsto: ${expectedGrams(pot, now)} g.`;
  const res: GameValue = await openDialog({
    title: `🌱 ${STRAINS[pot.strain].name}`,
    text: `Pronta tra ${durationText(potReadyAt(pot, now) - now)}.\n${care}`,
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      ...(pot.legacy ? [] : [{ label: '💧 Annaffia', value: 'water', color: '#0984e3' }]),
    ],
  });
  if (res.action !== 'water') return;
  const w = weed();
  w.pots = w.pots!.map((p, i) => (i === index ? water(p, Date.now()) : p));
  sfx('shower');
  commit();
  toast(`💧 Annaffiata. La prossima volta entro ${durationText(POTS[pot.kind].waterMs)}.`, 4000);
}

async function plantSeed(index: number): Promise<void> {
  const w = weed();
  const owned = STRAIN_IDS.filter((id) => (w.seeds?.[id] ?? 0) > 0);
  if (!owned.length) {
    toast('🌱 Non hai semi: li vende il grow shop al centro commerciale.', 4500);
    return;
  }
  const res: GameValue = await openDialog({
    title: `🪴 ${POTS[w.pots![index].kind].name}`,
    text: 'Che seme vuoi piantare? Il vaso parte annaffiato.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      ...owned.map((id) => ({
        label: `${STRAINS[id].name} (${w.seeds![id]})`,
        value: id,
        color: '#2e7d32',
      })),
    ],
  });
  const strain = res.action as StrainId | null;
  if (!strain) return;
  const next = plant(weed(), index, strain, Date.now());
  if (!next) return;
  game.player.weed = next;
  sfx('mission');
  commit();
  toast(`🌱 Hai piantato ${STRAINS[strain].name}. Ricordati di annaffiarla!`, 4500);
}

async function harvestNow(index: number): Promise<void> {
  const done = harvestPot(weed(), index, Date.now());
  if (!done) return;
  if (!(await inventoryChange((ledger) => ledger.harvest(done.grams, done.plantedAt)))) return;
  // il raccolto è offerta: fa scendere il prezzo dell'erba dallo spacciatore
  recordActivity('raccolto');
  notePersonality('harvestWeed');
  done.state.grams = weed().grams;
  game.player.weed = done.state;
  sfx('mission');
  commit();
  toast(
    `🌿 Raccolto! ${done.grams} g di ${STRAINS[done.strain].name} nello zaino (${done.state.grams} g in tutto).`,
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
    const gain = enjoyJoint();
    notePersonality('smokeJoint');
    await saveGame(true);
    publishRoomLayout();
    const tolerance = gain < JOINT_HAPPY ? ' (fai l’abitudine: oggi ne hai fumate parecchie)' : '';
    toast(
      `🌿 Felicità +${gain}%${tolerance}. Per 10 minuti: occhi rossi e velocità −10%. Puoi fumare di nuovo tra 30 minuti. Nello zaino restano ${weed().grams} g.`,
      4500,
    );
    return true;
  } finally {
    smoking = false;
  }
}

/** Se il proprio personaggio ha ancora gli occhi rossi. */
export const isStoned = (): boolean => game.player.stonedUntil > Date.now();

/**
 * Effetto di una canna: felicità (meno se oggi se ne sono fumate tante), fumetto e nuvolette di
 * fumo che vedono anche gli altri. Restituisce la felicità guadagnata.
 */
function enjoyJoint(): number {
  const now = Date.now();
  const w = weed();
  // il Tossico se la gode di più
  const gain = addictHappiness(
    jointHappiness(w.smokes, now),
    levelOf(game.player.personality, 'addict'),
  );
  w.smokes = afterSmoke(w.smokes, now);
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + gain);
  game.smokeUntil = performance.now() + JOINT_ANIMATION_MS;
  game.player.stonedUntil = now + JOINT_EFFECT_MS;
  game.player.jointReadyAt = now + JOINT_COOLDOWN_MS;
  game.moveRight = game.moveForward = 0;
  game.keysPressed = { w: false, a: false, s: false, d: false };
  game.isWalking = false;
  game.mySay = '💨 Che relax…';
  game.mySayT = Date.now();
  return gain;
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
  dropInTrash('bag');
  notePersonality('sellDrug');
  toast(`🪙 ${who} ha comprato la tua canna: +${dindini(JOINT_PRICE)} in cassaforte!`, 4500);
}

export async function onJointRefused(who: string): Promise<void> {
  if (!(await inventoryChange((ledger) => ledger.buy('weed', 1, 0)))) return;
  saveGame(true);
  publishRoomLayout();
  toast(`${who} non ha preso la canna: il grammo è tornato nel tuo zaino.`, 4000);
}
