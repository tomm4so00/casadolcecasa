// Vantaggi dei mobili per fascia: un'unica fonte per simulazione, relax e messaggi al giocatore.
import { type FurnitureTier, tierOf } from './furniture-tiers.js';

/** Velocità di recupero del sonno dormendo nel letto. */
const BED_SLEEP_SPEED: Record<FurnitureTier, number> = { std: 1, premium: 1.25, lux: 1.5 };
/** Quanto velocemente cala la felicità con la pianta in stanza (1 = senza pianta). */
const PLANT_HAPPINESS_DECAY: Record<FurnitureTier, number> = {
  std: 0.6,
  premium: 0.45,
  lux: 0.3,
};
/** Tempo minimo fra una pausa e l'altra su divano o TV (la pausa è in comune fra i due). */
export const RELAX_COOLDOWN_MS = 10 * 60_000;
/** Felicità guadagnata con una pausa su divano o davanti alla TV. */
export const RELAX_GAIN: Record<'sofa' | 'tv', Record<FurnitureTier, number>> = {
  sofa: { std: 5, premium: 7, lux: 10 },
  tv: { std: 8, premium: 10, lux: 12 },
};
/** Raggio della luce della lampada. */
export const LAMP_LIGHT: Record<FurnitureTier, number> = { std: 150, premium: 170, lux: 190 };

/** Fascia migliore posseduta in una categoria (null se non se ne possiede nessuna). */
function bestOwnedTier(owned: Record<string, boolean>, category: string): FurnitureTier | null {
  if (owned[`${category}_lux`]) return 'lux';
  if (owned[`${category}_pre`]) return 'premium';
  if (owned[`${category}_std`]) return 'std';
  return null;
}

export function bedSleepSpeed(owned: Record<string, boolean>): number {
  return BED_SLEEP_SPEED[bestOwnedTier(owned, 'bed') ?? 'std'];
}
export function plantHappinessDecay(owned: Record<string, boolean>): number {
  const tier = bestOwnedTier(owned, 'plant');
  return tier ? PLANT_HAPPINESS_DECAY[tier] : 1;
}

const percent = (factor: number) => Math.round(Math.abs(1 - factor) * 100);
const LOOKS_ONLY = ' Rispetto al modello standard cambia solo l’aspetto, più elegante.';

/** Spiega al giocatore cosa fa il mobile appena comprato. */
export function furnitureBenefit(def: { id: string; category: string }): string {
  const tier = tierOf(def as { id: string; category: string; propKey: string });
  switch (def.category) {
    case 'bed':
      return tier === 'std'
        ? '🛏️ Dormi nel letto per recuperare il sonno.'
        : `🛏️ Dormendo recuperi il sonno il ${percent(BED_SLEEP_SPEED[tier])}% più in fretta.`;
    case 'plant':
      return `🌿 Con la pianta in stanza la felicità cala il ${percent(PLANT_HAPPINESS_DECAY[tier])}% più lentamente.`;
    case 'sofa':
      return `🛋️ Una pausa sul divano dà +${RELAX_GAIN.sofa[tier]}% di felicità (una ogni ${RELAX_COOLDOWN_MS / 60_000} minuti).`;
    case 'tv':
      return `📺 Guardare la TV dà +${RELAX_GAIN.tv[tier]}% di felicità (ma −3% di sonno), una volta ogni ${RELAX_COOLDOWN_MS / 60_000} minuti.`;
    case 'lamp':
      return tier === 'std'
        ? '💡 Illumina la stanza.'
        : `💡 Illumina una zona più ampia (+${Math.round((LAMP_LIGHT[tier] / LAMP_LIGHT.std - 1) * 100)}% rispetto alla standard).`;
    case 'wardrobe':
      return '🚪 Dall’armadio scegli i vestiti da indossare.' + (tier === 'std' ? '' : LOOKS_ONLY);
    case 'nightstand':
      return '🕐 Ha una sveglia con l’ora del gioco.' + (tier === 'std' ? '' : LOOKS_ONLY);
    case 'desk':
      return (
        '💻 Dal PC compri vestiti e mobili online e fai investimenti.' +
        (tier === 'std' ? '' : LOOKS_ONLY)
      );
    case 'safe':
      return '🔐 Livello 2: la combinazione può usare le cifre da 1 a 5 (125 combinazioni invece di 64), così è molto più difficile da indovinare.';
    default:
      return '';
  }
}
