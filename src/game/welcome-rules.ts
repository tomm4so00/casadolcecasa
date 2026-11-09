// Missioni di benvenuto: poche, una alla volta, per imparare a far sopravvivere il personaggio
// (senza dipendenze dal browser, così sono testabili).

/** Quello che serve sapere del gioco per controllare le missioni e dare le istruzioni. */
export interface WelcomeView {
  env: string;
  /** È nella propria stanza. */
  inOwnRoom: boolean;
  meals: number;
  showers: number;
  shifts: number;
  sleeping: boolean;
  pinSet: boolean;
  hasFood: boolean;
  foodCooked: boolean;
  /** Cibo nello zaino: crudo e piatti cucinati. */
  rawFood: number;
  dishes: number;
  /** Assaggi di benvenuto regalati (a un vicino, lasciati in una stanza o a un personaggio). */
  tastes: number;
  /** Il passo per portare l'assaggio, già scritto (dipende da chi c'è online: vedi taste.ts). */
  tasteHint: string;
  /** Sta facendo un turno di lavoro. */
  working: boolean;
}

/** Contatore che la missione deve veder crescere (o null se basta guardare lo stato). */
type Counter = 'meals' | 'showers' | 'shifts' | 'tastes' | null;

interface WelcomeMission {
  id: string;
  title: string;
  reward: number;
  /** Perché serve (per sopravvivere) e cosa fare: il messaggio con i tre pulsanti. */
  intro: string;
  counter: Counter;
  /** Completata? `base` = il contatore quando la missione è stata accettata. */
  done: (v: WelcomeView, base: number) => boolean;
  /** Istruzione per il passo in cui si è adesso. */
  hint: (v: WelcomeView) => string;
}

const HOME = ['SALOON', 'KITCHEN', 'BATHROOM', 'PLAYER_ROOM', 'CORTILE'];

/** Le missioni di prima (fino alla 0.19): le finisce chi le aveva già cominciate. */
export const LEGACY_WELCOME_MISSIONS: WelcomeMission[] = [
  {
    id: 'eat',
    title: '🍳 Il primo pasto',
    reward: 20,
    intro:
      'Prepara il tuo primo pasto in cucina: il cibo costa 5 Đ e un pasto recupera il 50% di Fame. Il prossimo passo resta visibile sotto i parametri.',
    counter: 'meals',
    done: (v, base) => v.meals > base,
    hint: (v) =>
      v.env !== 'KITCHEN'
        ? '🍳 Vai in cucina: è una delle porte del salone del tuo appartamento.'
        : !v.hasFood
          ? '🧊 Apri il frigorifero, poi premi «Prendi Cibo» (5 Đ).'
          : !v.foodCooked
            ? '🔥 Ora porta il cibo al fornello e cuocilo.'
            : '😋 È pronto! Vicino al fornello premi «Mangia» per mangiarlo.',
  },
  {
    id: 'shower',
    title: '🚿 Una bella doccia',
    reward: 20,
    intro:
      'È il momento di recuperare Igiene: vai nel bagno del tuo appartamento e fai una doccia. Aspetta che sia finita per completare la missione.',
    counter: 'showers',
    done: (v, base) => v.showers > base,
    hint: (v) =>
      v.env !== 'BATHROOM'
        ? '🚿 Vai in bagno: è una delle porte del salone del tuo appartamento.'
        : '🧼 Avvicinati alla doccia e premi il pulsante per lavarti.',
  },
  {
    id: 'sleep',
    title: '😴 Riposati nel tuo letto',
    reward: 20,
    intro:
      'Vai nella tua stanza e mettiti a letto: basta coricarti per completare la missione. Continui a riposare anche a gioco chiuso e ti svegli automaticamente al 100% di Sonno. Puoi anche alzarti prima con il pulsante del letto.',
    counter: null,
    done: (v) => v.sleeping,
    hint: (v) =>
      !v.inOwnRoom
        ? '🚪 Vai nella tua stanza: nel salone, la porta con il tuo numero (lo vedi sotto i parametri).'
        : '🛏️ Avvicinati al letto e premi il pulsante per coricarti.',
  },
  {
    id: 'work',
    title: '💼 Il primo stipendio',
    reward: 30,
    intro:
      'Guadagna il tuo primo stipendio completando un turno. Dal cortile raggiungi l’uscita del condominio e scegli «Lavoro»: ogni consegna aumenta la paga.',
    counter: 'shifts',
    done: (v, base) => v.shifts > base,
    hint: (v) =>
      v.working
        ? '📦 Porta gli oggetti ai punti giusti finché il turno non finisce: ogni consegna vale soldi.'
        : HOME.includes(v.env) && v.env !== 'CORTILE'
          ? '🌳 Vai nel cortile (la porta del salone) e raggiungi l’uscita del condominio.'
          : v.env === 'CORTILE'
            ? '🚪 Avvicinati all’uscita del condominio (il tappetino «ESCI DI CASA») e scegli «Lavoro».'
            : '💼 Apri il menu dell’uscita del condominio e scegli «Lavoro».',
  },
  {
    id: 'pin',
    title: '🔐 Proteggi i tuoi soldi',
    reward: 25,
    intro:
      'Proteggi la cassaforte della tua stanza con una combinazione segreta: chi la indovina può rubare i tuoi soldi. Avvicinati alla cassaforte e scegli «Imposta combinazione».',
    counter: null,
    done: (v) => v.pinSet,
    hint: (v) =>
      !v.inOwnRoom
        ? '🚪 Vai nella tua stanza: nel salone, la porta con il tuo numero.'
        : '🔐 Avvicinati alla cassaforte sulla parete di sinistra e scegli «Imposta combinazione».',
  },
];

