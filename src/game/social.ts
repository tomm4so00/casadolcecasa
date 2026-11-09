import { offerJoint, onJointOffer, onJointPaid, onJointRefused } from './weed.js';
import { type RelationAct, noteRelation } from './relations-rules.js';
import { saveGame } from './saves.js';
import { onGameInvite } from './arcade.js';
import { onUsedSold } from './used-shop.js';
import { onCollectDeal, onCollectOffer, onCollectOfferRefused } from './collect-offers.js';
import { RETIRED_BUSINESSES } from '../../shared/market.js';
import { onLimitedAnswer, onLimitedOffer, onLimitedWithdrawn } from './limited.js';
import { postGossip } from './gossip.js';
import { myLine, notePersonality } from './personality.js';
import { onArtAccept, onArtNo, onArtOffer, onArtSold } from './auctions.js';
import { transferMoney, creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import { requireAccount } from './guest.js';
import { catchThief, crackingMySafe } from './hacker.js';
import { giveDishTo } from './food.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { openDialog } from './interface.js';
import { onInventoryOffer, inventoryChange } from './inventory-market.js';
import { openInventoryTrade } from './inventory-trade.js';
import {
  noteRomanticAttention,
  onKissAnswer,
  onKissAsk,
  onRomanceUnlocked,
  tryKiss,
} from './romance.js';
import { recordActivity } from './activity.js';
import { worldNode } from './world-db.js';
export function sendSocial(tid?: GameValue, msg?: GameValue): GameValue {
  const key: GameValue = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  msg.from = game.session.myPlayerId;
  msg.fromName = game.player.myData.nick;
  msg.t = Date.now();
  return game.session.db.ref(`${worldNode('interactions')}/${tid}/${key}`).set(msg);
}

export function saySocial(txt?: GameValue): GameValue {
  game.mySay = txt;
  game.mySayT = Date.now();
}

export async function socDo(act?: GameValue): Promise<GameValue> {
  const t: GameValue = game.socTarget;
  if (!t || game.socBusy()) return;
  // il pugno a chi sta scassinando la mia cassaforte lo ferma, anche subito dopo un altro pugno
  const thief = act === 'punch' && crackingMySafe(t.id);
  if (thief) game.socCd[t.id + '|punch'] = 0;
  if (['talk', 'praise', 'insult', 'punch'].includes(act)) {
    const k: GameValue = t.id + '|' + act,
      left: GameValue = (game.socCd[k] || 0) + game.SOC_CD_MS - Date.now();
    if (left > 0) {
      toast(`⏳ Aspetta ancora ${Math.ceil(left / 1000)} s`);
      return;
    }
    game.socCd[k] = Date.now();
  }
  recordActivity('app');
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
    // ladro beccato: lo dice catchThief (avviso e gossip), al posto del pugno qualsiasi
    if (thief && (await catchThief(t.id, t.name))) {
      notePersonality('punch');
      return;
    }
    toast(`👊 Hai picchiato ${t.name}`);
    postGossip(
      `${game.player.myData.nick} ha preso a pugni ${t.name} 👊 Tira una brutta aria…`,
      [t.id],
      2 * 3600_000,
    );
    notePersonality('punch');
  } else if (act === 'food') {
    // un piatto dallo zaino (vedi food.ts): conta anche per l'assaggio di benvenuto
    if (!giveDishTo(t.id, t.name)) return;
    game.socKey = '';
  } else if (act === 'money') {
    if (!(await requireAccount('regalare soldi'))) return;
    if (!game.roomsState.some((r?: GameValue): GameValue => r && r.ownerId === t.id)) {
      toast(`${t.name} non ha una stanza: non può ricevere soldi.`, 3500);
      return;
    }
    const res: GameValue = await openDialog({
      title: `🪙 Regala soldi a ${t.name}`,
      text: `Disponibili in cassaforte: ${game.moneyLevel} Đ`,
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
    toast(`🪙 Hai regalato ${amt} Đ a ${t.name}`);
  } else if (act === 'kiss') {
    await tryKiss(t);
  } else if (act === 'weed') {
    await offerJoint(t);
  } else if (act === 'drug') {
    await openInventoryTrade('drug', t.id);
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
      game.session.db.ref(`${worldNode('interactions')}/${game.session.myPlayerId}/${k}`).remove();
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
    .ref(worldNode('interactions') + '/' + game.session.myPlayerId)
    .on('value', (s?: GameValue): GameValue => drainInbox(s.val()));
  lifetime.setInterval((): GameValue => {
    if (game.socPending)
      game.session.db
        .ref(worldNode('interactions') + '/' + game.session.myPlayerId)
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

/** Ricorda il gesto ricevuto; se l'altro diventa amico o nemico, lo dice. */
function remember(m: GameValue, who: string, act: RelationAct): void {
  if (typeof m.from !== 'string') return;
  const book = (game.player.relations ??= {});
  const now = noteRelation(book, m.from, who, act, Number(m.t) || Date.now());
  saveGame(false);
  if (now === 'friend') {
    sfx('friend');
    toast(`🤝 ${who} ora è tuo amico!`, 5000);
  } else if (now === 'enemy') {
    sfx('enemy');
    toast(`⚔️ ${who} ora è tuo nemico!`, 5000);
  } else if (now === null) toast(`${who} non è più tuo ${RELATION_WORD[act]}.`, 4000);
}

/** Se una relazione finisce, era l'opposto del gesto ricevuto. */
const RELATION_WORD: Record<RelationAct, string> = {
  talk: 'nemico',
  praise: 'nemico',
  food: 'nemico',
  gift: 'nemico',
  insult: 'amico',
  punch: 'amico',
  theft: 'amico',
};

export async function handleSocial(m?: GameValue): Promise<GameValue> {
  if (!m || !m.type) return;
  const who: GameValue = m.fromName || 'Qualcuno';
  const old: GameValue = Date.now() - (m.t || 0) > game.SOC_MSG_TTL;
  if (m.type === 'inventoryOffer') {
    await onInventoryOffer(m, who);
    return;
  }
  if (m.type === 'talk' && !old) {
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 4);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 2);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
    toast(`💬 ${who} ha chiacchierato con te (+felicità, +salute, −sonno)`, 3500);
    remember(m, who, 'talk');
    noteRomanticAttention(m.from, who);
  } else if (m.type === 'praise' && !old) {
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 6);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 2);
    toast(`😍 ${who} ti ha fatto un complimento! (+felicità, +salute)`, 3500);
    remember(m, who, 'praise');
    noteRomanticAttention(m.from, who);
  } else if (m.type === 'insult' && !old) {
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 6);
    toast(`🤬 ${who} ti ha insultato! (−felicità)`, 3500);
    remember(m, who, 'insult');
  } else if (m.type === 'punch' && !old) {
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 8);
    if (game.player.healthLevel > 5)
      game.player.healthLevel = Math.max(5, game.player.healthLevel - 8); // le botte non uccidono mai da sole
    toast(`👊 ${who} ti ha picchiato! (−felicità, −salute)`, 4000);
    showHitEffect(who);
    remember(m, who, 'punch');
  } else if (m.type === 'tasteComing') {
    toast(`🍝 ${who}, il nuovo vicino, ti sta portando un assaggio di benvenuto!`, 7000);
    sfx('success');
  } else if (m.type === 'tasteThanks') {
    toast(`💌 ${who} ha assaggiato il tuo piatto e ti ringrazia!`, 7000);
    sfx('friend');
    remember(m, who, 'praise');
  } else if (m.type === 'food') {
    game.player.hungerLevel = Math.min(100, game.player.hungerLevel + 50);
    toast(`🍽️ ${who} ti ha dato da mangiare! (+50% fame)`, 4000);
    remember(m, who, 'food');
  } else if (m.type === 'money_notice') {
    toast(`🪙 ${who} ti ha regalato ${Math.max(0, Math.floor(Number(m.amt) || 0))} Đ!`, 4000);
    remember(m, who, 'gift');
  } else if (m.type === 'money') {
    const amt: GameValue = Math.max(0, Math.floor(Number(m.amt) || 0));
    if (amt > 0) {
      if (!(await creditMoney(amt))) return;
      toast(`🪙 ${who} ti ha regalato ${amt} Đ!`, 4000);
    }
  } else if (m.type === 'ltdOffer') {
    await onLimitedOffer(m, who);
  } else if (m.type === 'ltdAccept' || m.type === 'ltdNo') {
    await onLimitedAnswer(m, who, m.type === 'ltdAccept');
  } else if (m.type === 'ltdGone') {
    await onLimitedWithdrawn(m, who);
  } else if (m.type === 'bizRetired') {
    const b = RETIRED_BUSINESSES[m.biz as string];
    const amt = Math.max(0, Math.floor(Number(m.amt) || 0));
    toast(
      `${b ? b.emoji + ' ' + b.name : 'Un’attività'} ha lasciato la borsa: le tue quote valevano ${amt.toLocaleString('it-IT')} Đ e sono in cassaforte.`,
      8000,
    );
  } else if (m.type === 'usedSold') {
    onUsedSold(m, who);
  } else if (m.type === 'colOffer') {
    // offerte per i pezzi da collezione sulla mensola (collect-offers.ts)
    await onCollectOffer(m, who);
  } else if (m.type === 'colDone') {
    await onCollectDeal(m, who);
  } else if (m.type === 'colNo') {
    onCollectOfferRefused(m, who);
  } else if (m.type === 'gameInvite') {
    await onGameInvite(m, who);
  } else if (m.type === 'theft') {
    // la vittima scopre chi è stato: per tutti gli altri il ladro resta misterioso
    const amt = Math.max(0, Math.floor(Number(m.amt) || 0));
    sfx('robbed');
    toast(`🕵️ ${who} ti ha svuotato la cassaforte! Rubati ${amt} Đ.`, 6000);
    remember(m, who, 'theft');
  } else if (m.type === 'artOffer') {
    await onArtOffer(m, who);
  } else if (m.type === 'artAccept') {
    await onArtAccept(m);
  } else if (m.type === 'artNo') {
    onArtNo(m, who);
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
    if (!(await inventoryChange((ledger) => ledger.buy('drug', 1, 0)))) return;
    await saveGame(true);
    toast(`${who} ha rifiutato la pillola: ti è tornata.`, 3500);
  } else if (m.type === 'drug') {
    while (game.dialogResolve)
      await new Promise((r?: GameValue): GameValue => lifetime.setTimeout(r, 1500));
    const res: GameValue = await openDialog({
      title: '💊 Una pillola in regalo',
      text: `${who} vuole regalarti una pillola misteriosa. La troverai nello zaino: potrai conservarla, scambiarla o prenderla più tardi. Accetti?`,
      buttons: [
        { label: 'Rifiuta', value: 'no', color: '#57606f' },
        { label: 'Accetta', value: 'yes', color: '#8e44ad' },
      ],
    });
    if (res.action === 'yes' && (await inventoryChange((ledger) => ledger.buy('drug', 1, 0)))) {
      await saveGame(true);
      toast('💊 Pillola ricevuta nello zaino.', 3500);
    } else await sendSocial(m.from, { type: 'drugReturn' });
  }
}
