// Worker di Cloudflare che riceve da Stripe la conferma dei pagamenti della criogenesi e
// allunga il pass dell'account nel database di Firebase. Configurazione in docs/criogenesi.md:
//   STRIPE_WEBHOOK_SECRET      segreto "whsec_…" del webhook               (wrangler secret put)
//   FIREBASE_SERVICE_ACCOUNT   chiave JSON di un account di servizio        (wrangler secret put)
//   STRIPE_CRYO_PAYMENT_LINK   id "plink_…" del Payment Link dei 30 giorni      (wrangler.toml)
//   STRIPE_CRYO_LIFETIME_LINK  id "plink_…" del Payment Link del pass a vita    (wrangler.toml)
//   FIREBASE_DATABASE_URL      indirizzo del database                        (wrangler.toml)
import { type CheckoutSession, applyCryoPayment } from './cryo-payment.js';
import { CRYO_WRITER, type ServiceAccount, accessToken, restDatabase } from './firebase-rest.js';
import { verifyStripeSignature } from './stripe-signature.js';

export interface Env {
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_CRYO_PAYMENT_LINK: string;
  STRIPE_CRYO_LIFETIME_LINK?: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  FIREBASE_DATABASE_URL: string;
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

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const account = () => JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount;
    return handleWebhook(request, env, Date.now(), () => accessToken(account(), Date.now()));
  },
};
