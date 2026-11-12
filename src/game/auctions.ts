import { countUse } from './usage.js';
// Aste dei quadri (regole in auction-rules.ts). Ogni condominio ha le sue, in worlds/…/auctions:
// il quadro all'asta riceve cuoricini e offerte; il pittore accetta la migliore e chi l'ha fatta
// paga e appende il quadro nella sua stanza, dove resta suo per sempre. Anche i collezionisti
// (finti) fanno offerte al pittore, come prima su quadrivendo.it.
import type { RoomState } from './models.js';
import type { SocialMessage } from './network-model.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { hasRoom, saveGame, withTimeout } from './saves.js';
import { sfx } from './audio.js';
import { sendNotify } from './needs.js';
import { sendSocial } from './social.js';
import { postGossip } from './gossip.js';
import { notePersonality } from './personality.js';
import { artistOffer, levelOf } from './personality-rules.js';
import { collectMoneyFrom, creditMoney, dropDebit, allowDebit } from './economy.js';
import { askPaintingTitle, paintingTitle, quotedTitle } from './painting-titles.js';
import { chooseHungPainting, pickWallSlot } from './paint-studio.js';
import { type PaintingSlot, roomPaintings } from './painting-rules.js';
import { paintingId } from './painting-title-rules.js';
import { botOfferAmount, nextOfferTime } from './art-market-rules.js';
import {
  type Auction,
  bidError,
  decodeAuction,
  decodeAuctions,
  minBid,
  movedAuction,
  newAuction,
  openAuctions,
} from './auction-rules.js';
import { worldNode } from './world-db.js';
import { worldNodePath } from '../../shared/worlds.js';
import { expiryNotice } from '../../shared/auction-expiry.js';

const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;
const me = (): string => game.session.myPlayerId;
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0) - 1000;
const auctionRef = (id: string, child = '') =>
  game.session.db.ref(`${worldNode('auctions')}/${id}${child ? '/' + child : ''}`);
const myIdx = (): number => game.myAssignedRoomIdx ?? -1;
const myRoom = (): RoomState | undefined => game.roomsState[myIdx()];
/** Il quadro chiamato col suo titolo, oppure con la frase di riserva. */
const nameOf = (a: Auction, fallback = 'il quadro') => quotedTitle(a.code) || fallback;

let all: Auction[] = [];
let started = false;
const listeners = new Set<() => void>();
let memo: { all: Auction[]; rooms: unknown; open: Auction[] } | null = null;

/** Le aste in corso nel condominio, dalla più votata (vedi openAuctions). */
export function auctions(): Auction[] {
  const rooms = game.roomsState;
  if (memo?.all !== all || memo.rooms !== rooms)
    memo = { all, rooms, open: openAuctions(all, Array.isArray(rooms) ? rooms : []) };
  return memo.open;
}

export const auctionById = (id: string): Auction | undefined => all.find((a) => a.id === id);

/** Le offerte che il pittore mi ha accettato e che devo ancora pagare. */
export const auctionsSoldToMe = (): Auction[] => all.filter((a) => a.sold?.to === me());

/** Chiama `fn` a ogni cambio delle aste; restituisce la funzione per smettere. */
export function onAuctionsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ascolta le aste del condominio e, ogni tanto, le offerte dei collezionisti. */
export function startAuctions(): void {
  if (started) return;
  started = true;
  game.session.db.ref(worldNode('auctions')).on('value', (snap): void => {
    all = decodeAuctions(snap?.val());
    listeners.forEach((fn) => fn());
    void checkPurchases().then(() => checkExpiring());
  });
  void closeOldListings();
  lifetime.setTimeout(() => void checkCollectors(), 5000);
  lifetime.setInterval(() => void checkCollectors(), 20000);
}

/** Gli annunci a prezzo fisso di prima non valgono più: si tolgono dalla propria stanza. */
async function closeOldListings(): Promise<void> {
  if (!hasRoom() || !myRoom()?.sale) return;
  try {
    await game.session.db.ref(`${worldNode('rooms_state')}/${myIdx()}/sale`).remove();
  } catch (error) {
    console.warn('[aste]', error);
  }
}

// ---------------------------------------------------------------- il pittore

/**
 * Appena finito il quadro (o tolto dalla parete, `resale`): lo si mette all'asta e, se non ha
 * ancora un nome, gli si dà.
 */
