/*
  qf-api.mjs: everything about talking to the Quran Foundation / Quran.com API.
  - "public": Quran.com's open API, no keys needed (default)
  - "prelive" / "production": the keyed Quran Foundation API (OAuth2 login)
  - retries temporary failures (server busy/down, rate limit, network hiccups)
  - throws clear errors for real problems (wrong keys, bad request)
  All three serve the same Quran Foundation data in the same "v4" format.
*/

// Keys from prelive do NOT work on production, and the other way round.
const ENVIRONMENTS = {
  public: {
    baseUrl: 'https://api.quran.com/api/v4',
    authUrl: null, // no login needed
  },
  prelive: {
    baseUrl: 'https://apis-prelive.quran.foundation/content/api/v4',
    authUrl: 'https://prelive-oauth2.quran.foundation',
  },
  production: {
    baseUrl: 'https://apis.quran.foundation/content/api/v4',
    authUrl: 'https://oauth2.quran.foundation',
  },
};

const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 20_000;
const PAUSE_BETWEEN_REQUESTS_MS = 300; // be polite to a free, shared service

// Read settings once. Keys come from .env (loaded by the main script).
const envName = process.env.QF_ENV ?? 'public';
const env = ENVIRONMENTS[envName];
if (!env) {
  throw new Error(`QF_ENV must be "public", "prelive" or "production", got "${envName}".`);
}
const clientId = process.env.QF_CLIENT_ID;
const clientSecret = process.env.QF_CLIENT_SECRET;
if (env.authUrl && (!clientId || !clientSecret)) {
  throw new Error(`QF_ENV="${envName}" needs QF_CLIENT_ID and QF_CLIENT_SECRET in .env.`);
}

export const environmentName = envName;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Status codes worth trying again: rate limited, or the server side failing.
const isTemporary = (status) => status === 429 || status >= 500;

/*
  Runs `request` up to MAX_ATTEMPTS times, waiting longer after each failure
  (1s, 2s, 4s, 8s), so a short outage doesn't break the whole run.
  `request` returns a Response, or throws on a network error.
*/
async function withRetries(label, request) {
  for (let attempt = 1; ; attempt++) {
    let problem;
    try {
      const res = await request();
      if (res.ok || !isTemporary(res.status)) return res;
      problem = `HTTP ${res.status} ${(await res.text()).slice(0, 120).trim()}`;
    } catch (err) {
      problem = err.name === 'TimeoutError' ? 'timed out' : err.message;
    }
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`${label} failed after ${MAX_ATTEMPTS} attempts (last: ${problem}).`);
    }
    const wait = 1000 * 2 ** (attempt - 1);
    console.warn(`  ${label}: ${problem}. Retrying in ${wait / 1000}s...`);
    await sleep(wait);
  }
}

// ---------- Login ----------
let cachedToken = null; // { value, expiresAt }

async function getToken() {
  // Reuse the token until 60s before it expires (tokens last ~1 hour).
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const res = await withRetries('Login', () =>
    fetch(`${env.authUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=content.quran.read',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    // Never print the secret; the error code is enough to debug.
    throw new Error(
      `Login refused (${res.status} ${body.error ?? ''}). Check the keys in .env match QF_ENV="${envName}".`,
    );
  }

  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

// ---------- API calls ----------
/*
  GET a Content API path and return the parsed JSON.
  Example: apiGet('/chapters', { language: 'en' })
*/
export async function apiGet(path, params = {}) {
  const url = new URL(`${env.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  await sleep(PAUSE_BETWEEN_REQUESTS_MS);

  // If the token was rejected (401), get a fresh one and try once more.
  for (let tokenTry = 1; tokenTry <= 2; tokenTry++) {
    // The public API needs no login headers
    const headers = env.authUrl
      ? { 'x-auth-token': await getToken(), 'x-client-id': clientId }
      : {};
    const res = await withRetries(`GET ${path}`, () =>
      fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    );

    if (res.status === 401 && env.authUrl && tokenTry === 1) {
      cachedToken = null;
      continue;
    }
    if (!res.ok) {
      throw new Error(`GET ${path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return res.json();
  }
}
