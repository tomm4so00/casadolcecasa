// Riquadro dei parametri (compatto o con le barre) ed elenco dei giocatori online accanto.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { presenceAlive } from './saves.js';
import { bodyFromName, legacyLook, parseBody, parseLook, resolveLook } from './character.js';
import { drawPlayerAvatar } from './render/avatars.js';
import { escapeHtmlSafe } from './needs.js';
import type { OnlinePlayer } from './network-model.js';
import { onlineVitals, type VitalKey } from './players-hud-rules.js';
import { roomLabel } from './realty-rules.js';
import {
  PERSONALITY_BADGE,
  type PersonalityId,
  obtainedPersonality,
  personalityBadgeText,
  personalityLevel,
} from './personality-rules.js';

const FULL_KEY = 'sims_hud_full';
const ICON_PX = 64; // risoluzione del disegno; a schermo è 32 px

/** Click sul riquadro dei parametri: passa da solo percentuali a percentuali con le barre. */
function setupHudToggle(): void {
  const hud: HTMLElement = dom('needs-hud');
  const full = localStorage.getItem(FULL_KEY) === '1';
  hud.classList.toggle('compact', !full);
  lifetime.listen(hud, 'click', (e: Event) => {
    if (e.target instanceof Element && e.target.closest('#mission-text')) return; // apre le missioni
    const nowCompact = hud.classList.toggle('compact');
    localStorage.setItem(FULL_KEY, nowCompact ? '0' : '1');
    refresh(); // le icone si spostano: riposiziona subito la scheda
  });
}

/** Disegna la testa del giocatore in una piccola icona tonda. */
function drawHeadIcon(cv: HTMLCanvasElement, op: OnlinePlayer): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const look: GameValue = op.look ? resolveLook(parseLook(op.look)) : legacyLook(op);
  look.body = parseBody(op.body) || bodyFromName(op.name);
  const [z0, z1] = [44, 80];
  const scale = (cv.height * 0.95) / (z1 - z0);
  const savedCtx: GameValue = game.view.ctx;
  game.view.ctx = ctx;
  game.viewOverride = { cx: cv.width / 2, cy: cv.height / 2 + ((z0 + z1) / 2) * scale, scale };
  try {
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawPlayerAvatar(0, 0, '', 0, look, false, '', { noShadow: true });
  } finally {
    game.view.ctx = savedCtx;
    game.viewOverride = null;
  }
}

/** Giocatori online adesso (escluso me), in ordine di nome. */
function onlineList(): [string, OnlinePlayer][] {
  const now = Date.now();
  return Object.entries(game.onlinePlayers || {})
    .filter(
      ([id, op]: [string, OnlinePlayer]) =>
        id !== game.session.myPlayerId &&
        !!op &&
        !!op.name &&
        !op.offline &&
        presenceAlive(id, op, now),
    )
    .sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name)));
}

const lookKeys = new Map<string, string>();
let openId: string | null = null;

const VITAL_LABEL: Record<VitalKey, [string, string]> = {
  health: ['❤️ Salute', '#ff4757'],
  sleep: ['😴 Sonno', '#54a0ff'],
  hunger: ['🍕 Fame', '#ff9f43'],
  hygiene: ['🧼 Igiene', '#1dd1a1'],
  happiness: ['🙂 Felicità', '#ff6b6b'],
};

/** Posto del giocatore visto da me: il suo titolo "La tua stanza" è la stanza sua, non la mia. */
function placeFor(op: OnlinePlayer, place: string): string {
  if (op.env === 'PLAYER_ROOM' && typeof op.roomIdx === 'number') {
    if (op.roomIdx === game.myAssignedRoomIdx) return 'Nella tua stanza 🏠';
    const owner = game.roomsState?.[op.roomIdx]?.owner;
    if (owner && owner === op.name) return 'Nella sua stanza 🏠';
    if (owner) return `Nella stanza di ${owner}`;
  }
  return place.replace(/^La tua stanza/, 'La sua stanza');
}

/** Etichetta della personalità ottenuta (vuota se non ne ha ancora una). */
function personalityTag(id: unknown, level: unknown, extraClass = ''): string {
  const text = personalityBadgeText(id, level);
  if (!text) return '';
  const color = PERSONALITY_BADGE[id as PersonalityId].color;
  return `<div class="pers-tag ${extraClass}" style="border-color:${color};color:${color}">${text}</div>`;
}

/** Scritta con la mia personalità, sopra il riquadro dei parametri (solo dopo averla ottenuta). */
function updatePersonalityTag(hudHidden: boolean): void {
  const tag = dom('my-pers-tag');
  if (!tag) return;
  const id = obtainedPersonality(game.player.personality);
  const text =
    !hudHidden && id
      ? personalityBadgeText(id, personalityLevel(game.player.personality)) || ''
      : '';
  if (tag.textContent !== text) {
    tag.textContent = text;
    tag.style.borderColor = tag.style.color = id ? PERSONALITY_BADGE[id].color : '';
  }
  tag.classList.toggle('hidden', !text);
}

