import { describe, expect, it } from 'vitest';
import {
  isAppleMobile,
  isAndroid,
  isAndroidTablet,
  isInAppBrowser,
  isIpad,
  isMacSafari,
  installStep,
  installView,
  installWay,
} from '../src/game/install-rules.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe("proposta di installare l'app su iPhone, iPad, Android e computer", () => {
  it('riconosce iPhone e iPad, anche quando l’iPad si presenta come un Mac', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true);
    expect(isAppleMobile(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIpad(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIpad(IPHONE, 5)).toBe(false);
    expect(isAppleMobile(IPAD_DESKTOP, 0)).toBe(false); // un Mac vero
    expect(isAppleMobile(ANDROID, 5)).toBe(false);
  });

  it('riconosce telefoni e tablet Android', () => {
    expect(isAndroid(ANDROID)).toBe(true);
    expect(isAndroidTablet(ANDROID)).toBe(false);
    expect(isAndroidTablet(ANDROID.replace(' Mobile', ''))).toBe(true);
    expect(isAndroid(IPHONE)).toBe(false);
  });

  it('riconosce Safari sul Mac, ma non Chrome sul Mac né gli iPad', () => {
    expect(isMacSafari(IPAD_DESKTOP, 0)).toBe(true);
    expect(isMacSafari(IPAD_DESKTOP, 5)).toBe(false); // iPad
    expect(isMacSafari(IPAD_DESKTOP.replace('Version/18.0', 'Version/16.6'), 0)).toBe(false);
    const chromeMac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    expect(isMacSafari(chromeMac, 0)).toBe(false);
    expect(isMacSafari(ANDROID, 0)).toBe(false);
  });

  it('riconosce il browser dentro le app', () => {
    expect(isInAppBrowser(IPHONE + ' Instagram 300.0')).toBe(true);
    expect(isInAppBrowser(IPHONE)).toBe(false);
  });

  it('l’avviso resta finché serve: "Più tardi" lo riduce a una barretta', () => {
    expect(installView('install', false)).toBe('banner');
    expect(installView('save', true)).toBe('bar');
    expect(installView('none', false)).toBe('none');
    expect(installView('none', true)).toBe('none');
  });

  it('prima l’app e poi il salvataggio, ma prima il salvataggio dove i dati non passano', () => {
    const base = { canInstall: true, standalone: false, guest: false, dataStays: true };
    // chi ha un account: solo l'app, e nell'app niente
    expect(installStep(base)).toBe('install');
    expect(installStep({ ...base, standalone: true })).toBe('none');
    // ospite su Android o computer: prima l'app, poi dentro l'app il salvataggio
    expect(installStep({ ...base, guest: true })).toBe('install');
    expect(installStep({ ...base, guest: true, standalone: true })).toBe('save');
    // ospite su iPhone, iPad, Mac, Instagram o Firefox sul computer: prima si salva
    expect(installStep({ ...base, guest: true, dataStays: false })).toBe('save');
    expect(installStep({ ...base, dataStays: false })).toBe('install');
    // niente da installare (Chrome non lo propone: è già installato)
    expect(installStep({ ...base, canInstall: false, guest: true })).toBe('none');
  });

  it('sceglie come installare: a mano, col pulsante del browser o consigliando Chrome', () => {
    const none = { appleMobile: false, macSafari: false, android: false, promptSupported: false };
    expect(installWay({ ...none, appleMobile: true })).toBe('apple');
    expect(installWay({ ...none, macSafari: true })).toBe('mac');
    expect(installWay({ ...none, android: true, promptSupported: true })).toBe('wait');
    expect(installWay({ ...none, promptSupported: true })).toBe('wait');
    expect(installWay({ ...none, android: true })).toBe('android'); // Firefox per Android
    expect(installWay(none)).toBe('other'); // Firefox sul computer
  });
});
