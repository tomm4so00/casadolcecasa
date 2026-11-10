// Personalità che il personaggio sviluppa giocando (senza dipendenze dal browser, così è testabile).
import { JOINT_PRICE } from './weed-rules.js';
import { NORMAL_BAG_PRICE } from './weed-market-rules.js';
import { RPS_MIN_BET, SLOT_BET } from './betting-rules.js';
import { CHIPS } from './roulette-rules.js';
import { TREAT_PRICE } from './dog-training-rules.js';
import { MOON_TRIP_PRICE } from './project-rules.js';
import { PET_FOOD_PRICE } from '../../shared/pet-rules.js';
import { DISCO_PRICE, TRIP_PRICE } from './prices.js';

export type PersonalityId =
  | 'artist'
  | 'business'
  | 'criminal'
  | 'romantic'
  | 'addict'
  | 'gambler'
  | 'partier'
  | 'animals'
  | 'scientist'
  | 'vigilante';

/**
 * Come si diventa una personalità: ogni giorno le azioni danno punti (al massimo
 * PERSONALITY_DAILY_MAX per personalità). A fine giornata quella con più punti, se ne ha almeno
 * PREVAIL_MIN_POINTS, è la "prevalente" e guadagna 1 punto prevalenza. Con PREVAIL_TO_BECOME
 * punti prevalenza il personaggio diventa quella personalità. Un'altra che arriva alle stesse
 * giornate diventa il secondo tratto, con premi più leggeri.
 */
export const PERSONALITY_DAILY_MAX = 10;
export const PREVAIL_TO_BECOME = 5;
/** Una giornata svogliata non fa crescere niente: per prevalere servono almeno 6 punti. */
export const PREVAIL_MIN_POINTS = 6;
/** Giornate che servono a un'altra personalità per diventare il secondo tratto. */
export const SECOND_MIN_PREVAIL = PREVAIL_TO_BECOME;
/**
 * Il secondo tratto nei calcoli dei premi: i suoi livelli 1, 2 e 3 (con le stesse giornate della
 * personalità principale) valgono 0,25, 0,5 e 0,75, sempre sotto il livello 1 della principale.
 */
export const secondLevelValue = (level: number): number => level / 4;
/** Il secondo tratto al livello 1. */
export const SECOND_LEVEL = secondLevelValue(1);

export const PERSONALITIES: Record<PersonalityId, { name: string; message: string }> = {
  artist: { name: 'Artista', message: 'Sei diventato un Artista!' },
  business: { name: 'Imprenditore', message: 'Sei diventato un Imprenditore!' },
  criminal: { name: 'Criminale', message: 'Sei diventato un Criminale!' },
  romantic: { name: 'Romanticone', message: 'Sei diventato un Romanticone!' },
  addict: { name: 'Tossico', message: 'Sei diventato un Tossico!' },
  gambler: { name: "Giocatore d'azzardo", message: "Sei diventato un Giocatore d'azzardo!" },
  partier: { name: 'Festaiolo', message: 'Sei diventato un Festaiolo!' },
  animals: { name: 'Amico degli animali', message: 'Sei diventato un Amico degli animali!' },
  scientist: { name: 'Scienziato', message: 'Sei diventato uno Scienziato!' },
  vigilante: { name: 'Giustiziere', message: 'Sei diventato un Giustiziere!' },
};

/** In che ordine si mostrano (le quattro di sempre per prime). */
export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];
const IDS = PERSONALITY_IDS;

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
  addict: ['Fattone', 'Tossico', 'Leggenda dello sballo'],
  gambler: ['Scommettitore', 'Giocatore incallito', 'Re del casinò'],
  partier: ['Animale da festa', 'Re della pista', 'Leggenda della notte'],
  animals: ['Amico degli animali', 'Addestratore', 'Dottor Dolittle'],
  scientist: ['Inventore', 'Ingegnere', 'Astronauta'],
  vigilante: ['Cittadino modello', 'Detective', 'Commissario'],
};

// ---------------------------------------------------------------- punti: quanto costa un'azione

/**
 * Lo sforzo di un'azione in "minuti equivalenti": i minuti di gioco, più i soldi spesi (20 Đ
 * valgono un minuto), +50% se è rischiosa, ×1,5 se serve un altro giocatore, metà se è una cosa
 * che si fa comunque (il lavoro). Ogni 2 minuti equivalenti un punto: circa 20 minuti di gioco
 * mirato riempiono i 10 punti di una giornata, per qualunque personalità.
 */
