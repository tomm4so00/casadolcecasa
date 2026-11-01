// Bisogni del personaggio. L'HUD viene generato da questa lista:
// per aggiungere una barra basta aggiungere una riga.
export const NEEDS = [
  { key: 'health',    icon: '❤️', name: 'Salute',   color: '#ff4757' },
  { key: 'sleep',     icon: '😴', name: 'Sonno',    color: '#54a0ff' },
  { key: 'hunger',    icon: '🍕', name: 'Fame',     color: '#ff9f43' },
  { key: 'hygiene',   icon: '🧼', name: 'Igiene',   color: '#1dd1a1' },
  { key: 'happiness', icon: '🙂', name: 'Felicità', color: '#ff6b6b' },
  { key: 'money',     icon: '💰', name: 'Soldi',    color: '#2ed573' },
];

export const INITIAL_NEED_VALUE = 50;

export const getNeed = (key) => NEEDS.find(n => n.key === key);
