import { countUse } from './usage.js';
import { notePersonality } from './personality.js';
import { postGossip } from './gossip.js';
import { TRADE_FEE, marketPriceAt, type Business, type BusinessId } from '../../shared/market.js';
import { marketSnapshot, canTradeMarket } from './market-client.js';
import { updateEconomy } from './economy.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { hasRoom, saveGame } from './saves.js';
export function mktPrice(b: Business, at?: number): number {
  const snapshot = marketSnapshot();
  return snapshot && b ? marketPriceAt(snapshot, b.id, at ?? snapshot.updatedAt) : 0;
}

/** Il grafico delle ultime 24 ore (un punto ogni quarto d'ora) nel riquadro dell'attività. */
export function bizSpark(cv: HTMLCanvasElement, b: Business): void {
  const W = cv.width,
    H = cv.height,
    ctx2 = cv.getContext('2d'),
    now = marketSnapshot()?.updatedAt ?? Date.now(),
    N = 96,
    pts: number[] = [];
  if (!ctx2) return;
  for (let i = 0; i <= N; i++) pts.push(mktPrice(b, now - (N - i) * 15 * 60000));
  const mn = Math.min(...pts),
    mx = Math.max(...pts),
    up = pts[N] >= pts[0];
  ctx2.clearRect(0, 0, W, H);
  ctx2.strokeStyle = up ? '#2ed573' : '#ff4757';
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  pts.forEach((p, i) => {
    const x = (i / N) * (W - 4) + 2,
      y = H - 4 - ((p - mn) / (mx - mn || 1)) * (H - 8);
    if (i) ctx2.lineTo(x, y);
    else ctx2.moveTo(x, y);
  });
  ctx2.stroke();
}

export function bizBuild(): void {
  const box = dom('biz-list');
  box.innerHTML = '';
  game.BIZ.forEach((b) => {
    const c = document.createElement('div');
    c.style.cssText =
      'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-left:4px solid ' +
      b.color +
      ';border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;';
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><b>${b.emoji} ${b.name}</b><span style="font-size:0.7rem;color:#aaa;">${b.risk}</span></div>
          <div style="font-size:0.75rem;color:#aaa;">${b.desc}</div>
          <div style="font-size:0.75rem;color:#ccc;">🎯 Si muove con: ${b.driver}</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;"><span>Quotazione: <b id="biz-p-${b.id}"></b></span><span id="biz-d-${b.id}" style="font-weight:bold;"></span></div>
          <canvas id="biz-c-${b.id}" width="320" height="56" style="width:100%;height:56px;background:rgba(0,0,0,0.25);border-radius:6px;"></canvas>
          <div id="biz-x-${b.id}" style="font-size:0.75rem;color:#aaa;"></div>
          <div id="biz-m-${b.id}" style="font-size:0.8rem;"></div>
          <div style="display:flex;gap:8px;"><button type="button" class="btn-buy" style="background:#2ed573;flex:1;" data-action="bizInvest" data-arg="${b.id}">🪙 Investi</button><button type="button" class="btn-buy" id="biz-w-${b.id}" style="background:#e74c3c;flex:1;" data-action="bizWithdraw" data-arg="${b.id}">💰 Ritira</button></div>`;
    box.appendChild(c);
  });
  game.bizBuilt = true;
}

export function bizUpdate(): void {
  const snapshot = marketSnapshot();
  const ready = canTradeMarket();
  const status = dom('market-status');
  if (status)
    status.textContent = snapshot
      ? `${game.session.OFFLINE ? 'Simulazione locale' : 'Mercato condiviso'} · aggiornato alle ${new Date(snapshot.updatedAt).toLocaleTimeString('it-IT')}${ready ? '' : ' · negoziazioni sospese'}`
      : 'In attesa delle quotazioni del mercato…';
  for (const button of document.querySelectorAll<HTMLButtonElement>('#biz-list button'))
    button.disabled = !ready;
  if (!snapshot) return;
  const now = snapshot.updatedAt;
  let tot = 0,
    cost = 0;
  game.BIZ.forEach((b) => {
    const p = mktPrice(b),
      p24 = mktPrice(b, now - 24 * 3600000) || p,
      v = game.player.invest[b.id],
      val = v ? v.units * p : 0;
    tot += val;
    cost += v ? v.cost : 0;
    // attività nuova: il server la quota al prossimo aggiornamento
    const listed = p > 0;
    for (const btn of document.querySelectorAll<HTMLButtonElement>(
      `#biz-list [data-arg="${b.id}"]`,
    ))
      btn.disabled = !ready || !listed;
    dom('biz-x-' + b.id).innerHTML =
      crowdText(snapshot.quotes[b.id as BusinessId], p) +
      '<br>' +
      activityText(snapshot.quotes[b.id as BusinessId]?.act);
    if (!listed) {
      dom('biz-p-' + b.id).textContent = 'in arrivo…';
      dom('biz-d-' + b.id).textContent = '';
      dom('biz-m-' + b.id).innerHTML =
        '<span style="color:#888;">Nuova attività: sarà quotata al prossimo aggiornamento del mercato.</span>';
      return;
    }
    dom('biz-p-' + b.id).textContent = p.toFixed(2).replace('.', ',');
    const d = dom('biz-d-' + b.id),
      ch = (p / p24 - 1) * 100;
    d.textContent = game.fmtPct(ch) + ' (24 h)';
    d.style.color = ch >= 0 ? '#2ed573' : '#ff4757';
    const m = dom('biz-m-' + b.id);
    if (v) {
      const pl = val - v.cost;
      m.innerHTML = `Il tuo investimento: <b>${game.fmtEur(val)}</b> <span style="color:${pl >= 0 ? '#2ed573' : '#ff4757'}">(${pl >= 0 ? '+' : ''}${game.fmtEur(pl)} · ${game.fmtPct(v.cost ? (pl / v.cost) * 100 : 0)})</span>`;
    } else m.innerHTML = '<span style="color:#888;">Non hai investito in questo business.</span>';
    dom('biz-w-' + b.id).style.opacity = v ? '1' : '0.4';
    bizSpark(dom('biz-c-' + b.id), b);
  });
  const pl = tot - cost;
  dom('biz-sum').innerHTML =
    `Cassaforte: <b>${game.moneyLevel} Đ</b> · Investito ora: <b>${game.fmtEur(tot)}</b> <span style="color:${pl >= 0 ? '#2ed573' : '#ff4757'}">(${pl >= 0 ? '+' : ''}${game.fmtEur(pl)})</span>`;
}

