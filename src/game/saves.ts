import { decodeWeed } from './weed-rules.js';
import { decodePillTimers, pruneTimers } from './pill-rules.js';
import { decodeLoyalty } from './dealer-rules.js';
import { jointReadyAt } from './joint-rules.js';
import { syncInventoryFromRoom } from './inventory-market.js';
import { LEGACY_WORLD, countFree, isWorldCode } from '../../shared/worlds.js';
import { publishFreeRooms } from './world-select.js';
import { hashPin, pinHint, pinTooHighForLevel, safeLevel } from './safe-pin.js';
import { roomLabel } from './realty-rules.js';
import { decodeFlu, isSick } from './flu-rules.js';
import { myBenchPose } from './courtyard-fun.js';
import { decodeDailyUses } from './daily-limits.js';
import { decodePets } from './pet-rules.js';
import { freePetsForLayout, petRoomItems, syncPetHomes } from './pets.js';
import { isStoned, syncWeedPot, weedRoomItems } from './weed.js';
import { publishVitals } from './players-hud-rules.js';
import { needsRules } from './needs-rules.js';
import { syncRoomEconomy, creditMoney, flushEconomy } from './economy.js';
import { canPlaySession } from './accounts.js';
import type { GameValue } from './context.js';
import type { SaveV8 } from './save-model.js';
import { decodeSaveV8 } from './save-model.js';
import { absentDeath, advanceAbsence } from './absent-death-rules.js';
import { deathCauses, encodeDeathCauses } from './death-cause-rules.js';
import { type CryoPass, frozenMs } from '../../shared/cryo-rules.js';
import { loadMyCryo } from './cryo.js';
import { applyPrefs, collectPrefs } from './prefs.js';
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { getWealth, toast } from './missions.js';
import { currentBody, lookString, ownsItem, parseBody, resolveLook } from './character.js';
import { startInbox } from './social.js';
import { startChat, updateChatBadge } from './chat.js';
import { bestOwnedByProp } from './furniture-tiers.js';
import { decodeRomance } from './romance-rules.js';
import { decodeRelations } from './relations-rules.js';
import { decodeWelcome } from './welcome-rules.js';
import { limitedFurnitureProps, limitedRoomItems } from './limited.js';
import { decodePersonality, obtainedPersonality, personalityLevel } from './personality-rules.js';
import { decodeWorkDay } from './job-pay.js';
import { pushOutOfCorridor } from './room-layout.js';
import { footprintOf } from './render/primitives.js';
import { PAINTING_SLOTS, paintingKey, roomPaintings } from './painting-rules.js';
import { kissActive } from './romance.js';
import { noteFaintOnReturn } from './faint.js';
import { promptSetSafePin } from './needs.js';
import { worldNode } from './world-db.js';
import { cabinetOpen } from './cabinet.js';
import { currentCrack } from './crack.js';
import { decodeFood, encodeFood } from './food-rules.js';

/** Segna la presenza come offline, con l'ora del server in cui il giocatore è uscito. */
export const OFFLINE_MARK = { offline: true, offAt: { '.sv': 'timestamp' } };
/** Livello della mia cassaforte (2 con la cassaforte livello 2 del negozio di mobili). */
export const mySafeLevel = (): 1 | 2 => safeLevel(game.player.ownedFurniture);

export { hashPin };

export function hasRoom(..._args: GameValue[]): GameValue {
  return game.myAssignedRoomIdx !== null && game.myAssignedRoomIdx >= 0;
}

export function syncVaultFromServer(..._args: GameValue[]): GameValue {
  if (!hasRoom()) return;
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (!room || room.ownerId !== game.session.myPlayerId) return;
  syncRoomEconomy(room);
  syncInventoryFromRoom(room);
  if (!game.vaultSynced) {
    game.vaultSynced = true;
    game.pinPromptMoneyThreshold = game.vaultCache;
    game.lastCloudMoney = game.vaultCache;
    game.lastMoneyForSound = game.vaultCache;
  }
  if (game.legacyPocketMoney > 0) {
    const amount: GameValue = game.legacyPocketMoney;
    game.legacyPocketMoney = 0;
    void creditMoney(amount).then((ok) => {
      if (!ok) game.legacyPocketMoney += amount;
    });
    toast(`💰 I ${amount} Đ che avevi in tasca sono stati spostati in cassaforte.`, 5000);
    saveGame(true);
  }
}

export function isMyRoomNow(..._args: GameValue[]): GameValue {
  return (
    game.view.activeEnvironment === 'PLAYER_ROOM' &&
    hasRoom() &&
    game.currentRoomIdx === game.myAssignedRoomIdx
  );
}

export function withTimeout(promise?: GameValue, ms?: GameValue): GameValue {
  return Promise.race([
    promise,
    new Promise(
      (resolve?: GameValue): GameValue => lifetime.setTimeout((): GameValue => resolve(null), ms),
    ),
  ]);
}

