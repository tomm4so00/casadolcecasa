import type { GameValue } from './context.js';
import type { SaveV8 } from './save-model.js';
import { decodeSaveV8 } from './save-model.js';
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { getWealth, toast } from './missions.js';
import { currentBody, lookString, ownsItem, parseBody, resolveLook } from './character.js';
import { drugApply } from './needs.js';
import { startInbox } from './social.js';
import { startChat } from './chat.js';
export function hashPin(pin?: GameValue, salt?: GameValue): GameValue {
  let s: GameValue = 'sims:' + salt + ':' + pin,
    h: GameValue = 5381;
  for (let i: GameValue = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
}

export function hasRoom(..._args: GameValue[]): GameValue {
  return game.myAssignedRoomIdx !== null && game.myAssignedRoomIdx >= 0;
}

export function syncVaultFromServer(..._args: GameValue[]): GameValue {
  if (!hasRoom()) return;
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx];
  if (!room || room.ownerId !== game.myPlayerId) return;
  game.vaultCache = Math.max(0, room.vaultMoney || 0);
  if (!game.vaultSynced) {
    game.vaultSynced = true;
    game.pinPromptMoneyThreshold = game.vaultCache;
    game.lastCloudMoney = game.vaultCache;
    game.lastMoneyForSound = game.vaultCache;
  }
  if (game.legacyPocketMoney > 0) {
    const amount: GameValue = game.legacyPocketMoney;
    game.legacyPocketMoney = 0;
    game.moneyLevel += amount;
    toast(`💰 I ${amount} € che avevi in tasca sono stati spostati in cassaforte.`, 5000);
    saveGame(true);
  }
}

export function isMyRoomNow(..._args: GameValue[]): GameValue {
  return (
    game.activeEnvironment === 'PLAYER_ROOM' &&
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
      }),
  );
  game.furnitureCatalog.forEach(
    (f?: GameValue): GameValue =>
      (furniturePos[f.id] = { x: Math.round(f.propData.x), y: Math.round(f.propData.y) }),
  );
  const r1: GameValue = (v?: GameValue): GameValue => Math.round(v * 10) / 10;
  const data: SaveV8 = {
    v: game.GAME_VERSION,
    savedAt: Date.now(),
    nick: game.myData.nick,
    healthLevel: r1(game.healthLevel),
    sleepLevel: r1(game.sleepLevel),
    hungerLevel: r1(game.hungerLevel),
    hygieneLevel: r1(game.hygieneLevel),
    happinessLevel: r1(game.happinessLevel),
    moneyLevel: game.legacyPocketMoney,
    vaultOnly: game.legacyPocketMoney <= 0,
    ownedItems: game.ownedItems,
    ownedFurniture: game.ownedFurniture,
    equipped: game.equipped,
    activeJobKey: game.activeJobKey,
    jobExperience: game.jobExperience,
    furniturePos,
    gameMinutes: Math.round(game.gameMinutes),
    stats: game.stats,
    missionIndex: game.missionIndex,
  };
  if (game.bodyChosen) data.body = game.bodyString(currentBody());
  data.missionSet = 3;
  data.sleeping = !!game.isSleeping;
  data.inventory = { hasFood: !!game.hasFoodInInventory, foodCooked: !!game.foodIsCooked };
  if (game.drugStock > 0) data.drugStock = game.drugStock;
  if (game.coffeeAt) data.coffeeAt = game.coffeeAt;
  if (Object.keys(game.invest).length) {
    data.invest = {};
    Object.keys(game.invest).forEach((k?: GameValue): GameValue => {
      data.invest![k] = {
        units: Math.round(game.invest[k].units * 1e6) / 1e6,
        cost: Math.round(game.invest[k].cost * 100) / 100,
      };
    });
  }
  if (game.drug.active)
    data.drug = {
      doses: game.drug.doses,
      lastDose: game.drug.lastDose,
      endAt: game.drug.endAt,
      dAtDose: Math.round(game.drug.dAtDose * 10) / 10,
      crisisAt: game.drug.crisisAt || 0,
    };
  if (game.bornAt) data.bornAt = game.bornAt;
  if (game.epitaph) data.epitaph = game.epitaph;
  if (game.isDead) {
    data.dead = true;
    data.deadAt = game.deadAt;
  }
  return data;
}

