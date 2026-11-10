// Regole del commissariato (senza dipendenze dal browser, così sono testabili): il numero che
// lo sportello sta servendo, il biglietto dell'eliminacode e il registro dei furti senza colpevole.
import { type GossipEntry, timeAgo } from './gossip-rules.js';

/** Ogni quanti minuti lo sportello chiama il numero dopo. */
export const SERVE_MINUTES = 6;
/** I numeri dell'eliminacode vanno da 1 a 99, poi si ricomincia. */
const TICKETS = 99;

/** Il numero chiamato allo sportello: cambia ogni SERVE_MINUTES dall'inizio del giorno. */
export function servingNumber(now: number): number {
  const d = new Date(now);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return 1 + (Math.floor(minutes / SERVE_MINUTES) % TICKETS);
}

/** Il biglietto preso adesso: qualche persona prima di te (da 2 a 7), poi si torna a 1. */
export function ticketNumber(now: number, seed: number): number {
  const ahead = 2 + (Math.abs(Math.floor(seed)) % 6);
  return ((servingNumber(now) - 1 + ahead) % TICKETS) + 1;
}

/** "A007": come lo mostra il tabellone. */
export const ticketLabel = (n: number): string => 'A' + String(n).padStart(3, '0');

/** Quanti numeri mancano prima di essere chiamati (il giro ricomincia dopo il 99). */
export function peopleAhead(ticket: number, serving: number): number {
  return (ticket - serving + TICKETS) % TICKETS;
}

/** I fatti della bacheca che parlano di un furto con il ladro rimasto sconosciuto. */
const UNSOLVED = /svuotata da un ladro misterioso/;

/** Il registro dei furti senza colpevole: i più recenti per primi, al massimo `max`. */
export function unsolvedThefts(entries: readonly GossipEntry[], now: number, max = 5): string[] {
  return entries
    .filter((e) => UNSOLVED.test(e.text))
    .sort((a, b) => b.t - a.t)
    .slice(0, max)
    .map((e) => `• ${e.text.replace(/ 🕵️/, '')}\n   ${timeAgo(e.t, now)} · colpevole: ignoto`);
}
