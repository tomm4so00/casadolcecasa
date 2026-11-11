// Offerte per i pezzi da collezione sulla mensola di un altro giocatore. Chi visita la stanza
// sceglie un pezzo e quanto offre; il proprietario riceve l'offerta (anche se è offline, la trova
// quando rientra) e accetta o rifiuta. Se accetta, l'affare si conclude subito: i soldi passano
// dalla cassaforte di chi ha offerto alla sua e il pezzo diventa di chi ha offerto, anche se in
// quel momento non sta giocando. Chi ha la mensola piena deve poi liberare un posto: mette in
// vendita all'usato uno dei suoi pezzi, o lo butta se il negozio dell'usato è pieno.
// Le regole sono in collect-rules.ts.
import type { GameReference } from './database.js';
import type { SocialMessage } from './network-model.js';
import { requireAccount } from './guest.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { lifetime } from './runtime.js';
import { hasRoom, saveGame } from './saves.js';
import { postGossip } from './gossip.js';
import { sendSocial } from './social.js';
import { collectState, onCollectChange } from './collect.js';
import { listPiece } from './used-shop.js';
import { collectMoneyFrom, transferMoney } from './economy.js';
import { recordActivity } from './activity.js';
import {
  type Collectible,
  SHELF_SPOTS,
  collectOfferError,
  collectible,
  decodeCollect,
  freeShelfSpot,
  freeUsedStand,
  giveTo,
  inUsedShop,
  offShelf,
  shelfFull,
  shelfOf,
} from './collect-rules.js';
import { notePersonality } from './personality.js';

const me = (): string => game.session.myPlayerId;
const ref = (path: string): GameReference => game.session.db.ref('sims_collect/' + path);
const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;
const amountOf = (m: SocialMessage) => Math.max(0, Math.floor(Number(m?.amt) || 0));

/** Aspetta che non ci siano altre finestre aperte (le offerte arrivano anche mentre si gioca). */
async function waitForDialogs(): Promise<void> {
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1500));
}

/** Cosa succede, con la mensola piena, se arriva un pezzo in più. */
function fullShelfText(): string {
  return freeUsedStand(collectState()) === null
    ? 'il negozio dell’usato è pieno, quindi dovrai buttare uno dei tuoi pezzi'
    : 'dovrai mettere in vendita all’usato uno dei tuoi pezzi (o buttarlo, se nel frattempo il negozio dell’usato si riempie)';
}

// ---------------------------------------------------------------- chi offre

/** La mensola di un altro giocatore: i suoi pezzi, e per ognuno si può fare un'offerta. */
export async function openOthersShelf(ownerId?: string, ownerName?: string): Promise<void> {
  const shown = ownerId ? (shelfOf(collectState(), ownerId).filter(Boolean) as Collectible[]) : [];
  if (!ownerId || !shown.length) {
    await openDialog({
      title: '🏺 Mensola dei collezionabili',
      text: 'La mensola è vuota.',
      buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
    });
    return;
  }
  const res = await openDialog({
    title: '🏺 Mensola dei collezionabili',
    text: `Pezzi unici di ${ownerName || 'questo giocatore'}. Ti piace qualcosa? Fagli un’offerta: ogni pezzo esiste in una sola copia.`,
    buttons: [
      ...shown.map((c) => ({ label: offerLabel(c), value: c.id, color: '#8e44ad' })),
      { label: 'Chiudi', value: null, color: '#57606f' },
    ],
  });
  const c = collectible(res.action);
  if (c) await makeCollectOffer(c, ownerId);
}

/** Testo del pulsante per un pezzo sulla mensola di un altro. */
export function offerLabel(c: Collectible): string {
  return inUsedShop(collectState(), c.id)
    ? `🏷️ ${c.emoji} ${c.name}: in vendita all’usato`
    : `💌 Fai un’offerta per ${c.emoji} ${c.name}`;
}