export function buildSaveData(..._args: GameValue[]): SaveV8 {
  let furniturePos: GameValue = {};
  Object.keys(game.playerRoomFurniture).forEach(
    (k?: GameValue): GameValue =>
      (furniturePos['base_' + k] = {
        x: Math.round(game.playerRoomFurniture[k].x),
        y: Math.round(game.playerRoomFurniture[k].y),
        ...(game.playerRoomFurniture[k].rot ? { rot: game.playerRoomFurniture[k].rot } : {}),
      }),
  );
  game.furnitureCatalog.forEach(
    (f?: GameValue): GameValue =>
      (furniturePos[f.id] = {
        x: Math.round(f.propData.x),
        y: Math.round(f.propData.y),
        ...(f.propData.rot ? { rot: f.propData.rot } : {}),
      }),
  );
  // mobili in edizione limitata: il loro posto nella stanza
  limitedFurnitureProps().forEach((p, id) => {
    furniturePos[id] = { x: Math.round(p.x), y: Math.round(p.y), ...(p.rot ? { rot: p.rot } : {}) };
  });
  const r1: GameValue = (v?: GameValue): GameValue => Math.round(v * 10) / 10;
  const data: SaveV8 = {
    v: game.GAME_VERSION,
    savedAt: Date.now(),
    nick: game.player.myData.nick,
    healthLevel: r1(game.player.healthLevel),
    sleepLevel: r1(game.player.sleepLevel),
    hungerLevel: r1(game.player.hungerLevel),
    hygieneLevel: r1(game.player.hygieneLevel),
    happinessLevel: r1(game.player.happinessLevel),
    moneyLevel: game.legacyPocketMoney,
    vaultOnly: game.legacyPocketMoney <= 0,
    ownedItems: game.player.ownedItems,
    ownedFurniture: game.player.ownedFurniture,
    equipped: game.player.equipped,
    activeJobKey: game.player.activeJobKey,
    jobExperience: game.player.jobExperience,
    furniturePos,
    gameMinutes: Math.round(game.player.gameMinutes),
    stats: game.player.stats,
    missionIndex: game.player.missionIndex,
  };
  if (game.bodyChosen) data.body = game.bodyString(currentBody());
  data.missionSet = 3;
  data.sleeping = !!game.player.isSleeping;
  // si ricorda in quale letto si dorme (anche quello di un altro giocatore)
  if (game.player.isSleeping && game.view.activeEnvironment === 'PLAYER_ROOM') {
    data.sleepRoom = game.currentRoomIdx;
    if (typeof game.bedSlot === 'number') data.bedSlot = game.bedSlot;
  }
  data.sleepGainedSinceLastHealthBoost = game.player.sleepGainedSinceLastHealthBoost;
  if (game.player.needsZeroSince) data.needsZeroSince = game.player.needsZeroSince;
  data.inventory = encodeFood({ raw: game.player.rawFood, dishes: game.player.dishes });
  if ((game.player.coupleCooldownUntil || 0) > Date.now())
    data.coupleCooldownUntil = game.player.coupleCooldownUntil;
  if (game.player.sleptTogetherSince) data.sleptTogetherSince = game.player.sleptTogetherSince;
  if (game.player.drugStock > 0) data.drugStock = game.player.drugStock;
  if (game.player.stonedUntil > Date.now()) data.stonedUntil = game.player.stonedUntil;
  if (game.player.jointReadyAt && game.player.jointReadyAt > Date.now())
    data.jointReadyAt = game.player.jointReadyAt;
  if (game.player.romance && Object.keys(game.player.romance).length)
    data.romance = game.player.romance;
  if (game.player.relations && Object.keys(game.player.relations).length)
    data.relations = game.player.relations;
  if (game.player.personality) data.personality = game.player.personality;
  if (game.player.welcome) data.welcome = game.player.welcome;
  if (game.player.workDay) data.workDay = game.player.workDay;
  // fin dove si è letta la chat: vale su tutti i dispositivi, non solo su questo
  if (game.chatReadT > 0) data.chatReadT = game.chatReadT;
  // suoni, musica, notifiche e il resto: uguali su ogni telefono, browser o app installata
  data.prefs = collectPrefs();
  data.worldId = game.session.worldId;
  if (game.player.daily) data.daily = game.player.daily;
  if (game.player.pets && Object.keys(game.player.pets).length) {
    syncPetHomes();
    data.pets = game.player.pets;
  }
  syncWeedPot();
  const w = game.player.weed;
  if (w && (w.grams || w.pots?.length || w.seeds || w.smokes?.length)) data.weed = w;
  if (game.player.coffeeAt) data.coffeeAt = game.player.coffeeAt;
  if (game.player.toiletAt) data.toiletAt = game.player.toiletAt;
  const pill = pruneTimers(game.player.pill, Date.now());
  if (Object.keys(pill).length) data.pill = pill;
  if (game.player.dealers && Object.keys(game.player.dealers).length)
    data.dealers = game.player.dealers;
  if (game.player.flu && (game.player.flu.nextAt || game.player.flu.sickAt))
    data.flu = { ...game.player.flu };
  if (Object.keys(game.player.invest).length) {
    data.invest = {};
    Object.keys(game.player.invest).forEach((k?: GameValue): GameValue => {
      data.invest![k] = {
        units: Math.round(game.player.invest[k].units * 1e6) / 1e6,
        cost: Math.round(game.player.invest[k].cost * 100) / 100,
      };
    });
  }
  if (game.player.drug.active)
    data.drug = {
      doses: game.player.drug.doses,
      lastDose: game.player.drug.lastDose,
      endAt: game.player.drug.endAt,
      dAtDose: Math.round(game.player.drug.dAtDose * 10) / 10,
      crisisAt: game.player.drug.crisisAt || 0,
    };
  if (game.player.bornAt) data.bornAt = game.player.bornAt;
  if (game.player.epitaph) data.epitaph = game.player.epitaph;
  if (game.player.isDead) {
    data.dead = true;
    data.deadAt = game.player.deadAt;
    if (game.player.deathCause) data.deathCause = game.player.deathCause;
  }
  return data;
}

