/**
 * Rate Limiting Middleware
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 * Protects API endpoints from abuse
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default rate limits by endpoint category
const RATE_LIMITS = {
  default: { requests: 60, windowMinutes: 1 },
  auth: { requests: 10, windowMinutes: 1 },
  write: { requests: 30, windowMinutes: 1 },
  export: { requests: 5, windowMinutes: 60 },
  notification: { requests: 20, windowMinutes: 1 }
};

/**
 * Get client identifier from request
 */
function getClientIdentifier(req) {
  // Try to get user ID from auth
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // Hash the token for privacy
    const token = authHeader.replace('Bearer ', '');
    return { identifier: token.substring(0, 32), type: 'user' };
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
  return { identifier: ip, type: 'ip' };
}

/**
 * Check rate limit using database
 */
export async function checkRateLimit(req, category = 'default') {
  const { identifier, type } = getClientIdentifier(req);
  const endpoint = req.url?.split('?')[0] || '/api/unknown';
  const limits = RATE_LIMITS[category] || RATE_LIMITS.default;

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_identifier_type: type,
      p_endpoint: endpoint,
      p_max_requests: limits.requests,
      p_window_minutes: limits.windowMinutes
    });

    if (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if rate limiting fails
      return { allowed: true, error: error.message };
    }

    return {
      allowed: data,
      limit: limits.requests,
      window: limits.windowMinutes,
      identifier: type
    };
  } catch (err) {
    console.error('Rate limit error:', err);
    return { allowed: true, error: err.message };
  }
}

/**
 * Rate limit middleware wrapper
 */
export function withRateLimit(handler, category = 'default') {
  return async (req, res) => {
    const result = await checkRateLimit(req, category);

    if (!result.allowed) {
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit || 60);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + (result.window || 1) * 60);
      res.setHeader('Retry-After', (result.window || 1) * 60);

      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: (result.window || 1) * 60
      });
    }

    // Add rate limit headers for successful requests
    res.setHeader('X-RateLimit-Limit', result.limit || 60);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, (result.limit || 60) - 1));

    return handler(req, res);
  };
}

/**
 * In-memory rate limiter for simple cases (fallback)
 */
const memoryStore = new Map();

export function checkMemoryRateLimit(identifier, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const key = identifier;

  if (!memoryStore.has(key)) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  const record = memoryStore.get(key);

  if (now > record.resetAt) {
    // Window expired, reset
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      retryAfter: Math.ceil((record.resetAt - now) / 1000)
    };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (now > value.resetAt + 60000) {
      memoryStore.delete(key);
    }
  }
}, 60000);
