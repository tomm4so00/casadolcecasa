import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GALLERY_SIZE,
  bidError,
  decodeAuction,
  decodeAuctions,
  galleryDay,
  minBid,
  movedAuction,
  newAuction,
  openAuctions,
  pickExhibition,
} from '../src/game/auction-rules.js';
import { GALLERY_FURNITURE, GALLERY_WALL } from '../src/game/data/catalogues.js';
import { PAINT_CELLS } from '../src/game/painting-rules.js';
import { paintingId } from '../src/game/painting-title-rules.js';

/** Un quadro valido, diverso per ogni `n`. */
const art = (n: number) =>
  n
    .toString(16)
    .padStart(4, '0')
    .repeat(PAINT_CELLS / 4);

/** Un'asta come la salva il database, con `votes` cuoricini. */
function auction(n: number, by: string, votes = 0, extra: Record<string, unknown> = {}) {
  const code = art(n);
  return [
    paintingId(code),
    {
      ...newAuction(code, by, by.replace('player_', ''), 1000 + n),
      votes: Object.fromEntries(Array.from({ length: votes }, (_, i) => ['player_v' + i, 1])),
      ...extra,
    },
  ] as const;
}

const roomsOf = (...ids: string[]) => ids.map((ownerId) => ({ ownerId, owner: ownerId }));

describe("aste dei quadri e galleria d'arte", () => {
  it("un'asta si legge con offerta, cuoricini e pittore; i valori storti si scartano", () => {
    const [id, raw] = auction(1, 'player_anna', 3, {
      bid: { by: 'player_bea', name: 'Bea', amt: 120, t: 5 },
    });
    const a = decodeAuction(id, raw)!;
    expect(a).toMatchObject({ id, by: 'player_anna', name: 'anna', bid: { amt: 120 } });
    expect(a.voters.size).toBe(3);
    expect(decodeAuction('q1', { code: 'no', by: 'x', t: 1 })).toBeNull();
    // il pittore non conta come cuoricino; un'offerta non valida non c'è
    const b = decodeAuction(id, { ...raw, votes: { player_anna: 1 }, bid: { by: 'x', amt: -3 } })!;
    expect(b.voters.size).toBe(0);
    expect(b.bid).toBeUndefined();
  });

  it('in elenco solo le aste non vendute di chi abita nel condominio, dalla più votata', () => {
    const all = decodeAuctions(
      Object.fromEntries([
        auction(1, 'player_anna', 1),
        auction(2, 'player_bea', 5),
        auction(3, 'player_morto', 9),
        auction(4, 'player_anna', 7, { sold: { to: 'player_bea', amt: 10, t: 1 } }),
      ]),
    );
    const open = openAuctions(all, roomsOf('player_anna', 'player_bea'));
    expect(open.map((a) => a.voters.size)).toEqual([5, 1]);
  });

  it('in galleria i dieci quadri all’asta con più cuoricini', () => {
    const all = decodeAuctions(
      Object.fromEntries(Array.from({ length: 15 }, (_, i) => auction(i, 'player_a' + i, i))),
    );
    const rooms = roomsOf(...Array.from({ length: 15 }, (_, i) => 'player_a' + i));
    const show = pickExhibition(openAuctions(all, rooms), 3);
    expect(show).toHaveLength(GALLERY_SIZE);
    expect(show.map((a) => a.voters.size)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });

  it('a parità di cuoricini la scelta cambia con il giorno, uguale per tutti', () => {
    const all = decodeAuctions(
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => auction(i, 'player_p'))),
    );
    const ids = (day: number) => pickExhibition(all, day).map((a) => a.id);
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
    expect(galleryDay(86_400_000 * 3 + 5)).toBe(3);
  });

  it("l'offerta: mai sul proprio quadro, più alta della migliore, coperta dalla cassaforte", () => {
    const [id, raw] = auction(1, 'player_anna', 0, {
      bid: { by: 'player_bea', name: 'Bea', amt: 100, t: 1 },
    });
    const a = decodeAuction(id, raw)!;
    expect(minBid(a)).toBe(101);
    expect(bidError(a, 'player_anna', 500, 1000)).toMatch(/tuo quadro/);
    expect(bidError(a, 'player_c', 100, 1000)).toMatch(/almeno 101/);
    expect(bidError(a, 'player_c', 300, 200)).toMatch(/cassaforte/);
    expect(bidError(a, 'player_c', 1.5, 200)).toMatch(/intera/);
    expect(bidError(a, 'player_c', 101, 200)).toBeNull();
    const sold = decodeAuction(id, { ...raw, sold: { to: 'player_bea', amt: 100, t: 1 } })!;
    expect(bidError(sold, 'player_c', 500, 1000)).toMatch(/già accettato/);
  });

  it('la vendita pagata al momento dell’accettazione si riconosce', () => {
    const [id, raw] = auction(1, 'player_anna');
    const sold = (paid?: boolean) =>
      decodeAuction(id, {
        ...raw,
        sold: { to: 'player_bea', amt: 50, t: 1, ...(paid ? { paid } : {}) },
      })!.sold;
    expect(sold(true)?.paid).toBe(true);
    expect(sold()?.paid).toBe(false);
  });

  it('nel trasloco l’asta si riapre senza le offerte e i cuoricini dei vicini di prima', () => {
    const [id, raw] = auction(1, 'player_anna', 4, {
      round: 2,
      bid: { by: 'player_bea', name: 'Bea', amt: 100, t: 1 },
      sold: { to: 'player_bea', amt: 100, t: 2 },
    });
    const moved = movedAuction(decodeAuction(id, raw)!);
    expect(moved).toEqual({
      code: raw.code,
      by: 'player_anna',
      name: 'anna',
      t: raw.t,
      nextBotAt: raw.nextBotAt,
      round: 2,
    });
  });

  it('ogni posto della mostra ha il suo oggetto davanti alla parete, e c’è il catalogo', () => {
    expect(GALLERY_WALL).toHaveLength(GALLERY_SIZE);
    for (let i = 0; i < GALLERY_SIZE; i++)
      expect(GALLERY_FURNITURE[('gallery' + i) as keyof typeof GALLERY_FURNITURE]).toMatchObject({
        gallerySlot: i,
        wallItem: true,
      });
    expect(GALLERY_FURNITURE.catalog).toMatchObject({ x: 0, wallItem: true });
  });

  it('le regole del database: offerte solo più alte, voti propri, vendita solo alla migliore', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const a = r.sims_auctions.$id;
    expect(a.bid['.write']).toContain("newData.child('amt').val() > data.child('amt').val()");
    expect(a.sold['.write']).toContain("data.parent().child('bid').child('by').val()");
    expect(a.votes.$pid['.write']).toContain("!data.parent().parent().child('sold').exists()");
    expect(a.$other['.validate']).toBe(false);
    // pagato: lo segna solo il pittore, e il pittore annulla l'offerta di chi non ha più i soldi
    expect(a.sold.paid['.validate']).toBe('newData.val() === true');
    expect(a.bid['.write']).toContain("!newData.exists() && data.parent().child('by').val() ===");
    expect(r.worlds.$worldId.auctions).toBeDefined();
    const types = r.sims_interactions.$pid.$key['.validate'];
    for (const t of ['artOffer', 'artAccept', 'artNo']) expect(types).toContain(t);
  });
});