export function applySave(value: unknown): void {
  const s = decodeSaveV8(value);
  if (!s) return;
  game.player.isSleeping = s.sleeping === true;
  game.sleepRoom =
    game.player.isSleeping && Number.isInteger(s.sleepRoom) ? (s.sleepRoom as number) : null;
  if (game.player.isSleeping && (s.bedSlot === 0 || s.bedSlot === 1)) game.bedSlot = s.bedSlot;
  game.player.sleepGainedSinceLastHealthBoost = Math.min(
    19.999999,
    s.sleepGainedSinceLastHealthBoost ?? 0,
  );
  game.player.needsZeroSince = s.needsZeroSince ?? 0;
  if (s.inventory) {
    const food = decodeFood(s.inventory);
    game.player.rawFood = food.raw;
    game.player.dishes = food.dishes;
  }
  const moment = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  game.player.coupleCooldownUntil = moment(s.coupleCooldownUntil);
  game.player.sleptTogetherSince = moment(s.sleptTogetherSince);
  const num: GameValue = (v?: GameValue, d?: GameValue): GameValue =>
    typeof v === 'number' && isFinite(v) ? v : d;
  game.player.healthLevel = num(s.healthLevel, game.player.healthLevel);
  game.player.sleepLevel = num(s.sleepLevel, game.player.sleepLevel);
  game.player.hungerLevel = num(s.hungerLevel, game.player.hungerLevel);
  game.player.hygieneLevel = num(s.hygieneLevel, game.player.hygieneLevel);
  game.player.happinessLevel = num(s.happinessLevel, game.player.happinessLevel);
  // Vecchi salvataggi: i soldi in tasca verranno spostati in cassaforte
  if (!s.vaultOnly) game.legacyPocketMoney = Math.max(0, num(s.moneyLevel, 0));
  game.player.gameMinutes = num(s.gameMinutes, game.player.gameMinutes);
  game.player.bornAt = num(s.bornAt, 0);
  game.player.drugStock = Math.max(0, Math.floor(num(s.drugStock, 0)));
  game.player.stonedUntil = num(s.stonedUntil, 0);
  game.player.jointReadyAt = jointReadyAt(s.jointReadyAt, game.player.stonedUntil);
  game.player.romance = decodeRomance(s.romance);
  game.player.relations = decodeRelations(s.relations);
  game.player.personality = decodePersonality(s.personality);
  game.player.workDay = decodeWorkDay(s.workDay);
  const readT = num(s.chatReadT, 0);
  if (readT > game.chatReadT) {
    game.chatReadT = readT;
    updateChatBadge();
  }
  game.player.daily = decodeDailyUses(s.daily);
  game.player.pets = decodePets(s.pets);
  applyPrefs(s.prefs);
  // chi giocava prima dei mondi abita nel condominio di sempre
  game.session.worldId =
    typeof s.worldId === 'string' && isWorldCode(s.worldId) ? s.worldId : LEGACY_WORLD;
  game.player.weed = decodeWeed(s.weed);
  game.player.flu = decodeFlu(s.flu);
  game.player.pill = decodePillTimers(s.pill);
  game.player.dealers = decodeLoyalty(s.dealers);
  game.player.coffeeAt = num(s.coffeeAt, 0);
  game.player.toiletAt = Math.max(0, num(s.toiletAt, 0));
  game.player.invest = {};
  game.BIZ.forEach((b?: GameValue): GameValue => {
    const v: GameValue = s.invest && s.invest[b.id];
    if (v && num(v.units, 0) > 0)
      game.player.invest[b.id] = { units: num(v.units, 0), cost: num(v.cost, 0) };
  });
  game.player.drug =
    s.drug && num(s.drug.endAt, 0) > 0
      ? {
          active: true,
          doses: num(s.drug.doses, 1),
          lastDose: num(s.drug.lastDose, 0),
          endAt: num(s.drug.endAt, 0),
          dAtDose: num(s.drug.dAtDose, 0),
          crisisAt: num(s.drug.crisisAt, 0),
        }
      : { active: false, doses: 0, lastDose: 0, endAt: 0, dAtDose: 0, crisisAt: 0 };
  game.player.epitaph = typeof s.epitaph === 'string' ? s.epitaph.slice(0, 60) : '';
  const sb: GameValue = parseBody(s.body);
  if (sb) {
    game.myBody = sb;
    game.bodyChosen = true;
  }
  game.player.stats = Object.assign(game.player.stats, s.stats || {});
  game.player.missionIndex = num(s.missionIndex, 0);
  if ((s.missionSet || 1) < 3) game.player.missionIndex = 0; // missioni eliminate: i progressi vecchi non valgono per le nuove
  // missioni di benvenuto: a chi ha già mangiato, fatto la doccia e lavorato non si propongono
  const st = game.player.stats;
  game.player.welcome = decodeWelcome(s.welcome, st.meals > 0 && st.showers > 0 && st.shifts > 0);
  game.player.ownedItems = s.ownedItems || {};
  game.player.ownedFurniture = s.ownedFurniture || {};
  if (s.equipped) {
    game.player.equipped = Object.assign({}, game.DEFAULT_LOOK, s.equipped);
  } else {
    // Salvataggi della versione precedente: colore della maglia + accessori
    game.player.equipped = Object.assign({}, game.DEFAULT_LOOK);
    const oldTop: GameValue = game.shopCatalog.find(
      (i?: GameValue): GameValue =>
        i.slot === 'top' && i.color === s.currentOutfitColor && ownsItem(i.id),
    );
    if (oldTop) game.player.equipped.top = oldTop.id;
    const acc: GameValue = s.equippedAcc || {};
    if (acc.glasses) game.player.equipped.glasses = 'item_glasses';
    if (acc.crown) game.player.equipped.hat = 'item_crown';
    else if (acc.hat) game.player.equipped.hat = 'item_hat';
  }
  game.SLOTS.forEach((sl?: GameValue): GameValue => {
    // i capi in edizione limitata si controllano quando arriva il registro delle copie (limited.ts)
    const eq = game.player.equipped[sl];
    if (eq && !String(eq).startsWith('ltd_') && !ownsItem(eq))
      game.player.equipped[sl] = game.DEFAULT_LOOK[sl];
  });
  game.player.activeJobKey = s.activeJobKey || null;
  game.player.jobExperience = Object.assign(game.player.jobExperience, s.jobExperience || {});
  let fp: GameValue = s.furniturePos || {};
  // la mensola mai spostata stava nel primo posto scelto, ora coperto dalla tenda: riparte dal nuovo
  const shelf: GameValue = fp.base_collectShelf;
  if (shelf && shelf.x === -75 && shelf.y === -165) fp = { ...fp, base_collectShelf: undefined };
  Object.keys(game.playerRoomFurniture).forEach((k?: GameValue): GameValue => {
    // solo i mobili spostabili: cassaforte e porta restano dove sono
    if (fp['base_' + k] && game.playerRoomFurniture[k].moveable)
      Object.assign(game.playerRoomFurniture[k], fp['base_' + k]);
  });
  game.furnitureCatalog.forEach((f?: GameValue): GameValue => {
    if (fp[f.id]) Object.assign(f.propData, fp[f.id]);
  });
  limitedFurnitureProps().forEach((p, id) => {
    if (fp[id]) Object.assign(p, fp[id]);
  });
  // Mobili sistemati prima del passaggio libero: vengono spinti fuori.
  [
    ...Object.values(game.playerRoomFurniture),
    ...game.furnitureCatalog.map((f?: GameValue): GameValue => f.propData),
  ].forEach((item?: GameValue): GameValue => {
    if (!item.moveable || item.wallItem) return;
    const fp2: GameValue = footprintOf(item);
    Object.assign(item, pushOutOfCorridor({ x: item.x, y: item.y, w: fp2.w, h: fp2.h }));
  });
}