/**
 * Il tutorial di adesso: l'assaggio di benvenuto (cucinare e conoscere un vicino), poi cassaforte,
 * lavoro e letto. La doccia si capisce da sola guardando la barra dell'igiene.
 */
export const WELCOME_MISSIONS: WelcomeMission[] = [
  {
    id: 'taste_cook',
    title: "🍝 Cucina l'assaggio di benvenuto",
    reward: 20,
    intro:
      'Da noi si usa così: quando arrivi, cucini qualcosa e lo porti ai vicini. Vai in cucina, prendi il cibo dal frigo (5 Đ) e cucinalo al fornello: il piatto finisce nel tuo zaino 🎒. Il prossimo passo resta visibile sotto i parametri.',
    counter: null,
    done: (v) => v.dishes > 0 || v.tastes > 0,
    hint: (v) =>
      v.env !== 'KITCHEN'
        ? '🍳 Vai in cucina: è una delle porte del salone del tuo appartamento.'
        : v.rawFood <= 0
          ? '🧊 Apri il frigorifero, poi premi «Prendi Cibo» (5 Đ).'
          : '🔥 Ora vai al fornello e premi «Cucina»: il piatto va nello zaino 🎒.',
  },
  {
    id: 'taste_give',
    title: "🚪 Porta l'assaggio a un vicino",
    reward: 40,
    intro:
      "Porta il piatto a un vicino: se è in casa glielo dai di persona, se non c'è lo lasci nella sua stanza e lo troverà quando torna. Vicino a lui apri lo zaino 🎒 e tocca «Regala».",
    counter: 'tastes',
    done: (v, base) => v.tastes > base,
    hint: (v) => v.tasteHint,
  },
  {
    id: 'pin',
    title: '🔐 Proteggi i tuoi soldi',
    reward: 25,
    intro:
      'Proteggi la cassaforte della tua stanza con una combinazione segreta: chi la indovina può rubare i tuoi soldi. Ogni giorno alle 11:45 Zero, lo scassinatore, annuncia a che ora indebolirà le casseforti: se vedi qualcuno scassinare la tua, dagli un pugno e non potrà più aprirla. Avvicinati alla cassaforte e scegli «Imposta combinazione».',
    counter: null,
    done: (v) => v.pinSet,
    hint: (v) =>
      !v.inOwnRoom
        ? '🚪 Vai nella tua stanza: nel salone, la porta con il tuo numero.'
        : '🔐 Avvicinati alla cassaforte sulla parete di sinistra e scegli «Imposta combinazione».',
  },
  {
    id: 'work',
    title: '💼 Il primo stipendio',
    reward: 30,
    intro:
      'Guadagna il tuo primo stipendio completando un turno. Dal cortile raggiungi l’uscita del condominio e scegli «Lavoro»: ogni consegna aumenta la paga.',
    counter: 'shifts',
    done: (v, base) => v.shifts > base,
    hint: (v) =>
      v.working
        ? '📦 Porta gli oggetti ai punti giusti finché il turno non finisce: ogni consegna vale soldi.'
        : HOME.includes(v.env) && v.env !== 'CORTILE'
          ? '🌳 Vai nel cortile (la porta del salone) e raggiungi l’uscita del condominio.'
          : v.env === 'CORTILE'
            ? '🚪 Avvicinati all’uscita del condominio (il tappetino «ESCI DI CASA») e scegli «Lavoro».'
            : '💼 Apri il menu dell’uscita del condominio e scegli «Lavoro».',
  },
  {
    id: 'sleep',
    title: '😴 Riposati nel tuo letto',
    reward: 20,
    intro:
      'Vai nella tua stanza e mettiti a letto: basta coricarti per completare la missione. Continui a riposare anche a gioco chiuso e ti svegli automaticamente al 100% di Sonno. Puoi anche alzarti prima con il pulsante del letto.',
    counter: null,
    done: (v) => v.sleeping,
    hint: (v) =>
      !v.inOwnRoom
        ? '🚪 Vai nella tua stanza: nel salone, la porta con il tuo numero (lo vedi sotto i parametri).'
        : '🛏️ Avvicinati al letto e premi il pulsante per coricarti.',
  },
];
/** Stato salvato: a che missione si è e se il giocatore le segue. */
export interface WelcomeState {
  /** Indice della missione corrente (WELCOME_MISSIONS.length = finite). */
  i: number;
  /** offer = da proporre, active = accettata, off = il giocatore non vuole seguirle. */
  status: 'offer' | 'active' | 'off';
  /** Valore del contatore quando la missione è stata accettata. */
  base: number;
  /** 2 = il tutorial dell'assaggio; senza = le missioni di prima (LEGACY_WELCOME_MISSIONS). */
  v?: 2;
  /** "Più tardi": prima di quest'ora la proposta non ricompare. */
  snoozeUntil: number;
}

