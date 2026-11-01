import { getNeed } from './needs.js';

// Attività disponibili uscendo di casa.
// `effects` modifica i bisogni (in punti percentuali) quando si parte.
export const ACTIVITIES = [
  { id: 'walk', icon: '🚶', name: 'Passeggiata nel Parco', title: 'Parco Cittadino 🌳',  effects: { happiness: 10, health: 5 } },
  { id: 'bar',  icon: '☕', name: "Bar all'Aperto",        title: "Bar all'Aperto ☕",    effects: { happiness: 15, money: -5 } },
  { id: 'trip', icon: '✈️', name: 'Viaggio',               title: 'Viaggio ✈️',           effects: { happiness: 70, money: -20 } },
  { id: 'work', icon: '💼', name: 'Ufficio High-Tech',     title: 'Ufficio High-Tech 💼', effects: { money: 10, happiness: -10 } },
];

// Id dell'ambiente associato a un'attività (vedi environments.js)
export const activityEnvId = (activity) => `ACTIVITY_${activity.id.toUpperCase()}`;

// Es. "🚶 Passeggiata nel Parco (+10% Felicità, +5% Salute)"
export function activityLabel(activity) {
  const effects = Object.entries(activity.effects)
    .map(([key, amount]) => `${amount > 0 ? '+' : ''}${amount}% ${getNeed(key).name}`)
    .join(', ');
  return `${activity.icon} ${activity.name} (${effects})`;
}
