import { offerJoint, onJointOffer, onJointPaid, onJointRefused } from './weed.js';
import { postGossip } from './gossip.js';
import { myLine, notePersonality } from './personality.js';
import { onArtSold } from './art-market.js';
import { transferMoney, creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { drugTake } from './needs.js';
import {
  noteRomanticAttention,
  onKissAnswer,
  onKissAsk,
  onRomanceUnlocked,
  tryKiss,
} from './romance.js';
export function sendSocial(tid?: GameValue, msg?: GameValue): GameValue {
  const key: GameValue = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  msg.from = game.session.myPlayerId;
  msg.fromName = game.player.myData.nick;
  msg.t = Date.now();
  return game.session.db.ref(`sims_interactions/${tid}/${key}`).set(msg);
}

export function saySocial(txt?: GameValue): GameValue {
  game.mySay = txt;
  game.mySayT = Date.now();
}

export async function socDo(act?: GameValue): Promise<GameValue> {
  const t: GameValue = game.socTarget;
  if (!t || game.socBusy()) return;
  if (['talk', 'praise', 'insult', 'punch'].includes(act)) {
    const k: GameValue = t.id + '|' + act,
      left: GameValue = (game.socCd[k] || 0) + game.SOC_CD_MS - Date.now();
    if (left > 0) {
      toast(`⏳ Aspetta ancora ${Math.ceil(left / 1000)} s`);
      return;
    }
    game.socCd[k] = Date.now();
  }
  if (act === 'talk') {
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 4);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 2);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
    saySocial(myLine('talk'));
    sendSocial(t.id, { type: 'talk' });
    toast(`💬 Hai chiacchierato con ${t.name} (+felicità, +salute, −sonno)`);
    notePersonality('talk');
  } else if (act === 'praise') {
    saySocial(myLine('praise'));
    sendSocial(t.id, { type: 'praise' });
    toast(`😍 Hai fatto un complimento a ${t.name}`);
    notePersonality('compliment');
  } else if (act === 'insult') {
    saySocial(myLine('insult'));
    sendSocial(t.id, { type: 'insult' });
    toast(`🤬 Hai insultato ${t.name}`);
    notePersonality('insult');
  } else if (act === 'punch') {
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 2);
    saySocial(myLine('punch'));
    sendSocial(t.id, { type: 'punch' });
    toast(`👊 Hai picchiato ${t.name}`);
    postGossip(
      `${game.player.myData.nick} ha preso a pugni ${t.name} 👊 Tira una brutta aria…`,
      [t.id],
      2 * 3600_000,
    );
    notePersonality('punch');
  } else if (act === 'food') {
    if (!game.player.foodIsCooked) return;
    game.player.foodIsCooked = false;
    game.player.hasFoodInInventory = false;
    game.view.fridgeIsOpen = false;
    saySocial(myLine('food'));
    sendSocial(t.id, { type: 'food' });
    toast(`🍽️ Hai dato il tuo piatto a ${t.name}`);
    notePersonality('giveFood');
    game.socKey = '';
  } else if (act === 'money') {
    if (!game.roomsState.some((r?: GameValue): GameValue => r && r.ownerId === t.id)) {
      toast(`${t.name} non ha una stanza: non può ricevere soldi.`, 3500);
      return;
    }
    const res: GameValue = await openDialog({
      title: `💶 Regala soldi a ${t.name}`,
      text: `Disponibili in cassaforte: ${game.moneyLevel} €`,
      input: { placeholder: 'Importo', numeric: true, maxLength: 6 },
      buttons: [
        { label: 'Annulla', value: null, color: '#57606f' },
        { label: 'Regala', value: 'ok', color: '#27ae60' },
      ],
    });
    if (res.action !== 'ok') return;
    const amt: GameValue = Math.floor(Number(res.value));
    if (!(amt >= 1)) {
      toast('Importo non valido.');
      return;
    }
    if (amt > game.moneyLevel) {
      toast('Non hai abbastanza soldi in cassaforte.');
      return;
    }
    if (!(await transferMoney(t.id, amt))) {
      toast('Trasferimento non confermato.');
      return;
    }
    await sendSocial(t.id, { type: 'money_notice', amt });
    toast(`💶 Hai regalato ${amt} € a ${t.name}`);
  } else if (act === 'kiss') {
    await tryKiss(t);
  } else if (act === 'weed') {
    await offerJoint(t);
  } else if (act === 'drug') {
    if (game.player.drugStock < 1) return;
    game.player.drugStock--;
    sendSocial(t.id, { type: 'drug' });
    toast(`💊 Hai offerto una dose a ${t.name}`);
  }
  game.socKey = '';
}

export function drainInbox(v?: GameValue): GameValue {
  v = v || {};
  const keys: GameValue = Object.keys(v);
  game.socPending = keys.some((k?: GameValue): GameValue => !game.socDone[k]);
  if (!game.session.saveReady || game.player.isDead) return;
  keys.forEach((k?: GameValue): GameValue => {
    if (game.socDone[k]) return;
    game.socDone[k] = 1;
    try {
      game.session.db.ref(`sims_interactions/${game.session.myPlayerId}/${k}`).remove();
    } catch (e: GameValue) {}
    try {
      handleSocial(v[k]);
    } catch (e: GameValue) {
      console.error(e);
    }
  });
  game.socPending = false;
}

