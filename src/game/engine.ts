import { realHour } from './game-clock.js';
import type { GameValue } from './context.js';
import { canPlaySession } from './accounts.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { checkProximity, getCurrentFurnitureMap, setFurniturePosition } from './world.js';
import {
  drawActor,
  drawFaintedAvatar,
  drawNameTagWorld,
  drawOfflineTag,
  drawPlayerAvatar,
  drawSleepThoughts,
  updateShower,
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
import { footprintOf } from './render/primitives.js';
import { overlapsCorridor } from './room-layout.js';
import { approachKissPartner, drawKissHearts, kissActive } from './romance.js';
import { faintAmount } from './faint.js';
import { updateCamera } from './camera.js';
import { applyRoomBounds } from './room-size.js';
import { presenceState } from './presence-rules.js';
import type { OnlinePlayer } from './network-model.js';
export function getSolidObstacles(..._args: GameValue[]): GameValue {
  const extra: GameValue = (game.ENV_PROPS[game.view.activeEnvironment] || [])
    .concat(game.ENV_DECOR[game.view.activeEnvironment] || [])
    .filter((p?: GameValue): GameValue => p.solid !== false);
  if (game.ENV_PROPS[game.view.activeEnvironment]) return extra;
  if (game.view.activeEnvironment === 'SALOON') return extra;
  let map = getCurrentFurnitureMap();
  return Object.keys(map)
    .filter(
      (k?: GameValue): GameValue =>
        !k.startsWith('door') && k !== game.movingPropKey && !map[k].wallItem,
    )
    .map((k?: GameValue): GameValue => footprintOf(map[k]))
    .filter(
      (o?: GameValue): GameValue =>
        game.view.activeEnvironment !== 'PLAYER_ROOM' || !overlapsCorridor(o),
    )
    .concat(extra);
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

export function renderEnvironment(delta?: GameValue, animTime?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (!canPlaySession()) {
    game.moveForward = game.moveRight = 0;
    delta = 0;
  }
  const speed: GameValue = (game.isSprinting ? 220 : 130) * (game.player.sleepLevel < 20 ? 0.6 : 1); // stanco = più lento
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
  const sleepTarget: GameValue =
    game.player.isSleeping && game.view.activeEnvironment === 'PLAYER_ROOM' && map.bed ? 1 : 0;
  if (game.view.activeEnvironment !== 'PLAYER_ROOM' || !map.bed) game.sleepK = 0;
  else
    game.sleepK = Math.max(
      0,
      Math.min(
        1,
        game.sleepK + Math.max(-delta / 0.9, Math.min(delta / 0.9, sleepTarget - game.sleepK)),
      ),
    );
  if (game.showerAnim && game.view.activeEnvironment !== 'BATHROOM') game.showerAnim = null;
  if (game.showerAnim) updateShower(animTime);
  if (kissActive()) approachKissPartner(delta);
  if (
    !game.player.isSleeping &&
    game.sleepK < 0.01 &&
    !game.showerAnim &&
    !game.isMovingFurnitureMode &&
    !kissActive() &&
    !faintAmount() &&
    (game.moveRight !== 0 || game.moveForward !== 0)
  ) {
    const obstacles: GameValue = getSolidObstacles();
    const stuck: GameValue = collidesAt(game.playerPos.x, game.playerPos.y, obstacles);
    let nx: GameValue = Math.max(
      game.X0 + 30,
      Math.min(game.X1 - 30, game.playerPos.x + game.moveRight * speed * delta),
    );
    let ny: GameValue = Math.max(
      game.Y0 + 30,
      Math.min(game.Y1 - 30, game.playerPos.y - game.moveForward * speed * delta),
    );
    if (stuck || !collidesAt(nx, game.playerPos.y, obstacles)) game.playerPos.x = nx;
    if (stuck || !collidesAt(game.playerPos.x, ny, obstacles)) game.playerPos.y = ny;
    game.isWalking = true;
  }
  game.simulationBots.forEach((bot?: GameValue): GameValue => {
    if (bot.env === game.view.activeEnvironment) {
      bot.x += bot.vx * delta;
      bot.y += bot.vy * delta;
      if (bot.x > 120 || bot.x < -120) bot.vx *= -1;
      if (bot.y > 120 || bot.y < -120) bot.vy *= -1;
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
  ): GameValue => {
    drawables.push({ depth: x + y + depthBias, draw });
    if (label && !hideLabels) labels.push((): GameValue => drawLabel(label, x, y, w, h, z));
  };
  (game.ENV_PROPS[game.view.activeEnvironment] || [])
    .concat(game.ENV_DECOR[game.view.activeEnvironment] || [])
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
            !['tree', 'palm', 'ball', 'cone', 'stool', 'umbrella', 'streetlamp'].includes(p.kind)
          )
            softShadow(p.x, p.y, p.w, p.h);
          if (fn) fn(p, animTime, lights);
          else box(p.x, p.y, p.w, p.h, p.z || 40, '#888888');
        },
        p.flat ? -1e5 : 0,
      );
    });
  if (game.MG.active && game.view.activeEnvironment === 'lavoro_' + game.MG.job)
    mgAddDrawables(addThing, drawables, animTime);
  if (!game.ENV_PROPS[game.view.activeEnvironment]) {
    Object.keys(map).forEach((k?: GameValue): GameValue => {
      const item: GameValue = map[k];
      let label: GameValue = item.name;
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
        flat ? -1e5 : 0,
      );
    });
  }
  const mySayNow: GameValue = game.mySay && Date.now() - game.mySayT < 6000 ? game.mySay : '';
  game.frameShowerActors = [];
  const showerProp: GameValue = map.shower;
  const inCabin: GameValue = (x?: GameValue, y?: GameValue): GameValue =>
    showerProp &&
    Math.abs(x - showerProp.x) < showerProp.w / 2 - 8 &&
    Math.abs(y - showerProp.y) < showerProp.h / 2 - 8;
  if (game.showerAnim && inCabin(game.playerPos.x, game.playerPos.y)) {
    const px: GameValue = game.playerPos.x,
      py: GameValue = game.playerPos.y;
    game.frameShowerActors.push({ x: px, y: py, look: myLook() });
    labels.push((): GameValue => drawNameTagWorld(px, py, 92, game.player.myData.nick));
  } else {
    const ease: GameValue = game.sleepK * game.sleepK * (3 - 2 * game.sleepK);
    const depth: GameValue =
      game.playerPos.x +
      game.playerPos.y +
      ((map.bed ? map.bed.x + map.bed.y + 0.5 : game.playerPos.x + game.playerPos.y) -
        (game.playerPos.x + game.playerPos.y)) *
        ease;
    const faintK = faintAmount();
    drawables.push({
      depth,
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
              myLook(),
              game.isWalking,
              mySayNow,
              game.sleepK,
              map.bed,
              game.bedSlot,
              { x: game.moveRight, y: -game.moveForward },
            ),
    });
    if (kissActive()) {
      const since: number = game.kissAnim.start;
      labels.push((): GameValue => drawKissHearts(game.playerPos.x, game.playerPos.y, since));
    }
  }
  game.simulationBots.forEach((bot?: GameValue): GameValue => {
    if (bot.env === game.view.activeEnvironment) {
      if (!bot.nextSayAt || animTime > bot.nextSayAt) {
        const L: GameValue = bot.dealer
          ? game.DEALER_LINES
          : bot.env === 'discoteca'
            ? game.DISCO_LINES
            : game.BOT_LINES;
        bot.say = L[Math.floor(Math.random() * L.length)];
        bot.sayUntil = animTime + 4;
        bot.nextSayAt = animTime + 10 + Math.random() * 15;
      }
      const say: GameValue = animTime < bot.sayUntil ? bot.say : '';
      drawables.push({
        depth: bot.x + bot.y,
        draw: (): GameValue =>
          drawPlayerAvatar(bot.x, bot.y, bot.name, animTime, botLook(bot.name), true, say, {
            walkDir: { x: bot.vx, y: bot.vy },
          }),
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
    if (state === 'gone') return;
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
    let k: GameValue = Math.min(1, delta * 10);
    let dx: GameValue = op.x - s.x,
      dy: GameValue = op.y - s.y;
    s.x += dx * k;
    s.y += dy * k;
    {
      const dd: GameValue = Math.hypot(game.playerPos.x - s.x, game.playerPos.y - s.y);
      // con chi è offline o svenuto non si può interagire
      if (dd < game.SOC_RANGE && !isOffline && state !== 'fainted')
        game.frameNear.push({ id, name: op.name || 'Giocatore', d: dd });
    }
    let moving: GameValue = !isOffline && Math.hypot(dx, dy) > 1;
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
    s.sleepK = Math.max(
      0,
      Math.min(
        1,
        (s.sleepK || 0) + Math.max(-delta / 0.9, Math.min(delta / 0.9, sTarget - (s.sleepK || 0))),
      ),
    );
    if (act === 'shower' && inCabin(s.x, s.y)) {
      const rx: GameValue = s.x,
        ry: GameValue = s.y;
      game.frameShowerActors.push({ x: rx, y: ry, look: s.look });
      labels.push((): GameValue => drawNameTagWorld(rx, ry, 92, op.name));
      return;
    }
    const sk: GameValue = s.sleepK;
    const rd: GameValue =
      s.x +
      s.y +
      ((map.bed ? map.bed.x + map.bed.y + 0.5 : s.x + s.y) - (s.x + s.y)) *
        (sk * sk * (3 - 2 * sk));
    drawables.push({
      depth: rd,
      draw: (): GameValue =>
        state === 'fainted'
          ? drawFaintedAvatar(s.x, s.y, shownName, animTime, s.look, 1)
          : drawActor(
              s.x,
              s.y,
              shownName,
              animTime,
              s.look,
              moving,
              say,
              sk,
              map.bed,
              typeof op.bed === 'number' ? op.bed : null,
              { x: dx, y: dy },
            ),
    });
  });
  updateSocialPanel();
  game.showerFog +=
    ((game.frameShowerActors.length ? 1 : 0) - game.showerFog) * Math.min(1, delta * 1.5);
  drawables
    .sort((a?: GameValue, b?: GameValue): GameValue => a.depth - b.depth)
    .forEach((d?: GameValue): GameValue => d.draw());
  // Giorno e notte: le luci (lampade, lampioni, lampadari) illuminano il buio
  let dark: GameValue = 0;
  if (hour >= 20 || hour < 6) dark = 0.55;
  else if (hour >= 18) dark = ((hour - 18) / 2) * 0.55;
  else if (hour < 8) dark = ((8 - hour) / 2) * 0.55;
  if (!game.OUTDOOR_ENVS.includes(game.view.activeEnvironment)) dark *= 0.8;
  if (game.view.activeEnvironment === 'discoteca') dark = 0.6;
  applyLighting(dark, lights, st);
  labels.forEach((l?: GameValue): GameValue => l());
  drawSleepThoughts();
  // Titolo stanza
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(game.view.canvas.width / 2 - 120, 16, 240, 30, 15)
    : ctx.rect(game.view.canvas.width / 2 - 120, 16, 240, 30);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 6;
  ctx.fillText(game.view.currentRoomTitle, game.view.canvas.width / 2, 36);
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
