// Cancellazione dell'account chiesta dal giocatore. Il gioco registra la richiesta in
// sims_deletions/<uid> ed esce; la cancellazione vera la fa la manutenzione sul server
// (server/src/deletion.ts), di solito entro un'ora.
import { signOutAccount } from './accounts.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { browser } from './runtime.js';

const CONFIRM_WORD = 'ELIMINA';

function requestRef() {
  return game.session.db.ref('sims_deletions/' + game.session.authUid);
}

/** Il pulsante "Elimina account e dati" del profilo: chiede conferma due volte. */
export async function requestDeletion(): Promise<void> {
  if (game.session.OFFLINE || !game.session.authUid) return;
  const res = await openDialog({
    title: '🗑️ Elimina account e dati',
    text:
      'Cancelliamo il tuo account e tutto quello che lo riguarda: personaggi (anche delle vite ' +
      'precedenti), salvataggi, stanza e cassaforte, oggetti, messaggi, lapidi, inviti e ' +
      'notifiche. Restano solo le ricevute degli acquisti, che la legge ci obbliga a tenere.' +
      '\n\n⚠️ È definitivo: non si può annullare né recuperare niente. Se hai la criogenesi ' +
      'attiva, la perdi.' +
      `\n\nPer confermare scrivi ${CONFIRM_WORD}.`,
    input: { placeholder: CONFIRM_WORD, maxLength: 20 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Elimina tutto', value: 'delete', color: '#c0392b' },
    ],
  });
  if (res.action !== 'delete') return;
  if (res.value.trim().toUpperCase() !== CONFIRM_WORD) {
    toast(`Cancellazione annullata: per confermare devi scrivere ${CONFIRM_WORD}.`, 5000);
    return;
  }
  try {
    await requestRef().set({ at: Date.now() });
  } catch (error) {
    console.warn('[cancellazione]', error);
    toast('❌ Richiesta non inviata. Riprova tra poco o scrivici via email.', 6000);
    return;
  }
  // Da qui niente più salvataggi: ricreerebbero i dati appena chiesti di cancellare.
  game.session.saveReady = false;
  try {
    await signOutAccount();
  } catch {
    // anche se l'uscita non riesce, la richiesta è registrata
  }
  try {
    localStorage.clear();
  } catch {
    // memoria del browser non disponibile: non c'è niente da pulire
  }
  await openDialog({
    title: '🗑️ Cancellazione richiesta',
    text: "Fatto. Entro un'ora, al massimo entro 30 giorni, il tuo account e i tuoi dati saranno cancellati. Grazie di aver giocato a Casa dolce casa!",
    buttons: [{ label: 'OK', value: 'ok', color: '#57606f' }],
  });
  browser.location.reload();
}

/**
 * All'ingresso: se l'account ha una cancellazione in corso non si entra, altrimenti il gioco
 * ricreerebbe i dati. Restituisce true se si è dovuti uscire.
 */
export async function blockedByDeletion(): Promise<boolean> {
  if (game.session.OFFLINE || !game.session.authUid) return false;
  let pending = false;
  try {
    pending = (await requestRef().get()).exists();
  } catch {
    return false;
  }
  if (!pending) return false;
  await openDialog({
    title: '🗑️ Cancellazione in corso',
    text: 'Hai chiesto di cancellare questo account: lo stiamo facendo. Tra poco potrai, se vuoi, ricominciare da zero con lo stesso accesso.',
    buttons: [{ label: 'OK', value: 'ok', color: '#57606f' }],
  });
  try {
    await signOutAccount();
  } catch {
    // niente: si ricarica comunque
  }
  browser.location.reload();
  return true;
}
