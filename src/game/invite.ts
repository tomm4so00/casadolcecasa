// Inviti: il pulsante del profilo condivide il link del gioco (WhatsApp, Telegram, Messaggi…).
// Chi entra per la prima volta da quel link riceve 300Đ, e altrettanti ne riceve chi l'ha invitato.
import { currentWorldCode } from './world-select.js';
import { googlePlayerId } from './account-model.js';
import { creditMoney } from './economy.js';
import { game } from './context.js';
import type { GameValue } from './context.js';
import {
  INVITE_BONUS,
  INVITE_MAX_PAID,
  INVITE_PARAM,
  WORLD_PARAM,
  canClaimInvite,
  decodeOwedBonuses,
  decodePendingInvite,
  inviteLink,
  inviteMessage,
  invitesToPay,
  parseInviteCode,
} from './invite-rules.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import { browser, lifetime } from './runtime.js';
import { hasRoom } from './saves.js';
import { isGuest, requireAccount } from './guest.js';

const PENDING_KEY = 'sims_invite_from';
const WORLD_KEY = 'sims_invite_world';
const CLAIMED_KEY = 'sims_invite_claimed';
/** Il promemoria arriva dopo gli avvisi dell'ingresso (stanza, modalità prova…). */
const REMINDER_AFTER_MS = 9000;

/** A ogni ingresso in partita: ricorda che dal profilo si possono invitare gli amici. */
export function remindInvite(): void {
  lifetime.setTimeout(
    () =>
      toast(
        `💌 Invita qualcuno a giocare: apri il profilo (🧑) e tocca «Invita amici». Se è la sua prima volta, ricevete ${INVITE_BONUS}Đ a testa!`,
        8000,
      ),
    REMINDER_AFTER_MS,
  );
}

function storage(key: string): string {
  return game.session.LS_PREFIX + key;
}

/**
 * All'apertura della pagina: se il link porta un invito lo ricorda sul dispositivo (la
 * registrazione può passare da Google e ricaricare la pagina). Il codice resta nell'indirizzo
 * finché l'invito non è usato: chi apre il link dentro WhatsApp o Instagram, dove Google non
 * lascia accedere, passa al browser con «Apri nel browser» e l'invito deve venire con lui.
 */
export function rememberInviteFromUrl(): void {
  const params = new URL(browser.location.href).searchParams;
  // il condominio di chi invita: ci entra chi gioca da ospite (vedi enterFirstWorldAsGuest)
  const world = params.get(WORLD_PARAM);
  try {
    if (world) localStorage.setItem(storage(WORLD_KEY), world);
  } catch {
    // senza memoria del browser si entra in un condominio con posti liberi
  }
  const raw = params.get(INVITE_PARAM);
  if (raw === null) return;
  const by = parseInviteCode(raw);
  try {
    if (by) localStorage.setItem(storage(PENDING_KEY), JSON.stringify({ by, t: Date.now() }));
  } catch {
    // Senza memoria del browser l'invito vale solo se ci si registra subito: pazienza.
  }
}

/** Il condominio del link d'invito, una volta sola (poi si dimentica). */
export function takeInvitedWorld(): string | null {
  try {
    const world = localStorage.getItem(storage(WORLD_KEY));
    localStorage.removeItem(storage(WORLD_KEY));
    return world;
  } catch {
    return null;
  }
}

/** A invito usato (o inutile) il codice si toglie dall'indirizzo. */
function forgetInviteInUrl(): void {
  const url = new URL(browser.location.href);
  if (!url.searchParams.has(INVITE_PARAM) && !url.searchParams.has(WORLD_PARAM)) return;
  url.searchParams.delete(INVITE_PARAM);
  url.searchParams.delete(WORLD_PARAM);
  browser.history.replaceState(browser.history.state, '', url.pathname + url.search + url.hash);
}

// ---------------------------------------------------------------- bonus da versare

/**
 * Un bonus guadagnato si segna sul dispositivo prima di versarlo: l'invito nel database si
 * registra una volta sola, e se poi il versamento non riesce (rete, sessione) si riprova al
 * prossimo ingresso invece di perderlo. Una copia in memoria vale anche senza localStorage.
 */
let owedMemo: { key: string; list: string[] } | null = null;

function owedKey(): string {
  return storage('sims_invite_owed:' + game.session.myPlayerId);
}

