import type { ChatMessage } from './models.js';
import type { PresenceInfo } from './presence-rules.js';
import { isRecord } from './save-model.js';
import { maskText } from '../../shared/text-filter-rules.js';

/** Quello che ogni giocatore pubblica in sims_online_players/<id> (vedi startPresence in saves.ts). */
export interface OnlinePlayer extends PresenceInfo {
  name: string;
  x: number;
  y: number;
  /** Velocità (unità al secondo), per farlo camminare fra un messaggio e l'altro (remote-motion.ts). */
  vx?: number;
  vy?: number;
  env: string;
  /** Stanza privata in cui si trova (indice globale), solo dentro PLAYER_ROOM. */
  roomIdx?: number | null;
  /** Solo in autoplay (autoplay.ts): seduto sul bordo del letto, a questa altezza. */
  seatZ?: number;
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
  /** 1 se ha l'influenza (si attacca a chi gli si avvicina). */
  sick?: number;
  /** Sta scassinando la cassaforte della stanza con questo indice (stringa), da crackT. */
  crack?: string;
  crackT?: number;
  /** 1 se porta a spasso il suo cane al guinzaglio, 2 se il cane corre libero nell'area cani. */
  dog?: number;
  /** Dove si trova il cane libero (solo con dog: 2). */
  dogX?: number;
  dogY?: number;
  /** true per dieci minuti dopo una canna: occhi rossi. */
  stoned?: boolean;
  /** Personalità ottenuta (artist, business, criminal, romantic). */
  pers?: string;
  /** Livello della personalità (1-3). */
  persLv?: number;
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
  // scritto da un altro, magari con una versione vecchia: si copre quello che non va
  return { id: value.id, name: maskText(value.name), text: maskText(value.text), t: value.t };
}

/**
 * Un messaggio tra giocatori (sims_interactions/<giocatore>/<chiave>): tipo, mittente e i campi
 * del suo tipo. Arriva da altri giocatori, quindi ogni campo va controllato prima di usarlo.
 */
export type SocialMessage = Record<string, unknown>;
