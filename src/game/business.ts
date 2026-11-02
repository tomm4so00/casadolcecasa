import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { hasRoom, saveGame } from './saves.js';
export function hash01(a?: GameValue, b?: GameValue): GameValue {
  let h: GameValue = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function mktLog(b?: GameValue, k?: GameValue): GameValue {
  const m: GameValue = game.mktCache[b.id] || (game.mktCache[b.id] = { x: [0], n: 0 });
  k = Math.max(0, k);
  while (m.n < k) {
    m.n++;
    m.x.push(m.x[m.n - 1] * (1 - b.theta) + b.sigma * game.mktZ(b.seed, m.n));
  }
  return m.x[k] + (k * Math.log(1 + b.daily)) / 1440;
}

export function mktPrice(b?: GameValue, t: GameValue = Date.now()): GameValue {
  const s: GameValue = Math.max(0, (t - game.MKT_EPOCH) / 60000),
    k: GameValue = Math.floor(s),
    f: GameValue = s - k;
  const a: GameValue = mktLog(b, k),
    c: GameValue = mktLog(b, k + 1);
  return Math.exp(a + (c - a) * f) * 100;
}

export function bizSpark(cv?: GameValue, b?: GameValue): GameValue {
  const W: GameValue = cv.width,
    H: GameValue = cv.height,
    ctx2: GameValue = cv.getContext('2d'),
    now: GameValue = Date.now(),
    N: GameValue = 96,
    pts: GameValue = [];
  for (let i: GameValue = 0; i <= N; i++) pts.push(mktPrice(b, now - (N - i) * 15 * 60000));
  const mn: GameValue = Math.min(...pts),
    mx: GameValue = Math.max(...pts),
    up: GameValue = pts[N] >= pts[0];
  ctx2.clearRect(0, 0, W, H);
  ctx2.strokeStyle = up ? '#2ed573' : '#ff4757';
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  pts.forEach((p?: GameValue, i?: GameValue): GameValue => {
    const x: GameValue = (i / N) * (W - 4) + 2,
      y: GameValue = H - 4 - ((p - mn) / (mx - mn || 1)) * (H - 8);
    i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y);
  });
  ctx2.stroke();
}