export async function startAuction(code: string, opt: { resale?: boolean } = {}): Promise<boolean> {
  // il pittore deve abitare nel condominio: è nella sua cassaforte che arrivano i soldi
  if (!hasRoom()) {
    toast("🏠 Ti serve una stanza per mettere un quadro all'asta.", 3500);
    return false;
  }
  const id = paintingId(code);
  try {
    await auctionRef(id).set(newAuction(code, me(), game.player.myData.nick || '', serverNow()));
  } catch (error) {
    console.warn('[aste]', error);
    toast('Non sono riuscito a mettere il quadro all’asta. Riprova quando sei connesso.', 4000);
    return false;
  }
  sfx('success');
  // le aste avviate, per la missione del giorno
  game.player.stats.auctionsStarted = (game.player.stats.auctionsStarted || 0) + 1;
  if (!opt.resale) {
    game.player.stats.paintings = (game.player.stats.paintings || 0) + 1;
    notePersonality('paint');
  }
  // un quadro che ha già un nome lo tiene (anche quello dato da chi l'ha dipinto)
  if (!paintingTitle(code))
    await askPaintingTitle(code, '🔨 Il tuo quadro è all’asta! Come si chiama?');
  toast(
    "🔨 Quadro all'asta: lo trovi su quadrivendo.it e nel catalogo della Galleria d'Arte. Le offerte le fanno gli altri giocatori, tu accetti la migliore quando vuoi.",
    6000,
  );
  return true;
}

/** Il pittore accetta la migliore offerta: chi l'ha fatta riceve l'avviso e paga. */
export async function acceptBid(a: Auction): Promise<void> {
  const bid = a.bid;
  if (a.by !== me() || !bid || a.sold) return;
  const res = await openDialog({
    title: '🤝 Accetti l’offerta?',
    text:
      `${bid.name} offre ${dindini(bid.amt)} per ${nameOf(a, 'il tuo quadro')}.\n\n` +
      'Se ha ancora i soldi, lo scambio è immediato: incassi subito e il quadro passa per sempre a lui.',
    buttons: [
      { label: 'Non ancora', value: null, color: '#57606f' },
      { label: `Accetta (${dindini(bid.amt)})`, value: 'yes', color: '#2ed573' },
    ],
  });
  if (res.action !== 'yes') return;
  // 1) si ferma l'asta sull'offerta accettata: nessuno può più offrire né votare
  try {
    await auctionRef(a.id, 'sold').set({ to: bid.by, amt: bid.amt, t: serverNow() });
  } catch (error) {
    console.warn('[aste]', error);
    toast('Non sono riuscito ad accettare: forse è arrivata un’offerta più alta.', 4000);
    return;
  }
  // 2) i soldi passano subito dalla sua cassaforte alla tua, se ci sono ancora
  if (!(await collectMoneyFrom(bid.by, bid.amt))) {
    await auctionRef(a.id)
      .update({ sold: null, bid: null })
      .catch((e: unknown) => console.warn('[aste]', e));
    await sendSocial(bid.by, { type: 'artNo', amt: bid.amt, pic: a.id, why: 'nomoney' });
    toast(
      `💸 ${bid.name} non ha più ${dindini(bid.amt)} in cassaforte: l'offerta è annullata e il quadro resta all'asta.`,
      5000,
    );
    return;
  }
  // 3) pagato: il quadro aspetta solo di essere appeso da chi l'ha comprato. Si riprova qualche
  // volta: senza il segno, chi ha comprato si vedrebbe chiedere di pagare di nuovo.
  let marked = false;
  for (let i = 0; i < 3 && !marked; i++)
    try {
      await auctionRef(a.id, 'sold/paid').set(true);
      marked = true;
    } catch (error) {
      console.warn('[aste]', error);
    }
  await sendSocial(bid.by, { type: 'artAccept', amt: bid.amt, pic: a.id, paid: marked ? 1 : 0 });
  game.player.stats.paintingsSold = (game.player.stats.paintingsSold || 0) + 1;
  notePersonality('sellPainting');
  saveGame(true);
  sfx('coin');
  toast(
    `💰 Venduto! ${bid.name} ti ha pagato ${dindini(bid.amt)} per ${nameOf(a, 'il tuo quadro')}.`,
    5000,
  );
  postGossip(
    `${game.player.myData.nick} ha venduto ${nameOf(a, 'un quadro')} a ${bid.name} per ${dindini(bid.amt)} 🖼️`,
    [bid.by],
  );
}

