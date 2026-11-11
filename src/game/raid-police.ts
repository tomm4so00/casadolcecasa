import { game } from './context.js';
import { activeRaid, policeSuspicious } from './dealer-rules.js';
import { LEGACY_WORLD } from '../../shared/worlds.js';
import { openDialog } from './interface.js';
import { inventoryChange } from './inventory-market.js';
import { saveGame } from './saves.js';
import { toast } from './missions.js';
import { lifetime } from './runtime.js';
import { npcPath, clearSegment, type Point, type Obstacle } from './npc-path.js';

interface PoliceBot extends Point {
  env: string;
  dealer?: boolean;
  vx: number;
  vy: number;
  streetHome?: Point;
  policeSmoking?: boolean;
  policeSeizedWeed?: boolean;
  policeWait?: number;
  policeCooldown?: number;
  policeRearmed?: boolean;
  policeRaid?: string;
  policeRoute?: { points: Point[]; target: Point; refresh: number } | null;
  talk?: string;
  say?: string;
  nextSayAt?: number;
}

export const POLICE_FINE = 100;
export const POLICE_EASTER_EGG_MS = 15 * 60_000;
let pursuit: { bot: PoliceBot; start: number } | null = null;
let busy = false;
let scope = lifetime;

function resetScope(): void {
  if (scope === lifetime) return;
  scope = lifetime;
  pursuit = null;
  busy = false;
}
export function policeHoldingPlayer(): boolean {
  return busy;
}
export function policeSmoking(bot: Pick<PoliceBot, 'policeSmoking'>): boolean {
  return !!bot.policeSmoking;
}

function suspicious(): boolean {
  const inventory = game.roomsState[game.myAssignedRoomIdx ?? -1]?.inventory;
  const offer = inventory?.offer;
  return policeSuspicious(
    (game.player.weed?.grams ?? 0) +
      (offer?.status === 'pending' && offer.item === 'weed' ? offer.quantity : 0),
    (game.player.drugStock ?? 0) +
      (offer?.status === 'pending' && offer.item === 'drug' ? offer.quantity : 0),
  );
}

export function policeLine(bot: Partial<PoliceBot>): string[] {
  if (bot.policeSmoking) return ['CIRCOLAREEE'];
  if (pursuit && pursuit.bot === bot && Date.now() - pursuit.start > 1000)
    return ['Fermo! Polizia!', 'Non provare a scappare.'];
  return ['Controllo di polizia. Tutto a posto?', 'Buona serata. Controllo di routine.'];
}

async function caught(bot: PoliceBot): Promise<void> {
  busy = true;
  const ownerScope = lifetime;
  game.moveRight = game.moveForward = 0;
  bot.vx = bot.vy = 0;
  bot.talk = 'Fermo! Ti abbiamo beccato.';
  try {
    let done = false;
    while (!done && ownerScope.active && !game.player.isDead) {
      const result = await openDialog({
        title: '🚓 Sei stato bevuto dalle guardie!',
        text: `Ti hanno fermato con la droga nello zaino. Paga una multa di ${POLICE_FINE} Đ per tenerla, oppure consegna tutta l’erba e tutte le pillole.\nIn cassaforte: ${game.moneyLevel} Đ.`,
        buttons: [
          { label: `Paga multa (${POLICE_FINE} Đ)`, value: 'fine', color: '#e6a23c' },
          { label: 'Consegna tutta la droga', value: 'seize', color: '#b33939' },
        ],
      });
      if (!ownerScope.active) return;
      if (result.action !== 'fine' && result.action !== 'seize') continue;
      const seized = result.action === 'seize';
      let weedTaken = 0;
      done = await inventoryChange((ledger) =>
        ledger.policeResolution(seized ? null : POLICE_FINE, (grams) => {
          weedTaken = grams;
        }),
      );
      // Il registro confermato è già aggiornato: ricordiamo l'erba prima del prossimo controllo.
      if (done && seized) {
        bot.policeSeizedWeed = weedTaken > 0;
        bot.policeWait = 0;
      }
      if (done) {
        toast(
          seized
            ? 'Erba e pillole sequestrate. Ora puoi andare.'
            : 'Multa pagata. Puoi tenere la droga.',
          4500,
        );
        await saveGame(true);
      }
    }
  } finally {
    if (ownerScope === lifetime) {
      busy = false;
      bot.policeCooldown = Date.now() + 30_000;
      bot.policeRearmed = false;
      bot.policeRoute = null;
    }
  }
}

export function talkToPolice(env: string): void {
  resetScope();
  const bot = game.simulationBots.find((b: PoliceBot) => b.dealer && b.env === env);
  if (!bot || busy) return;
  bot.talk = policeLine(bot)[0];
}

