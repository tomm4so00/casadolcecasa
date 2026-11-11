import { countUse } from './usage.js';
// Sala scommesse: slot da 5 Đ e morra cinese tra due giocatori con puntata.
import type { GameReference, GameSnapshot } from './database.js';
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
import { recordActivity } from './activity.js';
import { worldNode } from './world-db.js';
import { notePersonality } from './personality.js';
import { levelOf, slotPrize } from './personality-rules.js';

const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;
const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
const me = (): string => game.session.myPlayerId;
const myName = (): string => String(game.player.myData.nick || 'Giocatore').slice(0, 20);

// ---------------------------------------------------------------- slot

let spinning = false;

export function openSlot(): void {
  dom('slot-modal').classList.remove('hidden');
  dom('slot-result').textContent = `Ogni giro costa ${SLOT_BET} Đ. Tre simboli uguali vincono!`;
  dom('slot-result').className = 'slot-result';
}

export async function spinSlot(): Promise<void> {
  countUse('slot');
  if (spinning) return;
  if (game.moneyLevel < SLOT_BET) {
    toast(`Ti servono ${SLOT_BET} Đ in cassaforte per giocare.`);
    return;
  }
  spinning = true;
  const button = dom('slot-spin') as HTMLButtonElement;
  button.disabled = true;
  try {
    if (!(await spendMoney(SLOT_BET))) return;
    recordActivity('crypto');
    notePersonality('slotSpin', SLOT_BET);
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
    // il Giocatore d'azzardo vince un po' di più
    const win = slotPrize(slotWin(result), levelOf(game.player.personality, 'gambler'));
    const box = dom('slot-result');
    if (win > 0) {
      await creditMoney(win);
      sfx('coin');
      box.textContent =
        win >= SLOT_BET * 50
          ? `🎉 JACKPOT! Hai vinto ${dindini(win)}!`
          : win === SLOT_BET
            ? `🍒 Due ciliegie: riprendi i tuoi ${dindini(win)}.`
            : `🎉 Hai vinto ${dindini(win)}!`;
      box.className = 'slot-result win';
    } else {
      box.textContent = `Niente questa volta (−${dindini(SLOT_BET)}). Riprova!`;
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
let watching: {
  target: string;
  ref: GameReference;
  listener: (snap: GameSnapshot) => void;
} | null = null;
let lastGame: RpsGame | null = null;
const answered = new Set<number>();
let lastRound = -1;
let myPick: RpsChoice | null = null;
let busy = false;

const rpsRef = (target: string) => game.session.db.ref(worldNode('rps') + '/' + target);

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ascolta la sfida in cui sono coinvolto (come sfidante o come sfidato). */
function watch(target: string): void {
  if (watching?.target === target) return;
  if (watching) watching.ref.off('value', watching.listener);
  const ref = rpsRef(target);
  const listener = (snap: GameSnapshot): void => void onGame(target, snap.val());
  ref.on('value', listener);
  watching = { target, ref, listener };
}

/** Cambia la sfida con una transazione: niente doppi pagamenti anche con due finestre aperte. */
async function change(target: string, update: (g: RpsGame) => Partial<RpsGame> | null) {
  const result = await rpsRef(target).transaction((cur: RpsGame | null) => {
    if (!cur) return undefined;
    const patch = update(cur);
    return patch ? { ...cur, ...patch, moveT: serverNow() } : undefined;
  });
  return result.committed;
}

export function startBetting(): void {
  if (game.session.OFFLINE && !game.session.myPlayerId) return;
  // sfide ricevute
  rpsRef(me()).on('value', (snap) => {
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
  sendNotify('⚔️ Sfida a morra cinese', `${g.aName} ti sfida per ${dindini(g.bet)}`, 'sims-rps');
  const res = await openDialog({
    title: '⚔️ Sfida a morra cinese',
    text: `${g.aName} ti sfida a morra cinese per ${dindini(g.bet)}.\nSe accetti, metti ${dindini(g.bet)} nel piatto: chi vince prende ${dindini(g.bet * 2)}.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: `Accetta (${dindini(g.bet)})`, value: 'yes', color: '#e17055' },
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
  if (ok) notePersonality('rpsBet', g.bet);
  if (!ok) {
    await creditMoney(g.bet); // la sfida è scaduta nel frattempo
    toast('⌛ La sfida non è più valida: i tuoi soldi sono tornati in cassaforte.', 4500);
    return;
  }
  recordActivity('crypto');
  myPick = null;
  lastRound = -1;
  watch(me());
  openRpsModal();
}

// ---- sfidare qualcuno

/** Tutti i giocatori online in questo momento (escluso me), ovunque si trovino; prima chi è nella sala. */
function playersOnline(): { id: string; name: string; place: string; here: boolean }[] {
  const now = Date.now();
  return Object.entries(game.onlinePlayers || {})
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
  countUse('morra');
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
    `<label class="rps-bet">Puntata: <input id="rps-bet" type="number" inputmode="numeric" min="${RPS_MIN_BET}" max="${RPS_MAX_BET}" value="20"> Đ</label>` +
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
    recordActivity('crypto');
    notePersonality('rpsBet', bet);
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
    toast(`⚔️ Hai sfidato ${name} per ${dindini(bet)}. Aspetta che accetti…`, 4000);
  } finally {
    busy = false;
  }
}

// ---- partita

async function onGame(target: string, g: RpsGame | null): Promise<void> {
  lastGame = g;
  if (g) noteTie(g);
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
          ? `🙅 ${g.bName} ha rifiutato la sfida: i tuoi ${dindini(g.bet)} sono tornati in cassaforte.`
          : `⌛ Sfida annullata: i tuoi ${dindini(g.bet)} sono tornati in cassaforte.`,
        5000,
      );
      localStorage.removeItem(game.session.LS_PREFIX + OUT_KEY);
    }
    return;
  }
  if (g.state === 'cancelled' && role === 'b' && !g.bBack) {
    if (await change(target, (cur) => (cur.bBack ? null : { bBack: true }))) {
      await creditMoney(g.bet);
      toast(`⌛ Sfida annullata: i tuoi ${dindini(g.bet)} sono tornati in cassaforte.`, 5000);
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

// ---- grafica: due mani che si sfidano

const RPS_EMOJI: Record<RpsChoice, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
/** Durata dello "Sasso… carta… forbici!" prima che le mani si aprano. */
const REVEAL_MS = 1500;

/** Pareggio appena visto: si mostra la rivelazione per qualche secondo, poi si rigioca. */
let tieShow: { key: string; me: RpsChoice; them: RpsChoice; until: number } | null = null;
/** Mosse già annunciate col suono (una volta per giro). */
let soundedReveal = '';

/** Ricorda le due mosse di un pareggio: il giro dopo le azzera, ma l'animazione deve vederle. */
function noteTie(g: RpsGame): void {
  if (g.state !== 'playing' || !isRpsChoice(g.aChoice) || !isRpsChoice(g.bChoice)) return;
  if (rpsWinner(g.aChoice, g.bChoice) !== null) return;
  const key = `${g.t}-${g.round || 0}`;
  if (tieShow?.key === key) return;
  const mineA = g.a === me();
  tieShow = {
    key,
    me: mineA ? g.aChoice : g.bChoice,
    them: mineA ? g.bChoice : g.aChoice,
    until: Date.now() + REVEAL_MS + 1800,
  };
  lifetime.setTimeout(renderRps, REVEAL_MS + 1900);
}

/** Una mano: il pugno che si agita e, se `pick` c'è, la mossa che compare alla fine. */
function handHtml(side: 'me' | 'them', pick: RpsChoice | null, mood: string): string {
  return (
    `<div class="rps-hand ${side} ${mood}">` +
    `<span class="rps-fist">✊</span>` +
    (pick ? `<span class="rps-shown">${RPS_EMOJI[pick]}</span>` : '') +
    '</div>'
  );
}

/** Il ring con le due mani. `reveal` fa partire il conto e mostra le mosse. */
function arenaHtml(opts: {
  other: string;
  myTag: string;
  theirTag: string;
  reveal?: { me: RpsChoice; them: RpsChoice; result: 'win' | 'lose' | 'tie' };
  ready?: { me: boolean; them: boolean };
}): string {
  const r = opts.reveal;
  const mood = (who: 'me' | 'them') =>
    r
      ? r.result === 'tie'
        ? 'tie'
        : (r.result === 'win') === (who === 'me')
          ? 'winner'
          : 'loser'
      : opts.ready?.[who]
        ? 'ready'
        : 'idle';
  const side = (who: 'me' | 'them', name: string, tag: string) =>
    `<div class="rps-side ${who}"><div class="rps-name">${escapeHtmlSafe(name)}</div>` +
    handHtml(who, r ? r[who] : null, mood(who)) +
    `<div class="rps-tag">${tag}</div></div>`;
  return (
    `<div class="rps-arena${r ? ' revealing' : ''}">` +
    side('me', 'Tu', opts.myTag) +
    '<div class="rps-vs">VS</div>' +
    side('them', opts.other, opts.theirTag) +
    (r
      ? '<div class="rps-chant"><span>Sasso…</span><span>carta…</span><span>forbici!</span></div>'
      : '') +
    '</div>'
  );
}

/** Aggiorna un pezzo della finestra solo se cambia: così le animazioni non ripartono da capo. */
function setPart(body: HTMLElement, cls: string, html: string): HTMLElement {
  let el = body.querySelector<HTMLElement>(':scope > .' + cls);
  if (!el) {
    body.innerHTML = '';
    for (const c of ['rps-top', 'rps-stage', 'rps-controls']) {
      const div = document.createElement('div');
      div.className = c;
      body.appendChild(div);
    }
    el = body.querySelector<HTMLElement>(':scope > .' + cls) as HTMLElement;
  }
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
  }
  return el;
}

/** Tre colpi a tempo col "Sasso… carta… forbici!", una volta per giro. */
function revealSound(key: string, win: boolean | null): void {
  if (soundedReveal === key) return;
  soundedReveal = key;
  for (let i = 0; i < 3; i++) lifetime.setTimeout(() => sfx('click'), i * 500);
  if (win !== null) lifetime.setTimeout(() => sfx(win ? 'coin' : 'click'), REVEAL_MS + 100);
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
  setPart(
    body,
    'rps-top',
    `<div class="rps-pot">💰 Nel piatto: <b>${dindini(g.bet * 2)}</b> · contro ${escapeHtmlSafe(other)}</div>`,
  );
  if (g.state === 'invited') {
    setPart(
      body,
      'rps-stage',
      arenaHtml({
        other,
        myTag: '✅ Pronto',
        theirTag: '⏳ Deve accettare…',
        ready: { me: true, them: false },
      }),
    );
    setPart(body, 'rps-controls', '');
    return;
  }
  if (g.state === 'done') {
    const win = g.winner === me();
    const mine = role === 'a' ? g.aChoice : g.bChoice;
    const theirs = role === 'a' ? g.bChoice : g.aChoice;
    const both = isRpsChoice(mine) && isRpsChoice(theirs);
    setPart(
      body,
      'rps-stage',
      both
        ? arenaHtml({
            other,
            myTag: RPS_LABEL[mine],
            theirTag: RPS_LABEL[theirs],
            reveal: { me: mine, them: theirs, result: win ? 'win' : 'lose' },
          })
        : arenaHtml({ other, myTag: '', theirTag: '' }),
    );
    if (both) revealSound(`${g.t}-${g.round || 0}`, win);
    const controls = setPart(
      body,
      'rps-controls',
      `<p class="rps-final ${win ? 'win' : ''}${both ? ' delayed' : ''}">${win ? `🏆 Hai vinto ${dindini(g.bet * 2)}!` : `😞 Hai perso ${dindini(g.bet)}.`}</p>` +
        '<button type="button" class="art-btn rps-again" style="background:#e17055">⚔️ Nuova sfida</button>',
    );
    const again = controls.querySelector('.rps-again') as HTMLButtonElement;
    again.onclick = () => {
      lastGame = null;
      renderChallengeList();
    };
    return;
  }
  // playing
  const mineDone = role === 'a' ? !!g.aHash : !!g.bChoice || (!!myPick && !g.aHash);
  const theirsDone = role === 'a' ? !!g.bChoice : !!g.aHash;
  const tie = tieShow && Date.now() < tieShow.until ? tieShow : null;
  if (tie) revealSound(`${g.t}-tie-${g.round || 0}`, null);
  setPart(
    body,
    'rps-stage',
    tie
      ? arenaHtml({
          other,
          myTag: RPS_LABEL[tie.me],
          theirTag: RPS_LABEL[tie.them],
          reveal: { ...tie, result: 'tie' },
        })
      : arenaHtml({
          other,
          myTag: mineDone ? `✅ ${myPick ? RPS_LABEL[myPick] : 'Pronto'}` : '🤔 Scegli…',
          theirTag: theirsDone ? '✅ Ha scelto' : '🤔 Sta scegliendo…',
          ready: { me: mineDone, them: theirsDone },
        }),
  );
  const status =
    (g.round || 0) > 0
      ? `<p class="rps-tie">🤝 Pareggio! Si rigioca (giro ${(g.round || 0) + 1}).</p>`
      : '';
  const controls = setPart(
    body,
    'rps-controls',
    status +
      (mineDone
        ? `<p class="rps-wait">Aspetto la mossa di ${escapeHtmlSafe(other)}…</p>`
        : '<p class="rps-help">Scegli la tua mossa (<b class="rps-left"></b> s):</p><div class="rps-choices">' +
          RPS_CHOICES.map(
            (c) =>
              `<button type="button" data-rps-pick="${c}"><span>${RPS_EMOJI[c]}</span>${RPS_LABEL[c].split(' ')[1]}</button>`,
          ).join('') +
          '</div>'),
  );
  // il conto alla rovescia cambia da solo, senza ridisegnare le carte
  const left = Math.max(0, Math.ceil((RPS_MOVE_MS - (serverNow() - (g.moveT || g.t))) / 1000));
  const leftEl = controls.querySelector('.rps-left');
  if (leftEl) leftEl.textContent = String(left);
  controls.querySelectorAll<HTMLButtonElement>('[data-rps-pick]').forEach((b) => {
    b.onclick = () => void pick(b.dataset.rpsPick as RpsChoice);
  });
}
