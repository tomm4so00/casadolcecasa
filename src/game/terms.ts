// Età e condizioni: chi gioca conferma una volta, con una casella, di avere almeno 14 anni e di
// accettare condizioni e privacy (public/condizioni.html). Si salva solo il momento della
// conferma (termsAt nel salvataggio), nessuna data di nascita. Senza conferma non si gioca.
// In modalità prova (?offline=1) non si chiede niente: non c'è nessun dato online.
import { game } from './context.js';
import { openDialog } from './interface.js';
import { saveGame } from './saves.js';
import { signOutAccount } from './accounts.js';

/** L'età minima per iscriversi (condizioni.html, sezione Minorenni). */
export const MIN_AGE = 14;

const TEXT =
  `Casa dolce casa è per chi ha almeno ${MIN_AGE} anni.\n\n` +
  'Nel gioco ci sono una chat che leggono tutti, relazioni tra giocatori e, per finta, alcol, ' +
  'droghe e giochi d’azzardo con i soldi del gioco (che non valgono niente).\n\n' +
  'L’unico acquisto con soldi veri è la criogenesi: se hai meno di 18 anni serve il consenso ' +
  'di un genitore.';

/**
 * Chiede la conferma se il personaggio non l'ha ancora data. Vero se si può giocare; falso se
 * il giocatore ha scelto di uscire (allora esce dall'account e la pagina torna all'accesso).
 */
export async function ensureTerms(): Promise<boolean> {
  if (game.session.OFFLINE || game.player.termsAt) return true;
  for (;;) {
    const res = await openDialog({
      title: '📄 Prima di giocare',
      text: TEXT,
      check: {
        label: `Ho almeno ${MIN_AGE} anni e accetto condizioni e privacy`,
        href: './condizioni.html',
        linkText: 'Leggi condizioni e privacy',
      },
      buttons: [
        { label: 'Esci', value: 'exit', color: '#57606f' },
        { label: '✅ Gioca', value: 'ok', color: '#2ed573', needsCheck: true },
      ],
    });
    if (res.action === 'ok' && res.checked) {
      game.player.termsAt = Date.now();
      void saveGame(true);
      return true;
    }
    if (res.action === 'exit') break;
    // chiuso da un altro dialogo arrivato nel frattempo: si richiede
  }
  await signOutAccount();
  location.reload();
  return false;
}

/** La prima volta che si scrive in chat: chi la legge e cosa non scrivere. */
export async function chatNoticeOnce(): Promise<void> {
  if (game.player.chatNoticeAt) return;
  // in modalità prova la chat è solo sul dispositivo: nessuno la legge
  if (game.session.OFFLINE) {
    game.player.chatNoticeAt = Date.now();
    return;
  }
  await openDialog({
    title: '💬 La chat del condominio',
    text:
      'Quello che scrivi qui lo leggono tutti i giocatori del condominio, anche persone che non ' +
      'conosci.\n\nNon scrivere dati tuoi o di altri (cognome, indirizzo, telefono, scuola, ' +
      'social) e rispetta gli altri: niente insulti né contenuti offensivi.',
    buttons: [{ label: 'Ho capito', value: 'ok', color: '#2e86de' }],
  });
  game.player.chatNoticeAt = Date.now();
  void saveGame(true);
}