export function applySave(s?: GameValue): GameValue {
  if (!decodeSaveV8(s)) return;
  if (s.inventory) {
    game.hasFoodInInventory = s.inventory.hasFood === true;
    game.foodIsCooked = s.inventory.foodCooked === true;
  }
  const num: GameValue = (v?: GameValue, d?: GameValue): GameValue =>
    typeof v === 'number' && isFinite(v) ? v : d;
  game.healthLevel = num(s.healthLevel, game.healthLevel);
  game.sleepLevel = num(s.sleepLevel, game.sleepLevel);
  game.hungerLevel = num(s.hungerLevel, game.hungerLevel);
  game.hygieneLevel = num(s.hygieneLevel, game.hygieneLevel);
  game.happinessLevel = num(s.happinessLevel, game.happinessLevel);
  // Vecchi salvataggi: i soldi in tasca verranno spostati in cassaforte
  if (!s.vaultOnly) game.legacyPocketMoney = Math.max(0, num(s.moneyLevel, 0));
  game.gameMinutes = num(s.gameMinutes, game.gameMinutes);
  game.bornAt = num(s.bornAt, 0);
  game.drugStock = Math.max(0, Math.floor(num(s.drugStock, 0)));
  game.coffeeAt = num(s.coffeeAt, 0);
  game.invest = {};
  game.BIZ.forEach((b?: GameValue): GameValue => {
    const v: GameValue = s.invest && s.invest[b.id];
    if (v && num(v.units, 0) > 0)
      game.invest[b.id] = { units: num(v.units, 0), cost: num(v.cost, 0) };
  });
  game.drug =
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
  game.epitaph = typeof s.epitaph === 'string' ? s.epitaph.slice(0, 60) : '';
  const sb: GameValue = parseBody(s.body);
  if (sb) {
    game.myBody = sb;
    game.bodyChosen = true;
  }
  game.stats = Object.assign(game.stats, s.stats || {});
  game.missionIndex = num(s.missionIndex, 0);
  if ((s.missionSet || 1) < 3) game.missionIndex = 0; // missioni eliminate: i progressi vecchi non valgono per le nuove
  game.ownedItems = s.ownedItems || {};
  game.ownedFurniture = s.ownedFurniture || {};
  if (s.equipped) {
    game.equipped = Object.assign({}, game.DEFAULT_LOOK, s.equipped);
  } else {
    // Salvataggi della versione precedente: colore della maglia + accessori
    game.equipped = Object.assign({}, game.DEFAULT_LOOK);
    const oldTop: GameValue = game.shopCatalog.find(
      (i?: GameValue): GameValue =>
        i.slot === 'top' && i.color === s.currentOutfitColor && ownsItem(i.id),
    );
    if (oldTop) game.equipped.top = oldTop.id;
    const acc: GameValue = s.equippedAcc || {};
    if (acc.glasses) game.equipped.glasses = 'item_glasses';
    if (acc.crown) game.equipped.hat = 'item_crown';
    else if (acc.hat) game.equipped.hat = 'item_hat';
  }
  game.SLOTS.forEach((sl?: GameValue): GameValue => {
    if (game.equipped[sl] && !ownsItem(game.equipped[sl]))
      game.equipped[sl] = game.DEFAULT_LOOK[sl];
  });
  game.activeJobKey = s.activeJobKey || null;
  game.jobExperience = Object.assign(game.jobExperience, s.jobExperience || {});
  let fp: GameValue = s.furniturePos || {};
  Object.keys(game.playerRoomFurniture).forEach((k?: GameValue): GameValue => {
    if (fp['base_' + k]) Object.assign(game.playerRoomFurniture[k], fp['base_' + k]);
  });
  game.furnitureCatalog.forEach((f?: GameValue): GameValue => {
    if (fp[f.id]) Object.assign(f.propData, fp[f.id]);
  });
}

