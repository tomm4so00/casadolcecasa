import { maskText } from '../../shared/text-filter-rules.js';
import { isBlocked, startBlocks } from './blocks.js';
import { isMuted, startModeration } from './moderation.js';
import { autoplayPresence } from './autoplay.js';
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
import { decodeTrashSave } from './trash-rules.js';
import { isStoned, syncWeedPot, weedRoomItems } from './weed.js';
import { publishVitals } from './players-hud-rules.js';
import { needsRules } from './needs-rules.js';
import { syncRoomEconomy, creditMoney, flushEconomy } from './economy.js';
import { canPlaySession } from './accounts.js';
import type { SaveV8, ValidatedSave } from './save-model.js';
import { version as appVersion } from '../../package.json';
import { updateAvailable } from '../../shared/app-version.js';
import type { RoomState, SceneMap } from './models.js';
import type { OnlinePlayer } from './network-model.js';
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
import { decodeQuests } from './quests-rules.js';
import { decodeDaily } from './daily-rules.js';
import { decodeSeenPlaces } from './first-visit-rules.js';
import { limitedFurnitureProps, limitedRoomItems } from './limited.js';
import {
  decodePersonality,
  obtainedPersonality,
  personalityLevel,
  personalityRank,
} from './personality-rules.js';
import { decodeWorkDay } from './job-pay.js';
import { pushOutOfCorridor } from './room-layout.js';
import { footprintOf } from './render/primitives.js';
import { PAINTING_SLOTS, paintingKey, roomPaintings } from './painting-rules.js';
import { kissActive } from './romance.js';
import { noteFaintOnReturn } from './faint.js';
import { promptSetSafePin } from './needs.js';
import { syncMyPin } from './safe-pins.js';
import { worldNode } from './world-db.js';
import { cabinetOpen } from './cabinet.js';
import { currentCrack } from './crack.js';
import { decodeFood, encodeFood } from './food-rules.js';
import { PRESENCE_TICK_MS, presenceSend, velocity } from './presence-send-rules.js';

/** Segna la presenza come offline, con l'ora del server in cui il giocatore è uscito. */
export const OFFLINE_MARK = { offline: true, offAt: { '.sv': 'timestamp' } };
/** Livello della mia cassaforte (2 con la cassaforte livello 2 del negozio di mobili). */
/** Da quanto deve vivere un personaggio per contare come giocatore di prima dei capitoli. */
const OLD_PLAYER_MS = 86_400_000;

export const mySafeLevel = (): 1 | 2 => safeLevel(game.player.ownedFurniture);

export { hashPin };

export function hasRoom(): boolean {
  return game.myAssignedRoomIdx !== null && game.myAssignedRoomIdx >= 0;
}

export function syncVaultFromServer(): void {
  if (!hasRoom()) return;
  const room: RoomState | undefined = game.roomsState[game.myAssignedRoomIdx ?? -1];
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
    const amount = game.legacyPocketMoney;
    game.legacyPocketMoney = 0;
    void creditMoney(amount).then((ok) => {
      if (!ok) game.legacyPocketMoney += amount;
    });
    toast(`💰 I ${amount} Đ che avevi in tasca sono stati spostati in cassaforte.`, 5000);
    saveGame(true);
  }
}

export function isMyRoomNow(): boolean {
  return (
    game.view.activeEnvironment === 'PLAYER_ROOM' &&
    hasRoom() &&
    game.currentRoomIdx === game.myAssignedRoomIdx
  );
}

