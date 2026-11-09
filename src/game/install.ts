// Avviso per installare il gioco come app. Su iPhone, iPad e Safari per Mac il browser non lo
// propone da sé: l'avviso spiega i passaggi. Su Android e sui computer con Chrome o Edge il browser
// avvisa quando si può installare (beforeinstallprompt): il gioco tiene da parte quell'evento e il
// pulsante "Installa" apre la finestra di installazione.
import {
  isAndroid,
  isAndroidTablet,
  isAppleMobile,
  isInAppBrowser,
  isIpad,
  isMacSafari,
  shouldOfferInstall,
} from './install-rules.js';
import { browser, dom, lifetime } from './runtime.js';
import { isGuest } from './guest.js';

/** Il vecchio "Più tardi" che rimandava di una settimana: si cancella. */
const OLD_LATER_KEY = 'sims_install_later';
const SHOW_AFTER_MS = 3000;

/** L'evento di Chrome & co. (non è ancora nei tipi di TypeScript). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;
let mountedAt = 0;
/** "Più tardi" vale finché il gioco resta aperto: alla prossima apertura l'avviso torna. */
let dismissed = false;

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

function wanted(canInstall: boolean): boolean {
  return shouldOfferInstall({ canInstall, standalone: standalone(), dismissed });
}

/**
 * Il riquadro: `apple` iPhone/iPad (passaggi a mano), `mac` Safari per Mac (menu Archivio),
 * `prompt` Android e computer (pulsante "Installa").
 */
function showBanner(kind: 'apple' | 'mac' | 'prompt'): void {
  const banner = dom('install-banner');
  if (!banner) return;
  const ua = navigator.userAgent;
  const android = isAndroid(ua);
  dom('install-device').textContent =
    kind === 'apple'
      ? isIpad(ua, navigator.maxTouchPoints || 0)
        ? 'iPad'
        : 'iPhone'
      : kind === 'mac'
        ? 'Mac'
        : android
          ? isAndroidTablet(ua)
            ? 'tablet'
            : 'telefono'
          : 'computer';
  dom('install-prompt-text').textContent = android
    ? "Un tocco e lo trovi nella schermata Home, come un'app: si apre a schermo intero."
    : 'Un clic e lo apri dal menu Start o dal Dock, in una finestra tutta sua.';
  // Da Instagram & co. non si può installare: prima bisogna aprire il gioco in Safari.
  const inApp = kind === 'apple' && isInAppBrowser(ua);
  dom('install-steps').classList.toggle('hidden', kind !== 'apple' || inApp);
  dom('install-open-safari').classList.toggle('hidden', !inApp);
  dom('install-mac').classList.toggle('hidden', kind !== 'mac');
  dom('install-prompt-text').classList.toggle('hidden', kind !== 'prompt');
  dom('install-now').classList.toggle('hidden', kind !== 'prompt');
  // Compare qualche secondo dopo l'apertura, anche se il browser avvisa prima o dopo.
  const wait = Math.max(0, SHOW_AFTER_MS - (Date.now() - mountedAt));
  lifetime.setTimeout(() => {
    // Su iPhone, iPad e Mac l'app installata non vede i dati di Safari: un ospite lì dentro
    // ripartirebbe da zero. Prima salva il personaggio (l'avviso torna alla prossima apertura).
    if (kind !== 'prompt' && isGuest()) return;
    banner.classList.remove('hidden');
  }, wait);
}

function hideBanner(): void {
  dom('install-banner')?.classList.add('hidden');
}

/** All'avvio: su iPhone e Safari per Mac mostra l'avviso; altrove aspetta che il browser dica che si può. */
export function offerInstall(): void {
  mountedAt = Date.now();
  dismissed = false;
  try {
    localStorage.removeItem(OLD_LATER_KEY);
  } catch {
    // Memoria del browser bloccata: non c'era niente da cancellare.
  }
  if (appleMobile()) {
    if (wanted(true)) showBanner('apple');
    return;
  }
  if (isMacSafari(navigator.userAgent, navigator.maxTouchPoints || 0)) {
    if (wanted(true)) showBanner('mac');
    return;
  }
  lifetime.listen(browser, 'beforeinstallprompt', (event) => {
    if (!wanted(true)) return;
    // Al posto della barretta o dell'icona del browser, il nostro avviso con "Installa".
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    showBanner('prompt');
  });
  lifetime.listen(browser, 'appinstalled', () => {
    installPrompt = null;
    hideBanner();
  });
}

/** Il pulsante "Installa" (Android e computer): apre la finestra di installazione del browser. */
export async function installApp(): Promise<void> {
  const prompt = installPrompt;
  // L'evento si può usare una volta sola.
  installPrompt = null;
  hideBanner();
  if (!prompt) return;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'dismissed') dismissInstall();
}

/** "Più tardi": l'avviso sparisce e torna alla prossima apertura del gioco. */
export function dismissInstall(): void {
  dismissed = true;
  hideBanner();
}
