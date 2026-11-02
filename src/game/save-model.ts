export interface Point {
  x: number;
  y: number;
}
export interface SaveV8 {
  v: number;
  savedAt: number;
  nick: string;
  healthLevel: number;
  sleepLevel: number;
  hungerLevel: number;
  hygieneLevel: number;
  happinessLevel: number;
  moneyLevel: number;
  vaultOnly: boolean;
  ownedItems: Record<string, boolean>;
  ownedFurniture: Record<string, boolean>;
  equipped: Record<string, string | null>;
  activeJobKey: string | null;
  jobExperience: Record<string, number>;
  furniturePos: Record<string, Point>;
  gameMinutes: number;
  stats: Record<string, number>;
  missionIndex: number;
  missionSet?: number;
  sleeping?: boolean;
  body?: string;
  drugStock?: number;
  coffeeAt?: number;
  invest?: Record<string, { units: number; cost: number }>;
  drug?: { doses: number; lastDose: number; endAt: number; dAtDose: number; crisisAt: number };
  bornAt?: number;
  epitaph?: string;
  dead?: boolean;
  deadAt?: number;
  inventory?: { hasFood: boolean; foodCooked: boolean };
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// Preserva le estensioni della v8; rifiuta valori che farebbero fallire il caricamento.
export function decodeSaveV8(value: unknown): (Partial<SaveV8> & { savedAt: number }) | null {
  if (
    !object(value) ||
    !finite(value.savedAt) ||
    value.savedAt < 0 ||
    (value.v !== undefined && (!finite(value.v) || value.v > 8))
  )
    return null;
  for (const key of [
    'healthLevel',
    'sleepLevel',
    'hungerLevel',
    'hygieneLevel',
    'happinessLevel',
  ]) {
    if (value[key] !== undefined && (!finite(value[key]) || value[key] < 0 || value[key] > 100))
      return null;
  }
  for (const key of [
    'ownedItems',
    'ownedFurniture',
    'equipped',
    'jobExperience',
    'furniturePos',
    'stats',
    'invest',
    'drug',
    'inventory',
  ]) {
    if (value[key] !== undefined && !object(value[key])) return null;
  }
  if (value.nick !== undefined && (typeof value.nick !== 'string' || value.nick.length > 100))
    return null;
  if (object(value.furniturePos))
    for (const position of Object.values(value.furniturePos)) {
      if (
        !object(position) ||
        !finite(position.x) ||
        !finite(position.y) ||
        Math.abs(position.x) > 1000 ||
        Math.abs(position.y) > 1000
      )
        return null;
    }
  if (object(value.invest))
    for (const investment of Object.values(value.invest)) {
      if (
        !object(investment) ||
        !finite(investment.units) ||
        !finite(investment.cost) ||
        investment.units < 0 ||
        investment.cost < 0
      )
        return null;
    }
  return value as Partial<SaveV8> & { savedAt: number };
}

// Importa il formato della precedente ristrutturazione solo se non esiste già un salvataggio v8.
export function importRefactoredSave(storage: Storage, prefix: string): boolean {
  const target = prefix + 'sims_save_v1';
  if (storage.getItem(target)) return false;
  try {
    const current = storage.getItem('casadolcecasa.save.v2.guest');
    const older = storage.getItem('casadolcecasa.save.v1');
    if (!current && !older) return false;
    const parsed: unknown = JSON.parse(current || older || 'null');
    if (!object(parsed)) return false;
    const source = current && object(parsed.data) ? parsed.data : parsed;
    if (!object(source.needs) || !finite(source.savedAt)) return false;
    const needs = source.needs;
    for (const key of ['health', 'sleep', 'hunger', 'hygiene', 'happiness', 'money'])
      if (!finite(needs[key])) return false;
    const furniture: Record<string, Point> = {};
    if (object(source.furniture))
      for (const [key, position] of Object.entries(source.furniture)) {
        if (object(position) && finite(position.x) && finite(position.y))
          furniture['base_' + key] = { x: position.x, y: position.y };
      }
    const save = {
      v: 8,
      savedAt: source.savedAt,
      nick: typeof source.nick === 'string' ? source.nick : 'Ospite',
      healthLevel: needs.health,
      sleepLevel: needs.sleep,
      hungerLevel: needs.hunger,
      hygieneLevel: needs.hygiene,
      happinessLevel: needs.happiness,
      moneyLevel: needs.money,
      vaultOnly: false,
      furniturePos: furniture,
      sleeping: source.isSleeping === true,
      inventory: object(source.inventory) ? source.inventory : undefined,
    };
    storage.setItem(target, JSON.stringify(save));
    storage.setItem(prefix + 'sims_player_nick', save.nick);
    return true;
  } catch {
    return false;
  }
}
