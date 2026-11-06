import type firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { firebaseClient, lifetime } from './runtime.js';
import { game } from './context.js';
import { lockCharacter } from '../storage/tab-lock.js';
import {
  authErrorMessage,
  decodeAccountBinding,
  emailError,
  emailKey,
  googlePlayerId,
  isLegacyEmail,
  onlineSaveKey,
  passwordError,
  usernameEmail,
  usernameError,
  usernameFromEmail,
} from './account-model.js';
import { decodeSaveV8 } from './save-model.js';

let releaseTab: (() => void) | null = null;
let sessionId: string | null = null;
let sessionValid = true;

// Another device took over this Sim: stop saving and block this one until the player reloads.
function loseSession(id: string) {
  if (sessionId !== id || !sessionValid) return;
  sessionValid = false;
  document.getElementById('session-lost-banner')?.classList.remove('hidden');
}

export async function acquirePlayerSession() {
  if (
    !game.session.OFFLINE &&
    (!game.session.authUid || firebaseClient.auth().currentUser?.uid !== game.session.authUid)
  )
    throw new Error('Accedi per aprire il tuo Sim.');
  releaseTab = await lockCharacter(game.session.myPlayerId);
  lifetime.add(() => {
    releaseTab?.();
    releaseTab = null;
  });
  sessionValid = true;
  if (game.session.OFFLINE) return;
  const id = crypto.randomUUID();
  lifetime.add(
    firebaseClient.auth().onAuthStateChanged((user) => {
      if (user?.uid !== game.session.authUid) loseSession(id);
    }),
  );
  const ref = game.session.db.ref('sims_sessions/' + game.session.myPlayerId);
  ref.on('value', () => {});
  await ref.get();
  const now = () => Date.now() + (game.session.serverOffset || 0);
  // The latest access wins: the device that held the Sim sees the change and blocks itself.
  const result = await ref.transaction(() => ({ id, expiresAt: now() + 45000 }));
  if (!result.committed) {
    releaseTab?.();
    releaseTab = null;
    throw new Error('Impossibile aprire il Sim: riprova tra qualche secondo.');
  }
  sessionId = id;
  ref.on('value', (snap) => {
    const value = snap.val();
    if (value?.id !== id) loseSession(id);
  });
  lifetime.setInterval(() => {
    if (!sessionValid) return;
    void ref
      .transaction((value) => (value?.id === id ? { id, expiresAt: now() + 45000 } : undefined))
      .then((value) => {
        if (!value.committed) loseSession(id);
      })
      .catch((error) => console.warn('[session]', error));
  }, 10000);
}

export function canPlaySession() {
  return sessionValid;
}

/** Esce dall'account: questa scheda smette di salvare e lascia il Sim libero. */
export async function signOutAccount(): Promise<void> {
  sessionValid = false;
  releaseTab?.();
  releaseTab = null;
  await googleAuth().signOut();
}

function googleAuth() {
  const auth = firebaseClient.auth();
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_FIREBASE_EMULATORS === 'true' &&
    !auth.emulatorConfig
  ) {
    auth.useEmulator('http://127.0.0.1:9099');
  }
  return auth;
}

const REMEMBER_KEY = 'sims_remember_me';

export function rememberMe(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === '1';
}

// "Ricordami": the Google sign-in survives closing the browser; otherwise it lasts for this tab only.
export async function setRememberMe(remember: boolean): Promise<void> {
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  const { LOCAL, SESSION } = firebaseClient.auth.Auth.Persistence;
  await googleAuth().setPersistence(remember ? LOCAL : SESSION);
}

// The user restored from a previous visit (Google or name and password), once Firebase has loaded it.
export function rememberedGoogleUser(): Promise<firebase.User | null> {
  const auth = googleAuth();
  return new Promise((resolve) => {
    const stop = auth.onAuthStateChanged((user) => {
      stop();
      resolve(user);
    });
  });
}

async function authenticateWithGoogle() {
  const auth = googleAuth();
  let user = auth.currentUser;
  if (!user || (await user.getIdTokenResult()).signInProvider !== 'google.com')
    user = (await auth.signInWithPopup(new firebaseClient.auth.GoogleAuthProvider())).user;
  if (!user) throw new Error('Accesso annullato.');
  return user;
}

// Codes of the Sims created before Google sign-in (Google Sims use the longer `player_{uid}`).
export const LEGACY_SIM_CODE = /^player_[a-z0-9]{4,20}$/;

