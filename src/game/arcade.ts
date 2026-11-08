// Sala giochi: dalla postazione di un gioco si sfida un giocatore online, oppure si manda un
// link a chi non c'è; la partita è un documento condiviso (sims_games/<id>) che i due
// aggiornano a turno con delle transazioni.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { browser, lifetime } from './runtime.js';
import { currentWorldCode } from './world-select.js';
import { inviteLink } from './invite-rules.js';
import { worldNodePath } from '../../shared/worlds.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { presenceAlive } from './saves.js';
import { sendSocial } from './social.js';
import { postGossip } from './gossip.js';
import {
  ARCADE_GAMES,
  type ArcadeGame,
  type ArcadeMatch,
  BN_SIZE,
  C4_COLS,
  C4_ROWS,
  CHALLENGE_PARAM,
  INVITE_TTL_MS,
  OPEN_INVITE_TTL_MS,
  RX_TIMEOUT_MS,
  RX_TO_WIN,
  type Side,
  challengeCode,
  claimSeat,
  decodeMatch,
  isArcadeGame,
  isOpenSeat,
  parseChallenge,
  newMatch,
  other,
  playBN,
  playC4,
  rxDelay,
  settleRX,
} from './arcade-rules.js';
import { recordActivity } from './activity.js';
import { worldNode } from './world-db.js';

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
/** La partita: di solito nel condominio in cui si è; quella di un link, nel condominio del link. */
const ref = (gid: string, base = worldNode('games')): GameValue =>
  game.session.db.ref(base + '/' + gid);

/** Partita aperta adesso su questo dispositivo. */
let current: {
  gid: string;
  /** il nodo delle partite del condominio in cui sta la partita */
  base: string;
  side: Side;
  match: ArcadeMatch | null;
  stop: () => void;
  timer: ReturnType<typeof setInterval> | null;
  announced: boolean;
  html: string;
} | null = null;

// ---------------------------------------------------------------- invito

