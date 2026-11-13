// I capitoli delle missioni (fase 3 del piano dei primi minuti), senza browser: si provano nei test.
// Il Capitolo 1 sono le missioni di benvenuto (welcome-rules.ts); finito quello, i capitoli 2–6
// sono aperti tutti insieme e in ognuno le missioni vanno in ordine. Le missioni guardano i totali
// del giocatore (chat, turni, quadri…), così chi le aveva già fatte le trova completate.
// Ogni capitolo finito dà un trofeo sulla mensola della stanza; le due missioni bonus una medaglia.

/** Quello che serve sapere del giocatore per controllare le missioni. */
export interface QuestView {
  env: string;
  /** Posti già visitati con i capitoli aperti. */
  visited: Record<string, boolean>;
  chats: number;
  praises: number;
  friends: number;
  shifts: number;
  holdings: number;
  bank: number;
  clothes: number;
  trashEmptied: number;
  gossipRead: number;
  safeLevel: number;
  paintings: number;
  pets: number;
  rocketDonor: boolean;
  moonTrips: number;
  suggestions: number;
}

export interface Quest {
  id: string;
  title: string;
  /** L'istruzione del passo, con tra «…» il pulsante da toccare (guide-pointer.ts). */
  hint: string;
  reward: number;
  done: (v: QuestView) => boolean;
  /** Dove porta la freccia (un posto); senza, nessuna freccia. */
  env?: string;
}

export interface Chapter {
  id: string;
  title: string;
  trophy: string;
  /** Il premio in più a capitolo finito. */
  bonus: number;
  quests: Quest[];
}

/** Il posto è stato visitato (o ci si è dentro adesso). */
const been = (v: QuestView, env: string): boolean => v.env === env || !!v.visited[env];

