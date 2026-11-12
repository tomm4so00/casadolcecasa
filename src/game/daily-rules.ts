// Le missioni del giorno (fase 4 del piano dei primi minuti), senza browser: le usa anche il server
// per la notifica delle 10. Ogni giorno (ora di Roma) tre missioni uguali per tutti, una per tipo:
// casa e lavoro, vicini, città e svago. Si contano dai totali del giocatore (stats) rispetto a
// quelli di inizio giornata, più i posti visitati oggi. Chi le finisce tutte più giorni di fila
// prende un premio che cresce; al 7° giorno di fila la medaglia «Settimana perfetta».

export type DailyKind = 'casa' | 'vicini' | 'citta';

export interface DailyMission {
  id: string;
  kind: DailyKind;
  title: string;
  /** L'istruzione, con tra «…» il pulsante da toccare (guide-pointer.ts). */
  hint: string;
  reward: number;
  /** Quanto deve crescere oggi un totale del giocatore (stats)… */
  stat?: string;
  need?: number;
  /** …oppure il posto da visitare oggi. */
  visit?: string;
  /** Dove porta la freccia. */
  env?: string;
  /**
   * Esce solo il giorno dopo questa missione (e mai negli altri giorni): l'offerta all'asta segue
   * il giorno in cui tutti hanno messo un quadro all'asta, così i quadri da comprare ci sono.
   */
  after?: string;
}

/** «Fai visita a un vicino»: si segna entrando nella stanza di un altro. */
export const NEIGHBOUR_VISIT = 'stanza_vicino';