/** Giocatori online (escluso me), in ordine di nome. */
function onlinePlayers(): { id: string; name: string }[] {
  const now = Date.now();
  return Object.entries(game.onlinePlayers || {})
    .filter(
      ([id, op]: [string, GameValue]) =>
        id !== game.session.myPlayerId && !!op?.name && !op.offline && presenceAlive(id, op, now),
    )
    .map(([id, op]: [string, GameValue]) => ({ id, name: String(op.name).slice(0, 20) }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** Dalla postazione: si sceglie chi sfidare tra i giocatori online. */
export async function openArcadeStation(kind: ArcadeGame): Promise<void> {
  if (current) {
    showModal();
    return;
  }
  const g = ARCADE_GAMES[kind];
  const players = onlinePlayers();
  const res = await openDialog({
    title: `${g.emoji} ${g.name}`,
    text:
      `${RULES_TEXT[kind]}\n\n` +
      (players.length
        ? 'Chi vuoi sfidare? Chi è online può accettare da qualsiasi posto del gioco.'
        : 'Al momento non c’è nessun altro giocatore online.') +
      '\n\n📤 Puoi anche mandare un link a un amico che non sta giocando: aprendolo entra nel gioco e la sfida comincia (vale mezz’ora).',
    buttons: [
      ...players
        .slice(0, 10)
        .map((p) => ({ label: `🆚 ${p.name}`, value: p.id, color: '#6c5ce7' })),
      ...(game.session.OFFLINE
        ? []
        : [{ label: '📤 Invita un amico (link)', value: 'share', color: '#2ed573', wide: true }]),
      { label: 'Annulla', value: null, color: '#57606f' },
    ],
  });
  if (res.action === 'share') {
    await shareChallenge(kind);
    return;
  }
  const opp = players.find((p) => p.id === res.action);
  if (opp) await challenge(kind, opp);
}

const RULES_TEXT: Record<ArcadeGame, string> = {
  c4: 'A turno fate cadere un gettone in una colonna: vince chi ne mette 4 in fila (anche in diagonale).',
  bn: 'Le flotte sono già schierate. A turno sparate su una casella del mare dell’avversario: vince chi affonda per primo tutte le navi.',
  rx: `Aspettate il "VIA!" e toccate il pulsante più in fretta che potete. Chi tocca prima del via perde la manche. Vince chi arriva a ${RX_TO_WIN}.`,
};

async function challenge(kind: ArcadeGame, opp: { id: string; name: string }): Promise<void> {
  const now = serverNow();
  const gid = now.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const match = newMatch(
    kind,
    { id: game.session.myPlayerId, name: game.player.myData.nick },
    opp,
    now,
  );
  try {
    await ref(gid).set(match);
    await sendSocial(opp.id, { type: 'gameInvite', game: kind, gid });
  } catch (error) {
    console.warn('[sala giochi]', error);
    toast('Non sono riuscito a mandare la sfida. Riprova quando sei connesso.', 4000);
    return;
  }
  recordActivity('games');
  toast(`🕹️ Hai sfidato ${opp.name} a ${ARCADE_GAMES[kind].name}: aspetta che accetti…`, 4000);
  openMatch(gid, 'a');
  // senza risposta l'invito si annulla
  lifetime.setTimeout(() => {
    void ref(gid).transaction((m: GameValue) =>
      m && m.status === 'wait' ? { ...m, status: 'off' } : undefined,
    );
  }, INVITE_TTL_MS);
}

/** Il link della sfida: porta anche il mio invito, così un amico nuovo riceve il bonus. */
function challengeLink(gid: string): string {
  const url = new URL(inviteLink(game.session.myPlayerId));
  url.searchParams.set(CHALLENGE_PARAM, challengeCode(currentWorldCode(), gid));
  return url.toString();
}

/**
 * Sfida con il link: la partita nasce con il posto dell'avversario vuoto e il primo che apre il
 * link lo prende. Si condivide come gli inviti (app, WhatsApp, copia).
 */
async function shareChallenge(kind: ArcadeGame): Promise<void> {
  const now = serverNow();
  const gid = now.toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const match = newMatch(
    kind,
    { id: game.session.myPlayerId, name: game.player.myData.nick },
    { id: '', name: '' },
    now,
  );
  try {
    await ref(gid).set(match);
  } catch (error) {
    console.warn('[sala giochi]', error);
    toast('Non sono riuscito a preparare la sfida. Riprova quando sei connesso.', 4000);
    return;
  }
  recordActivity('games');
  openMatch(gid, 'a');
  await sendChallengeLink(kind, gid);
  // se nessuno apre il link in tempo la sfida si annulla
  lifetime.setTimeout(() => {
    void ref(gid).transaction((m: GameValue) =>
      m && m.status === 'wait' && m.b === '' ? { ...m, status: 'off' } : undefined,
    );
  }, OPEN_INVITE_TTL_MS);
}

/** Manda il link della sfida con l'app che si preferisce. */
async function sendChallengeLink(kind: ArcadeGame, gid: string): Promise<void> {
  const g = ARCADE_GAMES[kind];
  const link = challengeLink(gid);
  const text = `🕹️ Ti sfido a ${g.name} ${g.emoji} su Casa dolce casa! Apri il link entro mezz’ora e giochiamo:\n${link}`;
  const canShare = typeof navigator.share === 'function';
  const res = await openDialog({
    title: `📤 Sfida un amico a ${g.name}`,
    text: 'Manda il link a chi vuoi: il primo che lo apre gioca con te. Intanto aspetta qui.',
    buttons: [
      ...(canShare
        ? [{ label: '📤 Condividi', value: 'share', color: '#2ed573', wide: true }]
        : []),
      { label: '💬 WhatsApp', value: 'whatsapp', color: '#25d366' },
      { label: '📋 Copia link', value: 'copy', color: '#e67e22' },
      { label: 'Chiudi', value: null, color: '#57606f' },
    ],
  });
  if (res.action === 'share') {
    try {
      await navigator.share({ title: 'Casa dolce casa', text });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  if (res.action === 'whatsapp') {
    browser.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    return;
  }
  if (res.action === 'copy' || res.action === 'share') {
    try {
      await navigator.clipboard.writeText(text);
      toast('📋 Link copiato: incollalo dove vuoi.');
    } catch {
      toast(link, 10000);
    }
  }
}

// ---------------------------------------------------------------- chi apre il link

const CHALLENGE_KEY = 'sims_challenge_from';

/** All'apertura della pagina: la sfida del link si ricorda (l'accesso può ricaricare la pagina). */
export function rememberChallengeFromUrl(): void {
  const raw = new URL(browser.location.href).searchParams.get(CHALLENGE_PARAM);
  if (!parseChallenge(raw)) return;
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify({ code: raw, t: Date.now() }));
  } catch {
    // senza memoria del browser la sfida vale solo se si entra subito
  }
}

/** Usata (o non più valida): via dalla memoria e dall'indirizzo. */
function forgetChallenge(): void {
  try {
    localStorage.removeItem(CHALLENGE_KEY);
  } catch {
    /* niente da togliere */
  }
  const url = new URL(browser.location.href);
  if (!url.searchParams.has(CHALLENGE_PARAM)) return;
  url.searchParams.delete(CHALLENGE_PARAM);
  browser.history.replaceState(browser.history.state, '', url.pathname + url.search + url.hash);
}

/**
 * Entrati nel gioco con il link di una sfida: si chiede se giocare e, accettando, si prende il
 * posto vuoto della partita (nel condominio di chi ha sfidato, anche se si abita altrove).
 */
export async function joinSharedChallenge(): Promise<void> {
  let saved: { code?: string; t?: number } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(CHALLENGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  const ch = parseChallenge(saved?.code);
  if (!ch || game.session.OFFLINE) return;
  if (Date.now() - (saved?.t || 0) > OPEN_INVITE_TTL_MS) {
    forgetChallenge();
    return;
  }
  const base = worldNodePath(ch.world, 'games');
  let m: ArcadeMatch | null = null;
  try {
    m = decodeMatch((await ref(ch.gid, base).get()).val());
  } catch {
    m = null;
  }
  forgetChallenge();
  if (!m || m.a === game.session.myPlayerId) return;
  if (m.status !== 'wait' || !isOpenSeat(m) || serverNow() - m.t > OPEN_INVITE_TTL_MS) {
    toast('🕹️ La sfida del link non è più valida: qualcuno l’ha già presa, o è scaduta.', 5000);
    return;
  }
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1200));
  const g = ARCADE_GAMES[m.kind];
  sfx('gossip');
  const res = await openDialog({
    title: `🕹️ ${g.emoji} ${m.na} ti sfida!`,
    text: `${m.na} ti ha mandato una sfida a ${g.name}.\n\n${RULES_TEXT[m.kind]}`,
    buttons: [
      { label: 'No, grazie', value: null, color: '#57606f' },
      { label: '🎮 Gioca', value: 'yes', color: '#2ed573' },
    ],
  });
  if (res.action !== 'yes') return;
  const me = { id: game.session.myPlayerId, name: game.player.myData.nick || 'Giocatore' };
  let ok = false;
  try {
    const result = await ref(ch.gid, base).transaction((cur: GameValue) => {
      if (cur === null) return null; // copia locale non ancora arrivata: riprova col server
      const match = decodeMatch(cur);
      return (match && claimSeat(match, me, serverNow(), rxDelay() + 1500)) || undefined;
    });
    ok = !!result?.committed && decodeMatch(result.snapshot?.val())?.b === me.id;
  } catch (error) {
    console.warn('[sala giochi]', error);
  }
  if (!ok) {
    toast('🕹️ Troppo tardi: la sfida è già stata presa o è scaduta.', 4500);
    return;
  }
  recordActivity('games');
  if (current) closeMatch();
  openMatch(ch.gid, 'b', base);
}

/** Arriva una sfida (dalla casella dei messaggi tra giocatori). */
export async function onGameInvite(m: GameValue, who: string): Promise<void> {
  if (!isArcadeGame(m.game) || typeof m.gid !== 'string') return;
  if (Date.now() - (Number(m.t) || 0) > INVITE_TTL_MS) return;
  while (game.dialogResolve) await new Promise((r) => lifetime.setTimeout(r, 1200));
  const g = ARCADE_GAMES[m.game as ArcadeGame];
  sfx('gossip');
  const res = await openDialog({
    title: `🕹️ ${g.emoji} Una sfida!`,
    text: `${who} ti sfida a ${g.name} nella sala giochi del centro commerciale!\n\n${RULES_TEXT[m.game as ArcadeGame]}`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: '🎮 Accetta', value: 'yes', color: '#2ed573' },
    ],
  });
  const accept = res.action === 'yes';
  let ok = false;
  try {
    const result = await ref(m.gid).transaction((cur: GameValue) => {
      // Firebase prova prima con la copia locale, vuota se la partita non è mai stata letta:
      // si restituisce null così riprova con il valore del server invece di rinunciare.
      if (cur === null) return null;
      const match = decodeMatch(cur);
      if (!match || match.status !== 'wait' || match.b !== game.session.myPlayerId)
        return undefined;
      if (!accept) return { ...cur, status: 'no' };
      const next: GameValue = { ...cur, status: 'play' };
      if (match.kind === 'rx') next.goAt = serverNow() + rxDelay() + 1500;
      return next;
    });
    ok = !!result?.committed && decodeMatch(result.snapshot?.val())?.status === 'play';
  } catch (error) {
    console.warn('[sala giochi]', error);
  }
  if (!accept) return;
  if (!ok) {
    toast('La sfida non è più valida (forse è scaduta).', 4000);
    return;
  }
  recordActivity('games');
  if (current) closeMatch();
  openMatch(m.gid, 'b');
}