export function updatePolice(bot: PoliceBot, delta: number, obstacles: Obstacle[]): void {
  resetScope();
  if (!bot.streetHome) bot.streetHome = { x: bot.x, y: bot.y };
  const raid = activeRaid(game.session.worldId || LEGACY_WORLD, Date.now());
  const role = raid?.place === bot.env;
  const raidKey = role && raid ? `${game.session.worldId}|${raid.id}|${raid.start}` : '';
  if (bot.policeRaid !== raidKey) {
    bot.policeRaid = raidKey;
    bot.policeSeizedWeed = bot.policeSmoking = false;
    bot.policeWait = bot.policeCooldown = 0;
    bot.policeRearmed = true;
    bot.policeRoute = null;
    bot.say = '';
    bot.nextSayAt = 0;
  }
  const here = bot.env === game.view.activeEnvironment;
  const dt = here && !document.hidden ? Math.max(0, Math.min(delta, 0.25)) : 0;
  if (role && bot.policeSeizedWeed) {
    if (!here) bot.policeWait = 0;
    else bot.policeWait = (bot.policeWait ?? 0) + dt * 1000;
    if ((bot.policeWait ?? 0) >= POLICE_EASTER_EGG_MS && !bot.policeSmoking) {
      bot.policeSmoking = true;
      bot.talk = 'CIRCOLAREEE';
    }
  }
  const distanceToPlayer = Math.hypot(game.playerPos.x - bot.x, game.playerPos.y - bot.y);
  if (distanceToPlayer > 110) bot.policeRearmed = true;
  if (pursuit && pursuit.bot === bot) {
    if (!role || !here) {
      pursuit = null;
      bot.policeCooldown = Date.now() + 30_000;
      bot.policeRearmed = false;
      bot.policeRoute = null;
      bot.vx = bot.vy = 0;
      bot.talk = 'L’ho perso...';
      toast('Hai seminato il poliziotto.', 3000);
    }
  }
  if (
    role &&
    here &&
    !bot.policeSmoking &&
    bot.policeRearmed &&
    !busy &&
    !pursuit &&
    !game.dialogResolve &&
    !game.player.isDead &&
    !game.player.isSleeping &&
    !game.fainted &&
    Date.now() >= (bot.policeCooldown || 0) &&
    suspicious() &&
    Math.hypot(game.playerPos.x - bot.x, game.playerPos.y - bot.y) < 65
  ) {
    const now = Date.now();
    pursuit = { bot, start: now };
    bot.policeRoute = null;
    bot.talk = "Cos'è questo odore?";
  }
  if (pursuit && pursuit.bot === bot) {
    const now = Date.now();
    const dx = game.playerPos.x - bot.x,
      dy = game.playerPos.y - bot.y;
    const distance = Math.hypot(dx, dy);
    if (!game.dialogResolve && now - pursuit.start > 1000) {
      if (distance < 12 && clearSegment(bot, game.playerPos, obstacles)) {
        pursuit = null;
        void caught(bot);
      } else {
        movePolice(bot, game.playerPos, 95, dt, obstacles);
      }
    }
  } else if (!busy) {
    if (here) movePolice(bot, bot.streetHome, 60, dt, obstacles);
    else {
      bot.vx = bot.vy = 0;
    }
  }
  const map =
    bot.env === 'bar' ? game.barMap : bot.env === 'discoteca' ? game.discoMap : game.parkMap;
  if (map?.dealer) {
    map.dealer.x = bot.x;
    map.dealer.y = bot.y;
  }
}

/** Ricalcola il percorso al massimo due volte al secondo, anche tornando al posto. */
function movePolice(
  bot: PoliceBot,
  target: Point,
  speed: number,
  dt: number,
  obstacles: Obstacle[],
): void {
  if (dt <= 0) {
    bot.vx = bot.vy = 0;
    return;
  }
  const now = Date.now();
  let route = bot.policeRoute;
  if (
    !route ||
    now >= route.refresh ||
    Math.hypot(route.target.x - target.x, route.target.y - target.y) > 24
  ) {
    route = bot.policeRoute = {
      points: npcPath(bot, target, obstacles, {
        x0: game.X0,
        x1: game.X1,
        y0: game.Y0,
        y1: game.Y1,
      }),
      target: { ...target },
      refresh: now + 500,
    };
  }
  const start = { x: bot.x, y: bot.y };
  let budget = speed * dt;
  while (budget > 0 && route.points.length) {
    const next = route.points[0];
    const dx = next.x - bot.x,
      dy = next.y - bot.y,
      distance = Math.hypot(dx, dy);
    const step = Math.min(distance, budget);
    const position = {
      x: bot.x + (dx / (distance || 1)) * step,
      y: bot.y + (dy / (distance || 1)) * step,
    };
    if (!clearSegment(bot, position, obstacles)) {
      bot.policeRoute = null;
      break;
    }
    bot.x = position.x;
    bot.y = position.y;
    budget -= step;
    if (step >= distance) route.points.shift();
    else break;
  }
  bot.vx = (bot.x - start.x) / dt;
  bot.vy = (bot.y - start.y) / dt;
}
