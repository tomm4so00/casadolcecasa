import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import { FIREBASE_CONFIG, isFirebaseConfigured } from '../firebase-config.js';
import { Lifetime } from './lifetime.js';
import { localDatabase } from './database.js';
import type { GameDatabase, GameReference, GameSnapshot } from './database.js';
import type { GameValue } from './context.js';
export const browser = window as Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };
export const dom = (id: string): GameValue => document.getElementById(id);
export const firebaseClient = firebase;
export const firebaseOptions = FIREBASE_CONFIG;
export let lifetime = new Lifetime();
export function isLocalMode() {
  return new URLSearchParams(location.search).has('offline') || !isFirebaseConfigured();
}
export function resetLifetime() {
  lifetime.dispose();
  lifetime = new Lifetime();
}
export function createLocalDb() {
  return localDatabase(lifetime);
}
const emulatorDatabases = new WeakSet<firebase.database.Database>();

export function createDatabase(local: boolean): GameDatabase {
  if (local) return createLocalDb();
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
  const db = app.database();
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_FIREBASE_EMULATORS === 'true' &&
    !emulatorDatabases.has(db)
  ) {
    db.useEmulator('127.0.0.1', 9000);
    emulatorDatabases.add(db);
  }
  const scope = lifetime;
  const wrap = (
    reference: firebase.database.Reference | firebase.database.Query,
  ): GameReference => ({
    key: reference.ref.key,
    get() {
      return reference.get();
    },
    async once(event, callback) {
      const result = await reference.once(event as firebase.database.EventType);
      if (scope.active) callback?.(result);
      return result;
    },
    on(event, callback) {
      const guarded = (value: firebase.database.DataSnapshot) => {
        if (scope.active) callback(value);
      };
      reference.on(event as firebase.database.EventType, guarded);
      scope.add(() => reference.off(event as firebase.database.EventType, guarded));
      return guarded;
    },
    off(event, callback) {
      reference.off(
        event as firebase.database.EventType | undefined,
        callback as ((s: firebase.database.DataSnapshot) => void) | undefined,
      );
    },
    async set(value) {
      await reference.ref.set(value);
    },
    async update(value) {
      await reference.ref.update(value);
    },
    async remove() {
      await reference.ref.remove();
    },
    async transaction(update) {
      return reference.ref.transaction((value) => (scope.active ? update(value) : undefined));
    },
    push(value) {
      const child = reference.ref.push();
      if (value !== undefined) void child.set(value);
      return wrap(child);
    },
    orderByChild(key) {
      return wrap(reference.orderByChild(key));
    },
    orderByKey() {
      return wrap(reference.orderByKey());
    },
    limitToLast(count) {
      return wrap(reference.limitToLast(count));
    },
    onDisconnect() {
      return reference.ref.onDisconnect();
    },
  });
  // Il percorso vuoto è la radice: da Firebase 9 db.ref('') va in errore, serve db.ref()
  return {
    ref: (path) => wrap(path ? db.ref(path) : db.ref()),
    goOffline: () => db.goOffline(),
    goOnline: () => db.goOnline(),
  };
}

export type { GameSnapshot };
