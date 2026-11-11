// Dopo la morte si ricomincia da zero con un nuovo personaggio (e un nome diverso).
// Il vecchio personaggio resta al cimitero: il nuovo ha un codice tutto suo.
import { game } from './context.js';
import { onlineSaveKey, rebirthNameError, rebirthPlayerId } from './account-model.js';
import { browser } from './runtime.js';
import { maskText } from '../../shared/text-filter-rules.js';

/** Crea il nuovo personaggio e ricarica il gioco. Restituisce un errore da mostrare, se c'è. */
export async function startNewLife(name: string): Promise<string | null> {
  const error = rebirthNameError(name, game.player.myData.nick || '');
  if (error) return error;
  const prefix = game.session.LS_PREFIX;
  const nick = maskText(name.trim().slice(0, 20));
  let newId: string;
  if (game.session.OFFLINE) {
    // modalità prova: basta un nuovo codice sul dispositivo
    newId = 'player_' + Math.random().toString(36).substring(2, 9);
    localStorage.removeItem(game.session.SAVE_KEY);
  } else {
    const uid = game.session.authUid;
    if (!uid) return 'Accesso scaduto: ricarica la pagina e accedi di nuovo.';
    newId = rebirthPlayerId(uid, Date.now());
    try {
      await game.session.db.ref('sims_accounts/' + uid).set({ playerId: newId });
    } catch (e) {
      console.warn('[rinascita]', e);
      return 'Non è stato possibile creare il nuovo personaggio. Riprova tra poco.';
    }
    localStorage.removeItem(onlineSaveKey(newId));
  }
  localStorage.setItem(prefix + 'sims_device_id', newId);
  localStorage.setItem(prefix + 'sims_player_nick', nick);
  localStorage.removeItem(prefix + 'sims_adopt_nick');
  browser.location.reload();
  return null;
}