export const CHAPTERS: Chapter[] = [
  {
    id: 'citta',
    title: '🏙️ La città',
    trophy: 'trofeo_citta',
    bonus: 60,
    quests: [
      {
        id: 'mall',
        title: '🏬 Il centro commerciale',
        hint: '🏬 Dall’uscita del condominio scegli «Centro Commerciale».',
        reward: 15,
        env: 'centro_commerciale',
        done: (v) => been(v, 'centro_commerciale'),
      },
      {
        id: 'clothes',
        title: '👕 Un vestito nuovo',
        hint: '👕 Al centro commerciale entra nel negozio di vestiti e compra un capo che ti piace.',
        reward: 25,
        env: 'negozio_vestiti',
        done: (v) => v.clothes > 0,
      },
      {
        id: 'bar',
        title: '🍹 Una serata al bar',
        hint: '🍹 Dall’uscita del condominio apri «Attività ricreative» e vai al bar.',
        reward: 15,
        env: 'bar',
        done: (v) => been(v, 'bar'),
      },
      {
        id: 'walk',
        title: '🚶 Una passeggiata',
        hint: '🚶 Dall’uscita del condominio apri «Attività ricreative» e fai una passeggiata: alza la Felicità.',
        reward: 15,
        env: 'passeggiata',
        done: (v) => been(v, 'passeggiata'),
      },
    ],
  },
  {
    id: 'vicini',
    title: '👋 I vicini',
    trophy: 'trofeo_vicini',
    bonus: 80,
    quests: [
      {
        id: 'chat',
        title: '💬 Due parole',
        hint: '💬 Tocca 💬 a destra, scegli «Chat del condominio» e scrivi un messaggio.',
        reward: 15,
        done: (v) => v.chats > 0,
      },
      {
        id: 'praise',
        title: '😍 Un complimento',
        hint: '😍 Avvicinati a un vicino, tocca il suo nome e scegli «Complimenti».',
        reward: 20,
        done: (v) => v.praises > 0,
      },
      {
        id: 'friend',
        title: '🤝 Un amico',
        hint: '🤝 Parole, complimenti e regali: quando un vicino ti tratta bene abbastanza, diventate amici.',
        reward: 50,
        done: (v) => v.friends > 0,
      },
    ],
  },
  {
    id: 'lavoro',
    title: '💼 Lavoro e soldi',
    trophy: 'trofeo_lavoro',
    bonus: 60,
    quests: [
      {
        id: 'shifts',
        title: '💼 Un lavoro vero',
        hint: '💼 Fai altri due turni di lavoro: dall’uscita del condominio scegli «Lavoro». L’esperienza aumenta la paga.',
        reward: 30,
        done: (v) => v.shifts >= 3,
      },
      {
        id: 'stock',
        title: '📈 In borsa',
        hint: '📈 Compra la tua prima azione: in banca o dal PC della tua stanza, alla borsa del condominio.',
        reward: 30,
        env: 'banca',
        done: (v) => v.holdings > 0,
      },
      {
        id: 'bank',
        title: '🏦 Il primo conto',
        hint: '🏦 Tenere tutto in cassaforte è rischioso: quando hai almeno 1000 Đ deposita qualcosa in banca.',
        reward: 40,
        env: 'banca',
        done: (v) => v.bank > 0,
      },
    ],
  },
  {
    id: 'rischi',
    title: '🔐 Rischi e regole',
    trophy: 'trofeo_rischi',
    bonus: 60,
    quests: [
      {
        id: 'police',
        title: '🚓 Il commissariato',
        hint: '🚓 Dall’uscita del condominio scegli «Commissariato di Polizia»: lì si portano le prove e si pagano le multe.',
        reward: 15,
        env: 'commissariato',
        done: (v) => been(v, 'commissariato'),
      },
      {
        id: 'trash',
        title: '🧹 Nessuna traccia',
        hint: '🧹 Nella tua stanza avvicinati al cestino e svuotalo.',
        reward: 15,
        done: (v) => v.trashEmptied > 0,
      },
      {
        id: 'gossip',
        title: '🗞️ Pettegolezzi',
        hint: '🗞️ In cortile leggi la bacheca dei pettegolezzi: nel condominio si sa sempre tutto.',
        reward: 15,
        env: 'CORTILE',
        done: (v) => v.gossipRead > 0,
      },
      {
        id: 'safe',
        title: '🏦 Al sicuro',
        hint: '🔐 Al negozio di mobili compra la cassaforte livello 2: è più difficile da scassinare.',
        reward: 40,
        env: 'negozio_mobili',
        done: (v) => v.safeLevel >= 2,
      },
    ],
  },
  {
    id: 'progetti',
    title: '🚀 I grandi progetti',
    trophy: 'trofeo_progetti',
    bonus: 100,
    quests: [
      {
        id: 'painting',
        title: '🎨 Il primo quadro',
        hint: '🎨 Dall’uscita del condominio scegli «Laboratorio Artistico» e dipingi un quadro.',
        reward: 30,
        env: 'laboratorio',
        done: (v) => v.paintings > 0,
      },
      {
        id: 'pet',
        title: '🐶 Un amico a quattro zampe',
        hint: '🐶 Al centro commerciale entra nel negozio di animali e adottane uno.',
        reward: 40,
        env: 'negozio_animali',
        done: (v) => v.pets > 0,
      },
      {
        id: 'rocket',
        title: '🔧 Il razzo',
        hint: '🔧 Dall’uscita del condominio scegli «Laboratorio Ingegneristico» e versa una quota per costruire il razzo.',
        reward: 30,
        env: 'ingegneria',
        done: (v) => v.rocketDonor,
      },
    ],
  },
];

/** Le missioni bonus: sempre nel menu delle missioni, ognuna con la sua medaglia. */
export const BONUS: (Quest & { medal: string })[] = [
  {
    id: 'luna',
    title: '🌙 Sulla Luna',
    hint: '🌙 Il viaggio più lungo: quando il razzo è pronto, arriva sulla Luna.',
    reward: 100,
    medal: 'medaglia_luna',
    env: 'ingegneria',
    done: (v) => v.moonTrips > 0,
  },
  {
    id: 'idea',
    title: '📮 La tua idea',
    hint: '📮 Hai un’idea o hai trovato un errore? Scrivilo nella cassetta «Idee e bug» del cortile.',
    reward: 20,
    medal: 'medaglia_idea',
    env: 'CORTILE',
    done: (v) => v.suggestions > 0,
  },
];

/** Il trofeo del Capitolo 1 (le missioni di benvenuto). */
export const WELCOME_TROPHY = 'trofeo_benvenuto';

/** Lo stato salvato: a che missione è ogni capitolo, i bonus fatti, i posti visti e cosa si segue. */
export interface QuestState {
  ch: Record<string, number>;
  bonus: Record<string, boolean>;
  visited: Record<string, boolean>;
  /** Il capitolo (o bonus) seguito da frecce e freccetta; 'none' = niente frecce. */
  follow?: string;
  /** Giocava già prima dei capitoli: il Capitolo 1 (sopravvivenza) gli vale come fatto. */
  old?: true;
}

