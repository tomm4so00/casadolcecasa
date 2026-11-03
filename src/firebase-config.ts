import type { FirebaseOptions } from 'firebase/app';

// Configurazione pubblica dell'app; le autorizzazioni sono nelle Database Rules.
export const FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDjSJIUDYRml2hBUq8qMoQfOQ_S4mtzWXA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'casadolcecasa-6d92a.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://casadolcecasa-6d92a-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'casadolcecasa-6d92a',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:676472374684:web:390bc444b30e45d7ca7459',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '676472374684',
};
export const isFirebaseConfigured = () =>
  Object.values(FIREBASE_CONFIG).every((value) => typeof value === 'string' && value.length > 0);
