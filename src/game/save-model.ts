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
  sleepGainedSinceLastHealthBoost?: number;
  needsZeroSince?: number;
  currentOutfitColor?: string;
  equippedAcc?: Record<string, boolean>;
  body?: string;
  drugStock?: number;
  stonedUntil?: number;
  jointReadyAt?: number;
  coffeeAt?: number;
  toiletAt?: number;
  invest?: Record<string, { units: number; cost: number }>;
  drug?: { doses: number; lastDose: number; endAt: number; dAtDose: number; crisisAt: number };
  bornAt?: number;
  epitaph?: string;
  dead?: boolean;
  deadAt?: number;
  deathCause?: string;
  inventory?: { hasFood: boolean; foodCooked: boolean; raw?: number; dishes?: number };
  romance?: unknown;
  /** Coppie: attesa dopo essersi lasciati e sonno nello stesso letto (vedi couples.ts). */
  coupleCooldownUntil?: number;
  sleptTogetherSince?: number;
  relations?: unknown;
  personality?: unknown;
  welcome?: unknown;
  quests?: unknown;
  today?: unknown;
  placesSeen?: unknown;
  workDay?: unknown;
  /** ora dell'ultimo messaggio della chat letto (su qualsiasi dispositivo) */
  chatReadT?: unknown;
  /** quando ha accettato le condizioni la prima volta (terms.ts) */
  termsAt?: unknown;
  /** quando ha confermato di avere almeno 18 anni (terms.ts) */
  adultAt?: unknown;
  /** quando ha letto l'avviso della chat (terms.ts) */
  chatNoticeAt?: unknown;
  weed?: unknown;
  pill?: unknown;
  dealers?: unknown;
  flu?: unknown;
  daily?: unknown;
  pets?: unknown;
  /** cestino della stanza: posto scelto, ultimo svuotamento, prove trovate (trash-rules.ts) */
  trash?: unknown;
  /** preferenze del giocatore, uguali su ogni dispositivo (prefs-rules.ts) */
  prefs?: unknown;
  /** il mondo (condominio) in cui abita; manca nei salvataggi di prima: è il mondo di sempre */
  worldId?: unknown;
  /** Stanza (indice globale) e cuscino del letto in cui si sta dormendo. */
  sleepRoom?: unknown;
  bedSlot?: unknown;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const object = isRecord;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const safeKey = (key: string) =>
  key.length <= 100 && !['__proto__', 'constructor', 'prototype'].includes(key);
function recordOf(value: unknown, validate: (entry: unknown) => boolean): boolean {
  return (
    object(value) &&
    Object.keys(value).length <= 5000 &&
    Object.entries(value).every(([key, entry]) => safeKey(key) && validate(entry))
  );
}
const optionalFields = (
  value: Record<string, unknown>,
  fields: string[],
  validate: (entry: unknown) => boolean,
) => fields.every((key) => value[key] === undefined || validate(value[key]));
/** Un salvataggio letto e controllato: i campi possono mancare, savedAt c'è sempre. */
export type ValidatedSave = Partial<SaveV8> & { savedAt: number };

/** Validate untrusted JSON before allowing it into typed character state. Keep v8 extensions. */
export function decodeSaveV8(value: unknown): ValidatedSave | null {
  if (
    !object(value) ||
    !nonnegative(value.savedAt) ||
    (value.v !== undefined &&
      (!Number.isInteger(value.v) || (value.v as number) < 1 || (value.v as number) > 8))
  )
    return null;
  if (
    !optionalFields(
      value,
      ['healthLevel', 'sleepLevel', 'hungerLevel', 'hygieneLevel', 'happinessLevel'],
      (entry) => finite(entry) && entry >= 0 && entry <= 100,
    )
  )
    return null;
  if (
    !optionalFields(
      value,
      [
        'moneyLevel',
        'gameMinutes',
        'missionIndex',
        'missionSet',
        'drugStock',
        'stonedUntil',
        'jointReadyAt',
        'coffeeAt',
        'toiletAt',
        'bornAt',
        'deadAt',
        'sleepGainedSinceLastHealthBoost',
        'needsZeroSince',
      ],
      nonnegative,
    )
  )
    return null;
  if (
    !optionalFields(value, ['vaultOnly', 'sleeping', 'dead'], (entry) => typeof entry === 'boolean')
  )
    return null;
  if (
    !optionalFields(
      value,
      ['nick', 'body', 'epitaph', 'currentOutfitColor', 'deathCause'],
      (entry) => typeof entry === 'string' && entry.length <= 200,
    )
  )
    return null;
  if (
    value.activeJobKey !== undefined &&
    value.activeJobKey !== null &&
    (typeof value.activeJobKey !== 'string' || value.activeJobKey.length > 100)
  )
    return null;
  for (const key of ['ownedItems', 'ownedFurniture', 'equippedAcc'])
    if (value[key] !== undefined && !recordOf(value[key], (entry) => typeof entry === 'boolean'))
      return null;
  for (const key of ['jobExperience', 'stats'])
    if (value[key] !== undefined && !recordOf(value[key], nonnegative)) return null;
  if (
    value.equipped !== undefined &&
    !recordOf(
      value.equipped,
      (entry) => entry === null || (typeof entry === 'string' && entry.length <= 100),
    )
  )
    return null;
  if (
    value.furniturePos !== undefined &&
    !recordOf(
      value.furniturePos,
      (position) =>
        object(position) &&
        finite(position.x) &&
        finite(position.y) &&
        Math.abs(position.x) <= 1000 &&
        Math.abs(position.y) <= 1000,
    )
  )
    return null;
  if (
    value.invest !== undefined &&
    !recordOf(
      value.invest,
      (investment) =>
        object(investment) && nonnegative(investment.units) && nonnegative(investment.cost),
    )
  )
    return null;
  if (
    value.inventory !== undefined &&
    (!object(value.inventory) ||
      !optionalFields(
        value.inventory,
        ['hasFood', 'foodCooked'],
        (entry) => typeof entry === 'boolean',
      ))
  )
    return null;
  if (
    value.drug !== undefined &&
    (!object(value.drug) ||
      !['doses', 'lastDose', 'endAt', 'dAtDose', 'crisisAt'].every((key) =>
        nonnegative(value.drug && (value.drug as Record<string, unknown>)[key]),
      ))
  )
    return null;
  return value as ValidatedSave;
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
    if (!decodeSaveV8(save)) return false;
    storage.setItem(target, JSON.stringify(save));
    storage.setItem(prefix + 'sims_player_nick', save.nick);
    return true;
  } catch {
    return false;
  }
}
