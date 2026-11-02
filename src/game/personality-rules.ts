// Personalità che il personaggio sviluppa giocando (senza dipendenze dal browser, così è testabile).

export type PersonalityId = 'artist' | 'business' | 'criminal' | 'romantic';

/**
 * Punti dopo i quali compare il messaggio della personalità. Ogni personalità può guadagnare al
 * massimo PERSONALITY_DAILY_MAX punti al giorno, quindi servono almeno 7 giorni di gioco dedicato
 * (di solito qualche settimana), uguali per tutte e quattro.
 */
export const PERSONALITY_THRESHOLD = 70;
export const PERSONALITY_DAILY_MAX = 10;

export const PERSONALITIES: Record<PersonalityId, { name: string; message: string }> = {
  artist: { name: 'Artista', message: 'Stai diventando un Artista!' },
  business: { name: 'Imprenditore', message: 'Stai diventando un Imprenditore!' },
  criminal: { name: 'Criminale', message: 'Stai diventando un Criminale!' },
  romantic: { name: 'Romanticone', message: 'Stai diventando un Romanticone!' },
};

/**
 * Azioni che fanno crescere una personalità: a chi vanno i punti, quanti e quante volte al giorno.
 * Per arrivare a 10 punti in un giorno servono azioni diverse; lavorare da solo ne dà al massimo 4,
 * perché quasi tutti vanno al lavoro.
 */
export const PERSONALITY_ACTIONS = {
  paint: { to: 'artist', points: 4, perDay: 2 },
  sellPainting: { to: 'artist', points: 2, perDay: 2 },
  workShift: { to: 'business', points: 1, perDay: 4 },
  invest: { to: 'business', points: 2, perDay: 2 },
  buyPainting: { to: 'business', points: 3, perDay: 2 },
  theftAttempt: { to: 'criminal', points: 3, perDay: 2 },
  theftSuccess: { to: 'criminal', points: 4, perDay: 1 },
  punch: { to: 'criminal', points: 1, perDay: 3 },
  insult: { to: 'criminal', points: 1, perDay: 3 },
  enterOtherRoom: { to: 'criminal', points: 1, perDay: 3 },
  compliment: { to: 'romantic', points: 1, perDay: 4 },
  talk: { to: 'romantic', points: 1, perDay: 3 },
  kissAttempt: { to: 'romantic', points: 2, perDay: 2 },
  kissAccepted: { to: 'romantic', points: 3, perDay: 1 },
  giveFood: { to: 'romantic', points: 2, perDay: 2 },
} as const satisfies Record<string, { to: PersonalityId; points: number; perDay: number }>;

export type PersonalityAction = keyof typeof PERSONALITY_ACTIONS;

export interface PersonalityState {
  /** Punti di ogni personalità. */
  points: Partial<Record<PersonalityId, number>>;
  /** Personalità per cui il messaggio è già stato mostrato. */
  announced: Partial<Record<PersonalityId, boolean>>;
  /** Giorno (AAAA-MM-GG) a cui si riferiscono i conteggi giornalieri. */
  day: string;
  /** Quante volte ogni azione ha già dato punti oggi. */
  today: Partial<Record<PersonalityAction, number>>;
  /** Punti già guadagnati oggi da ogni personalità (al massimo PERSONALITY_DAILY_MAX). */
  todayPoints: Partial<Record<PersonalityId, number>>;
}

export const emptyPersonality = (): PersonalityState => ({
  points: {},
  announced: {},
  day: '',
  today: {},
  todayPoints: {},
});

const dayKey = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/**
 * Registra un'azione. Restituisce la personalità che ha appena superato la soglia
 * (per mostrare il messaggio una sola volta), altrimenti null.
 */
export function addPersonalityPoints(
  state: PersonalityState,
  action: PersonalityAction,
  now: Date,
): PersonalityId | null {
  const rule = PERSONALITY_ACTIONS[action];
  const day = dayKey(now);
  if (state.day !== day) {
    state.day = day;
    state.today = {};
    state.todayPoints = {};
  }
  const used = state.today[action] || 0;
  if (used >= rule.perDay) return null; // tetto giornaliero: niente punti ripetendo sempre la stessa azione
  const gainedToday = state.todayPoints[rule.to] || 0;
  const gain = Math.min(rule.points, PERSONALITY_DAILY_MAX - gainedToday);
  if (gain <= 0) return null; // la personalità ha già preso il massimo di oggi
  state.today[action] = used + 1;
  state.todayPoints[rule.to] = gainedToday + gain;
  const total = (state.points[rule.to] || 0) + gain;
  state.points[rule.to] = total;
  if (total >= PERSONALITY_THRESHOLD && !state.announced[rule.to]) {
    state.announced[rule.to] = true;
    return rule.to;
  }
  return null;
}

const IDS = Object.keys(PERSONALITIES) as PersonalityId[];

/** Legge lo stato dal salvataggio scartando i valori non validi. */
export function decodePersonality(value: unknown): PersonalityState {
  const state = emptyPersonality();
  if (!value || typeof value !== 'object') return state;
  const v = value as Record<string, unknown>;
  const points = (v.points || {}) as Record<string, unknown>;
  const announced = (v.announced || {}) as Record<string, unknown>;
  for (const id of IDS) {
    const p = points[id];
    if (Number.isFinite(p) && (p as number) >= 0) state.points[id] = Math.min(1e6, p as number);
    if (announced[id] === true) state.announced[id] = true;
  }
  if (typeof v.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.day)) state.day = v.day;
  const today = (v.today || {}) as Record<string, unknown>;
  for (const action of Object.keys(PERSONALITY_ACTIONS) as PersonalityAction[]) {
    const n = today[action];
    if (Number.isSafeInteger(n) && (n as number) >= 0) state.today[action] = n as number;
  }
  const todayPoints = (v.todayPoints || {}) as Record<string, unknown>;
  for (const id of IDS) {
    const n = todayPoints[id];
    if (Number.isFinite(n) && (n as number) >= 0)
      state.todayPoints[id] = Math.min(PERSONALITY_DAILY_MAX, n as number);
  }
  return state;
}

/** Pensieri prima di dormire: suggeriscono che personalità si sta diventando. */
export const BEDTIME_THOUGHTS: Record<PersonalityId, string[]> = {
  artist: [
    'Ho fatto proprio un bel quadro oggi',
    'Sogno colori e pennelli…',
    'Domani voglio dipingere ancora!',
  ],
  business: [
    'Ho lavorato molto oggi…',
    'Domani investo ancora un po',
    'Gli affari vanno sempre meglio!',
  ],
  criminal: [
    'Oggi nessuno mi ha visto…',
    'Chissà quanti soldi ci sono in quella cassaforte…',
    'Domani faccio un altro colpo',
  ],
  romantic: [
    'Che bello parlare con gli altri oggi',
    'Penso a qualcuno di speciale…',
    'Domani farò ancora tanti complimenti',
  ],
};

/** La personalità più sviluppata (almeno qualche punto), oppure null se non ce n'è ancora una. */
export function leadingPersonality(state: PersonalityState, minPoints = 3): PersonalityId | null {
  let best: PersonalityId | null = null;
  for (const id of IDS)
    if (
      (state.points[id] || 0) >= minPoints &&
      (!best || (state.points[id] || 0) > (state.points[best] || 0))
    )
      best = id;
  return best;
}
