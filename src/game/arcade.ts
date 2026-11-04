// Sala giochi: dalla postazione di un gioco si sfida un giocatore online; la partita è un
// documento condiviso (sims_games/<id>) che i due aggiornano a turno con delle transazioni.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime } from './runtime.js';
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
  INVITE_TTL_MS,
  RX_TIMEOUT_MS,
  RX_TO_WIN,
  type Side,
  decodeMatch,
  isArcadeGame,
  newMatch,
  other,
  playBN,
  playC4,
  rxDelay,
  settleRX,
} from './arcade-rules.js';
import { recordActivity } from './activity.js';

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);
const ref = (gid: string): GameValue => game.session.db.ref('sims_games/' + gid);

/** Partita aperta adesso su questo dispositivo. */
let current: {
  gid: string;
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
  if (!players.length) {
    await openDialog({
      title: `${g.emoji} ${g.name}`,
      text: 'Al momento non c’è nessun altro giocatore online da sfidare. Riprova più tardi!',
      buttons: [{ label: 'Ok', value: null, color: '#57606f' }],
    });
    return;
  }
  const res = await openDialog({
    title: `${g.emoji} ${g.name}`,
    text: `${RULES_TEXT[kind]}\n\nChi vuoi sfidare? Può accettare da qualsiasi posto del gioco.`,
    buttons: [
      ...players
        .slice(0, 11)
        .map((p) => ({ label: `🆚 ${p.name}`, value: p.id, color: '#6c5ce7' })),
      { label: 'Annulla', value: null, color: '#57606f' },
    ],
  });
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

function openMatch(gid: string, side: Side): void {
  if (current) closeMatch();
  const r = ref(gid);
  const onValue = (snap: GameValue): void => {
    if (!current || current.gid !== gid) return;
    current.match = decodeMatch(snap.val());
    render();
  };
  r.on('value', onValue);
  current = {
    gid,
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
    const result = await ref(current.gid).transaction((cur: GameValue) => {
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
  const oppName = esc(me === 'a' ? m.nb : m.na);
  let status = '';
  if (m.status === 'wait') status = `⏳ Aspetto che ${oppName} accetti la sfida…`;
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
    void challenge(kind, opp);
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
