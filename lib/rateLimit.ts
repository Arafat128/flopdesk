type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX = 8;

export function allowRequest(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(ip);
  if (!current || now >= current.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return { ok: true };
  }
  if (current.count >= MAX) {
    return { ok: false, retryAfter: Math.ceil((current.reset - now) / 1000) };
  }
  current.count += 1;
  return { ok: true };
}
