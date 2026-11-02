import 'firebase/compat/auth';
import { firebaseClient, lifetime } from './runtime.js';
import { game } from './context.js';
import { lockCharacter } from '../storage/tab-lock.js';
import { googlePlayerId, decodeAccountBinding, onlineSaveKey } from './account-model.js';
import { decodeSaveV8 } from './save-model.js';
import { openDialog } from './interface.js';

let releaseTab: (() => void) | null = null;
let sessionId: string | null = null;
let sessionValid = true;

export async function acquirePlayerSession() {
  if (
    !game.session.OFFLINE &&
    (!game.session.authUid || firebaseClient.auth().currentUser?.uid !== game.session.authUid)
  )
    throw new Error('Accedi con Google per aprire il tuo Sim.');
  releaseTab = await lockCharacter(game.session.myPlayerId);
  lifetime.add(() => {
    releaseTab?.();
    releaseTab = null;
  });
  sessionValid = true;
  if (game.session.OFFLINE) return;
  lifetime.add(
    firebaseClient.auth().onAuthStateChanged((user) => {
      if (user?.uid !== game.session.authUid) sessionValid = false;
    }),
  );
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

export async function authenticateWithGoogle() {
  const auth = firebaseClient.auth();
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_FIREBASE_EMULATORS === 'true' &&
    !auth.emulatorConfig
  ) {
    auth.useEmulator('http://127.0.0.1:9099');
  }
  let user = auth.currentUser;
  if (!user || (await user.getIdTokenResult()).signInProvider !== 'google.com')
    user = (await auth.signInWithPopup(new firebaseClient.auth.GoogleAuthProvider())).user;
  if (!user) throw new Error('Accesso annullato.');
  return user;
}

export async function requestLegacyLink(playerId: string): Promise<void> {
  if (!/^player_[A-Za-z0-9_-]{4,128}$/.test(playerId)) throw new Error('Codice Sim non valido.');
  const user = await authenticateWithGoogle();
  await game.session.db
    .ref('sims_link_requests/' + user.uid)
    .set({ playerId, requestedAt: Date.now() });
}

// A new identity can only create its own deterministic ID. Existing Sims require an admin-approved link.
export async function loginWithGoogle(): Promise<string> {
  const user = await authenticateWithGoogle();
  const ref = game.session.db.ref('sims_accounts/' + user.uid);
  let binding = decodeAccountBinding((await ref.get()).val());
  const legacy = localStorage.getItem('sims_save_v1');
  if (!binding && legacy) {
    let previous: unknown;
    try {
      previous = JSON.parse(legacy);
    } catch {
      previous = null;
    }
    if (decodeSaveV8(previous)) {
      const choice = await openDialog({
        title: 'Hai già un Sim su questo dispositivo',
        text: 'Puoi richiedere il collegamento del Sim precedente al tuo account Google, oppure crearne uno nuovo. I progressi precedenti vengono conservati.',
        buttons: [
          { label: 'Crea un nuovo Sim', value: 'new' },
          { label: 'Collega il Sim precedente', value: 'link' },
        ],
      });
      if (choice.action !== 'new') {
        await requestLegacyLink(game.session.myPlayerId);
        throw new Error(
          'Richiesta inviata al gestore. Il Sim precedente resta conservato in attesa del collegamento.',
        );
      }
    }
  }
  if (!binding)
    binding = decodeAccountBinding(
      (
        await ref.transaction((value) => value || { playerId: googlePlayerId(user.uid) })
      ).snapshot.val(),
    );
  if (!binding) throw new Error('Profilo cloud non valido.');
  const playerId = binding.playerId;
  const key = onlineSaveKey(playerId);
  if (playerId === game.session.myPlayerId && legacy && !localStorage.getItem(key))
    localStorage.setItem(key, legacy);
  game.session.authUid = user.uid;
  game.session.myPlayerId = playerId;
  game.session.SAVE_KEY = key;
  localStorage.setItem('sims_device_id', playerId);
  localStorage.setItem('sims_adopt_nick', '1');
  return user.displayName || user.email || 'Giocatore';
}
