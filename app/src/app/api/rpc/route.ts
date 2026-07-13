import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// Simple in-memory cache for read-only RPC requests
interface CacheEntry {
  responseBody: string;
  contentType: string;
  status: number;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2000; // Cache read-only queries for 2 seconds

// List of read-only RPC methods that are safe to cache
const CACHABLE_METHODS = new Set([
  'getAccountInfo',
  'getProgramAccounts',
  'getMultipleAccounts',
  'getBalance',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getLatestBlockhash',
  'getSignaturesForAddress',
  'getTransaction',
  'getEpochInfo',
  'getSlot',
]);

export async function POST(request: NextRequest) {
  let rpcUrl = process.env.RPC_URL;
  if (!rpcUrl || !rpcUrl.startsWith('http')) {
    rpcUrl = 'https://api.devnet.solana.com';
  }

  try {
    const body = await request.json();
    const method = body.method;
    const params = body.params;

    // Determine if request is cacheable
    const isCacheable = CACHABLE_METHODS.has(method);
    let cacheKey = '';

    if (isCacheable) {
      // Hash key based on method and params (ignore ID to share cache across different clients)
      cacheKey = `${method}:${JSON.stringify(params)}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return new NextResponse(cached.responseBody, {
          status: cached.status,
          headers: {
            'Content-Type': cached.contentType,
            'X-Cache': 'HIT',
          },
        });
      }
    }

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    // Cache the response if it was a successful read-only request
    if (isCacheable && response.status === 200) {
      cache.set(cacheKey, {
        responseBody: text,
        contentType: response.headers.get('Content-Type') || 'application/json',
        status: response.status,
        timestamp: Date.now(),
      });
    }

    // Clean up expired cache entries periodically
    if (cache.size > 200) {
      const now = Date.now();
      for (const [key, val] of cache.entries()) {
        if (now - val.timestamp > CACHE_TTL_MS) {
          cache.delete(key);
        }
      }
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return new NextResponse(text, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
          'X-Cache': 'MISS',
        },
      });
    }

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'X-Cache': 'MISS',
      },
    });
  } catch (error: any) {
    console.error('Error proxying Solana RPC request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
