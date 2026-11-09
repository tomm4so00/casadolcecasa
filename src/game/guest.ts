// Ospiti ("Gioca subito"): si gioca senza account e si salva il personaggio quando si vuole,
// collegando Google o l'email allo stesso account. Chat, scambi, acquisti e inviti chiedono di
// salvare prima: gli account ospite si creano in un attimo, e senza questo limite chi viene
// fermato ne aprirebbe un altro.
import type firebase from 'firebase/compat/app';
import {
  enterOtherGoogle,
  finishGuestEmail,
  guestPendingEmail,
  saveGuestWithEmail,
  saveGuestWithGoogle,
} from './accounts.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { lifetime } from './runtime.js';
import { saveGame } from './saves.js';

/** Dopo quanti minuti di gioco l'ospite riceve l'invito a salvare (una volta sola). */
export const GUEST_REMINDER_MINUTES = 20;
/** Gli ospiti che non entrano per tanti giorni vengono cancellati (server/src/guests.ts). */
export const GUEST_KEEP_DAYS = 7;

export const isGuest = (): boolean => !game.session.OFFLINE && !!game.session.guest;

const LOSE_TEXT =
  'Ora il personaggio vive solo su questo dispositivo: se cancelli i dati del browser o cambi ' +
  `telefono è perso, e gli ospiti che non entrano per ${GUEST_KEEP_DAYS} giorni vengono cancellati.`;

/**
 * Prima di un'azione riservata agli account: vero se si può andare avanti. A un ospite spiega
 * perché serve salvare e gli propone di farlo subito.
 */
export async function requireAccount(what: string): Promise<boolean> {
  if (!isGuest()) return true;
  await offerSave(`💾 Per ${what} salva il tuo personaggio`, '');
  return false;
}

/** La finestra "Salva il personaggio": Google, email o più tardi. */
export async function offerSave(
  title = '💾 Salva il tuo personaggio',
  intro?: string,
): Promise<void> {
  const pending = guestPendingEmail();
  const res = await openDialog({
    title,
    text:
      (intro ??
        `Ti piace ${game.player.myData.nick}? Salvalo per non perderlo e ritrovarlo su ogni dispositivo.`) +
      (intro === '' ? '' : '\n\n') +
      LOSE_TEXT +
      '\n\nSalvandolo puoi anche scrivere in chat, scambiare con gli altri, invitare amici e comprare.' +
      (pending
        ? `\n\n📧 Hai già scelto l'email ${pending}: aprila e tocca il link di conferma.`
        : ''),
    buttons: [
      { label: 'Più tardi', value: null, color: '#57606f' },
      ...(pending
        ? [{ label: '✅ Ho confermato l’email', value: 'confirmed', color: '#00b894', wide: true }]
        : [{ label: '📧 Salva con l’email', value: 'email', color: '#636e72', wide: true }]),
      { label: '🔐 Salva con Google', value: 'google', color: '#2e86de', wide: true },
    ],
  });
  if (res.action === 'google') await saveWithGoogle();
  if (res.action === 'email') await saveWithEmail();
  if (res.action === 'confirmed') await confirmedLater(pending!);
}

/** Il personaggio è salvato: si riparte, e all'ingresso il segno di ospite si toglie. */
async function restart(): Promise<void> {
  try {
    await saveGame(true);
  } catch {
    // il salvataggio sul dispositivo resta: online si rifà all'ingresso
  }
  location.reload();
}

async function saveWithGoogle(): Promise<void> {
  let result: Awaited<ReturnType<typeof saveGuestWithGoogle>>;
  try {
    result = await saveGuestWithGoogle();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 6000);
    return;
  }
  if (result.ok) return restart();
  await chooseOtherAccount(result.other);
}

/** Quel Google ha già un personaggio: due account non si possono unire, si sceglie. */
async function chooseOtherAccount(other: firebase.auth.AuthCredential): Promise<void> {
  const me = game.player.myData.nick;
  const res = await openDialog({
    title: '🔐 Questo Google ha già un personaggio',
    text:
      `Con questo account Google hai già un altro personaggio. Due account non si possono unire.\n\n` +
      `Se entri con quello, ${me} (l'ospite) resta su questo dispositivo finché non lo cancelliamo, ` +
      `dopo ${GUEST_KEEP_DAYS} giorni.`,
    buttons: [
      { label: `Resto con ${me}`, value: null, color: '#57606f' },
      { label: 'Entra con l’altro', value: 'other', color: '#2e86de' },
    ],
  });
  if (res.action !== 'other') return;
  try {
    await saveGame(true);
  } catch {
    // si entra comunque nell'altro account
  }
  try {
    await enterOtherGoogle(other);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 6000);
    return;
  }
  location.reload();
}

/** Email e password, poi il link di conferma: intanto si continua a giocare. */
async function saveWithEmail(): Promise<void> {
  const form = await emailForm();
  if (!form) return;
  try {
    await saveGuestWithEmail(form.email, form.password);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 6000);
    return;
  }
  await waitForConfirmation(form.email, form.password);
}

