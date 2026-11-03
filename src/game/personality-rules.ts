// Personalità che il personaggio sviluppa giocando (senza dipendenze dal browser, così è testabile).

export type PersonalityId = 'artist' | 'business' | 'criminal' | 'romantic';

/**
 * Come si diventa una personalità: ogni giorno le azioni danno punti (al massimo
 * PERSONALITY_DAILY_MAX per personalità). A fine giornata quella con più punti è la "prevalente"
 * e guadagna 1 punto prevalenza (a pari merito nessuna). Con PREVAIL_TO_BECOME punti prevalenza
 * il personaggio diventa quella personalità, per sempre: se ne può avere una sola.
 */
export const PERSONALITY_DAILY_MAX = 10;
export const PREVAIL_TO_BECOME = 5;

export const PERSONALITIES: Record<PersonalityId, { name: string; message: string }> = {
  artist: { name: 'Artista', message: 'Sei diventato un Artista!' },
  business: { name: 'Imprenditore', message: 'Sei diventato un Imprenditore!' },
  criminal: { name: 'Criminale', message: 'Sei diventato un Criminale!' },
  romantic: { name: 'Romanticone', message: 'Sei diventato un Romanticone!' },
};

/**
 * Livelli della personalità ottenuta, contando le giornate in cui ha prevalso: livello 1 quando
 * la si diventa (5), livello 2 con altre 10 (15 in tutto), livello 3 a 30.
 */
export const LEVEL_PREVAIL = [PREVAIL_TO_BECOME, 15, 30] as const;
export type PersonalityLevel = 1 | 2 | 3;

