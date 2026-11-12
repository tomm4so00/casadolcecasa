import { countUse } from './usage.js';
// La cassetta "Suggerimenti e bug" del cortile (regole in shared/suggestion-rules.ts): chi ha un
// account scrive un'idea o un bug; i collaboratori (sims_staff) li leggono qui e li segnano come
// letti. Il server li manda anche sul gruppo Telegram (server/src/suggestions.ts).
import { version } from '../../package.json';
import {
  KIND_LABEL,
  SUGGESTION_MAX,
  type Suggestion,
  type SuggestionKind,
  cleanSuggestion,
  cooldownLeft,
  sortSuggestions,
  suggestionProblem,
} from '../../shared/suggestion-rules.js';
import { game } from './context.js';
import { requireAccount } from './guest.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Collaboratore: legge i messaggi. Lo dice il database (sims_staff), non il gioco. */
let staff = false;
/** I messaggi, per i collaboratori (gli altri non possono leggerli). */
let inbox: (Suggestion & { id: string })[] = [];
let unread = 0;

/** Quanti messaggi nuovi ci sono (0 per chi non è collaboratore): il bollino sulla cassetta. */
export const unreadSuggestions = (): number => (staff ? unread : 0);

/** All'ingresso: scopre se si è collaboratori e, se sì, ascolta la cassetta. */
export function startSuggestions(): void {
  const uid = game.session.authUid;
  if (game.session.OFFLINE || !uid) return;
  const db = game.session.db;
  const box = db.ref('sims_suggestions').orderByChild('t').limitToLast(100);
  const onBox = (s: { val(): unknown }): void => {
    ({ list: inbox, unread } = sortSuggestions(s.val() as Record<string, unknown> | null));
  };
  db.ref('sims_staff/' + uid).on('value', (snap: { exists(): boolean }) => {
    const now = snap.exists();
    if (now === staff) return;
    staff = now;
    // solo i collaboratori possono leggere la cassetta: gli altri non la ascoltano nemmeno
    if (staff) box.on('value', onBox);
    else {
      box.off('value', onBox);
      inbox = [];
      unread = 0;
    }
  });
}

/** La cassetta: i collaboratori scelgono se leggere o scrivere, gli altri scrivono. */
export async function openSuggestionBox(): Promise<void> {
  countUse('suggerimenti');
  if (staff) {
    const res = await openDialog({
      title: '📮 Suggerimenti e bug',
      text: unread
        ? `Ci sono ${unread} messaggi nuovi.`
        : 'Nessun messaggio nuovo. Sei tra i collaboratori: puoi leggerli tutti.',
      buttons: [
        { label: '✍️ Scrivi', value: 'write', color: '#57606f' },
        { label: `📬 Leggi${unread ? ` (${unread})` : ''}`, value: 'read', color: '#2e86de' },
      ],
    });
    if (res.action === 'read') return readInbox();
    if (res.action !== 'write') return;
  }
  await writeSuggestion();
}

