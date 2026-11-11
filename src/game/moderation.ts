// Moderazione (passo 3) nel gioco: chi è silenziato non scrive in chat né nel fumetto e sa fino a
// quando; i fumetti dei silenziati non si vedono. Il moderatore (sims_mods/<uid>, lo nomina il
// gestore con scripts/segnalazioni.mjs) ha nel profilo il pannello: segnalazioni, messaggi
// copiati, silenzi, sospensioni, cancellazione dei minorenni. Le sospensioni le esegue il server.
import { game } from './context.js';
import { openDialog } from './interface.js';
import { toast } from './missions.js';
import {
  BAN_CHOICES,
  FOREVER,
  MUTE_CHOICES,
  type ReportEntry,
  decodeBan,
  decodeMute,
  isActive,
  listReports,
  reasonLabel,
  untilText,
} from '../../shared/moderation-rules.js';
import { LEGACY_WORLD, isWorldCode, worldNodePath } from '../../shared/worlds.js';

const CONTACT = 'casadolcecasa.gioco@gmail.com';
let mutes: Record<string, unknown> = {};
let mod = false;
let started = false;

/** Si ascoltano i silenzi e se sono moderatore (una volta sola). */
export function startModeration(): void {
  if (started || game.session.OFFLINE) return;
  started = true;
  game.session.db.ref('sims_mutes').on('value', (s) => {
    const v = s.val();
    mutes = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  });
  const uid = game.session.authUid;
  if (uid)
    game.session.db.ref(`sims_mods/${uid}`).on('value', (s) => {
      mod = s.val() === true;
    });
}

/** Questo giocatore è silenziato adesso? */
export const isMuted = (pid: unknown): boolean =>
  typeof pid === 'string' && isActive(decodeMute(mutes[pid]), Date.now());

/** Sono moderatore? (il pulsante nel profilo) */
export const isModerator = (): boolean => mod;

/** Prima di scrivere: se sono silenziato lo dico e restituisco true (non si scrive). */
export function stoppedByMute(): boolean {
  const m = decodeMute(mutes[game.session.myPlayerId]);
  if (!isActive(m, Date.now())) return false;
  void openDialog({
    title: '🔇 Sei stato silenziato',
    text:
      `Non puoi scrivere in chat né nel fumetto ${untilText(m!.until)}, per le segnalazioni di ` +
      `altri giocatori.\n\nIl resto del gioco funziona come sempre. Se pensi sia un errore ` +
      `scrivi a ${CONTACT}.`,
    buttons: [{ label: 'Ho capito', value: null, color: '#57606f' }],
  });
  return true;
}

// ---------------------------------------------------------------- il pannello

const when = (t: number) =>
  new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

async function readAll() {
  const db = game.session.db;
  const [r, m, b] = await Promise.all([
    db.ref('sims_reports').get(),
    db.ref('sims_mutes').get(),
    db.ref('sims_bans').get(),
  ]);
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  return { reports: listReports(r.val()), mutes: obj(m.val()), bans: obj(b.val()) };
}

/** Profilo → 🛡️ Moderazione: l'elenco dei giocatori segnalati, silenziati o sospesi. */
export async function openModPanel(): Promise<void> {
  if (!mod) return;
  for (;;) {
    let data;
    try {
      data = await readAll();
    } catch (error) {
      console.warn('[moderazione]', error);
      toast('❌ Non riesco a leggere le segnalazioni.', 4000);
      return;
    }
    const now = Date.now();
    const pids = new Set<string>(data.reports.map((r) => r.who));
    for (const [pid, m] of Object.entries(data.mutes))
      if (isActive(decodeMute(m), now)) pids.add(pid);
    for (const [pid, b] of Object.entries(data.bans)) if (decodeBan(b)) pids.add(pid);
    const rows = [...pids]
      .map((pid) => {
        const mine = data.reports.filter((r) => r.who === pid);
        const name = mine[mine.length - 1]?.name || pid;
        const muted = isActive(decodeMute(data.mutes[pid]), now) ? ' 🔇' : '';
        const banned = isActive(decodeBan(data.bans[pid]), now) ? ' ⛔' : '';
        return {
          pid,
          name,
          n: new Set(mine.map((r) => r.by)).size,
          last: mine.at(-1)?.t ?? 0,
          muted,
          banned,
        };
      })
      .sort((a, b) => b.n - a.n || b.last - a.last);
    const res = await openDialog({
      title: '🛡️ Moderazione',
      text: rows.length
        ? 'Tocca un giocatore per vedere segnalazioni e messaggi e decidere.'
        : 'Nessuna segnalazione aperta. 🎉',
      buttons: [
        ...rows.slice(0, 25).map((r) => ({
          label: `${r.name} · 🚩 ${r.n}${r.muted}${r.banned}`,
          value: r.pid,
          color: '#636e72',
          wide: true,
        })),
        { label: 'Chiudi', value: null, color: '#57606f', wide: true },
      ],
    });
    if (!res.action) return;
    const row = rows.find((r) => r.pid === res.action);
    if (row)
      await openPlayerCase(
        row.pid,
        row.name,
        data.reports.filter((r) => r.who === row.pid),
      );
  }
}

function caseText(name: string, reports: ReportEntry[], mute: string, ban: string): string {
  const lines = reports.map((r) => {
    const msgs = r.msgs.map((m) => `   💬 ${when(m.t)} ${m.text}`).join('\n');
    return (
      `• ${reasonLabel(r.reason)} · ${when(r.t)} · ${r.world}` +
      (r.note ? `\n   📝 ${r.note}` : '') +
      (msgs ? '\n' + msgs : '')
    );
  });
  return (
    (mute ? `🔇 Silenziato ${mute}\n` : '') +
    (ban ? `⛔ Sospeso ${ban}\n` : '') +
    (mute || ban ? '\n' : '') +
    (lines.length ? lines.join('\n\n') : `Nessuna segnalazione aperta su ${name}.`)
  );
}

