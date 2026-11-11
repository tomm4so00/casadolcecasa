import type { GameValue } from './context.js';
import type { Lifetime } from './lifetime.js';
export interface GameSnapshot {
  key: string | null;
  val(): GameValue;
  exists(): boolean;
  forEach(callback: (child: GameSnapshot) => boolean | void): boolean;
}
export interface GameReference {
  key: string | null;
  get(): Promise<GameSnapshot>;
  once(event: string, callback?: (snapshot: GameSnapshot) => void): Promise<GameSnapshot>;
  on(event: string, callback: (snapshot: GameSnapshot) => void): unknown;
  off(event?: string, callback?: (snapshot: GameSnapshot) => void): void;
  set(value: GameValue): Promise<void>;
  update(value: Record<string, GameValue>): Promise<void>;
  remove(): Promise<void>;
  transaction(
    update: (value: GameValue) => GameValue,
  ): Promise<{ committed: boolean; snapshot: GameSnapshot }>;
  push(value?: GameValue): GameReference;
  orderByChild(key: string): GameReference;
  orderByKey(): GameReference;
  limitToLast(count: number): GameReference;
  onDisconnect(): {
    remove(): Promise<void>;
    update(value: Record<string, GameValue>): Promise<void>;
    cancel(): Promise<void>;
  };
}
export interface GameDatabase {
  ref(path: string): GameReference;
  /** Chiude e riapre la connessione (la pausa, dormancy.ts); il database locale non ne ha. */
  goOffline?(): void;
  goOnline?(): void;
}

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

// Stesso contratto di Realtime Database, conservato sul dispositivo in modalità prova.
export function localDatabase(lifetime: Lifetime, storage: Storage = localStorage): GameDatabase {
  const key = 'offline_sims_database_v8';
  let data: Record<string, GameValue> = {};
  try {
    const saved: unknown = JSON.parse(storage.getItem(key) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) data = saved;
  } catch {
    /* Archivio vuoto o corrotto. */
  }
  const listeners = new Set<{
    path: string;
    event: string;
    callback: (snapshot: GameSnapshot) => void;
  }>();
  const parts = (path: string) => path.split('/').filter(Boolean);
  const get = (path: string): GameValue => {
    if (path === '.info/connected') return true;
    if (path === '.info/serverTimeOffset') return 0;
    return parts(path).reduce<GameValue>((value, part) => value?.[part], data) ?? null;
  };
  const snapshot = (path: string, value: GameValue = get(path)): GameSnapshot => ({
    key: parts(path).at(-1) ?? null,
    val: () => clone(value),
    exists: () => value !== null && value !== undefined,
    forEach(callback) {
      for (const [child, item] of Object.entries(value || {}))
        if (callback(snapshot(path + '/' + child, item)) === true) return true;
      return false;
    },
  });
  const notify = () => {
    for (const listener of [...listeners]) {
      if (lifetime.active && listener.event === 'value') listener.callback(snapshot(listener.path));
    }
  };
  const persist = () => {
    const saved = { ...data };
    delete saved.sims_online_players;
    try {
      storage.setItem(key, JSON.stringify(saved));
    } catch (error) {
      console.warn('[local-save]', error);
    }
  };
  const set = (path: string, value: GameValue) => {
    const keys = parts(path);
    if (!keys.length) {
      data = clone(value || {});
      return;
    }
    let parent = data;
    for (const part of keys.slice(0, -1)) parent = parent[part] ??= {};
    const last = keys.at(-1)!;
    if (value === null || value === undefined) delete parent[last];
    else parent[last] = clone(value);
    persist();
    notify();
  };
  const reference = (path: string, order?: string, count?: number): GameReference => {
    const read = () => {
      const value = get(path);
      if (!value || typeof value !== 'object' || (!order && !count)) return snapshot(path, value);
      const entries = Object.entries(value).sort(([a, av], [b, bv]) =>
        order && order !== '$key'
          ? Number((av as Record<string, unknown>)[order] || 0) -
            Number((bv as Record<string, unknown>)[order] || 0)
          : a.localeCompare(b),
      );
      return snapshot(path, Object.fromEntries(count ? entries.slice(-count) : entries));
    };
    return {
      key: parts(path).at(-1) ?? null,
      async get() {
        return read();
      },
      async once(_event, callback) {
        const result = read();
        callback?.(result);
        return result;
      },
      on(event, callback) {
        const listener = { path, event, callback };
        listeners.add(listener);
        lifetime.setTimeout(() => {
          if (listeners.has(listener)) callback(read());
        }, 0);
        lifetime.add(() => listeners.delete(listener));
        return callback;
      },
      off(event, callback) {
        for (const listener of listeners)
          if (
            listener.path === path &&
            (!event || listener.event === event) &&
            (!callback || listener.callback === callback)
          )
            listeners.delete(listener);
      },
      async set(value) {
        set(path, value);
      },
      async update(value) {
        for (const [child, item] of Object.entries(value || {})) set(path + '/' + child, item);
      },
      async remove() {
        set(path, null);
      },
      async transaction(update) {
        const value = update(clone(get(path)));
        if (value !== undefined) set(path, value);
        return { committed: value !== undefined, snapshot: read() };
      },
      push(value) {
        const child = reference(
          path +
            '/-' +
            Date.now().toString(36) +
            crypto.randomUUID().replaceAll('-', '').slice(0, 12),
        );
        if (value !== undefined) void child.set(value);
        return child;
      },
      orderByChild(child) {
        return reference(path, child, count);
      },
      orderByKey() {
        return reference(path, '$key', count);
      },
      limitToLast(limit) {
        return reference(path, order, limit);
      },
      onDisconnect() {
        return {
          async update() {},
          remove: async () => {},
          cancel: async () => {},
        };
      },
    };
  };
  return { ref: (path) => reference(path) };
}