/** Offerta per il pezzo `c` della mensola di `ownerId`. */
export async function makeCollectOffer(c: Collectible, ownerId: string): Promise<void> {
  if (!(await requireAccount('fare offerte agli altri giocatori'))) return;
  const state = collectState();
  const owner = state.owners[c.id];
  if (!owner || owner.o !== ownerId) {
    toast('Questo pezzo non è più sulla mensola.', 3500);
    return;
  }
  if (inUsedShop(state, c.id)) {
    toast(`🏷️ ${owner.on} lo vende al negozio dell’usato, a ${dindini(owner.sale!.p)}.`, 4500);
    return;
  }
  if (!hasRoom()) {
    toast('Ti serve una stanza con la cassaforte per fare offerte.', 4000);
    return;
  }
  // mensola piena: prima di offrire si sa che poi bisognerà liberare un posto
  if (shelfFull(state, me())) {
    const go = await openDialog({
      title: '🏺 La tua mensola è piena',
      text: `Sulla tua mensola ci sono già ${SHELF_SPOTS} pezzi. Se ${owner.on} accetta, ${fullShelfText()}.`,
      buttons: [
        { label: 'Annulla', value: null, color: '#57606f' },
        { label: 'Fai comunque l’offerta', value: 'ok', color: '#8e44ad' },
      ],
    });
    if (go.action !== 'ok') return;
  }
  const res = await openDialog({
    title: `💌 Offerta per ${c.emoji} ${c.name}`,
    text:
      `Pezzo unico di ${owner.on}. Al negozio costava ${dindini(c.price)}.\n` +
      `Quanto offri? Se accetta, l’affare si conclude subito: i soldi passano dalla tua cassaforte alla sua e il pezzo diventa tuo, anche se in quel momento non stai giocando. ` +
      `Se è offline vedrà l’offerta quando rientra.\n\nIn cassaforte hai ${dindini(game.moneyLevel)}.`,
    input: { placeholder: 'Offerta in Đ', numeric: true, maxLength: 7 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: '💌 Invia l’offerta', value: 'ok', color: '#8e44ad' },
    ],
  });
  if (res.action !== 'ok') return;
  const amount = Number(res.value);
  const error = collectOfferError(amount, game.moneyLevel, collectState().owners[c.id], me());
  if (error) {
    toast('❌ ' + error, 4000);
    return;
  }
  try {
    await sendSocial(ownerId, { type: 'colOffer', item: c.id, amt: amount });
    sfx('click');
    toast(`💌 Offerta inviata a ${owner.on}: ${dindini(amount)} per ${c.emoji} ${c.name}.`, 4500);
  } catch {
    toast('Non sono riuscito a inviare l’offerta. Riprova quando sei connesso.', 4000);
  }
}

/** Il proprietario ha accettato: il pezzo è già mio e i soldi sono già passati. */
export async function onCollectDeal(m: SocialMessage, who: string): Promise<void> {
  const c = collectible(m.item);
  if (!c) return;
  sfx('personality');
  toast(
    `🤝 ${who} ha accettato la tua offerta! ${c.emoji} ${c.name} è tuo (−${dindini(amountOf(m))} dalla cassaforte).`,
    6500,
  );
  recordActivity('antiques');
  saveGame(true);
  dealt.add(c.id);
  rememberDealt();
  await placeNewPieces();
}

/** Risposta negativa: rifiutata, oppure in cassaforte non c'erano più abbastanza soldi. */
export function onCollectOfferRefused(m: SocialMessage, who: string): void {
  const c = collectible(m.item);
  if (!c) return;
  const what = `${dindini(amountOf(m))} per ${c.emoji} ${c.name}`;
  toast(
    m.broke
      ? `💸 ${who} voleva accettare la tua offerta di ${what}, ma in cassaforte non avevi abbastanza soldi.`
      : `💌 ${who} non ha accettato la tua offerta di ${what}.`,
    5500,
  );
}

// ---------------------------------------------------------------- mensola piena