/** La risposta di `promise`, oppure null se non arriva entro `ms` millisecondi. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>((resolve) => lifetime.setTimeout(() => resolve(null), ms)),
  ]);
}

export function buildSaveData(): SaveV8 {
  const furniturePos: NonNullable<SaveV8['furniturePos']> = {};
  Object.keys(game.playerRoomFurniture).forEach(
    (k) =>
      (furniturePos['base_' + k] = {
        x: Math.round(game.playerRoomFurniture[k].x),
        y: Math.round(game.playerRoomFurniture[k].y),
        ...(game.playerRoomFurniture[k].rot ? { rot: game.playerRoomFurniture[k].rot } : {}),
      }),
  );
  game.furnitureCatalog.forEach((f) => {
    const prop: { x: number; y: number; rot?: number } = f.propData;
    furniturePos[f.id] = {
      x: Math.round(prop.x),
      y: Math.round(prop.y),
      ...(prop.rot ? { rot: prop.rot } : {}),
    };
  });
  // mobili in edizione limitata: il loro posto nella stanza
  limitedFurnitureProps().forEach((p, id) => {
    furniturePos[id] = { x: Math.round(p.x), y: Math.round(p.y), ...(p.rot ? { rot: p.rot } : {}) };
  });
  const r1 = (v: number): number => Math.round(v * 10) / 10;
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
  if (game.player.quests) data.quests = game.player.quests;
  if (game.player.today) data.today = game.player.today;
  if (game.player.placesSeen?.length) data.placesSeen = game.player.placesSeen;
  if (game.player.workDay) data.workDay = game.player.workDay;
  // fin dove si è letta la chat: vale su tutti i dispositivi, non solo su questo
  if (game.chatReadT > 0) data.chatReadT = game.chatReadT;
  // età e condizioni confermate, avviso della chat letto (terms.ts)
  if (game.player.termsAt) data.termsAt = game.player.termsAt;
  if (game.player.adultAt) data.adultAt = game.player.adultAt;
  if (game.player.chatNoticeAt) data.chatNoticeAt = game.player.chatNoticeAt;
  // suoni, musica, notifiche e il resto: uguali su ogni telefono, browser o app installata
  data.prefs = collectPrefs();
  data.worldId = game.session.worldId;
  if (game.player.daily) data.daily = game.player.daily;
  if (game.player.trash && Object.keys(game.player.trash).length) data.trash = game.player.trash;
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
    Object.keys(game.player.invest).forEach((k) => {
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
  game.player.termsAt = moment(s.termsAt);
  game.player.adultAt = moment(s.adultAt);
  game.player.chatNoticeAt = moment(s.chatNoticeAt);
  const num = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : d);
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
  game.player.trash = decodeTrashSave(s.trash);
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
  game.BIZ.forEach((b) => {
    const v = s.invest?.[b.id];
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
  const sb = parseBody(s.body);
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
  // capitoli delle missioni: chi giocava già da un giorno salta il Capitolo 1 (la sopravvivenza)
  game.player.quests = decodeQuests(s.quests);
  game.player.today = decodeDaily(s.today);
  game.player.placesSeen = decodeSeenPlaces(s.placesSeen);
  const born = game.player.bornAt;
  if (!s.quests && (!born || Date.now() - born > OLD_PLAYER_MS)) game.player.quests.old = true;
  game.player.ownedItems = s.ownedItems || {};
  game.player.ownedFurniture = s.ownedFurniture || {};
  if (s.equipped) {
    game.player.equipped = Object.assign({}, game.DEFAULT_LOOK, s.equipped);
  } else {
    // Salvataggi della versione precedente: colore della maglia + accessori
    game.player.equipped = Object.assign({}, game.DEFAULT_LOOK);
    const oldTop = game.shopCatalog.find(
      (i) => i.slot === 'top' && i.color === s.currentOutfitColor && ownsItem(i.id),
    );
    if (oldTop) game.player.equipped.top = oldTop.id;
    const acc = s.equippedAcc || {};
    if (acc.glasses) game.player.equipped.glasses = 'item_glasses';
    if (acc.crown) game.player.equipped.hat = 'item_crown';
    else if (acc.hat) game.player.equipped.hat = 'item_hat';
  }
  game.SLOTS.forEach((sl: string) => {
    // i capi in edizione limitata si controllano quando arriva il registro delle copie (limited.ts)
    const eq = game.player.equipped[sl];
    if (eq && !String(eq).startsWith('ltd_') && !ownsItem(eq))
      game.player.equipped[sl] = game.DEFAULT_LOOK[sl];
  });
  game.player.activeJobKey = s.activeJobKey || null;
  game.player.jobExperience = Object.assign(game.player.jobExperience, s.jobExperience || {});
  let fp: Record<string, { x: number; y: number; rot?: number } | undefined> = s.furniturePos || {};
  // la mensola mai spostata stava nel primo posto scelto, ora coperto dalla tenda: riparte dal nuovo
  const shelf = fp.base_collectShelf;
  if (shelf && shelf.x === -75 && shelf.y === -165) fp = { ...fp, base_collectShelf: undefined };
  Object.keys(game.playerRoomFurniture).forEach((k) => {
    // solo i mobili spostabili: cassaforte e porta restano dove sono
    if (fp['base_' + k] && game.playerRoomFurniture[k].moveable)
      Object.assign(game.playerRoomFurniture[k], fp['base_' + k]);
  });
  game.furnitureCatalog.forEach((f) => {
    if (fp[f.id]) Object.assign(f.propData, fp[f.id]);
  });
  limitedFurnitureProps().forEach((p, id) => {
    if (fp[id]) Object.assign(p, fp[id]);
  });
  // Mobili sistemati prima del passaggio libero: vengono spinti fuori.
  [
    ...Object.values(game.playerRoomFurniture),
    ...game.furnitureCatalog.map((f) => f.propData),
  ].forEach((item) => {
    if (!item.moveable || item.wallItem) return;
    const fp2 = footprintOf(item);
    Object.assign(item, pushOutOfCorridor({ x: item.x, y: item.y, w: fp2.w, h: fp2.h }));
  });
}

export async function saveGame(forceCloud = false): Promise<boolean> {
  if (!game.session.saveReady || game.player.isDead) return Promise.resolve(true);
  // in pausa non si salva niente, nemmeno in locale: l'ultimo salvataggio è quello fatto prima
  // della pausa, e da lì al rientro il tempo lo conta catchUpOffline (una volta sola)
  if (game.session.dormant) return false;
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
  const now = Date.now();
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
      game.session.db
        .ref(worldNode('leaderboard') + '/' + game.session.myPlayerId)
        .set({ ...rank, ...personalityRank(game.player.personality) }),
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
export function catchUpOffline(
  s: Pick<ValidatedSave, 'savedAt' | 'sleeping'>,
  cryo: CryoPass | null = null,
): void {
  const now = Date.now();
  const away = (now - (s.savedAt || 0)) / 1000;
  if (!s.savedAt || !isFinite(away) || away <= 0) return;

  advanceAbsence(game.player, s.savedAt, now, needsRules(), cryo);
  const frozen = frozenMs(cryo, s.savedAt, now);
  // gli animali: il loro orologio della fame va avanti di quanto è durata la capsula
  if (frozen > 0)
    for (const pet of Object.values(game.player.pets ?? {}))
      if (pet && typeof pet.at === 'number') pet.at += frozen;
  noteFaintOnReturn(!!s.sleeping);
  if (away < 60) return;
  const fainted = game.player.healthLevel <= 0;
  const txt = durationText(away);
  if (!fainted)
    lifetime.setTimeout(
      () =>
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
function olderDeathCause(save: ValidatedSave): string {
  if (!save.deadAt || (save.savedAt || 0) < save.deadAt) return '';
  const causes = deathCauses(game.player, save.deadAt);
  // salvato molto dopo la morte: è il gioco che, riaprendolo, l'ha trovato morto
  if (save.savedAt - save.deadAt > 10 * 60000) causes.push('away');
  return encodeDeathCauses(causes);
}

export async function loadGame(): Promise<void> {
  let local: ValidatedSave | null = null,
    cloud: ValidatedSave | null = null;
  try {
    local = decodeSaveV8(JSON.parse(localStorage.getItem(game.session.SAVE_KEY) || 'null'));
  } catch {
    /* copia locale assente o rovinata */
  }
  try {
    const snap = await withTimeout(
      game.session.db.ref('sims_saves/' + game.session.myPlayerId).once('value'),
      6000,
    );
    cloud = snap ? decodeSaveV8(snap.val()) : null;
  } catch (e) {
    console.warn('Salvataggio online non disponibile', e);
  }
  let best: ValidatedSave | null = local;
  // un personaggio già esistente: la guida iniziale non serve (vedi showIntro)
  game.session.hadSave = !!(local || cloud);
  if (cloud && (!best || (cloud.savedAt || 0) > (best.savedAt || 0))) best = cloud;
  // il pass di criogenesi serve prima di ricalcolare l'assenza
  const cryo = await loadMyCryo();
  // Una copia locale morta conta, tranne quando online c'è un salvataggio vivo più recente
  // (personaggio riportato in vita): altrimenti questo dispositivo lo farebbe morire di nuovo.
  const revived = (x: ValidatedSave): boolean =>
    x !== cloud && !!cloud && !cloud.dead && (cloud.savedAt || 0) > (x.savedAt || 0);
  const deadSave = [local, cloud].find((x): x is ValidatedSave => !!x && !!x.dead && !revived(x));
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

