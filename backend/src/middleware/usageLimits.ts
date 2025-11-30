// Usage Limits Middleware - Enforce plan limits
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { billingService } from '../services/billing';

const prisma = new PrismaClient();

type LimitType = 'conversations' | 'messages' | 'teamMembers' | 'locations';

// Middleware factory to check specific limit types
export function checkUsageLimit(limitType: LimitType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = req.params.id || req.params.businessId || (req as any).businessId;

      if (!businessId) {
        return next(); // No business context, skip check
      }

      const usage = await billingService.checkUsageLimits(businessId);
      const limit = usage.usage[limitType];

      // -1 means unlimited
      if (limit.limit === -1) {
        return next();
      }

      // Check if limit exceeded
      if (limit.remaining <= 0) {
        return res.status(403).json({
          error: 'Plan limit exceeded',
          limitType,
          used: limit.used,
          limit: limit.limit,
          message: `You have reached your ${limitType} limit. Please upgrade your plan to continue.`
        });
      }

      // Attach usage info to request for potential use
      (req as any).usageLimits = usage;
      next();
    } catch (error) {
      console.error('Usage limit check error:', error);
      next(); // Don't block on errors, just log
    }
  };
}

// Check if business is active (not disabled by admin)
export async function checkBusinessActive(req: Request, res: Response, next: NextFunction) {
  try {
    const businessId = req.params.id || req.params.businessId || (req as any).businessId;

    if (!businessId) {
      return next();
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { isActive: true }
    });

    if (business && business.isActive === false) {
      return res.status(403).json({
        error: 'Business disabled',
        message: 'This business account has been disabled. Please contact support.'
      });
    }

    next();
  } catch (error) {
    console.error('Business active check error:', error);
    next();
  }
}
