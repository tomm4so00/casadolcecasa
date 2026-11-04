import type firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { firebaseClient, lifetime } from './runtime.js';
import { game } from './context.js';
import { lockCharacter } from '../storage/tab-lock.js';
import {
  authErrorMessage,
  decodeAccountBinding,
  googlePlayerId,
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

/** Primo accesso: crea l'account con il nome giocatore e la password scelti. */
export async function registerWithPassword(username: string, password: string) {
  const problem = usernameError(username) || passwordError(password);
  if (problem) throw new Error(problem);
  let user: firebase.User | null;
  try {
    user = (await googleAuth().createUserWithEmailAndPassword(usernameEmail(username), password))
      .user;
  } catch (error) {
    throw friendlyAuthError(error);
  }
  if (!user) throw new Error('Registrazione non riuscita.');
  await user.updateProfile({ displayName: username.trim().slice(0, 20) }).catch(() => {});
  return user;
}

/** Accesso con nome giocatore e password già registrati. */
export async function signInWithPassword(username: string, password: string) {
  if (usernameError(username) || !password) throw new Error('Nome giocatore o password sbagliati.');
  try {
    const user = (await googleAuth().signInWithEmailAndPassword(usernameEmail(username), password))
      .user;
    if (!user) throw new Error('Accesso annullato.');
    return user;
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

/** Come si accede a questo account: nome giocatore (se registrato così) e se Google è collegato. */
export function accountLogins(): { username: string | null; google: boolean } {
  const user = googleAuth().currentUser;
  const providers = (user?.providerData || []).map((p) => p?.providerId);
  return { username: usernameFromEmail(user?.email), google: providers.includes('google.com') };
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