export const DAILY_MISSIONS: DailyMission[] = [
  // ---- casa e lavoro
  {
    id: 'turno',
    kind: 'casa',
    title: '💼 Un turno di lavoro',
    hint: '💼 Dall’uscita del condominio scegli «Lavoro» e fai un turno.',
    reward: 25,
    stat: 'shifts',
    need: 1,
  },
  {
    id: 'due_turni',
    kind: 'casa',
    title: '💼 Due turni di lavoro',
    hint: '💼 Fai due turni di lavoro oggi: dall’uscita del condominio scegli «Lavoro».',
    reward: 40,
    stat: 'shifts',
    need: 2,
  },
  {
    id: 'paga',
    kind: 'casa',
    title: '💰 Guadagna 50 Đ lavorando',
    hint: '💰 Lavora finché la paga di oggi arriva a 50 Đ: dall’uscita del condominio scegli «Lavoro».',
    reward: 30,
    stat: 'workPay',
    need: 50,
  },
  {
    id: 'pasti',
    kind: 'casa',
    title: '🍝 Due pasti',
    hint: '🍝 Mangia due volte oggi: in cucina prendi il cibo dal frigo e cucinalo ai fornelli.',
    reward: 15,
    stat: 'meals',
    need: 2,
    env: 'KITCHEN',
  },
  {
    id: 'doccia',
    kind: 'casa',
    title: '🚿 Una doccia',
    hint: '🚿 Nel bagno del tuo appartamento fatti una doccia.',
    reward: 10,
    stat: 'showers',
    need: 1,
    env: 'BATHROOM',
  },
  {
    id: 'relax',
    kind: 'casa',
    title: '🛋️ Due pause',
    hint: '🛋️ Rilassati due volte sul divano o davanti alla TV.',
    reward: 15,
    stat: 'relax',
    need: 2,
  },
  {
    id: 'look',
    kind: 'casa',
    title: '👕 Un look nuovo',
    hint: '👕 Apri l’armadio della tua stanza e indossa un capo diverso.',
    reward: 10,
    stat: 'outfits',
    need: 1,
  },
  {
    id: 'deposito',
    kind: 'casa',
    title: '🏦 Un deposito',
    hint: '🏦 Dall’uscita del condominio scegli «Banca» e deposita qualcosa sul conto.',
    reward: 20,
    stat: 'deposits',
    need: 1,
    env: 'banca',
  },
  {
    id: 'borsa',
    kind: 'casa',
    title: '📈 In borsa',
    hint: '📈 Compra o vendi un’azione: in banca o dal PC della tua stanza.',
    reward: 20,
    stat: 'trades',
    need: 1,
    env: 'banca',
  },
  // ---- vicini
  {
    id: 'complimenti',
    kind: 'vicini',
    title: '😍 Due complimenti',
    hint: '😍 Fai un complimento a due vicini: avvicinati, tocca il nome e scegli «Complimenti».',
    reward: 25,
    stat: 'praises',
    need: 2,
  },
  {
    id: 'chat',
    kind: 'vicini',
    title: '💬 Tre messaggi',
    hint: '💬 Scrivi tre messaggi nella chat del condominio.',
    reward: 15,
    stat: 'chats',
    need: 3,
  },
  {
    id: 'piatto',
    kind: 'vicini',
    title: '🍲 Un piatto per un vicino',
    hint: '🍲 Cucina un piatto e regalalo a un vicino dallo zaino («Regala»).',
    reward: 30,
    stat: 'tastes',
    need: 1,
  },
  {
    id: 'chiacchiere',
    kind: 'vicini',
    title: '🗣️ Quattro chiacchiere',
    hint: '🗣️ Avvicinati a un vicino, tocca il nome e scegli «Dialoga».',
    reward: 15,
    stat: 'talks',
    need: 1,
  },
  {
    id: 'pettegolezzi',
    kind: 'vicini',
    title: '🗞️ I pettegolezzi',
    hint: '🗞️ In cortile leggi la bacheca dei pettegolezzi.',
    reward: 10,
    stat: 'gossipRead',
    need: 1,
    env: 'CORTILE',
  },
  {
    id: 'razzo',
    kind: 'vicini',
    title: '🚀 Una quota per il razzo',
    hint: '🚀 Dall’uscita del condominio scegli «Laboratorio Ingegneristico» e versa una quota.',
    reward: 25,
    stat: 'rocketGifts',
    need: 1,
    env: 'ingegneria',
  },
  {
    id: 'visita',
    kind: 'vicini',
    title: '🚪 A casa di un vicino',
    hint: '🚪 Bussa alla porta di un vicino nel salone ed entra nella sua stanza.',
    reward: 20,
    visit: NEIGHBOUR_VISIT,
    env: 'SALOON',
  },
  // ---- città e svago
  {
    id: 'bar',
    kind: 'citta',
    title: '🍹 Al bar',
    hint: '🍹 Dall’uscita del condominio apri «Attività ricreative» e vai al bar.',
    reward: 20,
    visit: 'bar',
    env: 'bar',
  },
  {
    id: 'passeggiata',
    kind: 'citta',
    title: '🚶 Una passeggiata',
    hint: '🚶 Dall’uscita del condominio apri «Attività ricreative» e fai una passeggiata.',
    reward: 15,
    visit: 'passeggiata',
    env: 'passeggiata',
  },
  {
    id: 'discoteca',
    kind: 'citta',
    title: '🕺 In discoteca',
    hint: '🕺 Dall’uscita del condominio apri «Attività ricreative» e vai in discoteca.',
    reward: 25,
    visit: 'discoteca',
    env: 'discoteca',
  },
  {
    id: 'centro',
    kind: 'citta',
    title: '🏬 Un giro per negozi',
    hint: '🏬 Dall’uscita del condominio scegli «Centro Commerciale».',
    reward: 15,
    visit: 'centro_commerciale',
    env: 'centro_commerciale',
  },
  {
    id: 'quadro',
    kind: 'citta',
    title: '🎨 Un quadro',
    hint: '🎨 Dall’uscita del condominio scegli «Laboratorio Artistico» e dipingi un quadro.',
    reward: 30,
    stat: 'paintings',
    need: 1,
    env: 'laboratorio',
  },
  {
    id: 'asta_metti',
    kind: 'citta',
    title: '🔨 Un quadro all’asta',
    hint: '🔨 Metti all’asta un tuo quadro: dipingine uno al Laboratorio Artistico, oppure da quadrivendo.it (sul PC) apri «I miei quadri» e scegli uno di quelli appesi in casa. Domani toccherà a tutti fare offerte!',
    reward: 30,
    stat: 'auctionsStarted',
    need: 1,
    env: 'laboratorio',
  },
  {
    id: 'asta_offri',
    kind: 'citta',
    title: '🖼️ Un’offerta all’asta',
    hint: '🖼️ Fai un’offerta per un quadro all’asta: su quadrivendo.it dal PC o nel catalogo della Galleria d’Arte.',
    reward: 30,
    stat: 'auctionBids',
    need: 1,
    env: 'laboratorio',
    after: 'asta_metti',
  },
  {
    id: 'slot',
    kind: 'citta',
    title: '🎰 Tre giri di slot',
    hint: '🎰 Al centro commerciale entra nella sala scommesse e fai tre giri alla slot.',
    reward: 15,
    stat: 'slotSpins',
    need: 3,
    env: 'scommesse',
  },
  {
    id: 'console',
    kind: 'citta',
    title: '🕹️ Una partita alla console',
    hint: '🕹️ Al centro commerciale entra nella sala giochi e fai una partita alla console.',
    reward: 15,
    stat: 'consoleGames',
    need: 1,
    env: 'sala_giochi',
  },
  {
    id: 'roulette',
    kind: 'citta',
    title: '🎡 Una puntata alla roulette',
    hint: '🎡 Al centro commerciale entra nella sala scommesse e punta alla roulette.',
    reward: 20,
    stat: 'rouletteBets',
    need: 1,
    env: 'scommesse',
  },
];

