// Notifiche push: registrano il telefono presso Firebase Cloud Messaging, così il server può
// avvisare il giocatore anche quando il gioco è chiuso (es. personaggio che sta per morire).
import { game } from './context.js';
import { browser, firebaseClient } from './runtime.js';

let registration: ServiceWorkerRegistration | null = null;
const KEY_STORE = 'sims_push_key';

/** Scollega questo dispositivo: il server non gli manda più avvisi. */
export async function disablePush(): Promise<void> {
  const key = localStorage.getItem(KEY_STORE);
  if (!key || game.session.OFFLINE || !game.session.authUid) return;
  try {
    await game.session.db.ref(`sims_push/${game.session.myPlayerId}/tokens/${key}`).remove();
    localStorage.removeItem(KEY_STORE);
  } catch (e) {
    console.warn('[notifiche] scollegamento', e);
  }
}

/**
 * Registra il service worker che mostra le notifiche (serve anche ai telefoni Android).
 * Si chiama anche all'avvio: senza service worker il browser non propone di installare il gioco.
 */
export async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (!('serviceWorker' in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register('./push-sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (e) {
    console.warn('[notifiche] service worker', e);
    return null;
  }
}

/** Mostra una notifica dal service worker se c'è (sui telefoni `new Notification` non funziona). */
export async function showPhoneNotification(title: string, body: string, tag: string) {
  const reg = await serviceWorker();
  if (!reg) return false;
  try {
    await reg.showNotification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Collega questo dispositivo agli avvisi del server. Si chiama quando il giocatore attiva le
 * notifiche e a ogni avvio (il codice del dispositivo può cambiare nel tempo).
 * Restituisce false se il dispositivo non le supporta (es. iPhone senza "Aggiungi a Home").
 */
export async function enablePush(): Promise<boolean> {
  if (game.session.OFFLINE || !game.session.authUid) return false;
  if (typeof browser.Notification === 'undefined' || Notification.permission !== 'granted')
    return false;
  if (!('PushManager' in browser)) return false;
  const reg = await serviceWorker();
  if (!reg) return false;
  try {
    await import('firebase/compat/messaging');
    if (!firebaseClient.messaging.isSupported()) return false;
    const token: string = await firebaseClient.messaging().getToken({
      serviceWorkerRegistration: reg,
    });
    if (!token) return false;
    const key = await sha256(token);
    await game.session.db
      .ref(`sims_push/${game.session.myPlayerId}/tokens/${key}`)
      .set({ token, t: Date.now() });
    localStorage.setItem(KEY_STORE, key);
    return true;
  } catch (e) {
    console.warn('[notifiche] registrazione', e);
    return false;
  }
}