/** Un giocatore: segnalazioni, messaggi e provvedimenti. */
async function openPlayerCase(pid: string, name: string, reports: ReportEntry[]): Promise<void> {
  const db = game.session.db;
  const data = await readAll().catch(() => null);
  const now = Date.now();
  const mute = decodeMute(data?.mutes[pid]);
  const ban = decodeBan(data?.bans[pid]);
  const muted = isActive(mute, now);
  const banned = isActive(ban, now);
  const res = await openDialog({
    title: `🛡️ ${name}`,
    text: caseText(
      name,
      reports,
      muted ? untilText(mute!.until) : '',
      banned ? untilText(ban!.until) : '',
    ),
    buttons: [
      ...(muted
        ? [{ label: '🔊 Togli il silenzio', value: 'unmute', color: '#27ae60' }]
        : MUTE_CHOICES.map((c) => ({ label: c.label, value: c.id, color: '#e67e22' }))),
      ...(banned
        ? [{ label: '✅ Riattiva l’account', value: 'unban', color: '#27ae60' }]
        : BAN_CHOICES.map((c) => ({ label: c.label, value: c.id, color: '#c0392b' }))),
      { label: '🧹 Cancella i suoi messaggi', value: 'wipe', color: '#636e72', wide: true },
      { label: '🧒 Minorenne: cancella l’account', value: 'minor', color: '#8e2c2c', wide: true },
      ...(reports.length
        ? [{ label: '📁 Archivia le segnalazioni', value: 'archive', color: '#2d3436', wide: true }]
        : []),
      { label: '← Indietro', value: null, color: '#57606f', wide: true },
    ],
  });
  const act = res.action;
  if (!act) return;
  try {
    const muteChoice = MUTE_CHOICES.find((c) => c.id === act);
    const banChoice = BAN_CHOICES.find((c) => c.id === act);
    if (muteChoice) {
      const until = muteChoice.ms >= FOREVER ? FOREVER : now + muteChoice.ms;
      await db.ref(`sims_mutes/${pid}`).set({ until, t: now, why: 'moderatore' });
      toast(`🔇 ${name} silenziato ${untilText(until)}.`, 4000);
    } else if (act === 'unmute') {
      // il silenzio finisce adesso; resta la data della decisione (vedi autoMutes)
      await db.ref(`sims_mutes/${pid}`).set({ until: now, t: now, why: 'tolto' });
      toast(`🔊 ${name} può di nuovo scrivere.`, 4000);
    } else if (banChoice) {
      if (!(await confirm(`${banChoice.label}: ${name}?`, 'Il server lo esegue entro 15 minuti.')))
        return;
      const until = banChoice.ms >= FOREVER ? FOREVER : now + banChoice.ms;
      await db.ref(`sims_bans/${pid}`).set({ until, t: now, why: 'moderatore' });
      toast(`⛔ ${name} sospeso ${untilText(until)} (entro 15 minuti).`, 4000);
    } else if (act === 'unban') {
      await db.ref(`sims_bans/${pid}`).update({ until: now, t: now });
      toast(`✅ ${name} riattivato (entro 15 minuti).`, 4000);
    } else if (act === 'minor') {
      if (
        !(await confirm(
          `Cancellare l’account di ${name}?`,
          'È definitivo: il server cancella account, personaggi e dati entro 15 minuti.',
        ))
      )
        return;
      await db.ref(`sims_bans/${pid}`).set({ until: FOREVER, t: now, why: 'minore', del: true });
      toast(`🧒 Cancellazione di ${name} richiesta.`, 4000);
    } else if (act === 'wipe') {
      const n = await wipeMessages(pid, reports);
      toast(`🧹 Tolti ${n} messaggi di ${name}.`, 4000);
    } else if (act === 'archive') {
      await db
        .ref('sims_reports')
        .update(Object.fromEntries(reports.map((r) => [`${r.by}/${r.who}`, null])));
      toast(`📁 Segnalazioni su ${name} archiviate.`, 4000);
    }
  } catch (error) {
    console.warn('[moderazione]', error);
    toast('❌ Non è stato possibile. Riprova.', 4000);
  }
}

async function confirm(title: string, text: string): Promise<boolean> {
  const res = await openDialog({
    title,
    text,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Conferma', value: 'ok', color: '#c0392b' },
    ],
  });
  return res.action === 'ok';
}

/** Toglie i suoi messaggi dalla chat dei condomini delle segnalazioni (e da quello attuale). */
async function wipeMessages(pid: string, reports: ReportEntry[]): Promise<number> {
  const worlds = new Set<string>([game.session.worldId || LEGACY_WORLD]);
  for (const r of reports)
    if (r.world === LEGACY_WORLD || isWorldCode(r.world)) worlds.add(r.world);
  let n = 0;
  for (const world of worlds) {
    const path = worldNodePath(world, 'chat');
    const all = (await game.session.db.ref(path).get()).val() || {};
    const mine = Object.entries(all as Record<string, { id?: unknown }>)
      .filter(([, m]) => m && m.id === pid)
      .map(([k]) => [k, null]);
    if (mine.length) await game.session.db.ref(path).update(Object.fromEntries(mine));
    n += mine.length;
  }
  return n;
}