export function saveGame(forceCloud: GameValue = false): GameValue {
  if (!game.saveReady || game.isDead) return Promise.resolve(true);
  const data = buildSaveData();
  const content = JSON.stringify({ ...data, savedAt: 0 });
  if (!forceCloud && game.lastSaveContent === content) return game.lastSavePromise;
  try {
    localStorage.setItem(game.SAVE_KEY, JSON.stringify(data));
    game.lastSaveContent = content;
  } catch (error) {
    console.warn('[save] Copia locale non salvata', error);
  }
  const now: GameValue = Date.now();
  if (forceCloud || game.moneyLevel !== game.lastCloudMoney || now - game.lastCloudSaveAt > 15000) {
    game.lastCloudSaveAt = now;
    game.lastCloudMoney = game.moneyLevel;
    const scope = lifetime;
    if (dom('save-status'))
      dom('save-status').textContent = game.OFFLINE
        ? 'Salvataggio locale…'
        : 'Salvataggio sul cloud…';
    game.lastSavePromise = Promise.all([
      game.db.ref('sims_saves/' + game.myPlayerId).set(data),
      game.db.ref('sims_leaderboard/' + game.myPlayerId).set({
        name: game.myData.nick,
        wealth: getWealth(),
        shifts: game.stats.shifts || 0,
        t: now,
        bornAt: game.bornAt || null,
      }),
    ])
      .then(() => {
        if (scope.active && dom('save-status'))
          dom('save-status').textContent = game.OFFLINE
            ? 'Salvato su questo dispositivo'
            : 'Salvato sul cloud';
        return true;
      })
      .catch((error) => {
        if (scope.active) {
          game.lastCloudSaveAt = 0;
          game.lastSaveContent = null;
          if (dom('save-status'))
            dom('save-status').textContent = 'Progressi in attesa di sincronizzazione';
        }
        console.warn('[save] Cloud non confermato', error);
        return false;
      });
  }
  publishRoomLayout();
  return game.lastSavePromise;
}

// Il tempo scorre anche a gioco chiuso (nessun limite di ore): ricalcolo i bisogni per il tempo di assenza.
// Se il gioco era stato chiuso mentre il personaggio dormiva, continua a dormire finché il sonno non arriva a 100%.
export function catchUpOffline(s?: GameValue): GameValue {
  const away: GameValue = (Date.now() - (s.savedAt || 0)) / 1000;
  if (!s.savedAt || !isFinite(away) || away < 60) return;

  const plantFactor: GameValue = game.ownedFurniture.plant_lux
    ? 0.3
    : game.ownedFurniture.plant_std
      ? 0.5
      : 1;
  const bedBoost: GameValue = game.ownedFurniture.bed_lux ? 1.5 : 1;
  let asleep: GameValue = !!s.sleeping,
    left: GameValue = away,
    fainted: GameValue = false,
    vt: GameValue = s.savedAt;
  const STEP: GameValue = 120;
  while (left > 0 && !fainted) {
    const d: GameValue = Math.min(STEP, left);
    left -= d;
    vt += d * 1000;
    if (asleep) {
      game.sleepLevel = Math.min(
        100,
        game.sleepLevel + (d / game.SLEEP_RECOVERY_SEC) * 100 * bedBoost,
      );
      game.hungerLevel = Math.max(
        0,
        game.hungerLevel - (d / game.HUNGER_SLEEP_DEPLETION_SEC) * 100,
      );
      if (game.sleepLevel >= 100) asleep = false;
    } else {
      game.sleepLevel = Math.max(0, game.sleepLevel - (d / game.SLEEP_DEPLETION_SEC) * 100);
      game.hungerLevel = Math.max(
        0,
        game.hungerLevel - (d / game.HUNGER_AWAKE_DEPLETION_SEC) * 100,
      );
    }
    game.hygieneLevel = Math.max(
      0,
      game.hygieneLevel - (d / game.HYGIENE_DEPLETION_SEC) * 100 * (asleep ? 0.5 : 1),
    );
    game.happinessLevel = Math.max(
      0,
      game.happinessLevel - (d / game.HAPPINESS_DEPLETION_SEC) * 100 * plantFactor,
    );
    if (game.hungerLevel <= 0 || game.hygieneLevel <= 0 || game.sleepLevel <= 0) {
      game.healthLevel = Math.max(0, game.healthLevel - (d / game.HEALTH_DAMAGE_SEC) * 100);
      if (game.healthLevel <= 0) fainted = true; // lo svenimento lo gestisce updateNeeds subito dopo
    }
    drugApply(vt, d); // dipendenza: la salute continua a calare anche a gioco chiuso
    if (game.healthLevel <= 0) fainted = true;
  }
  game.gameMinutes += away * game.GAME_MINUTES_PER_SEC;
  const h: GameValue = away / 3600;
  const txt: GameValue =
    h >= 48
      ? Math.floor(h / 24) + ' giorni'
      : h >= 1
        ? Math.round(h * 10) / 10 + ' ore'
        : Math.round(away / 60) + ' minuti';
  if (!fainted)
    lifetime.setTimeout(
      (): GameValue =>
        toast(
          `⏳ Sei stato via ${txt}: il tempo è passato anche per il tuo personaggio` +
            (s.sleeping ? ' (dormiva)' : ''),
          6000,
        ),
      2500,
    );
}

