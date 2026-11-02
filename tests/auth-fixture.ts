import { firebaseClient } from '../src/game/runtime.js';

export async function signInTestUser(email: string) {
  const auth = firebaseClient.auth();
  if (!auth.emulatorConfig) auth.useEmulator('http://127.0.0.1:9099');
  const credential = firebaseClient.auth.GoogleAuthProvider.credential(
    JSON.stringify({
      sub: email,
      email,
      email_verified: true,
      name: 'Giocatore test',
    }),
  );
  return (await auth.signInWithCredential(credential)).user!.uid;
}