export async function saveGame(forceCloud = false): Promise<boolean> {
  if (!game.session.saveReady || game.player.isDead) return Promise.resolve(true);
  const scope = lifetime;
  if (!canPlaySession()) return false;
  // Preserve needs locally even while a money operation is waiting for reconnection.
  try {
    localStorage.setItem(game.session.SAVE_KEY, JSON.stringify(buildSaveData()));
  } catch (error) {
    console.warn('[save] Copia locale non salvata', error);
  }
  await flushEconomy();
  if (!scope.active || !canPlaySession()) return false;
  const data = buildSaveData();
  const content = JSON.stringify({ ...data, savedAt: 0 });
  if (
    !forceCloud &&
    game.lastCloudSaveContent === content &&
    game.moneyLevel === game.lastCloudMoney
  )
    return game.lastSavePromise;
  try {
    localStorage.setItem(game.session.SAVE_KEY, JSON.stringify(data));
  } catch {
    /* Already reported above. */
  }
  game.lastSaveContent = content;
  const now: GameValue = Date.now();
  if (forceCloud || game.moneyLevel !== game.lastCloudMoney || now - game.lastCloudSaveAt > 15000) {
    game.lastCloudSaveAt = now;
    game.lastCloudMoney = game.moneyLevel;
    const rank = {
      name: game.player.myData.nick,
      wealth: getWealth(),
      shifts: game.player.stats.shifts || 0,
      t: now,
      bornAt: game.player.bornAt || null,
    };
    // la classifica di tutti i mondi: se non riesce, il salvataggio vale lo stesso
    void game.session.db
      .ref('sims_leaderboard_global/' + game.session.myPlayerId)
      .set({ ...rank, world: game.session.worldId })
      .catch((e: unknown) => console.warn('[classifica globale]', e));
    game.lastSavePromise = Promise.all([
      game.session.db.ref('sims_saves/' + game.session.myPlayerId).set(data),
      game.session.db.ref(worldNode('leaderboard') + '/' + game.session.myPlayerId).set(rank),
    ])
      .then(() => {
        if (scope.active) game.lastCloudSaveContent = content;
        return true;
      })
      .catch((error) => {
        if (scope.active) {
          game.lastCloudSaveAt = 0;
          game.lastSaveContent = null;
        }
        console.warn('[save] Cloud non confermato', error);
        return false;
      });
  }
  publishRoomLayout();
  return game.lastSavePromise;
}