export async function loadGame(..._args: GameValue[]): Promise<GameValue> {
  let local: GameValue = null,
    cloud: GameValue = null;
  try {
    local = decodeSaveV8(JSON.parse(localStorage.getItem(game.SAVE_KEY) || 'null'));
  } catch (e: GameValue) {}
  try {
    const snap: GameValue = await withTimeout(
      game.db.ref('sims_saves/' + game.myPlayerId).once('value'),
      6000,
    );
    cloud = snap ? decodeSaveV8(snap.val()) : null;
  } catch (e: GameValue) {
    console.warn('Salvataggio online non disponibile', e);
  }
  let best: GameValue = local;
  if (cloud && (!best || (cloud.savedAt || 0) > (best.savedAt || 0))) best = cloud;
  const deadSave: GameValue = [local, cloud].find((x?: GameValue): GameValue => x && x.dead);
  if (deadSave) {
    game.isDead = true;
    game.deadAt = deadSave.deadAt || 0;
    applySave(deadSave);
  } else if (best) {
    applySave(best);
    catchUpOffline(best);
  }
  if (!game.bornAt && !game.isDead) game.bornAt = Date.now(); // nascita del personaggio (salvataggi vecchi: da ora)
  // Arrivo da un altro dispositivo con il codice: riprendo anche il nome
  if (localStorage.getItem(game.LS_PREFIX + 'sims_adopt_nick') && cloud && cloud.nick) {
    game.myData.nick = cloud.nick;
    localStorage.setItem(game.LS_PREFIX + 'sims_player_nick', cloud.nick);
  }
  localStorage.removeItem(game.LS_PREFIX + 'sims_adopt_nick');
  game.pinPromptMoneyThreshold = game.moneyLevel;
  game.lastCloudMoney = game.moneyLevel;
  game.saveReady = true;
}

