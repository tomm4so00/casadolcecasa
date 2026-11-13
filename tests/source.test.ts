import { describe, expect, it } from 'vitest';
import { shouldRememberSource, sourceCounter, sourceFromSearch } from '../src/game/source-rules.js';

describe('da dove arrivano i giocatori', () => {
  it('legge ?da= dal link, solo se è fatto bene', () => {
    expect(sourceFromSearch('?da=itch')).toBe('itch');
    expect(sourceFromSearch('?invito=ABC&da=TikTok')).toBe('tiktok');
    expect(sourceFromSearch('?da=')).toBeNull();
    expect(sourceFromSearch('?da=<script>')).toBeNull();
    expect(sourceFromSearch('?da=' + 'x'.repeat(17))).toBeNull();
    expect(sourceFromSearch('')).toBeNull();
  });

  it('si ricorda solo la prima, e non per chi ha già giocato', () => {
    expect(shouldRememberSource('itch', null, false)).toBe(true);
    expect(shouldRememberSource('itch', 'telegram', false)).toBe(false);
    expect(shouldRememberSource('itch', null, true)).toBe(false);
    expect(shouldRememberSource(null, null, false)).toBe(false);
  });

  it('i passi dell’ingresso si contano anche per provenienza', () => {
    expect(sourceCounter('ingresso:gioca_subito', 'itch')).toBe('ingresso:itch:gioca_subito');
    expect(sourceCounter('ingresso:gioca_subito', null)).toBeNull();
    // le altre voci no, e nemmeno quelle già divise
    expect(sourceCounter('posto:bar', 'itch')).toBeNull();
    expect(sourceCounter('missione:pin:si', 'itch')).toBeNull();
    expect(sourceCounter('ingresso:itch:visto', 'itch')).toBeNull();
    // oltre i 40 caratteri del database non si conta
    expect(sourceCounter('ingresso:arrivo_cook_e_poi_ancora', 'x'.repeat(16))).toBeNull();
  });
});