export interface ActionEffort {
  to: PersonalityId;
  /** Come si chiama nella pagina della personalità. */
  label: string;
  minutes: number;
  /** Soldi spesi di solito (chi la registra può passare quelli veri). */
  cost?: number;
  risky?: boolean;
  social?: boolean;
  routine?: boolean;
}

export const EFFORT_PER_POINT = 2;
export const DD_PER_MINUTE = 20;
/** Punti al giorno che può dare una sola azione: per arrivare a 10 ne servono almeno due. */
export const ACTION_DAILY_MAX = 6;
/** Per le azioni di tutti i giorni (il lavoro) ancora meno. */
export const ROUTINE_DAILY_MAX = 4;
/** Punti di una singola azione: da mezzo punto a 5. */
export const ACTION_POINTS_MIN = 0.5;
export const ACTION_POINTS_MAX = 5;

const act = (
  to: PersonalityId,
  label: string,
  minutes: number,
  more: Partial<Omit<ActionEffort, 'to' | 'label' | 'minutes'>> = {},
): ActionEffort => ({ to, label, minutes, ...more });

export const PERSONALITY_ACTIONS = {
  // Artista
  paint: act('artist', 'Dipingere un quadro', 8),
  sellPainting: act('artist', 'Vendere un quadro', 3),
  // Imprenditore
  workShift: act('business', 'Fare un turno di lavoro', 5, { routine: true }),
  invest: act('business', 'Investire in borsa o in un’attività', 2, { risky: true }),
  sellUsed: act('business', 'Vendere un oggetto all’usato o a un collezionista', 3),
  buyPainting: act('business', 'Comprare un quadro all’asta', 3, { cost: 200, social: true }),
  // Criminale
  theftAttempt: act('criminal', 'Tentare un furto', 2, { risky: true }),
  theftSuccess: act('criminal', 'Svuotare una cassaforte', 6, { risky: true }),
  sellDrug: act('criminal', 'Vendere erba o pillole a un altro giocatore', 2, {
    risky: true,
    social: true,
  }),
  punch: act('criminal', 'Dare un pugno', 1, { risky: true }),
  insult: act('criminal', 'Insultare qualcuno', 1),
  // Romanticone
  compliment: act('romantic', 'Fare un complimento', 1),
  talk: act('romantic', 'Fare due chiacchiere', 1),
  kissAttempt: act('romantic', 'Chiedere un bacio', 1, { social: true }),
  kissAccepted: act('romantic', 'Ricevere un sì a un bacio', 2, { social: true }),
  giveFood: act('romantic', 'Regalare un piatto cucinato', 5, { cost: 10, social: true }),
  // Tossico
  smokeJoint: act('addict', 'Fumare una canna', 2, { cost: JOINT_PRICE }),
  takePill: act('addict', 'Prendere una pillola misteriosa', 1, {
    cost: NORMAL_BAG_PRICE,
    risky: true,
  }),
  buyDrugs: act('addict', 'Comprare dal Biondo o da Mirko', 2, { cost: NORMAL_BAG_PRICE }),
  harvestWeed: act('addict', 'Raccogliere l’erba coltivata', 10),
  // Giocatore d'azzardo
  slotSpin: act('gambler', 'Giocare alla slot', 0.5, { cost: SLOT_BET, risky: true }),
  rouletteBet: act('gambler', 'Puntare alla roulette', 1, { cost: CHIPS[1], risky: true }),
  rpsBet: act('gambler', 'Sfidare qualcuno a morra cinese con i soldi', 2, {
    cost: RPS_MIN_BET * 2,
    risky: true,
    social: true,
  }),
  // Festaiolo
  disco: act('partier', 'Andare in discoteca', 5, { cost: DISCO_PRICE }),
  bar: act('partier', 'Andare al bar', 3),
  trip: act('partier', 'Partire per un viaggio', 3, { cost: TRIP_PRICE }),
  // Amico degli animali
  feedPet: act('animals', 'Dare da mangiare a un animale', 1, { cost: PET_FOOD_PRICE }),
  walkDog: act('animals', 'Portare il cane a spasso', 5),
  dogTreat: act('animals', 'Premiare il cane in addestramento', 2, { cost: TREAT_PRICE }),
  buyPet: act('animals', 'Adottare un animale', 2, { cost: 150 }),
  // Scienziato
  donateProject: act('scientist', 'Versare soldi per il razzo o la base lunare', 1, { cost: 50 }),
  labWork: act('scientist', 'Lavorare al bancone del laboratorio', 2),
  launchRocket: act('scientist', 'Lanciare il razzo', 3),
  moonTrip: act('scientist', 'Volare sulla luna', 5, { cost: MOON_TRIP_PRICE }),
  // Giustiziere
  findProof: act('vigilante', 'Trovare prove nel cestino di qualcuno', 3),
  denounce: act('vigilante', 'Far multare qualcuno con una denuncia', 4),
  punchThief: act('vigilante', 'Fermare un ladro con un pugno', 1, { risky: true, social: true }),
} as const satisfies Record<string, ActionEffort>;

