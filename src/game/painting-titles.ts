// Titoli dei quadri: si leggono da tutti, li scrive chi dà il nome al quadro (di solito l'autore).
import { filterNotice, filterText, maskText } from '../../shared/text-filter-rules.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import {
  TITLE_MAX,
  type PaintingTitle,
  cleanTitle,
  decodeTitle,
  paintingId,
  quoted,
  titleError,
} from './painting-title-rules.js';

let titles: Record<string, PaintingTitle> = {};
let started = false;

/** Ascolta i titoli di tutti i quadri. */
export function startPaintingTitles(): void {
  if (started) return;
  started = true;
  game.session.db.ref('sims_painting_titles').on('value', (snap: GameValue): void => {
    const v: GameValue = snap.val() || {};
    const out: Record<string, PaintingTitle> = {};
    for (const id of Object.keys(v)) {
      const t = decodeTitle(v[id]);
      if (t) out[id] = t;
    }
    titles = out;
  });
}

/** Titolo del quadro (null se non ne ha ancora uno). */
export function paintingTitle(code: string | null | undefined): string | null {
  const title = code ? titles[paintingId(code)]?.title : null;
  // l'ha scritto un giocatore, magari con una versione vecchia: si copre quello che non va
  return title ? maskText(title) : null;
}

/** «Titolo» oppure "" se non ha nome. */
export const quotedTitle = (code: string | null | undefined): string => quoted(paintingTitle(code));

/** Può dare o cambiare il nome: se non ce l'ha ancora, o se il nome l'ha dato lui. */
export function canNamePainting(code: string): boolean {
  const t = titles[paintingId(code)];
  return !t || t.by === game.session.myPlayerId;
}

/** Chiede il titolo e lo salva. `intro` = testo sopra il campo. Restituisce il titolo salvato. */
export async function askPaintingTitle(code: string, intro: string): Promise<string | null> {
  if (!canNamePainting(code)) {
    toast('Il nome di questo quadro l’ha dato il suo autore.', 3500);
    return null;
  }
  const current = paintingTitle(code);
  for (;;) {
    const res = await openDialog({
      title: current ? '✏️ Cambia il nome del quadro' : '✏️ Dai un nome al quadro',
      text:
        intro +
        (current ? `\n\nOra si chiama ${quoted(current)}.` : '') +
        `\n\nAl massimo ${TITLE_MAX} caratteri: lo vedranno tutti, anche chi lo compra.`,
      input: { placeholder: 'es. Tramonto sul mare', maxLength: TITLE_MAX },
      buttons: [
        { label: current ? 'Annulla' : 'Senza nome', value: null, color: '#57606f' },
        { label: '💾 Salva il nome', value: 'ok', color: '#2ed573' },
      ],
    });
    if (res.action !== 'ok') return null;
    const error = titleError(res.value);
    if (error) {
      toast('❌ ' + error, 3500);
      continue;
    }
    const { text: title, problems } = filterText(cleanTitle(res.value));
    const notice = filterNotice(problems);
    if (notice) toast(notice, 5000);
    try {
      await game.session.db
        .ref('sims_painting_titles/' + paintingId(code))
        .set({ title, by: game.session.myPlayerId, t: Date.now() });
      titles[paintingId(code)] = { title, by: game.session.myPlayerId, t: Date.now() };
      toast(`🖼️ Il quadro ora si chiama ${quoted(title)}!`, 3500);
      return title;
    } catch (error) {
      console.warn('[titoli]', error);
      toast('Non sono riuscito a salvare il nome. Riprova quando sei connesso.', 4000);
      return null;
    }
  }
}