/** Quanto spinge la quotazione l'attività dei giocatori nel gioco (shared/activity.ts). */
function activityText(act: number | undefined): string {
  if (act === undefined) return '🎮 Spinta dal gioco: in arrivo…';
  const pct = Math.round((Math.exp(act) - 1) * 1000) / 10;
  if (Math.abs(pct) < 0.5) return '🎮 Spinta dal gioco: <span>= nella norma</span>';
  return pct > 0
    ? `🎮 Spinta dal gioco: <span style="color:#2ed573">▲ più attività del solito (+${pct.toLocaleString('it-IT')}%)</span>`
    : `🎮 Spinta dal gioco: <span style="color:#ff4757">▼ meno attività del solito (${pct.toLocaleString('it-IT')}%)</span>`;
}

/** Cosa fanno tutti i giocatori: quanto hanno investito e se nell'ultimo quarto d'ora comprano o vendono. */
function crowdText(
  q: { held?: number; holders?: number; flow?: number } | undefined,
  price: number,
): string {
  if (!q || q.held === undefined || !(price > 0)) return '👥 Domanda dei giocatori: in arrivo…';
  const total = Math.round(q.held * price);
  const flow = q.flow || 0;
  const trend =
    flow > 0
      ? `<span style="color:#2ed573">▲ si compra (+${flow.toLocaleString('it-IT')} Đ)</span>`
      : flow < 0
        ? `<span style="color:#ff4757">▼ si vende (${flow.toLocaleString('it-IT')} Đ)</span>`
        : '<span>= stabile</span>';
  return `👥 Investiti da tutti: <b>${total.toLocaleString('it-IT')} Đ</b> (${q.holders || 0} ${q.holders === 1 ? 'giocatore' : 'giocatori'}) · ${trend}`;
}

export function openBizSite(): void {
  if (!game.bizBuilt) bizBuild();
  dom('biz-modal').classList.remove('hidden');
  bizUpdate();
}

