// Criogenesi nel gioco: legge il pass dell'account, si accorge quando arriva un pagamento e
// apre la pagina di Stripe dal profilo. Il pass lo scrive solo la funzione che riceve i
// pagamenti (il Worker in worker/src/index.ts): qui si legge e basta.
import {
  CRYO_DAYS,
  CRYO_PRICE,
  type CryoPass,
  cryoActive,
  decodeCryo,
} from '../../shared/cryo-rules.js';
import { game } from './context.js';
import type { GameValue } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { browser } from './runtime.js';

/**
 * Il Payment Link di Stripe per il pass di 30 giorni (Stripe → Payment Links). Vuoto finché non
 * è pronto: il pulsante del profilo dice che la criogenesi arriva presto.
 */
export const CRYO_PAYMENT_LINK = '';

let current: CryoPass | null = null;

/** Il pass come lo conosce il gioco adesso (null se non c'è o non è ancora arrivato). */
export function myCryo(): CryoPass | null {
  return current;
}

function cryoRef() {
  return game.session.db.ref('sims_cryo/' + game.session.authUid);
}

/**
 * All'avvio, prima di ricalcolare l'assenza: il pass dell'account. In modalità prova non c'è.
 * Se la rete non risponde si riprova una volta: senza il pass il tempo in capsula conterebbe.
 */
export async function loadMyCryo(): Promise<CryoPass | null> {
  if (game.session.OFFLINE || !game.session.authUid) return (current = null);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const snap = await Promise.race([
        cryoRef().get(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      return (current = decodeCryo(snap.val()));
    } catch (e) {
      console.warn('[criogenesi] lettura', e);
    }
  }
  return (current = null);
}

function dateText(ms: number): string {
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
}

/** Mentre si gioca: quando arriva un pagamento, il pass si allunga e lo diciamo subito. */
export function watchCryo(): void {
  if (game.session.OFFLINE || !game.session.authUid) return;
  cryoRef().on('value', (snap?: GameValue): GameValue => {
    const next = decodeCryo(snap?.val());
    const before = current;
    current = next;
    if (next && (!before || next.until > before.until) && cryoActive(next, Date.now()))
      toast(
        `🧊 Criogenesi attiva fino al ${dateText(next.until)}: quando esci dal gioco, il tuo personaggio si mette in pausa.`,
        7000,
      );
  });
}

/** Il pulsante "Criogenesi" del profilo. */
export async function openCryo(): Promise<void> {
  const now = Date.now();
  const active = cryoActive(current, now);
  const offline = game.session.OFFLINE;
  const ready = !!CRYO_PAYMENT_LINK && !offline;
  const res = await openDialog({
    title: '🧊 Criogenesi',
    text:
      "Non puoi entrare per un po'? Con la criogenesi il tuo personaggio va in pausa quando esci: " +
      'fame, sonno, igiene, felicità e salute non calano, i tuoi animali non hanno fame e il ' +
      'conto alla rovescia dei 3 giorni si ferma. Quando entri, giochi normalmente.' +
      `\n\n${CRYO_DAYS} giorni a ${CRYO_PRICE}: se ricompri prima della scadenza, i giorni si sommano.` +
      (active ? `\n\n✅ Attiva fino al ${dateText(current!.until)}.` : '') +
      (offline
        ? '\n\n🧪 In modalità prova la criogenesi non si può comprare.'
        : !CRYO_PAYMENT_LINK
          ? '\n\n⏳ Arriva presto!'
          : '\n\nIl pagamento avviene sulla pagina sicura di Stripe; la capsula si attiva da sola appena il pagamento è confermato. ' +
            "Prima di pagare ti chiediamo di accettare le condizioni: l'attivazione è immediata e per questo non c'è il recesso di 14 giorni. " +
            'Se hai meno di 18 anni chiedi prima a un genitore.'),
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      { label: '📄 Condizioni', value: 'terms', color: '#636e72' },
      ...(ready
        ? [
            {
              label: active ? `🧊 Aggiungi ${CRYO_DAYS} giorni` : '🧊 Attiva criogenesi',
              value: 'buy',
              color: '#00a8ff',
            },
          ]
        : []),
    ],
  });
  if (res.action === 'terms') {
    browser.open('./condizioni.html', '_blank');
    return;
  }
  if (res.action !== 'buy' || !ready || !game.session.authUid) return;
  // Stripe ci rimanda l'account nel pagamento (client_reference_id): così sa chi ha pagato.
  const url = new URL(CRYO_PAYMENT_LINK);
  url.searchParams.set('client_reference_id', game.session.authUid);
  url.searchParams.set('locale', 'it');
  browser.open(url.toString(), '_blank');
  toast('🧊 Completa il pagamento nella pagina di Stripe: la capsula si attiva da sola.', 6000);
}
