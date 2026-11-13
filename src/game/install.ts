// Avviso per installare il gioco come app, sempre in basso finché non è installato: "Più tardi"
// lo riduce a una barretta che lo riapre. Su iPhone, iPad e Safari per Mac il browser non lo
// propone da sé: l'avviso spiega i passaggi. Su Android e sui computer con Chrome o Edge il browser
// avvisa quando si può installare (beforeinstallprompt): il gioco tiene da parte quell'evento e il
// pulsante "Installa" apre la finestra di installazione. Gli altri browser (Firefox…) hanno i
// passaggi a mano su Android, e sul computer il consiglio di aprire il gioco con Chrome o Edge.
// Agli ospiti chiede anche di salvare il personaggio: prima l'app e poi il salvataggio, ma prima
// il salvataggio dove l'app o l'altro browser non vedrebbero i dati (installStep).
import {
  installStep,
  installView,
  installWay,
  isAndroid,
  isAndroidTablet,
  isAppleMobile,
  isInAppBrowser,
  isIpad,
  isMacSafari,
} from './install-rules.js';
import { OLD_APP_KEY } from './move-rules.js';
import { browser, dom, lifetime } from './runtime.js';
import { isGuest, offerSave } from './guest.js';

/** Il vecchio "Più tardi" che rimandava di una settimana: si cancella. */
const OLD_LATER_KEY = 'sims_install_later';
const SHOW_AFTER_MS = 3000;
/** Chi ha ancora la vecchia app: se Chrome non propone di installare entro questo tempo, si spiega a mano. */
const OLD_APP_WAIT_MS = 6000;

/** L'evento di Chrome & co. (non è ancora nei tipi di TypeScript). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Che cosa dice l'avviso: `apple` iPhone/iPad, `mac` Safari per Mac, `prompt` pulsante
 * "Installa", `android` menu del browser Android, `chrome` icona nella barra degli indirizzi (dopo
 * un "Annulla" la finestra del browser non si riapre), `other` computer che non installa,
 * `oldapp` chi è arrivato dalla vecchia app (forse è ancora dentro di lei, dove non si installa),
 * `app` il gioco già aperto come app (resta solo da salvare, se si è ospiti).
 */
type BannerKind = 'apple' | 'mac' | 'prompt' | 'android' | 'chrome' | 'other' | 'oldapp' | 'app';

let installPrompt: InstallPromptEvent | null = null;
let mountedAt = 0;
/** Il contenuto dell'avviso; null finché non c'è niente da proporre. */
let shown: BannerKind | null = null;
/** "Più tardi": resta la barretta, per tutta la partita. */
let collapsed = false;

function appleMobile(): boolean {
  return isAppleMobile(navigator.userAgent, navigator.maxTouchPoints || 0);
}

