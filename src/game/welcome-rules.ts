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
  /** Sta facendo un turno di lavoro. */
  working: boolean;
}

/** Contatore che la missione deve veder crescere (o null se basta guardare lo stato). */
type Counter = 'meals' | 'showers' | 'shifts' | null;

export interface WelcomeMission {
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

export const WELCOME_MISSIONS: WelcomeMission[] = [
  {
    id: 'eat',
    title: '🍳 Il primo pasto',
    reward: 20,
    intro:
      'La barra della 🍕 Fame cala col passare delle ore. Se arriva a 0 la salute comincia a scendere, e senza salute il personaggio muore per sempre.\n\nCucina e mangia un pasto: vai in cucina (una delle porte del salone), prendi il cibo dal frigo, cuocilo sul fornello e mangialo.',
    counter: 'meals',
    done: (v, base) => v.meals > base,
    hint: (v) =>
      v.env !== 'KITCHEN'
        ? '🍳 Vai in cucina: è una delle porte del salone del tuo appartamento.'
        : !v.hasFood
          ? '🧊 Avvicinati al frigorifero e prendi il cibo.'
          : !v.foodCooked
            ? '🔥 Ora porta il cibo al fornello e cuocilo.'
            : '😋 È pronto! Tocca di nuovo il fornello per mangiarlo.',
  },
  {
    id: 'shower',
    title: '🚿 Una bella doccia',
    reward: 20,
    intro:
      'Anche la barra dell’🧼 Igiene cala col tempo: se si svuota, la salute scende.\n\nFatti una doccia: vai in bagno (una delle porte del salone) e usa la doccia.',
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
      'Il 😴 Sonno si ricarica solo dormendo. Con poco sonno si cammina più piano, e a zero la salute scende.\n\nVai nella tua stanza e mettiti a letto. Quando hai riposato abbastanza, svegliati dallo stesso pulsante.',
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
      'Per comprare il cibo e tutto il resto servono soldi: si guadagnano lavorando.\n\nVai al lavoro e completa un turno: nel cortile usa l’uscita del condominio e scegli «Lavoro».',
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
      'I soldi stanno nella cassaforte della tua stanza. Gli altri giocatori possono provare a indovinarne la combinazione e rubarli!\n\nScegli una combinazione segreta: vai nella tua stanza, avvicinati alla cassaforte sulla parete e imposta la combinazione.',
    counter: null,
    done: (v) => v.pinSet,
    hint: (v) =>
      !v.inOwnRoom
        ? '🚪 Vai nella tua stanza: nel salone, la porta con il tuo numero.'
        : '🔐 Avvicinati alla cassaforte sulla parete di sinistra e scegli «Imposta combinazione».',
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
  /** "Più tardi": prima di quest'ora la proposta non ricompare. */
  snoozeUntil: number;
}

export const SNOOZE_MS = 5 * 60_000;

export const newWelcome = (): WelcomeState => ({ i: 0, status: 'offer', base: 0, snoozeUntil: 0 });

export const welcomeFinished = (s: WelcomeState): boolean => s.i >= WELCOME_MISSIONS.length;

/** Valore del contatore di una missione. */
export const counterOf = (m: WelcomeMission, v: WelcomeView): number =>
  m.counter ? v[m.counter] : 0;

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
  return { ...s, status: 'active', base: counterOf(WELCOME_MISSIONS[s.i], v), snoozeUntil: 0 };
}

/** Missione accettata e completata: si passa alla successiva (da proporre). null = non ancora. */
export function completeIfDone(s: WelcomeState, v: WelcomeView): WelcomeState | null {
  if (s.status !== 'active' || welcomeFinished(s)) return null;
  const m = WELCOME_MISSIONS[s.i];
  if (!m.done(v, s.base)) return null;
  return { i: s.i + 1, status: 'offer', base: 0, snoozeUntil: 0 };
}

/** Legge lo stato dal salvataggio. `veteran` = chi giocava già prima: non gli si propongono. */
export function decodeWelcome(value: unknown, veteran: boolean): WelcomeState {
  if (!value || typeof value !== 'object')
    return veteran ? { ...newWelcome(), i: WELCOME_MISSIONS.length } : newWelcome();
  const v = value as Record<string, unknown>;
  const i = Number.isSafeInteger(v.i)
    ? Math.max(0, Math.min(WELCOME_MISSIONS.length, v.i as number))
    : 0;
  const status = v.status === 'active' || v.status === 'off' ? v.status : 'offer';
  return {
    i,
    status,
    base: Number.isFinite(v.base) ? (v.base as number) : 0,
    snoozeUntil: Number.isFinite(v.snoozeUntil) ? (v.snoozeUntil as number) : 0,
  };
}