/** Aspetta il clic sul link; la password resta solo in memoria, per rientrare subito dopo. */
async function waitForConfirmation(email: string, password: string): Promise<void> {
  for (;;) {
    const res = await openDialog({
      title: '📧 Conferma la tua email',
      text:
        `Ti abbiamo mandato un link a ${email}. Aprilo, poi torna qui e tocca «Ho confermato».\n\n` +
        'Intanto puoi continuare a giocare: lo ritrovi nel profilo (🧑).',
      buttons: [
        { label: 'Più tardi', value: null, color: '#57606f' },
        { label: '✅ Ho confermato', value: 'ok', color: '#00b894' },
      ],
    });
    if (res.action !== 'ok') return;
    try {
      if (await finishGuestEmail(email, password)) return restart();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 6000);
      return;
    }
    toast("Non risulta ancora confermata: apri il link nell'email, poi tocca di nuovo.", 5000);
  }
}

/** Email scelta in una sessione precedente: la password non c'è più, si chiede di nuovo. */
async function confirmedLater(email: string): Promise<void> {
  const form = await emailForm(email);
  if (!form) return;
  try {
    if (await finishGuestEmail(form.email, form.password)) return restart();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 6000);
    return;
  }
  toast("Non risulta ancora confermata: apri il link nell'email, poi riprova.", 5000);
}

/** Una piccola finestra con email e password (la finestra di sempre ha un campo solo). */
function emailForm(email = ''): Promise<{ email: string; password: string } | null> {
  let el = document.getElementById('guest-email-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'guest-email-modal';
    el.className = 'fullscreen-modal';
    document.body.appendChild(el);
  }
  const confirming = !!email;
  el.innerHTML =
    `<div class="card guest-card">` +
    `<h3>📧 ${confirming ? 'Entra con la tua email' : 'Salva con l’email'}</h3>` +
    `<p class="guest-sub">${
      confirming
        ? 'Scrivi la password che hai scelto: entri con il tuo personaggio, salvato.'
        : 'Scegli la tua email e una password (almeno 6 caratteri). Ti mandiamo un link per confermarla.'
    }</p>` +
    `<input id="guest-email" type="email" autocomplete="email" maxlength="254" placeholder="la tua email">` +
    `<input id="guest-password" type="password" autocomplete="${confirming ? 'current-password' : 'new-password'}" maxlength="64" placeholder="password">` +
    (confirming
      ? ''
      : `<input id="guest-password2" type="password" autocomplete="new-password" maxlength="64" placeholder="ripeti la password">`) +
    `<button type="button" class="btn-primary btn-guest" data-g="ok">${confirming ? 'Entra' : 'Salva'}</button>` +
    `<button type="button" class="btn-primary btn-alt" data-g="cancel">Annulla</button>` +
    `</div>`;
  el.classList.remove('hidden');
  const field = (id: string) => el!.querySelector<HTMLInputElement>('#' + id);
  field('guest-email')!.value = email;
  (confirming ? field('guest-password') : field('guest-email'))!.focus();
  return new Promise((resolve) => {
    const done = (value: { email: string; password: string } | null) => {
      el!.classList.add('hidden');
      resolve(value);
    };
    const ok = () => {
      const password = field('guest-password')!.value;
      const again = field('guest-password2');
      if (again && again.value !== password) {
        toast('Le due password non sono uguali.');
        return;
      }
      done({ email: field('guest-email')!.value.trim(), password });
    };
    el!.querySelector<HTMLButtonElement>('[data-g="ok"]')!.onclick = ok;
    el!.querySelector<HTMLButtonElement>('[data-g="cancel"]')!.onclick = () => done(null);
    el!.querySelectorAll('input').forEach((input) =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ok();
      }),
    );
  });
}

// ---------------------------------------------------------------- l'invito dopo 20 minuti

const playedKey = () => game.session.LS_PREFIX + 'sims_guest_minutes';
const askedKey = () => game.session.LS_PREFIX + 'sims_guest_asked';

/**
 * Conta i minuti giocati da ospite (con la pagina in primo piano) e, arrivati a
 * GUEST_REMINDER_MINUTES, propone una volta di salvare il personaggio.
 */
export function startGuestReminder(): void {
  if (!isGuest()) return;
  lifetime.setInterval(() => {
    if (document.hidden || !isGuest()) return;
    let minutes = 0;
    try {
      if (localStorage.getItem(askedKey())) return;
      minutes = Number(localStorage.getItem(playedKey()) || 0) + 1;
      localStorage.setItem(playedKey(), String(minutes));
    } catch {
      return;
    }
    // non sopra un'altra finestra: si aspetta il minuto dopo
    if (minutes < GUEST_REMINDER_MINUTES || game.dialogResolve) return;
    try {
      localStorage.setItem(askedKey(), '1');
    } catch {
      // al peggio lo richiede alla prossima apertura
    }
    void offerSave();
  }, 60000);
}

/** Il testo del profilo per un ospite. */
export function guestProfileText(): string {
  const pending = guestPendingEmail();
  return (
    '👤 Stai giocando come ospite. ' +
    LOSE_TEXT +
    (pending ? `\n📧 Manca la conferma dell'email ${pending}.` : '')
  );
}
