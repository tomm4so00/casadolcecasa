import type { ChatMessage } from './models.js';
import type { PresenceInfo } from './presence-rules.js';
import { isRecord } from './save-model.js';

/** Quello che ogni giocatore pubblica in sims_online_players/<id> (vedi startPresence in saves.ts). */
export interface OnlinePlayer extends PresenceInfo {
  name: string;
  x: number;
  y: number;
  env: string;
  /** Stanza privata in cui si trova (indice globale), solo dentro PLAYER_ROOM. */
  roomIdx?: number | null;
  /** Appartamento, solo in salone, cucina e bagno. */
  apt?: number | null;
  look?: string;
  body?: string;
  /** Colore della maglia e accessorio delle versioni vecchie, senza `look`. */
  outfit?: string;
  acc?: string;
  /** Parametri vitali e posto: vedi publishVitals. */
  hp?: number;
  hun?: number;
  hyg?: number;
  hap?: number;
  place?: string;
  say?: string;
  sayT?: number;
  /** Pezzi di vestiti tolti per la doccia (0-4). */
  und?: number;
  /** Cuscino su cui dorme (0 o 1), solo mentre è a letto. */
  bed?: number;
}

export function decodeChatMessage(value: unknown): ChatMessage | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length > 100 ||
    typeof value.text !== 'string' ||
    value.text.length > 200 ||
    typeof value.t !== 'number' ||
    !Number.isFinite(value.t) ||
    value.t < 0 ||
    typeof value.name !== 'string' ||
    value.name.length > 100
  )
    return null;
  return { id: value.id, name: value.name, text: value.text, t: value.t };
}