// ---------------------------------------------------------------- partita

function openMatch(gid: string, side: Side, base = worldNode('games')): void {
  if (current) closeMatch();
  const r = ref(gid, base);
  const onValue = (snap: GameValue): void => {
    if (!current || current.gid !== gid) return;
    const before = current.match;
    current.match = decodeMatch(snap.val());
    // l'amico ha aperto il link: si comincia
    if (before && isOpenSeat(before) && current.match?.status === 'play') {
      sfx('success');
      toast(`🎮 ${current.match.nb} ha accettato la sfida!`, 4000);
    }
    render();
  };
  r.on('value', onValue);
  current = {
    gid,
    base,
    side,
    match: null,
    stop: () => r.off?.('value', onValue),
    timer: null,
    announced: false,
    html: '',
  };
  // i Riflessi hanno bisogno di un orologio: "Pronti…" diventa "VIA!" e le manche si chiudono
  current.timer = lifetime.setInterval(() => {
    if (current?.match?.kind === 'rx') {
      render();
      if (current.side === 'a') void hostSettleRX();
    }
  }, 100);
  showModal();
}

function closeMatch(): void {
  if (!current) return;
  current.stop();
  if (current.timer) lifetime.clearInterval(current.timer);
  current = null;
  modal()?.classList.add('hidden');
}

