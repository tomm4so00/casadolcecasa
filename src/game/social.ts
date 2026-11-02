import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { drugTake } from './needs.js';
export function sendSocial(tid?: GameValue, msg?: GameValue): GameValue {
  const key: GameValue = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  msg.from = game.myPlayerId;
  msg.fromName = game.myData.nick;
  msg.t = Date.now();
  return game.db.ref(`sims_interactions/${tid}/${key}`).set(msg);
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
    game.happinessLevel = Math.min(100, game.happinessLevel + 4);
    game.healthLevel = Math.min(100, game.healthLevel + 2);
    game.sleepLevel = Math.max(0, game.sleepLevel - 3);
    saySocial(
      game.pick([
        'Come va oggi? 😊',
        'Ti racconto una cosa…',
        'Che bella giornata!',
        'Hai sentito le novità?',
      ]),
    );
    sendSocial(t.id, { type: 'talk' });
    toast(`💬 Hai chiacchierato con ${t.name} (+felicità, +salute, −sonno)`);
  } else if (act === 'praise') {
    saySocial(game.pick(['Stai benissimo! 😍', 'Sei un grande!', 'Che stile! ✨']));
    sendSocial(t.id, { type: 'praise' });
    toast(`😍 Hai fatto un complimento a ${t.name}`);
  } else if (act === 'insult') {
    saySocial(game.pick(['Sei proprio un tipo… 🤬', 'Che vergogna!', 'Ma levati! 😠']));
    sendSocial(t.id, { type: 'insult' });
    toast(`🤬 Hai insultato ${t.name}`);
  } else if (act === 'punch') {
    game.happinessLevel = Math.max(0, game.happinessLevel - 2);
    saySocial('Prendi questo! 👊');
    sendSocial(t.id, { type: 'punch' });
    toast(`👊 Hai picchiato ${t.name}`);
  } else if (act === 'food') {
    if (!game.foodIsCooked) return;
    game.foodIsCooked = false;
    game.hasFoodInInventory = false;
    game.fridgeIsOpen = false;
    sendSocial(t.id, { type: 'food' });
    toast(`🍽️ Hai dato il tuo piatto a ${t.name}`);
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
    game.moneyLevel -= amt;
    sendSocial(t.id, { type: 'money', amt });
    toast(`💶 Hai regalato ${amt} € a ${t.name}`);
  } else if (act === 'drug') {
    if (game.drugStock < 1) return;
    game.drugStock--;
    sendSocial(t.id, { type: 'drug' });
    toast(`💊 Hai offerto una dose a ${t.name}`);
  }
  game.socKey = '';
}

export function drainInbox(v?: GameValue): GameValue {
  v = v || {};
  const keys: GameValue = Object.keys(v);
  game.socPending = keys.some((k?: GameValue): GameValue => !game.socDone[k]);
  if (!game.saveReady || game.isDead) return;
  keys.forEach((k?: GameValue): GameValue => {
    if (game.socDone[k]) return;
    game.socDone[k] = 1;
    try {
      game.db.ref(`sims_interactions/${game.myPlayerId}/${k}`).remove();
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
  game.db
    .ref('sims_interactions/' + game.myPlayerId)
    .on('value', (s?: GameValue): GameValue => drainInbox(s.val()));
  lifetime.setInterval((): GameValue => {
    if (game.socPending)
      game.db
        .ref('sims_interactions/' + game.myPlayerId)
        .once('value', (s?: GameValue): GameValue => drainInbox(s.val()));
  }, 3000);
}

export async function handleSocial(m?: GameValue): Promise<GameValue> {
  if (!m || !m.type) return;
  const who: GameValue = m.fromName || 'Qualcuno';
  const old: GameValue = Date.now() - (m.t || 0) > game.SOC_MSG_TTL;
  if (m.type === 'talk' && !old) {
    game.happinessLevel = Math.min(100, game.happinessLevel + 4);
    game.healthLevel = Math.min(100, game.healthLevel + 2);
    game.sleepLevel = Math.max(0, game.sleepLevel - 3);
    toast(`💬 ${who} ha chiacchierato con te (+felicità, +salute, −sonno)`, 3500);
  } else if (m.type === 'praise' && !old) {
    game.happinessLevel = Math.min(100, game.happinessLevel + 6);
    game.healthLevel = Math.min(100, game.healthLevel + 2);
    toast(`😍 ${who} ti ha fatto un complimento! (+felicità, +salute)`, 3500);
  } else if (m.type === 'insult' && !old) {
    game.happinessLevel = Math.max(0, game.happinessLevel - 6);
    toast(`🤬 ${who} ti ha insultato! (−felicità)`, 3500);
  } else if (m.type === 'punch' && !old) {
    game.happinessLevel = Math.max(0, game.happinessLevel - 8);
    if (game.healthLevel > 5) game.healthLevel = Math.max(5, game.healthLevel - 8); // le botte non uccidono mai da sole
    toast(`👊 ${who} ti ha picchiato! (−felicità, −salute)`, 4000);
  } else if (m.type === 'food') {
    game.hungerLevel = Math.min(100, game.hungerLevel + 50);
    toast(`🍽️ ${who} ti ha dato da mangiare! (+50% fame)`, 4000);
  } else if (m.type === 'money') {
    const amt: GameValue = Math.max(0, Math.floor(Number(m.amt) || 0));
    if (amt > 0) {
      game.moneyLevel += amt;
      toast(`💶 ${who} ti ha regalato ${amt} €!`, 4000);
    }
  } else if (m.type === 'drugReturn') {
    game.drugStock++;
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
