// Avviso "aggiungi alla schermata Home" per iPhone e iPad, dove Safari non propone da sé di
// installare il gioco. Compare poco dopo l'apertura, finché il gioco non è installato.
import { isAppleMobile, isInAppBrowser, isIpad, shouldOfferInstall } from './install-rules.js';
import { browser, dom, lifetime } from './runtime.js';

const LATER_KEY = 'sims_install_later';
const SHOW_AFTER_MS = 3000;

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

function dismissedAt(): number | null {
  try {
    const value = Number(localStorage.getItem(LATER_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** All'avvio: se è il caso, mostra l'avviso dopo qualche secondo. */
export function offerInstall(): void {
  const offer = shouldOfferInstall({
    appleMobile: appleMobile(),
    standalone: standalone(),
    dismissedAt: dismissedAt(),
    now: Date.now(),
  });
  if (!offer) return;
  const banner = dom('install-banner');
  if (!banner) return;
  const device = isIpad(navigator.userAgent, navigator.maxTouchPoints || 0) ? 'iPad' : 'iPhone';
  dom('install-device').textContent = device;
  // Da Instagram & co. non si può installare: prima bisogna aprire il gioco in Safari.
  const inApp = isInAppBrowser(navigator.userAgent);
  dom('install-steps').classList.toggle('hidden', inApp);
  dom('install-open-safari').classList.toggle('hidden', !inApp);
  lifetime.setTimeout(() => banner.classList.remove('hidden'), SHOW_AFTER_MS);
}

/** "Più tardi": l'avviso torna fra una settimana. */
export function dismissInstall(): void {
  dom('install-banner')?.classList.add('hidden');
  try {
    localStorage.setItem(LATER_KEY, String(Date.now()));
  } catch {
    // Senza memoria del browser l'avviso tornerà alla prossima apertura: pazienza.
  }
}
