// Sala giochi: regole dei minigiochi a due (senza dipendenze dal browser, così sono testabili).
// Ogni partita è un documento condiviso fra i due giocatori: "a" è chi invita, "b" chi accetta.

export type ArcadeGame = 'c4' | 'bn' | 'rx';
export type Side = 'a' | 'b';

export const ARCADE_GAMES: Record<ArcadeGame, { name: string; emoji: string; station: string }> = {
  c4: { name: 'Forza 4', emoji: '🔴', station: 'Tavolo di Forza 4' },
  bn: { name: 'Battaglia navale', emoji: '🚢', station: 'Tavolo di Battaglia navale' },
  rx: { name: 'Riflessi', emoji: '⚡', station: 'Cabinato dei Riflessi' },
};

export const isArcadeGame = (v: unknown): v is ArcadeGame => v === 'c4' || v === 'bn' || v === 'rx';

export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');

/** Un invito vale per questo tempo, poi la partita si annulla. */
export const INVITE_TTL_MS = 60_000;

// ---------------------------------------------------------------- sfida con il link

/**
 * Sfida mandata con un link (a chi non è online): il posto dell'avversario resta vuoto (b = '')
 * finché qualcuno apre il link e lo prende. Vale mezz'ora: c'è tempo di entrare nel gioco, o
 * di crearsi il personaggio. Le regole del database usano la stessa durata.
 */
export const OPEN_INVITE_TTL_MS = 30 * 60_000;
/** Nome del parametro del link: ?sfida=<condominio>~<partita>. */
export const CHALLENGE_PARAM = 'sfida';

export const isOpenSeat = (m: ArcadeMatch): boolean => m.b === '';

/** Il codice della sfida nel link: condominio e partita. */
export function challengeCode(world: string, gid: string): string {
  return `${world}~${gid}`;
}

/** Condominio e partita dal codice del link, o null se non è fatto bene. */
export function parseChallenge(value: unknown): { world: string; gid: string } | null {
  if (typeof value !== 'string') return null;
  const m = /^(CASA-[0-9A-Z]{4})~([a-z0-9_]{6,40})$/.exec(value);
  return m ? { world: m[1], gid: m[2] } : null;
}

/**
 * Chi apre il link prende il posto vuoto e la partita comincia. null se non si può: già presa,
 * annullata, scaduta, o è la propria sfida.
 */
export function claimSeat(
  m: ArcadeMatch,
  me: { id: string; name: string },
  now: number,
  rxStart = 0,
): ArcadeMatch | null {
  if (m.status !== 'wait' || !isOpenSeat(m) || !me.id || m.a === me.id) return null;
  if (now - m.t > OPEN_INVITE_TTL_MS) return null;
  const next: ArcadeMatch = { ...m, b: me.id, nb: me.name.slice(0, 20), status: 'play' };
  if (m.kind === 'rx') next.goAt = now + rxStart;
  return next;
}

// ---------------------------------------------------------------- Forza 4

export const C4_COLS = 7;
export const C4_ROWS = 6;
/** Griglia vuota: una cifra per casella, riga 0 in alto ('0' vuota, '1' = a, '2' = b). */
export const c4Empty = (): string => '0'.repeat(C4_COLS * C4_ROWS);

/** Fa cadere il gettone di `side` nella colonna: nuova griglia, o null se la colonna è piena. */
export function c4Drop(board: string, col: number, side: Side): string | null {
  if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) return null;
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    const i = row * C4_COLS + col;
    if (board[i] === '0')
      return board.slice(0, i) + (side === 'a' ? '1' : '2') + board.slice(i + 1);
  }
  return null;
}

/** Chi ha messo quattro gettoni in fila (orizzontale, verticale o diagonale), oppure null. */
export function c4Winner(board: string): Side | null {
  const at = (r: number, c: number) =>
    r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS ? board[r * C4_COLS + c] : '0';
  for (let r = 0; r < C4_ROWS; r++)
    for (let c = 0; c < C4_COLS; c++) {
      const v = at(r, c);
      if (v === '0') continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ])
        if ([1, 2, 3].every((k) => at(r + dr * k, c + dc * k) === v)) return v === '1' ? 'a' : 'b';
    }
  return null;
}

/** Griglia piena senza vincitori: pareggio. */
export const c4Full = (board: string): boolean => !board.includes('0');

// ---------------------------------------------------------------- Battaglia navale

export const BN_SIZE = 8;
/** Navi: una da 4, due da 3, due da 2 (14 caselle in tutto). */
export const BN_SHIPS = [4, 3, 3, 2, 2] as const;
export const BN_CELLS = BN_SIZE * BN_SIZE;
const BN_TOTAL = BN_SHIPS.reduce((a, b) => a + b, 0);