export function startInbox(..._args: GameValue[]): GameValue {
  game.session.db
    .ref('sims_interactions/' + game.session.myPlayerId)
    .on('value', (s?: GameValue): GameValue => drainInbox(s.val()));
  lifetime.setInterval((): GameValue => {
    if (game.socPending)
      game.session.db
        .ref('sims_interactions/' + game.session.myPlayerId)
        .once('value', (s?: GameValue): GameValue => drainInbox(s.val()));
  }, 3000);
}

// Animazione a schermo quando qualcuno ci colpisce
function showHitEffect(who: string): void {
  const fx = document.createElement('div');
  fx.className = 'hit-fx';
  const fist = document.createElement('div');
  fist.className = 'hit-fist';
  fist.textContent = '💥👊';
  const txt = document.createElement('div');
  txt.className = 'hit-text';
  txt.textContent = `${who} ti ha colpito!`;
  fx.append(fist, txt);
  document.body.appendChild(fx);
  const canvas = game.view.canvas;
  canvas.classList.remove('hit-shake');
  void canvas.offsetWidth; // riavvia il tremolio anche con colpi ravvicinati
  canvas.classList.add('hit-shake');
  if (navigator.vibrate) navigator.vibrate([60, 40, 90]);
  lifetime.setTimeout((): void => {
    fx.remove();
    canvas.classList.remove('hit-shake');
  }, 950);
}

export async function handleSocial(m?: GameValue): Promise<GameValue> {
  if (!m || !m.type) return;
  const who: GameValue = m.fromName || 'Qualcuno';
  const old: GameValue = Date.now() - (m.t || 0) > game.SOC_MSG_TTL;
  if (m.type === 'talk' && !old) {
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 4);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 2);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
    toast(`💬 ${who} ha chiacchierato con te (+felicità, +salute, −sonno)`, 3500);
    noteRomanticAttention(m.from, who);
  } else if (m.type === 'praise' && !old) {
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 6);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 2);
    toast(`😍 ${who} ti ha fatto un complimento! (+felicità, +salute)`, 3500);
    noteRomanticAttention(m.from, who);
  } else if (m.type === 'insult' && !old) {
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 6);
    toast(`🤬 ${who} ti ha insultato! (−felicità)`, 3500);
  } else if (m.type === 'punch' && !old) {
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 8);
    if (game.player.healthLevel > 5)
      game.player.healthLevel = Math.max(5, game.player.healthLevel - 8); // le botte non uccidono mai da sole
    toast(`👊 ${who} ti ha picchiato! (−felicità, −salute)`, 4000);
    showHitEffect(who);
  } else if (m.type === 'food') {
    game.player.hungerLevel = Math.min(100, game.player.hungerLevel + 50);
    toast(`🍽️ ${who} ti ha dato da mangiare! (+50% fame)`, 4000);
  } else if (m.type === 'money_notice') {
    toast(`💶 ${who} ti ha regalato ${Math.max(0, Math.floor(Number(m.amt) || 0))} €!`, 4000);
  } else if (m.type === 'money') {
    const amt: GameValue = Math.max(0, Math.floor(Number(m.amt) || 0));
    if (amt > 0) {
      if (!(await creditMoney(amt))) return;
      toast(`💶 ${who} ti ha regalato ${amt} €!`, 4000);
    }
  } else if (m.type === 'artSold') {
    onArtSold(who, Math.max(0, Math.floor(Number(m.amt) || 0)));
  } else if (m.type === 'romance') {
    onRomanceUnlocked(m.from, who);
  } else if (m.type === 'kissAsk') {
    await onKissAsk(m, who);
  } else if (m.type === 'kissYes' || m.type === 'kissNo') {
    onKissAnswer(m, who, m.type === 'kissYes');
  } else if (m.type === 'weedOffer' && !old) {
    await onJointOffer(m, who);
  } else if (m.type === 'weedPaid') {
    onJointPaid(who);
  } else if (m.type === 'weedNo') {
    onJointRefused(who);
  } else if (m.type === 'drugReturn') {
    game.player.drugStock++;
    toast(`${who} ha rifiutato la dose: ti è tornata.`, 3500);
  } else if (m.type === 'drug') {
    while (game.dialogResolve)
      await new Promise((r?: GameValue): GameValue => lifetime.setTimeout(r, 1500));
    const res: GameValue = await openDialog({
      title: '💊 Una dose in regalo',
      text: `${who} vuole regalarti una dose di droga.\n\nCrea dipendenza e fa calare la salute per giorni. Accetti?`,
      buttons: [
        { label: 'Rifiuta', value: 'no', color: '#57606f' },
        { label: 'Accetta', value: 'yes', color: '#8e44ad' },
      ],
    });
    if (res.action === 'yes') drugTake();
    else sendSocial(m.from, { type: 'drugReturn' });
  }
}
