// Moderazione (passo 3), a ogni giro della manutenzione:
// - le segnalazioni nuove vanno sul gruppo Telegram dei collaboratori (nome, motivo, quante
//   persone; mai chi ha segnalato né i messaggi copiati) e si segnano con `tg`;
// - chi è segnalato da 3 persone diverse in 24 ore viene silenziato per 24 ore;
// - le sospensioni decise nel pannello (sims_bans) disattivano l'accesso, e scadute lo riattivano;
//   quelle con `del` (minorenni) diventano una richiesta di cancellazione dell'account;
// - silenzi e sospensioni finiti da 6 mesi si tolgono.
import {
  AUTO_MUTE_MS,
  MOD_KEEP_MS,
  autoMuteTelegramText,
  autoMutes,
  decodeBan,
  decodeMute,
  listReports,
  reportTelegramText,
  reportersOf,
} from '../../shared/moderation-rules.js';
import type { TelegramSender } from './suggestions.js';

interface Snapshot {
  val(): unknown;
}
interface Reference {
  get(): Promise<Snapshot>;
  set(value: unknown): Promise<unknown>;
  update(value: Record<string, unknown>): Promise<unknown>;
}
export interface ModerationDatabase {
  ref(path: string): Reference;
}
/** L'accesso degli account (firebase-admin/auth), solo quello che serve. */
export interface AccountSwitch {
  /** disattiva (true) o riattiva (false) l'accesso; false se l'account non c'è più */
  setDisabled(uid: string, disabled: boolean): Promise<boolean>;
}

const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** L'account (uid) di un personaggio. */
async function uidOf(database: ModerationDatabase, pid: string): Promise<string | null> {
  const accounts = (await database.ref('sims_accounts').get()).val();
  if (!rec(accounts)) return null;
  for (const [uid, a] of Object.entries(accounts)) if (rec(a) && a.playerId === pid) return uid;
  // un personaggio di prima dell'accesso con Google, o di una vita passata: player_<uid>…
  const m = /^player_([A-Za-z0-9]{20,40})(?:_r|$)/.exec(pid);
  return m && rec(accounts[m[1]]) ? m[1] : null;
}

export interface ModerationResult {
  sent: number;
  muted: string[];
  banned: number;
  restored: number;
  deletions: number;
}

export async function moderate(
  database: ModerationDatabase,
  now: number,
  telegram: TelegramSender | null,
  accounts: AccountSwitch,
): Promise<ModerationResult> {
  const result: ModerationResult = { sent: 0, muted: [], banned: 0, restored: 0, deletions: 0 };
  const reports = listReports((await database.ref('sims_reports').get()).val());
  const mutes = (await database.ref('sims_mutes').get()).val();

  // 1. le segnalazioni nuove sul gruppo, una per segnalato
  if (telegram) {
    const fresh = reports.filter((r) => !r.tg);
    for (const who of new Set(fresh.map((r) => r.who))) {
      const mine = fresh.filter((r) => r.who === who);
      const text = reportTelegramText(
        mine[mine.length - 1].name,
        mine.map((r) => r.reason),
        Math.max(1, reportersOf(reports, who, now)),
      );
      if (!(await telegram(text))) continue;
      await database
        .ref('sims_reports')
        .update(Object.fromEntries(mine.map((r) => [`${r.by}/${r.who}/tg`, true])));
      result.sent += mine.length;
    }
  }

  // 2. il silenzio automatico
  for (const pid of autoMutes(reports, mutes, now)) {
    await database.ref(`sims_mutes/${pid}`).set({ until: now + AUTO_MUTE_MS, t: now, why: 'auto' });
    result.muted.push(pid);
    const name = [...reports].reverse().find((r) => r.who === pid)?.name || pid;
    if (telegram) await telegram(autoMuteTelegramText(name));
  }

  // 3. sospensioni, riattivazioni e cancellazioni dei minorenni
  const bans = (await database.ref('sims_bans').get()).val();
  for (const [pid, raw] of Object.entries(rec(bans) ? bans : {})) {
    const ban = decodeBan(raw);
    if (!ban) continue;
    const uid = await uidOf(database, pid);
    if (ban.del) {
      // la cancellazione vera la fa processDeletionRequests, come per chi la chiede dal profilo
      if (uid) await database.ref(`sims_deletions/${uid}`).set({ at: now, by: 'moderazione' });
      await database.ref(`sims_bans/${pid}`).set(null);
      result.deletions++;
      continue;
    }
    if (ban.until > now && !ban.applied) {
      if (uid) await accounts.setDisabled(uid, true);
      await database.ref(`sims_bans/${pid}/applied`).set(true);
      result.banned++;
    } else if (ban.until <= now && ban.applied) {
      if (uid) await accounts.setDisabled(uid, false);
      await database.ref(`sims_bans/${pid}/applied`).set(false);
      result.restored++;
    } else if (ban.until <= now && now - Math.max(ban.until, ban.t) > MOD_KEEP_MS) {
      await database.ref(`sims_bans/${pid}`).set(null);
    }
  }

  // 4. silenzi finiti da 6 mesi
  const old = Object.entries(rec(mutes) ? mutes : {})
    .filter(([, m]) => {
      const d = decodeMute(m);
      return !d || (d.until <= now && now - Math.max(d.until, d.t) > MOD_KEEP_MS);
    })
    .map(([pid]) => [pid, null]);
  if (old.length) await database.ref('sims_mutes').update(Object.fromEntries(old));
  return result;
}
