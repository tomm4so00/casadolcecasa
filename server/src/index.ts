import { randomBytes } from 'node:crypto';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { advanceMarket, BUSINESSES } from '../../shared/market.js';
import { getMessaging } from 'firebase-admin/messaging';
import {
  type PushSender,
  maintainGame,
  notifyRocketAlmostReady,
  sendDeathWarnings,
  sendPetWarnings,
} from './maintenance.js';

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
    const reference = getDatabase(app).ref('sims_market');
    const listener = reference.on('value', () => {});
    await reference.once('value');
    const result = await reference.transaction(
      (current: unknown) =>
        advanceMarket(current, scheduledAt, (id) => samples.get(id)!, eventRolls) ?? undefined,
    );
    reference.off('value', listener);
    await maintainGame(getDatabase(app), scheduledAt);
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
      const rocket = await notifyRocketAlmostReady(getDatabase(app), scheduledAt, send);
      if (rocket >= 0) console.log(`Rocket almost ready, notifications sent: ${rocket}`);
      const warned = await sendDeathWarnings(getDatabase(app), scheduledAt, send);
      if (warned) console.log(`Death warnings sent: ${warned}`);
      const pets = await sendPetWarnings(getDatabase(app), scheduledAt, send);
      if (pets) console.log(`Pet warnings sent: ${pets}`);
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
