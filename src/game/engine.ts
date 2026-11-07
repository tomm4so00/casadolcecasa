import { updateRocketTrip } from './moon.js';
import { partVisible } from './render/moonbase.js';
import { myBarDrinkOpts } from './render/bar.js';
import {
  myBathPose,
  myUndressStep,
  showerSpots,
  updateBathroom,
  updateShower,
} from './bathroom.js';
import { drawClothesPile, drawFluGerms, drawSmokePuffs, undressedLook } from './render/avatars.js';
import { isSick } from './flu-rules.js';
import { petHoldsOwner, petDrawables, updatePets } from './pets.js';
import { bounceOffPark } from './dog-park-rules.js';
import { updateSpaceHelmet } from './space-helmet.js';
import { collarPoint, drawLeash, drawQuadruped } from './render/pets.js';
import {
  benchWalkDir,
  drawCoinToss,
  drawIceCream,
  drawSofaRelax,
  myBenchPose,
  myChairSeat,
  chairsHere,
  SEATED_ACTS,
  standUp,
  updateBench,
  updateCoinToss,
  updateIceCream,
} from './courtyard-fun.js';
import { nearSickPlayer } from './flu.js';
import { addSample, newMotion, positionAt, type Motion } from './remote-motion.js';
import { realHour } from './game-clock.js';
import type { GameValue } from './context.js';
import { canPlaySession } from './accounts.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import {
  checkProximity,
  getCurrentFurnitureMap,
  keepOwnPillow,
  setFurniturePosition,
} from './world.js';
import {
  drawActor,
  drawFaintedAvatar,
  drawNameTagWorld,
  drawOfflineTag,
  drawPlayerAvatar,
  drawSleepThoughts,
  bedSpot,
} from './render/avatars.js';
import {
  applyLighting,
  drawDynamicFloor,
  drawDynamicWalls,
  drawLabel,
  drawSky,
  drawStaticScene,
  getEnvStyle,
} from './render/scenes.js';
import { box, drawMapItem, drawSafeCorridor, softShadow } from './render/objects.js';
import { mgAddDrawables } from './jobs.js';
import {
  aptLabel,
  botLook,
  legacyLook,
  myLook,
  parseBody,
  parseLook,
  resolveLook,
} from './character.js';
import { presenceAlive } from './saves.js';
import { tickNeeds, updateSocialPanel } from './needs.js';
import { footprintOf, isoProject, isoScale } from './render/primitives.js';
import { overlapsCorridor } from './room-layout.js';
import { approachKissPartner, drawKissHearts, kissActive } from './romance.js';
import { faintAmount } from './faint.js';
import { fadeOnRoomChange, updateCamera } from './camera.js';
import { isStoned } from './weed.js';
import { officeSpeed } from './office.js';
import { applyRoomBounds } from './room-size.js';
import { presenceState } from './presence-rules.js';
import type { OnlinePlayer } from './network-model.js';
import { LAB_WALL_Y } from './data/catalogues.js';
import { clerkLines } from './clerks.js';
import { facadeFootprint, facadeSolids } from './render/facades.js';
import { checkWalkThrough, doorGapsHere, openGapsHere, roomBounds } from './interactions.js';
import { clampToRoom, doorwayAt } from './door-walk-rules.js';
import { chairsOf } from './chair-rules.js';

/** Lo stesso aspetto con gli occhi rossi (dopo una canna). */
const withStonedEyes = (look: GameValue, on: boolean): GameValue =>
  on && look ? { ...look, stoned: true } : look;

/** La stanza in cui si è: cambiandola, chi dorme compare già sdraiato. */
const sleepSceneKey = (): string => game.view.activeEnvironment + ':' + game.currentRoomIdx;
let ownSleepScene = '';

// Chi siede in panchina sta davanti allo schienale: anche sul posto di sinistra, che ha x + y
// più piccolo della panchina, va disegnato sopra di lei.
const BENCH_SEAT_DEPTH = 30;

/**
 * Una panchina è lunga: ordinata dal suo centro, chi le sta davanti verso un'estremità finirebbe
 * sotto di lei (e chi le passa dietro sopra). Col giocatore vicino si guarda da che parte sta:
 * davanti, seduto o a destra la panchina va sotto di lui; dietro o a sinistra sopra.
 */
function benchDepth(p: GameValue): number {
  const px = game.playerPos.x,
    py = game.playerPos.y;
  const x0 = p.x - p.w / 2,
    x1 = p.x + p.w / 2;
  if (Math.abs(px - p.x) > p.w / 2 + 30 || Math.abs(py - p.y) > p.h / 2 + 30) return p.x + p.y;
  const front = px > x1 ? true : px < x0 ? py > p.y + p.h / 2 : py >= p.y;
  return px + py + (front ? -1 : 1);
}