/**
 * Chi ha comprato: il pittore ha già preso i soldi, il quadro si appende nella stanza (al primo
 * posto libero, o al posto di uno da sostituire). Se si chiude la scelta, il quadro aspetta su
 * quadrivendo.it, in "I miei quadri".
 */
export async function deliverPainting(a: Auction): Promise<void> {
  const sold = a.sold;
  if (!sold?.paid || sold.to !== me()) return;
  const spot = await pickWallSlot(a.code);
  if (!spot) {
    toast(
      '🖼️ Il quadro è tuo e ti aspetta: lo appendi da quadrivendo.it, in «I miei quadri».',
      5000,
    );
    return;
  }
  try {
    await game.session.db.ref(`${worldNode('rooms_state')}/${myIdx()}`).update({
      [`paintings/${spot.slot}`]: a.code,
      [`sale/${spot.slot}`]: null,
    });
  } catch (error) {
    console.warn('[aste]', error);
    await spot.undo();
    asked.delete(a.id);
    toast('Non sono riuscito ad appendere il quadro: riprova da quadrivendo.it.', 4000);
    return;
  }
  await auctionRef(a.id)
    .remove()
    .catch(() => {});
  game.player.stats.paintingsBought = (game.player.stats.paintingsBought || 0) + 1;
  notePersonality('buyPainting', sold.amt);
  saveGame(true);
  sfx('success');
  toast(
    `🖼️ Hai comprato ${nameOf(a)} di ${a.name} per ${dindini(sold.amt)}: è appeso nella tua stanza!`,
    5000,
  );
}

/** Il pittore ritira il quadro dall'asta e lo appende nella sua stanza. */
export async function withdrawAuction(a: Auction, ask = true): Promise<void> {
  if (a.by !== me()) return;
  if (!hasRoom()) {
    toast('🏠 Ti serve una stanza dove appendere il quadro.', 3500);
    return;
  }
  // dall'avviso dello spazio espositivo la scelta è già fatta: niente seconda domanda
  const res: { action: string | null } = !ask
    ? { action: 'hang' }
    : await openDialog({
        title: '🖼️ Ritiri il quadro dall’asta?',
        text:
          'Lo appendi nella tua stanza e diventa tuo per sempre: niente più offerte né cuoricini.' +
          (a.bid ? `\n\nLa migliore offerta era di ${dindini(a.bid.amt)} (${a.bid.name}).` : ''),
        buttons: [
          { label: 'Annulla', value: null, color: '#57606f' },
          { label: '🖼️ Appendi in casa', value: 'hang', color: '#2ed573' },
        ],
      });
  if (res.action !== 'hang') return;
  const spot = await pickWallSlot(a.code);
  if (!spot) return;
  try {
    await game.session.db.ref(`${worldNode('rooms_state')}/${myIdx()}`).update({
      [`paintings/${spot.slot}`]: a.code,
      [`sale/${spot.slot}`]: null,
    });
  } catch (error) {
    console.warn('[aste]', error);
    await spot.undo();
    toast('Non sono riuscito a ritirare il quadro. Riprova quando sei connesso.', 4000);
    return;
  }
  try {
    await auctionRef(a.id).remove();
  } catch (error) {
    console.warn('[aste]', error);
    toast('Non sono riuscito a ritirare il quadro. Riprova quando sei connesso.', 4000);
    return;
  }
  const other = a.sold?.to ?? a.bid?.by;
  if (other)
    await sendSocial(other, { type: 'artNo', amt: a.bid?.amt ?? 1, pic: a.id, why: 'out' });
  sfx('success');
  toast('🖼️ Il quadro è appeso nella tua stanza.', 3500);
}

/**
 * Trasloco: le mie aste vengono con me nel condominio nuovo (vedi movedAuction) e chi aveva
 * offerto riceve l'avviso. Si chiama prima di cambiare condominio: gli avvisi partono in quello
 * di prima, dove abitano i vicini che avevano offerto. Restituisce quante aste sono state spostate.
 */
