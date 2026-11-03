// Coltivazione in camera: piante comprate al grow shop, raccolto dopo 5 giorni, barattolo d'erba
// da fumare o da vendere agli altri giocatori (senza dipendenze dal browser, così è testabile).

export type StrainId = 'lemon' | 'amnesia' | 'purple';

export const STRAINS: Record<
  StrainId,
  { name: string; price: number; leaf: string; bud: string; hair: string }
> = {
  lemon: { name: 'Lemon Haze', price: 120, leaf: '#7cb342', bud: '#d4e157', hair: '#ffb74d' },
  amnesia: { name: 'Amnesia', price: 150, leaf: '#388e3c', bud: '#a5d6a7', hair: '#ffffff' },
  purple: { name: 'Purple Haze', price: 180, leaf: '#2e7d32', bud: '#8e24aa', hair: '#ff8a65' },
};
export const STRAIN_IDS = Object.keys(STRAINS) as StrainId[];
export const isStrain = (v: unknown): v is StrainId => typeof v === 'string' && v in STRAINS;

/** Giorni (reali) prima del raccolto. */
export const GROW_DAYS = 5;
export const GROW_MS = GROW_DAYS * 24 * 3600 * 1000;
/** Grammi che una pianta mette nel barattolo. */
export const HARVEST_GRAMS = 100;
/** Ogni canna usa 1 grammo, alza la felicità del 10% e si vende a 5 €. */
export const JOINT_GRAMS = 1;
export const JOINT_HAPPY = 10;
export const JOINT_PRICE = 5;

export interface WeedState {
  /** Pianta che cresce in vaso (assente se il vaso è vuoto). */
  strain?: StrainId;
  plantedAt?: number;
  /** Erba nel barattolo e varietà dell'ultimo raccolto. */
  grams: number;
  jarStrain?: StrainId;
}

export const emptyWeed = (): WeedState => ({ grams: 0 });

/** Quanto è cresciuta la pianta, da 0 (appena piantata) a 1 (pronta da raccogliere). */
export function growProgress(plantedAt: number | undefined, now: number): number {
  if (!plantedAt) return 0;
  return Math.max(0, Math.min(1, (now - plantedAt) / GROW_MS));
}

/** Testo di quanto manca al raccolto, es. "3 giorni e 4 ore". */
export function growLeftText(plantedAt: number, now: number): string {
  const ms = Math.max(0, plantedAt + GROW_MS - now);
  const totalHours = Math.ceil(ms / 3600000);
  const days = Math.floor(totalHours / 24),
    hours = totalHours % 24;
  if (days <= 0) return `${hours} ${hours === 1 ? 'ora' : 'ore'}`;
  return `${days} ${days === 1 ? 'giorno' : 'giorni'}${hours ? ` e ${hours} ${hours === 1 ? 'ora' : 'ore'}` : ''}`;
}

/** Spiega perché non si può comprare una pianta, oppure null. */
export function buyPlantError(state: WeedState, strain: StrainId, money: number): string | null {
  if (state.plantedAt)
    return "Hai già una pianta che cresce nella tua stanza: raccoglila prima di comprarne un'altra.";
  if (money < STRAINS[strain].price) return 'Non hai abbastanza soldi in cassaforte.';
  return null;
}

/** Raccolto: il vaso si svuota e il barattolo si riempie. null se la pianta non è pronta. */
export function harvest(state: WeedState, now: number): WeedState | null {
  if (!state.plantedAt || !state.strain || growProgress(state.plantedAt, now) < 1) return null;
  return { grams: state.grams + HARVEST_GRAMS, jarStrain: state.strain };
}

/** Toglie una canna dal barattolo; null se è vuoto. */
export function takeJoint(state: WeedState): WeedState | null {
  if (state.grams < JOINT_GRAMS) return null;
  const grams = state.grams - JOINT_GRAMS;
  return { ...state, grams, ...(grams > 0 ? {} : { jarStrain: undefined }) };
}

/** Legge lo stato dal salvataggio scartando i valori non validi. */
export function decodeWeed(value: unknown): WeedState {
  const out = emptyWeed();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  if (isStrain(v.strain) && typeof v.plantedAt === 'number' && v.plantedAt > 0) {
    out.strain = v.strain;
    out.plantedAt = v.plantedAt;
  }
  if (Number.isSafeInteger(v.grams) && (v.grams as number) > 0)
    out.grams = Math.min(100000, v.grams as number);
  if (out.grams > 0 && isStrain(v.jarStrain)) out.jarStrain = v.jarStrain;
  return out;
}
