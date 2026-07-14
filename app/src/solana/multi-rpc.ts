const RPC_URLS_ENV = 'RPC_URLS';
const RPC_URL_ENV = 'RPC_URL';

const DEFAULT_DEVNET = 'https://api.devnet.solana.com';
const DEFAULT_MAINNET = 'https://api.mainnet-beta.solana.com';

const DEFAULT_URLS: Record<string, string[]> = {
  devnet: [DEFAULT_DEVNET],
  mainnet: [DEFAULT_MAINNET],
};

const RPC_ERROR_CODES = [-32005, -32015];
const TIMEOUT_MS = 10_000;

let cachedUrls: string[] | null = null;
let roundRobinIndex = 0;

export function getRpcUrls(): string[] {
  if (cachedUrls) {
    return cachedUrls;
  }

  const envUrls = process.env[RPC_URLS_ENV];
  if (envUrls) {
    cachedUrls = envUrls.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (!cachedUrls || cachedUrls.length === 0) {
    const singleUrl = process.env[RPC_URL_ENV];
    if (singleUrl) {
      cachedUrls = [singleUrl];
    }
  }

  if (!cachedUrls || cachedUrls.length === 0) {
    const cluster = process.env.NEXT_PUBLIC_CLUSTER || process.env.CLUSTER || 'devnet';
    cachedUrls = DEFAULT_URLS[cluster] || [DEFAULT_DEVNET];
  }

  return cachedUrls;
}

export function pickStartIndex(): number {
  const urls = getRpcUrls();
  const index = roundRobinIndex % urls.length;
  roundRobinIndex++;
  return index;
}

interface FetchError extends Error {
  status?: number;
  isRpcRateLimited?: boolean;
  isNetworkError?: boolean;
}

function isRateLimitResponse(status: number, body: unknown): boolean {
  if (status === 429) {
    return true;
  }
  if (status >= 500 && status < 600) {
    return true;
  }
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const rpcBody = body as { error?: { code?: number } };
  if (rpcBody.error?.code !== undefined) {
    return RPC_ERROR_CODES.includes(rpcBody.error.code);
  }

  return false;
}

export async function fetchWithFailover(
  body: string | object,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<Response> {
  const urls = getRpcUrls();
  const timeout = options?.timeoutMs ?? TIMEOUT_MS;
  const externalSignal = options?.signal;

  const startIndex = pickStartIndex();
  let lastError: FetchError | null = null;

  for (let i = 0; i < urls.length; i++) {
    const urlIndex = (startIndex + i) % urls.length;
    const url = urls[urlIndex];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const signal = externalSignal
        ? AbortSignal.any([externalSignal, controller.signal])
        : controller.signal;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      let parsed: unknown = null;

      if (response.ok) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // Not JSON, treat as success
        }
      }

      if (isRateLimitResponse(response.status, parsed)) {
        const error: FetchError = new Error(`Rate limited by ${url}`);
        error.status = response.status;
        error.isRpcRateLimited = true;
        lastError = error;
        continue;
      }

      return new Response(text, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
      });
    } catch (err: unknown) {
      const error = err as FetchError;
      if (error.name === 'AbortError') {
        const abortError: FetchError = new Error(`Timeout on ${url}`);
        abortError.isNetworkError = true;
        lastError = abortError;
        continue;
      }

      error.isNetworkError = true;
      lastError = error;
      continue;
    }
  }

  const finalError: FetchError = lastError
    ? new Error(`All RPCs failed: ${lastError.message}`)
    : new Error('All RPCs failed');
  finalError.status = 503;
  throw finalError;
}