export async function moveAuctions(from: string, to: string): Promise<number> {
  const db = game.session.db;
  let mine: Auction[] = [];
  try {
    const snap = await withTimeout(db.ref(worldNodePath(from, 'auctions')).get(), 6000);
    mine = decodeAuctions(snap?.val()).filter((a) => a.by === me());
  } catch (error) {
    console.warn('[aste] trasloco', error);
    return 0;
  }
  let moved = 0;
  for (const a of mine) {
    try {
      // prima si apre di là, poi si chiude di qua: se qualcosa va storto il quadro non si perde
      await db.ref(`${worldNodePath(to, 'auctions')}/${a.id}`).set(movedAuction(a));
      await db.ref(`${worldNodePath(from, 'auctions')}/${a.id}`).remove();
      moved++;
    } catch (error) {
      console.warn('[aste] trasloco', a.id, error);
      continue;
    }
    const other = a.sold?.to ?? a.bid?.by;
    if (other)
      await sendSocial(other, {
        type: 'artNo',
        amt: a.sold?.amt ?? a.bid?.amt ?? 1,
        pic: a.id,
        why: 'moved',
      }).catch(() => {});
  }
  return moved;
}

/**
 * Dal sito o dal catalogo: un quadro appeso nella propria stanza si stacca e va all'asta.
 * Senza `slot` si sceglie guardando le anteprime. L'asta si apre prima di staccarlo: se poi
 * staccarlo non riesce si chiude, e il quadro non è mai in due posti.
 */
export async function auctionHungPainting(slot?: PaintingSlot): Promise<void> {
  if (!hasRoom()) {
    toast("🏠 Ti serve una stanza per mettere un quadro all'asta.", 3500);
    return;
  }
  const hung = roomPaintings(myRoom());
  if (!Object.keys(hung).length) {
    toast("🖼️ Nella tua stanza non ci sono quadri da mettere all'asta.", 3500);
    return;
  }
  const chosen =
    slot ??
    (await chooseHungPainting({
      title: "🔨 Quale quadro metti all'asta?",
      sub: "Tocca il quadro da staccare dalla parete: lo vedranno tutti su quadrivendo.it e nel catalogo della Galleria d'Arte.",
      action: "metti all'asta",
    }));
  const code = chosen ? hung[chosen] : null;
  if (!chosen || !code) return;
  const title = quotedTitle(code);
  const res = await openDialog({
    title: `🔨 Metti all'asta ${title || 'il quadro'}?`,
    text:
      "Il quadro si stacca dalla parete della tua stanza e va all'asta: riceve cuoricini e offerte, e tu accetti quella che preferisci (i soldi arrivano subito).\n\n" +
      "Finché non accetti un'offerta puoi ritirarlo e riappenderlo.",
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: "🔨 Metti all'asta", value: 'yes', color: '#e17055' },
    ],
  });
  if (res.action !== 'yes') return;
  if (!(await startAuction(code, { resale: true }))) return;
  try {
    await game.session.db.ref(`${worldNode('rooms_state')}/${myIdx()}`).update({
      [`paintings/${chosen}`]: null,
      [`sale/${chosen}`]: null,
    });
  } catch (error) {
    console.warn('[aste]', error);
    await cancelAuction(code);
    toast(
      'Non sono riuscito a staccare il quadro dalla parete: riprova quando sei connesso.',
      4000,
    );
  }
}

// ---------------------------------------------------------------- spazio espositivo

/** I miei quadri a cui è finito lo spazio espositivo: vanno appesi o buttati (vedi expiresAt). */
export const myExpiring = (): Auction[] =>
  all.filter((a) => a.by === me() && a.expiresAt !== undefined && !a.sold);

const dateOf = (t: number) =>
  new Date(t).toLocaleString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

const warned = new Set<string>();

/** Appena il server fa partire il timer (o al rientro), il pittore riceve l'avviso. */
async function checkExpiring(): Promise<void> {
  if (game.dialogResolve) return;
  const a = myExpiring().find((x) => !warned.has(x.id));
  if (!a) return;
  warned.add(a.id);
  await expiryChoice(a);
}

