// Quando proporre di installare il gioco. Su iPhone, iPad e Safari per Mac non c'è una finestra
// di installazione da aprire: il gioco mostra i passaggi da fare a mano. Su Android e sui
// computer con Chrome o Edge il browser avvisa il gioco quando l'installazione è possibile, e il
// pulsante "Installa" la apre.

/**
 * iPhone, iPod o iPad. Gli iPad recenti si presentano come un Mac: li tradisce lo schermo touch,
 * che i Mac non hanno.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Telefono o tablet Android. I tablet non scrivono "Mobile" nel nome del browser. */
export function isAndroid(userAgent: string): boolean {
  return /Android/.test(userAgent);
}

export function isAndroidTablet(userAgent: string): boolean {
  return isAndroid(userAgent) && !/Mobile/.test(userAgent);
}

/**
 * Safari sul Mac, dalla 17 in poi (prima non c'era "Aggiungi al Dock"). Chrome, Edge e Firefox
 * sul Mac scrivono anche "Safari" nel nome: si riconoscono dal loro. L'iPad ha lo schermo touch.
 */
export function isMacSafari(userAgent: string, maxTouchPoints: number): boolean {
  if (!/Macintosh/.test(userAgent) || maxTouchPoints > 1) return false;
  if (/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(userAgent)) return false;
  const version = /Version\/(\d+)/.exec(userAgent);
  return /Safari/.test(userAgent) && !!version && Number(version[1]) >= 17;
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

/**
 * `canInstall`: iPhone, iPad o Safari per Mac (sempre, a mano), oppure Android e computer quando
 * il browser ha detto che si può installare. Mai se il gioco è già aperto come app, né dopo "Più tardi" finché il gioco resta
 * aperto: alla prossima apertura l'avviso torna.
 */
export function shouldOfferInstall(state: {
  canInstall: boolean;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  return state.canInstall && !state.standalone && !state.dismissed;
}
