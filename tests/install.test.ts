import { describe, expect, it } from 'vitest';
import {
  isAppleMobile,
  isAndroid,
  isAndroidTablet,
  isInAppBrowser,
  isIpad,
  isMacSafari,
  shouldOfferInstall,
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

  it('niente avviso se il gioco è già installato, né dopo "Più tardi" finché resta aperto', () => {
    const base = { canInstall: true, standalone: false, dismissed: false };
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, canInstall: false })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissed: true })).toBe(false);
  });
});