/**
 * Una palazzina è larga: la si ordina dal suo angolo in fondo, così chi le cammina davanti
 * (anche sul lato) è disegnato sopra di lei e non dentro il muro.
 */
function buildingDepth(item: GameValue): number {
  // porte del salone sui muri di fondo e di sinistra: stanno nel muro, dietro chi passa nel vano
  if (game.view.activeEnvironment === 'SALOON' && item.targetEnv)
    return (item.w < item.h ? item.x : item.y) < 0 ? -1e4 : 0;
  if (game.view.activeEnvironment !== 'CORTILE' || item.aptIdx === undefined) return 0;
  // dall'angolo in fondo della palazzina, che sta dietro la porta
  const fp = facadeFootprint(item);
  return fp.x - fp.w / 2 + fp.y - fp.h / 2 - item.x - item.y;
}
/** I pezzi della base lunare si vedono solo dalla loro fase in poi (gli altri oggetti sempre). */
const shownPart = (p: GameValue): boolean =>
  p.stage === undefined || partVisible(p, game.moonBaseStage || 0);

export function getSolidObstacles(..._args: GameValue[]): GameValue {
  const extra: GameValue = (game.ENV_PROPS[game.view.activeEnvironment] || [])
    .concat(game.ENV_DECOR[game.view.activeEnvironment] || [])
    .filter((p?: GameValue): GameValue => p.solid !== false && shownPart(p));
  if (game.ENV_PROPS[game.view.activeEnvironment]) return extra;
  if (game.view.activeEnvironment === 'SALOON') return extra;
  let map = getCurrentFurnitureMap();
  return Object.keys(map)
    .filter(
      (k?: GameValue): GameValue =>
        !k.startsWith('door') && k !== 'exitHouse' && k !== game.movingPropKey && !map[k].wallItem,
    )
    .map((k?: GameValue): GameValue => footprintOf(map[k]))
    .filter(
      (o?: GameValue): GameValue =>
        game.view.activeEnvironment !== 'PLAYER_ROOM' || !overlapsCorridor(o),
    )
    .concat(extra, courtyardBuildings(map));
}

/** Le palazzine del cortile sono solide (le loro porte invece non sono ostacoli). */
function courtyardBuildings(map: GameValue): GameValue[] {
  if (game.view.activeEnvironment !== 'CORTILE') return [];
  return Object.values(map)
    .filter((it: GameValue) => it.aptIdx !== undefined)
    .flatMap(facadeSolids);
}

export function collidesAt(x?: GameValue, y?: GameValue, obstacles?: GameValue): GameValue {
  const r: GameValue = 9;
  return obstacles.some(
    (o?: GameValue): GameValue =>
      x > o.x - o.w / 2 - r &&
      x < o.x + o.w / 2 + r &&
      y > o.y - o.h / 2 - r &&
      y < o.y + o.h / 2 + r,
  );
}

/**
 * Un personaggio in (x, y) si vede sullo schermo? Chi è fuori dall'inquadratura (nel cortile,
 * più grande dello schermo) non si disegna: con tanti giocatori fa risparmiare molto.
 */
function onScreen(x: number, y: number): boolean {
  const p = isoProject(x, y, 0);
  const W = game.view.canvas.width,
    H = game.view.canvas.height;
  // margini larghi: nome, fumetto e cappello stanno sopra i piedi
  return p.x > -160 && p.x < W + 160 && p.y > -40 && p.y < H + 260;
}

