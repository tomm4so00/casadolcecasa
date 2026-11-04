// Oggetti in edizione limitata: acquisto al negozio di una copia numerata, mobili nella propria
// stanza, offerte tra giocatori e passaggio di proprietà.
//
// Scambio: chi compra fa un'offerta (non può ritirarla) → il proprietario accetta o rifiuta, una
// volta sola → se accetta, chi compra paga e prende la copia. Se chi compra spende i soldi e non può
// più pagare, l'offerta si annulla da sola. Così nessuno perde soldi o oggetti a metà.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney, transferMoney } from './economy.js';
import { publishRoomLayout, saveGame } from './saves.js';
import { sendSocial } from './social.js';
import { postGossip } from './gossip.js';
import { LIMITED_FURNITURE } from './data/catalogues.js';
import {
  LIMITED_COPIES,
  type Ledger,
  type LedgerEntry,
  acceptSale,
  claimSale,
  copiesLeft,
  copyOf,
  decodeLedger,
  itemsOf,
  nextFreeCopy,
  offerError,
  type LimitedOffer,
  decodeOffers,
  offerPushText,
  offerStillValid,
  type SentOffer,
  decodeSent,
  unaffordable,
  withdrawnText,
} from './limited-rules.js';
import { lifetime } from './runtime.js';
import { sendNotify } from './needs.js';

let ledger: Ledger = {};
let started = false;
const listeners = new Set<() => void>();

const me = (): string => game.session.myPlayerId;
const ref = (item: string, n: number | string): GameValue =>
  game.session.db.ref(`sims_limited/${item}/${n}`);

/** Nome dell'oggetto (vestito o mobile). */
export function limitedName(item: string): string {
  const cloth = (game.shopCatalog || []).find((i: GameValue) => i.id === item);
  const furn = LIMITED_FURNITURE.find((f) => f.id === item);
  return cloth?.name || furn?.name || item;
}
const label = (item: string, n: number) => `${limitedName(item)} #${n}/${LIMITED_COPIES}`;

export const isLimitedId = (id: unknown): id is string =>
  typeof id === 'string' && id.startsWith('ltd_');

/** Possiedo una copia di questo oggetto? */
export const ownsLimited = (item: string): boolean => copyOf(ledger, item, me()) !== null;
export const myCopy = (item: string): number | null => copyOf(ledger, item, me());
export const limitedLeft = (item: string): number => copiesLeft(ledger, item);
/** Oggetti in edizione limitata di un giocatore. */

/** Si aggiorna quando cambia il registro (per ridisegnare negozi e armadio). */
export function onLedgerChange(fn: () => void): void {
  listeners.add(fn);
}

/** Ascolta il registro: chi possiede cosa. */
export function startLimited(): void {
  if (started) return;
  started = true;
  game.session.db.ref('sims_limited').on('value', (snap: GameValue): void => {
    const before = JSON.stringify(itemsOf(ledger, me()));
    ledger = decodeLedger(snap.val());
    // un capo venduto non si può più indossare
    for (const sl of game.SLOTS) {
      const id = game.player.equipped[sl];
      if (isLimitedId(id) && !ownsLimited(id)) game.player.equipped[sl] = game.DEFAULT_LOOK[sl];
    }
    if (JSON.stringify(itemsOf(ledger, me())) !== before) {
      publishRoomLayout(); // i mobili comprati o venduti compaiono/spariscono per chi visita
      saveGame(false);
    }
    listeners.forEach((fn) => fn());
  });
  startOffers();
  startSent();
}

// ---------------------------------------------------------------- mobili nella stanza

const props = new Map<string, GameValue>();

/** Oggetti dei mobili in edizione limitata (posizione salvata come per gli altri mobili). */
export function limitedFurnitureProps(): Map<string, GameValue> {
  for (const def of LIMITED_FURNITURE)
    if (!props.has(def.id)) props.set(def.id, { ...def.propData, ltd: def.id });
  return props;
}

/** Mobili in edizione limitata da mettere nella mia stanza (quelli che possiedo). */
export function limitedRoomItems(): Record<string, GameValue> {
  const out: Record<string, GameValue> = {};
  for (const [id, prop] of limitedFurnitureProps()) {
    const n = myCopy(id);
    if (n) out[id] = Object.assign(prop, { name: `${limitedName(id)} #${n}/${LIMITED_COPIES}` });
  }
  return out;
}

// ---------------------------------------------------------------- acquisto al negozio

