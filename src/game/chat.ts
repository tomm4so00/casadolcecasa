import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom } from './runtime.js';
import { closeModal } from './render/primitives.js';
import { toast } from './missions.js';
export function chatColor(name?: GameValue): GameValue {
  let h: GameValue = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},70%,68%)`;
}

export function chatUnread(..._args: GameValue[]): GameValue {
  return game.chatMsgs.filter(
    (m?: GameValue): GameValue => m.id !== game.myPlayerId && (m.t || 0) > game.chatReadT,
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
    localStorage.setItem(game.LS_PREFIX + 'sims_chat_read', String(game.chatReadT));
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
    const mine: GameValue = m.id === game.myPlayerId,
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
  const inp: GameValue = dom('gchat-input');
  const text: GameValue = inp.value.trim().slice(0, game.CHAT_MAX_LEN);
  if (!text) return;
  if (game.isDead) {
    toast('🪦 Un fantasma non può scrivere in chat.');
    return;
  }
  const now: GameValue = Date.now();
  if (now - game.chatLastSend < 1500) {
    toast('⏳ Piano, un messaggio alla volta!');
    return;
  }
  game.chatLastSend = now;
  inp.value = '';
  const t: GameValue = now + (typeof game.serverOffset === 'number' ? game.serverOffset : 0);
  const key: GameValue =
    t.toString(36).padStart(9, '0') + '_' + Math.random().toString(36).slice(2, 6);
  try {
    await game.db
      .ref('sims_chat/' + key)
      .set({ id: game.myPlayerId, name: game.myData.nick, text, t });
  } catch (e: GameValue) {
    toast('❌ Messaggio non inviato.');
    return;
  }
  game.stats.chats = (game.stats.chats || 0) + 1;
  if (Math.random() < 0.1) {
    // ogni tanto elimina i messaggi più vecchi
    game.db.ref('sims_chat').once('value', (s?: GameValue): GameValue => {
      const ks: GameValue = Object.keys(s.val() || {}).sort();
      if (ks.length > game.CHAT_KEEP) {
        const upd: GameValue = {};
        ks.slice(0, ks.length - game.CHAT_KEEP + 100).forEach((k?: GameValue): GameValue => {
          upd[k] = null;
        });
        game.db.ref('sims_chat').update(upd);
      }
    });
  }
}

export function startChat(..._args: GameValue[]): GameValue {
  if (game.OFFLINE) {
    try {
      const saved: GameValue = JSON.parse(
        localStorage.getItem(game.LS_PREFIX + 'sims_chat_offline') || 'null',
      );
      if (saved) game.db.ref('sims_chat').set(saved);
    } catch (e: GameValue) {}
  }
  let q: GameValue = game.db.ref('sims_chat');
  if (typeof q.limitToLast === 'function') q = q.limitToLast(game.CHAT_SHOW);
  q.on('value', (snap?: GameValue): GameValue => {
    const v: GameValue = snap.val() || {};
    const list: GameValue = Object.keys(v)
      .sort()
      .map((k?: GameValue): GameValue => Object.assign({ k }, v[k]))
      .filter((m?: GameValue): GameValue => m && typeof m.text === 'string');
    const fresh: GameValue = game.chatInit
      ? list.filter((m?: GameValue): GameValue => !game.chatSeen[m.k])
      : [];
    list.forEach((m?: GameValue): GameValue => {
      game.chatSeen[m.k] = 1;
    });
    game.chatMsgs = list;
    if (!game.chatInit && !game.chatHadRead) {
      game.chatHadRead = true;
      markChatRead();
    } // primo avvio: i vecchi messaggi non contano come "non letti"
    game.chatInit = true;
    if (game.OFFLINE) {
      try {
        localStorage.setItem(game.LS_PREFIX + 'sims_chat_offline', JSON.stringify(v));
      } catch (e: GameValue) {}
    }
    if (game.chatOpen()) {
      renderChat();
      markChatRead();
    } else
      fresh
        .filter((m?: GameValue): GameValue => m.id !== game.myPlayerId)
        .slice(-2)
        .forEach(
          (m?: GameValue): GameValue => toast(`🗨️ ${m.name}: ${String(m.text).slice(0, 60)}`, 3500),
        );
    updateChatBadge();
  });
}
