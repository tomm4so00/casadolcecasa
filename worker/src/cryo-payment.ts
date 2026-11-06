// Un pagamento confermato da Stripe diventa un pass di criogenesi. Niente Stripe qui dentro:
// la firma del webhook la controlla index.ts, questo file si prova con un database finto.
// Il database è quello REST del Worker (firebase-rest.ts) o, nei test, quello del gioco.
import { decodeCryo, extendCryo } from '../../shared/cryo-rules.js';

/** I campi della sessione di Stripe Checkout che servono qui. */
export interface CheckoutSession {
  id: string;
  client_reference_id?: string | null;
  payment_status?: string | null;
  payment_link?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  livemode?: boolean;
}

interface Snapshot {
  val(): unknown;
}
interface Reference {
  get(): Promise<Snapshot>;
  transaction(
    update: (value: unknown) => unknown,
  ): Promise<{ committed: boolean; snapshot: Snapshot }>;
  on?(event: 'value', callback: (snapshot: Snapshot) => void): unknown;
  off?(event: 'value', callback?: (snapshot: Snapshot) => void): void;
}
export interface CryoDatabase {
  ref(path: string): Reference;
}

export type CryoOutcome =
  | 'attivata'
  | 'già registrato'
  | 'altro prodotto'
  | 'non ancora pagato'
  | 'account mancante';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

/**
 * Registra il pagamento e allunga il pass dell'account, nella stessa transazione: se Stripe
 * manda due volte lo stesso avviso (succede), la seconda trova la ricevuta e non aggiunge giorni.
 */
export async function applyCryoPayment(
  database: CryoDatabase,
  session: CheckoutSession,
  paymentLinkId: string,
  now: number,
): Promise<CryoOutcome> {
  // Lo stesso account Stripe potrebbe vendere altro: vale solo il link della criogenesi.
  const link =
    typeof session.payment_link === 'string' ? session.payment_link : session.payment_link?.id;
  if (!paymentLinkId || link !== paymentLinkId) return 'altro prodotto';
  // Bonifico o altri pagamenti lenti: arriverà checkout.session.async_payment_succeeded.
  if (session.payment_status !== 'paid') return 'non ancora pagato';
  const uid = session.client_reference_id;
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return 'account mancante';

  const reference = database.ref('sims_cryo/' + uid);
  // Con l'SDK di Firebase si resta in ascolto: senza, la transazione parte la prima volta da null e
  // un pass già esistente verrebbe riscritto da zero (vedi liveTransaction in
  // server/src/maintenance.ts). Il database REST del Worker legge sempre il valore vero.
  const keep = () => {};
  reference.on?.('value', keep);
  let duplicate = false;
  try {
    await reference.get();
    const result = await reference.transaction((current) => {
      const payments = record(current) && record(current.payments) ? current.payments : {};
      duplicate = session.id in payments;
      if (duplicate) return undefined;
      const pass = extendCryo(decodeCryo(current), now);
      return {
        ...pass,
        payments: {
          ...payments,
          [session.id]: {
            at: now,
            amount: session.amount_total ?? 0,
            currency: session.currency ?? '',
            live: session.livemode === true,
          },
        },
      };
    });
    if (duplicate || !result.committed) return 'già registrato';
    return 'attivata';
  } finally {
    reference.off?.('value', keep);
  }
}
