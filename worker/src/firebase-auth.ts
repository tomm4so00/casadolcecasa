// Chi è il giocatore che chiama il Worker: il gioco manda il token di accesso che Firebase gli
// dà (getIdToken). È un JWT firmato da Google: qui si controlla la firma con le chiavi pubbliche
// di Google e poi che sia proprio del nostro progetto e non scaduto, senza nessuna libreria.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

/** Le chiavi pubbliche con cui Google firma i token di Firebase, in formato JWK. */
export const GOOGLE_KEYS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface TokenKey extends JsonWebKey {
  kid: string;
}
/** Le chiavi: nei test si passano direttamente. */
export type KeySource = () => Promise<TokenKey[]>;

export interface FirebaseUser {
  uid: string;
  provider: string;
}

/** Margine per gli orologi un po' avanti o indietro, in secondi. */
const SKEW = 300;

const decoder = new TextDecoder();

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function json(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(decoder.decode(fromBase64url(part)));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * L'utente del token, o null se il token non va bene. Valgono gli stessi accessi delle regole
 * del database: Google, ospite, o email con indirizzo confermato.
 */
export async function verifyFirebaseToken(
  token: string,
  projectId: string,
  now: number,
  keys: KeySource,
): Promise<FirebaseUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || !projectId) return null;
  const header = json(parts[0]);
  const claims = json(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const key = (await keys()).find((k) => k.kid === header.kid);
  if (!key) return null;
  let genuine = false;
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    genuine = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      fromBase64url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!genuine) return null;
  const seconds = now / 1000;
  const { aud, iss, sub, exp, iat, auth_time: authTime, firebase, email_verified } = claims;
  if (aud !== projectId || iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof exp !== 'number' || exp + SKEW < seconds) return null;
  if (typeof iat !== 'number' || iat - SKEW > seconds) return null;
  if (typeof authTime !== 'number' || authTime - SKEW > seconds) return null;
  if (typeof sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sub)) return null;
  const provider =
    firebase && typeof firebase === 'object'
      ? (firebase as Record<string, unknown>).sign_in_provider
      : undefined;
  if (typeof provider !== 'string') return null;
  const allowed =
    provider === 'google.com' ||
    provider === 'anonymous' ||
    (provider === 'password' && email_verified === true);
  return allowed ? { uid: sub, provider } : null;
}

let cached: { keys: TokenKey[]; until: number } | null = null;

/** Le chiavi di Google, tenute finché Google dice che valgono (Cache-Control: max-age). */
export async function googleKeys(now: number): Promise<TokenKey[]> {
  if (cached && cached.until > now) return cached.keys;
  const response = await fetch(GOOGLE_KEYS_URL);
  if (!response.ok) throw new Error(`Chiavi di Google non lette: ${response.status}`);
  const data = (await response.json()) as { keys?: TokenKey[] };
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') || '');
  const keys = Array.isArray(data.keys) ? data.keys : [];
  cached = { keys, until: now + (maxAge ? Number(maxAge[1]) : 3600) * 1000 };
  return keys;
}

/** Il token dall'intestazione "Authorization: Bearer …". */
export function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}
