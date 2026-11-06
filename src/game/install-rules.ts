// Quando proporre di installare il gioco su iPhone e iPad. Safari non ha una finestra di
// installazione da aprire: il gioco mostra un avviso con i passaggi da fare a mano.

/** Dopo "Più tardi" l'avviso torna fra una settimana. */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * iPhone, iPod o iPad. Gli iPad recenti si presentano come un Mac: li tradisce lo schermo touch,
 * che i Mac non hanno.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function isIpad(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * Browser dentro un'altra app (Instagram, Facebook, Telegram…): da lì non si aggiunge niente
 * alla schermata Home, bisogna prima aprire il gioco in Safari.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Telegram|TikTok|Snapchat|LinkedInApp|Twitter/.test(userAgent);
}

export function shouldOfferInstall(state: {
  appleMobile: boolean;
  standalone: boolean;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (!state.appleMobile || state.standalone) return false;
  return state.dismissedAt === null || state.now - state.dismissedAt >= INSTALL_SNOOZE_MS;
}
