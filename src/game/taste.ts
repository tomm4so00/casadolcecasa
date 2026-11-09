// L'assaggio di benvenuto (regole in taste-rules.ts): il nuovo arrivato cucina un piatto e lo
// porta a un vicino. Se il vicino non è in casa lo lascia nella sua stanza (gifts/<stanza>/<chi>),
// dove il proprietario lo trova, lo mangia e ringrazia. Se nel condominio non abita nessun altro,
// lo porta a un personaggio del gioco.
import { sfx } from './audio.js';
import { game } from './context.js';
import type { GameValue } from './context.js';
import { DISH_HUNGER } from './food-rules.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { roomLabel } from './realty-rules.js';
import { isoProject, isoScale } from './render/primitives.js';
import { lifetime } from './runtime.js';
import { hasRoom, presenceAlive, saveGame } from './saves.js';
import { sendSocial } from './social.js';
import { GIFT_TTL_MS, type TasteTarget, chooseTasteTarget, placeText } from './taste-rules.js';
import { worldNode } from './world-db.js';

/** I piatti lasciati nelle stanze del mondo: stanza → chi l'ha lasciato → piatto. */
type Gift = { name: string; x: number; y: number; t: number };
let gifts: Record<string, Record<string, Gift>> = {};
let target: TasteTarget | null = null;
const warnedComing = new Set<string>();
let toldAboutBot = false;

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Un piatto regalato (a un giocatore, in una stanza o a un personaggio): per la missione. */
export function noteTasteGiven(): void {
  game.player.stats.tastes = (game.player.stats.tastes || 0) + 1;
}

/** Il vicino a cui portare l'assaggio adesso (la missione chiede ogni secondo). */
export function tasteTarget(announce: boolean): TasteTarget {
  const now = Date.now();
  const online = Object.entries(game.onlinePlayers || {})
    .filter(([id, op]) => op && !op.offline && presenceAlive(id, op, now))
    .map(([id, op]) => ({
      id,
      name: op.name || 'Vicino',
      env: op.env,
      apt: op.apt ?? null,
      roomIdx: typeof op.roomIdx === 'number' ? op.roomIdx : null,
    }));
  const rooms = (game.roomsState || [])
    .map((r: GameValue, idx: number) => ({ idx, ownerId: r?.ownerId, owner: r?.owner }))
    .filter((r: GameValue) => typeof r.ownerId === 'string' && r.ownerId);
  target = chooseTasteTarget({
    me: game.session.myPlayerId,
    myApt: hasRoom() ? game.aptOfRoom(game.myAssignedRoomIdx) : 0,
    perApt: game.ROOMS_PER_APT,
    online,
    rooms,
    previous: target,
    seed: game.session.myPlayerId,
  });
  if (announce && target.mode === 'online' && !warnedComing.has(target.id)) {
    warnedComing.add(target.id);
    void sendSocial(target.id, { type: 'tasteComing' });
  }
  if (announce && target.mode === 'bot' && !toldAboutBot) {
    toldAboutBot = true;
    toast(
      `🏚️ Nel condominio non abita ancora nessun altro: porta l'assaggio a ${target.name} ${target.where}!`,
      7000,
    );
  }
  return target;
}

/** Il suggerimento della missione per arrivare dal vicino. */
export function tasteHint(t: TasteTarget): string {
  if (game.player.dishes <= 0)
    return '🍳 Ti serve un piatto: in cucina prendi il cibo dal frigo e cucinalo.';
  if (t.mode === 'online') {
    const owner = t.roomIdx !== null ? game.roomsState?.[t.roomIdx]?.owner || null : null;
    return `🧑 Porta l'assaggio a ${t.name}: è ${placeText(t.env, t.roomIdx, t.name, owner)}. Vicino a lui apri lo zaino 🎒 e tocca «Regala».`;
  }
  if (t.mode === 'room') {
    const inside = game.view.activeEnvironment === 'PLAYER_ROOM' && game.currentRoomIdx === t.idx;
    return inside
      ? `🍝 Sei nella stanza di ${t.name}: apri lo zaino 🎒, tocca «Regala» e lascia l'assaggio qui.`
      : `🚪 ${t.name} non è in casa: entra nella sua stanza (${roomLabel(t.idx, game.ROOMS_PER_APT)}) e lasciaglielo.`;
  }
  return game.view.activeEnvironment === t.env
    ? `🙂 Avvicinati a ${t.name}, apri lo zaino 🎒 e tocca «Regala».`
    : `🙂 Nel condominio non abita nessun altro: porta l'assaggio a ${t.name} ${t.where} (dall'uscita del condominio).`;
}

// ---------------------------------------------------------------- personaggi del gioco

/** I personaggi del gioco vicini, a cui si può dare un piatto. */
export function nearbyBots(): GameValue[] {
  const env = game.view.activeEnvironment;
  return (game.simulationBots || []).filter(
    (b: GameValue) =>
      b.env === env &&
      !String(b.name).startsWith('Bot_') &&
      Math.hypot(b.x - game.playerPos.x, b.y - game.playerPos.y) < (game.SOC_RANGE || 70) + 30,
  );
}

const THANKS = [
  'Grazie, che buono! 😋',
  'Che pensiero gentile! 💛',
  'Mmm, buonissimo! Benvenuto!',
  'Si vede che cucini col cuore! 🍝',
];

/** Il personaggio ringrazia con un fumetto. */
export function thankBot(bot: GameValue): void {
  bot.talk = THANKS[Math.floor(Math.random() * THANKS.length)];
  sfx('success');
  toast(`🍝 Hai regalato un piatto a ${bot.name}!`);
}