/** Compra una copia al negozio: si paga, poi si prende il primo numero libero. */
export async function buyLimited(item: string, price: number): Promise<void> {
  if (ownsLimited(item)) {
    toast('Hai già una copia di questo oggetto.', 3000);
    return;
  }
  const n = nextFreeCopy(ledger, item);
  if (!n) {
    toast(
      '💎 Esaurito: tutte le copie sono già di qualcuno. Prova a fare un’offerta a chi le ha!',
      5000,
    );
    return;
  }
  if (game.moneyLevel < price) {
    toast(`❌ Ti servono ${price.toLocaleString('it-IT')} € per ${limitedName(item)}.`, 4000);
    return;
  }
  const res = await openDialog({
    title: `💎 ${limitedName(item)}`,
    text: `Edizione limitata: ne esistono solo ${LIMITED_COPIES} copie numerate in tutto il gioco, e ne restano ${copiesLeft(ledger, item)}.\n\nPrezzo: ${price.toLocaleString('it-IT')} €. Potrai venderla ad altri giocatori se ti fanno un’offerta.`,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: `💎 Compra (${price.toLocaleString('it-IT')} €)`, value: 'ok', color: '#8e44ad' },
    ],
  });
  if (res.action !== 'ok' || !(await spendMoney(price))) return;
  // il primo numero ancora libero (se qualcuno ci precede, si prova il successivo)
  let got: number | null = null;
  for (let k = 1; k <= LIMITED_COPIES && !got; k++) {
    try {
      const r = await ref(item, k).transaction((cur: GameValue) =>
        cur ? undefined : { o: me(), on: game.player.myData.nick, t: Date.now() },
      );
      if (r?.committed) got = k;
    } catch (error) {
      console.warn('[edizione limitata]', error);
    }
  }
  if (!got) {
    await creditMoney(price); // esaurito proprio adesso: soldi restituiti
    toast('💎 Qualcuno ha preso l’ultima copia un attimo prima di te: soldi restituiti.', 5000);
    return;
  }
  sfx('personality');
  toast(`💎 È tua la copia ${label(item, got)}!`, 5000);
  postGossip(`${game.player.myData.nick} ha comprato ${label(item, got)} 💎`);
  saveGame(true);
}

// ---------------------------------------------------------------- offerte tra giocatori

/** Chi visita fa un'offerta per la copia `n` di `item`, posseduta da `owner`. */
export async function makeOffer(item: string, n: number): Promise<void> {
  const entry = ledger[item]?.[String(n)];
  if (!entry) return;
  const res = await openDialog({
    title: `💎 Offerta per ${label(item, n)}`,
    text: `Appartiene a ${entry.on}. Quanto offri? Se accetta, i soldi passano dalla tua cassaforte alla sua e l’oggetto diventa tuo.\n\nAttenzione: una volta inviata non puoi ritirarla. Se però spendi i soldi e non puoi più pagare, l’offerta si annulla.\n\nIn cassaforte hai ${game.moneyLevel.toLocaleString('it-IT')} €.`,
    input: { placeholder: 'Offerta in €', numeric: true, maxLength: 7 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: '💌 Invia l’offerta', value: 'ok', color: '#8e44ad' },
    ],
  });
  if (res.action !== 'ok') return;
  const amount = Number(res.value);
  const error = offerError(amount, game.moneyLevel, ownsLimited(item), entry.o === me());
  if (error) {
    toast('❌ ' + error, 4000);
    return;
  }
  // l'offerta aspetta il proprietario finché non risponde: anche se è offline, la trova quando
  // rientra (e il server gli manda una notifica sul telefono)
  const t = Date.now();
  const id = t.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  try {
    await game.session.db.ref(`sims_ltd_offers/${entry.o}/${id}`).set({
      from: me(),
      fromName: game.player.myData.nick,
      item,
      n,
      amt: amount,
      t,
      name: label(item, n),
    });
    // la ricordo anch'io, per annullarla se non avrò più i soldi
    await game.session.db
      .ref(`sims_ltd_sent/${me()}/${id}`)
      .set({ owner: entry.o, item, n, amt: amount, t });
    toast(
      `💌 Offerta inviata a ${entry.on}: ${amount.toLocaleString('it-IT')} € per ${label(item, n)}. Se è offline la vedrà quando rientra.`,
      5000,
    );
  } catch {
    toast('Non sono riuscito a inviare l’offerta. Riprova quando sei connesso.', 4000);
  }
}

// ---------------------------------------------------------------- offerte inviate

