// Costanti di gioco: modifica qui i valori di bilanciamento.

export const DEFAULT_NICK = 'Marco';

// Velocità di movimento (unità mondo al secondo)
export const WALK_SPEED = 130;
export const SPRINT_SPEED = 220;

// Area calpestabile del giocatore
export const PLAYER_BOUNDS = { minX: -170, maxX: 170, minY: -150, maxY: 150 };

// Dimensione del pavimento disegnato (metà larghezza / metà profondità)
export const FLOOR_HALF_SIZE = { x: 200, y: 180 };

// Distanza entro cui un oggetto diventa interagibile
export const INTERACT_DISTANCE = 65;

// Ogni quanti ms inviare la posizione a Firebase
export const NETWORK_SYNC_MS = 50;

// Secondi per svuotare completamente ogni bisogno.
// NB: non ancora usati, il consumo dei bisogni nel tempo non è implementato.
export const NEEDS_DEPLETION_SEC = {
  sleep: 900,
  hungerAwake: 300,
  hungerSleeping: 43200,
  hygiene: 1800,
  healthDamage: 120,
};