async function writeSuggestion(): Promise<void> {
  if (!(await requireAccount('scrivere un suggerimento'))) return;
  const db = game.session.db;
  const uid = game.session.authUid;
  if (!uid) return;
  // un messaggio ogni 10 minuti: prima di farlo scrivere, si controlla
  let last = 0;
  try {
    last = Number((await db.ref('sims_suggest_last/' + uid).once('value')).val()) || 0;
  } catch {
    // se non si riesce a leggerlo, ci pensano le regole del database
  }
  const wait = cooldownLeft(last, serverNow());
  if (wait > 0) {
    toast(`📮 Hai appena scritto: puoi mandarne un altro tra ${Math.ceil(wait / 60_000)} minuti.`);
    return;
  }
  const pick = await openDialog({
    title: '📮 Suggerimenti e bug',
    text:
      'Hai un’idea per migliorare il gioco o hai trovato qualcosa che non va? Scrivilo qui: ' +
      'lo leggono i creatori del gioco e i collaboratori, che lo ricevono anche su Telegram, ' +
      'insieme al nome del tuo personaggio. Non scrivere dati personali.\n\nDi cosa si tratta?',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: KIND_LABEL.bug, value: 'bug', color: '#e17055' },
      { label: KIND_LABEL.idea, value: 'idea', color: '#00b894' },
    ],
  });
  if (pick.action !== 'idea' && pick.action !== 'bug') return;
  const kind: SuggestionKind = pick.action;
  let draft = '';
  for (;;) {
    const res = await openDialog({
      title: KIND_LABEL[kind],
      text:
        kind === 'bug'
          ? 'Cosa è successo? Dove eri e cosa stavi facendo? Più dettagli scrivi, più è facile sistemarlo.'
          : 'Cosa ti piacerebbe trovare nel gioco?',
      input: {
        multiline: true,
        maxLength: SUGGESTION_MAX,
        value: draft,
        placeholder: `Scrivi qui (massimo ${SUGGESTION_MAX} caratteri)…`,
      },
      buttons: [
        { label: 'Annulla', value: null, color: '#57606f' },
        { label: '📮 Imbuca', value: 'ok', color: '#2e86de' },
      ],
    });
    if (res.action !== 'ok') return;
    draft = res.value;
    const problem = suggestionProblem(draft);
    if (!problem) break;
    toast(problem);
  }
  const t = serverNow();
  const note: Suggestion = {
    uid,
    pid: game.session.myPlayerId,
    nick: String(game.player.myData.nick || 'Anonimo').slice(0, 40),
    kind,
    text: cleanSuggestion(draft),
    t,
    v: version,
    ...(game.session.worldId ? { world: String(game.session.worldId).slice(0, 40) } : {}),
  };
  const key = db.ref('sims_suggestions').push().key;
  try {
    // messaggio e ora dell'ultimo invio insieme: le regole li controllano a vicenda
    await db.ref('').update({
      [`sims_suggestions/${key}`]: note,
      [`sims_suggest_last/${uid}`]: t,
    });
  } catch (e) {
    console.warn('[suggerimenti]', e);
    toast('📮 Non sono riuscito a imbucarlo: riprova tra qualche minuto.', 4000);
    return;
  }
  toast('📮 Grazie! Il tuo messaggio è nella cassetta.', 4000);
  game.player.stats.suggestions = (game.player.stats.suggestions || 0) + 1;
}

/** Quanto tempo fa, in breve. */
function ago(t: number, now: number): string {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 48) return h === 1 ? '1 ora fa' : `${h} ore fa`;
  return `${Math.round(h / 24)} giorni fa`;
}

/** I collaboratori leggono la cassetta e la segnano come letta. */
async function readInbox(): Promise<void> {
  const now = serverNow();
  const fresh = inbox.filter((s) => !s.seen);
  const text = inbox.length
    ? inbox
        .slice(0, 40)
        .map(
          (s) =>
            `${s.seen ? '' : '🆕 '}${KIND_LABEL[s.kind]} · ${s.nick} · ${ago(s.t, now)}` +
            (s.v ? ` · v${s.v}` : '') +
            `\n${s.text}`,
        )
        .join('\n\n')
    : 'La cassetta è vuota.';
  const res = await openDialog({
    title: `📬 Cassetta (${inbox.length})`,
    text,
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      ...(fresh.length ? [{ label: '✅ Segna come letti', value: 'seen', color: '#00b894' }] : []),
    ],
  });
  if (res.action !== 'seen') return;
  const updates: Record<string, boolean> = {};
  for (const s of fresh) updates[`sims_suggestions/${s.id}/seen`] = true;
  try {
    await game.session.db.ref('').update(updates);
    toast(`✅ ${fresh.length} messaggi segnati come letti.`);
  } catch (e) {
    console.warn('[suggerimenti]', e);
    toast('Non sono riuscito a segnarli come letti.');
  }
}
