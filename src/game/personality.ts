import { game } from './context.js';
import { lifetime } from './runtime.js';
import { openDialog } from './interface.js';
import { hasRoom, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { updateEconomy } from './economy.js';
import { toast } from './missions.js';
import { bankBalanceOf } from './bank-rules.js';
import {
  BEDTIME_THOUGHTS,
  PERSONALITIES,
  PERSONALITY_PERKS,
  ROMANTIC_DAILY_BONUS,
  bankInterest,
  hasPersonality,
  todayKey,
  type PersonalityAction,
  type PersonalityId,
  addPersonalityPoints,
  emptyPersonality,
  leadingPersonality,
  socialLine,
  type SocialAct,
} from './personality-rules.js';

/** Registra un'azione che fa crescere una personalità; alla soglia mostra il messaggio. */
export function notePersonality(action: PersonalityAction): void {
  if (game.player.isDead) return;
  const state = (game.player.personality ??= emptyPersonality());
  const reached = addPersonalityPoints(state, action, new Date());
  saveGame(false);
  if (reached) void announcePersonality(reached);
}

async function announcePersonality(id: PersonalityId): Promise<void> {
  // Lascia prima aprire le finestre che l'azione stessa mostra (es. il riepilogo di fine turno),
  // poi aspetta che vengano chiuse: altrimenti si coprirebbero a vicenda.
  const wait = (ms: number) => new Promise((r) => lifetime.setTimeout(r, ms));
  await wait(800);
  while (game.dialogResolve) await wait(700);
  sfx('mission');
  await openDialog({
    title: '✨ La tua personalità',
    text: PERSONALITIES[id].message + '\n\n🎁 Premio: ' + PERSONALITY_PERKS[id],
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
  const state = game.player.personality;
  if (perksBusy || !state || !game.session.saveReady || game.player.isDead) return;
  perksBusy = true;
  try {
    const today = todayKey(new Date());
    const perks = (state.perks ??= {});
    let changed = false;
    if (hasPersonality(state, 'romantic') && perks.romanceDay !== today) {
      perks.romanceDay = today;
      changed = true;
      game.player.healthLevel = Math.min(100, game.player.healthLevel + ROMANTIC_DAILY_BONUS);
      game.player.happinessLevel = Math.min(100, game.player.happinessLevel + ROMANTIC_DAILY_BONUS);
      toast(
        `💘 Il tuo cuore da Romanticone ti dà il buongiorno: +${ROMANTIC_DAILY_BONUS}% salute e +${ROMANTIC_DAILY_BONUS}% felicità!`,
        5500,
      );
    }
    if (hasPersonality(state, 'business') && perks.interestDay !== today && hasRoom()) {
      const interest = bankInterest(game.bankBalance || 0, perks.interestDay, today);
      if (interest > 0) {
        const ok = await updateEconomy((economy) => {
          economy.bank = bankBalanceOf(economy.bank) + interest;
          return 0;
        });
        if (!ok) return; // si riprova al prossimo giro
        toast(`💼 Interessi da Imprenditore: +${interest} € sul tuo conto in banca.`, 5500);
      }
      perks.interestDay = today;
      changed = true;
    }
    if (changed) saveGame(false);
  } finally {
    perksBusy = false;
  }
}