function readOwed(): string[] {
  const key = owedKey();
  if (owedMemo?.key !== key) {
    let list: string[] = [];
    try {
      list = decodeOwedBonuses(JSON.parse(localStorage.getItem(key) || 'null'));
    } catch {
      // memoria del browser illeggibile: vale la copia in memoria
    }
    owedMemo = { key, list };
  }
  return owedMemo.list;
}

function writeOwed(list: string[]): void {
  const key = owedKey();
  owedMemo = { key, list };
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch {
    // resta la copia in memoria: vale fino alla chiusura della pagina
  }
}

function owe(message: string): void {
  writeOwed([...readOwed(), message]);
}

let crediting: Promise<void> | null = null;

/** Versa in cassaforte i bonus segnati, uno alla volta. Vero se non ne resta nessuno. */
async function drainOwed(): Promise<boolean> {
  while (readOwed().length) {
    if (!(await creditMoney(INVITE_BONUS))) return false;
    const [message, ...rest] = readOwed();
    writeOwed(rest);
    if (message) toast(message, 6000);
  }
  return true;
}

/**
 * Un versamento alla volta. Il `finally` va dopo l'assegnazione: con la lista vuota il corpo
 * finirebbe subito e `crediting` resterebbe una promessa già chiusa, che non paga più niente.
 * Un bonus segnato mentre si chiudeva il giro si versa con un giro nuovo; se uno non passa, si
 * riprova al prossimo ingresso.
 */
function payOwed(): Promise<void> {
  crediting ??= drainOwed()
    .catch(() => false)
    .then((ok) => {
      crediting = null;
      if (ok && readOwed().length) return payOwed();
    });
  return crediting;
}

function pendingInvite() {
  try {
    return decodePendingInvite(
      JSON.parse(localStorage.getItem(storage(PENDING_KEY)) || 'null'),
      Date.now(),
    );
  } catch {
    return null;
  }
}

/**
 * Dopo l'assegnazione della stanza: il nuovo arrivato con un invito riceve il suo bonus. Il
 * database accetta un solo invito per account, quindi una seconda volta la scrittura fallisce.
 */
export async function claimInvite(firstCharacter: boolean): Promise<void> {
  // un ospite tiene l'invito sul dispositivo: il bonus arriva quando salva il personaggio
  if (isGuest()) {
    forgetInviteInUrl();
    return;
  }
  try {
    await registerInvite(firstCharacter);
  } finally {
    forgetInviteInUrl();
  }
}

async function registerInvite(firstCharacter: boolean): Promise<void> {
  if (game.session.OFFLINE || !game.session.authUid) return;
  const invite = pendingInvite();
  if (!invite) return;
  const uid = game.session.authUid;
  const ok = canClaimInvite({
    firstCharacter,
    myPlayerId: game.session.myPlayerId,
    accountPlayerId: googlePlayerId(uid),
    inviter: invite.by,
    deviceAlreadyClaimed: !!localStorage.getItem(storage(CLAIMED_KEY)),
  });
  // Chi gioca già ha usato il link solo per raggiungere un amico: l'invito non serve più.
  if (!ok || !hasRoom()) {
    localStorage.removeItem(storage(PENDING_KEY));
    return;
  }
  try {
    await game.session.db.ref('/').update({
      [`sims_invited/${uid}`]: invite.by,
      // ora del server: il database rifiuta gli orari avanti più di un minuto
      [`sims_invites/${invite.by}/${uid}`]: {
        nick: game.player.myData.nick,
        t: Date.now() + (game.session.serverOffset || 0),
      },
    });
  } catch (e) {
    console.warn('[inviti] registrazione', e);
    localStorage.removeItem(storage(PENDING_KEY));
    return;
  }
  localStorage.removeItem(storage(PENDING_KEY));
  localStorage.setItem(storage(CLAIMED_KEY), '1');
  owe(`🎉 Invito di un amico: +${INVITE_BONUS}Đ in cassaforte, a te e a chi ti ha invitato!`);
  await payOwed();
}

/** Chi invita ritira il bonus per ogni amico arrivato, anche mentre sta giocando. */
export function startInviteRewards(): void {
  if (game.session.OFFLINE || !hasRoom()) return;
  // bonus rimasti in sospeso da una sessione precedente
  void payOwed();
  let paying = false;
  let latest: Record<string, GameValue> | null = null;
  // Ogni amico si prova a pagare una volta per sessione: se non riesce, alla prossima apertura.
  const tried = new Set<string>();
  // Un amico che arriva mentre se ne sta pagando un altro si paga subito dopo.
  const settle = (): void => {
    const due = invitesToPay(latest).filter((uid) => !tried.has(uid));
    if (paying || !due.length) return;
    paying = true;
    due.forEach((uid) => tried.add(uid));
    void payInvites(due, latest ?? {}).finally(() => {
      paying = false;
      settle();
    });
  };
  game.session.db
    .ref(`sims_invites/${game.session.myPlayerId}`)
    .on('value', (snap?: GameValue): GameValue => {
      latest = snap?.val() ?? null;
      settle();
    });
}

