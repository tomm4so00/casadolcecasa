// Il motivo della morte, da mostrare sulla schermata finale. Si calcola nel momento in cui la
// salute arriva a zero (dal gioco o dalla manutenzione sul server) e si salva con il personaggio,
// perché dopo i bisogni non dicono più niente: il server segna i morti senza riscriverli.
// Niente browser qui: il server importa questo file.
import { ABANDON_DAYS } from './autoplay-rules.js';
import type { CharacterState } from './models.js';
import { fluDamage } from './flu-rules.js';

/**
 * Quello che toglie salute (vedi simulation.ts e space-helmet.ts), più l'abbandono. `away` non è
 * un motivo: dice che è morto a gioco chiuso.
 */
export const DEATH_CAUSES = [
  'air',
  'hunger',
  'sleep',
  'hygiene',
  'sadness',
  'drug',
  'flu',
  'abandoned',
  'away',
] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

/** Sotto questa felicità la salute cala (come in simulation.ts). */
const SAD_HAPPINESS = 10;

type Needs = Pick<
  CharacterState,
  'hungerLevel' | 'sleepLevel' | 'hygieneLevel' | 'happinessLevel' | 'drug' | 'flu'
>;

/** Cosa stava togliendo salute nel momento `at` (ms) in cui è arrivata a zero. */
export function deathCauses(state: Needs, at: number, onMoon = false): DeathCause[] {
  const out: DeathCause[] = [];
  if (onMoon) out.push('air');
  if (state.hungerLevel <= 1e-6) out.push('hunger');
  if (state.sleepLevel <= 1e-6) out.push('sleep');
  if (state.hygieneLevel <= 1e-6) out.push('hygiene');
  if (state.happinessLevel <= SAD_HAPPINESS + 1e-6) out.push('sadness');
  if (state.drug?.active && at < state.drug.endAt) out.push('drug');
  if (state.flu && fluDamage(state.flu, at - 60000, at) > 0) out.push('flu');
  return out;
}

/** Nel salvataggio: "hunger,sleep". */
export const encodeDeathCauses = (causes: readonly DeathCause[]): string => causes.join(',');

/** Dal salvataggio: solo i motivi conosciuti, senza doppioni. */
export function decodeDeathCauses(value: unknown): DeathCause[] {
  if (typeof value !== 'string') return [];
  const parts = new Set(value.split(','));
  return DEATH_CAUSES.filter((c) => parts.has(c));
}

const NAMES: Record<Exclude<DeathCause, 'away'>, string> = {
  air: 'mancanza d’aria sulla luna, senza casco spaziale',
  hunger: 'fame',
  sleep: 'stanchezza',
  hygiene: 'sporcizia',
  sadness: 'tristezza',
  drug: 'dipendenza dalla droga',
  flu: 'influenza',
  abandoned: `abbandono: nessuno se n’è preso cura per più di ${ABANDON_DAYS} giorni`,
};

const list = (items: string[]): string =>
  items.length <= 1
    ? items.join('')
    : items.slice(0, -1).join(', ') + ' e ' + items[items.length - 1];

/**
 * La frase per la schermata di morte. Senza motivi conosciuti (morti di prima che si salvassero)
 * resta la frase generica.
 */
export function deathCauseText(all: readonly DeathCause[]): string {
  const causes = all.filter((c): c is Exclude<DeathCause, 'away'> => c !== 'away');
  if (!causes.length) return 'La salute è arrivata a zero: il personaggio non ce l’ha fatta.';
  let text = 'Causa della morte: ' + list(causes.map((c) => NAMES[c])) + '.';
  const needs = causes.filter((c) => c === 'hunger' || c === 'sleep' || c === 'hygiene');
  if (needs.length)
    text +=
      ' Con ' +
      list(needs.map((c) => ({ hunger: 'la fame', sleep: 'il sonno', hygiene: 'l’igiene' })[c]!)) +
      ' a zero la salute scende di circa 2 punti all’ora' +
      (needs.length === 3 ? '; dopo 24 ore con tutti e tre a zero non ce la si fa più.' : '.');
  if (all.includes('away') && !causes.includes('abandoned'))
    text += ' È successo a gioco chiuso: il tempo passa anche quando non giochi.';
  return text;
}