/** Pezzi arrivati con un'offerta e non ancora sistemati (ricordati anche chiudendo il gioco). */
const dealt = new Set<string>();
const dealtKey = () => game.session.LS_PREFIX + 'col_dealt_' + me();
function rememberDealt(): void {
  try {
    localStorage.setItem(dealtKey(), JSON.stringify([...dealt]));
  } catch {}
}

let placing = false;

/**
 * Sistema i pezzi arrivati con un'offerta: sulla mensola se c'è posto, altrimenti bisogna
 * sceglierne uno da mettere in vendita all'usato (o da buttare, se l'usato è pieno).
 */
async function placeNewPieces(): Promise<void> {
  if (placing) return;
  placing = true;
  try {
    for (let guard = 0; guard < 10; guard++) {
      const state = collectState();
      // già sulla mensola o in vendita: sistemati (quelli non ancora miei nell'elenco aspettano,
      // il passaggio può arrivare un attimo dopo l'avviso)
      for (const id of [...dealt]) {
        const o = state.owners[id];
        if (o?.o === me() && (o.s !== undefined || o.sale)) dealt.delete(id);
      }
      rememberDealt();
      const next = offShelf(state, me()).find((c) => dealt.has(c.id));
      if (!next) return;
      const spot = freeShelfSpot(state, me());
      if (spot !== null) {
        await ref(`owners/${next.id}/s`).set(spot);
        dealt.delete(next.id);
        continue;
      }
      await waitForDialogs();
      if (!(await freeOneSpot(next))) {
        // finestra chiusa senza scegliere: si richiede fra poco
        lifetime.setTimeout(() => void placeNewPieces(), 30_000);
        return;
      }
    }
  } finally {
    placing = false;
  }
}

/** Mensola piena: si sceglie quale pezzo mettere in vendita all'usato, o buttare se è pieno. */
async function freeOneSpot(arrived: Collectible): Promise<boolean> {
  const state = collectState();
  const stand = freeUsedStand(state);
  const choices = [...(shelfOf(state, me()).filter(Boolean) as Collectible[]), arrived].filter(
    (c) => !state.owners[c.id]?.sale,
  );
  const res = await openDialog({
    title: '🏺 La mensola è piena',
    text:
      `${arrived.emoji} ${arrived.name} non ci sta: sulla mensola entrano solo ${SHELF_SPOTS} pezzi.\n\n` +
      (stand !== null
        ? 'Scegli quale pezzo mettere in vendita al negozio dell’usato. Finché nessuno lo compra resta tuo.'
        : 'Il negozio dell’usato è pieno: scegli quale pezzo buttare. Tornerà tra i pezzi in vendita al negozio di collezionismo.'),
    buttons: choices.map((c) => ({
      label: `${stand !== null ? '🏷️' : '🗑️'} ${c.emoji} ${c.name}`,
      value: c.id,
      color: stand !== null ? '#8e44ad' : '#c0392b',
    })),
  });
  const c = collectible(res.action);
  if (!c) return false;
  const spot = state.owners[c.id]?.s;
  let done: boolean;
  if (stand !== null) done = await listPiece(c, stand, true);
  else {
    const ok = await openDialog({
      title: `🗑️ Butti ${c.emoji} ${c.name}?`,
      text: 'Non sarà più tuo e non riceverai soldi.',
      buttons: [
        { label: 'No, scelgo un altro', value: null, color: '#57606f' },
        { label: '🗑️ Buttalo', value: 'ok', color: '#c0392b' },
      ],
    });
    done = ok.action === 'ok' && (await dropPiece(c));
  }
  if (!done) return false;
  // il pezzo nuovo prende il posto lasciato libero (se si è scelto lui, è già sistemato)
  if (c.id !== arrived.id && spot !== undefined) await ref(`owners/${arrived.id}/s`).set(spot);
  dealt.delete(arrived.id);
  rememberDealt();
  return true;
}

