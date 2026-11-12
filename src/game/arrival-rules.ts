// L'arrivo del giocatore nuovo (fase 2 del piano dei primi minuti), senza browser: i passi, quando
// si va avanti, dove punta la freccia e i testi del riquadro in basso. Si arriva in cortile con la
// valigia, si entra nel portone, si trova la propria stanza (con una lampada in regalo), si va in
// cucina; poi le prime due missioni di benvenuto (l'assaggio) si seguono dallo stesso riquadro.
import type { GuideDest } from './guide-rules.js';

export type ArrivalStep = 'keys' | 'door' | 'room' | 'gift' | 'cook' | 'done';
export const ARRIVAL_STEPS: ArrivalStep[] = ['keys', 'door', 'room', 'gift', 'cook', 'done'];

export const isArrivalStep = (v: unknown): v is ArrivalStep =>
  typeof v === 'string' && (ARRIVAL_STEPS as string[]).includes(v);

/** Le missioni di benvenuto che fanno parte dell'arrivo: cucinare e portare l'assaggio. */
export const ARRIVAL_MISSIONS = 2;

export interface ArrivalView {
  env: string;
  /** È nel salone, cucina o bagno del proprio appartamento. */
  inMyApt: boolean;
  /** È nella propria stanza. */
  inOwnRoom: boolean;
  /** La missione di benvenuto a cui si è arrivati (0 = cucinare, 1 = portare, 2 = finite). */
  mission: number;
}

/** Il passo dopo questo, guardando dove si è; 'keys' aspetta il tocco su "Andiamo!". */
export function nextArrival(step: ArrivalStep, v: ArrivalView): ArrivalStep {
  switch (step) {
    case 'door':
      return v.env === 'SALOON' && v.inMyApt ? 'room' : step;
    case 'room':
      return v.inOwnRoom ? 'gift' : step;
    case 'gift':
      return v.env === 'KITCHEN' && v.inMyApt ? 'cook' : step;
    case 'cook':
      return v.mission >= ARRIVAL_MISSIONS ? 'done' : step;
    default:
      return step;
  }
}

/** Dove punta la freccia nei passi dell'arrivo (nella cucina e dopo, decidono le missioni). */
export function arrivalDest(step: ArrivalStep, apt: number, room: number | null): GuideDest | null {
  switch (step) {
    case 'keys':
    case 'door':
      return { env: 'SALOON', apt };
    case 'room':
      return room === null ? null : { env: 'PLAYER_ROOM', roomIdx: room, key: 'bed' };
    case 'gift':
      return { env: 'KITCHEN', apt, key: 'fridge' };
    default:
      return null;
  }
}

export interface Coach {
  /** "PASSO 1 DI 5" (vuoto nel primo riquadro, quello con il titolo). */
  label: string;
  title?: string;
  text: string;
  /** Il pulsante per andare avanti (solo all'inizio). */
  button?: string;
}

/**
 * Il riquadro in basso per il passo. `hint` è l'istruzione della missione di benvenuto in corso
 * (welcome-rules.ts), usata in cucina e per portare l'assaggio.
 */
export function coachFor(
  step: ArrivalStep,
  c: { nick: string; apt: number; room: number; mission: number; hint: string },
): Coach | null {
  const aptName = `Appartamento ${c.apt + 1}`;
  switch (step) {
    case 'keys':
      return {
        label: '',
        title: `🔑 Benvenuto a casa, ${c.nick}!`,
        text: `Da oggi abiti qui: ${aptName} · Stanza ${c.room}. Ecco le chiavi! La freccia gialla ti porta al portone.`,
        button: 'Andiamo! 🏠',
      };
    case 'door':
      return {
        label: 'PASSO 1 DI 5',
        text: `🚪 Il tuo portone è quello dell’${aptName}: segui la freccia gialla.`,
      };
    case 'room':
      return {
        label: 'PASSO 2 DI 5',
        text: `🏠 La porta numero ${c.room} è la tua stanza: entra a dare un’occhiata.`,
      };
    case 'gift':
      return {
        label: 'PASSO 3 DI 5',
        text: '🛠️ Ti piace dove sta? Con «Arreda» puoi spostarla. Poi si va in cucina: segui la freccia.',
      };
    case 'cook':
      if (c.mission === 0)
        return {
          label: 'PASSO 4 DI 5',
          // finché non ha il cibo, l'usanza; poi l'istruzione della missione (fornello)
          text: c.hint.startsWith('🧊')
            ? '🍝 Da noi si usa così: chi arriva cucina un assaggio per i vicini. Apri il frigo e prendi il cibo (5 Đ).'
            : c.hint,
        };
      return {
        label: 'PASSO 5 DI 5',
        text:
          c.hint ||
          '🚪 Ora porta l’assaggio a un vicino: la freccia ti indica a chi. Ti ringrazierà!',
      };
    default:
      return null;
  }
}

/** I parametri che, sotto questa soglia, fanno comparire la spiegazione una volta. */
export const LOW_NEED = 30;
export const LOW_NEED_TIP =
  '💡 Fame, sonno, igiene e felicità calano anche a gioco chiuso: se si svuotano scende la Salute.';

export const lowNeed = (needs: number[]): boolean => needs.some((n) => n < LOW_NEED);