export type PersonalityAction = keyof typeof PERSONALITY_ACTIONS;
export const isPersonalityAction = (v: unknown): v is PersonalityAction =>
  typeof v === 'string' && Object.hasOwn(PERSONALITY_ACTIONS, v);

/** Minuti equivalenti di un'azione (con i soldi spesi davvero, se si conoscono). */
export function actionEffort(action: PersonalityAction, cost?: number): number {
  const a: ActionEffort = PERSONALITY_ACTIONS[action];
  const spent = Number.isFinite(cost) && (cost as number) > 0 ? (cost as number) : (a.cost ?? 0);
  return (
    (a.minutes + spent / DD_PER_MINUTE) *
    (a.risky ? 1.5 : 1) *
    (a.social ? 1.5 : 1) *
    (a.routine ? 0.5 : 1)
  );
}

/** Punti di un'azione: un punto ogni EFFORT_PER_POINT minuti, a mezzi punti, da 0,5 a 5. */
export function actionPoints(action: PersonalityAction, cost?: number): number {
  const half = Math.round((actionEffort(action, cost) / EFFORT_PER_POINT) * 2) / 2;
  return Math.min(ACTION_POINTS_MAX, Math.max(ACTION_POINTS_MIN, half));
}

/** Quanti punti al giorno può dare l'azione. */
export const actionDailyMax = (action: PersonalityAction): number =>
  (PERSONALITY_ACTIONS[action] as ActionEffort).routine ? ROUTINE_DAILY_MAX : ACTION_DAILY_MAX;

/** Le azioni che fanno crescere una personalità. */
export const actionsOf = (id: PersonalityId): PersonalityAction[] =>
  (Object.keys(PERSONALITY_ACTIONS) as PersonalityAction[]).filter(
    (a) => PERSONALITY_ACTIONS[a].to === id,
  );

// ---------------------------------------------------------------- stato

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
  /** Il secondo tratto (lo leggono anche le regole del database): vedi secondPersonality. */
  second?: PersonalityId;
  /** Giorno (AAAA-MM-GG) a cui si riferiscono i conteggi giornalieri. */
  day: string;
  /** Punti già dati oggi da ogni azione (al massimo actionDailyMax). */
  today: Partial<Record<PersonalityAction, number>>;
  /** Punti già guadagnati oggi da ogni personalità (al massimo PERSONALITY_DAILY_MAX). */
  todayPoints: Partial<Record<PersonalityId, number>>;
  /** Giorni (AAAA-MM-GG) in cui sono già stati dati i premi giornalieri. */
  perks?: { interestDay?: string; romanceDay?: string };
  /** Un'altra personalità è arrivata alle giornate per cambiare (in attesa di risposta). */
  offer?: PersonalityId;
  /** Proposte rifiutate: con quante giornate. Si ripropone dopo altre PREVAIL_TO_BECOME. */
  declined?: Partial<Record<PersonalityId, number>>;
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

/** La personalità ottenuta, oppure null. */
export const obtainedPersonality = (state: PersonalityState | undefined): PersonalityId | null =>
  IDS.find((id) => state?.announced?.[id]) ?? null;

/**
 * Personalità prevalente di una giornata: la più alta, se ha almeno PREVAIL_MIN_POINTS. A pari
 * merito vince quella con più giornate alle spalle; se anche quelle sono pari, nessuna.
 */
