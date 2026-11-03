// Sala scommesse: slot da 5 € e morra cinese tra due giocatori con puntata.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { presenceAlive, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { creditMoney, spendMoney } from './economy.js';
import { escapeHtmlSafe, sendNotify } from './needs.js';
import {
  RPS_ANSWER_MS,
  RPS_CHOICES,
  RPS_LABEL,
  RPS_MAX_BET,
  RPS_MIN_BET,
  RPS_MOVE_MS,
  type RpsChoice,
  SLOT_BET,
  type SlotSymbol,
  isRpsChoice,
  reelSymbol,
  rpsBetError,
  rpsWinner,
  slotWin,
  symbolEmoji,
} from './betting-rules.js';

const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
const me = (): string => game.session.myPlayerId;
const myName = (): string => String(game.player.myData.nick || 'Giocatore').slice(0, 20);

// ---------------------------------------------------------------- slot

let spinning = false;

export function openSlot(): void {
  dom('slot-modal').classList.remove('hidden');
  dom('slot-result').textContent = `Ogni giro costa ${SLOT_BET} €. Tre simboli uguali vincono!`;
  dom('slot-result').className = 'slot-result';
}

export async function spinSlot(): Promise<void> {
  if (spinning) return;
  if (game.moneyLevel < SLOT_BET) {
    toast(`Ti servono ${SLOT_BET} € in cassaforte per giocare.`);
    return;
  }
  spinning = true;
  const button = dom('slot-spin') as HTMLButtonElement;
  button.disabled = true;
  try {
    if (!(await spendMoney(SLOT_BET))) return;
    sfx('click');
    const result: SlotSymbol[] = [0, 1, 2].map(() => reelSymbol(Math.random()));
    const reels = [0, 1, 2].map((i) => dom('slot-reel-' + i) as HTMLElement);
    reels.forEach((r) => r.classList.add('spinning'));
    // i rulli girano e si fermano uno alla volta
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = performance.now() - start;
        reels.forEach((r, i) => {
          if (t < 900 + i * 450) r.textContent = symbolEmoji(reelSymbol(Math.random()));
          else if (r.classList.contains('spinning')) {
            r.classList.remove('spinning');
            r.textContent = symbolEmoji(result[i]);
            sfx('click');
          }
        });
        if (t < 900 + 2 * 450 + 50) lifetime.setTimeout(tick, 70);
        else resolve();
      };
      tick();
    });
    const win = slotWin(result);
    const box = dom('slot-result');
    if (win > 0) {
      await creditMoney(win);
      sfx('coin');
      box.textContent =
        win >= SLOT_BET * 50
          ? `🎉 JACKPOT! Hai vinto ${euro(win)}!`
          : win === SLOT_BET
            ? `🍒 Due ciliegie: riprendi i tuoi ${euro(win)}.`
            : `🎉 Hai vinto ${euro(win)}!`;
      box.className = 'slot-result win';
    } else {
      box.textContent = `Niente questa volta (−${euro(SLOT_BET)}). Riprova!`;
      box.className = 'slot-result';
    }
    game.player.stats.slotSpins = (game.player.stats.slotSpins || 0) + 1;
    saveGame(false);
  } finally {
    spinning = false;
    button.disabled = false;
  }
}

// ---------------------------------------------------------------- morra cinese

interface RpsGame {
  a: string;
  aName: string;
  b: string;
  bName: string;
  bet: number;
  state: 'invited' | 'playing' | 'done' | 'declined' | 'cancelled';
  t: number;
  moveT?: number;
  round?: number;
  aHash?: string | null;
  aChoice?: string | null;
  aSalt?: string | null;
  bChoice?: string | null;
  winner?: string;
  paid?: boolean;
  aBack?: boolean;
  bBack?: boolean;
}

const OUT_KEY = 'sims_rps_out';
const SECRET_KEY = 'sims_rps_secret';
/** Sfida che sto seguendo: il nodo è sempre sims_rps/<sfidato>. */
let watching: { target: string; ref: GameValue; listener: GameValue } | null = null;
let lastGame: RpsGame | null = null;
const answered = new Set<number>();
let lastRound = -1;
let myPick: RpsChoice | null = null;
let busy = false;

