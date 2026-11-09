interface AccountBinding {
  playerId: string;
  /** Account ospite (accesso anonimo): quando è nato, in ms. Salvando il personaggio si toglie. */
  guest?: number;
}
export function googlePlayerId(uid: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Identità Google non valida.');
  return 'player_' + uid;
}
export function decodeAccountBinding(value: unknown): AccountBinding | null {
  if (!value || typeof value !== 'object' || !('playerId' in value)) return null;
  const id = value.playerId;
  if (typeof id !== 'string' || !/^player_[A-Za-z0-9_-]{4,128}$/.test(id)) return null;
  const guest = (value as { guest?: unknown }).guest;
  return typeof guest === 'number' && Number.isFinite(guest)
    ? { playerId: id, guest }
    : { playerId: id };
}
export function onlineSaveKey(playerId: string): string {
  return 'sims_save_v1:' + playerId;
}

// ---------------------------------------------------------------- ricominciare dopo la morte

/**
 * Codice del nuovo personaggio di chi ricomincia dopo la morte: legato allo stesso account Google,
 * ma diverso dal precedente, così il nuovo personaggio parte da zero e il vecchio resta al cimitero.
 */
export function rebirthPlayerId(uid: string, now: number): string {
  return googlePlayerId(uid) + '_r' + Math.floor(now).toString(36);
}

/** Spiega perché il nome scelto per il nuovo personaggio non va bene, oppure null. */
export function rebirthNameError(name: string, deadName: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Scrivi il nome del nuovo personaggio.';
  if (clean.length > 20) return 'Il nome può avere al massimo 20 caratteri.';
  if (clean.toLocaleLowerCase('it-IT') === deadName.trim().toLocaleLowerCase('it-IT'))
    return `Scegli un nome diverso da ${deadName.trim()}: quel personaggio riposa al cimitero.`;
  return null;
}

// ---------------------------------------------------------------- nome giocatore e password

/**
 * Chi non usa Google accede con nome giocatore e password. Per Firebase il nome diventa un
 * indirizzo interno al gioco (che il giocatore non vede): nome@giocatori.casadolcecasa.app.
 */
export const USERNAME_DOMAIN = 'giocatori.casadolcecasa.app';
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 64;

/** Il nome senza spazi ai lati e in minuscolo: "Mario" e "mario" sono lo stesso giocatore. */
export const normalizeUsername = (name: string): string => name.trim().toLowerCase();

/** Spiega cosa non va nel nome giocatore, oppure null se va bene. */
export function usernameError(name: string): string | null {
  const n = normalizeUsername(name);
  if (!n) return 'Scrivi il tuo nome giocatore.';
  if (n.length < USERNAME_MIN || n.length > USERNAME_MAX)
    return `Il nome giocatore deve avere da ${USERNAME_MIN} a ${USERNAME_MAX} caratteri.`;
  if (!/^[a-z0-9._-]+$/.test(n))
    return 'Nel nome giocatore usa solo lettere senza accenti, numeri, punto, trattino e trattino basso.';
  return null;
}

/** Spiega cosa non va nella password, oppure null se va bene. */
export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN)
    return `La password deve avere almeno ${PASSWORD_MIN} caratteri.`;
  if (password.length > PASSWORD_MAX)
    return `La password può avere al massimo ${PASSWORD_MAX} caratteri.`;
  return null;
}

/** Indirizzo interno usato da Firebase per questo nome giocatore. */
export const usernameEmail = (name: string): string =>
  `${normalizeUsername(name)}@${USERNAME_DOMAIN}`;

// ---------------------------------------------------------------- email vera

/**
 * Da novembre 2026 chi non usa Google si registra con un'email vera, da confermare: ogni casella
 * vale un solo account. Gli account vecchi (indirizzo interno del gioco) devono aggiungerla.
 */
const EMAIL_MAX = 254;

/** Spiega cosa non va nell'email, oppure null se va bene. */
export function emailError(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Scrivi la tua email.';
  if (e.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    return 'Questa email non è valida.';
  // mario+1@gmail.com arriva a mario@gmail.com: con il + si potrebbero fare account infiniti
  if (e.includes('+')) return "Usa l'email senza il segno +.";
  if (e.toLowerCase().endsWith('@' + USERNAME_DOMAIN)) return 'Usa la tua email vera.';
  return null;
}

/**
 * La casella, per riconoscere i doppioni: minuscole e senza punti, come le regole del database
 * (`auth.token.email.toLowerCase().replace('.', '')`). Così m.ario@gmail.com e mario@gmail.com,
 * che Gmail consegna alla stessa persona, contano come una sola email.
 */
export const emailKey = (email: string): string => email.trim().toLowerCase().split('.').join('');

/** L'account usa ancora l'indirizzo interno del gioco (registrato con nome e password). */
export const isLegacyEmail = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase().endsWith('@' + USERNAME_DOMAIN);

/** Il nome giocatore di un account con nome e password (null per gli account Google). */
export function usernameFromEmail(email: string | null | undefined): string | null {
  const suffix = '@' + USERNAME_DOMAIN;
  return email && email.endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}

/** Messaggio in italiano per gli errori di accesso di Firebase (codice "auth/..."). */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return "Esiste già un account con questa email: accedi, oppure usa un'altra email.";
    case 'auth/invalid-email':
      return 'Questa email non è valida.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email o password sbagliate.';
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return 'Per sicurezza accedi di nuovo con la tua email e la password, poi riprova.';
    case 'auth/weak-password':
      return `La password è troppo debole: usa almeno ${PASSWORD_MIN} caratteri.`;
    case 'auth/too-many-requests':
      return 'Troppi tentativi sbagliati: aspetta qualche minuto e riprova.';
    case 'auth/operation-not-allowed':
      return 'L’accesso con nome giocatore e password non è ancora attivo sul server.';
    case 'auth/network-request-failed':
      return 'Connessione assente: controlla internet e riprova.';
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'Questo account Google è già usato da un altro personaggio: scegline un altro.';
    // l'accesso anonimo spento nella console di Firebase dà questo errore
    case 'auth/admin-restricted-operation':
      return 'Il gioco senza account non è ancora attivo: entra con Google o con la tua email.';
    case 'auth/provider-already-linked':
      return 'Il tuo account è già collegato a Google.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Finestra di Google chiusa: collegamento annullato.';
    case 'auth/popup-blocked':
      return 'Il browser ha bloccato la finestra di Google: consenti i popup e riprova.';
    default:
      return 'Accesso non riuscito (' + code + '). Riprova.';
  }
}