export function dayWinner(
  todayPoints: Partial<Record<PersonalityId, number>>,
  prevail: Partial<Record<PersonalityId, number>> = {},
): PersonalityId | null {
  let best: PersonalityId | null = null,
    tie = false;
  for (const id of IDS) {
    const p = todayPoints[id] || 0;
    if (p < PREVAIL_MIN_POINTS) continue;
    if (!best) {
      best = id;
      continue;
    }
    const bp = todayPoints[best] || 0;
    const days = prevail[id] || 0,
      bestDays = prevail[best] || 0;
    if (p > bp || (p === bp && days > bestDays)) {
      best = id;
      tie = false;
    } else if (p === bp && days === bestDays) tie = true;
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

/**
 * Il secondo tratto: un'altra personalità con almeno SECOND_MIN_PREVAIL giornate (la più forte;
 * a pari giornate quella con più punti). Solo con una personalità ottenuta.
 */
export function secondPersonality(state: PersonalityState | undefined): PersonalityId | null {
  const got = obtainedPersonality(state);
  if (!got) return null;
  const days = (id: PersonalityId) => state?.prevail?.[id] || 0;
  const pts = (id: PersonalityId) => state?.points?.[id] || 0;
  let best: PersonalityId | null = null;
  for (const id of IDS) {
    if (id === got || days(id) < SECOND_MIN_PREVAIL) continue;
    if (!best || days(id) > days(best) || (days(id) === days(best) && pts(id) > pts(best)))
      best = id;
  }
  return best;
}

/** Tiene aggiornato state.second (lo leggono le regole del database). */
function syncSecond(state: PersonalityState): void {
  const second = secondPersonality(state);
  if (second) state.second = second;
  else delete state.second;
}

/**
 * Quanto conta una personalità per i premi: il livello se è la propria, SECOND_LEVEL se è il
 * secondo tratto, altrimenti 0.
 */
export function levelOf(state: PersonalityState | undefined, id: PersonalityId): number {
  if (obtainedPersonality(state) === id) return personalityLevel(state);
  return secondPersonality(state) === id ? secondLevelValue(secondLevel(state)) : 0;
}

/** Titolo attuale, es. "Pittore affermato" (null senza personalità). */
export function personalityTitle(state: PersonalityState | undefined): string | null {
  const got = obtainedPersonality(state);
  return got ? PERSONALITY_TITLES[got][personalityLevel(state) - 1] : null;
}

/** Diventa `id` (prima volta o cambio): le giornate delle altre restano (la vecchia fa da secondo tratto). */
function become(state: PersonalityState, id: PersonalityId): void {
  state.announced = { [id]: true };
  const prevail = (state.prevail ??= {});
  prevail[id] = Math.max(PREVAIL_TO_BECOME, prevail[id] || 0);
  delete state.offer;
  if (state.declined) delete state.declined[id];
  syncSecond(state);
}

interface DayOutcome {
  /** Chi ha prevalso nella giornata chiusa. */
  won: PersonalityId | null;
  /** Personalità appena ottenuta (la prima volta). */
  reached: PersonalityId | null;
  /** Nuovo livello appena raggiunto dalla personalità ottenuta. */
  levelUp: PersonalityLevel | null;
  /** Un'altra personalità è arrivata alle giornate per cambiare: va proposto il cambio. */
  offer: PersonalityId | null;
}

/**
 * Chiude la giornata salvata se ora è un altro giorno: la personalità prevalente prende 1 punto
 * prevalenza. Senza personalità, a PREVAIL_TO_BECOME la si diventa; con una personalità, se
 * prevale la propria si sale di livello, se un'altra arriva a PREVAIL_TO_BECOME (o ad altre
 * PREVAIL_TO_BECOME giornate dopo un rifiuto) si propone il cambio.
 */
export function settlePersonalityDay(state: PersonalityState, now: Date): DayOutcome {
  const day = dayKey(now);
  const out: DayOutcome = { won: null, reached: null, levelUp: null, offer: null };
  if (state.day === day) return out;
  const won = state.day ? dayWinner(state.todayPoints, state.prevail) : null;
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
    } else if (!state.offer && prevail[won] >= (state.declined?.[won] ?? 0) + PREVAIL_TO_BECOME) {
      state.offer = won;
      out.offer = won;
    }
    syncSecond(state);
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
  // si resta come si è: quella personalità resta come secondo tratto e si riproporrà più avanti
  delete state.offer;
  (state.declined ??= {})[id] = state.prevail?.[id] || 0;
  syncSecond(state);
  return null;
}

/**
 * Registra un'azione (`cost`: i soldi spesi davvero, se servono al calcolo). Restituisce la
 * personalità appena ottenuta (se, chiudendo la giornata precedente, una è arrivata a
 * PREVAIL_TO_BECOME), altrimenti null.
 */
export function addPersonalityPoints(
  state: PersonalityState,
  action: PersonalityAction,
  now: Date,
  cost?: number,
): PersonalityId | null {
  const rule = PERSONALITY_ACTIONS[action];
  const { reached } = settlePersonalityDay(state, now);
  const fromAction = state.today[action] || 0;
  const gainedToday = state.todayPoints[rule.to] || 0;
  // tetto dell'azione (non si cresce ripetendo sempre la stessa cosa) e della personalità
  const gain = Math.min(
    actionPoints(action, cost),
    actionDailyMax(action) - fromAction,
    PERSONALITY_DAILY_MAX - gainedToday,
  );
  if (gain <= 0) return reached;
  state.today[action] = fromAction + gain;
  state.todayPoints[rule.to] = gainedToday + gain;
  state.points[rule.to] = (state.points[rule.to] || 0) + gain;
  return reached;
}

/** I progressi di oggi, dalla personalità più avanti (solo quelle con qualche punto). */
export function todayProgress(
  state: PersonalityState | undefined,
  now: Date,
): { id: PersonalityId; points: number }[] {
  if (!state || state.day !== dayKey(now)) return [];
  return IDS.map((id) => ({ id, points: state.todayPoints[id] || 0 }))
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points);
}

