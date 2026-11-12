// Il primo personaggio dell'account: nome, aspetto e conferma dei 18 anni in una schermata sola,
// la creazione del personaggio (render/avatars.ts). Chi ha già un personaggio e deve ancora
// confermare i 18 anni vede le regole di sempre (terms.ts).
import { maskText } from '../../shared/text-filter-rules.js';
import { game } from './context.js';
import { toast } from './missions.js';
import { openCharacterCreator } from './render/avatars.js';
import { dom } from './runtime.js';
import { termsToAsk } from './terms-rules.js';
import { countUse } from './usage.js';

/** I nomi provvisori che non vale la pena proporre già scritti. */
const PLACEHOLDER = /^(ospite|giocatore)$/i;

export async function openFirstCreator(): Promise<void> {
  const askTerms =
    !game.session.OFFLINE && termsToAsk(game.player.termsAt, game.player.adultAt) !== 'none';
  const name = dom('creator-name') as HTMLInputElement;
  const adult = dom('creator-adult-check') as HTMLInputElement;
  const current = String(game.player.myData.nick || '').trim();
  name.value = PLACEHOLDER.test(current) ? '' : current;
  adult.checked = false;
  dom('creator-first').classList.remove('hidden');
  dom('creator-guest-note').classList.toggle('hidden', !game.session.guest);
  dom('creator-adult').classList.toggle('hidden', !askTerms);
  const ok = dom('creator-ok');
  ok.textContent = '🏠 Entra in casa';
  game.creatorCheck = () => {
    const nick = maskText(name.value.trim()).slice(0, 20);
    if (!nick) {
      toast('Scegli un nome per il tuo personaggio!');
      name.focus();
      return false;
    }
    if (askTerms && !adult.checked) {
      toast('Per giocare conferma di avere almeno 18 anni.');
      dom('creator-adult').classList.add('creator-adult-warn');
      return false;
    }
    game.player.myData.nick = nick;
    localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', nick);
    countUse('ingresso:nome');
    if (askTerms) {
      const now = Date.now();
      game.player.termsAt = game.player.termsAt || now;
      game.player.adultAt = now;
      countUse('ingresso:18anni');
    }
    return true;
  };
  try {
    await openCharacterCreator(true);
  } finally {
    game.creatorCheck = null;
    dom('creator-first').classList.add('hidden');
    dom('creator-adult').classList.add('hidden');
    dom('creator-adult').classList.remove('creator-adult-warn');
    ok.textContent = '✅ Conferma';
  }
}
