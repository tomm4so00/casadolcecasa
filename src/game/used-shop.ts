// Negozio dell'usato: cinque espositori dove i giocatori mettono in vendita i loro pezzi da
// collezione al prezzo che vogliono. Le regole sono in collect-rules.ts.
//
// Comprare: si prenota il pezzo (nessun altro può comprarlo nel frattempo), si pagano i soldi al
// venditore, poi il pezzo passa al compratore e l'espositore si libera. Se il pagamento non riesce,
// la prenotazione si toglie e il pezzo resta in vendita.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { transferMoney } from './economy.js';
import { saveGame } from './saves.js';
import { postGossip } from './gossip.js';
import { sendSocial } from './social.js';
import { collectState, onCollectChange } from './collect.js';
import { recordActivity } from './activity.js';
import {
  type CollectOwner,
  STANDS,
  collectible,
  completeSale,
  decodeCollect,
  reserveSale,
  reservedBy,
  sellable,
  usedListing,
  usedPriceError,
} from './collect-rules.js';

/** Ambiente del negozio. */
export const USED_ENV = 'usato';

const me = (): string => game.session.myPlayerId;
const ref = (path: string): GameValue => game.session.db.ref('sims_collect/' + path);
const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Legge un proprietario dal valore grezzo di una transazione. */
function ownerOf(id: string, cur: unknown): CollectOwner | null {
  return decodeCollect({ owners: { [id]: cur } }).owners[id] || null;
}

/** Il nome sopra ogni espositore: il pezzo in vendita e chi lo vende. */
function updateUsedNames(): void {
  const map: GameValue = game.usedShopFurniture;
  if (!map) return;
  for (let i = 0; i < STANDS; i++) {
    const l = usedListing(collectState(), i);
    const it = map['usedStand' + i];
    if (it) it.name = l ? `${l.c.emoji} ${l.c.name} · di ${l.owner.on}` : 'Espositore libero 🏷️';
  }
}
onCollectChange(updateUsedNames);

/** Testo del pulsante vicino all'espositore `i`. */
export function usedPrompt(i: number): { text: string; locked?: boolean } {
  const state = collectState();
  const l = usedListing(state, i);
  if (!l) return { text: '🏷️ Metti in vendita un tuo pezzo da collezione' };
  if (l.owner.o === me()) return { text: `↩️ Ritira ${l.c.name} (${euro(l.sale.p)})` };
  const other = reservedBy(l.sale, serverNow());
  if (other && other !== me()) return { text: '⏳ Qualcuno lo sta comprando…', locked: true };
  return { text: `${l.c.emoji} Compra ${l.c.name} (${euro(l.sale.p)})` };
}

/** Preme il pulsante dell'espositore `i`. */
export async function usedAct(i: number): Promise<void> {
  const l = usedListing(collectState(), i);
  if (!l) await listItem(i);
  else if (l.owner.o === me()) await withdraw(i);
  else await buy(i);
}

// ---------------------------------------------------------------- vendere

async function listItem(i: number): Promise<void> {
  const mine = sellable(collectState(), me());
  if (!mine.length) {
    await openDialog({
      title: '🏷️ Negozio dell’usato',
      text: 'Qui puoi vendere ad altri giocatori i tuoi pezzi da collezione, al prezzo che vuoi.\n\nPer ora non hai pezzi da mettere in vendita: li trovi nel negozio di oggetti da collezione, qui nel centro commerciale.',
      buttons: [{ label: 'Ok', value: null, color: '#57606f' }],
    });
    return;
  }
  const pick = await openDialog({
    title: '🏷️ Cosa vuoi vendere?',
    text: 'Scegli il pezzo da mettere in questo espositore. Chi lo compra ti paga direttamente in cassaforte, anche se in quel momento non sei in gioco.',
    buttons: [
      ...mine.map((c) => ({ label: `${c.emoji} ${c.name}`, value: c.id, color: '#8e44ad' })),
      { label: 'Annulla', value: null, color: '#57606f' },
    ],
  });
  const c = collectible(pick.action);
  if (!c) return;
  const res = await openDialog({
    title: `${c.emoji} ${c.name}`,
    text: `A quanto lo vendi? Al negozio costava ${euro(c.price)}.\nPuoi ritirarlo dalla vendita quando vuoi, finché nessuno lo compra.`,
    input: { placeholder: 'Prezzo in €', numeric: true, maxLength: 7 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: '🏷️ Metti in vendita', value: 'ok', color: '#27ae60' },
    ],
  });
  if (res.action !== 'ok') return;
  const price = Number(res.value);
  const error = usedPriceError(price);
  if (error) {
    toast('❌ ' + error, 4000);
    return;
  }
  if (usedListing(collectState(), i)) {
    toast('🏷️ Qualcuno ha appena occupato questo espositore: provane un altro.', 4000);
    return;
  }
  // prima l'annuncio sul pezzo, poi il pezzo nell'espositore
  let ok = false;
  try {
    const r = await ref('owners/' + c.id).transaction((cur: GameValue) => {
      if (cur === null) return null;
      const o = ownerOf(c.id, cur);
      if (!o || o.o !== me() || o.sale) return undefined;
      return { ...cur, sale: { p: price, t: Date.now(), st: i } };
    });
    ok = !!r?.committed && ownerOf(c.id, r.snapshot?.val())?.sale?.st === i;
    if (ok) {
      const s = await ref('used/' + i).transaction((cur: GameValue) => {
        // libero, oppure col pezzo di un annuncio che non c'è più
        if (typeof cur === 'string' && cur !== c.id && usedListing(collectState(), i))
          return undefined;
        return c.id;
      });
      ok = !!s?.committed && s.snapshot?.val() === c.id;
      if (!ok) await ref(`owners/${c.id}/sale`).set(null);
    }
  } catch (error) {
    console.warn('[usato]', error);
    ok = false;
  }
  if (!ok) {
    toast('🏷️ Non è stato possibile metterlo in vendita: riprova.', 4000);
    return;
  }
  recordActivity('antiques');
  sfx('coin');
  toast(`🏷️ ${c.name} è in vendita a ${euro(price)}!`, 4500);
}

