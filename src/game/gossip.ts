// Bacheca dei pettegolezzi nel cortile: kiss, furti, quadri venduti, personalità, traslochi…
// compaiono da soli, e chi ne è protagonista riceve l'avviso "si parla di te".
import type { GameValue } from './context.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import {
  GOSSIP_MAX_TEXT,
  GOSSIP_SHOW,
  type GossipEntry,
  decodeGossip,
  gossipKey,
  isAbout,
  isRepeat,
  timeAgo,
} from './gossip-rules.js';
import { worldNode } from './world-db.js';

const READ_KEY = 'sims_gossip_read';
let entries: (GossipEntry & { k: string })[] = [];
let started = false;
const recent: Record<string, number> = {};

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Gli ultimi fatti della bacheca, dal più vecchio (li legge anche il commissariato). */
export const gossipEntries = (): readonly GossipEntry[] => entries;

/** Fatti arrivati dopo l'ultima lettura della bacheca (per la scritta "NUOVO"). */
export function unreadGossip(): number {
  const read = Number(localStorage.getItem(game.session.LS_PREFIX + READ_KEY)) || 0;
  return entries.filter((e) => e.t > read && e.by !== game.session.myPlayerId).length;
}

/**
 * Scrive un fatto sulla bacheca. `about` = giocatori di cui si parla (ricevono l'avviso).
 * `windowMs`: lo stesso fatto non si ripete prima di questo tempo.
 */
export function postGossip(text: string, about: string[] = [], windowMs = 30 * 60_000): void {
  if (game.player.isDead && !text.includes('⚰️')) return;
  const clean = text.trim().slice(0, GOSSIP_MAX_TEXT);
  const now = serverNow();
  if (!clean || isRepeat(recent, clean, now, windowMs)) return;
  recent[clean] = now;
  const entry: GossipEntry = { by: game.session.myPlayerId, text: clean, t: now };
  const ids = about.filter((id) => id && id !== game.session.myPlayerId);
  if (ids.length) entry.about = ids.join(',');
  const key = gossipKey(now, Math.random().toString(36).slice(2, 6));
  void Promise.resolve()
    .then(() => game.session.db.ref(worldNode('gossip') + '/' + key).set(entry))
    .catch((e: unknown) => console.warn('[pettegolezzi]', e));
}

/** Ascolta la bacheca: avvisa chi è protagonista di un fatto nuovo. */
export function startGossip(): void {
  if (started) return;
  started = true;
  let q: GameValue = game.session.db.ref(worldNode('gossip'));
  if (typeof q.limitToLast === 'function') q = q.limitToLast(GOSSIP_SHOW);
  let first = true;
  const seen = new Set<string>();
  q.on('value', (snap: GameValue): void => {
    const v: GameValue = snap.val() || {};
    const list = Object.keys(v)
      .sort()
      .map((k) => {
        const e = decodeGossip(v[k]);
        return e ? { ...e, k } : null;
      })
      .filter((e): e is GossipEntry & { k: string } => e !== null);
    // al primo caricamento i vecchi fatti non fanno scattare l'avviso
    if (!first)
      for (const e of list)
        if (!seen.has(e.k) && isAbout(e, game.session.myPlayerId)) {
          sfx('gossip');
          toast('📰 Si parla di te sulla bacheca dei pettegolezzi del cortile!', 5000);
        }
    for (const e of list) seen.add(e.k);
    first = false;
    entries = list;
  });
}

/** Apre la bacheca: i fatti più recenti in alto. */
export async function openGossipBoard(): Promise<void> {
  game.player.stats.gossipRead = (game.player.stats.gossipRead || 0) + 1;
  const now = serverNow();
  const list = entries.slice().reverse();
  const read = Number(localStorage.getItem(game.session.LS_PREFIX + READ_KEY)) || 0;
  const text = list.length
    ? list
        .map((e) => {
          const mine = isAbout(e, game.session.myPlayerId) ? ' 👈' : '';
          const fresh = e.t > read && e.by !== game.session.myPlayerId ? '🆕 ' : '';
          return `${fresh}${e.text}${mine}\n   ${timeAgo(e.t, now)}`;
        })
        .join('\n\n')
    : 'Per ora nel condominio non è successo niente di interessante… 🤫';
  try {
    localStorage.setItem(
      game.session.LS_PREFIX + READ_KEY,
      String(Math.max(read, ...list.map((e) => e.t))),
    );
  } catch {}
  await openDialog({
    title: '📰 Bacheca dei pettegolezzi',
    text,
    buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
  });
}
