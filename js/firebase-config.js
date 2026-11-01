// Configurazione Firebase: sostituisci con i dati del tuo progetto.
// Finché restano i valori segnaposto il gioco parte in modalità offline (single player).
export const FIREBASE_CONFIG = {
  apiKey: "TUA_API_KEY",
  authDomain: "TUO_PROGETTO.firebaseapp.com",
  databaseURL: "https://TUO_PROGETTO-default-rtdb.firebaseio.com",
  projectId: "TUO_PROGETTO",
  storageBucket: "TUO_PROGETTO.appspot.com",
  messagingSenderId: "ID",
  appId: "APP_ID"
};

export const isFirebaseConfigured = () => FIREBASE_CONFIG.apiKey !== "TUA_API_KEY";
