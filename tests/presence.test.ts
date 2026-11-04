import { describe, expect, it } from 'vitest';
import {
  OFFLINE_VISIBLE_MS,
  faintTime,
  faintedWhileAway,
  presenceState,
  shownWhileOffline,
} from '../src/game/presence-rules.js';

const DAY = 86400; // secondi per svuotare il sonno da 100 a 0
const H = 3600 * 1000;
const T0 = Date.UTC(2026, 10, 2); // ora di uscita

describe('giocatori offline', () => {
  it('chi è collegato resta online, chi esce resta visibile come offline', () => {
    expect(presenceState({ t: T0 }, true, T0 + 1000, DAY)).toBe('online');
    expect(presenceState({ offline: true, offAt: T0, sleep: 80 }, false, T0 + 1 * H, DAY)).toBe(
      'offline',
    );
    // senza segno "offline" ma senza battito da un po' (pagina chiusa male)
    expect(presenceState({ t: T0, sleep: 80 }, false, T0 + 1 * H, DAY)).toBe('offline');
  });

  it('se esce sveglio sviene quando il sonno arriva a zero', () => {
    // con 50% di sonno ci vogliono 12 ore
    expect(faintTime(50, T0, DAY)).toBe(T0 + 12 * H);
    const op = { offline: true, offAt: T0, sleep: 50 };
    expect(presenceState(op, false, T0 + 11 * H, DAY)).toBe('offline');
    expect(presenceState(op, false, T0 + 12 * H, DAY)).toBe('fainted');
  });

  it('chi era andato a dormire resta a letto, e dopo molto tempo sparisce', () => {
    expect(
      presenceState({ offline: true, offAt: T0, sleep: 0, act: 'sleep' }, false, T0 + 30 * H, DAY),
    ).toBe('sleeping');
    expect(
      presenceState(
        { offline: true, offAt: T0, sleep: 80 },
        false,
        T0 + OFFLINE_VISIBLE_MS + 1,
        DAY,
      ),
    ).toBe('gone');
  });

  it('un giocatore svenuto ma di nuovo collegato si vede ancora a terra finché non si rialza', () => {
    expect(presenceState({ t: T0, act: 'faint' }, true, T0 + 1000, DAY)).toBe('fainted');
  });

  it('al rientro è svenuto solo chi era sveglio e ha finito il sonno', () => {
    expect(faintedWhileAway(false, 0)).toBe(true);
    expect(faintedWhileAway(false, 30)).toBe(false);
    expect(faintedWhileAway(true, 0)).toBe(false);
  });
});

describe('chi è uscito dal gioco', () => {
  it('si vede solo nella propria stanza', () => {
    expect(shownWhileOffline('PLAYER_ROOM', 'player_a', 'player_a')).toBe(true);
    expect(shownWhileOffline('PLAYER_ROOM', 'player_b', 'player_a')).toBe(false);
    expect(shownWhileOffline('PLAYER_ROOM', undefined, 'player_a')).toBe(false);
    for (const env of ['SALOON', 'KITCHEN', 'CORTILE', 'banca'])
      expect(shownWhileOffline(env, 'player_a', 'player_a')).toBe(false);
  });
});
