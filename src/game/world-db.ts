// Percorsi dei dati del mondo in cui si gioca (vedi shared/worlds.ts): stanze, giocatori online,
// chat, cimitero… Tutto il gioco passa da qui, così cambiare mondo vuol dire cambiare worldId.
import { game } from './context.js';
import { LEGACY_WORLD, type WorldNode, worldNodePath } from '../../shared/worlds.js';

/** Il percorso di un nodo del mondo attuale (per il mondo di sempre, quello di prima: sims_*). */
export const worldNode = (node: WorldNode): string =>
  worldNodePath(game.session?.worldId || LEGACY_WORLD, node);
