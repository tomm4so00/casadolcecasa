import { firebaseClient } from '../src/game/runtime.js';

export async function signInTestUser(email: string) {
  const auth = firebaseClient.auth();
  if (!auth.emulatorConfig) auth.useEmulator('http://127.0.0.1:9099');
  try {
    return (await auth.signInWithEmailAndPassword(email, 'test-password-123')).user!.uid;
  } catch {
    return (await auth.createUserWithEmailAndPassword(email, 'test-password-123')).user!.uid;
  }
}