// ---------------------------------------------------------------- piatti lasciati nelle stanze

/** Sono nella stanza di un altro (con un proprietario)? Il suo indice, altrimenti null. */
export function othersRoomHere(): number | null {
  if (game.view.activeEnvironment !== 'PLAYER_ROOM') return null;
  const idx = game.currentRoomIdx;
  if (typeof idx !== 'number' || idx === game.myAssignedRoomIdx) return null;
  const room = game.roomsState?.[idx];
  return room?.ownerId ? idx : null;
}

/** Lascia un piatto nella stanza in cui si è: lo troverà il proprietario. */
export async function leaveDishHere(): Promise<boolean> {
  const idx = othersRoomHere();
  if (idx === null || game.player.dishes <= 0) return false;
  const owner = game.roomsState[idx]?.owner || 'il vicino';
  try {
    await game.session.db.ref(`${worldNode('gifts')}/${idx}/${game.session.myPlayerId}`).set({
      name: game.player.myData.nick,
      x: Math.round(game.playerPos.x),
      y: Math.round(game.playerPos.y),
      t: serverNow(),
    });
  } catch {
    toast(`Hai già lasciato un piatto a ${owner}: aspetta che lo mangi!`, 4000);
    return false;
  }
  game.player.dishes--;
  noteTasteGiven();
  saveGame(false);
  sfx('success');
  toast(`🍝 Hai lasciato l'assaggio nella stanza di ${owner}: lo troverà quando torna!`, 5000);
  return true;
}

const giftsOf = (idx: number): [string, Gift][] =>
  Object.entries(gifts[String(idx)] || {}).filter(
    ([, g]) => g && typeof g.t === 'number' && serverNow() - g.t < GIFT_TTL_MS,
  );

/** Piatti per terra nella stanza in cui si è, da disegnare. */
export function giftDrawables(drawables: GameValue[]): void {
  if (game.view.activeEnvironment !== 'PLAYER_ROOM' || typeof game.currentRoomIdx !== 'number')
    return;
  for (const [, g] of giftsOf(game.currentRoomIdx))
    drawables.push({ depth: g.x + g.y - 1, draw: () => drawPlate(g.x, g.y) });
}

/** Un piatto di pasta sotto una campana, con il bigliettino. */
function drawPlate(x: number, y: number): void {
  const ctx = game.view.ctx;
  const p = isoProject(x, y, 0);
  const s = isoScale();
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2 * s, 15 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f6fa';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 14 * s, 6.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.stroke();
  // la pasta
  ctx.fillStyle = '#f9ca24';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 2 * s, 8 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eb4d4b';
  ctx.beginPath();
  ctx.ellipse(p.x + 1 * s, p.y - 3 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // il bigliettino
  ctx.fillStyle = '#ffeaa7';
  ctx.fillRect(p.x + 9 * s, p.y - 9 * s, 9 * s, 6 * s);
  ctx.fillStyle = '#e17055';
  ctx.font = `${6 * s}px sans-serif`;
  ctx.fillText('♥', p.x + 11 * s, p.y - 4.5 * s);
  ctx.restore();
}

/** Stanza in cui ho già chiesto se mangiare i piatti trovati (una volta per ingresso). */
let askedIn: string | null = null;

/** Entrando nella mia stanza: se qualcuno mi ha lasciato un assaggio, lo propone. */
async function checkMyGifts(): Promise<void> {
  const mine = game.myAssignedRoomIdx;
  const inside =
    game.view.activeEnvironment === 'PLAYER_ROOM' && game.currentRoomIdx === mine && hasRoom();
  if (!inside || mine === null) {
    askedIn = null;
    return;
  }
  const list = giftsOf(mine);
  const key = list.map(([id]) => id).join(',');
  if (!list.length || askedIn === key || game.dialogResolve) return;
  askedIn = key;
  const [fromId, g] = list[0];
  sfx('success');
  const res = await openDialog({
    title: '🍝 Un assaggio per te!',
    text:
      `${g.name} ti ha lasciato un assaggio di benvenuto nella stanza.\n\n` +
      `Mangiandolo recuperi il ${DISH_HUNGER}% di fame, e ${g.name} riceve il tuo grazie.`,
    buttons: [
      { label: 'Più tardi', value: null, color: '#57606f' },
      { label: '😋 Mangialo e ringrazia', value: 'eat', color: '#e67e22' },
    ],
  });
  if (res.action !== 'eat') return;
  try {
    await game.session.db.ref(`${worldNode('gifts')}/${mine}/${fromId}`).remove();
  } catch {
    toast('Riprova tra poco.');
    return;
  }
  game.player.hungerLevel = Math.min(100, game.player.hungerLevel + DISH_HUNGER);
  game.player.stats.meals = (game.player.stats.meals || 0) + 1;
  saveGame(false);
  sfx('munch');
  void sendSocial(fromId, { type: 'tasteThanks' });
  toast(`😋 Buonissimo! Hai ringraziato ${g.name}.`, 4000);
  askedIn = null;
}

/** All'avvio: i piatti lasciati nel mondo e il controllo della mia stanza. */
export function startTaste(): void {
  game.session.db.ref(worldNode('gifts')).on('value', (snap?: GameValue): void => {
    const v = snap?.val();
    gifts = v && typeof v === 'object' ? v : {};
  });
  lifetime.setInterval(() => void checkMyGifts(), 1000);
}
