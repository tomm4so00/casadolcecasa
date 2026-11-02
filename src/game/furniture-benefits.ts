// Vantaggi dei mobili per fascia: un'unica fonte per simulazione, relax e messaggi al giocatore.
import { type FurnitureTier, tierOf } from './furniture-tiers.js';

/** Velocità di recupero del sonno dormendo nel letto. */
export const BED_SLEEP_SPEED: Record<FurnitureTier, number> = { std: 1, premium: 1.25, lux: 1.5 };
/** Quanto velocemente cala la felicità con la pianta in stanza (1 = senza pianta). */
export const PLANT_HAPPINESS_DECAY: Record<FurnitureTier, number> = {
  std: 0.5,
  premium: 0.35,
  lux: 0.2,
};
/** Felicità guadagnata con una pausa su divano o davanti alla TV. */
export const RELAX_GAIN: Record<'sofa' | 'tv', Record<FurnitureTier, number>> = {
  sofa: { std: 10, premium: 15, lux: 20 },
  tv: { std: 15, premium: 20, lux: 25 },
};
/** Raggio della luce della lampada. */
export const LAMP_LIGHT: Record<FurnitureTier, number> = { std: 150, premium: 170, lux: 190 };

/** Fascia migliore posseduta in una categoria (null se non se ne possiede nessuna). */
export function bestOwnedTier(
  owned: Record<string, boolean>,
  category: string,
): FurnitureTier | null {
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
      return `🛋️ Una pausa sul divano dà +${RELAX_GAIN.sofa[tier]}% di felicità (una ogni 30 secondi).`;
    case 'tv':
      return `📺 Guardare la TV dà +${RELAX_GAIN.tv[tier]}% di felicità (ma −3% di sonno).`;
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
    default:
      return '';
  }
}
