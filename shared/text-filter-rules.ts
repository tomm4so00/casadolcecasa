// Il filtro dei testi scritti dai giocatori (chat, fumetto, nomi, quadri, epitaffi). È leggero
// apposta: parolacce e bestemmie passano. Si coprono con *** solo tre cose:
// - gli insulti d'odio (razzisti, omofobi, contro i disabili);
// - il sessuale esplicito;
// - i contatti fuori dal gioco: link, telefoni, email e @nome.
// Si usa quando si scrive e quando si legge (chi ha una versione vecchia scrive di tutto).
// Non è a prova di bomba: per chi lo aggira ci sono blocco, segnalazione e moderazione.
// Regole senza browser, usate dal gioco e dai test (e un domani dal server).

export type TextProblem = 'odio' | 'sessuale' | 'contatto';

/** Quello che mettiamo al posto di una parte vietata. */
export const MASK = '***';

// Le parole sono scritte come dopo la normalizzazione (minuscole, senza accenti). Con l'asterisco
// finale vale anche tutto quello che comincia così (ritardato, ritardata, ritardati…). Si
// confrontano parole intere: "negroni", "Mongolia" e "sono in ritardo" passano.
const WORDS: Record<Exclude<TextProblem, 'contatto'>, string[]> = {
  odio: [
    // razzisti
    'negro',
    'negri',
    'negra',
    'negre',
    'negretto',
    'negretti',
    'negraccio',
    'negracci',
    'nigger',
    'niggers',
    'nigga',
    'niggas',
    'zingaro',
    'zingara',
    'zingari',
    'zingare',
    'zingaraccio',
    // omofobi
    'froc*',
    'frosc*',
    'ricchion*',
    'recchion*',
    'culatton*',
    'checca',
    'checche',
    'busone',
    'busoni',
    'faggot',
    'faggots',
    // contro i disabili
    'ritardat*',
    'mongoloid*',
    'mongolo',
    'mongola',
    'mongoli',
    'mongole',
    'handicappat*',
    'spastic*',
    'cerebroles*',
    'subnormal*',
    'retard',
    'retarded',
  ],
  sessuale: [
    'pompin*',
    'sborra',
    'sborre',
    'sborrata',
    'sborrate',
    'sborrare',
    'sborrone',
    'sborroni',
    'porno',
    'porn',
    'pornhub',
    'xvideos',
    'masturb*',
    'orgasm*',
    'stupr*',
    'pedopornograf*',
    'anale',
    'nudes',
  ],
};

// Numeri al posto delle lettere: n3gr0, fr0c10, 5borra.
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

const plain = (word: string): string =>
  word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[0-9@$]/g, (c) => LEET[c] ?? c);

/** Le forme da confrontare: com'è, e con le lettere ripetute ridotte (neeegro, frooocio). */
function forms(word: string): string[] {
  const p = plain(word);
  return [p, p.replace(/(.)\1+/g, '$1'), p.replace(/(.)\1{2,}/g, '$1$1')];
}

function wordProblem(word: string): TextProblem | null {
  const candidates = forms(word);
  for (const kind of ['odio', 'sessuale'] as const)
    for (const entry of WORDS[kind]) {
      const stem = entry.endsWith('*') ? entry.slice(0, -1) : null;
      if (candidates.some((c) => (stem ? c.startsWith(stem) : c === entry))) return kind;
    }
  return null;
}

const LETTER = '[\\p{L}\\p{N}]';
// I contatti: link, domini (nome.com, t.me/…), email, @nome e telefoni (9 cifre o più, anche
// separate da spazi o punti; i prezzi del gioco ne hanno al massimo 7).
const CONTACTS: RegExp[] = [
  /(?:https?:\/\/|www\.)\S+/giu,
  /[^\s@]+@[^\s@]+\.[^\s@]+/gu,
  new RegExp(
    `(?<!${LETTER})${LETTER}[\\p{L}\\p{N}-]*(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:com|it|net|org|io|me|gg|ly|xyz|info|eu|co|app|link|ru|tv|ws|site|online|shop|to|cc)(?!${LETTER})(?:\\/\\S*)?`,
    'giu',
  ),
  new RegExp(`(?<!${LETTER})@[\\p{L}\\p{N}_.]{2,}`, 'gu'),
  /(?<!\p{N})\+?\p{N}(?:[\s./-]?\p{N}){8,}(?!\p{N})/gu,
];

export interface Filtered {
  /** Il testo con le parti vietate coperte. */
  text: string;
  /** Cosa si è coperto (vuoto se il testo andava bene). */
  problems: TextProblem[];
}

const cache = new Map<string, Filtered>();

/** Copre le parti vietate del testo e dice cosa ha coperto. */
export function filterText(input: string): Filtered {
  const hit = cache.get(input);
  if (hit) return hit;
  const problems = new Set<TextProblem>();
  let text = input;
  for (const re of CONTACTS)
    text = text.replace(re, () => {
      problems.add('contatto');
      return MASK;
    });
  // le parole, e le lettere staccate da spazi o punti (f r o c i o, n.e.g.r.o)
  const words = [...text.matchAll(/[\p{L}\p{N}@$]+/gu)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
    word: m[0],
  }));
  const spans: { start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    let j = i;
    while (
      j + 1 < words.length &&
      words[j].word.length === 1 &&
      words[j + 1].word.length === 1 &&
      /^[\s.\-_*]*$/.test(text.slice(words[j].end, words[j + 1].start))
    )
      j++;
    if (j - i >= 2) {
      const kind = wordProblem(
        words
          .slice(i, j + 1)
          .map((w) => w.word)
          .join(''),
      );
      if (kind) {
        problems.add(kind);
        spans.push({ start: words[i].start, end: words[j].end });
        i = j;
        continue;
      }
    }
    const kind = wordProblem(words[i].word);
    if (kind) {
      problems.add(kind);
      spans.push(words[i]);
    }
  }
  for (const s of spans.reverse()) text = text.slice(0, s.start) + MASK + text.slice(s.end);
  const result = { text, problems: [...problems] };
  if (cache.size > 2000) cache.clear();
  cache.set(input, result);
  return result;
}

/** Solo il testo coperto: per quello che arriva dagli altri giocatori. */
export const maskText = (input: string): string => filterText(input).text;

/** L'avviso per chi ha scritto: cosa gli abbiamo coperto, o null se niente. */
export function filterNotice(problems: TextProblem[]): string | null {
  if (!problems.length) return null;
  const what = problems.map((p) =>
    p === 'contatto'
      ? 'link, telefoni ed @'
      : p === 'odio'
        ? 'insulti d’odio'
        : 'contenuti sessuali espliciti',
  );
  return `✋ Abbiamo coperto alcune parti con ${MASK}: nel gioco niente ${what.join(', ')}.`;
}