// Links a pre-Google Sim to this account with no admin step. The database rules accept it only
// for a legacy code with a cloud save that no other account has claimed yet.
export async function claimLegacySim(playerId: string): Promise<string> {
  const code = playerId.trim();
  if (!LEGACY_SIM_CODE.test(code)) throw new Error('Codice Sim non valido (es. player_ab12cd3).');
  const user = await authenticateWithGoogle();
  try {
    await game.session.db.ref('').update({
      ['sims_legacy_claims/' + code]: user.uid,
      ['sims_accounts/' + user.uid]: { playerId: code },
      ['sims_link_requests/' + user.uid]: null,
    });
  } catch {
    throw new Error(
      'Impossibile collegare ' + code + ': il Sim non esiste o è già di un altro account.',
    );
  }
  return code;
}

export interface GoogleAccess {
  uid: string;
  name: string;
  playerId: string | null;
  pendingPlayerId: string | null;
}

// Signs in and reports whether this Google account already owns a Sim or is waiting for a link.
export async function signInWithGoogleAccount(): Promise<GoogleAccess> {
  return accessFor(await authenticateWithGoogle());
}

/** Accesso già fatto (Google o nome e password): il Sim dell'account, se c'è già. */
export async function accessFor(user: firebase.User): Promise<GoogleAccess> {
  const binding = decodeAccountBinding(
    (await game.session.db.ref('sims_accounts/' + user.uid).get()).val(),
  );
  let pendingPlayerId: string | null = null;
  if (!binding) {
    const request = (await game.session.db.ref('sims_link_requests/' + user.uid).get()).val();
    if (typeof request?.playerId === 'string') pendingPlayerId = request.playerId;
  }
  return {
    uid: user.uid,
    name: user.displayName || usernameFromEmail(user.email) || user.email || 'Giocatore',
    playerId: binding?.playerId ?? null,
    pendingPlayerId,
  };
}

// Code of the Sim saved on this device before Google sign-in, if any.
export function localLegacySimCode(): string | null {
  const legacy = localStorage.getItem('sims_save_v1');
  if (!legacy) return null;
  try {
    return decodeSaveV8(JSON.parse(legacy)) ? game.session.myPlayerId : null;
  } catch {
    return null;
  }
}

// A new identity creates its own deterministic ID; existing Sims go through claimLegacySim.
export async function createGoogleSim(uid: string): Promise<string> {
  const binding = decodeAccountBinding(
    (
      await game.session.db
        .ref('sims_accounts/' + uid)
        .transaction((value) => value || { playerId: googlePlayerId(uid) })
    ).snapshot.val(),
  );
  if (!binding) throw new Error('Profilo cloud non valido.');
  return binding.playerId;
}

export function useGoogleSim(uid: string, playerId: string): void {
  const legacy = localStorage.getItem('sims_save_v1');
  const key = onlineSaveKey(playerId);
  if (playerId === game.session.myPlayerId && legacy && !localStorage.getItem(key))
    localStorage.setItem(key, legacy);
  game.session.authUid = uid;
  game.session.myPlayerId = playerId;
  game.session.SAVE_KEY = key;
  localStorage.setItem('sims_device_id', playerId);
  localStorage.setItem('sims_adopt_nick', '1');
}

// ---------------------------------------------------------------- nome giocatore e password

/** Errore di Firebase tradotto in un messaggio per il giocatore. */
function friendlyAuthError(error: unknown): Error {
  const code = (error as { code?: unknown })?.code;
  return new Error(typeof code === 'string' ? authErrorMessage(code) : String(error));
}

/** Il link nelle email (conferma, cambio email) riporta al gioco, sulla stessa pagina. */
function linkSettings() {
  return { url: window.location.origin + window.location.pathname };
}

/** Manda un'email di Firebase in italiano; se l'indirizzo di ritorno non è autorizzato, senza. */
async function sendAuthEmail(send: (settings?: { url: string }) => Promise<void>): Promise<void> {
  googleAuth().languageCode = 'it';
  try {
    await send(linkSettings());
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code !== 'auth/unauthorized-continue-uri' && code !== 'auth/invalid-continue-uri')
      throw friendlyAuthError(error);
    await send().catch((e) => {
      throw friendlyAuthError(e);
    });
  }
}

/** Si è entrati in questo account con la password (non con Google). */
export async function signedInWithPassword(user: firebase.User): Promise<boolean> {
  return (await user.getIdTokenResult()).signInProvider === 'password';
}

/**
 * Primo accesso: crea l'account con il nome del personaggio, l'email e la password, e manda il
 * link per confermare l'email. Finché non è confermata non si gioca.
 */
export async function registerWithEmail(name: string, email: string, password: string) {
  const problem = usernameError(name) || emailError(email) || passwordError(password);
  if (problem) throw new Error(problem);
  let user: firebase.User | null;
  try {
    user = (await googleAuth().createUserWithEmailAndPassword(email.trim(), password)).user;
  } catch (error) {
    throw friendlyAuthError(error);
  }
  if (!user) throw new Error('Registrazione non riuscita.');
  await user.updateProfile({ displayName: name.trim().slice(0, 20) }).catch(() => {});
  await sendAuthEmail((settings) => user!.sendEmailVerification(settings));
  return user;
}