export function getMyRoomMap(): SceneMap {
  const combined: SceneMap = Object.assign({}, game.playerRoomFurniture);
  // Per ogni posizione mostra il mobile migliore posseduto (lusso > pregiato > standard).
  bestOwnedByProp(game.furnitureCatalog, game.player.ownedFurniture).forEach(
    (def, propKey: string) => {
      combined[propKey] = def.propData;
    },
  );
  const room: RoomState | undefined = game.roomsState[game.myAssignedRoomIdx ?? -1];
  const hung = roomPaintings(room);
  for (const slot of PAINTING_SLOTS) if (!hung[slot]) delete combined[paintingKey(slot)];
  // piante in vaso, casette degli animali
  Object.assign(combined, weedRoomItems());
  Object.assign(combined, petRoomItems());
  Object.assign(combined, limitedRoomItems());
  return combined;
}

export function publishRoomLayout(): void {
  if (!hasRoom()) return;
  const layout: Record<string, unknown> = {};
  const map = getMyRoomMap();
  Object.keys(map).forEach((k) => {
    const o = map[k];
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
      ...(o.pet ? { pet: o.pet } : {}),
    };
  });
  // cane e gatto (chi visita la stanza li vede girare)
  Object.assign(layout, freePetsForLayout());
  const key = JSON.stringify(layout);
  if (key === game.lastLayoutKey) return publishTrophies();
  game.lastLayoutKey = key;
  // dal JSON, non dall'oggetto: Firebase rifiuta tutta la scrittura se un campo è undefined (la
  // mensola dei collezionabili non ha colore), e JSON.stringify quei campi li toglie
  game.session.db
    .ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}/layout`)
    .set(JSON.parse(key));
  publishTrophies();
}

let lastTrophiesKey = '';
/** I trofei della mensola, perché li veda anche chi viene in visita (render/trophies.ts). */
function publishTrophies(): void {
  const list = (game.player.trophies || []).slice(0, 8);
  const key = `${game.myAssignedRoomIdx}:${list.join(',')}`;
  if (key === lastTrophiesKey) return;
  lastTrophiesKey = key;
  game.session.db
    .ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}/trophies`)
    .set(list.length ? list : null);
}