export function getMyRoomMap(..._args: GameValue[]): GameValue {
  let combined: GameValue = Object.assign({}, game.playerRoomFurniture);
  Object.keys(game.ownedFurniture).forEach((itemId?: GameValue): GameValue => {
    let itemDef: GameValue = game.furnitureCatalog.find(
      (f?: GameValue): GameValue => f.id === itemId,
    );
    if (itemDef) combined[itemDef.propKey] = itemDef.propData;
  });
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
    };
  });
  const key: GameValue = JSON.stringify(layout);
  if (key === game.lastLayoutKey) return;
  game.lastLayoutKey = key;
  game.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/layout`).set(layout);
}

export function normalizeRooms(val?: GameValue): GameValue {
  let rooms: GameValue = [];
  for (let i: GameValue = 0; i < game.TOTAL_ROOMS; i++) {
    let r: GameValue = val && val[i] ? val[i] : {};
    rooms.push(Object.assign(game.blankRoom(i), r));
  }
  return rooms;
}

// Assegna la stanza con una transazione: due giocatori non possono prendere la stessa
export async function claimRoom(..._args: GameValue[]): Promise<GameValue> {
  let claimed: GameValue = -1;
  const MONTH: GameValue = 30 * 24 * 3600 * 1000;
  try {
    await withTimeout(
      game.db.ref('sims_rooms_state').transaction((current?: GameValue): GameValue => {
        let rooms: GameValue = normalizeRooms(current);
        let idx: GameValue = rooms.findIndex(
          (r?: GameValue): GameValue => r.ownerId === game.myPlayerId,
        );
        if (idx === -1) idx = rooms.findIndex((r?: GameValue): GameValue => !r.owner && !r.ownerId);
        // Stanze abbandonate da più di 30 giorni (e con cassaforte vuota) tornano libere
        if (idx === -1)
          idx = rooms.findIndex(
            (r?: GameValue): GameValue =>
              r.lastSeen && Date.now() - r.lastSeen > MONTH && !(r.vaultMoney > 0),
          );
        claimed = idx;
        if (idx === -1) return rooms;
        let old: GameValue = rooms[idx];
        let base: GameValue = old.ownerId === game.myPlayerId ? old : { id: old.id, vaultMoney: 0 };
        rooms[idx] = Object.assign({}, base, {
          owner: game.myData.nick,
          ownerId: game.myPlayerId,
          lastSeen: Date.now(),
        });
        return rooms;
      }),
      8000,
    );
  } catch (e: GameValue) {
    console.warn('Assegnazione stanza fallita', e);
  }
  game.myAssignedRoomIdx = claimed;
  if (claimed === -1)
    toast('🏠 Il condominio è pieno (32 stanze): per ora giochi come ospite senza stanza.', 5000);
  else
    toast(`🏠 La tua stanza è la n° ${claimed + 1} (Appartamento ${game.aptOfRoom(claimed) + 1})`);
}

export function syncMyPinFromRoom(..._args: GameValue[]): GameValue {
  if (!hasRoom()) return;
  let room: GameValue = game.roomsState[game.myAssignedRoomIdx];
  if (!room || room.ownerId !== game.myPlayerId || !room.pin) return;
  // Migra i vecchi PIN salvati in chiaro
  if (!String(room.pin).startsWith('h')) {
    game.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/pin`).set(hashPin(room.pin, room.id));
  }
  game.hasSetSafePin = true;
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
  if (game.OFFLINE) return seenRecently;
  const serverFresh: GameValue = now + game.serverOffset - op.t < 30000;
  return serverFresh || (tr.changes >= 2 && seenRecently);
}

export function startPresence(..._args: GameValue[]): GameValue {
  try {
    game.db.ref('.info/serverTimeOffset').on('value', (s?: GameValue): GameValue => {
      game.serverOffset = Number(s.val()) || 0;
    });
  } catch (e: GameValue) {}
  const playerRef: GameValue = game.db.ref('sims_online_players/' + game.myPlayerId);
  // Rimuove il giocatore dal DB quando chiude la pagina (niente fantasmi)
  playerRef.onDisconnect().remove();
  // Invia la posizione solo quando cambia, più un battito ogni 5 s
  let lastSentKey: GameValue = '',
    lastSentAt: GameValue = 0;
  lifetime.setInterval((): GameValue => {
    const payload: GameValue = {
      name: game.myData.nick,
      x: Math.round(game.playerPos.x),
      y: Math.round(game.playerPos.y),
      env: game.activeEnvironment,
      roomIdx: game.activeEnvironment === 'PLAYER_ROOM' ? game.currentRoomIdx : null,
      apt: game.APT_ENVS.includes(game.activeEnvironment) ? game.currentApt : null,
      outfit: resolveLook(game.equipped).top.color,
      look: lookString(),
      body: game.bodyString(currentBody()),
      act: game.showerAnim ? 'shower' : game.isSleeping ? 'sleep' : '',
      say: game.mySay,
      sayT: game.mySayT,
    };
    const key: GameValue = JSON.stringify(payload);
    const now: GameValue = Date.now();
    if (key !== lastSentKey || now - lastSentAt > 5000) {
      payload.t = now + game.serverOffset;
      playerRef.set(payload);
      lastSentKey = key;
      lastSentAt = now;
    }
  }, 100);
  game.db.ref('sims_online_players').on('value', (snapshot?: GameValue): GameValue => {
    game.onlinePlayers = snapshot.val() || {};
  });
  startInbox();
  startChat();
}

export function watchGameVersion(..._args: GameValue[]): GameValue {
  const ref: GameValue = game.db.ref('sims_meta/version');
  ref.transaction(
    (v?: GameValue): GameValue =>
      typeof v === 'number' && v >= game.GAME_VERSION ? undefined : game.GAME_VERSION,
  );
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