const rpsRef = (target: string) => game.session.db.ref('sims_rps/' + target);

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ascolta la sfida in cui sono coinvolto (come sfidante o come sfidato). */
function watch(target: string): void {
  if (watching?.target === target) return;
  if (watching) watching.ref.off('value', watching.listener);
  const ref = rpsRef(target);
  const listener = (snap: GameValue): void => void onGame(target, snap.val());
  ref.on('value', listener);
  watching = { target, ref, listener };
}

/** Cambia la sfida con una transazione: niente doppi pagamenti anche con due finestre aperte. */
async function change(target: string, update: (g: RpsGame) => Partial<RpsGame> | null) {
  const result = await rpsRef(target).transaction((cur: GameValue) => {
    if (!cur) return undefined;
    const patch = update(cur as RpsGame);
    return patch ? { ...cur, ...patch, moveT: serverNow() } : undefined;
  });
  return result.committed;
}

export function startBetting(): void {
  if (game.session.OFFLINE && !game.session.myPlayerId) return;
  // sfide ricevute
  rpsRef(me()).on('value', (snap: GameValue) => {
    const g = snap.val() as RpsGame | null;
    if (!g) return;
    if (g.state === 'invited' && g.b === me()) void askToAccept(g);
    // partita in corso o da chiudere (rimborso, vincita) dopo aver riaperto il gioco
    else if (!watching) watch(me());
  });
  // sfida lanciata prima di chiudere il gioco: si riprende (rimborsi e vincite)
  const out = localStorage.getItem(game.session.LS_PREFIX + OUT_KEY);
  if (out) watch(out);
  lifetime.setInterval(checkTimeouts, 3000);
}