/**
 * Flotta piazzata a caso: una cifra per casella ('0' mare, '1'-'5' numero della nave).
 * Le navi non si toccano, nemmeno in diagonale. `rnd` serve ai test per avere sempre la stessa.
 */
export function bnRandomFleet(rnd: () => number = Math.random): string {
  for (;;) {
    const grid = new Array<number>(BN_CELLS).fill(0);
    let ok = true;
    BN_SHIPS.forEach((len, s) => {
      if (!ok) return;
      for (let tries = 0; tries < 200; tries++) {
        const horiz = rnd() < 0.5;
        const r = Math.floor(rnd() * (horiz ? BN_SIZE : BN_SIZE - len + 1));
        const c = Math.floor(rnd() * (horiz ? BN_SIZE - len + 1 : BN_SIZE));
        const cells = Array.from({ length: len }, (_, k) =>
          horiz ? r * BN_SIZE + c + k : (r + k) * BN_SIZE + c,
        );
        const free = cells.every((i) => {
          const ir = Math.floor(i / BN_SIZE),
            ic = i % BN_SIZE;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const nr = ir + dr,
                nc = ic + dc;
              if (nr >= 0 && nr < BN_SIZE && nc >= 0 && nc < BN_SIZE && grid[nr * BN_SIZE + nc])
                return false;
            }
          return true;
        });
        if (free) {
          for (const i of cells) grid[i] = s + 1;
          return;
        }
      }
      ok = false;
    });
    if (ok) return grid.join('');
  }
}

export const bnEmptyShots = (): string => '.'.repeat(BN_CELLS);

type ShotResult = 'miss' | 'hit' | 'sunk';

/**
 * Colpo sulla casella `i` della flotta avversaria. `shots`: 'x' colpito, 'o' acqua, '.' non ancora.
 * Restituisce i nuovi colpi e l'esito, o null se la casella era già stata colpita.
 */
export function bnFire(
  fleet: string,
  shots: string,
  i: number,
): { shots: string; result: ShotResult } | null {
  if (!Number.isInteger(i) || i < 0 || i >= BN_CELLS || shots[i] !== '.') return null;
  const ship = fleet[i];
  const hit = ship !== '0';
  const next = shots.slice(0, i) + (hit ? 'x' : 'o') + shots.slice(i + 1);
  if (!hit) return { shots: next, result: 'miss' };
  const sunk = [...fleet].every((v, k) => v !== ship || next[k] === 'x');
  return { shots: next, result: sunk ? 'sunk' : 'hit' };
}

/** Tutte le navi affondate? */
export const bnAllSunk = (shots: string): boolean =>
  [...shots].filter((s) => s === 'x').length >= BN_TOTAL;

// ---------------------------------------------------------------- Riflessi

/** Si vince la sfida arrivando a 3 manche. */
export const RX_TO_WIN = 3;
/** Dopo il "VIA!" si aspetta al massimo questo tempo, poi la manche si chiude. */
export const RX_TIMEOUT_MS = 3000;

/** Ritardo casuale fra "Pronti…" e "VIA!": da 1,5 a 4,5 secondi. */
export const rxDelay = (rnd: () => number = Math.random): number => 1500 + Math.floor(rnd() * 3000);

/**
 * Chi vince la manche. `ta`/`tb`: millisecondi dal "VIA!" al tocco (negativo = partito prima:
 * falsa partenza, perde), undefined = non ha toccato. null = nessuno (manche da rifare).
 */
export function rxRoundWinner(ta: number | undefined, tb: number | undefined): Side | null {
  const early = (t: number | undefined) => t !== undefined && t < 0;
  if (early(ta) && early(tb)) return null;
  if (early(ta)) return 'b';
  if (early(tb)) return 'a';
  if (ta === undefined && tb === undefined) return null;
  if (tb === undefined) return 'a';
  if (ta === undefined) return 'b';
  if (ta === tb) return null;
  return ta < tb ? 'a' : 'b';
}

// ---------------------------------------------------------------- partita condivisa

export interface ArcadeMatch {
  kind: ArcadeGame;
  a: string;
  b: string;
  na: string;
  nb: string;
  /** wait = invito in attesa, play = in corso, done = finita, no = rifiutata, off = annullata. */
  status: 'wait' | 'play' | 'done' | 'no' | 'off';
  t: number;
  turn?: Side;
  winner?: Side | 'draw';
  /** Forza 4 */
  board?: string;
  /** Battaglia navale: flotte, colpi tirati da a (sulla flotta di b) e da b */
  fa?: string;
  fb?: string;
  sa?: string;
  sb?: string;
  /** Riflessi: punti, momento del VIA (ora del server), tempi della manche, numero della manche */
  pa?: number;
  pb?: number;
  goAt?: number;
  ra?: number;
  rb?: number;
  round?: number;
}

