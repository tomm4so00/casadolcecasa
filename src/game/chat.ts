import type { GameValue } from './context.js';
import { decodeChatMessage } from './network-model.js';
import { isRecord } from './save-model.js';
import type { ChatMessage } from './models.js';
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { closeModal } from './render/primitives.js';
import { toast } from './missions.js';
import { chatNoticeOnce } from './terms.js';
import { recordActivity } from './activity.js';
import { worldNode } from './world-db.js';
import { isGuest, requireAccount } from './guest.js';
export function chatColor(name?: GameValue): GameValue {
  let h: GameValue = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},70%,68%)`;
}

export function chatUnread(..._args: GameValue[]): GameValue {
  return game.chatMsgs.filter(
    (m?: GameValue): GameValue => m.id !== game.session.myPlayerId && (m.t || 0) > game.chatReadT,
  ).length;
}

export function updateChatBadge(..._args: GameValue[]): GameValue {
  const b: GameValue = dom('gchat-badge');
  if (!b) return;
  const n: GameValue = chatUnread();
  b.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('hidden', n === 0);
}

export function markChatRead(..._args: GameValue[]): GameValue {
  const last: GameValue = game.chatMsgs.length
    ? Math.max(...game.chatMsgs.map((m?: GameValue): GameValue => m.t || 0))
    : 0;
  game.chatReadT = Math.max(game.chatReadT, last);
  try {
    localStorage.setItem(game.session.LS_PREFIX + 'sims_chat_read', String(game.chatReadT));
  } catch (e: GameValue) {}
  updateChatBadge();
}

export function renderChat(..._args: GameValue[]): GameValue {
  const box: GameValue = dom('gchat-list');
  const stick: GameValue = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = '';
  if (!game.chatMsgs.length) {
    const p: GameValue = document.createElement('div');
    p.style.cssText = 'color:#888;text-align:center;font-size:0.85rem;margin:auto;';
    p.textContent = 'Nessun messaggio ancora: scrivi tu il primo! 👋';
    box.appendChild(p);
    return;
  }
  let lastDay: GameValue = '';
  game.chatMsgs.forEach((m?: GameValue): GameValue => {
    const d: GameValue = new Date(m.t || 0),
      day: GameValue = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    if (day !== lastDay) {
      lastDay = day;
      const s: GameValue = document.createElement('div');
      s.style.cssText = 'text-align:center;font-size:0.7rem;color:#777;margin:4px 0;';
      s.textContent =
        day === new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
          ? 'Oggi'
          : day;
      box.appendChild(s);
    }
    const mine: GameValue = m.id === game.session.myPlayerId,
      row: GameValue = document.createElement('div');
    row.style.cssText = `align-self:${mine ? 'flex-end' : 'flex-start'};max-width:85%;background:${mine ? '#2e86de' : 'rgba(255,255,255,0.08)'};border-radius:12px;padding:6px 10px;`;
    const hd: GameValue = document.createElement('div');
    hd.style.cssText = 'font-size:0.7rem;display:flex;gap:8px;justify-content:space-between;';
    const nm: GameValue = document.createElement('b');
    nm.textContent = mine ? 'Tu' : m.name || 'Giocatore';
    nm.style.color = mine ? '#dff' : chatColor(m.name);
    const tm: GameValue = document.createElement('span');
    tm.style.color = mine ? '#cde' : '#888';
    tm.textContent = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    hd.appendChild(nm);
    hd.appendChild(tm);
    const tx: GameValue = document.createElement('div');
    tx.style.cssText = 'font-size:0.9rem;word-break:break-word;white-space:pre-wrap;';
    tx.textContent = m.text;
    row.appendChild(hd);
    row.appendChild(tx);
    box.appendChild(row);
  });
  if (stick) box.scrollTop = box.scrollHeight;
}

export function openGlobalChat(..._args: GameValue[]): GameValue {
  dom('gchat-modal').classList.remove('hidden');
  renderChat();
  const box: GameValue = dom('gchat-list');
  box.scrollTop = box.scrollHeight;
  markChatRead();
  // l'ospite legge: per scrivere salva il personaggio (la tastiera non si apre da sola)
  const guest = isGuest();
  const input: GameValue = dom('gchat-input');
  input.readOnly = guest;
  input.placeholder = guest ? '💾 Salva per scrivere' : 'Scrivi a tutti…';
  input.onclick = guest ? (): void => void requireAccount('scrivere in chat') : null;
  if (guest) return;
  lifetime.setTimeout((): GameValue => {
    try {
      dom('gchat-input').focus();
    } catch (e: GameValue) {}
  }, 60);
}

export function closeGlobalChat(..._args: GameValue[]): GameValue {
  closeModal('gchat-modal');
}

export async function sendChat(..._args: GameValue[]): Promise<GameValue> {
  if (!(await requireAccount('scrivere in chat'))) return;
  const inp: GameValue = dom('gchat-input');
  const text: GameValue = inp.value.trim().slice(0, game.CHAT_MAX_LEN);
  if (!text) return;
  if (game.player.isDead) {
    toast('⚰️ Un fantasma non può scrivere in chat.');
    return;
  }
  // la prima volta: chi legge la chat e cosa non scriverci (il messaggio resta nel campo)
  if (!game.player.chatNoticeAt && !game.session.OFFLINE) {
    await chatNoticeOnce();
    return;
  }
  const now: GameValue = Date.now();
  if (now - game.chatLastSend < 1500) {
    toast('⏳ Piano, un messaggio alla volta!');
    return;
  }
  game.chatLastSend = now;
  inp.value = '';
  const t: GameValue =
    now + (typeof game.session.serverOffset === 'number' ? game.session.serverOffset : 0);
  const key: GameValue =
    t.toString(36).padStart(9, '0') + '_' + Math.random().toString(36).slice(2, 6);
  try {
    await game.session.db
      .ref(worldNode('chat') + '/' + key)
      .set({ id: game.session.myPlayerId, name: game.player.myData.nick, text, t });
    recordActivity('app');
  } catch (e: GameValue) {
    toast('❌ Messaggio non inviato.');
    return;
  }
  game.player.stats.chats = (game.player.stats.chats || 0) + 1;
}

export function startChat(..._args: GameValue[]): GameValue {
  if (game.session.OFFLINE) {
    try {
      const saved: GameValue = JSON.parse(
        localStorage.getItem(game.session.LS_PREFIX + 'sims_chat_offline') || 'null',
      );
      if (saved) game.session.db.ref(worldNode('chat')).set(saved);
    } catch (e: GameValue) {}
  }
  let q = game.session.db.ref(worldNode('chat'));
  if (typeof q.limitToLast === 'function') q = q.limitToLast(game.CHAT_SHOW);
  q.on('value', (snap): void => {
    const value: unknown = snap.val();
    const v = isRecord(value) ? value : {};
    const list = Object.keys(v)
      .sort()
      .map((k) => {
        const message = decodeChatMessage(v[k]);
        return message ? { ...message, k } : null;
      })
      .filter((message): message is ChatMessage & { k: string } => message !== null);
    const fresh = game.chatInit ? list.filter((m) => !game.chatSeen[m.k]) : [];
    list.forEach((m) => {
      game.chatSeen[m.k] = true;
    });
    game.chatMsgs = list;
    if (!game.chatInit && !game.chatHadRead) {
      game.chatHadRead = true;
      markChatRead();
    } // primo avvio: i vecchi messaggi non contano come "non letti"
    game.chatInit = true;
    if (game.session.OFFLINE) {
      try {
        localStorage.setItem(game.session.LS_PREFIX + 'sims_chat_offline', JSON.stringify(v));
      } catch (e: GameValue) {}
    }
    if (game.chatOpen()) {
      renderChat();
      markChatRead();
    } else
      fresh
        .filter((m?: GameValue): GameValue => m.id !== game.session.myPlayerId)
        .slice(-2)
        .forEach(
          (m?: GameValue): GameValue => toast(`🗨️ ${m.name}: ${String(m.text).slice(0, 60)}`, 3500),
        );
    updateChatBadge();
  });
}