/** I posti che le missioni del giorno fanno visitare: si segnano quando ci si entra. */
export const DAILY_PLACES = [
  ...new Set(
    DAILY_MISSIONS.flatMap((m) => (m.visit && m.visit !== NEIGHBOUR_VISIT ? [m.visit] : [])),
  ),
];

/** I totali da fotografare a inizio giornata. */
export const DAILY_STATS = [...new Set(DAILY_MISSIONS.flatMap((m) => (m.stat ? [m.stat] : [])))];

/** Un numero dal testo (FNV-1a): lo stesso giorno dà la stessa scelta a tutti, anche al server. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Il giorno prima ("2026-11-12" → "2026-11-11"). */
export function dayBefore(day: string): string {
  const t = Date.parse(day + 'T12:00:00Z');
  return Number.isFinite(t) ? new Date(t - 86_400_000).toISOString().slice(0, 10) : '';
}

const KINDS: DailyKind[] = ['casa', 'vicini', 'citta'];

/** Il numero del giorno da una data fissa ("2026-11-12" → giorni dal 1970). */
const dayNumber = (day: string): number => Math.floor(Date.parse(day + 'T12:00:00Z') / 86_400_000);

/** Un giro mescolato delle missioni di un tipo: lo stesso giro dà lo stesso ordine a tutti. */
function shuffled(n: number, seed: number): number[] {
  const order = [...Array(n).keys()];
  let x = seed || 1;
  for (let i = n - 1; i > 0; i--) {
    // xorshift: abbastanza per mescolare, uguale su ogni dispositivo e sul server
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * L'ordine del giro `round`: se comincia con l'ultima del giro prima, le prime due si scambiano
 * (tocca solo i primi due posti, quindi l'ultima di un giro non cambia mai).
 */
function roundOrder(n: number, kind: DailyKind, round: number): number[] {
  const order = shuffled(n, hash(kind + ':' + round));
  const last = shuffled(n, hash(kind + ':' + (round - 1)))[n - 1];
  if (order[0] === last) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/**
 * Le tre missioni del giorno, una per tipo. Ogni tipo passa tutte le sue missioni in un ordine
 * mescolato prima di ricominciare, e due giorni di fila non danno mai la stessa.
 */
export function dailyPick(day: string): DailyMission[] {
  const n = dayNumber(day);
  return KINDS.map((kind) => {
    const yesterday = inRotation(kind, n - 1);
    // il giorno dopo una missione che ne chiama un'altra (l'asta), esce quella
    const next = DAILY_MISSIONS.find((m) => m.kind === kind && m.after === yesterday.id);
    return next ?? inRotation(kind, n);
  });
}

/**
 * La missione del giro per il giorno `n`, fra quelle che non aspettano un'altra. Due giorni di fila
 * non danno mai la stessa, quindi il giorno dopo una «chiamata» non lo è mai a sua volta.
 */
function inRotation(kind: DailyKind, n: number): DailyMission {
  const list = DAILY_MISSIONS.filter((m) => m.kind === kind && !m.after);
  const round = Math.floor(n / list.length);
  return list[roundOrder(list.length, kind, round)[n - round * list.length]];
}

/** Il premio per averle finite tutte: 20 Đ il primo giorno, +10 per ogni giorno di fila fino al 7°. */
export const streakBonus = (streak: number): number =>
  20 + 10 * (Math.min(Math.max(streak, 1), 7) - 1);
export const WEEK_MEDAL = 'medaglia_settimana';
export const WEEK_DAYS = 7;

/** Lo stato salvato. */
export interface DailyState {
  day: string;
  /** I totali di inizio giornata. */
  base: Record<string, number>;
  /** I posti visitati oggi. */
  seen: Record<string, boolean>;
  /** Le missioni di oggi già premiate. */
  done: Record<string, boolean>;
  /** Premio delle tre già dato oggi. */
  full?: boolean;
  /** Giorni di fila con tutte e tre, e l'ultimo. */
  streak: number;
  lastFull?: string;
  /** La medaglia della settimana perfetta, guadagnata una volta per sempre. */
  week?: boolean;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function decodeDaily(value: unknown): DailyState | undefined {
  if (!record(value) || typeof value.day !== 'string' || !DAY.test(value.day)) return undefined;
  const nums: Record<string, number> = {};
  if (record(value.base))
    for (const k of DAILY_STATS)
      if (Number.isFinite(value.base[k])) nums[k] = value.base[k] as number;
  const flags = (v: unknown, keys: string[]): Record<string, boolean> => {
    const out: Record<string, boolean> = {};
    if (record(v)) for (const k of keys) if (v[k] === true) out[k] = true;
    return out;
  };
  return {
    day: value.day,
    base: nums,
    seen: flags(value.seen, [...DAILY_PLACES, NEIGHBOUR_VISIT]),
    done: flags(
      value.done,
      DAILY_MISSIONS.map((m) => m.id),
    ),
    ...(value.full === true ? { full: true } : {}),
    streak: Number.isSafeInteger(value.streak) ? Math.max(0, value.streak as number) : 0,
    ...(typeof value.lastFull === 'string' && DAY.test(value.lastFull)
      ? { lastFull: value.lastFull }
      : {}),
    ...(value.week === true ? { week: true } : {}),
  };
}

/** Lo stato del giorno `day`: se è cambiato giorno si riparte dai totali di adesso. */
export function dailyFor(
  s: DailyState | undefined,
  day: string,
  stats: Record<string, number>,
): DailyState {
  if (s && s.day === day) return s;
  const base: Record<string, number> = {};
  for (const k of DAILY_STATS) base[k] = stats[k] || 0;
  return {
    day,
    base,
    seen: {},
    done: {},
    streak: s?.streak ?? 0,
    ...(s?.lastFull ? { lastFull: s.lastFull } : {}),
    ...(s?.week ? { week: true } : {}),
  };
}

/** Quanto manca: fatto/obiettivo di una missione di oggi. */
export function dailyProgress(
  s: DailyState,
  m: DailyMission,
  stats: Record<string, number>,
): { have: number; need: number } {
  if (m.visit) return { have: s.seen[m.visit] ? 1 : 0, need: 1 };
  const need = m.need ?? 1;
  return {
    have: Math.min(need, Math.max(0, (stats[m.stat!] || 0) - (s.base[m.stat!] || 0))),
    need,
  };
}

export interface DailyReward {
  id: string;
  title: string;
  reward: number;
  /** Il premio per averle finite tutte (con i giorni di fila). */
  streak?: number;
  medal?: string;
}

/** Premia le missioni di oggi fatte e, finite tutte, il premio della serie. */
export function advanceDaily(
  s: DailyState,
  stats: Record<string, number>,
): { state: DailyState; rewards: DailyReward[] } {
  const state: DailyState = { ...s, done: { ...s.done } };
  const rewards: DailyReward[] = [];
  const today = dailyPick(s.day);
  for (const m of today) {
    if (state.done[m.id]) continue;
    const p = dailyProgress(s, m, stats);
    if (p.have < p.need) continue;
    state.done[m.id] = true;
    rewards.push({ id: m.id, title: m.title, reward: m.reward });
  }
  if (!state.full && today.every((m) => state.done[m.id])) {
    state.full = true;
    state.streak = state.lastFull === dayBefore(s.day) ? state.streak + 1 : 1;
    state.lastFull = s.day;
    const medal = state.streak >= WEEK_DAYS && !state.week;
    if (medal) state.week = true;
    rewards.push({
      id: 'serie',
      title: '🌅 Missioni di oggi',
      reward: streakBonus(state.streak),
      streak: state.streak,
      ...(medal ? { medal: WEEK_MEDAL } : {}),
    });
  }
  return { state, rewards };
}

/** Giorni di fila ancora validi (la serie si interrompe se ieri non le ha finite). */
export const liveStreak = (s: DailyState): number =>
  s.lastFull === s.day || s.lastFull === dayBefore(s.day) ? s.streak : 0;

/** Il testo della notifica delle 10. */
export function dailyPush(day: string): { title: string; body: string } {
  return {
    title: '🌅 Le missioni di oggi',
    body:
      dailyPick(day)
        .map((m) => m.title)
        .join(' · ') + ' — premi in Dindini, e di più se le fai tutte.',
  };
}