/** Titolo per livello: cambia salendo di livello. */
export const PERSONALITY_TITLES: Record<PersonalityId, [string, string, string]> = {
  artist: ['Artista', 'Pittore affermato', "Maestro d'arte"],
  business: ['Imprenditore', 'Manager', 'Magnate'],
  criminal: ['Criminale', 'Ladro esperto', 'Boss del condominio'],
  romantic: ['Romanticone', "Cuore d'oro", "Leggenda dell'amore"],
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
  /** Punti di ogni personalità (in totale: servono per i pensieri e il tono delle frasi). */
  points: Partial<Record<PersonalityId, number>>;
  /**
   * La personalità ottenuta (una sola chiave). Il nome resta "announced" perché le regole del
   * database lo leggono per il tentativo in più del Criminale.
   */
  announced: Partial<Record<PersonalityId, boolean>>;
  /** Giornate in cui ogni personalità è stata la prevalente. */
  prevail?: Partial<Record<PersonalityId, number>>;
  /** Giorno (AAAA-MM-GG) a cui si riferiscono i conteggi giornalieri. */
  day: string;
  /** Quante volte ogni azione ha già dato punti oggi. */
  today: Partial<Record<PersonalityAction, number>>;
  /** Punti già guadagnati oggi da ogni personalità (al massimo PERSONALITY_DAILY_MAX). */
  todayPoints: Partial<Record<PersonalityId, number>>;
  /** Giorni (AAAA-MM-GG) in cui sono già stati dati i premi giornalieri. */
  perks?: { interestDay?: string; romanceDay?: string };
  /** Un'altra personalità è arrivata a PREVAIL_TO_BECOME: si propone di cambiare (in attesa di risposta). */
  offer?: PersonalityId;
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

const IDS = Object.keys(PERSONALITIES) as PersonalityId[];

/** La personalità ottenuta, oppure null. */
export const obtainedPersonality = (state: PersonalityState | undefined): PersonalityId | null =>
  IDS.find((id) => state?.announced?.[id]) ?? null;

/** Personalità con più punti in una giornata (null se nessun punto o pari merito). */
export function dayWinner(
  todayPoints: Partial<Record<PersonalityId, number>>,
): PersonalityId | null {
  let best: PersonalityId | null = null,
    bestPts = 0,
    tie = false;
  for (const id of IDS) {
    const p = todayPoints[id] || 0;
    if (p > bestPts) {
      best = id;
      bestPts = p;
      tie = false;
    } else if (p > 0 && p === bestPts) tie = true;
  }
  return tie ? null : best;
}

/** Livello per un numero di giornate prevalse (0 = non ancora ottenuta). */
export function levelFor(prevailDays: number): 0 | PersonalityLevel {
  if (prevailDays >= LEVEL_PREVAIL[2]) return 3;
  if (prevailDays >= LEVEL_PREVAIL[1]) return 2;
  if (prevailDays >= LEVEL_PREVAIL[0]) return 1;
  return 0;
}

/** Livello della personalità ottenuta (0 se non ce n'è una). */
export function personalityLevel(state: PersonalityState | undefined): 0 | PersonalityLevel {
  const got = obtainedPersonality(state);
  return got ? levelFor(state?.prevail?.[got] || 0) || 1 : 0;
}

/** Livello che il giocatore ha in una data personalità (0 se non è la sua). */
export const levelOf = (state: PersonalityState | undefined, id: PersonalityId): number =>
  obtainedPersonality(state) === id ? personalityLevel(state) : 0;

/** Titolo attuale, es. "Pittore affermato" (null senza personalità). */
export function personalityTitle(state: PersonalityState | undefined): string | null {
  const got = obtainedPersonality(state);
  return got ? PERSONALITY_TITLES[got][personalityLevel(state) - 1] : null;
}

/** Diventa `id` (prima volta o cambio): le altre ripartono da zero, così si contano da adesso. */
function become(state: PersonalityState, id: PersonalityId): void {
  state.announced = { [id]: true };
  state.prevail = { [id]: Math.max(PREVAIL_TO_BECOME, state.prevail?.[id] || 0) };
  delete state.offer;
}

export interface DayOutcome {
  /** Chi ha prevalso nella giornata chiusa. */
  won: PersonalityId | null;
  /** Personalità appena ottenuta (la prima volta). */
  reached: PersonalityId | null;
  /** Nuovo livello appena raggiunto dalla personalità ottenuta. */
  levelUp: PersonalityLevel | null;
  /** Un'altra personalità è arrivata a PREVAIL_TO_BECOME: va proposto il cambio. */
  offer: PersonalityId | null;
}

/**
 * Chiude la giornata salvata se ora è un altro giorno: la personalità prevalente prende 1 punto
 * prevalenza. Senza personalità, a PREVAIL_TO_BECOME la si diventa; con una personalità, se
 * prevale la propria si sale di livello, se un'altra arriva a PREVAIL_TO_BECOME si propone il cambio.
 */
export function settlePersonalityDay(state: PersonalityState, now: Date): DayOutcome {
  const day = dayKey(now);
  const out: DayOutcome = { won: null, reached: null, levelUp: null, offer: null };
  if (state.day === day) return out;
  const won = state.day ? dayWinner(state.todayPoints) : null;
  if (won) {
    const prevail = (state.prevail ??= {});
    const got = obtainedPersonality(state);
    const before = got ? personalityLevel(state) : 0;
    prevail[won] = (prevail[won] || 0) + 1;
    out.won = won;
    if (!got) {
      if (prevail[won] >= PREVAIL_TO_BECOME) {
        become(state, won);
        out.reached = won;
      }
    } else if (won === got) {
      const after = personalityLevel(state);
      if (after > before) out.levelUp = after as PersonalityLevel;
    } else if (prevail[won] >= PREVAIL_TO_BECOME && !state.offer) {
      state.offer = won;
      out.offer = won;
    }
  }
  state.day = day;
  state.today = {};
  state.todayPoints = {};
  return out;
}

/** Risposta alla proposta di cambiare personalità. */
export function answerSwitchOffer(state: PersonalityState, accept: boolean): PersonalityId | null {
  const id = state.offer;
  if (!id) return null;
  if (accept) {
    become(state, id);
    return id;
  }
  // si resta come si è: quella personalità riparte da zero (si riproporrà dopo altre 5 giornate)
  delete state.offer;
  if (state.prevail) delete state.prevail[id];
  return null;
}

/**
 * Registra un'azione. Restituisce la personalità appena ottenuta (se, chiudendo la giornata
 * precedente, una personalità è arrivata a PREVAIL_TO_BECOME), altrimenti null.
 */
export function addPersonalityPoints(
  state: PersonalityState,
  action: PersonalityAction,
  now: Date,
): PersonalityId | null {
  const rule = PERSONALITY_ACTIONS[action];
  const { reached } = settlePersonalityDay(state, now);
  const used = state.today[action] || 0;
  if (used >= rule.perDay) return reached; // tetto giornaliero: niente punti ripetendo sempre la stessa azione
  const gainedToday = state.todayPoints[rule.to] || 0;
  const gain = Math.min(rule.points, PERSONALITY_DAILY_MAX - gainedToday);
  if (gain <= 0) return reached; // la personalità ha già preso il massimo di oggi
  state.today[action] = used + 1;
  state.todayPoints[rule.to] = gainedToday + gain;
  state.points[rule.to] = (state.points[rule.to] || 0) + gain;
  return reached;
}

/** Etichetta della personalità ottenuta (sopra i parametri e nella scheda degli altri). */
export const PERSONALITY_BADGE: Record<PersonalityId, { emoji: string; color: string }> = {
  artist: { emoji: '🎨', color: '#a29bfe' },
  business: { emoji: '💼', color: '#feca57' },
  criminal: { emoji: '😈', color: '#ff6b6b' },
  romantic: { emoji: '💘', color: '#fd79a8' },
};

/**
 * Testo dell'etichetta con titolo e livello, es. "🎨 Pittore affermato · Lv 2"
 * (null se l'id non è una personalità).
 */
export function personalityBadgeText(id: unknown, level: unknown = 1): string | null {
  if (typeof id !== 'string' || !(id in PERSONALITIES)) return null;
  const p = id as PersonalityId;
  const lv = level === 2 || level === 3 ? level : 1;
  return `${PERSONALITY_BADGE[p].emoji} ${PERSONALITY_TITLES[p][lv - 1]} · Lv ${lv}`;
}

/** A che punto è il giocatore (testo per il profilo). */
export function personalityStatusText(state: PersonalityState | undefined): string {
  const got = obtainedPersonality(state);
  if (got) {
    const lv = personalityLevel(state);
    const days = state?.prevail?.[got] || 0;
    const next =
      lv < 3
        ? ` · livello ${lv + 1} tra ${(LEVEL_PREVAIL[lv as 1 | 2] ?? 0) - days} giornate`
        : ' · livello massimo';
    return `✨ ${PERSONALITY_TITLES[got][lv - 1]} (${PERSONALITIES[got].name}, livello ${lv})${next}`;
  }
  const prevail = state?.prevail || {};
  const growing = IDS.filter((id) => (prevail[id] || 0) > 0).sort(
    (a, b) => (prevail[b] || 0) - (prevail[a] || 0),
  );
  if (!growing.length)
    return `✨ Personalità: ancora nessuna. Ogni giorno prevale quella con più punti; dopo ${PREVAIL_TO_BECOME} giornate la diventi.`;
  return (
    '✨ Personalità in crescita: ' +
    growing.map((id) => `${PERSONALITIES[id].name} ${prevail[id]}/${PREVAIL_TO_BECOME}`).join(' · ')
  );
}

/** Legge lo stato dal salvataggio scartando i valori non validi. */
export function decodePersonality(value: unknown): PersonalityState {
  const state = emptyPersonality();
  if (!value || typeof value !== 'object') return state;
  const v = value as Record<string, unknown>;
  const points = (v.points || {}) as Record<string, unknown>;
  const announced = (v.announced || {}) as Record<string, unknown>;
  const prevail = (v.prevail || {}) as Record<string, unknown>;
  for (const id of IDS) {
    const p = points[id];
    if (Number.isFinite(p) && (p as number) >= 0) state.points[id] = Math.min(1e6, p as number);
    const d = prevail[id];
    if (Number.isSafeInteger(d) && (d as number) > 0)
      (state.prevail ??= {})[id] = Math.min(1000, d as number);
  }
  // una sola personalità: chi ne aveva più d'una (sistema precedente) tiene quella con più punti
  const had = IDS.filter((id) => announced[id] === true).sort(
    (a, b) => (state.points[b] || 0) - (state.points[a] || 0),
  );
  if (had.length) {
    state.announced = { [had[0]]: true };
    // chi l'aveva ottenuta col sistema di prima parte dal livello 1
    if ((state.prevail?.[had[0]] || 0) < PREVAIL_TO_BECOME)
      (state.prevail ??= {})[had[0]] = PREVAIL_TO_BECOME;
  }
  if (had.length && typeof v.offer === 'string' && v.offer in PERSONALITIES && v.offer !== had[0])
    state.offer = v.offer as PersonalityId;
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
  const perks = (v.perks || {}) as Record<string, unknown>;
  const isDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (isDay(perks.interestDay) || isDay(perks.romanceDay)) {
    state.perks = {};
    if (isDay(perks.interestDay)) state.perks.interestDay = perks.interestDay;
    if (isDay(perks.romanceDay)) state.perks.romanceDay = perks.romanceDay;
  }
  return state;
}

// ---------------------------------------------------------------- premi delle personalità

/** Premi per livello (indice 0 = livello 1). */
/** Offerte dei collezionisti per l'Artista: +25%, +40%, +60%. */
export const ARTIST_OFFER_BONUS = [1.25, 1.4, 1.6] as const;
/** Interesse giornaliero sul conto per l'Imprenditore: 1%, 1,5%, 2%. */
export const BANK_INTEREST_PER_DAY = [0.01, 0.015, 0.02] as const;
/** Al massimo si recuperano gli interessi di una settimana di assenza. */
export const INTEREST_MAX_DAYS = 7;
/** Tentativi di furto per il Criminale: 4, 5, 6 (chi non è Criminale ne ha 3). */
export const CRIMINAL_THEFT_TRIES = [4, 5, 6] as const;
/** Premio giornaliero del Romanticone (salute e felicità): +10%, +15%, +20%. */
export const ROMANTIC_DAILY_BONUS = [10, 15, 20] as const;

const pct = (n: number) => String(Math.round(n * 1000) / 10).replace('.', ',');

/** Premio di una personalità a un livello (testo per i messaggi). */
export function personalityPerk(id: PersonalityId, level: number): string {
  const i = Math.max(1, Math.min(3, level)) - 1;
  switch (id) {
    case 'artist':
      return `I collezionisti ti offrono il ${pct(ARTIST_OFFER_BONUS[i] - 1)}% in più per i tuoi quadri.`;
    case 'business':
      return `Il tuo conto in banca ti dà il ${pct(BANK_INTEREST_PER_DAY[i])}% di interessi al giorno.`;
    case 'criminal':
      return `Hai ${CRIMINAL_THEFT_TRIES[i]} tentativi invece di 3 per indovinare le combinazioni delle casseforti.`;
    case 'romantic':
      return `Ogni giorno ricevi +${ROMANTIC_DAILY_BONUS[i]}% di salute e +${ROMANTIC_DAILY_BONUS[i]}% di felicità.`;
  }
}

/** Premio al livello 1 (dal messaggio "Sei diventato…"). */
export const PERSONALITY_PERKS: Record<PersonalityId, string> = {
  artist: personalityPerk('artist', 1),
  business: personalityPerk('business', 1),
  criminal: personalityPerk('criminal', 1),
  romantic: personalityPerk('romantic', 1),
};

/** true se la personalità è già stata raggiunta (il messaggio è comparso). */
export const hasPersonality = (state: PersonalityState | undefined, id: PersonalityId): boolean =>
  !!state?.announced?.[id];

/** Offerta del collezionista con il premio dell'Artista (`level` 0 = non è Artista). */
export const artistOffer = (amount: number, level: number): number =>
  level > 0 ? Math.round(amount * ARTIST_OFFER_BONUS[Math.min(3, level) - 1]) : amount;

/** Tentativi per indovinare una combinazione (`level` del Criminale, 0 = non lo è). */
export const theftTriesFor = (level: number, base: number): number =>
  level > 0 ? CRIMINAL_THEFT_TRIES[Math.min(3, level) - 1] : base;

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/**
 * Interessi da accreditare oggi all'Imprenditore: un giorno per ogni giorno passato dall'ultima
 * volta (al massimo una settimana), con l'interesse composto e arrotondato per difetto.
 * Il primo giorno con il premio non dà interessi: si comincia a contare da lì.
 */
export function bankInterest(
  balance: number,
  lastDay: string | undefined,
  today: string,
  level = 1,
): number {
  if (!lastDay || !(balance > 0)) return 0;
  const days = Math.min(INTEREST_MAX_DAYS, dayNumber(today) - dayNumber(lastDay));
  if (days <= 0) return 0;
  const rate = BANK_INTEREST_PER_DAY[Math.max(1, Math.min(3, level)) - 1];
  // il piccolo margine evita che 149,9999… (errore dei numeri decimali) diventi 149
  return Math.floor(balance * (Math.pow(1 + rate, days) - 1) + 1e-6);
}

/** Giorno (AAAA-MM-GG) dell'ora locale, come per i limiti giornalieri. */
export const todayKey = (now: Date): string => dayKey(now);

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
  // con una personalità ottenuta si pensa e si parla da quella
  const got = obtainedPersonality(state);
  if (got) return got;
  let best: PersonalityId | null = null;
  for (const id of IDS)
    if (
      (state.points[id] || 0) >= minPoints &&
      (!best || (state.points[id] || 0) > (state.points[best] || 0))
    )
      best = id;
  return best;
}

