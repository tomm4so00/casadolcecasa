// Roulette della sala scommesse: un unico tavolo per condominio, a giri continui uguali per
// tutti (vedi roulette-rules.ts). Si gioca da soli o insieme agli altri che sono al tavolo: le
// puntate di tutti si vedono, il numero è lo stesso per tutti. Nel database (nodo del mondo
// "roulette"): bets/<giro>/<giocatore>, results/<giro> (il numero), paid/<giro>/<giocatore>.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import { worldNode } from './world-db.js';
import { recordActivity } from './activity.js';
import {
  BET_LABEL,
  BET_MS,
  type Bets,
  CHIPS,
  MAX_ROUND_BET,
  ROUND_MS,
  SPIN_MS,
  WHEEL,
  addChip,
  betLabel,
  closesAt,
  colorOf,
  decodeBets,
  isResult,
  payout,
  phaseAt,
  spinAngles,
  totalOf,
} from './roulette-rules.js';

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
const node = (path: string): GameValue => game.session.db.ref(worldNode('roulette') + '/' + path);
const me = (): string => game.session.myPlayerId;

// ---------------------------------------------------------------- stato condiviso

/** Puntate del giro in corso, di tutti: giocatore → { nick, bets }. */
let table: Record<string, { nick: string; bets: Bets }> = {};
let tableRound = -1;
let stopBets: (() => void) | null = null;
/** Ultimi numeri usciti: giro → numero. */
const results = new Map<number, number>();
let stopResults: (() => void) | null = null;
/** Le puntate dell'ultimo giro in cui ho giocato (per "Ripeti"). */
let lastBets: Bets = {};
let chip: number = CHIPS[1];
let ticker: ReturnType<typeof setInterval> | null = null;
let frame = 0;
/** Giri già fatti girare da me (il numero si estrae una volta sola). */
const drawn = new Set<number>();

