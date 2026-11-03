// Oggetti in edizione limitata: acquisto al negozio di una copia numerata, mobili nella propria
// stanza, offerte tra giocatori e passaggio di proprietà.
//
// Scambio: chi compra fa un'offerta → il proprietario accetta (la copia resta sua, "venduta a…")
// → chi compra paga il proprietario e prende la copia. Così nessuno perde soldi o oggetti a metà.
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
} from './limited-rules.js';

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
export const limitedOf = (playerId: string) => itemsOf(ledger, playerId);

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
    text: `Appartiene a ${entry.on}. Quanto offri? Se accetta, i soldi passano dalla tua cassaforte alla sua e l’oggetto diventa tuo.\n\nIn cassaforte hai ${game.moneyLevel.toLocaleString('it-IT')} €.`,
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
  try {
    await sendSocial(entry.o, { type: 'ltdOffer', item, n, amt: amount });
    toast(
      `💌 Offerta inviata a ${entry.on}: ${amount.toLocaleString('it-IT')} € per ${label(item, n)}.`,
      4500,
    );
  } catch {
    toast('Non sono riuscito a inviare l’offerta. Riprova quando sei connesso.', 4000);
  }
}

/** Il proprietario riceve un'offerta. */
export async function onLimitedOffer(m: GameValue, who: string): Promise<void> {
  const item = String(m.item || ''),
    n = Number(m.n),
    amount = Number(m.amt);
  const entry = ledger[item]?.[String(n)];
  if (!isLimitedId(item) || !entry || entry.o !== me() || !(amount > 0)) return;
  while (game.dialogResolve) await new Promise((r) => setTimeout(r, 1200));
  sfx('gossip');
  const res = await openDialog({
    title: '💎 Un’offerta per te!',
    text: `${who} offre ${amount.toLocaleString('it-IT')} € per il tuo oggetto in edizione limitata «${label(item, n)}».\n\nSe accetti, quando ti avrà pagato l’oggetto diventerà suo.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: `🤝 Accetta (${amount.toLocaleString('it-IT')} €)`, value: 'yes', color: '#2ed573' },
    ],
  });
  if (res.action !== 'yes') {
    void sendSocial(m.from, { type: 'ltdNo', item, n, amt: amount });
    return;
  }
  let ok = false;
  try {
    const r = await ref(item, n).transaction((cur: GameValue) => {
      const e = (decodeLedger({ [item]: { [n]: cur } })[item]?.[String(n)] as LedgerEntry) || null;
      return acceptSale(e, me(), m.from, amount, Date.now()) || undefined;
    });
    ok = !!r?.committed;
  } catch (error) {
    console.warn('[edizione limitata]', error);
  }
  if (!ok) {
    toast('Non sono riuscito ad accettare l’offerta.', 4000);
    return;
  }
  await sendSocial(m.from, { type: 'ltdAccept', item, n, amt: amount });
  toast(`🤝 Hai accettato: quando ${who} paga, ${label(item, n)} diventa suo.`, 5000);
}

/** Il compratore riceve la risposta: se accettata, paga e prende l'oggetto. */
export async function onLimitedAnswer(m: GameValue, who: string, accepted: boolean): Promise<void> {
  const item = String(m.item || ''),
    n = Number(m.n),
    amount = Number(m.amt);
  if (!accepted) {
    toast(`🙅 ${who} ha rifiutato la tua offerta per ${label(item, n)}.`, 5000);
    return;
  }
  const entry = ledger[item]?.[String(n)];
  if (!entry || entry.sale?.to !== me() || entry.sale.p !== amount) return;
  if (game.moneyLevel < amount) {
    toast(`❌ ${who} ha accettato, ma non hai più ${amount} € in cassaforte.`, 5000);
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