/**
 * Accesso con email e password. Gli account di prima, registrati con il nome giocatore, entrano
 * ancora col nome (senza "@") solo per aggiungere la loro email.
 */
export async function signInWithPassword(id: string, password: string) {
  const login = id.trim();
  if (!login || !password) throw new Error('Scrivi la tua email e la password.');
  const email = login.includes('@') ? login : usernameError(login) ? '' : usernameEmail(login);
  if (!email) throw new Error('Email o password sbagliate.');
  try {
    const user = (await googleAuth().signInWithEmailAndPassword(email, password)).user;
    if (!user) throw new Error('Accesso annullato.');
    return user;
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

/** L'account con la password ha un'email vera e confermata (altrimenti non si gioca). */
export function emailConfirmed(user: firebase.User): boolean {
  return user.emailVerified && !isLegacyEmail(user.email);
}

/** Rimanda il link di conferma all'email dell'account. */
export async function resendVerification(): Promise<void> {
  const user = googleAuth().currentUser;
  if (!user) throw new Error('Accedi di nuovo.');
  await sendAuthEmail((settings) => user.sendEmailVerification(settings));
}

/**
 * Dopo il clic sul link: rilegge l'account da Firebase e rinnova il permesso, così il database
 * vede l'email confermata. Restituisce l'account aggiornato, o null se non è ancora confermata.
 */
export async function reloadConfirmed(): Promise<firebase.User | null> {
  const user = googleAuth().currentUser;
  if (!user) throw new Error('Accedi di nuovo con la tua email e la password.');
  try {
    await user.reload();
  } catch (error) {
    throw friendlyAuthError(error);
  }
  const fresh = googleAuth().currentUser;
  if (!fresh || !emailConfirmed(fresh)) return null;
  await fresh.getIdToken(true);
  return fresh;
}

/**
 * Account di prima (nome e password, senza email): manda il link alla nuova email; quando il
 * giocatore lo apre, l'email diventa quella dell'account, già confermata.
 */
export async function addEmailToAccount(email: string): Promise<void> {
  const problem = emailError(email);
  if (problem) throw new Error(problem);
  const user = googleAuth().currentUser;
  if (!user) throw new Error('Accedi di nuovo.');
  await sendAuthEmail((settings) => user.verifyBeforeUpdateEmail(email.trim(), settings));
}

/**
 * Prima di creare il personaggio la casella si segna nel database: ogni casella vale un solo
 * account, anche scritta con i punti in altri posti (le regole fanno lo stesso calcolo).
 */
export async function claimEmail(): Promise<void> {
  const user = googleAuth().currentUser;
  if (!user?.email) throw new Error('Accedi di nuovo.');
  const ref = game.session.db.ref('sims_emails/' + emailKey(user.email));
  try {
    if ((await ref.get()).val() === user.uid) return;
  } catch {
    // la casella è di un altro account (non si può leggere): lo dice la scrittura qui sotto
  }
  try {
    await ref.set(user.uid);
  } catch {
    throw new Error(
      'Questa email (o una sua variante) è già usata da un altro account: accedi con quello.',
    );
  }
}

/** Password dimenticata: manda il link per sceglierne una nuova. */
export async function sendPasswordReset(email: string): Promise<void> {
  const problem = emailError(email);
  if (problem) throw new Error('Scrivi qui sopra la tua email, poi tocca di nuovo.');
  await sendAuthEmail((settings) => googleAuth().sendPasswordResetEmail(email.trim(), settings));
}

/** Come si accede a questo account: nome giocatore (se registrato così) e se Google è collegato. */
export function accountLogins(): {
  username: string | null;
  email: string | null;
  google: boolean;
} {
  const user = googleAuth().currentUser;
  const providers = (user?.providerData || []).map((p) => p?.providerId);
  const password = providers.includes('password');
  return {
    username: usernameFromEmail(user?.email),
    email: password && !isLegacyEmail(user?.email) ? user?.email || null : null,
    google: providers.includes('google.com'),
  };
}

/**
 * Collega Google all'account con nome e password: da quel momento si entra con l'uno o con
 * l'altro e si ritrova lo stesso Sim (l'account resta lo stesso).
 */
export async function linkGoogleAccount(): Promise<void> {
  const user = googleAuth().currentUser;
  if (!user) throw new Error('Accedi prima di collegare Google.');
  try {
    await user.linkWithPopup(new firebaseClient.auth.GoogleAuthProvider());
  } catch (error) {
    throw friendlyAuthError(error);
  }
}