async function askToAccept(g: RpsGame): Promise<void> {
  if (answered.has(g.t) || serverNow() - g.t > RPS_ANSWER_MS) return;
  answered.add(g.t);
  sfx('mission');
  sendNotify('⚔️ Sfida a morra cinese', `${g.aName} ti sfida per ${euro(g.bet)}`, 'sims-rps');
  const res: GameValue = await openDialog({
    title: '⚔️ Sfida a morra cinese',
    text: `${g.aName} ti sfida a morra cinese per ${euro(g.bet)}.\nSe accetti, metti ${euro(g.bet)} nel piatto: chi vince prende ${euro(g.bet * 2)}.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: `Accetta (${euro(g.bet)})`, value: 'yes', color: '#e17055' },
    ],
  });
  if (res.action !== 'yes') {
    await change(me(), (cur) =>
      cur.state === 'invited' && cur.t === g.t ? { state: 'declined' } : null,
    );
    return;
  }
  const error = rpsBetError(g.bet, game.moneyLevel);
  if (error || !(await spendMoney(g.bet))) {
    if (error) toast('❌ ' + error, 4500);
    await change(me(), (cur) =>
      cur.state === 'invited' && cur.t === g.t ? { state: 'declined' } : null,
    );
    return;
  }
  const ok = await change(me(), (cur) =>
    cur.state === 'invited' && cur.t === g.t ? { state: 'playing', round: 0 } : null,
  );
  if (!ok) {
    await creditMoney(g.bet); // la sfida è scaduta nel frattempo
    toast('⌛ La sfida non è più valida: i tuoi soldi sono tornati in cassaforte.', 4500);
    return;
  }
  myPick = null;
  lastRound = -1;
  watch(me());
  openRpsModal();
}

// ---- sfidare qualcuno

/** Tutti i giocatori online in questo momento (escluso me), ovunque si trovino; prima chi è nella sala. */
function playersOnline(): { id: string; name: string; place: string; here: boolean }[] {
  const now = Date.now();
  return Object.entries<GameValue>(game.onlinePlayers || {})
    .filter(([id, op]) => id !== me() && op && !op.offline && presenceAlive(id, op, now))
    .map(([id, op]) => ({
      id,
      name: String(op.name || 'Giocatore'),
      place: typeof op.place === 'string' ? op.place : '',
      here: op.env === 'scommesse',
    }))
    .sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name));
}

export function openRpsTable(): void {
  if (lastGame && watching && (lastGame.state === 'invited' || lastGame.state === 'playing')) {
    openRpsModal();
    return;
  }
  openRpsModal();
  renderChallengeList();
}

function openRpsModal(): void {
  dom('rps-modal').classList.remove('hidden');
  renderRps();
}

function renderChallengeList(): void {
  const players = playersOnline();
  const body: HTMLElement = dom('rps-body');
  body.innerHTML =
    `<p class="rps-help">Sfida un qualsiasi giocatore online: gli arriva l'invito ovunque si trovi. Ognuno mette la stessa puntata nel piatto e chi vince prende tutto. In caso di pareggio si rigioca.</p>` +
    `<label class="rps-bet">Puntata: <input id="rps-bet" type="number" inputmode="numeric" min="${RPS_MIN_BET}" max="${RPS_MAX_BET}" value="20"> €</label>` +
    (players.length
      ? players
          .map(
            (p) =>
              `<div class="rps-player"><span>👤 ${escapeHtmlSafe(p.name)}${p.place ? `<small class="rps-place">📍 ${escapeHtmlSafe(p.here ? 'Qui nella sala' : p.place)}</small>` : ''}</span><button type="button" data-rps-target="${escapeHtmlSafe(p.id)}">⚔️ Sfida</button></div>`,
          )
          .join('')
      : '<p class="rps-empty">Non c\'è nessun altro giocatore online in questo momento. Torna quando c\'è qualcuno!</p>');
  body.querySelectorAll<HTMLButtonElement>('[data-rps-target]').forEach((b) => {
    b.onclick = () => {
      const target = b.dataset.rpsTarget || '';
      const name = players.find((p) => p.id === target)?.name || 'Giocatore';
      const bet = Number((dom('rps-bet') as HTMLInputElement).value);
      void challenge(target, name, bet);
    };
  });
}

async function challenge(target: string, name: string, bet: number): Promise<void> {
  if (busy) return;
  const error = rpsBetError(bet, game.moneyLevel);
  if (error) {
    toast('❌ ' + error, 4500);
    return;
  }
  busy = true;
  try {
    const existing = (await rpsRef(target).get()).val() as RpsGame | null;
    const free =
      !existing ||
      ['done', 'declined', 'cancelled'].includes(existing.state) ||
      serverNow() - (existing.moveT || existing.t) > 10 * 60 * 1000;
    if (!free) {
      toast(`${name} sta già giocando un'altra sfida. Riprova tra poco.`, 4000);
      return;
    }
    if (!(await spendMoney(bet))) return;
    const g: RpsGame = {
      a: me(),
      aName: myName(),
      b: target,
      bName: name.slice(0, 20),
      bet,
      state: 'invited',
      t: serverNow(),
      round: 0,
    };
    try {
      await rpsRef(target).set(g);
    } catch (e) {
      console.warn('[morra]', e);
      await creditMoney(bet);
      toast('❌ Non è stato possibile lanciare la sfida.', 4000);
      return;
    }
    localStorage.setItem(game.session.LS_PREFIX + OUT_KEY, target);
    myPick = null;
    lastRound = -1;
    watch(target);
    toast(`⚔️ Hai sfidato ${name} per ${euro(bet)}. Aspetta che accetti…`, 4000);
  } finally {
    busy = false;
  }
}

// ---- partita

async function onGame(target: string, g: RpsGame | null): Promise<void> {
  lastGame = g;
  // nuovo giro dopo un pareggio: si sceglie di nuovo
  if (g && (g.round || 0) !== lastRound) {
    lastRound = g.round || 0;
    myPick = null;
  }
  renderRps();
  if (!g) return;
  const role = g.a === me() ? 'a' : g.b === me() ? 'b' : null;
  if (!role) return;
  // rimborsi: rifiutata o annullata
  if ((g.state === 'declined' || g.state === 'cancelled') && role === 'a' && !g.aBack) {
    if (await change(target, (cur) => (cur.aBack ? null : { aBack: true }))) {
      await creditMoney(g.bet);
      toast(
        g.state === 'declined'
          ? `🙅 ${g.bName} ha rifiutato la sfida: i tuoi ${euro(g.bet)} sono tornati in cassaforte.`
          : `⌛ Sfida annullata: i tuoi ${euro(g.bet)} sono tornati in cassaforte.`,
        5000,
      );
      localStorage.removeItem(game.session.LS_PREFIX + OUT_KEY);
    }
    return;
  }
  if (g.state === 'cancelled' && role === 'b' && !g.bBack) {
    if (await change(target, (cur) => (cur.bBack ? null : { bBack: true }))) {
      await creditMoney(g.bet);
      toast(`⌛ Sfida annullata: i tuoi ${euro(g.bet)} sono tornati in cassaforte.`, 5000);
    }
    return;
  }
  // vincita: la incassa il vincitore, una volta sola
  if (g.state === 'done') {
    if (g.winner === me() && !g.paid) {
      if (await change(target, (cur) => (cur.paid ? null : { paid: true }))) {
        await creditMoney(g.bet * 2);
        sfx('coin');
        saveGame(true);
      }
    }
    if (role === 'a') localStorage.removeItem(game.session.LS_PREFIX + OUT_KEY);
    return;
  }
  if (g.state !== 'playing') return;
  // lo sfidante rivela la mossa quando lo sfidato ha scelto
  if (role === 'a' && g.aHash && g.bChoice && !g.aChoice) {
    const secret = JSON.parse(localStorage.getItem(game.session.LS_PREFIX + SECRET_KEY) || 'null');
    if (secret && secret.round === (g.round || 0) && secret.t === g.t)
      await change(target, (cur) =>
        cur.aChoice || cur.round !== secret.round
          ? null
          : { aChoice: secret.choice, aSalt: secret.salt },
      );
    return;
  }
  // lo sfidato manda la sua mossa appena lo sfidante ha salvato la sua impronta
  if (role === 'b' && g.aHash && !g.bChoice && myPick)
    await change(target, (cur) => (cur.bChoice || !cur.aHash ? null : { bChoice: myPick }));
  // entrambe le mosse note: si decide (lo fa lo sfidante, gli altri controllano)
  if (g.aChoice && g.bChoice && role === 'a') {
    const honest = isRpsChoice(g.aChoice) && (await sha256(g.aChoice + g.aSalt)) === g.aHash;
    const result =
      honest && isRpsChoice(g.bChoice) ? rpsWinner(g.aChoice as RpsChoice, g.bChoice) : 'b';
    if (result === null)
      await change(target, (cur) =>
        cur.round !== g.round
          ? null
          : { round: (cur.round || 0) + 1, aHash: null, aChoice: null, aSalt: null, bChoice: null },
      );
    else
      await change(target, (cur) =>
        cur.state !== 'playing' ? null : { state: 'done', winner: result === 'a' ? cur.a : cur.b },
      );
  }
}

/** Scelta di sasso, carta o forbici. */
async function pick(choice: RpsChoice): Promise<void> {
  const g = lastGame;
  if (!g || g.state !== 'playing' || !watching) return;
  const role = g.a === me() ? 'a' : 'b';
  myPick = choice;
  game.mySay = RPS_LABEL[choice];
  game.mySayT = Date.now();
  sfx('click');
  if (role === 'a') {
    const salt = [...crypto.getRandomValues(new Uint8Array(12))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem(
      game.session.LS_PREFIX + SECRET_KEY,
      JSON.stringify({ choice, salt, round: g.round || 0, t: g.t }),
    );
    const hash = await sha256(choice + salt);
    await change(watching.target, (cur) =>
      cur.aHash || cur.round !== g.round ? null : { aHash: hash },
    );
  } else if (g.aHash) {
    await change(watching.target, (cur) => (cur.bChoice ? null : { bChoice: choice }));
  }
  renderRps();
}

/** Se qualcuno non risponde o non sceglie, la sfida si annulla e ognuno riprende i soldi. */
function checkTimeouts(): void {
  const g = lastGame;
  if (!g || !watching) return;
  const now = serverNow();
  if (g.state === 'invited' && g.a === me() && now - g.t > RPS_ANSWER_MS)
    void change(watching.target, (cur) =>
      cur.state === 'invited' ? { state: 'cancelled' } : null,
    );
  if (g.state === 'playing' && now - (g.moveT || g.t) > RPS_MOVE_MS)
    void change(watching.target, (cur) =>
      cur.state === 'playing' && now - (cur.moveT || cur.t) > RPS_MOVE_MS
        ? { state: 'cancelled' }
        : null,
    );
  renderRps();
}

function renderRps(): void {
  const modal = dom('rps-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const g = lastGame;
  const body: HTMLElement = dom('rps-body');
  if (!g || !watching || ['declined', 'cancelled'].includes(g.state)) {
    if (!body.querySelector('#rps-bet')) renderChallengeList();
    return;
  }
  const role = g.a === me() ? 'a' : 'b';
  const other = role === 'a' ? g.bName : g.aName;
  const pot = `<div class="rps-pot">💰 Nel piatto: <b>${euro(g.bet * 2)}</b> · contro ${escapeHtmlSafe(other)}</div>`;
  if (g.state === 'invited') {
    body.innerHTML =
      pot + `<p class="rps-wait">⏳ Aspetto che ${escapeHtmlSafe(other)} accetti la sfida…</p>`;
    return;
  }
  if (g.state === 'done') {
    const win = g.winner === me();
    const a = isRpsChoice(g.aChoice) ? RPS_LABEL[g.aChoice] : '?',
      b = isRpsChoice(g.bChoice) ? RPS_LABEL[g.bChoice] : '?';
    body.innerHTML =
      `<div class="rps-hands"><div>${escapeHtmlSafe(g.aName)}<br><span>${a}</span></div><b>VS</b><div>${escapeHtmlSafe(g.bName)}<br><span>${b}</span></div></div>` +
      `<p class="rps-final ${win ? 'win' : ''}">${win ? `🏆 Hai vinto ${euro(g.bet * 2)}!` : `😞 Hai perso ${euro(g.bet)}.`}</p>` +
      '<button type="button" class="art-btn rps-again" style="background:#e17055">⚔️ Nuova sfida</button>';
    const again = body.querySelector('.rps-again') as HTMLButtonElement;
    again.onclick = () => {
      lastGame = null;
      renderChallengeList();
    };
    return;
  }
  // playing
  const mineDone = role === 'a' ? !!g.aHash : !!g.bChoice || (!!myPick && !g.aHash);
  const status =
    (g.round || 0) > 0
      ? `<p class="rps-tie">🤝 Pareggio! Si rigioca (giro ${(g.round || 0) + 1}).</p>`
      : '';
  const left = Math.max(0, Math.ceil((RPS_MOVE_MS - (serverNow() - (g.moveT || g.t))) / 1000));
  body.innerHTML =
    pot +
    status +
    (mineDone
      ? `<p class="rps-wait">✅ Hai scelto ${myPick ? RPS_LABEL[myPick] : ''}. Aspetto la mossa di ${escapeHtmlSafe(other)}…</p>`
      : `<p class="rps-help">Scegli la tua mossa (${left} s):</p><div class="rps-choices">` +
        RPS_CHOICES.map(
          (c) => `<button type="button" data-rps-pick="${c}">${RPS_LABEL[c]}</button>`,
        ).join('') +
        '</div>');
  body.querySelectorAll<HTMLButtonElement>('[data-rps-pick]').forEach((b) => {
    b.onclick = () => void pick(b.dataset.rpsPick as RpsChoice);
  });
}