let sent: SentOffer[] = [];
const cancelling = new Set<string>();

/** Dimentica un'offerta inviata (ha avuto risposta o è stata annullata). */
function forgetSent(id: unknown): void {
  if (typeof id !== 'string' || !/^[a-z0-9_]{1,40}$/.test(id)) return;
  void game.session.db
    .ref(`sims_ltd_sent/${me()}/${id}`)
    .remove()
    .catch(() => {});
}

/** Non ho più i soldi per pagare: l'offerta si annulla e il proprietario viene avvisato. */
async function cancelOffer(s: SentOffer): Promise<void> {
  if (cancelling.has(s.id)) return;
  cancelling.add(s.id);
  let removed = false;
  try {
    // riesce solo se il proprietario non ha ancora risposto
    await game.session.db.ref(`sims_ltd_offers/${s.owner}/${s.id}`).remove();
    removed = true;
  } catch {
    // già accettata o rifiutata: decide la risposta che arriverà
  }
  if (removed) {
    void sendSocial(s.owner, { type: 'ltdGone', id: s.id, item: s.item, n: s.n, amt: s.amt });
    toast(
      `💸 La tua offerta di ${s.amt.toLocaleString('it-IT')} € per ${label(s.item, s.n)} è stata annullata: non hai più abbastanza soldi.`,
      6000,
    );
  }
  forgetSent(s.id);
}

/** Tiene d'occhio le offerte inviate: se spendo i soldi, quelle che non posso pagare si annullano. */
function startSent(): void {
  game.session.db.ref(`sims_ltd_sent/${me()}`).on('value', (snap: GameValue): void => {
    sent = decodeSent(snap.val());
  });
  lifetime.setInterval(() => {
    if (!game.session.saveReady) return;
    for (const s of unaffordable(sent, game.moneyLevel)) void cancelOffer(s);
  }, 3000);
}

// ---------------------------------------------------------------- offerte ricevute

let offers: LimitedOffer[] = [];
let reviewing = false;
/** Finestra chiusa senza scegliere (da un'altra finestra): si ripropone fra poco. */
const retryAt = new Map<string, number>();
/** Offerte ritirate già segnalate (per non dirlo due volte). */
const withdrawnShown = new Set<string>();

/** Ascolta le offerte ricevute e le propone una alla volta. */
function startOffers(): void {
  let first = true;
  game.session.db.ref(`sims_ltd_offers/${me()}`).on('value', (snap: GameValue): void => {
    const next = decodeOffers(snap.val());
    // offerta nuova mentre il gioco è in un'altra scheda: notifica del browser
    if (!first)
      for (const o of next)
        if (!offers.some((x) => x.id === o.id))
          sendNotify('💎 Hai ricevuto un’offerta!', offerPushText(o).body, 'ltd-offer');
    first = false;
    offers = next;
  });
  // appena possibile (anche al rientro nel gioco) si propone la prima offerta in attesa
  lifetime.setInterval(() => {
    if (reviewing || game.dialogResolve || !game.session.saveReady || game.player.isDead) return;
    const now = Date.now();
    const o = offers.find((x) => (retryAt.get(x.id) || 0) <= now);
    if (o) void reviewOffer(o);
  }, 3000);
}

/** Avvisa il proprietario che l'offerta è stata ritirata (una volta sola). */
async function showWithdrawn(id: string, fromName: string, name: string): Promise<void> {
  if (withdrawnShown.has(id)) return;
  withdrawnShown.add(id);
  await openDialog({
    title: '💸 Offerta ritirata',
    text: withdrawnText(fromName, name),
    buttons: [{ label: 'Ok', value: 'ok', color: '#57606f' }],
  });
}

/** Toglie l'offerta dalle attese: true solo per chi ci riesce per primo (si risponde una volta). */
async function takeOffer(o: LimitedOffer): Promise<boolean> {
  if (o.id.startsWith('msg_')) return true; // arrivata come messaggio (versione precedente)
  try {
    const r = await game.session.db
      .ref(`sims_ltd_offers/${me()}/${o.id}`)
      .transaction((cur: GameValue) => (cur ? null : undefined));
    return !!r?.committed;
  } catch (error) {
    console.warn('[edizione limitata]', error);
    return false;
  }
}