/** L'elenco delle stanze sempre completo: quelle che mancano nel database sono libere. */
export function normalizeRooms(val?: unknown): RoomState[] {
  const list = (val && typeof val === 'object' ? val : {}) as Record<number, Partial<RoomState>>;
  const rooms: RoomState[] = [];
  for (let i = 0; i < game.TOTAL_ROOMS; i++) {
    const r = list[i] || {};
    rooms.push(Object.assign(game.blankRoom(i), r));
  }
  return rooms;
}

/** Soldi nella cassaforte di chi prende una stanza per la prima volta. */
export const START_MONEY = 30;

const MONTH = 30 * 24 * 3600 * 1000;

/** Libera, oppure (solo in prova) abbandonata da più di 30 giorni con la cassaforte vuota. */
function takeable(r: RoomState): boolean {
  if (!r.owner && !r.ownerId) return true;
  return (
    game.session.OFFLINE && !!r.lastSeen && Date.now() - r.lastSeen > MONTH && !(r.vaultMoney > 0)
  );
}

/** La stanza da prendere: la mia, se no la prima che si può prendere; -1 se è tutto pieno. */
function pickRoom(rooms: RoomState[]): number {
  const mine = rooms.findIndex((r) => r.ownerId === game.session.myPlayerId);
  return mine !== -1 ? mine : rooms.findIndex(takeable);
}