/** Butta un mio pezzo: resta senza proprietario, e quindi torna nel negozio di collezionismo. */
async function dropPiece(c: Collectible): Promise<boolean> {
  try {
    const r = await ref('owners/' + c.id).transaction((cur: unknown) => {
      if (cur === null) return null;
      const o = decodeCollect({ owners: { [c.id]: cur } }).owners[c.id];
      return o?.o === me() && !o.sale ? null : undefined;
    });
    if (r?.committed) {
      toast(`🗑️ Hai buttato ${c.emoji} ${c.name}.`, 4000);
      return true;
    }
  } catch (error) {
    console.warn('[offerte collezione]', error);
  }
  toast('Non è stato possibile buttarlo: riprova.', 4000);
  return false;
}

// al rientro nel gioco: i pezzi arrivati mentre si era via si sistemano subito
let dealtLoaded = false;
onCollectChange(() => {
  if (!game.session.saveReady || !me() || game.player.isDead) return;
  if (!dealtLoaded) {
    dealtLoaded = true;
    try {
      for (const id of JSON.parse(localStorage.getItem(dealtKey()) || '[]'))
        if (collectible(id)) dealt.add(id);
    } catch {}
  }
  if (dealt.size) void placeNewPieces();
});

// ---------------------------------------------------------------- il proprietario

/** È arrivata un'offerta per un mio pezzo: se accetto, l'affare si conclude subito. */
export async function onCollectOffer(m: SocialMessage, who: string): Promise<void> {
  const c = collectible(m.item);
  const amt = amountOf(m);
  if (!c || !amt || typeof m.from !== 'string') return;
  const from = m.from;
  await waitForDialogs();
  const no = (extra: Record<string, unknown> = {}) =>
    void sendSocial(from, { type: 'colNo', item: c.id, amt, ...extra });
  const owner = collectState().owners[c.id];
  if (owner?.o !== me()) return no();
  if (owner.sale) {
    toast(
      `💌 ${who} ha offerto ${dindini(amt)} per ${c.emoji} ${c.name}, ma è in vendita all’usato: l’offerta è stata rifiutata.`,
      5000,
    );
    return no();
  }
  sfx('gossip');
  const res = await openDialog({
    title: '💌 Un’offerta per te!',
    text:
      `${who} offre ${dindini(amt)} per il tuo pezzo unico ${c.emoji} ${c.name}` +
      ` (al negozio costava ${dindini(c.price)}).\n\nSe accetti, i soldi arrivano subito nella tua cassaforte e il pezzo diventa suo.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: `🤝 Accetta (${dindini(amt)})`, value: 'yes', color: '#2ed573' },
    ],
  });
  if (res.action !== 'yes') {
    toast(`Hai rifiutato l’offerta di ${who}.`, 3500);
    return no();
  }
  // 1. i soldi dalla sua cassaforte alla mia, nella stessa transazione
  if (!(await collectMoneyFrom(from, amt))) {
    toast(`💸 ${who} non ha più ${dindini(amt)} in cassaforte: l’affare non si può fare.`, 5000);
    return no({ broke: 1 });
  }
  // 2. il pezzo passa a lui (se non riesce, gli restituisco i soldi)
  let given = false;
  try {
    const r = await ref('owners/' + c.id).transaction((cur: unknown) => {
      if (cur === null) return null;
      const o = decodeCollect({ owners: { [c.id]: cur } }).owners[c.id] || null;
      return giveTo(o, me(), from, who, Date.now()) || undefined;
    });
    given = !!r?.committed && r.snapshot?.val()?.o === from;
  } catch (error) {
    console.warn('[offerte collezione]', error);
  }
  if (!given) {
    await transferMoney(from, amt);
    toast('Non è stato possibile concludere l’affare: i soldi sono tornati a chi li aveva.', 5000);
    return no();
  }
  void sendSocial(from, { type: 'colDone', item: c.id, amt });
  sfx('coin');
  notePersonality('sellUsed');
  toast(`🤝 Affare fatto! ${c.emoji} ${c.name} è di ${who}: +${dindini(amt)} in cassaforte.`, 5500);
  postGossip(
    `${who} ha comprato ${c.emoji} ${c.name} da ${game.player.myData.nick} per ${dindini(amt)}`,
    [from],
  );
  saveGame(true);
}