/** Il proprietario valuta un'offerta: accetta o rifiuta, una volta sola. */
export async function reviewOffer(o: LimitedOffer): Promise<void> {
  if (reviewing) return;
  reviewing = true;
  try {
    // copia già venduta a qualcun altro: l'offerta non vale più
    if (!offerStillValid(ledger, o, me())) {
      if (await takeOffer(o))
        void sendSocial(o.from, { type: 'ltdNo', id: o.id, item: o.item, n: o.n, amt: o.amt });
      return;
    }
    sfx('gossip');
    const res = await openDialog({
      title: '💎 Un’offerta per te!',
      text: `${o.fromName} offre ${o.amt.toLocaleString('it-IT')} € per il tuo oggetto in edizione limitata «${label(o.item, o.n)}».\n\nPuoi rispondere una volta sola. Se accetti, quando ti avrà pagato l’oggetto diventerà suo.`,
      buttons: [
        { label: 'Rifiuta', value: 'no', color: '#57606f' },
        {
          label: `🤝 Accetta (${o.amt.toLocaleString('it-IT')} €)`,
          value: 'yes',
          color: '#2ed573',
        },
      ],
    });
    if (res.action !== 'no' && res.action !== 'yes') {
      retryAt.set(o.id, Date.now() + 30_000); // chiusa da un'altra finestra: si ripropone
      return;
    }
    // nel frattempo chi l'ha fatta potrebbe aver speso i soldi: allora è già stata ritirata
    if (!(await takeOffer(o))) {
      await showWithdrawn(o.id, o.fromName, label(o.item, o.n));
      return;
    }
    if (res.action === 'no') {
      void sendSocial(o.from, { type: 'ltdNo', id: o.id, item: o.item, n: o.n, amt: o.amt });
      toast(`Hai rifiutato l’offerta di ${o.fromName}.`, 3500);
      return;
    }
    let ok = false;
    try {
      const r = await ref(o.item, o.n).transaction((cur: GameValue) => {
        const e =
          (decodeLedger({ [o.item]: { [o.n]: cur } })[o.item]?.[String(o.n)] as LedgerEntry) ||
          null;
        return acceptSale(e, me(), o.from, o.amt, Date.now()) || undefined;
      });
      ok = !!r?.committed;
    } catch (error) {
      console.warn('[edizione limitata]', error);
    }
    if (!ok) {
      void sendSocial(o.from, { type: 'ltdNo', id: o.id, item: o.item, n: o.n, amt: o.amt });
      toast('Non sono riuscito a completare la vendita: l’offerta è stata annullata.', 4000);
      return;
    }
    await sendSocial(o.from, { type: 'ltdAccept', id: o.id, item: o.item, n: o.n, amt: o.amt });
    toast(
      `🤝 Hai accettato: quando ${o.fromName} paga (anche se ora è offline, appena rientra), ${label(o.item, o.n)} diventa suo.`,
      6000,
    );
  } finally {
    reviewing = false;
  }
}

/** Offerta arrivata come messaggio (versione precedente del gioco): la si tratta allo stesso modo. */
export async function onLimitedOffer(m: GameValue, who: string): Promise<void> {
  const item = String(m.item || ''),
    n = Number(m.n),
    amt = Number(m.amt);
  if (!isLimitedId(item) || !(amt > 0) || typeof m.from !== 'string') return;
  await reviewOffer({
    id: 'msg_' + (m.t || Date.now()),
    from: m.from,
    fromName: who,
    item,
    n,
    amt,
    t: Number(m.t) || 0,
    name: label(item, n),
  });
}

/** Chi aveva fatto l'offerta l'ha annullata (non può più pagare): avviso e, se era già accettata, la copia torna libera da vendere. */
export async function onLimitedWithdrawn(m: GameValue, who: string): Promise<void> {
  const item = String(m.item || ''),
    n = Number(m.n),
    amt = Number(m.amt);
  if (!isLimitedId(item) || typeof m.from !== 'string') return;
  if (m.sale) {
    try {
      await ref(item, n).transaction((cur: GameValue) => {
        if (!cur || cur.o !== me() || cur.sale?.to !== m.from || cur.sale?.p !== amt)
          return undefined;
        const { sale: _sale, ...rest } = cur;
        return rest;
      });
    } catch (error) {
      console.warn('[edizione limitata]', error);
    }
  }
  await showWithdrawn(String(m.id || 'msg_' + m.t), who, label(item, n));
}

