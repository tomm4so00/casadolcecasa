// La pausa del gioco con la scheda nascosta (regole in dormancy-rules.ts).
//   Entrare in pausa: salvataggio confermato, poi niente più bisogni né salvataggi, poi
//   goOffline. Il server segna da solo il giocatore "offline" (onDisconnect della presenza):
//   per gli altri è uscito e il personaggio va in autoplay.
//   Al ritorno: se il personaggio non è stato aperto altrove, si ricarica la pagina. Il caricamento
//   conta l'assenza dall'ultimo salvataggio (catchUpOffline) una volta sola, e le scritture
//   rimaste in coda durante la pausa spariscono con la pagina: nessun dato vecchio arriva al server.
// In modalità prova (?offline=1) non c'è nessuna connessione da liberare.
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { saveGame, withTimeout } from './saves.js';
import { currentCrack } from './crack.js';
import { blockThisSession, currentSessionId } from './accounts.js';
import { shouldGoDormant, wakeAction } from './dormancy-rules.js';

/** Ogni quanto si controlla (con la scheda nascosta i browser rallentano i timer a 1 al minuto). */
const CHECK_MS = 30_000;

let hiddenAt = 0;
let going = false;

export const isDormant = (): boolean => !!game.session.dormant;

/** Qualcosa che una ricarica interromperebbe: allora niente pausa. */
function busy(): boolean {
  return (
    !game.session.saveReady ||
    game.player.isDead ||
    !!game.activeShift ||
    !!currentCrack() ||
    !!game.rocketTrip
  );
}

/** Va in pausa adesso (la chiama check(); i test la chiamano direttamente). */
export async function goDormant(): Promise<void> {
  going = true;
  try {
    // l'ultimo salvataggio, confermato dal database: al rientro il tempo si conta da qui
    const saved = await withTimeout(saveGame(true), 10_000).catch(() => false);
    // non confermato, o il giocatore è tornato nel frattempo: si resta collegati e si riprova
    if (!saved || !document.hidden) return;
    game.session.dormant = true;
    game.session.db.goOffline?.();
  } finally {
    going = false;
  }
}

async function wake(): Promise<void> {
  game.session.db.goOnline?.();
  const mine = currentSessionId();
  const now = Date.now() + (game.session.serverOffset || 0);
  let stored: unknown = null;
  try {
    // Una transazione, non get(): il gioco ascolta già questo nodo e get() risponderebbe con la
    // copia di prima della pausa. La transazione invece si confronta col server e, se la copia
    // è vecchia, rigira col valore vero: `stored` è l'ultimo valore visto.
    const ref = game.session.db.ref('sims_sessions/' + game.session.myPlayerId);
    await withTimeout(
      ref.transaction((current: unknown) => {
        stored = current;
        const id = current && typeof current === 'object' ? (current as { id?: unknown }).id : null;
        return mine && id === mine ? { id: mine, expiresAt: now + 45_000 } : undefined;
      }),
      8000,
    );
  } catch {
    // senza risposta si ricarica lo stesso: il caricamento sa gestire la rete che manca
  }
  if (wakeAction(stored, mine, now) === 'taken') {
    // aperto su un altro dispositivo: il solito avviso, e la connessione resta libera
    game.session.db.goOffline?.();
    blockThisSession();
    return;
  }
  markWake();
  location.reload();
}

const WAKE_KEY = 'sims_wake_reload';

/** Prima di ricaricare: la schermata di accesso deve rientrare da sola (vedi wokeFromPause). */
function markWake(): void {
  try {
    sessionStorage.setItem(WAKE_KEY, '1');
  } catch {
    /* senza sessionStorage si rientra come sempre, con il pulsante */
  }
}

/** La pagina si è appena ricaricata tornando dalla pausa (vale una volta sola). */
export function wokeFromPause(): boolean {
  try {
    const woke = sessionStorage.getItem(WAKE_KEY) === '1';
    sessionStorage.removeItem(WAKE_KEY);
    return woke;
  } catch {
    return false;
  }
}

async function check(): Promise<void> {
  if (!hiddenAt || isDormant() || going) return;
  const ready = shouldGoDormant({
    hiddenFor: Date.now() - hiddenAt,
    sleeping: !!game.player.isSleeping,
    busy: busy(),
  });
  if (ready) await goDormant();
}

/** Si avvia entrando nel gioco. */
export function startDormancy(): void {
  if (game.session.OFFLINE) return;
  hiddenAt = document.hidden ? Date.now() : 0;
  lifetime.listen(document, 'visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    hiddenAt = 0;
    if (isDormant()) void wake();
  });
  lifetime.setInterval(() => void check(), CHECK_MS);
}