export function renderEnvironment(delta?: GameValue, animTime?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (!canPlaySession()) {
    game.moveForward = game.moveRight = 0;
    delta = 0;
  }
  // stanco = più lento; in ufficio anche disidratati
  const speed: GameValue =
    (game.isSprinting ? 220 : 130) * (game.player.sleepLevel < 20 ? 0.6 : 1) * officeSpeed();
  // sulla luna il terreno è convesso
  game.moonCurve = game.view.activeEnvironment === 'luna' ? 1 / 1500 : 0;
  updateRocketTrip();
  let map = getCurrentFurnitureMap();
  // In modalità "Sposta Mobile" WASD/frecce/joystick muovono il mobile invece del personaggio
  if (
    game.isMovingFurnitureMode &&
    game.movingPropKey &&
    !game.isDraggingFurniture &&
    map[game.movingPropKey] &&
    (game.moveRight !== 0 || game.moveForward !== 0)
  ) {
    const obj: GameValue = map[game.movingPropKey];
    setFurniturePosition(
      obj,
      obj.x + game.moveRight * 160 * delta,
      obj.y - game.moveForward * 160 * delta,
    );
  }
  game.isWalking = false;
  // ---- animazioni: sonno e doccia
  keepOwnPillow();
  const sleepTarget: GameValue =
    game.player.isSleeping && game.view.activeEnvironment === 'PLAYER_ROOM' && map.bed ? 1 : 0;
  const scene = sleepSceneKey();
  if (game.view.activeEnvironment !== 'PLAYER_ROOM' || !map.bed) game.sleepK = 0;
  // appena arrivati in una stanza chi dorme è già nel letto: l'animazione si vede solo coricandosi
  else if (scene !== ownSleepScene) game.sleepK = sleepTarget;
  else
    game.sleepK = Math.max(
      0,
      Math.min(
        1,
        game.sleepK + Math.max(-delta / 0.9, Math.min(delta / 0.9, sleepTarget - game.sleepK)),
      ),
    );
  ownSleepScene = scene;
  if (game.showerAnim && game.view.activeEnvironment !== 'BATHROOM') game.showerAnim = null;
  if (game.bathAnim && game.view.activeEnvironment !== 'BATHROOM') game.bathAnim = null;
  if (game.showerAnim) updateShower(animTime);
  if (game.bathAnim) updateBathroom(animTime);
  // seduti in panchina: muoversi fa alzare
  if (game.benchSit && (game.moveRight !== 0 || game.moveForward !== 0)) standUp();
  if (game.benchSit) updateBench(animTime);
  if (game.coinToss) updateCoinToss(animTime);
  if (game.iceCream) updateIceCream(animTime);
  updatePets(animTime);
  updateSpaceHelmet(Math.min(delta, 0.25), animTime);
  if (kissActive()) approachKissPartner(delta);
  if (
    !game.player.isSleeping &&
    game.sleepK < 0.01 &&
    !game.showerAnim &&
    !game.bathAnim &&
    !game.benchSit &&
    !game.rocketTrip &&
    !game.isMovingFurnitureMode &&
    !kissActive() &&
    !petHoldsOwner() &&
    !faintAmount() &&
    (game.moveRight !== 0 || game.moveForward !== 0)
  ) {
    const obstacles: GameValue = getSolidObstacles();
    const stuck: GameValue = collidesAt(game.playerPos.x, game.playerPos.y, obstacles);
    // dentro la stanza; davanti alle porte che si attraversano il bordo si apre fino al loro filo
    const { x: nx, y: ny } = clampToRoom(
      game.playerPos.x + game.moveRight * speed * delta,
      game.playerPos.y - game.moveForward * speed * delta,
      roomBounds(),
      openGapsHere(),
    );
    if (stuck || !collidesAt(nx, game.playerPos.y, obstacles)) game.playerPos.x = nx;
    if (stuck || !collidesAt(game.playerPos.x, ny, obstacles)) game.playerPos.y = ny;
    game.isWalking = true;
  }
  // porte che si attraversano camminando (portone del salone, palazzine, uscita del condominio):
  // se si è cambiato ambiente, i suoi bordi valgono già per questo fotogramma
  checkWalkThrough();
  applyRoomBounds(game.view.activeEnvironment);
  fadeOnRoomChange();
  // laboratorio ingegneristico: il titolo dice se si è dentro o nella zona esterna
  if (game.view.activeEnvironment === 'ingegneria')
    game.view.currentRoomTitle =
      game.playerPos.y < LAB_WALL_Y
        ? 'Zona esterna del laboratorio 🚀'
        : 'Laboratorio Ingegneristico 🔧';
  game.simulationBots.forEach((bot?: GameValue): GameValue => {
    if (bot.env === game.view.activeEnvironment) {
      const nx = bot.x + bot.vx * delta,
        ny = bot.y + bot.vy * delta;
      // nel parco girano intorno all'area cani invece di passare attraverso la staccionata
      const b =
        bot.env === 'passeggiata'
          ? bounceOffPark(bot.x, bot.y, nx, ny, bot.vx, bot.vy)
          : { vx: bot.vx, vy: bot.vy, hit: false };
      bot.vx = b.vx;
      bot.vy = b.vy;
      // un mobile solido (il bancone del bar, un tavolo) non si attraversa: si rimbalza come ai
      // bordi; chi per caso parte già dentro un mobile può uscirne
      const into = (px: number, py: number, o: GameValue): boolean =>
        Math.abs(px - o.x) < o.w / 2 + 6 && Math.abs(py - o.y) < o.h / 2 + 6;
      const wall = b.hit
        ? null
        : getSolidObstacles().find(
            (o?: GameValue): GameValue => into(nx, ny, o) && !into(bot.x, bot.y, o),
          );
      if (wall) {
        // si rimbalza sul lato che si stava per attraversare
        if (Math.abs(bot.x - wall.x) >= wall.w / 2 + 6) bot.vx = -bot.vx;
        else bot.vy = -bot.vy;
      } else if (b.hit) {
        bot.x += bot.vx * delta;
        bot.y += bot.vy * delta;
      } else {
        bot.x = nx;
        bot.y = ny;
      }
      // al bordo si gira verso l'interno (invertire e basta, se si è andati oltre di un
      // fotogramma lento, lo faceva girare avanti e indietro sul posto)
      if (bot.x > 120) bot.vx = -Math.abs(bot.vx);
      else if (bot.x < -120) bot.vx = Math.abs(bot.vx);
      if (bot.y > 120) bot.vy = -Math.abs(bot.vy);
      else if (bot.y < -120) bot.vy = Math.abs(bot.vy);
    }
  });
  const st: GameValue = getEnvStyle();
  // giorno e notte seguono l'ora reale del dispositivo
  const hour: GameValue = realHour(new Date());
  if (st.outdoor) drawSky(hour, animTime);
  drawStaticScene(st, hour);
  drawDynamicFloor(st, animTime);
  if (game.isMovingFurnitureMode && game.view.activeEnvironment === 'PLAYER_ROOM')
    drawSafeCorridor(animTime);
  drawDynamicWalls(st, animTime);
  // Tutto ciò che sta sul pavimento viene ordinato per profondità (chi è davanti copre chi è dietro)
  const lights: GameValue = (st.lights || []).map(
    (l?: GameValue): GameValue => Object.assign({}, l),
  );
  if (game.view.activeEnvironment === 'discoteca')
    lights.forEach((l?: GameValue, i?: GameValue): GameValue => {
      l.color = game.discoRGB((animTime * 70 + i * 120) % 360);
      l.x += Math.sin(animTime * 1.3 + i * 2) * 50;
      l.y += Math.cos(animTime * 1.1 + i) * 30;
    });
  let drawables: GameValue = [];
  let labels: GameValue = [];
  // a letto non si vedono i nomi dei mobili e degli oggetti: solo la stanza e chi dorme
  const hideLabels: boolean = game.player.isSleeping || game.sleepK > 0;
  const addThing: GameValue = (
    x?: GameValue,
    y?: GameValue,
    w?: GameValue,
    h?: GameValue,
    z?: GameValue,
    label?: GameValue,
    draw?: GameValue,
    depthBias: GameValue = 0,
    hideLabel?: () => boolean,
  ): GameValue => {
    drawables.push({ depth: x + y + depthBias, draw });
    if (label && !hideLabels)
      labels.push((): GameValue => {
        if (!hideLabel?.()) drawLabel(label, x, y, w, h, z);
      });
  };
  // il nome del tavolino coprirebbe la faccia di chi ci è seduto: con qualcuno seduto non si mostra
  const someoneSeatedAt = (p: GameValue): boolean =>
    chairsOf(p).some((c) =>
      (game.frameChairSitters as GameValue[]).some(
        (f) => Math.abs(f.seat.x - c.x) < 3 && Math.abs(f.seat.y - c.y) < 3,
      ),
    );
  (game.ENV_PROPS[game.view.activeEnvironment] || [])
    .concat(game.ENV_DECOR[game.view.activeEnvironment] || [])
    .filter(shownPart)
    .forEach((p?: GameValue): GameValue => {
      const fn: GameValue = game.PROP_DRAW[p.kind];
      addThing(
        p.x,
        p.y,
        p.w,
        p.h,
        p.z || 50,
        p.label,
        (): GameValue => {
          if (
            !p.flat &&
            p.stage === undefined && // i pezzi della base lunare hanno la loro ombra
            ![
              'tree',
              'palm',
              'ball',
              'cone',
              'stool',
              'umbrella',
              'streetlamp',
              'labWall',
              'labDoor',
              'dogFence',
              'dogGate',
            ].includes(p.kind)
          )
            softShadow(p.x, p.y, p.w, p.h);
          if (fn) fn(p, animTime, lights);
          else box(p.x, p.y, p.w, p.h, p.z || 40, '#888888');
        },
        p.flat
          ? -1e5
          : p.kind === 'bench'
            ? benchDepth(p) - (p.x + p.y)
            : // oggetti lunghi chiusi fino alla parete (il bancone del bar): conta l'angolo davanti a
              // sinistra, così chi sta davanti o ai lati si disegna nell'ordine giusto
              p.depthCorner === 'frontLeft'
              ? (p.h - p.w) / 2
              : 0,
        () => someoneSeatedAt(p),
      );
    });
  if (game.MG.active && game.view.activeEnvironment === 'lavoro_' + game.MG.job)
    mgAddDrawables(addThing, drawables, animTime);
  if (!game.ENV_PROPS[game.view.activeEnvironment]) {
    Object.keys(map).forEach((k?: GameValue): GameValue => {
      const item: GameValue = map[k];
      // i quadri hanno il titolo sulla targhetta sotto la cornice
      // nel bagno water, lavandino e doccia si riconoscono da soli: senza nome
      let label: GameValue =
        String(k).startsWith('painting') ||
        (game.view.activeEnvironment === 'BATHROOM' && k !== 'doorExit')
          ? ''
          : item.name;
      if (game.view.activeEnvironment === 'SALOON' && item.roomIdx !== undefined) {
        const gi: GameValue = game.gRoomIdx(item);
        const room: GameValue = game.roomsState[gi];
        label =
          room && room.owner
            ? gi === game.myAssignedRoomIdx
              ? '🏠 La tua stanza'
              : `🚪 Stanza di ${room.owner}`
            : '🔒 Stanza Vuota';
      }
      if (game.view.activeEnvironment === 'CORTILE' && item.aptIdx !== undefined)
        label = aptLabel(item.aptIdx);
      const flat: GameValue = k === 'doorExit' || k === 'exitHouse';
      addThing(
        item.x,
        item.y,
        item.w,
        item.h,
        flat ? 12 : item.z || 60,
        label,
        (): GameValue => drawMapItem(k, item, animTime, lights),
        flat ? -1e5 : buildingDepth(item),
      );
    });
  }
  const mySayNow: GameValue = game.mySay && Date.now() - game.mySayT < 6000 ? game.mySay : '';
  game.frameShowerActors = [];
  game.frameChairSitters = [];
  game.frameSinkRunning = game.bathAnim?.pose === 'wash';
  // vestiti piegati davanti alla doccia mentre ci si lava
  const pileAt = showerSpots().pile;
  const addPile = (look: GameValue, step: number): void => {
    if (game.view.activeEnvironment !== 'BATHROOM' || !step) return;
    drawables.push({
      depth: pileAt.x + pileAt.y,
      draw: (): GameValue => drawClothesPile(pileAt.x, pileAt.y, look, step),
    });
  };
  const myStep = myUndressStep();
  const myShownLook = (): GameValue => undressedLook(myLook(), myStep);
  addPile(myLook(), myStep);
  const showerProp: GameValue = map.shower;
  const inCabin: GameValue = (x?: GameValue, y?: GameValue): GameValue =>
    showerProp &&
    Math.abs(x - showerProp.x) < showerProp.w / 2 - 8 &&
    Math.abs(y - showerProp.y) < showerProp.h / 2 - 8;
  if (game.rocketTrip) {
    // a bordo del razzo: il personaggio non si vede
  } else if (game.showerAnim && inCabin(game.playerPos.x, game.playerPos.y)) {
    const px: GameValue = game.playerPos.x,
      py: GameValue = game.playerPos.y;
    game.frameShowerActors.push({ x: px, y: py, look: myShownLook() });
    labels.push((): GameValue => drawNameTagWorld(px, py, 92, game.player.myData.nick));
  } else {
    const ease: GameValue = game.sleepK * game.sleepK * (3 - 2 * game.sleepK);
    const depth: GameValue =
      game.playerPos.x +
      game.playerPos.y +
      ((map.bed ? map.bed.x + map.bed.y + 0.5 : game.playerPos.x + game.playerPos.y) -
        (game.playerPos.x + game.playerPos.y)) *
        ease +
      // nel vano di una porta del lato vicino si passa davanti al suo stipite
      (doorwayAt(game.playerPos.x, game.playerPos.y, roomBounds(), doorGapsHere())?.dir === 1
        ? 1e4
        : 0) +
      // solo da seduti: andando a sedersi da dietro si passa ancora dietro la panchina
      ((game.benchSit?.kind === 'bench' && game.benchSit.pose === 'bench') ||
      (game.benchSit?.kind === 'stool' && game.benchSit.pose === 'stool')
        ? BENCH_SEAT_DEPTH
        : 0);
    const faintK = faintAmount();
    // sulla sedia (anche sedendosi o alzandosi) lo disegna la sedia, tra seduta e schienale
    const chairSeat = faintK > 0 ? null : myChairSeat();
    (chairSeat ? game.frameChairSitters : drawables).push({
      depth,
      seat: chairSeat,
      draw: (): GameValue =>
        faintK > 0
          ? drawFaintedAvatar(
              game.playerPos.x,
              game.playerPos.y,
              game.player.myData.nick,
              animTime,
              myLook(),
              faintK,
            )
          : drawActor(
              game.playerPos.x,
              game.playerPos.y,
              game.player.myData.nick,
              animTime,
              withStonedEyes(myShownLook(), isStoned()),
              game.isWalking,
              mySayNow,
              game.sleepK,
              map.bed,
              game.bedSlot,
              benchWalkDir() || { x: game.moveRight, y: -game.moveForward },
              myBathPose() || myBenchPose(),
              myBarDrinkOpts(),
            ),
    });
    if (game.coinToss) labels.push((): GameValue => drawCoinToss(animTime));
    if (game.benchSit?.kind === 'sofa') {
      const px = game.playerPos.x,
        py = game.playerPos.y;
      labels.push((): GameValue => drawSofaRelax(px, py, animTime));
    }
    if (game.iceCream && faintK <= 0) {
      const px = game.playerPos.x,
        py = game.playerPos.y;
      labels.push((): GameValue => drawIceCream(px, py, animTime));
    }
    if (performance.now() < game.smokeUntil) {
      const px = game.playerPos.x,
        py = game.playerPos.y;
      labels.push((): GameValue => drawSmokePuffs(px, py, animTime));
    }
    if (isSick(game.player.flu, Date.now()) && faintK <= 0 && !game.player.isSleeping) {
      const px = game.playerPos.x,
        py = game.playerPos.y;
      labels.push((): GameValue => drawFluGerms(px, py, animTime));
    }
    if (kissActive()) {
      const since: number = game.kissAnim.start;
      labels.push((): GameValue => drawKissHearts(game.playerPos.x, game.playerPos.y, since));
    }
  }
  // cane e gatto nella stanza, e il cane al guinzaglio
  petDrawables(animTime, drawables, labels);
  game.simulationBots.forEach((bot?: GameValue): GameValue => {
    if (bot.env === game.view.activeEnvironment) {
      // frase chiesta da chi gli parla (i commessi al bancone)
      if (bot.talk) {
        bot.say = bot.talk;
        bot.talk = '';
        bot.sayUntil = animTime + 4;
        bot.nextSayAt = animTime + 12 + Math.random() * 10;
      }
      if (!bot.nextSayAt || animTime > bot.nextSayAt) {
        const L: GameValue = bot.clerk
          ? clerkLines(bot.env)
          : bot.dealer
            ? game.DEALER_LINES
            : bot.env === 'discoteca'
              ? game.DISCO_LINES
              : game.BOT_LINES;
        bot.say = L[Math.floor(Math.random() * L.length)];
        bot.sayUntil = animTime + 4;
        bot.nextSayAt = animTime + 10 + Math.random() * 15;
      }
      const say: GameValue = animTime < bot.sayUntil ? bot.say : '';
      if (!onScreen(bot.x, bot.y)) return;
      drawables.push({
        depth: bot.x + bot.y,
        draw: (): GameValue => {
          const ctx = game.view.ctx;
          ctx.save();
          if (bot.lift) ctx.translate(0, -bot.lift * isoScale());
          drawPlayerAvatar(
            bot.x,
            bot.y,
            bot.name,
            animTime,
            // Rocco del grow shop: sempre con gli occhi rossi, senza occhiali da sole
            bot.stoned
              ? { ...withStonedEyes(botLook(bot.name), true), glasses: null }
              : botLook(bot.name),
            !!(bot.vx || bot.vy),
            say,
            {
              walkDir: { x: bot.vx, y: bot.vy },
              speed: Math.hypot(bot.vx, bot.vy),
            },
          );
          ctx.restore();
        },
      });
    }
  });
  const now: GameValue = Date.now();
  game.frameNear = [];
  Object.keys(game.onlinePlayers).forEach((id: string): void => {
    if (id === game.session.myPlayerId) return;
    const op: OnlinePlayer | undefined = game.onlinePlayers[id];
    if (!op || op.env !== game.view.activeEnvironment) return;
    // Chi ha lasciato il gioco resta visibile (offline); se non dormiva, sviene a sonno finito
    const alive: boolean = presenceAlive(id, op, now);
    const state = presenceState(
      op,
      alive,
      now + (game.session.serverOffset || 0),
      game.SLEEP_DEPLETION_SEC,
    );
    // chi è uscito dal gioco resta dov'era, con la scritta "offline" (sparisce solo da morto)
    const isOffline: boolean = !!op.offline || !alive;
    // Ogni stanza privata è separata: vedi solo chi è nella tua stessa stanza
    if (game.view.activeEnvironment === 'PLAYER_ROOM' && op.roomIdx !== game.currentRoomIdx) return;
    // Salone, cucina e bagno esistono in ogni appartamento: vedi solo chi è nel tuo
    if (game.APT_ENVS.includes(game.view.activeEnvironment) && (op.apt || 0) !== game.currentApt)
      return;
    let s: GameValue =
      game.remoteSmooth[id] ||
      (game.remoteSmooth[id] = { x: op.x, y: op.y, sayT: op.sayT, sayShownAt: 0 });
    // Il fumetto parte quando riceviamo un messaggio nuovo (evita problemi di orologi diversi)
    if (op.sayT && op.sayT !== s.sayT) {
      s.sayT = op.sayT;
      s.sayShownAt = now;
    }
    const say: GameValue = !isOffline && op.say && now - s.sayShownAt < 6000 ? op.say : '';
    // posizione fluida: a metà strada fra le ultime posizioni ricevute (vedi remote-motion)
    const motion: Motion = s.motion || (s.motion = newMotion());
    const tNow = performance.now();
    addSample(motion, Number(op.t), op.x, op.y, tNow);
    const at = positionAt(motion, tNow) || { x: op.x, y: op.y };
    let dx: GameValue = at.x - s.x,
      dy: GameValue = at.y - s.y;
    s.x = at.x;
    s.y = at.y;
    // cammina se va più veloce di un passo lento; fermo, resta girato com'era
    const stepping = delta > 0 && Math.hypot(dx, dy) / delta > 15;
    if (stepping) s.dir = { x: dx, y: dy };
    {
      const dd: GameValue = Math.hypot(game.playerPos.x - s.x, game.playerPos.y - s.y);
      // con chi è offline o svenuto non si può interagire
      if (dd < game.SOC_RANGE && !isOffline && state !== 'fainted')
        game.frameNear.push({ id, name: op.name || 'Giocatore', d: dd });
      // l'influenza si attacca a chi si avvicina troppo
      if (op.sick && dd < game.SOC_RANGE) nearSickPlayer(op.name || 'Qualcuno');
    }
    let moving: GameValue = !isOffline && stepping;
    const shownName: string = isOffline ? '' : op.name;
    if (isOffline) {
      const lz = state === 'fainted' ? 34 : state === 'sleeping' ? 70 : 92;
      labels.push((): GameValue => drawOfflineTag(s.x, s.y, lz, op.name));
    }
    const lk: GameValue = (op.look || `${op.outfit}${op.acc}`) + '|' + (op.body || '');
    if (s.lookKey !== lk) {
      s.lookKey = lk;
      s.look = op.look ? resolveLook(parseLook(op.look)) : legacyLook(op);
      const pb: GameValue = parseBody(op.body);
      if (pb) s.look.body = pb;
    }
    const act: GameValue = op.act || '';
    if (act === 'kiss') {
      if (!s.kissSince) s.kissSince = performance.now();
      const since: number = s.kissSince;
      labels.push((): GameValue => drawKissHearts(s.x, s.y, since));
    } else s.kissSince = 0;
    const sTarget: GameValue = act === 'sleep' && map.bed ? 1 : 0;
    // chi dorme già quando lo si vede per la prima volta in questa stanza è già sdraiato
    const scene = sleepSceneKey();
    if (s.sleepScene !== scene) {
      s.sleepScene = scene;
      s.sleepK = sTarget;
    }
    s.sleepK = Math.max(
      0,
      Math.min(
        1,
        (s.sleepK || 0) + Math.max(-delta / 0.9, Math.min(delta / 0.9, sTarget - (s.sleepK || 0))),
      ),
    );
    if (act === 'rocket') return; // a bordo del razzo
    // cane al guinzaglio di un altro giocatore: lo segue a distanza
    if (op.dog && !isOffline) {
      const dg = s.dog || (s.dog = { x: s.x - 22, y: s.y + 10, dx: 1, dy: 0, moving: false });
      // libero nell'area cani (dog: 2): va dove dice il suo padrone, senza guinzaglio
      const free = op.dog === 2 && typeof op.dogX === 'number' && typeof op.dogY === 'number';
      const ddx = (free ? op.dogX : s.x) - dg.x,
        ddy = (free ? op.dogY : s.y) - dg.y;
      const dd = Math.hypot(ddx, ddy);
      dg.moving = free ? dd > 2 : dd > 29;
      if (free) {
        if (dd > 150) {
          dg.x += ddx;
          dg.y += ddy;
        } else if (dg.moving) {
          const kk = Math.min(1, delta * 10);
          dg.x += ddx * kk;
          dg.y += ddy * kk;
          dg.dx = ddx;
          dg.dy = ddy;
        }
      } else if (dd > 80) {
        dg.x = s.x - 22;
        dg.y = s.y + 10;
      } else if (dd > 28) {
        const kk = Math.min(1, delta * 8);
        dg.x += (ddx / dd) * (dd - 28) * kk;
        dg.y += (ddy / dd) * (dd - 28) * kk;
        dg.dx = ddx;
        dg.dy = ddy;
      }
      drawables.push({
        depth: dg.x + dg.y,
        draw: (): GameValue =>
          drawQuadruped('dog', dg.x, dg.y, animTime, { moving: dg.moving, dx: dg.dx, dy: dg.dy }),
      });
      const ox = s.x,
        oy = s.y;
      if (!free)
        labels.push((): GameValue => drawLeash(ox, oy, collarPoint(dg.x, dg.y, dg.dx, dg.dy)));
    } else if (s.dog) s.dog = null;
    if (act === 'smoke') {
      const sx = s.x,
        sy = s.y;
      labels.push((): GameValue => drawSmokePuffs(sx, sy, animTime));
    }
    if (op.sick && state !== 'fainted' && sTarget === 0) {
      const sx = s.x,
        sy = s.y;
      labels.push((): GameValue => drawFluGerms(sx, sy, animTime));
    }
    const und: number = act === 'shower' ? Number(op.und) || 0 : 0;
    const shownLook: GameValue = withStonedEyes(
      und ? undressedLook(s.look, und) : s.look,
      op.stoned === true,
    );
    addPile(s.look, und);
    if (act === 'wash') game.frameSinkRunning = true;
    const pose: string = act === 'sit' || act === 'wash' || SEATED_ACTS.includes(act) ? act : '';
    // seduto su una sedia: si disegna con la sedia più vicina (vedi drawChair)
    const othersChair: GameValue =
      state !== 'fainted' && (act === 'chair' || act === 'chairSide')
        ? chairsHere()
            .map((c) => c.chair)
            .find((c) => Math.hypot(c.x - s.x, c.y - s.y) < 25) || null
        : null;
    if (act === 'shower' && inCabin(s.x, s.y)) {
      const rx: GameValue = s.x,
        ry: GameValue = s.y;
      game.frameShowerActors.push({ x: rx, y: ry, look: shownLook });
      labels.push((): GameValue => drawNameTagWorld(rx, ry, 92, op.name));
      return;
    }
    const sk: GameValue = s.sleepK;
    const rd: GameValue =
      s.x +
      s.y +
      ((map.bed ? map.bed.x + map.bed.y + 0.5 : s.x + s.y) - (s.x + s.y)) *
        (sk * sk * (3 - 2 * sk)) +
      (act === 'bench' || act === 'stool' ? BENCH_SEAT_DEPTH : 0);
    // fuori dall'inquadratura non si disegna (chi dorme è sul letto, sempre in vista)
    if (sk <= 0 && !onScreen(s.x, s.y)) return;
    (othersChair ? game.frameChairSitters : drawables).push({
      depth: rd,
      seat: othersChair,
      draw: (): GameValue =>
        state === 'fainted'
          ? drawFaintedAvatar(s.x, s.y, shownName, animTime, s.look, 1)
          : drawActor(
              s.x,
              s.y,
              shownName,
              animTime,
              shownLook,
              moving,
              say,
              sk,
              map.bed,
              typeof op.bed === 'number' ? op.bed : null,
              s.dir || null,
              pose,
            ),
    });
  });
  updateSocialPanel();
  game.showerFog +=
    ((game.frameShowerActors.length ? 1 : 0) - game.showerFog) * Math.min(1, delta * 1.5);
  drawables
    .sort((a?: GameValue, b?: GameValue): GameValue => a.depth - b.depth)
    .forEach((d?: GameValue): GameValue => d.draw());
  // chi è seduto su una sedia che in questo fotogramma non si è disegnata resta comunque visibile
  for (const c of game.frameChairSitters as GameValue[]) if (!c.done) c.draw();
  // Giorno e notte: le luci (lampade, lampioni, lampadari) illuminano il buio
  let dark: GameValue = 0;
  if (hour >= 20 || hour < 6) dark = 0.55;
  else if (hour >= 18) dark = ((hour - 18) / 2) * 0.55;
  else if (hour < 8) dark = ((8 - hour) / 2) * 0.55;
  if (!game.OUTDOOR_ENVS.includes(game.view.activeEnvironment)) dark *= 0.8;
  if (game.view.activeEnvironment === 'discoteca') dark = 0.6;
  if (game.view.activeEnvironment === 'luna') dark = 0.12; // nello spazio c'è sempre il sole
  if (game.view.activeEnvironment === 'base_lunare') dark = 0.2; // dentro la base: luci accese
  applyLighting(dark, lights, st);
  labels.forEach((l?: GameValue): GameValue => l());
  drawSleepThoughts();
  // Titolo stanza (più in basso se in alto scorre il ticker della borsa)
  const ty: number = document.body.classList.contains('ticker-on') ? 26 : 0;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(game.view.canvas.width / 2 - 120, 16 + ty, 240, 30, 15)
    : ctx.rect(game.view.canvas.width / 2 - 120, 16 + ty, 240, 30);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 6;
  ctx.fillText(game.view.currentRoomTitle, game.view.canvas.width / 2, 36 + ty);
  ctx.shadowBlur = 0;
  checkProximity();
}

export function startLoop(..._args: GameValue[]): GameValue {
  function animate(now?: GameValue): GameValue {
    lifetime.requestAnimationFrame(animate);
    let delta: GameValue = (now - game.lastTime) / 1000;
    game.lastTime = now;
    if (isNaN(delta) || delta > 0.1) delta = 0.016;
    game.animClock += delta;
    tickNeeds();
    game.view.ctx.clearRect(0, 0, game.view.canvas.width, game.view.canvas.height);
    applyRoomBounds(game.view.activeEnvironment);
    const bed: GameValue =
      game.sleepK > 0 && game.view.activeEnvironment === 'PLAYER_ROOM'
        ? getCurrentFurnitureMap().bed
        : null;
    const spot = bed ? bedSpot(bed, game.bedSlot) : null;
    updateCamera(delta, spot ? { ...spot, k: game.sleepK } : null);
    renderEnvironment(delta, game.animClock);
  }
  lifetime.requestAnimationFrame(animate);
}
