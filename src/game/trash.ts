// Il cestino della stanza (trash-rules.ts): ci finiscono le bustine vuote di chi vende erba o
// pillole e la graffetta di chi riesce in un furto. Chi entra nella stanza può frugarci e portare
// le prove al commissariato: la multa la paga il colpevole, metà a chi denuncia e metà alla cassa
// della polizia. Il proprietario può svuotarlo una volta al giorno; il lunedì passa lo spazzino.
//
// Nel database (per ogni condominio):
//   trash/<giocatore>/<id>   = { k, t }   il suo cestino: lo scrive lui, gli altri possono solo togliere
//   fines/<giocatore>/<id>   = Fine       le multe da pagare: le scrive chi denuncia
//   police_fund              = numero     la cassa della polizia: si può solo aggiungere
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { worldNode } from './world-db.js';
import { hasRoom, isMyRoomNow, saveGame } from './saves.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { sfx } from './audio.js';
import { postGossip } from './gossip.js';
import { requireAccount } from './guest.js';
import { startMovingFurniture } from './character.js';
import {
  bankWithdraw,
  flushEconomy,
  seizeMoneyFrom,
  spendMoney,
  transferMoney,
} from './economy.js';
import { levelOf, reporterShare, todayKey } from './personality-rules.js';
import {
  MAX_PROOFS,
  MAX_TRASH,
  TRASH,
  type Fine,
  type Proof,
  type TrashSave,
  type TrashItem,
  type TrashKind,
  countKinds,
  decodeFine,
  describeKinds,
  groupProofs,
  liveTrash,
  payable,
  splitFine,
  sweptKeys,
} from './trash-rules.js';
import { notePersonality } from './personality.js';

const me = (): string => game.session.myPlayerId;
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
const state = (): TrashSave => (game.player.trash ??= {});
const dindini = (n: number): string => `${n.toLocaleString('it-IT')} Đ`;

let mine: Record<string, TrashItem> = {};
let fund = 0;

/** I soldi nella cassa della polizia (per il contatore sopra la cassaforte del commissariato). */
export const policeFund = (): number => fund;

/** Il cestino di chi gioca: quante bustine e graffette ci sono adesso. */
export const myTrashCount = (): Record<TrashKind, number> => countKinds(Object.values(mine));

export function startTrash(): void {
  const db = game.session.db;
  const trashRef = db.ref(`${worldNode('trash')}/${me()}`);
  const onTrash = (snap: GameValue): void => {
    const v = snap?.val();
    mine = liveTrash(v, serverNow());
    // quello che lo spazzino si è già portato via sparisce anche dal database
    const old = sweptKeys(v, serverNow());
    if (old.length)
      void trashRef
        .update(Object.fromEntries(old.map((k) => [k, null])))
        .catch((e: unknown) => console.warn('[cestino]', e));
  };
  trashRef.on('value', onTrash);
  const fundRef = db.ref(worldNode('police_fund'));
  const onFund = (snap: GameValue): void => {
    const v = Number(snap?.val());
    fund = Number.isSafeInteger(v) && v > 0 ? v : 0;
  };
  fundRef.on('value', onFund);
  const finesRef = db.ref(`${worldNode('fines')}/${me()}`);
  const onFines = (snap: GameValue): void => {
    fines = snap?.val() && typeof snap.val() === 'object' ? snap.val() : {};
    void payFines();
  };
  finesRef.on('value', onFines);
  lifetime.add(() => {
    trashRef.off?.('value', onTrash);
    fundRef.off?.('value', onFund);
    finesRef.off?.('value', onFines);
  });
  lifetime.setInterval(tick, 1000);
  // i debiti si riprovano a pagare ogni tanto: magari nel frattempo sono arrivati soldi
  lifetime.setInterval(() => void payFines(), 60_000);
}

// ---------------------------------------------------------------- cosa finisce nel cestino

/** Una prova nel proprio cestino: dopo una vendita (bustina) o un furto riuscito (graffetta). */
export function dropInTrash(k: TrashKind): void {
  if (!hasRoom() || !me()) return;
  const ref = game.session.db.ref(`${worldNode('trash')}/${me()}`);
  // il cestino non è senza fondo: oltre MAX_TRASH esce la cosa più vecchia
  const ids = Object.entries(mine)
    .sort((a, b) => a[1].t - b[1].t)
    .map(([id]) => id);
  const drop = ids.slice(0, Math.max(0, ids.length - MAX_TRASH + 1));
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  void ref
    .update({ ...Object.fromEntries(drop.map((d) => [d, null])), [id]: { k, t: serverNow() } })
    .catch((e: unknown) => console.warn('[cestino]', e));
}