export function bizBuild(..._args: GameValue[]): GameValue {
  const box: GameValue = dom('biz-list');
  box.innerHTML = '';
  game.BIZ.forEach((b?: GameValue): GameValue => {
    const c: GameValue = document.createElement('div');
    c.style.cssText =
      'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-left:4px solid ' +
      b.color +
      ';border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;';
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><b>${b.emoji} ${b.name}</b><span style="font-size:0.7rem;color:#aaa;">${b.risk}</span></div>
          <div style="font-size:0.75rem;color:#aaa;">${b.desc}</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;"><span>Quotazione: <b id="biz-p-${b.id}"></b></span><span id="biz-d-${b.id}" style="font-weight:bold;"></span></div>
          <canvas id="biz-c-${b.id}" width="320" height="56" style="width:100%;height:56px;background:rgba(0,0,0,0.25);border-radius:6px;"></canvas>
          <div id="biz-m-${b.id}" style="font-size:0.8rem;"></div>
          <div style="display:flex;gap:8px;"><button type="button" class="btn-buy" style="background:#2ed573;flex:1;" onclick="bizInvest('${b.id}')">💶 Investi</button><button type="button" class="btn-buy" id="biz-w-${b.id}" style="background:#e74c3c;flex:1;" onclick="bizWithdraw('${b.id}')">💰 Ritira</button></div>`;
    box.appendChild(c);
  });
  game.bizBuilt = true;
}

export function bizUpdate(..._args: GameValue[]): GameValue {
  const now: GameValue = Date.now();
  let tot: GameValue = 0,
    cost: GameValue = 0;
  game.BIZ.forEach((b?: GameValue): GameValue => {
    const p: GameValue = mktPrice(b),
      p24: GameValue = mktPrice(b, now - 24 * 3600000),
      v: GameValue = game.invest[b.id],
      val: GameValue = v ? v.units * p : 0;
    tot += val;
    cost += v ? v.cost : 0;
    dom('biz-p-' + b.id).textContent = p.toFixed(2).replace('.', ',');
    const d: GameValue = dom('biz-d-' + b.id),
      ch: GameValue = (p / p24 - 1) * 100;
    d.textContent = game.fmtPct(ch) + ' (24 h)';
    d.style.color = ch >= 0 ? '#2ed573' : '#ff4757';
    const m: GameValue = dom('biz-m-' + b.id);
    if (v) {
      const pl: GameValue = val - v.cost;
      m.innerHTML = `Il tuo investimento: <b>${game.fmtEur(val)}</b> <span style="color:${pl >= 0 ? '#2ed573' : '#ff4757'}">(${pl >= 0 ? '+' : ''}${game.fmtEur(pl)} · ${game.fmtPct(v.cost ? (pl / v.cost) * 100 : 0)})</span>`;
    } else m.innerHTML = '<span style="color:#888;">Non hai investito in questo business.</span>';
    dom('biz-w-' + b.id).style.opacity = v ? '1' : '0.4';
    bizSpark(dom('biz-c-' + b.id), b);
  });
  const pl: GameValue = tot - cost;
  dom('biz-sum').innerHTML =
    `Cassaforte: <b>${game.moneyLevel} €</b> · Investito ora: <b>${game.fmtEur(tot)}</b> <span style="color:${pl >= 0 ? '#2ed573' : '#ff4757'}">(${pl >= 0 ? '+' : ''}${game.fmtEur(pl)})</span>`;
}

export function openBizSite(..._args: GameValue[]): GameValue {
  if (!game.bizBuilt) bizBuild();
  dom('biz-modal').classList.remove('hidden');
  bizUpdate();
}

export async function bizInvest(id?: GameValue): Promise<GameValue> {
  const b: GameValue = game.bizById(id);
  const res: GameValue = await openDialog({
    title: `${b.emoji} Investi in ${b.name}`,
    text: `Disponibili in cassaforte: ${game.moneyLevel} €\n${b.risk}. Il valore sale e scende nel tempo: puoi anche perdere soldi.`,
    input: { placeholder: 'Importo in €', numeric: true, maxLength: 6 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Investi', value: 'ok', color: '#27ae60' },
    ],
  });
  if (res.action !== 'ok') return;
  const amt: GameValue = Math.floor(Number(res.value));
  if (!(amt >= 1)) {
    toast('❌ Importo non valido.');
    return;
  }
  if (amt > game.moneyLevel) {
    toast('❌ Non hai abbastanza soldi in cassaforte.');
    return;
  }
  game.moneyLevel -= amt;
  const v: GameValue = game.invest[id] || (game.invest[id] = { units: 0, cost: 0 });
  v.units += amt / mktPrice(b);
  v.cost += amt;
  toast(`✅ Hai investito ${amt} € in ${b.name}`);
  saveGame(true);
  bizUpdate();
}

export async function bizWithdraw(id?: GameValue): Promise<GameValue> {
  const b: GameValue = game.bizById(id),
    v: GameValue = game.invest[id],
    val: GameValue = game.bizValue(id);
  if (!v || val < 1) {
    toast('Non hai niente da ritirare qui.');
    return;
  }
  if (!hasRoom()) {
    toast('🏠 Senza una stanza non hai una cassaforte dove versare i soldi.', 4000);
    return;
  }
  const res: GameValue = await openDialog({
    title: `${b.emoji} Ritira da ${b.name}`,
    text: `Valore attuale: ${game.fmtEur(val)}`,
    input: { placeholder: 'Importo in €', numeric: true, maxLength: 7 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Ritira tutto', value: 'all', color: '#e67e22' },
      { label: 'Ritira', value: 'ok', color: '#27ae60' },
    ],
  });
  if (res.action !== 'ok' && res.action !== 'all') return;
  const now: GameValue = game.bizValue(id); // il prezzo può essere cambiato mentre decidevi
  let amt: GameValue = res.action === 'all' ? Math.floor(now) : Math.floor(Number(res.value));
  if (!(amt >= 1)) {
    toast('❌ Importo non valido.');
    return;
  }
  amt = Math.min(amt, Math.floor(now));
  const f: GameValue = amt / now;
  v.units *= 1 - f;
  v.cost *= 1 - f;
  if (v.units * mktPrice(b) < 1) delete game.invest[id];
  game.moneyLevel += amt;
  toast(`💰 Hai ritirato ${amt} € da ${b.name}`);
  saveGame(true);
  bizUpdate();
}
