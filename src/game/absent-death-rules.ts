// Quando muore chi non sta giocando: dal suo ultimo salvataggio online si rifà lo stesso calcolo
// dei bisogni che il gioco fa al rientro (simulation.ts) e si trova il momento in cui la salute
// arriva a zero. Lo usa la manutenzione sul server, così il personaggio muore in quel momento e
// non quando il giocatore riapre il gioco; il gioco lo usa per la data sulla lapide.
// Niente browser qui: il server importa questo file.
import { type NeedsRules, advanceNeeds } from './simulation.js';
import type { CharacterState } from './models.js';
import { decodeFlu } from './flu-rules.js';
import { decodePillTimers } from './pill-rules.js';
import { type CryoPass, awakeSpans } from '../../shared/cryo-rules.js';
import { type DeathCause, deathCauses } from './death-cause-rules.js';
import { ABSENCE_SLOWDOWN, BED_THRESHOLD } from './autoplay-rules.js';

/**
 * Chi è via vive da solo (autoplay-rules.ts): sonno, fame, igiene e felicità calano
 * ABSENCE_SLOWDOWN volte più piano, così da pieni durano circa una settimana. La salute no.
 */
export function absenceRules(rules: NeedsRules): NeedsRules {
  const k = ABSENCE_SLOWDOWN;
  return {
    ...rules,
    sleepDepletion: rules.sleepDepletion * k,
    hungerAwake: rules.hungerAwake * k,
    hungerSleeping: rules.hungerSleeping * k,
    hygieneDepletion: rules.hygieneDepletion * k,
    happinessDepletion: rules.happinessDepletion * k,
  };
}

/** Il parametro più basso: sotto BED_THRESHOLD il personaggio torna a letto. */
export const lowestNeed = (s: CharacterState): number =>
  Math.min(s.sleepLevel, s.hungerLevel, s.hygieneLevel, s.happinessLevel, s.healthLevel);

/** Ogni quanto si guarda se è ora di tornare a letto (uguale ovunque: gioco e server). */
const BED_CHECK_MS = 15 * 60_000;

/**
 * I bisogni durante un'assenza da `from` a `to`, saltando il tempo passato in criogenesi:
 * si simulano solo i tratti fuori dalla capsula, ognuno alla sua ora (febbre e droghe la usano).
 * Il letto in cui torna sotto la soglia si vede soltanto: lì i parametri continuano a calare
 * piano (dormendo il sonno risalirebbe, e chi è via non morirebbe mai).
 */
export function advanceAbsence(
  state: CharacterState,
  from: number,
  to: number,
  rules: NeedsRules,
  cryo: CryoPass | null = null,
): void {
  const slow = absenceRules(rules);
  for (const [start, end] of awakeSpans(cryo, from, to))
    advanceNeeds(state, (end - start) / 1000, end, slow);
}

/**
 * Se il giocatore uscisse adesso, quando il suo personaggio tornerebbe a letto (0: è già a letto
 * o non succede entro 30 giorni). La pubblica nella presenza: gli altri lo vedono andare a letto.
 */
export function forecastBedAt(state: CharacterState, now: number, rules: NeedsRules): number {
  if (state.isSleeping) return now;
  const s = structuredClone(state);
  const slow = absenceRules(rules);
  for (let t = now; t < now + 30 * 86400000; t += BED_CHECK_MS) {
    if (lowestNeed(s) < BED_THRESHOLD) return t;
    if (s.healthLevel <= 0) return t;
    advanceNeeds(s, BED_CHECK_MS / 1000, t + BED_CHECK_MS, slow);
  }
  return 0;
}

/** Velocità dei bisogni (secondi perché una barra passi da 100 a 0, e simili). */
export const NEEDS_RULES: NeedsRules = {
  sleepDepletion: 86400,
  sleepRecovery: 5400,
  hungerAwake: 86400,
  hungerSleeping: 172800,
  hygieneDepletion: 86400,
  happinessDepletion: 172800,
  healthDamage: 172800,
  gameMinutesPerSecond: 1 / 60,
  drugBase: 0.35,
  drugPeak: 2.5,
  drugHighHours: 6,
  drugTaperHours: 18,
};

/**
 * Chi ha salvato o si è fatto vedere da meno di così potrebbe stare ancora giocando (il gioco
 * salva online ogni 15 secondi): ci pensa il suo gioco.
 */
export const ACTIVE_MARGIN_MS = 10 * 60000;

type Save = Record<string, unknown>;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** I bisogni del salvataggio, letti come fa applySave (i valori mancanti non uccidono nessuno). */
export function needsStateFromSave(
  save: Save,
  ownedFurniture: Record<string, boolean> = {},
): CharacterState {
  const drug = (save.drug && typeof save.drug === 'object' ? save.drug : {}) as Save;
  const active = num(drug.endAt, 0) > 0;
  return {
    healthLevel: num(save.healthLevel, 100),
    sleepLevel: num(save.sleepLevel, 100),
    hungerLevel: num(save.hungerLevel, 100),
    hygieneLevel: num(save.hygieneLevel, 100),
    happinessLevel: num(save.happinessLevel, 100),
    isSleeping: save.sleeping === true,
    sleepGainedSinceLastHealthBoost: Math.min(
      19.999999,
      num(save.sleepGainedSinceLastHealthBoost, 0),
    ),
    ownedFurniture,
    drug: {
      active,
      doses: active ? num(drug.doses, 1) : 0,
      lastDose: active ? num(drug.lastDose, 0) : 0,
      endAt: active ? num(drug.endAt, 0) : 0,
      dAtDose: active ? num(drug.dAtDose, 0) : 0,
      crisisAt: active ? num(drug.crisisAt, 0) : 0,
    },
    flu: decodeFlu(save.flu),
    pill: decodePillTimers(save.pill),
    gameMinutes: num(save.gameMinutes, 8 * 60),
    needsZeroSince: num(save.needsZeroSince, 0),
    isDead: false,
  } as unknown as CharacterState;
}

/** Salute e minuti di gioco dopo essere stati via fino a `until`. */
function after(
  save: Save,
  furniture: Record<string, boolean>,
  until: number,
  rules: NeedsRules,
  cryo: CryoPass | null,
) {
  const state = needsStateFromSave(save, furniture);
  advanceAbsence(state, num(save.savedAt, 0), until, rules, cryo);
  return state;
}

/**
 * Se il personaggio è morto mentre era via, il momento (ms) e i minuti di gioco a quel punto;
 * altrimenti null. Il momento si cerca dimezzando l'intervallo: precisione di pochi secondi.
 * Il tempo passato in criogenesi (`cryo`) non conta. `causes`: cosa ha tolto la salute.
 */
export function absentDeath(
  save: Save,
  ownedFurniture: Record<string, boolean>,
  now: number,
  rules: NeedsRules = NEEDS_RULES,
  cryo: CryoPass | null = null,
): { deadAt: number; gameMinutes: number; causes: DeathCause[] } | null {
  const from = num(save.savedAt, 0);
  if (!from || now <= from || save.dead === true) return null;
  if (after(save, ownedFurniture, now, rules, cryo).healthLevel > 0) return null;
  let lo = from,
    hi = now;
  while (hi - lo > 5000) {
    const mid = Math.floor((lo + hi) / 2);
    if (after(save, ownedFurniture, mid, rules, cryo).healthLevel > 0) lo = mid;
    else hi = mid;
  }
  // un istante prima di morire: cosa stava togliendo salute
  const end = after(save, ownedFurniture, hi, rules, cryo);
  return { deadAt: hi, gameMinutes: end.gameMinutes, causes: [...deathCauses(end, hi), 'away'] };
}