async function payInvites(uids: string[], entries: Record<string, GameValue>): Promise<void> {
  for (const uid of uids) {
    const paid = game.session.db.ref(`sims_invites/${game.session.myPlayerId}/${uid}/paid`);
    try {
      // Prima si segna, poi si paga: se due schede aprono il gioco insieme, paga una sola.
      const result = await paid.transaction((value) => (value === true ? undefined : true));
      if (!result.committed) continue;
    } catch (e) {
      console.warn('[inviti] bonus', e);
      continue;
    }
    const nick = String(entries[uid]?.nick || 'Un amico').slice(0, 20);
    owe(`🎉 Nuovo amico in città: ${nick} ha usato il tuo invito. +${INVITE_BONUS}Đ!`);
  }
  await payOwed();
}

/** Quanti amici sono arrivati con il mio invito (per la finestra del profilo). */
async function invitedCount(): Promise<number | null> {
  if (game.session.OFFLINE) return null;
  try {
    const snap = await game.session.db.ref(`sims_invites/${game.session.myPlayerId}`).get();
    return Object.keys(snap.val() ?? {}).length;
  } catch {
    return null;
  }
}

async function copyLink(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('📋 Link copiato: incollalo dove vuoi.');
  } catch {
    toast(text, 10000);
  }
}

/** Il pulsante "Invita amici" del profilo. */
export async function openInvite(): Promise<void> {
  if (!(await requireAccount('invitare gli amici e ricevere il bonus'))) return;
  const link = inviteLink(
    game.session.OFFLINE ? null : game.session.myPlayerId,
    game.session.OFFLINE ? undefined : currentWorldCode(),
  );
  const nick = game.player.myData.nick || '';
  // il codice del condominio: chi arriva lo scrive alla prima schermata e abita vicino a te
  const world = `\n🌍 Il mio condominio: ${currentWorldCode()}`;
  // il messaggio completo, con il link personale dentro il testo
  const message = inviteMessage(nick, link) + world;
  const count = await invitedCount();
  const canShare = typeof navigator.share === 'function';
  const res = await openDialog({
    title: '💌 Invita amici',
    text:
      'Manda il link del gioco a chi vuoi: per giocare insieme online, o per far conoscere ' +
      `Casa dolce casa a qualcuno di nuovo.\n\n🎁 Se un amico entra per la prima volta dal tuo link, ricevete ${INVITE_BONUS}Đ a testa` +
      ` (fino a ${INVITE_MAX_PAID} amici).` +
      (count !== null ? `\n\nAmici arrivati con il tuo invito: ${count}` : '') +
      `\n\n🔗 Il tuo link personale:\n${link}` +
      `\n\n🌍 Per abitare nel tuo stesso condominio scrivono il codice ${currentWorldCode()}.` +
      (game.session.OFFLINE
        ? '\n\n🧪 Sei in modalità prova: il link non porta il tuo invito e niente bonus.'
        : ''),
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      ...(canShare
        ? [{ label: '📤 Condividi', value: 'share', color: '#2ed573', wide: true }]
        : []),
      { label: '💬 WhatsApp', value: 'whatsapp', color: '#25d366' },
      ...(canShare ? [] : [{ label: '✈️ Telegram', value: 'telegram', color: '#2e86de' }]),
      { label: '📋 Copia link', value: 'copy', color: '#e67e22' },
    ],
  });
  if (res.action === 'share') {
    try {
      // niente `url` a parte: qualche app terrebbe solo uno dei due pezzi e perderebbe l'invito
      await navigator.share({ title: 'Casa dolce casa', text: message });
    } catch (e) {
      // Chiusa senza scegliere un'app: niente da fare. Altri errori: si copia il link.
      if ((e as Error)?.name !== 'AbortError') await copyLink(message);
    }
  }
  if (res.action === 'whatsapp')
    browser.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  if (res.action === 'telegram')
    // Telegram aggiunge da sé il link (url) sotto il testo
    browser.open(
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(inviteMessage(nick) + world)}`,
      '_blank',
    );
  if (res.action === 'copy') await copyLink(message);
}