/** L'avviso con la scelta: appendere il quadro in camera o buttarlo. */
export async function expiryChoice(a: Auction): Promise<void> {
  if (a.expiresAt === undefined || a.by !== me()) return;
  sfx('mission');
  const notice = expiryNotice(paintingTitle(a.code));
  const res = await openDialog({
    title: notice.title,
    text:
      notice.body +
      `\n\n⏳ Hai tempo fino a ${dateOf(a.expiresAt)}. Intanto il quadro non è più esposto: niente offerte né cuoricini.`,
    buttons: [
      { label: 'Più tardi', value: null, color: '#57606f' },
      { label: '🗑️ Butta via', value: 'discard', color: '#636e72' },
      { label: '🖼️ Appendi in camera', value: 'hang', color: '#2ed573' },
    ],
  });
  if (res.action === 'hang') await withdrawAuction(a, false);
  else if (res.action === 'discard') await discardAuction(a);
  else toast('🖼️ Puoi decidere più tardi da quadrivendo.it, in «I miei quadri».', 4000);
}

/** Il pittore butta via il suo quadro all'asta. */
export async function discardAuction(a: Auction): Promise<void> {
  if (a.by !== me()) return;
  try {
    await auctionRef(a.id).remove();
  } catch (error) {
    console.warn('[aste]', error);
    toast('Non sono riuscito a buttare il quadro. Riprova quando sei connesso.', 4000);
    return;
  }
  if (a.bid) await sendSocial(a.bid.by, { type: 'artNo', amt: a.bid.amt, pic: a.id, why: 'gone' });
  toast('🗑️ Il quadro è finito nel cestino.', 3000);
}

/** Toglie dall'asta un quadro appena messo, se poi non si è riusciti ad appendere il nuovo. */
export async function cancelAuction(code: string): Promise<void> {
  try {
    await auctionRef(paintingId(code)).remove();
  } catch (error) {
    console.warn('[aste]', error);
  }
}

// ---------------------------------------------------------------- chi compra

/** Cuoricino al quadro all'asta (o lo si toglie). I propri quadri non si votano. */
export async function toggleVote(a: Auction): Promise<void> {
  if (a.by === me()) {
    toast('❤️ I tuoi quadri li votano gli altri giocatori.', 3000);
    return;
  }
  const voted = a.voters.has(me());
  try {
    if (voted) await auctionRef(a.id, `votes/${me()}`).remove();
    else await auctionRef(a.id, `votes/${me()}`).set(serverNow());
    if (!voted) sfx('coin');
  } catch (error) {
    console.warn('[aste]', error);
    toast('Voto non registrato: riprova quando sei connesso.', 3500);
  }
}

/** Offerta per un quadro all'asta: dev'essere più alta della migliore. */
export async function placeBid(a: Auction): Promise<void> {
  countUse('asta');
  if (!hasRoom()) {
    toast('🏠 Ti serve una stanza dove appendere il quadro.', 3500);
    return;
  }
  const pre = bidError(a, me(), minBid(a), Number.MAX_SAFE_INTEGER);
  if (pre) {
    toast(pre, 3500);
    return;
  }
  const res = await openDialog({
    title: "💰 Fai un'offerta",
    text:
      `Quanto offri a ${a.name} per ${nameOf(a, 'il suo quadro')}?\n\n` +
      (a.bid
        ? `La migliore offerta è di ${dindini(a.bid.amt)} (${a.bid.name}): devi offrire almeno ${dindini(minBid(a))}.`
        : 'Nessuno ha ancora fatto un’offerta.') +
      `\n\nSe il pittore la accetta paghi con la cassaforte (ora ${dindini(game.moneyLevel)}) e il quadro è tuo per sempre.`,
    input: { placeholder: 'Offerta in Đ', numeric: true, maxLength: 6 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: "Manda l'offerta", value: 'send', color: '#2ed573' },
    ],
  });
  if (res.action !== 'send') return;
  const amt = Number(res.value);
  const err = bidError(a, me(), amt, game.moneyLevel);
  if (err) {
    toast(err, 3500);
    return;
  }
  // il permesso di addebito: se accetta, il pittore prende i soldi dalla mia cassaforte
  if (!(await allowDebit(a.by, amt))) {
    toast('Offerta non registrata: riprova quando sei connesso.', 4000);
    return;
  }
  let prev: Auction['bid'] | null = null;
  let committed = false;
  try {
    const result = await withTimeout(
      auctionRef(a.id, 'bid').transaction((cur: unknown) => {
        // l'offerta di adesso, controllata come tutte le altre (decodeAuction)
        prev = decodeAuction(a.id, { code: a.code, by: a.by, t: a.t, bid: cur })?.bid ?? null;
        if (cur && !(prev && amt > prev.amt)) return undefined;
        return {
          by: me(),
          name: (game.player.myData.nick || 'Qualcuno').slice(0, 20),
          amt,
          t: serverNow(),
        };
      }),
      8000,
    );
    committed = !!result?.committed;
  } catch (error) {
    console.warn('[aste]', error);
  }
  if (!committed) {
    void dropDebit(a.by, amt);
    toast('Offerta non registrata: forse qualcuno ha appena offerto di più.', 4000);
    return;
  }
  // se il pittore mi ha bloccato l'avviso non parte: l'offerta si ritira, non resta a metà
  try {
    await sendSocial(a.by, { type: 'artOffer', amt, pic: a.id });
  } catch (error) {
    console.warn('[aste]', error);
    const back = prev as Auction['bid'] | null;
    await auctionRef(a.id, 'bid')
      .transaction((cur: unknown) => {
        const now = decodeAuction(a.id, { code: a.code, by: a.by, t: a.t, bid: cur })?.bid;
        return now?.by === me() && now.amt === amt ? (back ?? null) : undefined;
      })
      .catch(() => {});
    void dropDebit(a.by, amt);
    toast('Offerta non registrata.', 4000);
    return;
  }
  sfx('coin');
  // le offerte fatte, per la missione del giorno
  game.player.stats.auctionBids = (game.player.stats.auctionBids || 0) + 1;
  toast(`📨 Hai offerto ${dindini(amt)}: ora decide ${a.name}.`, 4000);
  const before = prev as Auction['bid'] | null;
  if (before && before.by !== me())
    await sendSocial(before.by, { type: 'artNo', amt: before.amt, pic: a.id, why: 'over' });
}