/** Transazione sulla partita: `change` restituisce la nuova partita o null (mossa non valida). */
async function move(change: (m: ArcadeMatch) => ArcadeMatch | null): Promise<boolean> {
  if (!current) return false;
  try {
    const result = await ref(current.gid, current.base).transaction((cur: GameValue) => {
      if (cur === null) return null; // copia locale non ancora arrivata: riprova col server
      const m = decodeMatch(cur);
      return (m && change(m)) || undefined;
    });
    return !!result?.committed && !!decodeMatch(result.snapshot?.val());
  } catch (error) {
    console.warn('[sala giochi]', error);
    return false;
  }
}

let settling = false;
async function hostSettleRX(): Promise<void> {
  const m = current?.match;
  if (settling || !m || m.status !== 'play' || m.goAt === undefined) return;
  const now = serverNow();
  const ready =
    (m.ra !== undefined && m.rb !== undefined) ||
    (m.ra ?? 0) < 0 ||
    (m.rb ?? 0) < 0 ||
    now >= m.goAt + RX_TIMEOUT_MS;
  if (!ready) return;
  settling = true;
  await move((x) => settleRX(x, serverNow(), rxDelay() + 1200));
  settling = false;
}

// ---------------------------------------------------------------- finestra di gioco

function modal(): HTMLElement | null {
  return document.getElementById('arcade-modal');
}

