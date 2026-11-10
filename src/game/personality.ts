import { game } from './context.js';
import { lifetime } from './runtime.js';
import { openDialog } from './interface.js';
import { hasRoom, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { updateEconomy } from './economy.js';
import { toast } from './missions.js';
import { bankBalanceOf } from './bank-rules.js';
import { postGossip } from './gossip.js';
import {
  BEDTIME_THOUGHTS,
  PERSONALITIES,
  PERSONALITY_PERKS,
  PREVAIL_TO_BECOME,
  LEVEL_PREVAIL,
  PERSONALITY_TITLES,
  PERSONALITY_BADGE,
  romanticBonus,
  type PersonalityLevel,
  answerSwitchOffer,
  levelOf,
  obtainedPersonality,
  personalityLevel,
  personalityPerk,
  personalityTitle,
  settlePersonalityDay,
  bankInterest,
  todayKey,
  type PersonalityAction,
  type PersonalityId,
  addPersonalityPoints,
  emptyPersonality,
  leadingPersonality,
  socialLine,
  type SocialAct,
} from './personality-rules.js';

/** La proposta di cambiare personalità è già stata mostrata in questa sessione. */
let offerAsked = false;

/**
 * Chiude la giornata precedente (si chiama anche senza azioni, ogni minuto): avvisa quale
 * personalità ha prevalso, mostra quella appena ottenuta, il nuovo livello o la proposta di cambio.
 */
function settlePersonality(): void {
  if (game.player.isDead || !game.session.saveReady) return;
  const state = (game.player.personality ??= emptyPersonality());
  const { won, reached, levelUp } = settlePersonalityDay(state, new Date());
  if (won) saveGame(false);
  if (reached) void announcePersonality(reached);
  else if (levelUp) void announceLevel(levelUp);
  else if (won) {
    const n = state.prevail?.[won] || 0;
    const got = obtainedPersonality(state);
    if (got === won) {
      const lv = personalityLevel(state);
      toast(
        `🌙 Nell'ultima giornata giocata ha prevalso il tuo lato da ${PERSONALITIES[won].name}` +
          (lv < 3 ? ` (${n}/${LEVEL_PREVAIL[lv as 1 | 2]} per il livello ${lv + 1}).` : '.'),
        6000,
      );
    } else if (!state.offer)
      toast(
        `🌙 Nell'ultima giornata giocata ha prevalso il tuo lato da ${PERSONALITIES[won].name} (${n}/${PREVAIL_TO_BECOME}).` +
          (n === PREVAIL_TO_BECOME - 1
            ? got
              ? ' Ancora una giornata e potrai scegliere di cambiare personalità!'
              : ' Ancora una giornata e lo diventi!'
            : ''),
        6000,
      );
  }
  // proposta di cambio in sospeso (anche da una sessione precedente)
  if (state.offer && !offerAsked) {
    offerAsked = true;
    void proposeSwitch();
  }
}

/** Aspetta che non ci siano altre finestre aperte (es. il riepilogo di fine turno). */
async function waitForFreeScreen(): Promise<void> {
  const wait = (ms: number) => new Promise((r) => lifetime.setTimeout(r, ms));
  await wait(800);
  while (game.dialogResolve) await wait(700);
}

/** Un'altra personalità ha prevalso per 5 giornate: si chiede se cambiare. */
async function proposeSwitch(): Promise<void> {
  await waitForFreeScreen();
  const state = game.player.personality;
  const id = state?.offer;
  const got = obtainedPersonality(state);
  if (!state || !id || !got) return;
  sfx('switchOffer');
  const res = await openDialog({
    title: '🔀 Cambiare personalità?',
    text:
      `Il tuo lato da ${PERSONALITIES[id].name} ha prevalso per ${state.prevail?.[id] || PREVAIL_TO_BECOME} giornate.\n\n` +
      `Ora sei ${personalityTitle(state)} (livello ${personalityLevel(state)}). Vuoi diventare ${PERSONALITIES[id].name}?\n\n` +
      `Se cambi, il premio diventa: ${personalityPerk(id, 1)} ${PERSONALITIES[got].name} resta come secondo tratto, con un premio più leggero.\n` +
      `Se resti, ${PERSONALITIES[id].name} diventa il tuo secondo tratto e te lo richiederò più avanti.`,
    buttons: [
      { label: `Resto ${PERSONALITIES[got].name}`, value: 'stay', color: '#57606f' },
      { label: `Divento ${PERSONALITIES[id].name}`, value: 'switch', color: '#6c5ce7' },
    ],
  });
  // finestra chiusa da un'altra: si richiede alla prossima apertura del gioco
  if (res.action !== 'stay' && res.action !== 'switch') return;
  const now = answerSwitchOffer(state, res.action === 'switch');
  saveGame(false);
  if (now) {
    toast(`✨ Ora sei ${PERSONALITIES[now].name}! 🎁 ${personalityPerk(now, 1)}`, 6500);
    postGossip(
      `Colpo di scena: ${game.player.myData.nick} ha cambiato vita ed è diventato ${PERSONALITY_BADGE[now].emoji} ${PERSONALITIES[now].name}!`,
    );
    void applyDailyPerks();
  } else toast(`Resti ${personalityTitle(state)}.`, 3500);
}

/** Si sale di livello: nuovo titolo e premio più forte. */
async function announceLevel(level: PersonalityLevel): Promise<void> {
  await waitForFreeScreen();
  const state = game.player.personality;
  const got = obtainedPersonality(state);
  if (!got) return;
  postGossip(
    `${game.player.myData.nick} ora è ${PERSONALITY_BADGE[got].emoji} ${PERSONALITY_TITLES[got][level - 1]} (livello ${level})`,
  );
  sfx('levelUp');
  await openDialog({
    title: `⭐ Livello ${level}!`,
    text:
      `Ora sei ${PERSONALITY_TITLES[got][level - 1]} (${PERSONALITIES[got].name}, livello ${level}).\n\n` +
      `🎁 Nuovo premio: ${personalityPerk(got, level)}` +
      (level < 3
        ? `\n\nAl livello ${level + 1} arrivi dopo ${LEVEL_PREVAIL[level as 1 | 2]} giornate in cui prevale il tuo lato da ${PERSONALITIES[got].name}.`
        : '\n\nHai raggiunto il livello massimo!'),
    buttons: [{ label: 'Ok', value: 'ok', color: '#6c5ce7' }],
  });
}

/** Registra un'azione che fa crescere una personalità (`cost`: i soldi spesi davvero). */
export function notePersonality(action: PersonalityAction, cost?: number): void {
  if (game.player.isDead) return;
  settlePersonality();
  const state = (game.player.personality ??= emptyPersonality());
  const reached = addPersonalityPoints(state, action, new Date(), cost);
  saveGame(false);
  if (reached) void announcePersonality(reached);
}

async function announcePersonality(id: PersonalityId): Promise<void> {
  postGossip(
    `${game.player.myData.nick} è diventato ${PERSONALITY_BADGE[id].emoji} ${PERSONALITIES[id].name}! Occhio…`,
  );
  // Lascia prima aprire le finestre che l'azione stessa mostra (es. il riepilogo di fine turno),
  // poi aspetta che vengano chiuse: altrimenti si coprirebbero a vicenda.
  await waitForFreeScreen();
  sfx('personality');
  await openDialog({
    title: '✨ La tua personalità',
    text:
      PERSONALITIES[id].message +
      ` (livello 1)\n\nHa prevalso per ${PREVAIL_TO_BECOME} giornate: è la tua personalità. Se continua a prevalere sali di livello: livello 2 a ${LEVEL_PREVAIL[1]} giornate, livello 3 a ${LEVEL_PREVAIL[2]}, con titolo e premio sempre migliori.` +
      '\n\n🎁 Premio: ' +
      PERSONALITY_PERKS[id],
    buttons: [{ label: 'Ok', value: 'ok', color: '#6c5ce7' }],
  });
  // il primo premio giornaliero (es. del Romanticone) arriva subito
  void applyDailyPerks();
}

/** Quando il personaggio si corica, un fumetto suggerisce che personalità sta diventando. */
export function bedtimeThought(): void {
  const id = leadingPersonality(game.player.personality ?? emptyPersonality());
  if (!id) return;
  const thoughts = BEDTIME_THOUGHTS[id];
  // lo stesso fumetto che usano le chiacchiere: lo vedono anche gli altri giocatori vicini
  game.mySay = '💭 ' + thoughts[Math.floor(Math.random() * thoughts.length)];
  game.mySayT = Date.now();
}

/** Frase da dire in un'azione sociale, con il tono della personalità che si sta diventando. */
export function myLine(act: SocialAct): string {
  return socialLine(act, leadingPersonality(game.player.personality ?? emptyPersonality()));
}

// ---------------------------------------------------------------- premi giornalieri

let perksBusy = false;

/**
 * Premi che arrivano una volta al giorno: interessi in banca per l'Imprenditore,
 * salute e felicità per il Romanticone. Si chiama all'avvio e poi ogni minuto (cambio di giorno).
 */
export async function applyDailyPerks(): Promise<void> {
  settlePersonality(); // anche chi non fa azioni chiude la giornata precedente
  const state = game.player.personality;
  if (perksBusy || !state || !game.session.saveReady || game.player.isDead) return;
  perksBusy = true;
  try {
    const today = todayKey(new Date());
    const perks = (state.perks ??= {});
    let changed = false;
    // anche come secondo tratto, con un premio più leggero
    if (levelOf(state, 'romantic') > 0 && perks.romanceDay !== today) {
      perks.romanceDay = today;
      changed = true;
      const bonus = romanticBonus(levelOf(state, 'romantic'));
      game.player.healthLevel = Math.min(100, game.player.healthLevel + bonus);
      game.player.happinessLevel = Math.min(100, game.player.happinessLevel + bonus);
      toast(
        `💘 Il tuo lato romantico ti dà il buongiorno: +${bonus}% salute e +${bonus}% felicità!`,
        5500,
      );
    }
    if (levelOf(state, 'business') > 0 && perks.interestDay !== today && hasRoom()) {
      const interest = bankInterest(
        game.bankBalance || 0,
        perks.interestDay,
        today,
        levelOf(state, 'business'),
      );
      if (interest > 0) {
        const ok = await updateEconomy((economy) => {
          economy.bank = bankBalanceOf(economy.bank) + interest;
          return 0;
        });
        if (!ok) return; // si riprova al prossimo giro
        toast(
          `💼 Interessi del tuo lato da Imprenditore: +${interest} Đ sul tuo conto in banca.`,
          5500,
        );
      }
      perks.interestDay = today;
      changed = true;
    }
    if (changed) saveGame(false);
  } finally {
    perksBusy = false;
  }
}