/** "3 giorni", "4,5 ore", "12 minuti". */
function durationText(seconds: number): string {
  const h = seconds / 3600;
  return h >= 48
    ? Math.floor(h / 24) + ' giorni'
    : h >= 1
      ? String(Math.round(h * 10) / 10).replace('.', ',') + ' ore'
      : Math.round(seconds / 60) + ' minuti';
}

// Il tempo scorre anche a gioco chiuso (nessun limite di ore): ricalcolo i bisogni per il tempo di assenza.
// Se il gioco era stato chiuso mentre il personaggio dormiva, continua a dormire finché il sonno non arriva a 100%.
// Con la criogenesi il tempo passato in capsula non conta, né per lui né per i suoi animali.
export function catchUpOffline(s?: GameValue, cryo: CryoPass | null = null): GameValue {
  const now = Date.now();
  const away: GameValue = (now - (s.savedAt || 0)) / 1000;
  if (!s.savedAt || !isFinite(away) || away <= 0) return;

  advanceAbsence(game.player, s.savedAt, now, needsRules(), cryo);
  const frozen = frozenMs(cryo, s.savedAt, now);
  // gli animali: il loro orologio della fame va avanti di quanto è durata la capsula
  if (frozen > 0)
    for (const pet of Object.values(game.player.pets ?? {}) as GameValue[])
      if (pet && typeof pet.at === 'number') pet.at += frozen;
  noteFaintOnReturn(!!s.sleeping);
  if (away < 60) return;
  const fainted = game.player.healthLevel <= 0;
  const txt = durationText(away);
  if (!fainted)
    lifetime.setTimeout(
      (): GameValue =>
        toast(
          frozen >= 60000
            ? `🧊 Sei stato via ${txt}: ${durationText(frozen / 1000)} in criogenesi, senza che il tempo passasse per il tuo personaggio`
            : `⏳ Sei stato via ${txt}: il tempo è passato anche per il tuo personaggio` +
                (s.sleeping ? ' (dormiva)' : ''),
          6000,
        ),
      2500,
    );
}

/**
 * Morti salvate prima che si scrivesse il motivo: se il gioco ha salvato al momento della morte,
 * i bisogni nel salvataggio sono quelli di allora (la manutenzione invece non li riscrive).
 */
function olderDeathCause(save: GameValue): string {
  if (!save.deadAt || (save.savedAt || 0) < save.deadAt) return '';
  const causes = deathCauses(game.player, save.deadAt);
  // salvato molto dopo la morte: è il gioco che, riaprendolo, l'ha trovato morto
  if (save.savedAt - save.deadAt > 10 * 60000) causes.push('away');
  return encodeDeathCauses(causes);
}