// ---------------------------------------------------------------- il cestino nella stanza

/** Il proprietario della stanza in cui si è (per frugare nel suo cestino). */
function roomOwner(): { id: string; name: string } | null {
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  return room?.ownerId ? { id: room.ownerId, name: room.owner || 'qualcuno' } : null;
}

/** Il testo del pulsante vicino al cestino. */
export function trashPrompt(): { text: string; locked?: boolean } {
  if (!isMyRoomNow()) return { text: `🗑️ Fruga nel cestino di ${roomOwner()?.name || 'qualcuno'}` };
  const inside = describeKinds(myTrashCount());
  if (!inside) return { text: '🗑️ Il cestino è vuoto', locked: true };
  if (state().emptied === todayKey(new Date()))
    return { text: `🗑️ Già svuotato oggi · dentro: ${inside}`, locked: true };
  return { text: `🗑️ Svuota il cestino (${inside})` };
}

export async function trashAct(): Promise<void> {
  if (isMyRoomNow()) await emptyMyTrash();
  else await rummage();
}

async function emptyMyTrash(): Promise<void> {
  const ids = Object.keys(mine);
  if (!ids.length) {
    toast('🗑️ Il cestino è già vuoto.');
    return;
  }
  const today = todayKey(new Date());
  if (state().emptied === today) {
    toast('🗑️ Il cestino si può svuotare una volta al giorno: riprova domani.', 4000);
    return;
  }
  try {
    await game.session.db.ref(`${worldNode('trash')}/${me()}`).remove();
  } catch (e) {
    console.warn('[cestino]', e);
    toast('Non è stato possibile svuotare il cestino: riprova.', 4000);
    return;
  }
  mine = {};
  state().emptied = today;
  saveGame(true);
  sfx('click');
  toast('🗑️ Cestino svuotato: niente più prove contro di te. Il prossimo domani.', 4500);
}

async function rummage(): Promise<void> {
  const owner = roomOwner();
  if (!owner || owner.id === me()) return;
  const ref = game.session.db.ref(`${worldNode('trash')}/${owner.id}`);
  let live: Record<string, TrashItem>;
  try {
    live = liveTrash((await ref.get()).val(), serverNow());
  } catch {
    toast('Riprova tra poco.');
    return;
  }
  sfx('click');
  const found = Object.values(live);
  if (!found.length) {
    toast('🗑️ Solo cartacce e bucce di banana: niente di interessante.', 4000);
    return;
  }
  const n = countKinds(found);
  const res = await openDialog({
    title: `🗑️ Il cestino di ${owner.name}`,
    text:
      `Frugando tra le cartacce trovi ${describeKinds(n)}.\n\n` +
      `Sono prove: se le porti al commissariato, ${owner.name} prende una multa ` +
      `(${TRASH.bag.fine} Đ per ogni bustina, ${TRASH.clip.fine} Đ per ogni graffetta) e metà è tua.`,
    buttons: [
      { label: 'Lascia stare', value: null, color: '#57606f' },
      { label: '🫳 Prendi le prove', value: 'take', color: '#1f3a68' },
    ],
  });
  if (res.action !== 'take') return;
  // una alla volta: se un altro le prende nello stesso momento, ognuna va a uno solo
  const taken: TrashItem[] = [];
  for (const [id, it] of Object.entries(live)) {
    try {
      // l'ultimo giro della transazione vede il valore vero del server: c'era ancora?
      let had = false;
      const r = await game.session.db
        .ref(`${worldNode('trash')}/${owner.id}/${id}`)
        .transaction((cur: unknown) => {
          had = cur !== null && cur !== undefined;
          return null;
        });
      if (r.committed && had) taken.push(it);
    } catch (e) {
      console.warn('[cestino]', e);
    }
  }
  if (!taken.length) {
    toast('🗑️ Qualcuno è stato più veloce di te: il cestino ormai è vuoto.', 4000);
    return;
  }
  const now = serverNow();
  const proofs = (state().proofs ??= []);
  for (const it of taken)
    proofs.push({
      k: it.k,
      who: owner.id,
      name: owner.name.slice(0, 20),
      w: game.session.worldId,
      t: now,
    });
  state().proofs = proofs.slice(-MAX_PROOFS);
  notePersonality('findProof');
  saveGame(true);
  toast(
    `🫳 Hai preso ${describeKinds(countKinds(taken))}. Portale allo sportello del commissariato!`,
    5000,
  );
}

