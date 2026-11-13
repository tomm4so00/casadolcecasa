// Worker di Cloudflare del gioco. Fa due cose:
// - riceve da Stripe la conferma dei pagamenti della criogenesi e allunga il pass dell'account;
// - versa la paga dei turni di lavoro (/lavoro/…), al posto del browser (job-shift.ts);
// - durante l'attacco di Zero dice la prima cifra del PIN privato (/scasso/…, safe-hint.ts);
// - dice quanti giocatori sono collegati, per la prima schermata (/online, online.ts).
// Configurazione in docs/criogenesi.md:
//   STRIPE_WEBHOOK_SECRET      segreto "whsec_…" del webhook               (wrangler secret put)
//   FIREBASE_SERVICE_ACCOUNT   chiave JSON di un account di servizio        (wrangler secret put)
//   STRIPE_CRYO_PAYMENT_LINK   id "plink_…" del Payment Link dei 30 giorni      (wrangler.toml)
//   STRIPE_CRYO_LIFETIME_LINK  id "plink_…" del Payment Link del pass a vita    (wrangler.toml)
//   FIREBASE_DATABASE_URL      indirizzo del database                        (wrangler.toml)
//   FIREBASE_PROJECT_ID        progetto Firebase dei token dei giocatori     (wrangler.toml)
//   GAME_ORIGINS               siti da cui il gioco può chiamare /lavoro/   (wrangler.toml)
import { type CheckoutSession, applyCryoPayment } from './cryo-payment.js';
import { type KeySource, bearer, googleKeys, verifyFirebaseToken } from './firebase-auth.js';
import {
  CRYO_WRITER,
  JOB_WRITER,
  type ServiceAccount,
  accessToken,
  restDatabase,
} from './firebase-rest.js';
import { type JobDatabase, type JobReply, endJob, startJob } from './job-shift.js';
import { type OnlineReader, onlineNow } from './online.js';
import { safeHint } from './safe-hint.js';
import { verifyStripeSignature } from './stripe-signature.js';

export interface Env {
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_CRYO_PAYMENT_LINK: string;
  STRIPE_CRYO_LIFETIME_LINK?: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  FIREBASE_DATABASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  GAME_ORIGINS: string;
}

const PAID_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

/** Il token per il database: nei test si passa direttamente. */
type TokenSource = () => Promise<string>;

export async function handleWebhook(
  request: Request,
  env: Env,
  now: number,
  token: TokenSource,
): Promise<Response> {
  if (request.method !== 'POST') return new Response('Solo POST', { status: 405 });
  const payload = await request.text();
  // Solo Stripe conosce il segreto: un avviso senza firma giusta non attiva niente.
  const genuine = await verifyStripeSignature(
    payload,
    request.headers.get('stripe-signature'),
    env.STRIPE_WEBHOOK_SECRET,
    now,
  );
  if (!genuine) return new Response('Firma non valida', { status: 400 });
  const event = JSON.parse(payload) as { type?: string; data?: { object?: CheckoutSession } };
  if (event.type && PAID_EVENTS.has(event.type) && event.data?.object) {
    const session = event.data.object;
    try {
      const database = restDatabase({
        url: env.FIREBASE_DATABASE_URL,
        token: await token(),
        uid: CRYO_WRITER,
      });
      const outcome = await applyCryoPayment(
        database,
        session,
        {
          month: env.STRIPE_CRYO_PAYMENT_LINK || '',
          lifetime: env.STRIPE_CRYO_LIFETIME_LINK || '',
        },
        now,
      );
      console.log('Criogenesi', session.id, session.client_reference_id, outcome);
    } catch (error) {
      // Stripe riprova da solo nelle ore successive se la risposta non è 2xx.
      console.error('Criogenesi non registrata', session.id, String(error));
      return new Response('Errore temporaneo', { status: 500 });
    }
  }
  return Response.json({ received: true });
}