export type SocialAct = 'talk' | 'praise' | 'insult' | 'punch' | 'food';

/**
 * Frasi delle azioni sociali: un gruppo condiviso da tutti e uno per ogni personalità,
 * così chi ha un carattere si riconosce anche da come parla.
 */
export const SOCIAL_LINES: Record<'shared' | PersonalityId, Record<SocialAct, string[]>> = {
  shared: {
    talk: [
      'Come va oggi? 😊',
      'Ti racconto una cosa…',
      'Che bella giornata!',
      'Hai sentito le novità?',
      'Tutto bene a casa?',
      'Che si dice in giro?',
    ],
    praise: [
      'Stai benissimo! 😍',
      'Sei un grande!',
      'Che stile! ✨',
      'Hai un sorriso bellissimo!',
      'Mi piace come ti vesti!',
    ],
    insult: [
      'Sei proprio un tipo… 🤬',
      'Che vergogna!',
      'Ma levati! 😠',
      'Non ti sopporto proprio!',
      "Va' a fare un giro! 😤",
    ],
    punch: ['Prendi questo! 👊', 'Te la sei cercata!', 'Beccati questo! 💥'],
    food: ['Ho cucinato per te! 🍽️', 'Assaggia, è ancora caldo!'],
  },
  artist: {
    talk: [
      'Oggi la luce è perfetta per dipingere 🎨',
      'Sto lavorando a un nuovo quadro…',
      "Ti piace l'arte?",
    ],
    praise: ['Saresti un ritratto perfetto! 🖼️', 'Hai dei colori stupendi addosso!'],
    insult: ['Hai il gusto di un muro grigio!', 'Sei più storto di un quadro appeso male!'],
    punch: ['Una pennellata in faccia! 🎨👊'],
    food: ["Un piatto è un'opera d'arte, assaggia!"],
  },
  business: {
    talk: [
      'Hai visto come va il mercato? 📈',
      'Sto pensando di investire ancora…',
      'Il tempo è denaro!',
    ],
    praise: ['Hai la stoffa del manager! 💼', "Con te farei affari d'oro!"],
    insult: ["Vali meno di un'azione in crisi! 📉", 'Non ti assumerei neanche gratis!'],
    punch: ['Questo è un taglio dei costi! 👊💼'],
    food: ['Pranzo di lavoro offerto da me!'],
  },
  criminal: {
    talk: [
      'Hai visto qualcosa di strano stanotte? 😏',
      "Io? Non c'ero…",
      'Ti ricordi a memoria il codice della tua cassaforte?',
    ],
    praise: ["Hai l'aria di uno che sa tenere un segreto 😎", 'Mi piaci, sei uno sveglio!'],
    insult: ['Guardati le spalle… 😈', 'Occhio a dove metti i piedi!'],
    punch: ['Questo è un avvertimento! 😈👊', 'Non hai visto niente, chiaro?'],
    food: ["Tieni, e non chiedermi dove l'ho preso 😏"],
  },
  romantic: {
    talk: ['Che bello vederti! 💕', 'Ti va di fare due passi insieme?', 'Mi racconti di te?'],
    praise: [
      'Sei la persona più bella del condominio! 💖',
      'Quando sorridi si illumina tutto! ✨',
      'Hai degli occhi stupendi 😍',
    ],
    insult: ['Mi hai spezzato il cuore… 💔', 'Non mi parlare più! 😢'],
    punch: ['Scusa… è stato un attimo! 💔👊'],
    food: ["L'ho cucinato con amore! ❤️"],
  },
};

/** Quante volte su dieci chi ha una personalità usa le sue frasi invece di quelle di tutti. */
export const OWN_LINE_CHANCE = 0.6;

/** Frase per un'azione sociale: a volte quella della propria personalità, altrimenti una di tutti. */
export function socialLine(
  act: SocialAct,
  personality: PersonalityId | null,
  roll: () => number = Math.random,
): string {
  const own = personality ? SOCIAL_LINES[personality][act] : [];
  const pool = own.length && roll() < OWN_LINE_CHANCE ? own : SOCIAL_LINES.shared[act];
  return pool[Math.floor(roll() * pool.length)];
}