export async function bizInvest(id: BusinessId): Promise<void> {
  countUse('borsa');
  if (!canTradeMarket()) {
    toast('Mercato non disponibile: attendi quotazioni aggiornate.');
    return;
  }
  const b: Business | undefined = game.bizById(id);
  if (!b) return;
  const res = await openDialog({
    title: `${b.emoji} Investi in ${b.name}`,
    text: `Disponibili in cassaforte: ${game.moneyLevel} Đ\n${b.risk}. Il valore sale e scende nel tempo: puoi anche perdere soldi.\nCommissione: ${Math.round(TRADE_FEE * 100)}%. Quando tanti giocatori comprano il prezzo sale, quando vendono scende.`,
    input: { placeholder: 'Importo in Đ', numeric: true, maxLength: 6 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Investi', value: 'ok', color: '#27ae60' },
    ],
  });
  if (res.action !== 'ok') return;
  const amt = Math.floor(Number(res.value));
  if (!(amt >= 1)) {
    toast('❌ Importo non valido.');
    return;
  }
  if (amt > game.moneyLevel) {
    toast('❌ Non hai abbastanza soldi in cassaforte.');
    return;
  }
  if (!canTradeMarket()) {
    toast('Quotazione scaduta: riprova quando il mercato è aggiornato.');
    return;
  }
  if (
    !(await updateEconomy((economy, balance) => {
      if (!canTradeMarket() || balance < amt) return null;
      const price = mktPrice(b);
      const investment = (economy.invest[id] ??= { units: 0, cost: 0 });
      if (!(price > 0)) return null;
      // la commissione resta al mercato: si comprano quote per l'importo meno l'1%
      investment.units += (amt * (1 - TRADE_FEE)) / price;
      investment.cost += amt;
      return -amt;
    }))
  )
    return;
  toast(`✅ Hai investito ${amt} Đ in ${b.name}`);
  if (amt >= 1000)
    postGossip(
      `${game.player.myData.nick} ha investito ${amt.toLocaleString('it-IT')} Đ in ${b.name} 📈 Chissà cosa sa…`,
    );
  notePersonality('invest');
  saveGame(true);
  bizUpdate();
}

export async function bizWithdraw(id: BusinessId): Promise<void> {
  if (!canTradeMarket()) {
    toast('Mercato non disponibile: attendi quotazioni aggiornate.');
    return;
  }
  const b = game.bizById(id);
  if (!b) return;
  const v = game.player.invest[id],
    val = game.bizValue(id);
  if (!v || val < 1) {
    toast('Non hai niente da ritirare qui.');
    return;
  }
  if (!hasRoom()) {
    toast('🏠 Senza una stanza non hai una cassaforte dove versare i soldi.', 4000);
    return;
  }
  const res = await openDialog({
    title: `${b.emoji} Ritira da ${b.name}`,
    text: `Valore attuale: ${game.fmtEur(val)}\nSu quello che ritiri c'è una commissione dell'${Math.round(TRADE_FEE * 100)}%.`,
    input: { placeholder: 'Importo in Đ', numeric: true, maxLength: 7 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Ritira tutto', value: 'all', color: '#e67e22' },
      { label: 'Ritira', value: 'ok', color: '#27ae60' },
    ],
  });
  if (res.action !== 'ok' && res.action !== 'all') return;
  if (!canTradeMarket()) {
    toast('Quotazione scaduta: riprova quando il mercato è aggiornato.');
    return;
  }
  const requested = Math.floor(Number(res.value));
  if (res.action !== 'all' && !(requested >= 1)) {
    toast('Importo non valido.');
    return;
  }
  let amount = 0;
  if (
    !(await updateEconomy((economy) => {
      const investment = economy.invest[id];
      if (!canTradeMarket() || !investment) return null;
      const price = mktPrice(b);
      const value = investment.units * price;
      const gross =
        res.action === 'all' ? Math.floor(value) : Math.min(requested, Math.floor(value));
      if (gross < 1) return null;
      const fraction = res.action === 'all' ? 1 : gross / value;
      investment.units *= 1 - fraction;
      investment.cost *= 1 - fraction;
      if (res.action === 'all' || investment.units * price < 1) delete economy.invest[id];
      // in cassaforte arriva quanto si vende meno la commissione
      amount = Math.floor(gross * (1 - TRADE_FEE));
      return amount;
    }))
  )
    return;
  const amt = amount;
  toast(`💰 Hai ritirato ${amt} Đ da ${b.name}`);
  saveGame(true);
  bizUpdate();
}