export const newQuests = (): QuestState => ({ ch: {}, bonus: {}, visited: {} });

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Legge lo stato dal salvataggio, scartando quello che non torna. */
export function decodeQuests(value: unknown): QuestState {
  const out = newQuests();
  if (!record(value)) return out;
  if (record(value.ch))
    for (const c of CHAPTERS) {
      const i = value.ch[c.id];
      if (Number.isSafeInteger(i))
        out.ch[c.id] = Math.max(0, Math.min(c.quests.length, i as number));
    }
  if (record(value.bonus))
    for (const b of BONUS) if (value.bonus[b.id] === true) out.bonus[b.id] = true;
  if (record(value.visited))
    for (const [k, v] of Object.entries(value.visited))
      if (v === true && /^[A-Za-z_]{1,30}$/.test(k)) out.visited[k] = true;
  if (typeof value.follow === 'string' && followable(value.follow)) out.follow = value.follow;
  if (value.old === true) out.old = true;
  return out;
}

const followable = (id: string): boolean =>
  id === 'none' ||
  /^oggi:[a-z_]{2,20}$/.test(id) ||
  CHAPTERS.some((c) => c.id === id) ||
  BONUS.some((b) => b.id === id);

export const chapterDone = (s: QuestState, c: Chapter): boolean =>
  (s.ch[c.id] ?? 0) >= c.quests.length;

/** Una missione completata in questo giro, con il premio (e il trofeo se chiude il capitolo). */
export interface QuestReward {
  id: string;
  title: string;
  reward: number;
  trophy?: string;
  chapterTitle?: string;
  bonus?: number;
}

/**
 * Fa avanzare i capitoli aperti e i bonus: in ogni capitolo si completano di fila le missioni già
 * fatte. Restituisce lo stato nuovo e i premi da dare (vuoto se non cambia niente).
 */
export function advanceQuests(
  s: QuestState,
  v: QuestView,
  chaptersOpen: boolean,
): { state: QuestState; rewards: QuestReward[] } {
  const state: QuestState = { ...s, ch: { ...s.ch }, bonus: { ...s.bonus } };
  const rewards: QuestReward[] = [];
  if (chaptersOpen)
    for (const c of CHAPTERS) {
      let i = state.ch[c.id] ?? 0;
      while (i < c.quests.length && c.quests[i].done(v)) {
        rewards.push({ id: c.quests[i].id, title: c.quests[i].title, reward: c.quests[i].reward });
        i++;
        if (i === c.quests.length)
          rewards.push({
            id: c.id,
            title: c.title,
            reward: c.bonus,
            trophy: c.trophy,
            chapterTitle: c.title,
            bonus: c.bonus,
          });
      }
      state.ch[c.id] = i;
    }
  for (const b of BONUS)
    if (!state.bonus[b.id] && b.done(v)) {
      state.bonus[b.id] = true;
      rewards.push({ id: b.id, title: b.title, reward: b.reward, trophy: b.medal });
    }
  return { state, rewards };
}

/** I trofei e le medaglie guadagnati, per la mensola. */
export function earnedTrophies(s: QuestState, welcomeDone: boolean): string[] {
  const out: string[] = [];
  if (welcomeDone || s.old) out.push(WELCOME_TROPHY);
  for (const c of CHAPTERS) if (chapterDone(s, c)) out.push(c.trophy);
  for (const b of BONUS) if (s.bonus[b.id]) out.push(b.medal);
  return out;
}

/** La missione di adesso di un capitolo o di un bonus seguito (o null se è finito). */
export function currentQuest(s: QuestState, id: string): Quest | null {
  const c = CHAPTERS.find((x) => x.id === id);
  if (c) return chapterDone(s, c) ? null : c.quests[s.ch[c.id] ?? 0];
  const b = BONUS.find((x) => x.id === id);
  return b && !s.bonus[b.id] ? b : null;
}

/** Cosa seguire: quello scelto se è ancora da fare, altrimenti il primo capitolo aperto. */
export function followed(s: QuestState): string | null {
  if (s.follow === 'none') return null;
  if (s.follow && currentQuest(s, s.follow)) return s.follow;
  const c = CHAPTERS.find((x) => !chapterDone(s, x));
  return c ? c.id : null;
}

/** I posti che i capitoli vogliono far visitare: si segnano quando ci si entra. */
export const QUEST_PLACES = ['centro_commerciale', 'bar', 'passeggiata', 'commissariato'];