export async function loadGame(..._args: GameValue[]): Promise<GameValue> {
  let local: GameValue = null,
    cloud: GameValue = null;
  try {
    local = decodeSaveV8(JSON.parse(localStorage.getItem(game.session.SAVE_KEY) || 'null'));
  } catch (e: GameValue) {}
  try {
    const snap: GameValue = await withTimeout(
      game.session.db.ref('sims_saves/' + game.session.myPlayerId).once('value'),
      6000,
    );
    cloud = snap ? decodeSaveV8(snap.val()) : null;
  } catch (e: GameValue) {
    console.warn('Salvataggio online non disponibile', e);
  }
  let best: GameValue = local;
  // un personaggio già esistente: la guida iniziale non serve (vedi showIntro)
  game.session.hadSave = !!(local || cloud);
  if (cloud && (!best || (cloud.savedAt || 0) > (best.savedAt || 0))) best = cloud;
  // il pass di criogenesi serve prima di ricalcolare l'assenza
  const cryo = await loadMyCryo();
  // Una copia locale morta conta, tranne quando online c'è un salvataggio vivo più recente
  // (personaggio riportato in vita): altrimenti questo dispositivo lo farebbe morire di nuovo.
  const revived = (x: GameValue): boolean =>
    x !== cloud && !!cloud && !cloud.dead && (cloud.savedAt || 0) > (x.savedAt || 0);
  const deadSave: GameValue = [local, cloud].find(
    (x?: GameValue): GameValue => x && x.dead && !revived(x),
  );
  if (deadSave) {
    game.player.isDead = true;
    game.player.deadAt = deadSave.deadAt || 0;
    applySave(deadSave);
    game.player.deathCause = deadSave.deathCause || olderDeathCause(deadSave);
  } else if (best) {
    applySave(best);
    catchUpOffline(best, cryo);
    // morto mentre era via: sulla lapide va il momento in cui la salute è arrivata a zero
    if (game.player.healthLevel <= 0) {
      const death = absentDeath(
        best,
        game.player.ownedFurniture || {},
        Date.now(),
        undefined,
        cryo,
      );
      game.player.deadAt = death?.deadAt || 0;
      game.player.deathCause = death ? encodeDeathCauses(death.causes) : '';
    }
  }
  if (!game.player.bornAt && !game.player.isDead) game.player.bornAt = Date.now(); // nascita del personaggio (salvataggi vecchi: da ora)
  // Arrivo da un altro dispositivo con il codice: riprendo anche il nome
  if (localStorage.getItem(game.session.LS_PREFIX + 'sims_adopt_nick') && cloud && cloud.nick) {
    game.player.myData.nick = cloud.nick;
    localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', cloud.nick);
  }
  localStorage.removeItem(game.session.LS_PREFIX + 'sims_adopt_nick');
  game.pinPromptMoneyThreshold = game.moneyLevel;
  game.lastCloudMoney = game.moneyLevel;
  game.session.saveReady = true;
}

export function getMyRoomMap(..._args: GameValue[]): GameValue {
  let combined: GameValue = Object.assign({}, game.playerRoomFurniture);
  // Per ogni posizione mostra il mobile migliore posseduto (lusso > pregiato > standard).
  bestOwnedByProp(game.furnitureCatalog, game.player.ownedFurniture).forEach(
    (def: GameValue, propKey: string) => {
      combined[propKey] = def.propData;
    },
  );
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  const hung = roomPaintings(room);
  for (const slot of PAINTING_SLOTS) if (!hung[slot]) delete combined[paintingKey(slot)];
  // pianta in vaso e barattolo d'erba, casette degli animali
  Object.assign(combined, weedRoomItems());
  Object.assign(combined, petRoomItems());
  Object.assign(combined, limitedRoomItems());
  return combined;
}

