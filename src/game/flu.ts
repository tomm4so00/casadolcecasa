// Influenza nel gioco: avvisi, starnuti, contagio vicino ai malati e barra nel pannello dei bisogni.
// Le regole (quando ci si ammala, quanta salute si perde) sono in flu-rules.ts.
import { game } from './context.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { sendNotify } from './needs.js';
import { saySocial } from './social.js';
import { sfx } from './audio.js';
import { saveGame } from './saves.js';
import {
  FLU_CONTAGION_DELAY_MS,
  FLU_HOURS,
  canCatchFlu,
  healthyFlu,
  isSick,
  nextFluAt,
  type FluState,
} from './flu-rules.js';

const SNEEZES = ['Etciù! 🤧', 'Eeetciù! 🤧', '*coff coff* 😷', 'Etciù… 🤒'];

let wasSick: boolean | null = null;
let nextSneezeAt = 0;

/** Lo stato dell'influenza del giocatore, con la prossima influenza spontanea già in programma. */
function myFlu(): FluState {
  const flu = game.player.flu || (game.player.flu = healthyFlu());
  if (!flu.nextAt) flu.nextAt = nextFluAt(Date.now(), Math.random());
  return flu;
}

/** Ci si è avvicinati a un giocatore con l'influenza: tra 30 secondi ci si ammala. */
export function nearSickPlayer(name: string): void {
  if (game.player.isDead || !game.session.saveReady) return;
  const flu = myFlu();
  const now = Date.now();
  if (!canCatchFlu(flu, now)) return;
  flu.exposedAt = now;
  toast(`🦠 ${name} ha l'influenza e ti ha starnutito vicino…`, 3500);
  saveGame();
}

/** Ogni fotogramma: avvisi quando ci si ammala o si guarisce, starnuti e barra del tempo rimasto. */
export function updateFlu(): void {
  if (game.player.isDead || !game.session.saveReady) return;
  const flu = myFlu();
  const now = Date.now();
  const sick = isSick(flu, now);
  if (wasSick !== null && sick !== wasSick) {
    if (sick) {
      const msg = `🤒 ${game.player.myData.nick} ha preso l'influenza: perderà salute per ${FLU_HOURS} ore.`;
      if (document.hidden) sendNotify('Casa dolce casa', msg, 'sims-flu');
      else toast(msg, 5000);
      sfx('error');
      nextSneezeAt = now + 3000;
      saveGame();
    } else {
      toast("💪 Sei guarito dall'influenza!", 4000);
      sfx('success');
      saveGame();
    }
  } else if (wasSick === null && sick) {
    // ci si è ammalati mentre il gioco era chiuso
    toast(`🤒 Hai l'influenza: perdi salute ancora per ${timeLeft(flu.until - now)}.`, 5000);
    nextSneezeAt = now + 5000;
  }
  wasSick = sick;
  // starnuti ogni tanto (li vedono anche gli altri, nel fumetto)
  if (sick && now >= nextSneezeAt && !game.player.isSleeping) {
    saySocial(SNEEZES[Math.floor(Math.random() * SNEEZES.length)]);
    nextSneezeAt = now + 20_000 + Math.random() * 25_000;
  }
  const row = dom('flu-row');
  if (!row) return;
  const incubating = !sick && flu.exposedAt > 0;
  row.classList.toggle('hidden', !sick && !incubating);
  if (sick) {
    const left = flu.until - now;
    dom('flu-bar-fill').style.width = (left / (FLU_HOURS * 3_600_000)) * 100 + '%';
    dom('flu-text').innerText = timeLeft(left);
  } else if (incubating) {
    const left = flu.exposedAt + FLU_CONTAGION_DELAY_MS - now;
    dom('flu-bar-fill').style.width = '100%';
    dom('flu-text').innerText = `🦠 ${Math.max(0, Math.ceil(left / 1000))} s`;
  }
}

function timeLeft(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}
