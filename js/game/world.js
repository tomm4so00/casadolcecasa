import { WALK_SPEED, SPRINT_SPEED, PLAYER_BOUNDS, INTERACT_DISTANCE } from '../config.js';
import { ENVIRONMENTS } from '../data/environments.js';
import { activityEnvId } from '../data/activities.js';
import { state, currentObjects, changeNeed } from '../state.js';

// Sposta il giocatore in un altro ambiente.
// opzioni: title (sovrascrive il titolo dell'ambiente), spawn {x,y}, roomIdx
export function goTo(envId, { title, spawn, roomIdx = null } = {}) {
  const env = ENVIRONMENTS[envId];
  state.envId = envId;
  state.title = title ?? env.title;
  state.pos = { ...(spawn ?? env.spawn) };
  state.roomIdx = roomIdx;
  state.outsideMenuOpen = false;
}

export function startActivity(activity) {
  for (const [need, amount] of Object.entries(activity.effects)) changeNeed(need, amount);
  goTo(activityEnvId(activity));
}

export function returnHome() {
  goTo('SALOON', { spawn: { x: 0, y: 150 } });
}

export function toggleSprint() {
  state.sprinting = !state.sprinting;
}

// Applica l'input: muove il mobile selezionato oppure il giocatore
export function updateMovement(delta) {
  const speed = state.sprinting ? SPRINT_SPEED : WALK_SPEED;
  const dx = state.input.right * speed * delta;
  const dy = -state.input.forward * speed * delta;

  const moving = state.movingObjectKey && currentObjects()[state.movingObjectKey];
  if (moving) {
    moving.x += dx;
    moving.y += dy;
    return;
  }

  if (state.isSleeping) return;

  state.pos.x = Math.max(PLAYER_BOUNDS.minX, Math.min(PLAYER_BOUNDS.maxX, state.pos.x + dx));
  state.pos.y = Math.max(PLAYER_BOUNDS.minY, Math.min(PLAYER_BOUNDS.maxY, state.pos.y + dy));
}

// Oggetto più vicino entro INTERACT_DISTANCE, oppure null
export function findNearbyObject() {
  let best = null;
  let bestDist = INTERACT_DISTANCE;
  for (const [key, obj] of Object.entries(currentObjects())) {
    const d = Math.hypot(state.pos.x - obj.x, state.pos.y - obj.y);
    if (d < bestDist) {
      best = { key, obj };
      bestDist = d;
    }
  }
  return best;
}
