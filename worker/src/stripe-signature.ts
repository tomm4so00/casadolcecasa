// Firma dei webhook di Stripe, controllata con WebCrypto (c'è nei Worker, in Node e nei browser).
// Stripe firma "<t>.<corpo>" con HMAC-SHA256 e il segreto del webhook (whsec_…), e manda
// l'intestazione Stripe-Signature: t=<secondi>,v1=<firma esadecimale>[,v1=…]
// https://docs.stripe.com/webhooks#verify-manually

const encoder = new TextEncoder();

/** Oltre 5 minuti di differenza l'avviso si scarta: qualcuno potrebbe rimandarne uno vecchio. */
export const SIGNATURE_TOLERANCE_SEC = 300;

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confronto che impiega sempre lo stesso tempo: non rivela quante cifre sono giuste. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(secret: string, timestamp: number, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)));
}

/** true se l'avviso viene davvero da Stripe ed è recente. `now` in ms. */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now: number,
): Promise<boolean> {
  if (!header || !secret) return false;
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 't') timestamp = Number(value);
    if (key === 'v1') signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SEC) return false;
  const expected = await signPayload(secret, timestamp, payload);
  return signatures.some((s) => sameText(s, expected));
}
