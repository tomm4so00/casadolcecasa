import { ACTIVITIES, activityEnvId } from './activities.js';

// Definizione di tutti gli ambienti (stanze) e degli oggetti che contengono.
//
// Ogni oggetto ha:
//   type      -> decide cosa succede interagendo (vedi js/game/interactions.js)
//   name      -> etichetta mostrata sopra l'oggetto e nel pulsante
//   x, y      -> posizione al centro della stanza (0,0)
//   w, h, z   -> larghezza, profondità, altezza del blocco
//   color, topColor -> colori dei lati e del piano superiore
//   moveable  -> se true il giocatore può spostarlo
//
// Questi sono i valori iniziali: lo stato di gioco ne fa una copia (state.objects),
// così gli spostamenti dei mobili non modificano queste definizioni.

const DOOR_COLORS = { color: '#e74c3c', topColor: '#ff6b6b' };

const exitToSaloon = () => ({
  type: 'exitToSaloon', name: 'Uscita Salone',
  x: 0, y: 160, w: 60, h: 15, z: 110, ...DOOR_COLORS,
});

const door = (name, targetEnv, x, y, w, h, extra = {}) => ({
  type: 'door', name, targetEnv,
  x, y, w, h, z: 110, ...DOOR_COLORS, ...extra,
});

const roomDoor = (n, x, y, w, h) =>
  door(`Stanza ${n}`, 'PLAYER_ROOM', x, y, w, h, { title: `Stanza ${n}`, roomIdx: n - 1 });

export const ENVIRONMENTS = {
  SALOON: {
    title: 'Salone Principale',
    floorColor: '#34495e',
    spawn: { x: 0, y: 0 },
    objects: {
      exitHouse: { type: 'exitHouse', name: 'Uscita di Casa 🚪', x: 0, y: 180, w: 70, h: 15, z: 110, ...DOOR_COLORS },
      kitchen:   door('Entra in Cucina 🍳', 'KITCHEN',  -180, -100, 10, 60),
      bathroom:  door('Entra in Bagno 🚽',  'BATHROOM',  180, -100, 10, 60),
      room1: roomDoor(1, -180,    0, 10, 50),
      room2: roomDoor(2, -180,  100, 10, 50),
      room3: roomDoor(3,  180,    0, 10, 50),
      room4: roomDoor(4,  180,  100, 10, 50),
      room5: roomDoor(5, -100, -180, 50, 10),
      room6: roomDoor(6,  100, -180, 50, 10),
      room7: roomDoor(7, -100,  180, 50, 10),
      room8: roomDoor(8,  100,  180, 50, 10),
    },
  },

  KITCHEN: {
    title: 'Cucina',
    floorColor: '#8e5d38',
    spawn: { x: 0, y: 120 },
    objects: {
      stove:  { type: 'stove',  name: 'Cucina Attrezzata 🍳', x: -100, y: -100, w: 70, h: 70, z: 60,  color: '#c0392b', topColor: '#e74c3c' },
      fridge: { type: 'fridge', name: 'Frigorifero 🧊',       x:  100, y: -100, w: 70, h: 70, z: 140, color: '#bdc3c7', topColor: '#ecf0f1' },
      doorExit: exitToSaloon(),
    },
  },

  BATHROOM: {
    title: 'Bagno',
    floorColor: '#8e5d38',
    spawn: { x: 0, y: 120 },
    objects: {
      toilet: { type: 'toilet', name: 'Sanitario Moderno 🚽',   x: -120, y:  -80, w: 55, h: 55, z: 45,  color: '#f1f2f6', topColor: '#dfe4ea' },
      sink:   { type: 'sink',   name: 'Lavandino di Design 🚰', x:    0, y: -120, w: 60, h: 50, z: 55,  color: '#0984e3', topColor: '#74b9ff' },
      shower: { type: 'shower', name: 'Box Doccia Cristallo 🚿', x:  120, y:  -80, w: 80, h: 80, z: 125, color: '#00cec9', topColor: '#81ecec' },
      doorExit: exitToSaloon(),
    },
  },

  // Stanza privata (per ora condivisa da tutte e 8 le porte)
  PLAYER_ROOM: {
    title: 'Stanza',
    floorColor: '#8e5d38',
    spawn: { x: 0, y: 120 },
    objects: {
      bed:      { type: 'bed',      name: 'Letto di Lusso 🛏️',        x: -120, y: -100, w: 80, h: 110, z: 40,  color: '#5f27cd', topColor: '#8854d0', moveable: true },
      wardrobe: { type: 'wardrobe', name: 'Armadio a Anta Doppia 🚪',  x:  120, y: -100, w: 80, h: 60,  z: 135, color: '#1e272e', topColor: '#485460', moveable: true },
      desk:     { type: 'desk',     name: 'Postazione Gaming & PC 💻', x:  120, y:   40, w: 80, h: 70,  z: 55,  color: '#222f3e', topColor: '#576574', moveable: true },
      doorExit: exitToSaloon(),
    },
  },
};

// Un ambiente "esterno" per ogni attività (senza oggetti)
for (const activity of ACTIVITIES) {
  ENVIRONMENTS[activityEnvId(activity)] = {
    title: activity.title,
    floorColor: '#8e5d38',
    spawn: { x: 0, y: 0 },
    objects: {},
    isActivity: true,
  };
}