// ---------------------------------------------------------------- il lavoro

/** Le intestazioni che lasciano il browser leggere la risposta, solo dai siti del gioco. */
function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.GAME_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/**
 * Le richieste del gioco (/lavoro/inizio, /lavoro/fine, /scasso/indizio): chi chiama si
 * riconosce dal token di Firebase.
 */
export async function handleJob(
  request: Request,
  env: Env,
  now: number,
  keys: KeySource,
  database: () => Promise<JobDatabase>,
  newId: () => string = () => crypto.randomUUID(),
): Promise<Response> {
  const headers = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const reply = ({ status, body }: JobReply) => Response.json(body, { status, headers });
  if (request.method !== 'POST')
    return reply({ status: 405, body: { ok: false, error: 'metodo', message: 'Solo POST' } });
  const token = bearer(request);
  const user = token ? await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID, now, keys) : null;
  if (!user)
    return reply({
      status: 401,
      body: { ok: false, error: 'accesso', message: 'Accesso scaduto: ricarica il gioco.' },
    });
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    /* corpo vuoto o rotto: lo rifiutano i controlli */
  }
  const path = new URL(request.url).pathname;
  try {
    const db = await database();
    if (path === '/lavoro/inizio') {
      const result = await startJob(db, user.uid, body, now, newId);
      console.log('Lavoro inizio', user.uid, result.status, result.body.error ?? '');
      return reply(result);
    }
    if (path === '/lavoro/fine') {
      const result = await endJob(db, user.uid, body, now);
      // i numeri dichiarati restano nei log: servono a regolare i tetti di JOB_CLAIM_LIMITS
      console.log('Lavoro fine', user.uid, JSON.stringify(body), result.status, result.body);
      return reply(result);
    }
    if (path === '/scasso/indizio') return reply(await safeHint(db, user.uid, body, now));
  } catch (error) {
    console.error('Richiesta non riuscita', user.uid, path, String(error));
    return reply({
      status: 500,
      body: { ok: false, error: 'temporaneo', message: 'Riprova tra poco.' },
    });
  }
  return reply({ status: 404, body: { ok: false, error: 'indirizzo', message: 'Non trovato' } });
}

// ---------------------------------------------------------------- chi è online

/**
 * GET /online → { n, vivi }: quanti stanno giocando adesso e quanti personaggi sono vivi, per
 * chiunque apra il gioco (le versioni vecchie leggono solo n).
 */
export async function handleOnline(
  request: Request,
  env: Env,
  now: number,
  read: OnlineReader,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...cors(request, env),
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'public, max-age=60',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return new Response('Solo GET', { status: 405, headers });
  try {
    const { online, alive } = await onlineNow(read, now);
    return Response.json({ n: online, vivi: alive }, { headers });
  } catch (error) {
    console.error('Online non letti', String(error));
    return Response.json({ n: null, vivi: null }, { status: 503, headers });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const account = () => JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
    const token = () => accessToken(account(), Date.now());
    const path = new URL(request.url).pathname;
    if (path === '/online')
      return handleOnline(request, env, Date.now(), async (node, shallow) => {
        const url = new URL(env.FIREBASE_DATABASE_URL);
        url.pathname = '/' + node + '.json';
        if (shallow) url.searchParams.set('shallow', 'true');
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${await token()}` },
        });
        if (!response.ok) throw new Error(`Lettura di ${node} rifiutata: ${response.status}`);
        return response.json();
      });
    if (path.startsWith('/lavoro/') || path.startsWith('/scasso/')) {
      const now = Date.now();
      return handleJob(
        request,
        env,
        now,
        () => googleKeys(now),
        async () =>
          restDatabase({
            url: env.FIREBASE_DATABASE_URL,
            token: await token(),
            uid: JOB_WRITER,
            adminReads: true,
          }),
      );
    }
    return handleWebhook(request, env, Date.now(), token);
  },
};
