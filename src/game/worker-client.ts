// Le chiamate al Worker di Cloudflare (worker/): paga dei turni, indizio di Zero. Il Worker
// riconosce il giocatore dal token di accesso di Firebase.
import { firebaseClient } from './runtime.js';

/** Il Worker (wrangler.toml, workers_dev); quello di prova si dà con VITE_WORKER_URL. */
export const WORKER_URL: string =
  import.meta.env.VITE_WORKER_URL ||
  'https://casadolcecasa-criogenesi.casadolcecasa-criogenesi.workers.dev';

const TIMEOUT_MS = 12_000;

export interface WorkerReply {
  ok: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/** Una chiamata al Worker; null se non risponde (rete, server spento, risposta rotta). */
export async function callWorker(path: string, body: unknown): Promise<WorkerReply | null> {
  const user = firebaseClient.auth().currentUser;
  if (!user) return { ok: false, error: 'accesso', message: 'Accedi per continuare.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(WORKER_URL + path, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + (await user.getIdToken()),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const reply = (await response.json()) as WorkerReply;
    return reply && typeof reply === 'object' && typeof reply.ok === 'boolean' ? reply : null;
  } catch (error) {
    console.warn('[worker]', path, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
