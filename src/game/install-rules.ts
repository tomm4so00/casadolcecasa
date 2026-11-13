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
 * Come si installa su questo browser. `apple` e `mac`: passaggi a mano. `wait`: il browser avvisa
 * da sé quando si può (Chrome, Edge…); se non avvisa, il gioco è già installato e non si dice
 * niente. `android`: browser Android senza quell'avviso (Firefox…), passaggi a mano dal menu.
 * `other`: computer con un browser che non installa (Firefox): si consiglia Chrome o Edge.
 */
export type InstallWay = 'apple' | 'mac' | 'wait' | 'android' | 'other';

export function installWay(env: {
  appleMobile: boolean;
  macSafari: boolean;
  android: boolean;
  promptSupported: boolean;
}): InstallWay {
  if (env.appleMobile) return 'apple';
  if (env.macSafari) return 'mac';
  if (env.promptSupported) return 'wait';
  return env.android ? 'android' : 'other';
}

/**
 * Che cosa chiede l'avviso in basso: installare l'app o salvare il personaggio. Prima l'app (è
 * l'icona sul telefono a far tornare a giocare), poi, dentro l'app, il salvataggio. Ma dove l'app
 * installata o il browser consigliato non vedono i dati di questo browser (`dataStays` falso:
 * iPhone, iPad, Safari per Mac, Instagram & co., Firefox sul computer) un ospite ripartirebbe da
 * zero: lì si salva prima.
 */
export function installStep(state: {
  /** c'è un modo di installare da qui */
  canInstall: boolean;
  standalone: boolean;
  guest: boolean;
  dataStays: boolean;
}): 'install' | 'save' | 'none' {
  if (state.standalone) return state.guest ? 'save' : 'none';
  if (!state.canInstall) return 'none';
  return state.guest && !state.dataStays ? 'save' : 'install';
}

/** Avviso grande o barretta: "Più tardi" lo riduce, toccandola si riapre. Resta finché serve. */
export function installView(
  step: 'install' | 'save' | 'none',
  collapsed: boolean,
): 'banner' | 'bar' | 'none' {
  if (step === 'none') return 'none';
  return collapsed ? 'bar' : 'banner';
}