function renderCard(op: OnlinePlayer, icon: HTMLElement): void {
  const card = dom('player-card');
  const v = onlineVitals(op);
  const status =
    op.act === 'sleep' ? ' 💤' : op.act === 'faint' ? ' 😵' : op.act === 'shower' ? ' 🚿' : '';
  const rows = (Object.keys(VITAL_LABEL) as VitalKey[])
    .map((k) => {
      const [label, color] = VITAL_LABEL[k];
      const val = v[k];
      return `<div class="need-row"><div class="need-info"><span>${label}</span><span>${val === null ? '—' : val + '%'}</span></div><div class="bar-bg"><div class="bar-fill" style="width:${val ?? 0}%;background:${color}"></div></div></div>`;
    })
    .join('');
  card.innerHTML =
    `<div class="pc-head"><span class="pc-name">${escapeHtmlSafe(String(op.name))}${status}</span><button type="button" class="pc-close" title="Chiudi">✕</button></div>` +
    `<div class="pc-place">📍 ${escapeHtmlSafe(placeFor(op, v.place) || 'Posizione sconosciuta')}</div>` +
    rows +
    personalityTag(op.pers, op.persLv);
  const list: HTMLElement = dom('players-online');
  card.style.left = list.offsetLeft + list.offsetWidth + 6 + 'px';
  card.style.top = Math.max(0, icon.offsetTop - list.scrollTop) + 'px';
  card.classList.remove('hidden');
}

function closeCard(): void {
  openId = null;
  dom('player-card').classList.add('hidden');
  (dom('players-online') as HTMLElement)
    .querySelectorAll('.po-icon.sel')
    .forEach((el) => el.classList.remove('sel'));
}

/** Scritta sotto i parametri: in che appartamento e stanza abiti. */
function updateRoomTag(): void {
  const tag = dom('room-tag');
  if (!tag) return;
  const idx = game.myAssignedRoomIdx;
  const text =
    idx !== null && idx >= 0
      ? '🏠 ' + roomLabel(idx, game.ROOMS_PER_APT)
      : idx === null
        ? ''
        : '🏠 Nessuna stanza (ospite)';
  if (tag.textContent !== text) tag.textContent = text;
}

function refresh(): void {
  updateRoomTag();
  const list: HTMLElement = dom('players-online');
  const hudHidden = dom('needs-hud').classList.contains('hidden');
  updatePersonalityTag(hudHidden);
  const players = hudHidden ? [] : onlineList();
  list.classList.toggle('hidden', !players.length);
  const ids = new Set(players.map(([id]) => id));
  // toglie chi non è più online
  list.querySelectorAll<HTMLElement>('.po-icon').forEach((el) => {
    if (!ids.has(el.dataset.pid || '')) {
      lookKeys.delete(el.dataset.pid || '');
      el.remove();
    }
  });
  players.forEach(([id, op], i) => {
    let el = list.querySelector<HTMLElement>(`.po-icon[data-pid="${CSS.escape(id)}"]`);
    if (!el) {
      const btn = document.createElement('button');
      btn.type = 'button';
      el = btn;
      el.className = 'po-icon';
      el.dataset.pid = id;
      el.innerHTML = `<canvas width="${ICON_PX}" height="${ICON_PX}"></canvas>`;
    }
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
    el.title = String(op.name);
    el.classList.toggle('sel', openId === id);
    const key = `${op.look || op.outfit}|${op.body || ''}|${op.name}`;
    if (lookKeys.get(id) !== key) {
      lookKeys.set(id, key);
      drawHeadIcon(el.querySelector('canvas') as HTMLCanvasElement, op);
    }
  });
  if (openId) {
    const op = ids.has(openId) ? game.onlinePlayers[openId] : null;
    const icon = list.querySelector<HTMLElement>(`.po-icon[data-pid="${CSS.escape(openId)}"]`);
    if (op && icon) renderCard(op, icon);
    else closeCard();
  }
}

export function startPlayersHud(): void {
  setupHudToggle();
  const list: HTMLElement = dom('players-online');
  lifetime.listen(list, 'click', (e: Event) => {
    const icon = e.target instanceof Element ? e.target.closest<HTMLElement>('.po-icon') : null;
    if (!icon) return;
    const id = icon.dataset.pid || '';
    if (openId === id) return closeCard();
    openId = id;
    refresh();
  });
  lifetime.listen(dom('player-card'), 'click', (e: Event) => {
    if (e.target instanceof Element && e.target.closest('.pc-close')) closeCard();
  });
  refresh();
  lifetime.setInterval(refresh, 1000);
}