/** "6,5": mezzi punti con la virgola. */
export const fmtPoints = (n: number): string => String(Math.round(n * 2) / 2).replace('.', ',');

/** Etichetta della personalità ottenuta (sopra i parametri e nella scheda degli altri). */
export const PERSONALITY_BADGE: Record<PersonalityId, { emoji: string; color: string }> = {
  artist: { emoji: '🎨', color: '#a29bfe' },
  business: { emoji: '💼', color: '#feca57' },
  criminal: { emoji: '😈', color: '#ff6b6b' },
  romantic: { emoji: '💘', color: '#fd79a8' },
  addict: { emoji: '🌿', color: '#55efc4' },
  gambler: { emoji: '🎰', color: '#fdcb6e' },
  partier: { emoji: '🕺', color: '#e056fd' },
  animals: { emoji: '🐾', color: '#fab1a0' },
  scientist: { emoji: '🚀', color: '#74b9ff' },
  vigilante: { emoji: '🕵️', color: '#81ecec' },
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

/** A che punto è il giocatore (testo per il profilo): personalità, secondo tratto e oggi. */
export function personalityStatusText(
  state: PersonalityState | undefined,
  now: Date = new Date(),
): string {
  const got = obtainedPersonality(state);
  let text: string;
  if (got) {
    const lv = personalityLevel(state);
    const days = state?.prevail?.[got] || 0;
    const next =
      lv < 3
        ? ` · livello ${lv + 1} tra ${(LEVEL_PREVAIL[lv as 1 | 2] ?? 0) - days} giornate`
        : ' · livello massimo';
    text = `✨ ${PERSONALITY_TITLES[got][lv - 1]} (${PERSONALITIES[got].name}, livello ${lv})${next}`;
    const second = secondPersonality(state);
    if (second)
      text += `\n➕ Secondo tratto: un po' ${PERSONALITY_BADGE[second].emoji} ${PERSONALITIES[second].name} (livello ${secondLevel(state)})`;
  } else {
    const prevail = state?.prevail || {};
    const growing = IDS.filter((id) => (prevail[id] || 0) > 0).sort(
      (a, b) => (prevail[b] || 0) - (prevail[a] || 0),
    );
    text = growing.length
      ? '✨ Personalità in crescita: ' +
        growing
          .map((id) => `${PERSONALITIES[id].name} ${prevail[id]}/${PREVAIL_TO_BECOME}`)
          .join(' · ')
      : `✨ Personalità: ancora nessuna. Ogni giorno prevale quella con più punti; dopo ${PREVAIL_TO_BECOME} giornate la diventi.`;
  }
  const today = todayProgress(state, now).slice(0, 3);
  text += today.length
    ? '\n📅 Oggi: ' +
      today
        .map(
          (p) =>
            `${PERSONALITY_BADGE[p.id].emoji} ${PERSONALITIES[p.id].name} ${fmtPoints(p.points)}/${PERSONALITY_DAILY_MAX}`,
        )
        .join(' · ')
    : `\n📅 Oggi: ancora nessun punto (per far prevalere una personalità ne servono ${PREVAIL_MIN_POINTS}).`;
  return text;
}

/**
 * Cosa si pubblica nella classifica del condominio per la classifica delle personalità: la
 * propria, il livello, le giornate e il secondo tratto (niente senza personalità).
 */
export function personalityRank(state: PersonalityState | undefined): {
  pers?: PersonalityId;
  persLv?: number;
  persDays?: number;
  pers2?: PersonalityId;
} {
  const got = obtainedPersonality(state);
  if (!got) return {};
  const second = secondPersonality(state);
  return {
    pers: got,
    persLv: personalityLevel(state),
    persDays: state?.prevail?.[got] || 0,
    ...(second ? { pers2: second } : {}),
  };
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
  const declined = (v.declined || {}) as Record<string, unknown>;
  for (const id of IDS) {
    const d = declined[id];
    if (Number.isSafeInteger(d) && (d as number) >= 0)
      (state.declined ??= {})[id] = Math.min(1000, d as number);
  }
  if (typeof v.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.day)) state.day = v.day;
  const today = (v.today || {}) as Record<string, unknown>;
  for (const action of Object.keys(PERSONALITY_ACTIONS) as PersonalityAction[]) {
    const n = today[action];
    if (Number.isFinite(n) && (n as number) >= 0)
      state.today[action] = Math.min(ACTION_DAILY_MAX, n as number);
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
  syncSecond(state);
  return state;
}

// ---------------------------------------------------------------- premi delle personalità

/**
 * Il premio di ogni personalità: il valore ai livelli 1, 2 e 3 e, più leggero, quello del
 * secondo tratto. `text` lo scrive per i messaggi.
 */
const PERKS: Record<
  PersonalityId,
  {
    levels: [number, number, number];
    /** Come secondo tratto, ai suoi livelli 1, 2 e 3: più leggero dello stesso livello. */
    second: [number, number, number];
    text: (v: number) => string;
  }
> = {
  artist: {
    levels: [1.25, 1.4, 1.6],
    second: [1.12, 1.2, 1.3],
    text: (v) => `I collezionisti ti offrono il ${pct(v - 1)}% in più per i tuoi quadri.`,
  },
  business: {
    levels: [0.01, 0.015, 0.02],
    second: [0.005, 0.008, 0.01],
    text: (v) => `Il tuo conto in banca ti dà il ${pct(v)}% di interessi al giorno.`,
  },
  criminal: {
    // due tentativi in più per livello; come secondo tratto uno per livello (4, 5, 6)
    levels: [5, 7, 9],
    second: [4, 5, 6],
    text: (v) => `Hai ${v} tentativi invece di 3 per indovinare le combinazioni delle casseforti.`,
  },
  romantic: {
    levels: [10, 15, 20],
    second: [5, 8, 10],
    text: (v) => `Ogni giorno ricevi +${v}% di salute e +${v}% di felicità.`,
  },
  addict: {
    levels: [1.25, 1.5, 1.75],
    second: [1.12, 1.25, 1.37],
    text: (v) => `Le canne ti danno il ${pct(v - 1)}% di felicità in più.`,
  },
  gambler: {
    levels: [1.1, 1.2, 1.3],
    second: [1.05, 1.1, 1.15],
    text: (v) => `Le vincite alla slot sono più alte del ${pct(v - 1)}%.`,
  },
  partier: {
    levels: [0.25, 0.5, 1],
    second: [0.1, 0.25, 0.5],
    text: (v) =>
      v >= 1
        ? 'In discoteca entri gratis.'
        : `L'ingresso in discoteca costa il ${pct(v)}% in meno.`,
  },
  animals: {
    levels: [1.2, 1.4, 1.6],
    second: [1.1, 1.2, 1.3],
    text: (v) => `Ogni pasto sazia i tuoi animali il ${pct(v - 1)}% in più.`,
  },
  scientist: {
    levels: [0.2, 0.35, 0.5],
    second: [0.1, 0.2, 0.25],
    text: (v) => `Il biglietto per la luna costa il ${pct(v)}% in meno.`,
  },
  vigilante: {
    levels: [60, 70, 80],
    second: [55, 60, 65],
    text: (v) =>
      `Delle multe che fai prendere con una denuncia ti spetta il ${v}% invece della metà.`,
  },
};

const pct = (n: number) => String(Math.round(n * 1000) / 10).replace('.', ',');

/**
 * Il valore del premio di `id` per un livello (come levelOf: 1-3, SECOND_LEVEL per il secondo
 * tratto), oppure null se non conta.
 */
export function perkAt(id: PersonalityId, level: number): number | null {
  if (!(level > 0)) return null;
  const p = PERKS[id];
  if (level < 1) return p.second[Math.min(3, Math.max(1, Math.round(level * 4))) - 1];
  return p.levels[Math.min(3, Math.round(level)) - 1];
}

/**
 * Il livello del secondo tratto, con le stesse giornate della personalità principale (5, 15,
 * 30). 0 se non c'è.
 */
export function secondLevel(state: PersonalityState | undefined): number {
  const second = secondPersonality(state);
  return second ? levelFor(state?.prevail?.[second] || 0) || 1 : 0;
}

/** Il premio di chi gioca per una personalità (null se non ce l'ha). */
export const myPerk = (state: PersonalityState | undefined, id: PersonalityId): number | null =>
  perkAt(id, levelOf(state, id));

/** Premio di una personalità a un livello (testo per i messaggi; SECOND_LEVEL = secondo tratto). */
export function personalityPerk(id: PersonalityId, level: number): string {
  return PERKS[id].text(perkAt(id, level > 0 ? level : 1)!);
}

/** Il premio come secondo tratto ai livelli 1, 2 e 3 (per la pagina della personalità). */
export function secondPerkLines(id: PersonalityId): string[] {
  return PERKS[id].second.map(
    (v, i) => `livello ${i + 1} (${LEVEL_PREVAIL[i]} giornate): ${PERKS[id].text(v)}`,
  );
}

/** Premio al livello 1 (dal messaggio "Sei diventato…"). */
export const PERSONALITY_PERKS = Object.fromEntries(
  IDS.map((id) => [id, personalityPerk(id, 1)]),
) as Record<PersonalityId, string>;

/** true se è la propria personalità (il messaggio è comparso). */
export const hasPersonality = (state: PersonalityState | undefined, id: PersonalityId): boolean =>
  !!state?.announced?.[id];

/** Offerta del collezionista con il premio dell'Artista (`level` 0 = niente premio). */
export const artistOffer = (amount: number, level: number): number => {
  const k = perkAt('artist', level);
  return k ? Math.round(amount * k) : amount;
};

/** Tentativi per indovinare una combinazione (`level` del Criminale, 0 = niente premio). */
export const theftTriesFor = (level: number, base: number): number =>
  perkAt('criminal', level) ?? base;

/** Premio giornaliero del Romanticone (salute e felicità) a un livello. */
export const romanticBonus = (level: number): number => perkAt('romantic', level) ?? 0;

/** Felicità di una canna con il premio del Tossico. */
export const addictHappiness = (gain: number, level: number): number =>
  Math.round(gain * (perkAt('addict', level) ?? 1));

/** Vincita alla slot con il premio del Giocatore d'azzardo. */
export const slotPrize = (win: number, level: number): number =>
  win > 0 ? Math.round(win * (perkAt('gambler', level) ?? 1)) : win;

/** Ingresso in discoteca con lo sconto del Festaiolo. */
export const discoPrice = (price: number, level: number): number =>
  Math.max(0, Math.round(price * (1 - (perkAt('partier', level) ?? 0))));

/** Quanto sazia un pasto con il premio dell'Amico degli animali. */
export const petFoodGain = (gain: number, level: number): number =>
  Math.round(gain * (perkAt('animals', level) ?? 1));

/** Biglietto per la luna con lo sconto dello Scienziato. */
export const moonTripPrice = (price: number, level: number): number =>
  Math.max(0, Math.round(price * (1 - (perkAt('scientist', level) ?? 0))));

/** Quota della multa che spetta a chi denuncia (in percentuale), con il premio del Giustiziere. */
export const reporterShare = (level: number): number => perkAt('vigilante', level) ?? 50;

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/** Al massimo si recuperano gli interessi di una settimana di assenza. */
const INTEREST_MAX_DAYS = 7;

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
  const rate = perkAt('business', level) ?? 0;
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
  addict: [
    'Che giornata… è ancora tutto colorato',
    'Domani passo dal Biondo',
    'Chissà cosa c’era in quella pillola…',
  ],
  gambler: [
    'Domani la slot paga, me lo sento',
    'Il rosso… o forse il nero?',
    'Ancora una giocata e smetto…',
  ],
  partier: [
    'Mi fischiano ancora le orecchie dalla musica',
    'Domani sera si torna in pista!',
    'Che serata ragazzi…',
  ],
  animals: [
    'Chissà se il cane dorme già',
    'Domani gli insegno un trucco nuovo',
    'Gli animali sono meglio delle persone',
  ],
  scientist: [
    'Ancora qualche calcolo e il razzo è perfetto',
    'Un giorno camminerò sulla luna',
    'Domani torno al bancone del laboratorio',
  ],
  vigilante: [
    'Qualcuno in questo condominio ha qualcosa da nascondere…',
    'Domani do un’occhiata nei cestini',
    'Giustizia è fatta',
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
  addict: {
    talk: [
      'Bella giornata per una canna all’aperto 🌿',
      'Hai visto il Biondo oggi?',
      'Tutto tranquillo, fratello…',
    ],
    praise: ['Hai un’aura bellissima, giuro 🌈', 'Sei proprio una persona rilassante'],
    insult: ['Mi fai venire l’ansia, sparisci!', 'Sei pesante come un lunedì mattina'],
    punch: ['Ops… mi è partita la mano 🌿👊'],
    food: ['Ho una fame chimica… ma questo è per te!'],
  },
  gambler: {
    talk: [
      'Oggi mi sento fortunato 🍀',
      'Rosso o nero? Dimmi un colore!',
      'La slot sta per pagare, lo sento…',
    ],
    praise: ['Con te vincerei anche alla roulette! 🎰', 'Sei un jackpot di persona!'],
    insult: ['Hai meno fortuna di un due di picche!', 'Sei una puntata persa!'],
    punch: ['Tutto sul rosso! 🎰👊'],
    food: ['L’ho vinto alla slot… scherzo, l’ho cucinato!'],
  },
  partier: {
    talk: [
      'Stasera in discoteca? 🕺',
      'Che musica ti piace?',
      'Ieri sera ho ballato fino all’alba!',
    ],
    praise: ['Sei l’anima della festa! 🎉', 'Con te ogni serata è una festa!'],
    insult: ['Balli come un frigorifero!', 'Sei più noioso di una festa senza musica!'],
    punch: ['Questo è un passo di danza! 🕺👊'],
    food: ['Un aperitivo improvvisato per te! 🍹'],
  },
  animals: {
    talk: [
      'Hai visto il mio cane? È un tesoro 🐶',
      'Ti piacciono gli animali?',
      'Oggi gli ho insegnato a dare la zampa!',
    ],
    praise: ['Sei dolce come un cucciolo 🐾', 'Gli animali ti adorerebbero!'],
    insult: ['Hai il carattere di un gatto bagnato!', 'Persino il mio criceto è più simpatico!'],
    punch: ['Zampata! 🐾👊'],
    food: ['Cibo per umani, giuro! 🐾'],
  },
  scientist: {
    talk: [
      'Sai quanto manca al prossimo lancio? 🚀',
      'Sto calcolando la traiettoria per la luna…',
      'Hai mai visto la Terra dalla base lunare?',
    ],
    praise: ['Hai una mente brillante! 💡', 'Saresti un ottimo astronauta!'],
    insult: ['Il tuo QI è più basso della gravità lunare!', 'Sei un esperimento fallito!'],
    punch: ['Forza uguale e contraria! 🚀👊'],
    food: ['Cucinato con precisione scientifica! 🧪'],
  },
  vigilante: {
    talk: [
      'Hai notato qualcosa di sospetto in giro? 🕵️',
      'In questo condominio c’è chi ha qualcosa da nascondere…',
      'Tieni d’occhio il tuo cestino!',
    ],
    praise: ['Sei un cittadino modello! 🏅', 'Con persone come te il condominio è più sicuro!'],
    insult: ['Ti tengo d’occhio, sappilo! 🕵️', 'Ho già il tuo nome sul mio taccuino!'],
    punch: ['In nome della legge! 🕵️👊'],
    food: ['Tieni, e ricordati di svuotare il cestino 😉'],
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