/**
 * Assegna la stanza all'ingresso. Si scrive solo la propria: tutta la lista (64 stanze, circa
 * 17 KB) a ogni ingresso arrivava a tutti i giocatori collegati. Se la scrittura della sola
 * stanza non va (per esempio una lista vecchia a cui manca qualche stanza), si fa come prima.
 */
export async function claimRoom(): Promise<void> {
  let result: { claimed: number; full: boolean } | null = null;
  try {
    result = await claimRoomAlone();
  } catch (e) {
    console.warn('Assegnazione della sola stanza fallita, riprovo con la lista', e);
  }
  const { claimed, full } = result ?? (await claimRoomWholeList());
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

/** Chi ha già la stanza aggiorna nome e ultimo ingresso; chi arriva ne prende una libera. */
async function claimRoomAlone(): Promise<{ claimed: number; full: boolean } | null> {
  const me = game.session.myPlayerId;
  const nick = game.player.myData.nick;
  const listRef = game.session.db.ref(worldNode('rooms_state'));
  for (let attempt = 0; attempt < 4; attempt++) {
    const snap = await withTimeout(listRef.once('value'), 8000);
    const rooms = normalizeRooms(snap?.val());
    const idx = pickRoom(rooms);
    if (idx === -1) return { claimed: -1, full: true };
    const roomRef = game.session.db.ref(worldNode('rooms_state') + '/' + idx);
    if (rooms[idx].ownerId === me) {
      await withTimeout(roomRef.update({ owner: nick, lastSeen: Date.now() }), 8000);
      return { claimed: idx, full: false };
    }
    // una transazione sulla sola stanza: se intanto l'ha presa un altro, si rinuncia e si riprova
    let took = false;
    const result = await withTimeout(
      roomRef.transaction((current: unknown) => {
        const old = Object.assign(game.blankRoom(idx), current || {}) as RoomState;
        took = old.ownerId === me || takeable(old);
        if (!took) return undefined;
        const base: RoomState =
          old.ownerId === me
            ? old
            : {
                id: old.id,
                // chi arriva in una stanza nuova trova qualche soldo per cominciare
                vaultMoney: START_MONEY,
                ...(old.pendingDeath ? { pendingDeath: old.pendingDeath } : {}),
              };
        return { ...base, owner: nick, ownerId: me, lastSeen: Date.now() };
      }),
      8000,
    );
    if (result?.committed && took) {
      // l'elenco dei mondi sa quanti posti restano (per chi cerca un mondo pubblico)
      rooms[idx] = { ...rooms[idx], owner: nick, ownerId: me };
      void publishFreeRooms(game.session.worldId, countFree(rooms));
      return { claimed: idx, full: false };
    }
  }
  return null;
}

/** Il modo di prima: una transazione su tutta la lista. */
async function claimRoomWholeList(): Promise<{ claimed: number; full: boolean }> {
  let claimed = -1;
  let free = -1;
  let full = false;
  // Firebase annulla la transazione se nel frattempo si scrive dentro rooms_state (la
  // disposizione dei mobili salvata appena creato il personaggio): allora si riprova.
  for (let attempt = 0; attempt < 3 && claimed === -1 && !full; attempt++)
    try {
      const result = await withTimeout(
        game.session.db.ref(worldNode('rooms_state')).transaction((current: unknown) => {
          const rooms = normalizeRooms(current);
          const idx = pickRoom(rooms);
          claimed = idx;
          if (idx === -1) return rooms;
          const old = rooms[idx];
          const base: RoomState =
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
    } catch (e) {
      claimed = -1;
      console.warn('Assegnazione stanza fallita', e);
    }
  return { claimed, full };
}

export function syncMyPinFromRoom(): void {
  if (!hasRoom()) return;
  const room: RoomState | undefined = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (!room || room.ownerId !== game.session.myPlayerId) return;
  // il PIN sta nel nodo privato: quello vecchio nella stanza si sposta lì (safe-pins.ts)
  void syncMyPin().then(checkRetiredPin);
}

/**
 * Combinazione con un 5 ma cassaforte di livello 1 (scelta quando il 5 era permesso a tutti,
 * o prima di rivendere la cassaforte livello 2): si chiede di cambiarla una volta.
 */
function checkRetiredPin(): void {
  if (
    !game.pinRetiredAsked &&
    game.hasSetSafePin &&
    pinTooHighForLevel(game.safePinCode, game.session.myPlayerId, mySafeLevel())
  ) {
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

/** Il giocatore è davvero collegato? La sua presenza cambia ancora (op.t) e non è vecchia. */
export function presenceAlive(
  id: string,
  op: OnlinePlayer | null | undefined,
  now: number,
): boolean {
  if (!op || !op.t) return false;
  const tr: { t: number; at: number; changes: number } =
    game.presenceTrack[id] || (game.presenceTrack[id] = { t: op.t, at: now, changes: 1 });
  if (tr.t !== op.t) {
    tr.t = op.t;
    tr.at = now;
    tr.changes++;
  }
  const seenRecently = now - tr.at < 30000;
  if (game.session.OFFLINE) return seenRecently;
  const serverFresh = now + game.session.serverOffset - op.t < 30000;
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

export function startPresence(): void {
  try {
    game.session.db.ref('.info/serverTimeOffset').on('value', (s) => {
      game.session.serverOffset = Number(s.val()) || 0;
    });
  } catch {
    /* senza l'ora del server si usa quella del telefono */
  }
  const playerRef = game.session.db.ref(
    worldNode('online_players') + '/' + game.session.myPlayerId,
  );
  // Quando chiude la pagina (o il gioco va in pausa) il giocatore resta visibile agli altri,
  // segnato come offline: lo scrive il server quando la connessione cade. La richiesta si fa dopo
  // aver scritto la presenza (le regole vogliono nome e posizione, e la controllano subito) e di
  // nuovo a ogni riconnessione, perché il server la usa una volta sola.
  let offlineArmed = false;
  // Si manda solo quello che cambia (presence-send-rules.ts); `lastSent` null = la prossima volta
  // la scheda intera: dopo una riconnessione il server può averla segnata offline.
  let lastSent: Record<string, unknown> | null = null,
    lastSentAt = 0,
    lastFullAt = 0;
  game.session.db.ref('.info/connected').on('value', (s) => {
    if (s.val() !== true) {
      offlineArmed = false;
      lastSent = null;
    }
  });
  const armOffline = (): void => {
    Promise.resolve(playerRef.onDisconnect().update(OFFLINE_MARK)).catch((e: unknown) => {
      offlineArmed = false;
      console.warn('[presenza]', e);
    });
  };
  // La velocità: gli altri la usano per farmi camminare senza un messaggio a ogni passo
  // (presence-send-rules.ts, remote-motion.ts). Si misura sugli ultimi 300 ms: su un solo controllo
  // oscilla (i fotogrammi fra due controlli non sono sempre gli stessi) e farebbe partire punti in
  // più. Fermi però si è subito: altrimenti gli altri mi vedrebbero proseguire e tornare indietro.
  const VELOCITY_WINDOW_MS = 300;
  let recent: { x: number; y: number; at: number }[] = [];
  let recentEnv = '';
  lifetime.setInterval(() => {
    // da morto non si manda più niente: rimetterebbe in giro il personaggio appena tolto;
    // in pausa nemmeno: per gli altri si è usciti (al ritorno si rimanda la scheda intera)
    if (game.player.isDead || game.session.dormant) {
      lastSent = null;
      return;
    }
    const pos = { x: Math.round(game.playerPos.x), y: Math.round(game.playerPos.y) };
    const tick = performance.now();
    if (recentEnv !== game.view.activeEnvironment) recent = [];
    recentEnv = game.view.activeEnvironment;
    const prev = recent[recent.length - 1];
    const stopped = !prev || (prev.x === pos.x && prev.y === pos.y);
    recent = recent.filter((r) => tick - r.at <= VELOCITY_WINDOW_MS);
    const v =
      stopped || !recent.length ? { vx: 0, vy: 0 } : velocity(recent[0], pos, tick - recent[0].at);
    recent.push({ ...pos, at: tick });
    const payload: Record<string, unknown> = {
      name: game.player.myData.nick,
      ...pos,
      ...v,
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
      // per vivere da solo quando esco (autoplay.ts)
      ...autoplayPresence(),
      // personalità ottenuta: la vedono gli altri nella scheda del giocatore
      ...(obtainedPersonality(game.player.personality)
        ? {
            pers: obtainedPersonality(game.player.personality),
            persLv: personalityLevel(game.player.personality),
          }
        : {}),
      ...(game.player.isSleeping ? { bed: game.bedSlot } : {}),
    };
    const now = Date.now();
    const send = presenceSend({ last: lastSent, next: payload, now, lastSentAt, lastFullAt });
    if (send.kind !== 'none') {
      const t = now + game.session.serverOffset;
      const sent =
        send.kind === 'full'
          ? playerRef.set({ ...payload, t })
          : playerRef.update({ ...send.changes, t });
      // scrittura rifiutata (per esempio la scheda non c'è più): la prossima parte intera
      void Promise.resolve(sent).catch(() => {
        lastSent = null;
      });
      if (send.kind === 'full') lastFullAt = now;
      if (!offlineArmed) {
        offlineArmed = true;
        void Promise.resolve(sent).then(armOffline, () => {
          offlineArmed = false;
        });
      }
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
      } catch {
        /* archivio del browser pieno o bloccato: il posto si ritrova dalla presenza */
      }
      lastSent = payload;
      lastSentAt = now;
    }
  }, PRESENCE_TICK_MS);
  game.session.db.ref(worldNode('online_players')).on('value', (snapshot) => {
    const all = snapshot.val() || {};
    // nomi e fumetti li scrivono i giocatori, anche con versioni vecchie: si copre quello che non va
    for (const [id, op] of Object.entries(all) as [string, Record<string, unknown>][]) {
      if (!op || typeof op !== 'object') continue;
      if (typeof op.name === 'string') op.name = maskText(op.name);
      if (typeof op.say === 'string') op.say = maskText(op.say);
      // i fumetti di chi ho bloccato o di chi è silenziato non si vedono (blocks.ts, moderation.ts)
      if (isBlocked(id) || isMuted(id)) delete op.say;
    }
    game.onlinePlayers = all;
  });
  startInbox();
  startChat();
  startBlocks();
  startModeration();
}

/**
 * Il banner "Nuova versione!": la manutenzione scrive in sims_meta/app la versione davvero
 * online (shared/app-version.ts). sims_meta/version (formato dei salvataggi) qui non conta più:
 * il server lo alza solo per avvisare le versioni di prima.
 */
export function watchGameVersion(): void {
  const ref = game.session.db.ref('sims_meta/app');
  ref.on('value', (s) => {
    if (updateAvailable(s.val(), appVersion)) {
      saveGame(true);
      dom('update-banner').classList.remove('hidden');
    }
  });
}

export function reloadForUpdate(): void {
  location.href = location.pathname + '?v=' + Date.now();
}
