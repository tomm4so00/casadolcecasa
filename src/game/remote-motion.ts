// Movimento fluido degli altri giocatori.
// Ognuno manda la sua posizione circa 5 volte al secondo (presence-send-rules.ts), con l'ora
// d'invio. Invece di inseguire l'ultima posizione arrivata (a strappi: veloce appena arriva, poi
// rallenta), si mostra il giocatore com'era poco fa, a metà strada tra due posizioni ricevute:
// così cammina a velocità costante anche se i messaggi arrivano in ritardo o a gruppi.

/** Ritardo con cui si mostrano gli altri (ms): copre le irregolarità della rete. */
export const RENDER_DELAY = 250;
/** Oltre questa distanza fra due posizioni è un salto (porta, cambio stanza): niente scivolata. */
const TELEPORT = 150;
/** Quanti campioni tenere. */
const KEEP = 12;
/** Di quanto (ms al secondo) si lascia "invecchiare" la stima del ritardo, per seguire gli orologi. */
const SKEW_DRIFT = 20;

interface Sample {
  t: number;
  x: number;
  y: number;
}

export interface Motion {
  buf: Sample[];
  /** Differenza minima vista fra "arrivato qui" e "inviato là" (ms): orologi diversi + rete. */
  skew: number | null;
  skewAt: number;
  lastT: number;
}

export const newMotion = (): Motion => ({ buf: [], skew: null, skewAt: 0, lastT: NaN });

/** Nuova posizione ricevuta: `t` = ora d'invio (orologio di chi la manda), `now` = ora locale. */
export function addSample(m: Motion, t: number, x: number, y: number, now: number): void {
  if (!Number.isFinite(t) || t === m.lastT) return;
  m.lastT = t;
  const last = m.buf[m.buf.length - 1];
  if (last && t <= last.t) return; // arrivato fuori ordine
  // salto lontano: si ricomincia da lì
  if (last && Math.hypot(x - last.x, y - last.y) > TELEPORT) m.buf.length = 0;
  m.buf.push({ t, x, y });
  if (m.buf.length > KEEP) m.buf.shift();
  // la stima più bassa è quella con meno ritardo di rete; piano piano si lascia salire
  const d = now - t;
  if (m.skew === null) m.skew = d;
  else m.skew = Math.min(m.skew + ((now - m.skewAt) / 1000) * SKEW_DRIFT, d);
  m.skewAt = now;
}

/** Dove mostrare il giocatore adesso (`now` = ora locale), o null se non si sa ancora nulla. */
export function positionAt(m: Motion, now: number): { x: number; y: number } | null {
  const buf = m.buf;
  if (!buf.length || m.skew === null) return null;
  // ora "di chi manda" che si vuole mostrare
  const t = now - m.skew - RENDER_DELAY;
  if (t <= buf[0].t) return { x: buf[0].x, y: buf[0].y };
  for (let i = 1; i < buf.length; i++) {
    const a = buf[i - 1],
      b = buf[i];
    if (t <= b.t) {
      // dopo una lunga pausa (fermo, nessun messaggio) si parte dall'ultimo tratto, non da secondi fa
      const span = Math.min(b.t - a.t, 250);
      const k = Math.max(0, Math.min(1, 1 - (b.t - t) / span));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const end = buf[buf.length - 1];
  return { x: end.x, y: end.y };
}
