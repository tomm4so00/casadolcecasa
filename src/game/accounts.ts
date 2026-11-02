import 'firebase/compat/auth';
import { firebaseClient, lifetime } from './runtime.js';
import { game } from './context.js';
import { lockCharacter } from '../storage/tab-lock.js';

let releaseTab: (() => void) | null = null;
let sessionId: string | null = null;
let sessionValid = true;

export async function acquirePlayerSession() {
  releaseTab = await lockCharacter(game.session.myPlayerId);
  lifetime.add(() => {
    releaseTab?.();
    releaseTab = null;
  });
  sessionValid = true;
  if (game.session.OFFLINE) return;
  const id = crypto.randomUUID();
  const ref = game.session.db.ref('sims_sessions/' + game.session.myPlayerId);
  ref.on('value', () => {});
  await ref.get();
  const now = () => Date.now() + (game.session.serverOffset || 0);
  const result = await ref.transaction((value) => {
    if (value && value.expiresAt > now() && value.id !== id) return undefined;
    return { id, expiresAt: now() + 45000 };
  });
  if (!result.committed) {
    releaseTab?.();
    releaseTab = null;
    throw new Error(
      'Questo personaggio è già aperto altrove. Esci dall’altra sessione o attendi 45 secondi.',
    );
  }
  sessionId = id;
  ref.on('value', (snap) => {
    const value = snap.val();
    if (value?.id !== id) sessionValid = false;
  });
  lifetime.setInterval(() => {
    if (!sessionValid) return;
    void ref
      .transaction((value) => (value?.id === id ? { id, expiresAt: now() + 45000 } : undefined))
      .then((value) => {
        if (!value.committed) sessionValid = false;
      })
      .catch((error) => console.warn('[session]', error));
  }, 10000);
}

export function canPlaySession() {
  return sessionValid;
}

export async function releasePlayerSession() {
  const id = sessionId;
  sessionId = null;
  try {
    if (id && !game.session.OFFLINE)
      await game.session.db
        .ref('sims_sessions/' + game.session.myPlayerId)
        .transaction((value) => (value?.id === id ? null : undefined));
  } finally {
    releaseTab?.();
    releaseTab = null;
  }
}

// Collega l'account Google al codice esistente, conservando stanza e progressi v8.
export async function loginWithGoogle(): Promise<string> {
  const auth = firebaseClient.auth();
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_FIREBASE_EMULATORS === 'true' &&
    !auth.emulatorConfig
  ) {
    auth.useEmulator('http://127.0.0.1:9099');
  }
  const user =
    auth.currentUser ??
    (await auth.signInWithPopup(new firebaseClient.auth.GoogleAuthProvider())).user;
  if (!user) throw new Error('Accesso annullato.');
  const ref = game.session.db.ref('sims_accounts/' + user.uid);
  const binding = await ref.transaction((value) => value || { playerId: game.session.myPlayerId });
  const playerId: unknown = binding.snapshot.val()?.playerId;
  if (typeof playerId !== 'string' || !/^player_[a-z0-9]{4,20}$/.test(playerId))
    throw new Error('Profilo cloud non valido.');
  if (playerId !== game.session.myPlayerId) {
    const previous = localStorage.getItem(game.session.SAVE_KEY);
    if (previous) localStorage.setItem(game.session.SAVE_KEY + '.backup.' + Date.now(), previous);
    localStorage.removeItem(game.session.SAVE_KEY);
    localStorage.setItem(game.session.LS_PREFIX + 'sims_device_id', playerId);
    localStorage.setItem(game.session.LS_PREFIX + 'sims_adopt_nick', '1');
    game.session.myPlayerId = playerId;
  }
  return user.displayName || user.email || 'Giocatore';
}
