import { randomBytes } from 'node:crypto';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { advanceMarket, BUSINESSES, holdingsFromRooms } from '../../shared/market.js';
import { activityTarget, type ActivityLog } from '../../shared/activity.js';
import { updateWeedMarket } from './street.js';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { processDeletionRequests } from './deletion.js';
import { cleanupGuests } from './guests.js';
import { notifyHacker } from './hacker.js';
import { notifyAnniversaries } from './couples.js';
import { expireAuctions } from './auctions.js';
import {
  type PushSender,
  cleanOldActivity,
  retireBusinesses,
  maintainGame,
  notifyRocketAlmostReady,
  sendDeathWarnings,
  notifyLimitedOffers,
  sendPetWarnings,
  worldIds,
} from './maintenance.js';
import { worldNodePath } from '../../shared/worlds.js';

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!projectId || !databaseURL) throw new Error('Missing Firebase project or database URL');
  const emulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
  let credential;
  if (emulator) {
    if (!projectId.startsWith('demo-')) throw new Error('Emulator tests require a demo project');
  } else {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REPOSITORY !== 'tomm4so00/casadolcecasa' ||
      process.env.GITHUB_REF !== 'refs/heads/main'
    )
      throw new Error('Production publishing is restricted to the main repository workflow');
    const secret = process.env.FIREBASE_MARKET_SERVICE_ACCOUNT;
    if (!secret) throw new Error('Missing FIREBASE_MARKET_SERVICE_ACCOUNT secret');
    let account;
    try {
      account = JSON.parse(secret);
    } catch {
      throw new Error('Invalid service account JSON');
    }
    if (account.project_id !== projectId) throw new Error('Service account project mismatch');
    const host = new URL(databaseURL).hostname;
    if (!host.endsWith('.firebaseio.com') && !host.endsWith('.firebasedatabase.app'))
      throw new Error('Invalid database host');
    credential = cert(account);
  }
  const app = initializeApp({
    projectId,
    databaseURL,
    ...(credential ? { credential } : {}),
    databaseAuthVariableOverride: { uid: 'market-publisher' },
  });
  try {
    const scheduledAt = Date.now();
    // Draw once per invocation, not inside the transaction updater (which may be retried).
    const samples = new Map(
      BUSINESSES.map(({ id }) => {
        const uniform = () => (randomBytes(4).readUInt32BE() + 0.5) / 4294967296;
        return [
          id,
          Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()),
        ] as const;
      }),
    );
    // Crollo o boom della borsa: si decide qui, una volta, e vale per tutti i giocatori.
    const uniform01 = () => (randomBytes(4).readUInt32BE() + 0.5) / 4294967296;
    const eventRolls = { roll: uniform01(), kind: uniform01() };
    // Domanda e offerta: quanto hanno investito in tutto i giocatori di tutti i mondi (la borsa
    // è una sola), attività per attività.
    const allRooms: unknown[] = [];
    for (const world of await worldIds(getDatabase(app))) {
      const rooms = (await getDatabase(app).ref(worldNodePath(world, 'rooms_state')).get()).val();
      if (rooms && typeof rooms === 'object') allRooms.push(...Object.values(rooms));
    }
    const holdings = holdingsFromRooms(allRooms);
    // Attività dei giocatori nel gioco: quanto spinge ogni quotazione (shared/activity.ts).
    const log = ((await getDatabase(app).ref('sims_activity').get()).val() || {}) as ActivityLog;
    const activity = Object.fromEntries(
      BUSINESSES.map(({ id }) => [id, activityTarget(log, id, scheduledAt)] as const),
    );
    const reference = getDatabase(app).ref('sims_market');
    const listener = reference.on('value', () => {});
    await reference.once('value');
    const result = await reference.transaction(
      (current: unknown) =>
        advanceMarket(
          current,
          scheduledAt,
          (id) => samples.get(id)!,
          eventRolls,
          holdings,
          activity,
        ) ?? undefined,
    );
    reference.off('value', listener);
    await maintainGame(getDatabase(app), scheduledAt);
    // prezzo dell'erba dallo spacciatore: un errore qui non blocca il resto
    try {
      const weed = await updateWeedMarket(getDatabase(app), scheduledAt, log);
      console.log(`Weed market: ref ${weed.ref}, push ${weed.push}`);
    } catch (error) {
      console.log('Weed market skipped:', (error as { code?: string }).code || String(error));
    }
    // Account da cancellare su richiesta del giocatore: dati di gioco e accesso.
    const deleteLogin = async (uid: string) => {
      try {
        await getAuth(app).deleteUser(uid);
      } catch (error) {
        // già cancellato: va bene così
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      }
    };
    try {
      const deleted = await processDeletionRequests(getDatabase(app), deleteLogin);
      if (deleted) console.log(`Accounts deleted on request: ${deleted}`);
    } catch (error) {
      console.log('Account deletions skipped:', (error as { code?: string }).code || String(error));
    }
    // Ospiti che non entrano da 7 giorni senza aver salvato il personaggio.
    try {
      const stillGuest = async (uid: string) => {
        try {
          // ancora anonimo: nessun accesso collegato (Google, email)
          return (await getAuth(app).getUser(uid)).providerData.length === 0;
        } catch (error) {
          if ((error as { code?: string }).code === 'auth/user-not-found') return true;
          throw error;
        }
      };
      const guests = await cleanupGuests(getDatabase(app), scheduledAt, stillGuest, deleteLogin);
      if (guests) console.log(`Inactive guests deleted: ${guests}`);
    } catch (error) {
      console.log('Guest cleanup skipped:', (error as { code?: string }).code || String(error));
    }
    // pulizia dei contatori e rimborsi delle attività tolte: un errore qui non blocca la borsa
    try {
      await cleanOldActivity(getDatabase(app), scheduledAt);
      // attività tolte dalla borsa: le quote ancora in giro diventano soldi in cassaforte
      const refunds = await retireBusinesses(getDatabase(app), scheduledAt);
      if (refunds) console.log(`Retired business holdings refunded: ${refunds}`);
    } catch (error) {
      console.log(
        'Activity cleanup or refunds skipped:',
        (error as { code?: string }).code || 'unknown error',
      );
    }
    // Avvisi sul telefono a chi sta per morire per assenza; un errore qui non blocca il resto.
    try {
      const messaging = getMessaging(app);
      const send: PushSender = async (token, m) => {
        try {
          await messaging.send({
            token,
            data: { title: m.title, body: m.body, link: m.link, tag: m.tag },
            webpush: { headers: { Urgency: 'high', TTL: String(12 * 3600) } },
          });
          return 'sent';
        } catch (error) {
          const code = (error as { code?: string }).code || '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          )
            return 'gone';
          console.log('Push not sent:', code || 'unknown error');
          return 'error';
        }
      };
      // Zero, lo scassinatore: annuncio delle 11:45 e promemoria prima dell'attacco
      const hacker = await notifyHacker(getDatabase(app), scheduledAt, send);
      if (hacker >= 0) console.log(`Hacker notifications sent: ${hacker}`);
      // anniversari delle coppie, la mattina
      const anniversaries = await notifyAnniversaries(getDatabase(app), scheduledAt, send);
      if (anniversaries >= 0) console.log(`Anniversary notifications sent: ${anniversaries}`);
      const rocket = await notifyRocketAlmostReady(getDatabase(app), scheduledAt, send);
      if (rocket >= 0) console.log(`Rocket almost ready, notifications sent: ${rocket}`);
      const warned = await sendDeathWarnings(getDatabase(app), scheduledAt, send);
      if (warned) console.log(`Death warnings sent: ${warned}`);
      const pets = await sendPetWarnings(getDatabase(app), scheduledAt, send);
      if (pets) console.log(`Pet warnings sent: ${pets}`);
      const offers = await notifyLimitedOffers(getDatabase(app), scheduledAt, send);
      if (offers) console.log(`Offer notifications sent: ${offers}`);
      // aste dei quadri oltre lo spazio espositivo: timer di 7 giorni, avviso e quadri scaduti
      const art = await expireAuctions(getDatabase(app), scheduledAt, send);
      if (art.started || art.removed)
        console.log(`Auction space: timers started ${art.started}, expired removed ${art.removed}`);
    } catch (error) {
      console.log('Death warnings skipped:', (error as { code?: string }).code || 'unknown error');
    }
    await getDatabase(app)
      .ref('sims_meta/version')
      .transaction((value: unknown) => (typeof value === 'number' && value >= 8 ? undefined : 8));
    console.log(
      result.committed ? 'Shared market updated.' : 'Market slot already published; no changes.',
    );
  } finally {
    await deleteApp(app);
  }
}

void main().catch((error: unknown) => {
  // Never print credentials, raw SDK errors or the environment.
  if (
    process.env.FIREBASE_DATABASE_EMULATOR_HOST &&
    process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')
  )
    console.error(error);
  console.error(
    error instanceof Error && error.message.startsWith('Missing ')
      ? error.message
      : 'Market update failed: check the secret, project and database permissions.',
  );
  process.exitCode = 1;
});
