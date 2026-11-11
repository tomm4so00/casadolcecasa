/** Accesso rapido disponibile soltanto con il server di sviluppo. */
export const devMode =
  import.meta.env.DEV &&
  (import.meta.env.MODE === 'test' || new URLSearchParams(location.search).has('test'));
