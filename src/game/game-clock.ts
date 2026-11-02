// Orologio del gioco allineato all'ora reale del dispositivo (senza dipendenze dal browser).

/** Il contatore dei minuti vissuti partiva dalle 8:00 del giorno di nascita del personaggio. */
export const START_MINUTES = 8 * 60;

/** Ora reale con i minuti come frazione (es. 18.5 = 18:30). */
export function realHour(now: Date): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

export function clockText(now: Date): string {
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

export const isNight = (hour: number) => hour >= 20 || hour < 6;

/** Giorni di calendario fra due date (conta le mezzanotti, anche con l'ora legale). */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * "Giorno N" del personaggio: parte da 1 il giorno in cui è nato e aumenta a ogni mezzanotte reale.
 * Si ricava dai minuti vissuti, così i personaggi esistenti non ricominciano dal giorno 1.
 */
export function dayNumber(gameMinutes: number, now: Date): number {
  const lived = Math.max(0, gameMinutes - START_MINUTES) * 60_000;
  const birth = new Date(now.getTime() - lived);
  return calendarDaysBetween(birth, now) + 1;
}