export function publishRoomLayout(..._args: GameValue[]): GameValue {
  if (!hasRoom()) return;
  const layout: GameValue = {};
  const map: GameValue = getMyRoomMap();
  Object.keys(map).forEach((k?: GameValue): GameValue => {
    const o: GameValue = map[k];
    layout[k] = {
      x: Math.round(o.x),
      y: Math.round(o.y),
      w: o.w,
      h: o.h,
      z: o.z,
      name: o.name,
      color: o.color,
      topColor: o.topColor,
      ...(o.wallItem ? { wallItem: true } : {}),
      ...(o.rot ? { rot: o.rot } : {}),
      ...(o.grow ? { grow: o.grow } : {}),
      ...(o.jar ? { jar: o.jar } : {}),
      ...(o.pet ? { pet: o.pet } : {}),
    };
  });
  // cane e gatto (chi visita la stanza li vede girare)
  Object.assign(layout, freePetsForLayout());
  const key: GameValue = JSON.stringify(layout);
  if (key === game.lastLayoutKey) return;
  game.lastLayoutKey = key;
  // dal JSON, non dall'oggetto: Firebase rifiuta tutta la scrittura se un campo è undefined (la
  // mensola dei collezionabili non ha colore), e JSON.stringify quei campi li toglie
  game.session.db
    .ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}/layout`)
    .set(JSON.parse(key));
}

export function normalizeRooms(val?: GameValue): GameValue {
  let rooms: GameValue = [];
  for (let i: GameValue = 0; i < game.TOTAL_ROOMS; i++) {
    let r: GameValue = val && val[i] ? val[i] : {};
    rooms.push(Object.assign(game.blankRoom(i), r));
  }
  return rooms;
}

/** Soldi nella cassaforte di chi prende una stanza per la prima volta. */
export const START_MONEY = 30;

// Assegna la stanza con una transazione: due giocatori non possono prendere la stessa
export async function claimRoom(..._args: GameValue[]): Promise<GameValue> {
  let claimed: GameValue = -1;
  let free = -1;
  let full = false;
  const MONTH: GameValue = 30 * 24 * 3600 * 1000;
  // Firebase annulla la transazione se nel frattempo si scrive dentro rooms_state (la
  // disposizione dei mobili salvata appena creato il personaggio): allora si riprova.
  for (let attempt = 0; attempt < 3 && claimed === -1 && !full; attempt++)
    try {
      const result = await withTimeout(
        game.session.db
          .ref(worldNode('rooms_state'))
          .transaction((current?: GameValue): GameValue => {
            let rooms: GameValue = normalizeRooms(current);
            let idx: GameValue = rooms.findIndex(
              (r?: GameValue): GameValue => r.ownerId === game.session.myPlayerId,
            );
            if (idx === -1)
              idx = rooms.findIndex((r?: GameValue): GameValue => !r.owner && !r.ownerId);
            // Stanze abbandonate da più di 30 giorni (e con cassaforte vuota) tornano libere
            if (idx === -1 && game.session.OFFLINE)
              idx = rooms.findIndex(
                (r?: GameValue): GameValue =>
                  r.lastSeen && Date.now() - r.lastSeen > MONTH && !(r.vaultMoney > 0),
              );
            claimed = idx;
            if (idx === -1) return rooms;
            let old: GameValue = rooms[idx];
            let base: GameValue =
              old.ownerId === game.session.myPlayerId
                ? old
                : {
                    id: old.id,
                    // chi arriva in una stanza nuova trova qualche soldo per cominciare
                    vaultMoney: START_MONEY,
                    ...(old.pendingDeath ? { pendingDeath: old.pendingDeath } : {}),
                  };
            rooms[idx] = Object.assign({}, base, {
              owner: game.player.myData.nick,
              ownerId: game.session.myPlayerId,
              lastSeen: Date.now(),
            });
            free = countFree(rooms);
            return rooms;
          }),
        8000,
      );
      if (!result?.committed) claimed = -1;
      else if (claimed === -1) full = true;
      // l'elenco dei mondi sa quanti posti restano (per chi cerca un mondo pubblico)
      else if (free >= 0) void publishFreeRooms(game.session.worldId, free);
    } catch (e: GameValue) {
      claimed = -1;
      console.warn('Assegnazione stanza fallita', e);
    }
  game.myAssignedRoomIdx = claimed;
  if (full)
    toast(
      `🏠 Il condominio è pieno (${game.TOTAL_ROOMS} stanze): per ora giochi come ospite senza stanza.`,
      5000,
    );
  else if (claimed === -1)
    toast('🏠 La tua stanza non risponde: ricarica la pagina quando sei connesso.', 6000);
  else toast(`🏠 Abiti in: ${roomLabel(claimed, game.ROOMS_PER_APT)}`);
}

export function syncMyPinFromRoom(..._args: GameValue[]): GameValue {
  if (!hasRoom()) return;
  let room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (!room || room.ownerId !== game.session.myPlayerId || !room.pin) return;
  // Migra i vecchi PIN salvati in chiaro
  if (!String(room.pin).startsWith('h')) {
    game.session.db
      .ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}/pin`)
      .set(hashPin(room.pin, room.id));
  }
  game.hasSetSafePin = true;
  // Combinazione con un 5 ma cassaforte di livello 1 (scelta quando il 5 era permesso a tutti,
  // o prima di rivendere la cassaforte livello 2): si chiede di cambiarla una volta
  if (!game.pinRetiredAsked && pinTooHighForLevel(room.pin, room.id, mySafeLevel())) {
    game.pinRetiredAsked = true;
    lifetime.setTimeout(
      () =>
        void promptSetSafePin(
          'La tua cassaforte (livello 1) accetta solo le cifre da 1 a 4, e la tua combinazione contiene un 5. Scegline una nuova: ' +
            pinHint(1) +
            '.\n\nCon la cassaforte livello 2 del negozio di mobili puoi usare anche il 5.',
        ),
      3000,
    );
  }
}

export function presenceAlive(id?: GameValue, op?: GameValue, now?: GameValue): GameValue {
  if (!op || !op.t) return false;
  const tr: GameValue =
    game.presenceTrack[id] || (game.presenceTrack[id] = { t: op.t, at: now, changes: 1 });
  if (tr.t !== op.t) {
    tr.t = op.t;
    tr.at = now;
    tr.changes++;
  }
  const seenRecently: GameValue = now - tr.at < 30000;
  if (game.session.OFFLINE) return seenRecently;
  const serverFresh: GameValue = now + game.session.serverOffset - op.t < 30000;
  return serverFresh || (tr.changes >= 2 && seenRecently);
}

/**
 * Il cane per gli altri: dog 1 al guinzaglio; nell'area cani dog 2 con la sua posizione (le
 * versioni vecchie del gioco lo vedono comunque, al guinzaglio).
 */
function dogPresence(): { dog?: number; dogX?: number; dogY?: number } {
  const w = game.dogWalk;
  if (!w) return {};
  if ((w.mode || 'leash') === 'leash') return { dog: 1 };
  return { dog: 2, dogX: Math.round(w.x), dogY: Math.round(w.y) };
}