const asked = new Set<string>();

/** Le offerte accettate dal pittore e non ancora pagate: si propone di comprare. */
async function checkPurchases(): Promise<void> {
  if (game.dialogResolve || !hasRoom()) return;
  for (const a of all) {
    if (a.sold?.to !== me() || asked.has(a.id)) continue;
    // pagato già (la pagina si era chiusa prima di chiudere l'asta): si chiude e basta
    if (Object.values(roomPaintings(myRoom())).includes(a.code)) {
      await auctionRef(a.id)
        .remove()
        .catch(() => {});
      continue;
    }
    asked.add(a.id);
    if (a.sold.paid) await deliverPainting(a);
    else await completePurchase(a);
    return;
  }
}

/** Chi ha fatto l'offerta accettata paga il pittore e appende il quadro (o rinuncia). */
export async function completePurchase(a: Auction): Promise<void> {
  const sold = a.sold;
  if (!sold || sold.to !== me()) return;
  // già pagato al pittore: resta solo da appenderlo
  if (sold.paid) return deliverPainting(a);
  sfx('mission');
  const res = await openDialog({
    title: '🤝 Offerta accettata!',
    text:
      `${a.name} ha accettato la tua offerta di ${dindini(sold.amt)} per ${nameOf(a)}.\n\n` +
      'Paghi con la cassaforte e il quadro viene appeso nella tua stanza, tuo per sempre.',
    buttons: [
      { label: 'Rinuncio', value: 'no', color: '#57606f' },
      { label: `Compra (${dindini(sold.amt)})`, value: 'buy', color: '#2ed573' },
    ],
  });
  if (res.action === 'no') {
    try {
      await auctionRef(a.id).update({ sold: null, bid: null });
      await sendSocial(a.by, { type: 'artNo', amt: sold.amt, pic: a.id, why: 'gaveup' });
    } catch (error) {
      console.warn('[aste]', error);
    }
    toast('Hai rinunciato: il quadro resta all’asta.', 3000);
    return;
  }
  // chiusa senza scegliere: si riproporrà al prossimo ingresso
  if (res.action !== 'buy') return;
  if (game.moneyLevel < sold.amt) {
    toast(`❌ Ti servono ${dindini(sold.amt)} in cassaforte.`, 4000);
    asked.delete(a.id);
    return;
  }
  const spot = await pickWallSlot(a.code);
  if (!spot) {
    asked.delete(a.id);
    return;
  }
  const slot = spot.slot;
  const mine = myIdx();
  let committed = false;
  try {
    const reference = game.session.db.ref(worldNode('rooms_state'));
    await reference.get();
    const result = await withTimeout(
      reference.transaction((rooms: Record<string, RoomState> | null) => {
        if (!rooms) return undefined;
        const buyer = rooms[mine];
        const sellerKey = Object.keys(rooms).find((k) => rooms[k]?.ownerId === a.by);
        const seller = sellerKey === undefined ? null : rooms[sellerKey];
        if (!buyer || buyer.ownerId !== me() || !seller || String(sellerKey) === String(mine))
          return undefined;
        if (!Number.isSafeInteger(buyer.vaultMoney) || buyer.vaultMoney < sold.amt)
          return undefined;
        if (!Number.isSafeInteger(seller.vaultMoney)) return undefined;
        const sale = { ...(buyer.sale || {}) };
        delete sale[slot];
        rooms[sellerKey!] = { ...seller, vaultMoney: seller.vaultMoney + sold.amt };
        rooms[mine] = {
          ...buyer,
          vaultMoney: buyer.vaultMoney - sold.amt,
          paintings: { ...(buyer.paintings || {}), [slot]: a.code },
          sale,
        };
        return rooms;
      }),
      10000,
    );
    committed = !!result?.committed;
  } catch (error) {
    console.warn('[aste]', error);
  }
  if (!committed) {
    await spot.undo();
    toast('Acquisto non riuscito: controlla la cassaforte e riprova dal sito.', 4000);
    asked.delete(a.id);
    return;
  }
  await auctionRef(a.id)
    .remove()
    .catch(() => {});
  await sendSocial(a.by, { type: 'artSold', amt: sold.amt });
  // pagato da me: il permesso di addebito per lui non serve più
  void dropDebit(a.by, sold.amt);
  game.player.stats.paintingsBought = (game.player.stats.paintingsBought || 0) + 1;
  notePersonality('buyPainting', sold.amt);
  saveGame(true);
  sfx('success');
  toast(`🖼️ Hai comprato ${nameOf(a)} di ${a.name}! È appeso nella tua stanza.`, 4500);
  postGossip(
    `${game.player.myData.nick} ha comprato ${nameOf(a, 'un quadro')} di ${a.name} per ${dindini(sold.amt)} 🖼️`,
    [a.by],
  );
}

