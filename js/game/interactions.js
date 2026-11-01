import { ACTIVITIES, activityLabel } from '../data/activities.js';
import { state, changeNeed, setNeed } from '../state.js';
import { goTo, startActivity } from './world.js';
import { startMovingFurniture } from './furniture.js';
import { openModal } from '../ui/modals.js';
import { notify } from '../ui/notify.js';

// Cosa si può fare con ogni tipo di oggetto.
//
// Ogni handler riceve (obj, key) e restituisce la lista di azioni da mostrare
// nel popup. Un'azione è { label, variant, run }:
//   variant: 'main' | 'action' | 'exit' | 'alt' | 'locked' (decide il colore)
//   run:     funzione eseguita al click
//
// Per aggiungere un nuovo oggetto interattivo: dagli un `type` in
// js/data/environments.js e aggiungi qui un handler con lo stesso nome.

const action = (label, run, variant = 'main') => ({ label, run, variant });
const noop = () => {};

const defaultHandler = (obj) => [action(`✋ ${obj.name}`, noop)];

const HANDLERS = {
  // ----- Porte -----
  door: (obj) => [
    action(`✋ ${obj.name}`, () => goTo(obj.targetEnv, { title: obj.title, roomIdx: obj.roomIdx ?? null })),
  ],

  exitToSaloon: (obj) => [
    action(`✋ ${obj.name}`, () => goTo('SALOON')),
  ],

  exitHouse: () => {
    const toggleMenu = () => { state.outsideMenuOpen = !state.outsideMenuOpen; };
    if (!state.outsideMenuOpen) return [action('🚪 Esci di Casa', toggleMenu)];
    return [
      action('🚪 Chiudi Menu Uscita', toggleMenu),
      ...ACTIVITIES.map(a => action(activityLabel(a), () => startActivity(a), 'exit')),
    ];
  },

  // ----- Cucina -----
  fridge: () => {
    const k = state.kitchen;
    const inv = state.inventory;
    const toggle = () => {
      k.fridgeOpen = !k.fridgeOpen;
      // Chiudendo il frigo il cibo crudo torna dentro
      if (!k.fridgeOpen) inv.hasFood = false;
    };

    if (!k.fridgeOpen) return [action('🧊 Apri Frigorifero', toggle)];

    const actions = [action('🧊 Chiudi Frigorifero', toggle)];
    if (!inv.hasFood) {
      actions.push(action('🍎 Prendi Cibo', () => {
        inv.hasFood = true;
        inv.foodCooked = false;
        notify('Hai preso del cibo! Portalo al fornello 🍎');
      }, 'action'));
    }
    return actions;
  },

  stove: () => {
    const inv = state.inventory;
    if (inv.foodCooked) {
      return [action('🍽️ Mangia', () => {
        changeNeed('hunger', 50);
        inv.hasFood = false;
        inv.foodCooked = false;
        state.kitchen.fridgeOpen = false;
        notify('Gnam! Fame +50%');
      })];
    }
    if (inv.hasFood) {
      return [action('🍳 Cucina Cibo', () => {
        inv.foodCooked = true;
        notify('Hai cucinato il cibo! Ora puoi mangiare 🍽️');
      })];
    }
    return [action('🍳 Fornello (Serve Cibo)', noop, 'locked')];
  },

  // ----- Bagno -----
  shower: (obj) => [
    action(`✋ ${obj.name}`, () => {
      setNeed('hygiene', 100);
      notify('Doccia completata! Igiene al 100% 🚿');
    }),
  ],

  // ----- Stanza privata -----
  bed: (obj) => [
    action(`✋ ${obj.name}`, () => {
      state.isSleeping = !state.isSleeping;
      notify(state.isSleeping ? 'Ti sei coricato a letto 🛏️' : 'Ti sei svegliato.');
    }),
  ],

  wardrobe: (obj) => [action(`✋ ${obj.name}`, () => openModal('wardrobe-modal'))],
  desk: (obj) => [action(`✋ ${obj.name}`, () => openModal('computer-modal'))],
};

export function getActions(key, obj) {
  const handler = HANDLERS[obj.type] || defaultHandler;
  const actions = handler(obj, key);

  const busyInBed = obj.type === 'bed' && state.isSleeping;
  if (obj.moveable && !busyInBed) {
    actions.push(action('🖐️ Sposta Mobile', () => startMovingFurniture(key), 'alt'));
  }
  return actions;
}
