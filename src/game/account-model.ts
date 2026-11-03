export interface AccountBinding {
  playerId: string;
}
export function googlePlayerId(uid: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Identità Google non valida.');
  return 'player_' + uid;
}
export function decodeAccountBinding(value: unknown): AccountBinding | null {
  if (!value || typeof value !== 'object' || !('playerId' in value)) return null;
  const id = value.playerId;
  return typeof id === 'string' && /^player_[A-Za-z0-9_-]{4,128}$/.test(id)
    ? { playerId: id }
    : null;
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
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

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

/** Il nome giocatore di un account con nome e password (null per gli account Google). */
export function usernameFromEmail(email: string | null | undefined): string | null {
  const suffix = '@' + USERNAME_DOMAIN;
  return email && email.endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}

/** Messaggio in italiano per gli errori di accesso di Firebase (codice "auth/..."). */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Questo nome giocatore è già preso: scegline un altro.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Nome giocatore o password sbagliati.';
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