export const SNOOZE_MS = 5 * 60_000;

export const newWelcome = (): WelcomeState => ({
  i: 0,
  status: 'offer',
  base: 0,
  snoozeUntil: 0,
  v: 2,
});

/** Le missioni dello stato: quelle nuove, o quelle di prima per chi le aveva cominciate. */
export const missionsOf = (s: WelcomeState): WelcomeMission[] =>
  s.v === 2 ? WELCOME_MISSIONS : LEGACY_WELCOME_MISSIONS;

export const welcomeFinished = (s: WelcomeState): boolean => s.i >= missionsOf(s).length;

/** Valore del contatore di una missione. */
const counterOf = (m: WelcomeMission, v: WelcomeView): number => (m.counter ? v[m.counter] : 0);

/** È il momento di proporre la missione corrente? */
export const shouldOffer = (s: WelcomeState, now: number): boolean =>
  !welcomeFinished(s) && s.status === 'offer' && now >= s.snoozeUntil;

/** Risposta alla proposta: accetta, più tardi (5 minuti) o non seguire le missioni. */
export function answerOffer(
  s: WelcomeState,
  answer: 'yes' | 'later' | 'no',
  v: WelcomeView,
  now: number,
): WelcomeState {
  if (welcomeFinished(s)) return s;
  if (answer === 'no') return { ...s, status: 'off' };
  if (answer === 'later') return { ...s, status: 'offer', snoozeUntil: now + SNOOZE_MS };
  return { ...s, status: 'active', base: counterOf(missionsOf(s)[s.i], v), snoozeUntil: 0 };
}

/** Missione accettata e completata: si passa alla successiva (da proporre). null = non ancora. */
export function completeIfDone(s: WelcomeState, v: WelcomeView): WelcomeState | null {
  if (s.status !== 'active' || welcomeFinished(s)) return null;
  const m = missionsOf(s)[s.i];
  if (!m.done(v, s.base)) return null;
  return { i: s.i + 1, status: 'offer', base: 0, snoozeUntil: 0, ...(s.v ? { v: s.v } : {}) };
}

/** Legge lo stato dal salvataggio. `veteran` = chi giocava già prima: non gli si propongono. */
export function decodeWelcome(value: unknown, veteran: boolean): WelcomeState {
  if (!value || typeof value !== 'object')
    return veteran ? { ...newWelcome(), i: WELCOME_MISSIONS.length } : newWelcome();
  const v = value as Record<string, unknown>;
  const list = v.v === 2 ? WELCOME_MISSIONS : LEGACY_WELCOME_MISSIONS;
  const i = Number.isSafeInteger(v.i) ? Math.max(0, Math.min(list.length, v.i as number)) : 0;
  const status = v.status === 'active' || v.status === 'off' ? v.status : 'offer';
  return {
    i,
    status,
    base: Number.isFinite(v.base) ? (v.base as number) : 0,
    snoozeUntil: Number.isFinite(v.snoozeUntil) ? (v.snoozeUntil as number) : 0,
    ...(v.v === 2 ? { v: 2 as const } : {}),
  };
}