function showModal(): void {
  let el = modal();
  if (!el) {
    el = document.createElement('div');
    el.id = 'arcade-modal';
    el.className = 'fullscreen-modal';
    el.innerHTML = '<div class="card arcade-card"><div class="arcade-body"></div></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  render();
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function render(): void {
  const el = modal();
  const body = el?.querySelector<HTMLElement>('.arcade-body');
  if (!el || !body || !current) return;
  const m = current.match;
  const me = current.side;
  if (!m) {
    body.innerHTML = '<p>Caricamento della partita…</p>';
    current.html = '';
    return;
  }
  const g = ARCADE_GAMES[m.kind];
  const open = isOpenSeat(m);
  const oppName = open ? 'il tuo amico' : esc(me === 'a' ? m.nb : m.na);
  let status = '';
  if (m.status === 'wait' && open)
    status = '📤 Aspetto che il tuo amico apra il link (vale mezz’ora)…';
  else if (m.status === 'wait') status = `⏳ Aspetto che ${oppName} accetti la sfida…`;
  else if (m.status === 'off' && open)
    status = '⌛ Nessuno ha aperto il link in tempo: sfida annullata.';
  else if (m.status === 'no') status = `🙅 ${oppName} ha rifiutato la sfida.`;
  else if (m.status === 'off') status = `⌛ ${oppName} non ha risposto: sfida annullata.`;
  else if (m.status === 'done')
    status =
      m.winner === 'draw'
        ? '🤝 Pareggio!'
        : m.winner === me
          ? '🏆 Hai vinto!'
          : `😵 Ha vinto ${oppName}.`;
  else if (m.kind !== 'rx') status = m.turn === me ? '👉 Tocca a te!' : `⏳ Tocca a ${oppName}…`;
  let board = '';
  if (m.status === 'play' || m.status === 'done') {
    if (m.kind === 'c4') board = renderC4(m, me);
    else if (m.kind === 'bn') board = renderBN(m, me);
    else board = renderRX(m, me);
  }
  const ended = m.status === 'done' || m.status === 'no' || m.status === 'off';
  const html =
    `<h3>${g.emoji} ${g.name}</h3>` +
    `<div class="arcade-vs">${esc(game.player.myData.nick)} 🆚 ${oppName}</div>` +
    `<div class="arcade-status">${status}</div>` +
    board +
    `<div class="arcade-buttons">` +
    (m.status === 'wait' && open && me === 'a'
      ? `<button type="button" class="btn-primary" data-arcade="resend" style="background:#2ed573">📤 Manda di nuovo il link</button>`
      : '') +
    (ended && (m.status === 'done' || me === 'a')
      ? `<button type="button" class="btn-primary" data-arcade="again" style="background:#6c5ce7">🔁 Rivincita</button>`
      : '') +
    `<button type="button" class="btn-primary" data-arcade="close" style="background:#57606f">${ended ? 'Chiudi' : '🏳️ Abbandona'}</button>` +
    `</div>`;
  // si ridisegna solo se cambia qualcosa (i Riflessi controllano 10 volte al secondo)
  if (html !== current.html) {
    current.html = html;
    body.innerHTML = html;
    wire(body, m);
  }
  if (m.status === 'done' && !current.announced) {
    current.announced = true;
    finish(m, me);
  }
}

function renderC4(m: ArcadeMatch, me: Side): string {
  const myTurn = m.status === 'play' && m.turn === me;
  let html = `<div class="c4-grid${myTurn ? ' my-turn' : ''}">`;
  for (let r = 0; r < C4_ROWS; r++)
    for (let c = 0; c < C4_COLS; c++) {
      const v = m.board![r * C4_COLS + c];
      html += `<button type="button" class="c4-cell c4-${v}" data-col="${c}" aria-label="Colonna ${c + 1}"></button>`;
    }
  return (
    html +
    '</div><div class="arcade-legend"><span class="c4-dot c4-1"></span> ' +
    esc(m.na) +
    ' &nbsp; <span class="c4-dot c4-2"></span> ' +
    esc(m.nb) +
    '</div>'
  );
}

function renderBN(m: ArcadeMatch, me: Side): string {
  const myFleet = me === 'a' ? m.fa! : m.fb!;
  const theirShots = me === 'a' ? m.sb! : m.sa!; // colpi dell'avversario sul mio mare
  const myShots = me === 'a' ? m.sa! : m.sb!;
  const grid = (cells: (i: number) => string, clickable: boolean) => {
    let h = `<div class="bn-grid${clickable ? ' my-turn' : ''}">`;
    for (let i = 0; i < BN_SIZE * BN_SIZE; i++) h += cells(i);
    return h + '</div>';
  };
  const myTurn = m.status === 'play' && m.turn === me;
  const target = grid((i) => {
    const s = myShots[i];
    const cls = s === 'x' ? 'bn-hit' : s === 'o' ? 'bn-miss' : 'bn-sea';
    return `<button type="button" class="bn-cell ${cls}" data-cell="${i}">${s === 'x' ? '💥' : s === 'o' ? '•' : ''}</button>`;
  }, myTurn);
  const mine = grid((i) => {
    const ship = myFleet[i] !== '0',
      s = theirShots[i];
    const cls = s === 'x' ? 'bn-hit' : s === 'o' ? 'bn-miss' : ship ? 'bn-ship' : 'bn-sea';
    return `<div class="bn-cell ${cls}">${s === 'x' ? '🔥' : s === 'o' ? '•' : ''}</div>`;
  }, false);
  const oppName = esc(me === 'a' ? m.nb : m.na);
  return (
    `<div class="bn-wrap"><div><div class="bn-title">🎯 Mare di ${oppName}</div>${target}</div>` +
    `<div><div class="bn-title">🚢 Il tuo mare</div>${mine}</div></div>`
  );
}

function renderRX(m: ArcadeMatch, me: Side): string {
  const myPts = (me === 'a' ? m.pa : m.pb) || 0,
    theirPts = (me === 'a' ? m.pb : m.pa) || 0;
  const score = `<div class="rx-score">Tu ${myPts} – ${theirPts} · si vince a ${RX_TO_WIN}</div>`;
  if (m.status !== 'play' || m.goAt === undefined) return score;
  const mine = me === 'a' ? m.ra : m.rb;
  const now = serverNow();
  let label: string, cls: string;
  if (mine !== undefined)
    [label, cls] = mine < 0 ? ['😬 Troppo presto!', 'rx-early'] : [`⏱️ ${mine} ms`, 'rx-done'];
  else if (now < m.goAt) [label, cls] = ['Pronti… aspetta il VIA', 'rx-wait'];
  else [label, cls] = ['⚡ VIA! TOCCA!', 'rx-go'];
  return score + `<button type="button" class="rx-pad ${cls}" data-rx="1">${label}</button>`;
}

function wire(body: HTMLElement, m: ArcadeMatch): void {
  const me = current!.side;
  body.querySelectorAll<HTMLElement>('[data-col]').forEach((b) =>
    b.addEventListener('click', () => {
      const col = Number(b.dataset.col);
      void move((x) => playC4(x, me, col)).then((ok) => ok && sfx('click'));
    }),
  );
  body.querySelectorAll<HTMLElement>('button[data-cell]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.cell);
      let result = '';
      void move((x) => {
        const r = playBN(x, me, i);
        result = r?.result || '';
        return r?.match || null;
      }).then((ok) => {
        if (!ok) return;
        if (result === 'sunk') {
          sfx('theft');
          toast('💥 Affondata!', 1800);
        } else if (result === 'hit') {
          sfx('coin');
          toast('🔥 Colpito!', 1500);
        } else sfx('click');
      });
    }),
  );
  body.querySelector<HTMLElement>('[data-rx]')?.addEventListener('pointerdown', () => {
    const goAt = m.goAt;
    if (goAt === undefined) return;
    const ms = Math.round(serverNow() - goAt);
    const key = me === 'a' ? 'ra' : 'rb';
    void move((x) =>
      x.status === 'play' && x.goAt === goAt && x[key] === undefined ? { ...x, [key]: ms } : null,
    ).then((ok) => ok && sfx(ms < 0 ? 'error' : 'click'));
  });
  body.querySelector<HTMLElement>('[data-arcade="close"]')?.addEventListener('click', () => {
    const live = current?.match;
    if (live && (live.status === 'play' || live.status === 'wait')) {
      // abbandonare una partita in corso la fa vincere all'altro
      void move((x) =>
        x.status === 'play'
          ? { ...x, status: 'done', winner: other(me) }
          : x.status === 'wait'
            ? { ...x, status: 'off' }
            : null,
      );
    }
    closeMatch();
  });
  body.querySelector<HTMLElement>('[data-arcade="again"]')?.addEventListener('click', () => {
    const opp = me === 'a' ? { id: m.b, name: m.nb } : { id: m.a, name: m.na };
    const kind = m.kind;
    closeMatch();
    // con il link non preso non c'è un avversario: si manda un link nuovo
    void (opp.id ? challenge(kind, opp) : shareChallenge(kind));
  });
  body.querySelector<HTMLElement>('[data-arcade="resend"]')?.addEventListener('click', () => {
    if (current) void sendChallengeLink(m.kind, current.gid);
  });
}

/** Fine partita: suono e, per chi vince, il pettegolezzo. */
function finish(m: ArcadeMatch, me: Side): void {
  if (m.winner === me) {
    sfx('levelUp');
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 5);
    const loser = me === 'a' ? m.nb : m.na;
    postGossip(
      `${game.player.myData.nick} ha battuto ${loser} a ${ARCADE_GAMES[m.kind].name} 🕹️`,
      [me === 'a' ? m.b : m.a],
      10 * 60_000,
    );
  } else if (m.winner === 'draw') sfx('success');
  else sfx('error');
}