// ---------------------------------------------------------------- denuncia al commissariato

/** Le prove che si possono denunciare in questo condominio. */
export function proofsHere(): Proof[] {
  return (state().proofs ?? []).filter((p) => p.w === game.session.worldId);
}

/** Le righe per lo sportello: cosa si ha in tasca, colpevole per colpevole. */
export function proofLines(): string[] {
  return groupProofs(proofsHere(), game.session.worldId).map(
    (g) =>
      `• ${g.name}: ${describeKinds({ bag: 0, clip: 0, [g.k]: g.n })} → multa di ${dindini(g.amount)}`,
  );
}

/** Denuncia tutti quelli di cui si hanno le prove: una multa per ogni prova. */
export async function denounceAll(): Promise<void> {
  if (!(await requireAccount('denunciare qualcuno'))) return;
  const world = game.session.worldId;
  const groups = groupProofs(proofsHere(), world);
  if (!groups.length) return;
  const lines: string[] = [];
  let gained = 0;
  const done = new Set<string>();
  // la quota di chi denuncia: la metà, di più per il Giustiziere
  const pct = reporterShare(levelOf(game.player.personality, 'vigilante'));
  for (const g of groups) {
    const key = g.who + '|' + g.k;
    if (g.who === me()) {
      done.add(key);
      continue;
    }
    const lives = Object.values(game.roomsState || {}).some((r: GameValue) => r?.ownerId === g.who);
    if (!lives) {
      lines.push(`• ${g.name} non abita più nel condominio: la denuncia è archiviata.`);
      done.add(key);
      continue;
    }
    // dalla sua cassaforte quello che c'è (fino alla multa): metà a me, metà alla cassa
    const taken = await seizeMoneyFrom(g.who, g.amount, (t) => splitFine(t, pct).reporter);
    if (taken > 0) await addToFund(splitFine(taken, pct).police);
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const fine: Fine = {
        k: g.k,
        n: g.n,
        amt: g.amount,
        paid: taken,
        to: me(),
        t: serverNow(),
        pct,
      };
      await game.session.db.ref(`${worldNode('fines')}/${g.who}/${id}`).set(fine);
    } catch (e) {
      console.warn('[multa]', e);
      // la multa non è scritta: se non si è preso niente si riprova un'altra volta
      if (!taken) {
        lines.push(`• ${g.name}: la denuncia non è andata a buon fine, riprova più tardi.`);
        continue;
      }
    }
    done.add(key);
    notePersonality('denounce');
    const mineShare = splitFine(taken, pct).reporter;
    gained += mineShare;
    lines.push(
      `• ${g.name}: multa di ${dindini(g.amount)} per ${TRASH[g.k].why}` +
        (taken >= g.amount
          ? `, pagata subito. A te ${dindini(mineShare)}.`
          : taken > 0
            ? `: aveva solo ${dindini(taken)} in cassaforte (a te ${dindini(mineShare)}), il resto lo pagherà appena può.`
            : `: la cassaforte è vuota, pagherà appena può.`),
    );
    postGossip(
      `👮 ${g.name} ha preso una multa di ${dindini(g.amount)} per ${TRASH[g.k].why}`,
      [g.who],
      0,
    );
  }
  state().proofs = (state().proofs ?? []).filter(
    (p) => p.w !== world || !done.has(p.who + '|' + p.k),
  );
  saveGame(true);
  if (gained) sfx('coin');
  await openDialog({
    title: '👮 Denuncia registrata',
    text:
      `L'agente batte il verbale al computer e timbra le prove.\n\n${lines.join('\n\n')}\n\n` +
      `La tua parte di ogni multa (il ${pct}%) arriva nella tua cassaforte; il resto va nella ` +
      'cassa della polizia.',
    buttons: [{ label: 'Grazie', value: null, color: '#1f3a68' }],
  });
}

async function addToFund(amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    await game.session.db
      .ref(worldNode('police_fund'))
      .transaction((cur: unknown) => (Number(cur) > 0 ? Number(cur) : 0) + amount);
  } catch (e) {
    console.warn('[cassa polizia]', e);
  }
}

// ---------------------------------------------------------------- multe da pagare

let fines: Record<string, unknown> = {};
let paying = false;
// le multe già annunciate in questa sessione (per non ripetere l'avviso del debito)
const told = new Set<string>();

