import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { serviceAccountJwt } from '../worker/src/firebase-rest.js';
import { verifyStripeSignature } from '../worker/src/stripe-signature.js';

const NOW = 1_800_000_000_000;
const SECRET = 'whsec_prova_segreta';
/** L'intestazione come la scrive Stripe (https://docs.stripe.com/webhooks#verify-manually). */
const stripeHeader = (payload: string, secret = SECRET, t = NOW / 1000) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

describe('Worker della criogenesi: la firma di Stripe', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

  it('accetta solo avvisi firmati con il segreto giusto, recenti e non modificati', async () => {
    expect(await verifyStripeSignature(payload, stripeHeader(payload), SECRET, NOW)).toBe(true);
    expect(
      await verifyStripeSignature(payload, stripeHeader(payload, 'whsec_altro'), SECRET, NOW),
    ).toBe(false);
    // corpo cambiato dopo la firma
    expect(await verifyStripeSignature(payload + ' ', stripeHeader(payload), SECRET, NOW)).toBe(
      false,
    );
    // avviso di 10 minuti fa: potrebbe essere rimandato da qualcun altro
    expect(
      await verifyStripeSignature(
        payload,
        stripeHeader(payload, SECRET, NOW / 1000 - 600),
        SECRET,
        NOW,
      ),
    ).toBe(false);
    expect(await verifyStripeSignature(payload, null, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(payload, 't=abc,v1=00', SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(payload, stripeHeader(payload), '', NOW)).toBe(false);
  });

  it('con più firme (Stripe durante il cambio del segreto) ne basta una giusta', async () => {
    const good = stripeHeader(payload).split(',')[1];
    const header = `t=${NOW / 1000},v1=${'0'.repeat(64)},${good}`;
    expect(await verifyStripeSignature(payload, header, SECRET, NOW)).toBe(true);
  });
});

describe('Worker della criogenesi: la chiave di Firebase', () => {
  it("firma il JWT dell'account di servizio come vuole Google", async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const jwt = await serviceAccountJwt(
      { client_email: 'worker@progetto.iam.gserviceaccount.com', private_key: privateKey },
      NOW,
    );
    const [header, claims, signature] = jwt.split('.');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(body).toMatchObject({
      iss: 'worker@progetto.iam.gserviceaccount.com',
      aud: 'https://oauth2.googleapis.com/token',
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
    expect(body.scope).toContain('https://www.googleapis.com/auth/firebase.database');
  });
});
