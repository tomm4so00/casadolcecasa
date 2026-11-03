// Crollo / boom della borsa: avviso ai giocatori online e ticker rosso o verde che scorre in alto.
// L'evento lo decide il server insieme alle quotazioni (shared/market.ts), quindi è uguale per tutti.
import { game } from './context.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { sendNotify } from './needs.js';
import { sfx } from './audio.js';
import { marketSnapshot } from './market-client.js';
import { BUSINESSES, eventAt, MARKET_EVENT_EFFECT, type MarketEvent } from '../../shared/market.js';

const SEEN_KEY = 'sims_market_event_seen';
let shownStart = 0;

function endText(e: MarketEvent): string {
  const end = new Date(e.end - (game.session.serverOffset || 0));
  return String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
}

function tickerText(e: MarketEvent): string {
  const pct = Math.round(MARKET_EVENT_EFFECT * 100);
  const boom = e.kind === 'boom';
  const head = boom ? `📈 BOOM DELLA BORSA! +${pct}%` : `📉 CROLLO DELLA BORSA! −${pct}%`;
  const advice = boom
    ? 'È il momento di vendere: i tuoi investimenti valgono di più'
    : 'Prezzi a saldo: chi compra ora guadagna quando la borsa si riprende';
  const assets = BUSINESSES.map((b) => `${b.emoji} ${b.name} ${boom ? '▲' : '▼'} ${pct}%`).join(
    '   ·   ',
  );
  return `${head}   ·   ${assets}   ·   ${advice}   ·   fino alle ${endText(e)}`;
}

/** Mostra o nasconde il ticker e, la prima volta che si vede un evento, avvisa il giocatore. */
export function updateMarketEvent(): void {
  const snap = marketSnapshot();
  const e = snap ? eventAt(snap, snap.updatedAt) : null;
  const bar = dom('market-ticker');
  if (!bar) return;
  if (!e) {
    if (shownStart) bar.classList.add('hidden');
    document.body.classList.remove('ticker-on');
    shownStart = 0;
    return;
  }
  if (shownStart !== e.start) {
    shownStart = e.start;
    bar.classList.remove('hidden');
    document.body.classList.add('ticker-on');
    bar.classList.toggle('boom', e.kind === 'boom');
    bar.classList.toggle('crash', e.kind === 'crash');
    const text = tickerText(e);
    // due copie di seguito: lo scorrimento sembra continuo
    dom('market-ticker-text').textContent = text + '      ★      ' + text + '      ★      ';
    announce(e);
  }
}

/** Avviso una volta sola per evento (anche ricaricando la pagina). */
function announce(e: MarketEvent): void {
  const key = game.session.LS_PREFIX + SEEN_KEY;
  try {
    if (localStorage.getItem(key) === String(e.start)) return;
    localStorage.setItem(key, String(e.start));
  } catch {
    /* senza localStorage si avvisa comunque */
  }
  const pct = Math.round(MARKET_EVENT_EFFECT * 100);
  const msg =
    e.kind === 'boom'
      ? `📈 Boom della borsa! Tutti gli investimenti +${pct}% fino alle ${endText(e)}.`
      : `📉 Crollo della borsa! Tutti gli investimenti −${pct}% fino alle ${endText(e)}.`;
  if (typeof document !== 'undefined' && document.hidden)
    sendNotify('Casa dolce casa', msg, 'sims-market-event');
  else toast(msg, 6000);
  sfx(e.kind === 'boom' ? 'success' : 'error');
}
