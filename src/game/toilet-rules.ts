// Il WC torna disponibile dopo due ore reali, anche passando la mezzanotte.
export const TOILET_COOLDOWN_MS = 2 * 60 * 60_000;

export const toiletReady = (lastUse: number | undefined, now: number): boolean =>
  !lastUse || now - lastUse >= TOILET_COOLDOWN_MS;

/** Un uso su quindici dà il bonus speciale al posto di quello normale. */
export const toiletReward = (roll: number): number => (roll < 1 / 15 ? 15 : 5);
