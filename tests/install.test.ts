import { describe, expect, it } from 'vitest';
import {
  INSTALL_SNOOZE_MS,
  isAppleMobile,
  isInAppBrowser,
  isIpad,
  shouldOfferInstall,
} from '../src/game/install-rules.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe("proposta di installare l'app su iPhone e iPad", () => {
  it('riconosce iPhone e iPad, anche quando l’iPad si presenta come un Mac', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true);
    expect(isAppleMobile(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIpad(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIpad(IPHONE, 5)).toBe(false);
    expect(isAppleMobile(IPAD_DESKTOP, 0)).toBe(false); // un Mac vero
    expect(isAppleMobile(ANDROID, 5)).toBe(false);
  });

  it('riconosce il browser dentro le app', () => {
    expect(isInAppBrowser(IPHONE + ' Instagram 300.0')).toBe(true);
    expect(isInAppBrowser(IPHONE)).toBe(false);
  });

  it("non insiste: niente avviso se il gioco è già installato o l'hai rimandato da poco", () => {
    const now = 1_000_000_000_000;
    const base = { appleMobile: true, standalone: false, dismissedAt: null, now };
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, appleMobile: false })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissedAt: now - 1000 })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissedAt: now - INSTALL_SNOOZE_MS })).toBe(true);
  });
});