export function startPresence(..._args: GameValue[]): GameValue {
  try {
    game.session.db.ref('.info/serverTimeOffset').on('value', (s?: GameValue): GameValue => {
      game.session.serverOffset = Number(s.val()) || 0;
    });
  } catch (e: GameValue) {}
  const playerRef: GameValue = game.session.db.ref(
    worldNode('online_players') + '/' + game.session.myPlayerId,
  );
  // Quando chiude la pagina il giocatore resta visibile agli altri, segnato come offline
  playerRef.onDisconnect().update(OFFLINE_MARK);
  // Invia la posizione solo quando cambia, più un battito ogni 5 s
  let lastSentKey: GameValue = '',
    lastSentAt: GameValue = 0;
  lifetime.setInterval((): GameValue => {
    // da morto non si manda più niente: rimetterebbe in giro il personaggio appena tolto
    if (game.player.isDead) return;
    const payload: GameValue = {
      name: game.player.myData.nick,
      x: Math.round(game.playerPos.x),
      y: Math.round(game.playerPos.y),
      env: game.view.activeEnvironment,
      roomIdx: game.view.activeEnvironment === 'PLAYER_ROOM' ? game.currentRoomIdx : null,
      apt: game.APT_ENVS.includes(game.view.activeEnvironment) ? game.currentApt : null,
      outfit: resolveLook(game.player.equipped).top.color,
      look: lookString(),
      body: game.bodyString(currentBody()),
      // parametri vitali e posto: li vedono gli altri cliccando la mia icona
      ...publishVitals(
        {
          health: game.player.healthLevel,
          sleep: game.player.sleepLevel,
          hunger: game.player.hungerLevel,
          hygiene: game.player.hygieneLevel,
          happiness: game.player.happinessLevel,
        },
        game.view.activeEnvironment === 'PLAYER_ROOM' &&
          game.currentRoomIdx === game.myAssignedRoomIdx
          ? 'Nella sua stanza 🏠'
          : game.view.currentRoomTitle,
      ),
      // occhi rossi dopo una canna: li vedono anche gli altri
      ...(isStoned() ? { stoned: true } : {}),
      act: game.rocketTrip
        ? 'rocket'
        : cabinetOpen()
          ? 'arcade'
          : performance.now() < game.smokeUntil
            ? 'smoke'
            : game.fainted
              ? 'faint'
              : kissActive()
                ? 'kiss'
                : game.showerAnim
                  ? 'shower'
                  : game.bathAnim
                    ? game.bathAnim.pose || ''
                    : game.benchSit
                      ? myBenchPose()
                      : game.player.isSleeping
                        ? 'sleep'
                        : '',
      ...(game.showerAnim?.und ? { und: game.showerAnim.und } : {}),
      say: game.mySay,
      sayT: game.mySayT,
      ...(isSick(game.player.flu, Date.now()) ? { sick: 1 } : {}),
      // scasso in corso: il proprietario lo vede e può fermarlo con un pugno (vedi hacker.ts)
      ...(currentCrack()
        ? { crack: String(currentCrack()!.roomIdx), crackT: currentCrack()!.startAt }
        : {}),
      ...dogPresence(),
      // personalità ottenuta: la vedono gli altri nella scheda del giocatore
      ...(obtainedPersonality(game.player.personality)
        ? {
            pers: obtainedPersonality(game.player.personality),
            persLv: personalityLevel(game.player.personality),
          }
        : {}),
      ...(game.player.isSleeping ? { bed: game.bedSlot } : {}),
    };
    const key: GameValue = JSON.stringify(payload);
    const now: GameValue = Date.now();
    if (key !== lastSentKey || now - lastSentAt > 5000) {
      payload.t = now + game.session.serverOffset;
      playerRef.set(payload);
      // copia sul dispositivo dell'ultimo posto, per il rientro (vedi resumeLastSpot)
      try {
        localStorage.setItem(
          game.session.LS_PREFIX + 'sims_last_spot',
          JSON.stringify({
            id: game.session.myPlayerId,
            env: payload.env,
            x: payload.x,
            y: payload.y,
            roomIdx: payload.roomIdx,
            apt: payload.apt,
          }),
        );
      } catch (e: GameValue) {}
      lastSentKey = key;
      lastSentAt = now;
    }
  }, 100);
  game.session.db
    .ref(worldNode('online_players'))
    .on('value', (snapshot?: GameValue): GameValue => {
      game.onlinePlayers = snapshot.val() || {};
    });
  startInbox();
  startChat();
}

export function watchGameVersion(..._args: GameValue[]): GameValue {
  const ref: GameValue = game.session.db.ref('sims_meta/version');
  ref.on('value', (s?: GameValue): GameValue => {
    const v: GameValue = s.val();
    if (typeof v === 'number' && v > game.GAME_VERSION) {
      saveGame(true);
      dom('update-banner').classList.remove('hidden');
    }
  });
}

export function reloadForUpdate(..._args: GameValue[]): GameValue {
  location.href = location.pathname + '?v=' + Date.now();
}