function standalone(): boolean {
  return (
    browser.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone o iPad non ancora installato: serve per le notifiche a gioco chiuso. */
export function needsHomeScreen(): boolean {
  return appleMobile() && !standalone();
}

/** Arrivato col trasloco dalla vecchia app (move.ts) e la nuova non è ancora installata. */
function fromOldApp(): boolean {
  try {
    return localStorage.getItem(OLD_APP_KEY) === '1';
  } catch {
    return false;
  }
}

function forgetOldApp(): void {
  try {
    localStorage.removeItem(OLD_APP_KEY);
  } catch {
    // memoria bloccata: non c'era niente da togliere
  }
}

/**
 * Con l'app installata o col browser consigliato l'ospite ritrova i dati di qui? No su iPhone,
 * iPad e Mac (l'app ha una memoria sua), né quando bisogna cambiare browser (Instagram & co.,
 * Firefox sul computer). Sì con Chrome, Edge e Firefox per Android, e dalla vecchia app.
 */
function dataStays(kind: BannerKind): boolean {
  if (kind === 'apple' || kind === 'mac' || kind === 'other') return false;
  if (kind === 'android') return !isInAppBrowser(navigator.userAgent);
  return true;
}

function stepFor(kind: BannerKind | null): 'install' | 'save' | 'none' {
  return installStep({
    canInstall: kind !== null && kind !== 'app',
    standalone: kind === 'app',
    guest: isGuest(),
    dataStays: kind !== null && dataStays(kind),
  });
}

/** Avviso grande, barretta o niente; il contenuto si rifà ogni volta (l'ospite può salvare). */
function render(): void {
  const step = stepFor(shown);
  if (shown && step !== 'none') fill(shown, step === 'save');
  const view = installView(step, collapsed);
  dom('install-banner')?.classList.toggle('hidden', view !== 'banner');
  dom('install-bar')?.classList.toggle('hidden', view !== 'bar');
}

/** L'ospite (Gioca subito) entra dopo l'avviso: si ridisegna per chiedergli di salvare. */
export function refreshInstall(): void {
  render();
}

function deviceName(kind: BannerKind): string {
  const ua = navigator.userAgent;
  if (kind === 'apple') return isIpad(ua, navigator.maxTouchPoints || 0) ? 'iPad' : 'iPhone';
  if (kind === 'mac') return 'Mac';
  if (isAndroid(ua)) return isAndroidTablet(ua) ? 'tablet' : 'telefono';
  return 'computer';
}

/** La frase sotto al titolo, quando non ci sono i passaggi di iPhone o del Mac. */
function promptText(kind: BannerKind): string {
  const ua = navigator.userAgent;
  if (kind === 'prompt')
    return isAndroid(ua)
      ? "Un tocco e lo trovi nella schermata Home, come un'app: si apre a schermo intero."
      : 'Un clic e lo apri dal menu Start o dal Dock, in una finestra tutta sua.';
  if (kind === 'android')
    return isInAppBrowser(ua)
      ? 'Apri prima il gioco in Chrome: da questa app non si può installare.'
      : 'Nel menu del browser (⋮ o ≡) scegli «Installa» o «Aggiungi a schermata Home».';
  if (kind === 'oldapp')
    return isAndroid(ua)
      ? 'Non vedi «Installa»? Forse sei ancora nella vecchia app: tocca ⋮ in alto, scegli «Apri in Chrome» e poi «Installa app».'
      : "Apri il gioco nel browser e clicca l'icona «Installa» a destra nella barra degli indirizzi.";
  if (kind === 'chrome')
    return isAndroid(ua)
      ? 'Nel menu ⋮ del browser scegli «Installa app» o «Aggiungi a schermata Home».'
      : "Clicca l'icona «Installa» a destra nella barra degli indirizzi.";
  return 'Da questo browser non si può: apri il gioco con Chrome o Edge e premi «Installa».';
}

/** Perché salvare, detto a chi è ospite. */
function saveText(kind: BannerKind, what: string): string {
  if (kind === 'app')
    return 'Così non lo perdi se cambi telefono o cancelli i dati, e puoi scrivere in chat.';
  const where =
    kind === 'apple' || kind === 'mac'
      ? "l'app installata non vede i dati di Safari"
      : 'in un altro browser ripartiresti da zero';
  return `Così non lo perdi: ${where}. Dopo qui trovi come installare ${what}.`;
}

/** Il contenuto dell'avviso e della barretta: `save` chiede di salvare, sennò di installare. */
function fill(kind: BannerKind, save: boolean): void {
  if (!dom('install-banner')) return;
  const ua = navigator.userAgent;
  const steps = kind === 'apple' || kind === 'mac';
  dom('install-device').textContent = deviceName(kind);
  const what = fromOldApp() ? 'la nuova app' : 'il gioco';
  dom('install-what').textContent = what;
  dom('install-bar-text').textContent = save ? '💾 Salva il personaggio' : `📲 Installa ${what}`;
  dom('install-title').classList.toggle('hidden', save);
  dom('install-save-title').classList.toggle('hidden', !save);
  // Da Instagram & co. non si può installare: prima bisogna aprire il gioco in Safari.
  const inApp = kind === 'apple' && isInAppBrowser(ua);
  dom('install-steps').classList.toggle('hidden', save || kind !== 'apple' || inApp);
  dom('install-open-safari').classList.toggle('hidden', save || !inApp);
  dom('install-mac').classList.toggle('hidden', save || kind !== 'mac');
  const text = save ? saveText(kind, what) : steps ? '' : promptText(kind);
  dom('install-prompt-text').textContent = text;
  dom('install-prompt-text').classList.toggle('hidden', !text);
  dom('install-now').classList.toggle('hidden', kind !== 'prompt');
  dom('install-save').classList.toggle('hidden', !save);
}

/** Mostra l'avviso qualche secondo dopo l'apertura del gioco. */
function showBanner(kind: BannerKind): void {
  if (!dom('install-banner')) return;
  const wait = Math.max(0, SHOW_AFTER_MS - (Date.now() - mountedAt));
  lifetime.setTimeout(() => {
    shown = kind;
    render();
  }, wait);
}

/** All'avvio: sceglie l'avviso adatto al browser; con Chrome & co. aspetta che dica che si può. */
export function offerInstall(): void {
  mountedAt = Date.now();
  shown = null;
  collapsed = false;
  try {
    localStorage.removeItem(OLD_LATER_KEY);
  } catch {
    // Memoria del browser bloccata: non c'era niente da cancellare.
  }
  if (standalone()) {
    // questa è già la nuova app: la vecchia non conta più, resta da salvare (se si è ospiti)
    forgetOldApp();
    showBanner('app');
    return;
  }
  const ua = navigator.userAgent;
  const way = installWay({
    appleMobile: appleMobile(),
    macSafari: isMacSafari(ua, navigator.maxTouchPoints || 0),
    android: isAndroid(ua),
    promptSupported: 'onbeforeinstallprompt' in browser,
  });
  if (way !== 'wait') {
    showBanner(way);
    return;
  }
  lifetime.listen(browser, 'beforeinstallprompt', (event) => {
    // Al posto della barretta o dell'icona del browser, il nostro avviso con "Installa".
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    showBanner('prompt');
  });
  // Dalla vecchia app Chrome può non proporre niente (il gioco si è aperto dentro di lei):
  // l'avviso allora spiega come aprirlo nel browser.
  if (fromOldApp())
    lifetime.setTimeout(() => {
      if (shown === null && !installPrompt) showBanner('oldapp');
    }, OLD_APP_WAIT_MS);
  lifetime.listen(browser, 'appinstalled', () => {
    installPrompt = null;
    forgetOldApp();
    shown = null;
    render();
  });
}

/** Il pulsante "Installa" (Android e computer): apre la finestra di installazione del browser. */
export async function installApp(): Promise<void> {
  const prompt = installPrompt;
  // L'evento si può usare una volta sola.
  installPrompt = null;
  if (!prompt) return;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') {
    forgetOldApp();
    shown = null;
    render();
    return;
  }
  // "Annulla": la finestra del browser non si riapre, l'avviso spiega la strada a mano.
  showBanner('chrome');
  dismissInstall();
}

/** "Più tardi": l'avviso diventa la barretta in basso. */
export function dismissInstall(): void {
  collapsed = true;
  render();
}

/** "Salva" dell'ospite: la finestra di sempre (Google o email); salvato, il gioco riparte. */
export async function saveForInstall(): Promise<void> {
  await offerSave();
}

/** La barretta: riapre l'avviso grande. */
export function openInstall(): void {
  collapsed = false;
  render();
}