async function withdraw(i: number): Promise<void> {
  const l = usedListing(collectState(), i);
  if (!l) return;
  const res = await openDialog({
    title: `${l.c.emoji} ${l.c.name}`,
    text: `È in vendita a ${euro(l.sale.p)}. Vuoi ritirarlo? Torna nella tua collezione.`,
    buttons: [
      { label: 'Lascialo in vendita', value: null, color: '#57606f' },
      { label: '↩️ Ritira', value: 'ok', color: '#e17055' },
    ],
  });
  if (res.action !== 'ok') return;
  let ok = false;
  try {
    const r = await ref('owners/' + l.c.id).transaction((cur: GameValue) => {
      if (cur === null) return null;
      const o = ownerOf(l.c.id, cur);
      if (!o || o.o !== me() || !o.sale || reservedBy(o.sale, serverNow())) return undefined;
      const next = { ...cur };
      delete next.sale;
      return next;
    });
    ok = !!r?.committed && !ownerOf(l.c.id, r.snapshot?.val())?.sale;
    if (ok) await ref('used/' + i).set(null);
  } catch (error) {
    console.warn('[usato]', error);
  }
  if (ok) toast(`↩️ ${l.c.name} è tornato nella tua collezione.`, 4000);
  else toast('⏳ Qualcuno lo sta comprando proprio adesso: riprova tra poco.', 4500);
}

// ---------------------------------------------------------------- comprare

async function buy(i: number): Promise<void> {
  const l = usedListing(collectState(), i);
  if (!l) return;
  const { c, owner, sale } = l;
  if (game.moneyLevel < sale.p) {
    toast(`❌ Ti servono ${euro(sale.p)} in cassaforte per ${c.name}.`, 4000);
    return;
  }
  const res = await openDialog({
    title: `${c.emoji} ${c.name}`,
    text: `Pezzo unico, venduto da ${owner.on}.\nPrezzo: ${euro(sale.p)}: i soldi vanno direttamente al venditore.`,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: `🏷️ Compra (${euro(sale.p)})`, value: 'ok', color: '#27ae60' },
    ],
  });
  if (res.action !== 'ok') return;
  const path = 'owners/' + c.id;
  // 1. prenotazione
  let reserved = false;
  try {
    const r = await ref(path).transaction((cur: GameValue) => {
      if (cur === null) return null;
      const o = ownerOf(c.id, cur);
      if (o?.o !== owner.o) return undefined; // venduto o cambiato nel frattempo
      const next = reserveSale(o, me(), sale.p, serverNow());
      return next ? { ...cur, sale: next.sale } : undefined;
    });
    reserved = !!r?.committed && ownerOf(c.id, r.snapshot?.val())?.sale?.to === me();
  } catch (error) {
    console.warn('[usato]', error);
  }
  if (!reserved) {
    toast('🏷️ Non è più disponibile: qualcuno l’ha preso o il venditore l’ha ritirato.', 4500);
    return;
  }
  // 2. pagamento al venditore
  if (!(await transferMoney(owner.o, sale.p))) {
    await ref(path).transaction((cur: GameValue) => {
      if (cur === null) return null;
      if (cur?.sale?.to !== me()) return undefined;
      const sale = { ...cur.sale };
      delete sale.to;
      delete sale.rt;
      return { ...cur, sale };
    });
    toast('💸 Pagamento non riuscito: il pezzo resta in vendita.', 4500);
    return;
  }
  // 3. il pezzo diventa mio
  let done = false;
  try {
    const r = await ref(path).transaction((cur: GameValue) => {
      if (cur === null) return null;
      return (
        completeSale(ownerOf(c.id, cur), me(), game.player.myData.nick, Date.now()) || undefined
      );
    });
    done = !!r?.committed && ownerOf(c.id, r.snapshot?.val())?.o === me();
  } catch (error) {
    console.warn('[usato]', error);
  }
  if (!done) {
    toast(
      `⚠️ Hai pagato ma il passaggio del pezzo non è riuscito: chiedi a ${owner.on} di restituirti i soldi.`,
      7000,
    );
    return;
  }
  await ref('used/' + i)
    .set(null)
    .catch(() => {});
  recordActivity('antiques');
  sfx('personality');
  toast(
    `🏷️ Affare fatto! ${c.emoji} ${c.name} ora è tuo. Sistemalo sulla mensola della tua stanza.`,
    5500,
  );
  void sendSocial(owner.o, { type: 'usedSold', item: c.id, amt: sale.p });
  postGossip(
    `${game.player.myData.nick} ha comprato ${c.emoji} ${c.name} da ${owner.on} al negozio dell'usato per ${euro(sale.p)}`,
    [owner.o],
  );
  saveGame(true);
}

/** Il venditore scopre che un suo pezzo è stato comprato (i soldi sono già in cassaforte). */
export function onUsedSold(m: GameValue, who: string): void {
  const c = collectible(m.item);
  const amt = Math.max(0, Math.floor(Number(m.amt) || 0));
  sfx('coin');
  toast(
    `🏷️ ${who} ha comprato ${c ? `${c.emoji} ${c.name}` : 'un tuo pezzo'} al negozio dell'usato: +${euro(amt)} in cassaforte!`,
    6000,
  );
}
