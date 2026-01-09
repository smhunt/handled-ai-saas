// Business Rate Limiter - Per-business API rate limiting based on plan
import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Plan } from '@prisma/client';

const prisma = new PrismaClient();

// Plan limits for API requests per minute
const PLAN_RATE_LIMITS: Record<Plan, number> = {
  TRIAL: 30,
  STARTER: 60,
  PROFESSIONAL: 120,
  BUSINESS: 300,
  ENTERPRISE: -1 // unlimited
};

// In-memory sliding window rate limiter
interface RateLimitWindow {
  count: number;
  startTime: number;
}

const rateLimitWindows = new Map<string, RateLimitWindow>();

// Window duration in milliseconds (1 minute)
const WINDOW_DURATION_MS = 60 * 1000;

// Cleanup old windows periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of rateLimitWindows.entries()) {
    if (now - window.startTime > WINDOW_DURATION_MS * 2) {
      rateLimitWindows.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get current rate limit status for a business
 */
function getRateLimitStatus(businessId: string, limit: number): { count: number; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `ratelimit:${businessId}`;

  let window = rateLimitWindows.get(key);

  // Check if window has expired
  if (!window || now - window.startTime > WINDOW_DURATION_MS) {
    window = { count: 0, startTime: now };
    rateLimitWindows.set(key, window);
  }

  return {
    count: window.count,
    remaining: limit === -1 ? -1 : Math.max(0, limit - window.count),
    resetAt: window.startTime + WINDOW_DURATION_MS
  };
}

/**
 * Increment rate limit counter for a business
 */
function incrementRateLimit(businessId: string): void {
  const now = Date.now();
  const key = `ratelimit:${businessId}`;

  let window = rateLimitWindows.get(key);

  if (!window || now - window.startTime > WINDOW_DURATION_MS) {
    window = { count: 1, startTime: now };
  } else {
    window.count++;
  }

  rateLimitWindows.set(key, window);
}

/**
 * Business rate limit middleware
 * Must be used after validateApiKey middleware which sets req.businessId
 */
export async function businessRateLimitMiddleware(
  req: Request & { businessId?: string },
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.businessId;

    if (!businessId) {
      // If no businessId, skip rate limiting (let auth middleware handle it)
      return next();
    }

    // Get business plan
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { plan: true }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const limit = PLAN_RATE_LIMITS[business.plan] || PLAN_RATE_LIMITS.TRIAL;

    // Unlimited for enterprise
    if (limit === -1) {
      incrementRateLimit(businessId);
      return next();
    }

    const status = getRateLimitStatus(businessId, limit);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', status.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(status.resetAt / 1000));

    // Check if limit exceeded
    if (status.count >= limit) {
      const retryAfter = Math.ceil((status.resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Please retry after ${retryAfter} seconds.`,
        retryAfter,
        limit,
        plan: business.plan
      });
    }

    // Increment counter and continue
    incrementRateLimit(businessId);
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // On error, allow request through but log it
    next();
  }
}

/**
 * Get rate limit info for a business (for API endpoint)
 */
export async function getRateLimitInfo(businessId: string): Promise<{
  plan: Plan;
  limit: number;
  remaining: number;
  resetAt: Date;
}> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true }
  });

  if (!business) {
    throw new Error('Business not found');
  }

  const limit = PLAN_RATE_LIMITS[business.plan] || PLAN_RATE_LIMITS.TRIAL;
  const status = getRateLimitStatus(businessId, limit);

  return {
    plan: business.plan,
    limit,
    remaining: status.remaining,
    resetAt: new Date(status.resetAt)
  };
}

export { PLAN_RATE_LIMITS };
