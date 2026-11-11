// Spazio espositivo delle aste dei quadri (regole in shared/auction-expiry.ts): a ogni giro, in
// ogni condominio, il timer di 7 giorni parte per i quadri all'asta con meno cuoricini (a parità,
// i più vecchi) oltre la soglia, il pittore riceve l'avviso sul telefono, e i quadri scaduti vengono buttati.
import {
  EXPIRE_AFTER_MS,
  expiryNotice,
  expiryPlan,
  readExpiryAuctions,
} from '../../shared/auction-expiry.js';
import { worldNodePath } from '../../shared/worlds.js';
import { type MaintenanceDatabase, type PushSender, worldIds } from './maintenance.js';

const GAME_URL = process.env.GAME_URL || 'https://tomm4so00.github.io/casadolcecasa/';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Chi abita nel condominio: solo le sue aste sono esposte (vedi openAuctions nel gioco). */
function residents(rooms: unknown): Set<string> {
  const out = new Set<string>();
  for (const r of Object.values(record(rooms) ? rooms : {}))
    if (record(r) && typeof r.ownerId === 'string') out.add(r.ownerId);
  return out;
}

/** Avviso sul telefono al pittore; i dispositivi non più validi vengono tolti. */
async function notifyPainter(
  database: MaintenanceDatabase,
  painter: string,
  id: string,
  send: PushSender,
): Promise<number> {
  const title = (await database.ref(`sims_painting_titles/${id}/title`).get()).val();
  const push = (await database.ref('sims_push/' + painter).get()).val();
  if (!record(push) || !record(push.tokens)) return 0;
  let sent = 0;
  for (const [key, entry] of Object.entries(push.tokens)) {
    if (!record(entry) || typeof entry.token !== 'string') continue;
    const result = await send(entry.token, {
      ...expiryNotice(typeof title === 'string' ? title : null),
      link: GAME_URL,
      tag: 'sims-art-expiry-' + id,
    });
    if (result === 'sent') sent++;
    if (result === 'gone') await database.ref(`sims_push/${painter}/tokens/${key}`).remove();
  }
  return sent;
}

/** Fa partire i timer e butta i quadri scaduti; restituisce quanti timer e quanti quadri buttati. */
export async function expireAuctions(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<{ started: number; removed: number }> {
  let started = 0,
    removed = 0;
  for (const world of await worldIds(database)) {
    const path = worldNodePath(world, 'auctions');
    const auctions = readExpiryAuctions((await database.ref(path).get()).val());
    if (!auctions.length) continue;
    const rooms = (await database.ref(worldNodePath(world, 'rooms_state')).get()).val();
    const plan = expiryPlan(auctions, residents(rooms), now);
    for (const id of plan.remove) {
      await database.ref(`${path}/${id}`).remove();
      removed++;
    }
    for (const id of plan.start) {
      await database.ref(`${path}/${id}`).update({ expiresAt: now + EXPIRE_AFTER_MS });
      started++;
      const painter = auctions.find((a) => a.id === id)!.by;
      await notifyPainter(database, painter, id, send);
    }
  }
  return { started, removed };
}