// ---------------------------------------------------------------- messaggi

/** Al pittore: è arrivata un'offerta per un suo quadro. */
export async function onArtOffer(m: SocialMessage, who: string): Promise<void> {
  const a = auctionById(String(m.pic || ''));
  const amt = Number(m.amt);
  if (!a || a.by !== me()) return;
  const text = `${who} offre ${dindini(amt)} per ${nameOf(a, 'il tuo quadro')}.`;
  sendNotify('🖼️ Offerta per il tuo quadro', text, 'art-offer');
  // si chiede subito solo se è ancora la migliore
  if (!a.bid || a.bid.by !== m.from || a.bid.amt !== amt || a.sold) {
    toast(`🖼️ ${text}`, 5000);
    return;
  }
  await acceptBid(a);
}

/** A chi ha offerto: il pittore ha accettato. */
export async function onArtAccept(m: SocialMessage): Promise<void> {
  const a = auctionById(String(m.pic || ''));
  if (!a || a.sold?.to !== me() || asked.has(a.id)) return;
  asked.add(a.id);
  if (a.sold.paid) await deliverPainting(a);
  else await completePurchase(a);
}

/** Offerta superata, quadro ritirato dall'asta, o compratore che ha rinunciato. */
export function onArtNo(m: SocialMessage, who: string): void {
  const a = auctionById(String(m.pic || ''));
  // l'offerta non vale più: il permesso di addebito per il pittore scende ("over" lo manda chi
  // ha offerto di più, gli altri il pittore stesso)
  const painter = a?.by ?? (m.why !== 'over' && typeof m.from === 'string' ? m.from : null);
  if (painter && m.why !== 'gaveup') void dropDebit(painter, Number(m.amt) || 0);
  const what = a ? nameOf(a) : 'il quadro';
  const amt = dindini(Number(m.amt) || 0);
  if (m.why === 'over')
    toast(
      `📈 Qualcuno ha offerto più di te (${amt}) per ${what}: puoi rilanciare dal catalogo.`,
      5000,
    );
  else if (m.why === 'out')
    toast(`🖼️ ${who} ha ritirato ${what} dall'asta e l'ha appeso in casa.`, 5000);
  else if (m.why === 'moved')
    toast(
      `🚚 ${who} ha traslocato in un altro condominio e ha portato con sé ${what}: la tua offerta non vale più.`,
      6000,
    );
  else if (m.why === 'nomoney')
    toast(
      `💸 ${who} ha accettato la tua offerta per ${what}, ma in cassaforte non avevi più ${amt}: l'offerta è annullata.`,
      6000,
    );
  else if (m.why === 'gone')
    toast(`🗑️ ${who} ha buttato via ${what}: la tua offerta non vale più.`, 5000);
  else if (m.why === 'bot') toast(`🎩 ${who} ha venduto ${what} a un collezionista.`, 5000);
  else if (m.why === 'gaveup') toast(`🙅 ${who} ha rinunciato a ${what}: l'asta continua.`, 5000);
}