/** Il compratore riceve la risposta: se accettata, paga e prende l'oggetto. */
export async function onLimitedAnswer(m: GameValue, who: string, accepted: boolean): Promise<void> {
  const item = String(m.item || ''),
    n = Number(m.n),
    amount = Number(m.amt);
  forgetSent(m.id);
  if (!accepted) {
    toast(`🙅 ${who} ha rifiutato la tua offerta per ${label(item, n)}.`, 5000);
    return;
  }
  const entry = ledger[item]?.[String(n)];
  if (!entry || entry.sale?.to !== me() || entry.sale.p !== amount) return;
  if (game.moneyLevel < amount) {
    // ho speso i soldi nel frattempo: l'offerta si annulla e il venditore viene avvisato
    void sendSocial(entry.o, { type: 'ltdGone', id: m.id, sale: true, item, n, amt: amount });
    toast(
      `💸 ${who} ha accettato, ma non hai più ${amount.toLocaleString('it-IT')} € in cassaforte: l’offerta è stata annullata.`,
      6000,
    );
    return;
  }
  if (!(await transferMoney(entry.o, amount))) {
    toast('Pagamento non riuscito: riprova facendo una nuova offerta.', 5000);
    return;
  }
  let ok = false;
  try {
    const r = await ref(item, n).transaction((cur: GameValue) => {
      const e = (decodeLedger({ [item]: { [n]: cur } })[item]?.[String(n)] as LedgerEntry) || null;
      return claimSale(e, me(), game.player.myData.nick, amount, Date.now()) || undefined;
    });
    ok = !!r?.committed;
  } catch (error) {
    console.warn('[edizione limitata]', error);
  }
  if (!ok) {
    toast(
      '⚠️ Hai pagato ma la vendita non era più valida: chiedi al venditore di restituirti i soldi.',
      7000,
    );
    return;
  }
  sfx('personality');
  toast(`💎 Affare fatto! ${label(item, n)} ora è tuo.`, 5000);
  postGossip(
    `${game.player.myData.nick} ha comprato ${label(item, n)} da ${who} per ${amount.toLocaleString('it-IT')} € 💎`,
    [m.from],
  );
  saveGame(true);
}

// ---------------------------------------------------------------- visite

/** Proprietario della stanza in cui mi trovo (null se è la mia o non c'è). */
function roomOwner(): { id: string; name: string } | null {
  const room: GameValue = game.roomsState?.[game.currentRoomIdx ?? -1];
  if (!room?.ownerId || room.ownerId === me()) return null;
  return { id: room.ownerId, name: room.owner || 'Giocatore' };
}

/** Copia del mobile `item` posseduta da chi abita la stanza visitata. */
export function visitedCopy(item: string): number | null {
  const owner = roomOwner();
  return owner ? copyOf(ledger, item, owner.id) : null;
}

/** Vicino all'armadio di un altro: i capi in edizione limitata che possiede. */
export async function wardrobeOffers(): Promise<boolean> {
  const owner = roomOwner();
  if (!owner) return false;
  const clothes = itemsOf(ledger, owner.id).filter((x) =>
    (game.shopCatalog || []).some((i: GameValue) => i.id === x.item),
  );
  if (!clothes.length) return false;
  const res = await openDialog({
    title: `💎 L’armadio di ${owner.name}`,
    text:
      clothes
        .map((c) => `${owner.name} possiede ${label(c.item, c.n)} a edizione limitata.`)
        .join('\n') + '\n\nFai un’offerta!',
    buttons: [
      ...clothes.map((c) => ({
        label: `💌 Offerta: ${limitedName(c.item)}`,
        value: `${c.item}|${c.n}`,
        color: '#8e44ad',
      })),
      { label: 'Chiudi', value: null, color: '#57606f' },
    ],
  });
  if (res.action) {
    const [item, n] = String(res.action).split('|');
    await makeOffer(item, Number(n));
  }
  return true;
}

/** Vicino all'armadio di un altro: "X possiede … a edizione limitata, fai un'offerta" (null se niente). */
export function visitedLimitedClothes(): string | null {
  const owner = roomOwner();
  if (!owner) return null;
  const clothes = itemsOf(ledger, owner.id).filter((x) =>
    (game.shopCatalog || []).some((i: GameValue) => i.id === x.item),
  );
  if (!clothes.length) return null;
  const what =
    clothes.length === 1 ? label(clothes[0].item, clothes[0].n) : `${clothes.length} capi`;
  return `${owner.name} possiede ${what} a edizione limitata: fai un'offerta`;
}

/** Testo del pulsante vicino a un mobile in edizione limitata di un altro. */
export function offerButtonText(item: string): string | null {
  const n = visitedCopy(item);
  return n ? `💎 Fai un’offerta per ${label(item, n)}` : null;
}
