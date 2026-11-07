// Inviti: un giocatore manda il link del gioco a un amico. Se l'amico crea il suo primo
// personaggio partendo da quel link, ricevono 300€ a testa. Lo stesso link serve anche a
// chiamare chi gioca già: in quel caso nessun bonus, solo l'invito.

export const GAME_URL = 'https://tomm4so00.github.io/casadolcecasa/';
export const INVITE_BONUS = 300;
/** Bonus massimi per chi invita: crearsi account finti non deve diventare un mestiere. */
export const INVITE_MAX_PAID = 10;
/** Il link aperto resta valido una settimana: c'è tempo per registrarsi con calma. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_PARAM = 'invito';

const CODE = /^player_[A-Za-z0-9_-]{4,128}$/;

/** Il codice di chi invita, se è fatto bene. */
export function parseInviteCode(value: unknown): string | null {
  return typeof value === 'string' && CODE.test(value) ? value : null;
}

/** Il link da condividere. In modalità prova (nessun codice) è il link nudo del gioco. */
export function inviteLink(playerId: string | null): string {
  const code = parseInviteCode(playerId);
  return code ? `${GAME_URL}?${INVITE_PARAM}=${encodeURIComponent(code)}` : GAME_URL;
}

/**
 * Il messaggio da mandare. Con `link` il link personale sta dentro il testo: alcune app (WhatsApp
 * su certi telefoni) tengono solo il testo o solo l'indirizzo, e così l'invito non si perde.
 */
export function inviteMessage(nick: string, link?: string): string {
  const who = nick.trim() ? ` Sono «${nick.trim()}».` : '';
  return (
    `Vieni a giocare con me a Casa dolce casa! 🏠${who} ` +
    `Se è la prima volta che entri, con questo link riceviamo ${INVITE_BONUS}€ a testa:` +
    (link ? '\n' + link : '')
  );
}

/** L'invito ricordato sul dispositivo: chi invita e quando è stato aperto il link. */
export interface PendingInvite {
  by: string;
  t: number;
}

export function decodePendingInvite(value: unknown, now: number): PendingInvite | null {
  if (!value || typeof value !== 'object') return null;
  const { by, t } = value as Record<string, unknown>;
  const code = parseInviteCode(by);
  if (!code || typeof t !== 'number' || !Number.isFinite(t)) return null;
  if (now - t > INVITE_TTL_MS || t - now > 60_000) return null;
  return { by: code, t };
}

/**
 * Il bonus da invitato spetta solo al primo personaggio di un account appena nato (non a chi
 * rinasce dopo la morte, che ha un codice diverso), una volta per dispositivo e mai a se stessi.
 */
export function canClaimInvite(state: {
  firstCharacter: boolean;
  myPlayerId: string;
  accountPlayerId: string;
  inviter: string;
  deviceAlreadyClaimed: boolean;
}): boolean {
  return (
    state.firstCharacter &&
    state.myPlayerId === state.accountPlayerId &&
    state.inviter !== state.myPlayerId &&
    !state.deviceAlreadyClaimed
  );
}

/**
 * I bonus guadagnati e non ancora versati in cassaforte, ricordati sul dispositivo: uno per
 * messaggio da mostrare al versamento. Più del tetto non se ne possono guadagnare.
 */
export function decodeOwedBonuses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m): m is string => typeof m === 'string' && m.length > 0 && m.length <= 300)
    .slice(0, INVITE_MAX_PAID + 1);
}

/** Gli invitati per cui chi invita non ha ancora ritirato il bonus, entro il tetto. */
export function invitesToPay(entries: Record<string, { paid?: boolean } | null> | null): string[] {
  const all = Object.entries(entries ?? {}).filter(([, e]) => e && typeof e === 'object');
  const paid = all.filter(([, e]) => e!.paid === true).length;
  const room = Math.max(0, INVITE_MAX_PAID - paid);
  return all
    .filter(([, e]) => e!.paid !== true)
    .map(([uid]) => uid)
    .sort()
    .slice(0, room);
}