async function payFines(): Promise<void> {
  if (paying || !hasRoom() || !game.session.saveReady || game.player.isDead) return;
  paying = true;
  try {
    for (const [id, raw] of Object.entries(fines)) {
      const ref = game.session.db.ref(`${worldNode('fines')}/${me()}/${id}`);
      const fine = decodeFine(raw);
      if (!fine) {
        await ref.remove();
        continue;
      }
      const why = `${describeKinds({ bag: 0, clip: 0, [fine.k]: fine.n })} nel tuo cestino`;
      let rest = fine.amt - fine.paid;
      if (!told.has(id)) {
        told.add(id);
        sfx('enemy');
        toast(
          `👮 Multa di ${dindini(fine.amt)} per ${TRASH[fine.k].why}: qualcuno ha trovato ${why} e ti ha denunciato.` +
            (fine.paid ? ` Presi ${dindini(fine.paid)} dalla cassaforte.` : ''),
          7000,
        );
      }
      if (rest > 0) {
        await flushEconomy();
        const { pay, fromBank } = payable(rest, game.moneyLevel, game.bankBalance || 0);
        if (pay <= 0) continue;
        if (fromBank > 0 && !(await bankWithdraw(fromBank))) continue;
        const share = splitFine(pay, fine.pct);
        // metà a chi ha denunciato; se non abita più qui va tutta alla cassa
        const toReporter = share.reporter > 0 && (await transferMoney(fine.to, share.reporter));
        const toPolice = pay - (toReporter ? share.reporter : 0);
        if (toPolice > 0 && !(await spendMoney(toPolice))) continue;
        await addToFund(toPolice);
        rest -= pay;
        if (rest > 0) {
          await ref.update({ paid: fine.amt - rest });
          toast(`👮 Hai pagato ${dindini(pay)} di multa: ne restano ${dindini(rest)}.`, 5000);
          continue;
        }
        toast(
          `👮 Multa pagata: ${dindini(pay)}${fromBank ? ' (anche dal conto in banca)' : ''}.`,
          5000,
        );
      }
      await ref.remove();
    }
  } catch (e) {
    console.warn('[multe]', e);
  } finally {
    paying = false;
  }
}

// ---------------------------------------------------------------- dove mettere il cestino

let asking = false;
let placing = false;

/** Chi entra nella sua stanza con la versione nuova sceglie dove mettere il cestino. */
function tick(): void {
  if (placing) {
    if (!game.isMovingFurnitureMode) {
      placing = false;
      state().placed = true;
      saveGame(true);
    }
    return;
  }
  if (
    asking ||
    state().placed ||
    !hasRoom() ||
    game.view.activeEnvironment !== 'PLAYER_ROOM' ||
    !isMyRoomNow() ||
    game.dialogResolve ||
    game.isMovingFurnitureMode ||
    game.arrangeMode ||
    game.player.isSleeping ||
    !getBin()
  )
    return;
  void askToPlace();
}

const getBin = (): GameValue => game.playerRoomFurniture?.trashBin;

async function askToPlace(): Promise<void> {
  asking = true;
  try {
    await openDialog({
      title: '🗑️ Il tuo cestino',
      text:
        'Nella tua stanza adesso c’è un cestino. Attento a cosa ci lasci dentro!\n\n' +
        `🛍️ Ogni volta che vendi erba o pillole ci finisce una bustina per lo spaccio vuota.\n` +
        '📎 Dopo un furto riuscito ci butti la graffetta con cui hai scassinato.\n\n' +
        'Chi entra nella tua stanza può frugare nel cestino e portare le prove al commissariato: ' +
        `ti arriva una multa di ${TRASH.bag.fine} Đ per ogni bustina e di ${TRASH.clip.fine} Đ per ogni graffetta.\n\n` +
        '🧹 Per non lasciare tracce svuotalo: puoi farlo una volta al giorno. Ogni lunedì mattina ' +
        'passa lo spazzino e svuota i cestini di tutti.\n\nOra scegli dove metterlo.',
      buttons: [{ label: '🖐️ Scegli il posto', value: 'ok', color: '#1f3a68' }],
    });
    if (!isMyRoomNow() || game.view.activeEnvironment !== 'PLAYER_ROOM') return;
    game.activeTargetProp = 'trashBin';
    startMovingFurniture();
    placing = game.isMovingFurnitureMode;
    // senza la modalità sposta (non dovrebbe succedere) il cestino resta dov'è
    if (!placing) {
      state().placed = true;
      saveGame(true);
    }
  } finally {
    asking = false;
  }
}
