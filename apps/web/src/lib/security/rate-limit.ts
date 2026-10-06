type Entry = { count: number; resetAt: number };

const attempts = new Map<string, Entry>();

export function consumeRateLimit(
  key: string,
  limit = 5,
  windowMs = 10 * 60 * 1000,
) {
  const now = Date.now();
  for (const [id, entry] of attempts)
    if (entry.resetAt <= now) attempts.delete(id);
  if (attempts.size >= 10000 && !attempts.has(key))
    return { allowed: false, retryAfter: 60 };
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((current.resetAt - now) / 1000),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}