/** Nuova partita appena creata da chi invita. */
export function newMatch(
  kind: ArcadeGame,
  a: { id: string; name: string },
  b: { id: string; name: string },
  now: number,
  rnd: () => number = Math.random,
): ArcadeMatch {
  const m: ArcadeMatch = { kind, a: a.id, b: b.id, na: a.name, nb: b.name, status: 'wait', t: now };
  if (kind === 'c4') {
    m.board = c4Empty();
    m.turn = 'a';
  } else if (kind === 'bn') {
    m.fa = bnRandomFleet(rnd);
    m.fb = bnRandomFleet(rnd);
    m.sa = bnEmptyShots();
    m.sb = bnEmptyShots();
    m.turn = 'a';
  } else {
    m.pa = 0;
    m.pb = 0;
    m.round = 0;
  }
  return m;
}

/** Mossa di Forza 4: nuova partita, o null se non è valida. */
export function playC4(m: ArcadeMatch, side: Side, col: number): ArcadeMatch | null {
  if (m.kind !== 'c4' || m.status !== 'play' || m.turn !== side || !m.board) return null;
  const board = c4Drop(m.board, col, side);
  if (!board) return null;
  const win = c4Winner(board);
  const next: ArcadeMatch = { ...m, board, turn: other(side) };
  if (win) Object.assign(next, { status: 'done', winner: win });
  else if (c4Full(board)) Object.assign(next, { status: 'done', winner: 'draw' });
  return next;
}

/** Colpo di Battaglia navale: si alterna sempre il turno. Restituisce anche l'esito. */
export function playBN(
  m: ArcadeMatch,
  side: Side,
  i: number,
): { match: ArcadeMatch; result: ShotResult } | null {
  if (m.kind !== 'bn' || m.status !== 'play' || m.turn !== side) return null;
  const fleet = side === 'a' ? m.fb : m.fa;
  const shots = side === 'a' ? m.sa : m.sb;
  if (!fleet || !shots) return null;
  const shot = bnFire(fleet, shots, i);
  if (!shot) return null;
  const next: ArcadeMatch = {
    ...m,
    [side === 'a' ? 'sa' : 'sb']: shot.shots,
    turn: other(side),
  };
  if (bnAllSunk(shot.shots)) Object.assign(next, { status: 'done', winner: side });
  return { match: next, result: shot.result };
}

/** Chiude la manche dei Riflessi: punto a chi ha vinto, poi si prepara la successiva. */
export function settleRX(m: ArcadeMatch, now: number, delay: number): ArcadeMatch | null {
  if (m.kind !== 'rx' || m.status !== 'play' || m.goAt === undefined) return null;
  const bothIn = m.ra !== undefined && m.rb !== undefined;
  const early = (m.ra ?? 0) < 0 || (m.rb ?? 0) < 0;
  if (!bothIn && !early && now < m.goAt + RX_TIMEOUT_MS) return null; // si aspetta ancora
  const w = rxRoundWinner(m.ra, m.rb);
  const pa = (m.pa || 0) + (w === 'a' ? 1 : 0);
  const pb = (m.pb || 0) + (w === 'b' ? 1 : 0);
  const next: ArcadeMatch = { ...m, pa, pb, round: (m.round || 0) + 1, goAt: now + delay };
  delete next.ra;
  delete next.rb;
  if (pa >= RX_TO_WIN || pb >= RX_TO_WIN) {
    delete next.goAt;
    Object.assign(next, { status: 'done', winner: pa > pb ? 'a' : 'b' });
  }
  return next;
}

/** Legge una partita dal database scartando quelle non valide. */
export function decodeMatch(value: unknown): ArcadeMatch | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as ArcadeMatch;
  if (!isArcadeGame(v.kind) || typeof v.a !== 'string' || typeof v.b !== 'string') return null;
  if (!['wait', 'play', 'done', 'no', 'off'].includes(v.status)) return null;
  if (v.kind === 'c4' && (typeof v.board !== 'string' || v.board.length !== C4_COLS * C4_ROWS))
    return null;
  if (
    v.kind === 'bn' &&
    ![v.fa, v.fb, v.sa, v.sb].every((s) => typeof s === 'string' && s.length === BN_CELLS)
  )
    return null;
  return { ...v, na: String(v.na || 'Giocatore'), nb: String(v.nb || 'Giocatore') };
}