const PENDING_KEY = 'sims_roulette_pending';
/** Giri in cui ho puntato e non ho ancora incassato (sopravvivono alla chiusura del gioco). */
function pending(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(game.session.LS_PREFIX + PENDING_KEY) || '[]');
    return Array.isArray(v) ? v.filter((r) => Number.isInteger(r)).slice(-50) : [];
  } catch {
    return [];
  }
}
function setPending(list: number[]): void {
  try {
    localStorage.setItem(game.session.LS_PREFIX + PENDING_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* senza memoria del browser si incassa solo restando al tavolo */
  }
}

/** Le mie puntate nel giro in corso. */
const myBets = (): Bets => table[me()]?.bets || {};

/** Per il disegno del tavolo nella sala: giro, fase, numero e fiches sul panno. */
export function rouletteView(): {
  round: number;
  phase: string;
  since: number;
  n: number | null;
  chips: { key: string; amount: number; mine: boolean }[];
} {
  const p = phaseAt(serverNow());
  const chips: { key: string; amount: number; mine: boolean }[] = [];
  if (tableRound === p.round)
    for (const [pid, entry] of Object.entries(table))
      for (const [key, amount] of Object.entries(entry.bets))
        chips.push({ key, amount, mine: pid === me() });
  return { round: p.round, phase: p.phase, since: p.since, n: results.get(p.round) ?? null, chips };
}

/** Segue le puntate di un giro (cambia a ogni giro). */
function followRound(round: number): void {
  if (tableRound === round) return;
  stopBets?.();
  table = {};
  tableRound = round;
  const ref = node('bets/' + round);
  const onValue = (snap: GameValue): void => {
    const v = snap?.val() || {};
    const next: typeof table = {};
    for (const [pid, e] of Object.entries(v as Record<string, GameValue>))
      if (e && typeof e === 'object')
        next[pid] = { nick: String(e.nick || 'Giocatore').slice(0, 20), bets: decodeBets(e.bets) };
    table = next;
    render();
  };
  ref.on('value', onValue);
  stopBets = () => ref.off?.('value', onValue);
}

function followResults(): void {
  if (stopResults) return;
  const ref = node('results').orderByChild('r').limitToLast(12);
  const onValue = (snap: GameValue): void => {
    const v = snap?.val() || {};
    for (const e of Object.values(v as Record<string, GameValue>))
      if (e && Number.isInteger(e.r) && isResult(e.n)) results.set(e.r, e.n);
    render();
  };
  ref.on('value', onValue);
  stopResults = () => ref.off?.('value', onValue);
}

/** A puntate chiuse il primo al tavolo estrae il numero (una volta: le regole lo vietano dopo). */
async function drawResult(round: number): Promise<void> {
  if (drawn.has(round) || results.has(round) || serverNow() < closesAt(round)) return;
  drawn.add(round);
  const n = Math.floor(Math.random() * 37);
  try {
    const res = await node('results/' + round).transaction((cur: GameValue) =>
      cur ? undefined : { r: round, n },
    );
    const v = res?.snapshot?.val();
    if (v && isResult(v.n)) results.set(round, v.n);
    // pulizia: il numero di un'ora e mezza fa non serve più (dopo, nessuno lo può pagare)
    if (res?.committed)
      void node('results/' + (round - Math.round(5_400_000 / ROUND_MS)))
        .remove()
        .catch(() => {});
  } catch (e) {
    console.warn('[roulette] numero', e);
    drawn.delete(round);
  }
}

/** Incassa le vincite dei giri finiti in cui ho puntato (anche quelli di una visita passata). */
let settling = false;
async function settle(): Promise<void> {
  if (settling) return;
  settling = true;
  try {
    const now = serverNow();
    const list = pending();
    const keep: number[] = [];
    for (const round of list) {
      // il numero si mostra a fine animazione: si paga da lì in poi
      if (now < closesAt(round) + SPIN_MS) {
        keep.push(round);
        continue;
      }
      if (!results.has(round)) {
        const snap: GameValue = await node('results/' + round).get();
        const v = snap?.val();
        if (v && isResult(v.n)) results.set(round, v.n);
        else await drawResult(round);
      }
      const n = results.get(round);
      if (n === undefined) {
        keep.push(round);
        continue;
      }
      const mine: GameValue = (await node(`bets/${round}/${me()}`).get())?.val();
      const bets = decodeBets(mine?.bets);
      const won = payout(bets, n);
      if (totalOf(bets) > 0) {
        try {
          // prima si segna, poi si paga: se due schede ci provano insieme, paga una sola
          await node(`paid/${round}/${me()}`).set(true);
        } catch {
          continue; // già incassato
        }
        if (won > 0 && !(await creditMoney(won))) {
          keep.push(round);
          continue;
        }
        announce(n, bets, won);
      }
      // via le mie puntate del giro: non servono più
      void node(`bets/${round}/${me()}`)
        .remove()
        .catch(() => {});
    }
    setPending(keep);
  } finally {
    settling = false;
  }
}

function announce(n: number, bets: Bets, won: number): void {
  const spent = totalOf(bets);
  const color = colorOf(n);
  const name = `${n} ${color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢'}`;
  if (won > 0) {
    sfx('success');
    toast(`🎡 È uscito ${name}: hai vinto ${won} €! (puntati ${spent} €)`, 5000);
  } else {
    sfx('error');
    toast(`🎡 È uscito ${name}: hai perso ${spent} €.`, 4000);
  }
}

/** Ogni quarto di secondo: giro nuovo, estrazione, incassi, disegno. */
function tick(): void {
  const p = phaseAt(serverNow());
  followRound(p.round);
  if (p.phase !== 'bet' && (open || game.view.activeEnvironment === 'scommesse'))
    void drawResult(p.round);
  if (p.phase === 'show' || pending().some((r) => r < p.round)) void settle();
  render();
}

/** Il tavolo si segue mentre si è nella sala (per la ruota nella stanza) o al tavolo. */
export function watchRoulette(): void {
  if (game.session.OFFLINE) return;
  followResults();
  if (!ticker) ticker = lifetime.setInterval(tick, 250);
  tick();
}

// ---------------------------------------------------------------- puntate

async function placeChip(key: string): Promise<void> {
  const p = phaseAt(serverNow());
  if (p.phase !== 'bet') {
    toast('🎡 Rien ne va plus: aspetta il prossimo giro.', 2500);
    return;
  }
  const res = addChip(myBets(), key, chip, game.moneyLevel);
  if ('error' in res) {
    toast('❌ ' + res.error, 3000);
    return;
  }
  if (!(await spendMoney(chip))) return;
  const amount = chip;
  let ok = false;
  let saved: Bets = {};
  try {
    const r = await node(`bets/${p.round}/${me()}`).transaction((cur: GameValue) => {
      const bets = decodeBets(cur?.bets);
      bets[key] = (bets[key] || 0) + amount;
      if (totalOf(bets) > MAX_ROUND_BET) return undefined;
      return {
        r: p.round,
        nick: String(game.player.myData.nick || 'Giocatore').slice(0, 20),
        bets,
      };
    });
    ok = !!r?.committed;
    saved = decodeBets(r?.snapshot?.val()?.bets);
  } catch (e) {
    console.warn('[roulette] puntata', e);
  }
  if (!ok) {
    // puntate già chiuse o il database non risponde: i soldi tornano
    await creditMoney(amount);
    toast('🎡 Puntata non accettata: le puntate si sono chiuse.', 3000);
    return;
  }
  sfx('coin');
  const list = pending();
  if (!list.includes(p.round)) setPending([...list, p.round]);
  // per "Ripeti": le puntate di questo giro come le ha salvate il database
  lastBets = saved;
  recordActivity('crypto'); // le scommesse muovono la crypto in borsa, come le slot
}

/** Ritira tutte le mie puntate del giro (finché sono aperte): i soldi tornano in cassaforte. */
async function withdraw(): Promise<void> {
  const p = phaseAt(serverNow());
  const total = totalOf(myBets());
  if (p.phase !== 'bet' || !total) return;
  try {
    await node(`bets/${p.round}/${me()}`).remove();
  } catch {
    toast('Non sono riuscito a ritirare le puntate.', 3000);
    return;
  }
  setPending(pending().filter((r) => r !== p.round));
  await creditMoney(total);
  toast(`↩️ Puntate ritirate: ${total} € di nuovo in cassaforte.`, 3000);
}

/** Rifà le puntate dell'ultimo giro giocato. */
async function repeat(): Promise<void> {
  const prev = { ...lastBets };
  if (!totalOf(prev)) {
    toast('Non hai ancora puntato in un giro precedente.', 2500);
    return;
  }
  const saved = chip;
  for (const [key, amount] of Object.entries(prev)) {
    let left = amount;
    for (const c of [...CHIPS].reverse())
      while (left >= c) {
        chip = c;
        await placeChip(key);
        left -= c;
      }
  }
  chip = saved;
  render();
}

// ---------------------------------------------------------------- finestra del tavolo

let open = false;
let modal: HTMLElement | null = null;
let html = '';

const RED_BG = '#c0392b';
const BLACK_BG = '#1e272e';
const GREEN_BG = '#16a085';
const bg = (n: number) =>
  colorOf(n) === 'red' ? RED_BG : colorOf(n) === 'black' ? BLACK_BG : GREEN_BG;

function build(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'roulette-modal';
  el.className = 'fullscreen-modal hidden';
  el.innerHTML = `
    <div class="rl-card">
      <div class="rl-head">
        <h3>🎡 Roulette</h3>
        <button type="button" class="rl-close" data-rl="close">✖</button>
      </div>
      <div class="rl-top">
        <canvas class="rl-wheel" width="220" height="220"></canvas>
        <div class="rl-side">
          <div class="rl-phase"></div>
          <div class="rl-bar"><div></div></div>
          <div class="rl-history"></div>
          <div class="rl-players"></div>
        </div>
      </div>
      <div class="rl-board"></div>
      <div class="rl-chips">${CHIPS.map(
        (c) => `<button type="button" class="rl-chip" data-chip="${c}">${c}</button>`,
      ).join('')}</div>
      <div class="rl-foot">
        <span class="rl-mine"></span>
        <button type="button" data-rl="repeat">🔁 Ripeti</button>
        <button type="button" data-rl="withdraw">↩️ Ritira</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-bet],[data-chip],[data-rl]');
    if (!t) return;
    if (t.dataset.bet) void placeChip(t.dataset.bet);
    else if (t.dataset.chip) {
      chip = Number(t.dataset.chip);
      sfx('click');
      render();
    } else if (t.dataset.rl === 'close') closeRoulette();
    else if (t.dataset.rl === 'withdraw') void withdraw();
    else if (t.dataset.rl === 'repeat') void repeat();
  });
  return el;
}

/** Tabellone: lo zero, i numeri in tre file, colonne, dozzine e puntate esterne. */
function boardHtml(mine: Bets, others: Bets, locked: boolean): string {
  const cell = (key: string, label: string, style: string, cls = '') => {
    const m = mine[key] || 0,
      o = others[key] || 0;
    return `<button type="button" class="rl-cell ${cls}" data-bet="${key}" style="${style}" ${
      locked ? 'disabled' : ''
    }>${label}${m ? `<span class="rl-my">${m}</span>` : ''}${o ? `<span class="rl-other">${o}</span>` : ''}</button>`;
  };
  let out = cell('n0', '0', `background:${GREEN_BG};grid-row:1 / span 3;grid-column:1`, 'rl-zero');
  for (let col = 0; col < 12; col++)
    for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      out += cell(
        'n' + n,
        String(n),
        `background:${bg(n)};grid-row:${row + 1};grid-column:${col + 2}`,
      );
    }
  for (let row = 0; row < 3; row++)
    out += cell(`c${3 - row}`, '2:1', `grid-row:${row + 1};grid-column:14`, 'rl-out');
  for (let d = 1; d <= 3; d++)
    out += cell(
      `d${d}`,
      BET_LABEL['d' + d],
      `grid-row:4;grid-column:${(d - 1) * 4 + 2} / span 4`,
      'rl-out',
    );
  const outside: [string, string, string][] = [
    ['low', '1–18', ''],
    ['even', 'Pari', ''],
    ['red', '◆ Rosso', `background:${RED_BG}`],
    ['black', '◆ Nero', `background:${BLACK_BG}`],
    ['odd', 'Dispari', ''],
    ['high', '19–36', ''],
  ];
  outside.forEach(([k, label, style], i) => {
    out += cell(k, label, `${style};grid-row:5;grid-column:${i * 2 + 2} / span 2`, 'rl-out');
  });
  return out;
}

function render(): void {
  if (!open || !modal) return;
  const now = serverNow();
  const p = phaseAt(now);
  const n = results.get(p.round);
  const mine = myBets();
  const others: Bets = {};
  for (const [pid, e] of Object.entries(table))
    if (pid !== me()) for (const [k, v] of Object.entries(e.bets)) others[k] = (others[k] || 0) + v;
  const phaseText =
    p.phase === 'bet'
      ? `🟢 Fate il vostro gioco! Puntate aperte ancora ${Math.ceil(p.left / 1000)} s`
      : p.phase === 'spin'
        ? '🔴 Rien ne va plus: la ruota gira…'
        : n !== undefined
          ? `🎯 È uscito il ${n} ${colorOf(n) === 'red' ? 'rosso' : colorOf(n) === 'black' ? 'nero' : '(zero)'}`
          : '⏳ Si aspetta il numero…';
  const players = Object.entries(table)
    .map(([pid, e]) => {
      const t = totalOf(e.bets);
      const line = Object.entries(e.bets)
        .slice(0, 3)
        .map(([k, v]) => `${v} € ${betLabel(k)}`)
        .join(', ');
      const res = p.phase === 'show' && n !== undefined ? payout(e.bets, n) : null;
      return `<li>${pid === me() ? '👉 ' : ''}<b>${escape(e.nick)}</b>: ${t} €${line ? ` <small>(${escape(line)}${Object.keys(e.bets).length > 3 ? '…' : ''})</small>` : ''}${
        res === null
          ? ''
          : res > 0
            ? ` <span class="rl-win">+${res} €</span>`
            : ' <span class="rl-lose">perso</span>'
      }</li>`;
    })
    .join('');
  const history = [...results.entries()]
    .filter(([r]) => r < p.round || p.phase === 'show')
    .sort((a, b) => b[0] - a[0])
    .slice(0, 10)
    .map(([, x]) => `<span style="background:${bg(x)}">${x}</span>`)
    .join('');
  // si ridisegna solo se cambia qualcosa (il tempo che scorre è nella barra)
  const next = [
    phaseText,
    history,
    players,
    JSON.stringify(mine),
    JSON.stringify(others),
    p.phase,
    chip,
    game.moneyLevel,
  ].join('|');
  if (next !== html) {
    html = next;
    modal.querySelector('.rl-phase')!.innerHTML = `<div class="rl-phase-txt">${phaseText}</div>`;
    modal.querySelector('.rl-history')!.innerHTML = history
      ? `<small>Ultimi numeri</small><div>${history}</div>`
      : '';
    modal.querySelector('.rl-players')!.innerHTML =
      `<b>Al tavolo in questo giro</b>` +
      (players ? `<ul>${players}</ul>` : '<p>Nessuna puntata ancora: inizia tu!</p>');
    modal.querySelector('.rl-board')!.innerHTML = boardHtml(mine, others, p.phase !== 'bet');
    modal
      .querySelectorAll<HTMLElement>('[data-chip]')
      .forEach((b) => b.classList.toggle('active', Number(b.dataset.chip) === chip));
    modal.querySelector('.rl-mine')!.textContent =
      `Le tue puntate: ${totalOf(mine)} € (max ${MAX_ROUND_BET}) · in cassaforte ${game.moneyLevel} €`;
  }
  // barra del tempo della fase
  const bar = modal.querySelector<HTMLElement>('.rl-bar > div');
  if (bar) {
    const span =
      p.phase === 'bet' ? BET_MS : p.phase === 'spin' ? SPIN_MS : ROUND_MS - BET_MS - SPIN_MS;
    bar.style.width = `${Math.max(0, Math.min(100, (p.left / span) * 100))}%`;
    bar.style.background =
      p.phase === 'bet' ? '#2ed573' : p.phase === 'spin' ? '#ff4757' : '#feca57';
  }
}

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** La ruota: settori colorati con i numeri; gira durante l'estrazione e la pallina si ferma. */
export function drawWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  view: { phase: string; since: number; n: number | null },
  t: number,
): void {
  let wheel = t * 0.05,
    ball: number | null = null;
  if (view.n !== null && view.phase !== 'bet') {
    const k = Math.min(1, (view.since - BET_MS) / SPIN_MS);
    const a = spinAngles(view.n, k);
    wheel = a.wheel;
    ball = a.ball;
  } else if (view.phase !== 'bet') {
    // il numero non è ancora arrivato: la ruota gira veloce
    wheel = t * 0.8;
    ball = -t * 1.3;
  }
  const seg = (Math.PI * 2) / WHEEL.length;
  ctx.save();
  ctx.translate(cx, cy);
  // bordo di legno
  ctx.fillStyle = '#6d4c41';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4ac0d';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(wheel * Math.PI * 2);
  WHEEL.forEach((num, i) => {
    ctx.fillStyle = bg(num);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.86, i * seg - Math.PI / 2 - seg / 2, (i + 1) * seg - Math.PI / 2 - seg / 2);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(i * seg);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * 0.09)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(num), 0, -r * 0.74);
    ctx.restore();
  });
  // mozzo
  ctx.fillStyle = '#8d6e63';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4ac0d';
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(-r * 0.03, -r * 0.45, r * 0.06, r * 0.45);
  }
  ctx.restore();
  // la pallina (in coordinate fisse: il suo angolo è già "assoluto")
  const ballAngle = ball === null ? null : ball * Math.PI * 2 - Math.PI / 2;
  if (ballAngle !== null) {
    const br = view.n !== null && view.phase === 'show' ? r * 0.62 : r * 0.68;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ballAngle) * br, cy + Math.sin(ballAngle) * br, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // a numero uscito, il numero grande al centro
  if (view.n !== null && view.phase === 'show') {
    ctx.fillStyle = bg(view.n);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * 0.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(view.n), cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

function animate(t: number): void {
  if (!open || !modal) return;
  const cv = modal.querySelector<HTMLCanvasElement>('.rl-wheel');
  const ctx = cv?.getContext('2d');
  if (cv && ctx) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawWheel(ctx, cv.width / 2, cv.height / 2, cv.width / 2 - 4, rouletteView(), t / 1000);
  }
  frame = requestAnimationFrame(animate);
}

/** Al tavolo: si apre la finestra con la ruota e il tabellone delle puntate. */
export function openRoulette(): void {
  if (game.session.OFFLINE) {
    toast('🎡 La roulette si gioca online: nella modalità prova non c’è il tavolo.', 4000);
    return;
  }
  watchRoulette();
  modal ||= build();
  open = true;
  html = '';
  modal.classList.remove('hidden');
  sfx('click');
  render();
  frame = requestAnimationFrame(animate);
}

export function closeRoulette(): void {
  open = false;
  cancelAnimationFrame(frame);
  modal?.classList.add('hidden');
}

/** Per i pulsanti in giro per il gioco: c'è una vincita da incassare da una visita passata? */
export const roulettePending = (): boolean => pending().length > 0;
