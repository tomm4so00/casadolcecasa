import { describe, expect, it } from 'vitest';
import { allPins, hashPin, recoverPin, PIN_HASH_RE } from '../shared/safe-pin-rules.js';
import { hashPin as gameHashPin, pinTooHighForLevel } from '../src/game/safe-pin.js';
import { moveSafePins } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

describe('PIN della cassaforte: le cifre si ritrovano', () => {
  it('la cifratura è quella di sempre (i PIN salvati restano validi)', () => {
    expect(gameHashPin).toBe(hashPin);
    expect(hashPin('243', 3)).toBe(gameHashPin('243', 3));
    expect(allPins()).toHaveLength(125);
    expect(allPins(4)).toHaveLength(64);
    for (const code of allPins()) expect(hashPin(code, 'player_x')).toMatch(PIN_HASH_RE);
  });

  it('ogni combinazione, cifrata col numero della stanza, si ritrova uguale', () => {
    for (const room of [1, 7, 64])
      for (const code of allPins()) expect(recoverPin(hashPin(code, room), room)).toBe(code);
  });

  it('i PIN vecchissimi in chiaro restano com’erano; il resto non si riconosce', () => {
    expect(recoverPin('321', 5)).toBe('321');
    expect(recoverPin('h0', 5)).toBeNull();
    expect(recoverPin(null, 5)).toBeNull();
    expect(recoverPin('', 5)).toBeNull();
  });

  it('la combinazione col 5 si riconosce anche col codice del giocatore', () => {
    expect(pinTooHighForLevel(hashPin('152', 'player_a'), 'player_a', 1)).toBe(true);
    expect(pinTooHighForLevel(hashPin('152', 'player_a'), 'player_a', 2)).toBe(false);
  });
});

describe('PIN della cassaforte: il trasloco nel nodo privato', () => {
  const db = () => localDatabase(new Lifetime(), new MemoryStorage());
  const get = async (d: ReturnType<typeof db>, path: string) => (await d.ref(path).get()).val();

  it('sposta tutti i PIN con le stesse cifre e li toglie dalle stanze', async () => {
    const d = db();
    await d.ref('sims_rooms_state').set({
      0: { id: 1, ownerId: 'p_anna', owner: 'Anna', pin: hashPin('243', 1), vaultMoney: 50 },
      1: { id: 2, ownerId: 'p_bea', owner: 'Bea', pin: '155', vaultMoney: 9 }, // in chiaro
      2: { id: 3, pin: hashPin('111', 3), vaultMoney: 0 }, // libera, PIN rimasto
      3: { id: 4, ownerId: 'p_ciro', owner: 'Ciro', vaultMoney: 1 }, // senza PIN
    });
    await d.ref('worlds/CASA-AB23/rooms_state/0').set({
      id: 1,
      ownerId: 'p_dino',
      pin: hashPin('514', 1),
      vaultMoney: 3,
    });
    expect(await moveSafePins(d)).toBe(3);
    expect(await moveSafePins(d, 'CASA-AB23')).toBe(1);

    expect(await get(d, 'sims_safe_pins/p_anna')).toBe(hashPin('243', 'p_anna'));
    expect(await get(d, 'sims_safe_pins/p_bea')).toBe(hashPin('155', 'p_bea'));
    expect(await get(d, 'sims_safe_pins/p_dino')).toBe(hashPin('514', 'p_dino'));
    expect(await get(d, 'sims_safe_pins/p_ciro')).toBeNull();
    const rooms = await get(d, 'sims_rooms_state');
    expect(rooms[0]).toEqual({
      id: 1,
      ownerId: 'p_anna',
      owner: 'Anna',
      pinSet: true,
      vaultMoney: 50,
    });
    expect(rooms[1].pin).toBeUndefined();
    expect(rooms[2]).toEqual({ id: 3, vaultMoney: 0 });
    expect(rooms[3].pinSet).toBeUndefined();
    expect(await get(d, 'worlds/CASA-AB23/rooms_state/0/pin')).toBeNull();
    // la seconda volta non c'è più niente da fare
    expect(await moveSafePins(d)).toBe(0);
  });

  it('se il giocatore ha già un PIN privato (gioco nuovo), vale quello', async () => {
    const d = db();
    await d.ref('sims_safe_pins/p_anna').set(hashPin('432', 'p_anna'));
    await d.ref('sims_rooms_state/0').set({ id: 1, ownerId: 'p_anna', pin: hashPin('243', 1) });
    await moveSafePins(d);
    expect(await get(d, 'sims_safe_pins/p_anna')).toBe(hashPin('432', 'p_anna'));
    expect(await get(d, 'sims_rooms_state/0/pin')).toBeNull();
  });

  it('un PIN che non si riconosce resta dov’è', async () => {
    const d = db();
    await d.ref('sims_rooms_state/0').set({ id: 1, ownerId: 'p_anna', pin: 'h0' });
    expect(await moveSafePins(d)).toBe(0);
    expect(await get(d, 'sims_rooms_state/0/pin')).toBe('h0');
    expect(await get(d, 'sims_safe_pins/p_anna')).toBeNull();
  });
});
