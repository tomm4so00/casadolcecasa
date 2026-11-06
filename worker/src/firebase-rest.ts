// Il database di Firebase visto dal Worker: niente SDK, solo l'API REST.
// L'accesso è quello di un account di servizio (chiave JSON scaricata dalla console Firebase).
// Ogni richiesta però si presenta come l'utente ridotto CRYO_WRITER: le regole del database gli
// lasciano scrivere solo i pass della criogenesi, anche se la chiave potrebbe fare di più.
// https://firebase.google.com/docs/database/rest/auth

export const CRYO_WRITER = 'cryo-webhook';
const SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const encoder = new TextEncoder();

function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const der = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) der[i] = raw.charCodeAt(i);
  return der.buffer;
}

/** Il JWT firmato con la chiave dell'account di servizio, da scambiare con un token. */
export async function serviceAccountJwt(account: ServiceAccount, now: number): Promise<string> {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPES,
      aud: account.token_uri || 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64url(signature)}`;
}

let cached: { token: string; until: number } | null = null;

/** Token di Google per il database; vale un'ora e si riusa finché non sta per scadere. */
export async function accessToken(account: ServiceAccount, now: number): Promise<string> {
  if (cached && cached.until > now + 60_000) return cached.token;
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await serviceAccountJwt(account, now),
    }),
  });
  if (!response.ok) throw new Error(`Token Google rifiutato: ${response.status}`);
  const data = (await response.json()) as { access_token: string; expires_in?: number };
  cached = { token: data.access_token, until: now + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

interface Snapshot {
  val(): unknown;
}

/**
 * Un database con la stessa forma di quello del gioco (ref → get / transaction), sopra l'API
 * REST. La transazione usa l'ETag: se nel frattempo qualcun altro ha scritto, Firebase risponde
 * 412 e si riprova con il valore nuovo.
 */
export function restDatabase(options: { url: string; token: string; uid?: string }) {
  const address = (path: string) => {
    const url = new URL(options.url);
    url.pathname = '/' + path.replace(/^\/+/, '') + '.json';
    if (options.uid)
      url.searchParams.set('auth_variable_override', JSON.stringify({ uid: options.uid }));
    return url.toString();
  };
  const headers = (extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${options.token}`,
    ...extra,
  });
  const read = async (path: string, withEtag: boolean) => {
    const response = await fetch(address(path), {
      headers: headers(withEtag ? { 'x-firebase-etag': 'true' } : {}),
    });
    if (!response.ok) throw new Error(`Lettura di ${path} rifiutata: ${response.status}`);
    return { value: (await response.json()) as unknown, etag: response.headers.get('etag') };
  };
  return {
    ref(path: string) {
      return {
        async get(): Promise<Snapshot> {
          const { value } = await read(path, false);
          return { val: () => value };
        },
        async transaction(
          update: (value: unknown) => unknown,
        ): Promise<{ committed: boolean; snapshot: Snapshot }> {
          for (let attempt = 0; attempt < 10; attempt++) {
            const { value, etag } = await read(path, true);
            const next = update(structuredClone(value));
            if (next === undefined) return { committed: false, snapshot: { val: () => value } };
            const response = await fetch(address(path), {
              method: 'PUT',
              headers: headers({ 'content-type': 'application/json', 'if-match': etag ?? '' }),
              body: JSON.stringify(next),
            });
            if (response.status === 412) continue;
            if (!response.ok) throw new Error(`Scrittura di ${path} rifiutata: ${response.status}`);
            return { committed: true, snapshot: { val: () => next } };
          }
          throw new Error(`Troppi tentativi su ${path}`);
        },
      };
    },
  };
}