/** Al pittore, dopo il pagamento: soldi in cassaforte e quadro venduto. */
export function onArtSold(buyer: string, amount: number): void {
  game.player.stats.paintingsSold = (game.player.stats.paintingsSold || 0) + 1;
  notePersonality('sellPainting');
  saveGame(false);
  const text = `🖼️ ${buyer} ha comprato il tuo quadro per ${dindini(amount)}!`;
  toast(text, 6000);
  sendNotify('Quadro venduto!', text, 'art-sold');
}

// ---------------------------------------------------------------- collezionisti

const sold = () => game.player.stats.paintingsSold || 0;
let collectorOpen = false;

/** Ogni tanto un collezionista fa un'offerta al pittore per un quadro all'asta. */
async function checkCollectors(): Promise<void> {
  if (collectorOpen || game.dialogResolve || !hasRoom() || game.player.isDead) return;
  const now = Date.now();
  const a = auctions().find((x) => x.by === me() && now >= x.nextBotAt);
  if (!a) return;
  collectorOpen = true;
  try {
    await collectorOffer(a);
  } finally {
    collectorOpen = false;
  }
}

async function collectorOffer(a: Auction): Promise<void> {
  // l'Artista riceve offerte più alte
  const amount = artistOffer(
    botOfferAmount(sold(), a.id, a.round),
    levelOf(game.player.personality, 'artist'),
  );
  const what = nameOf(a, 'il tuo quadro');
  sendNotify(
    '🖼️ Offerta per il tuo quadro',
    `Un collezionista offre ${dindini(amount)} per ${what}.`,
    'art-offer',
  );
  sfx('mission');
  const res = await openDialog({
    title: '🎩 Offerta di un collezionista',
    text:
      `Un collezionista ha visto ${what} all'asta e offre ${dindini(amount)}.` +
      (a.bid
        ? `\n\nLa migliore offerta di un giocatore è ${dindini(a.bid.amt)} (${a.bid.name}).`
        : '') +
      `\n\nSe accetti, il quadro va al collezionista; se rifiuti resta all'asta e più avanti potrebbe arrivare un'altra offerta.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: `Accetta (${dindini(amount)})`, value: 'yes', color: '#2ed573' },
    ],
  });
  const fresh = auctionById(a.id);
  if (!fresh || fresh.sold) return;
  if (res.action !== 'yes') {
    const round = a.round + 1;
    await auctionRef(a.id)
      .update({ round, nextBotAt: nextOfferTime(Date.now(), a.id, round) })
      .catch((e: unknown) => console.warn('[aste]', e));
    toast("Offerta rifiutata: il quadro resta all'asta.", 3000);
    return;
  }
  try {
    await auctionRef(a.id).remove();
  } catch (error) {
    console.warn('[aste]', error);
    toast('Vendita non riuscita: riprova quando sei connesso.', 4000);
    return;
  }
  if (!(await creditMoney(amount))) return;
  if (fresh.bid)
    await sendSocial(fresh.bid.by, { type: 'artNo', amt: fresh.bid.amt, pic: a.id, why: 'bot' });
  game.player.stats.paintingsSold = sold() + 1;
  notePersonality('sellPainting');
  saveGame(true);
  sfx('coin');
  postGossip(
    `${game.player.myData.nick} ha venduto ${nameOf(a, 'un quadro')} a un collezionista per ${dindini(amount)} 🖼️`,
  );
  toast(`💰 Quadro venduto al collezionista per ${dindini(amount)}!`, 5000);
}
