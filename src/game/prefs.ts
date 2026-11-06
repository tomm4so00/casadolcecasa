// Le preferenze del giocatore dentro il salvataggio (vedi prefs-rules.ts): si raccolgono a ogni
// salvataggio e, al caricamento, si rimettono dove il gioco le cerca (memoria del dispositivo e
// stato del gioco). Vince il salvataggio più recente, come per il resto del personaggio.
import { type Prefs, decodePrefs } from './prefs-rules.js';
import { game } from './context.js';
import { browser } from './runtime.js';

const key = (name: string) => game.session.LS_PREFIX + name;
/** L'elenco dei giocatori aperto o chiuso è salvato senza prefisso (vedi players-hud.ts). */
const HUD_FULL = 'sims_hud_full';

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    // memoria del browser non disponibile: la preferenza vale solo finché il gioco resta aperto
  }
}

/** Le preferenze di adesso, da mettere nel salvataggio. */
export function collectPrefs(): Prefs {
  const prefs: Prefs = {
    sound: game.soundOn !== false,
    music: game.musicOn !== false,
    notify: game.notifyOn === true,
    hudFull: read(HUD_FULL) === '1',
  };
  const gossip = Number(read(key('sims_gossip_read')));
  if (gossip > 0) prefs.gossipRead = gossip;
  const seen = read(key('sims_market_event_seen'));
  if (seen) prefs.eventSeen = seen;
  const spot = read(key('sims_last_spot'));
  if (spot) prefs.lastSpot = spot;
  return decodePrefs(prefs);
}

/** Al caricamento: le preferenze del salvataggio tornano attive anche su questo dispositivo. */
export function applyPrefs(value: unknown): void {
  const p = decodePrefs(value);
  if (p.sound !== undefined) {
    game.soundOn = p.sound;
    write(key('sims_sound'), p.sound ? 'on' : 'off');
  }
  if (p.music !== undefined) {
    game.musicOn = p.music;
    write(key('sims_music'), p.music ? 'on' : 'off');
  }
  if (p.notify === false) {
    game.notifyOn = false;
    write(key('sims_notify'), 'off');
  } else if (p.notify === true) {
    // il permesso di mostrare notifiche lo dà ogni telefono per sé: senza, restano spente
    const granted =
      typeof browser.Notification !== 'undefined' && browser.Notification.permission === 'granted';
    game.notifyOn = granted;
    write(key('sims_notify'), granted ? 'on' : 'off');
  }
  if (p.hudFull !== undefined) write(HUD_FULL, p.hudFull ? '1' : '0');
  if (p.gossipRead !== undefined) {
    // mai indietro: se qui si era già letto di più, resta così
    const here = Number(read(key('sims_gossip_read'))) || 0;
    write(key('sims_gossip_read'), String(Math.max(here, p.gossipRead)));
  }
  if (p.eventSeen !== undefined) write(key('sims_market_event_seen'), p.eventSeen);
  if (p.lastSpot !== undefined) write(key('sims_last_spot'), p.lastSpot);
}
