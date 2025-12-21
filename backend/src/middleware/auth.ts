// Auth Middleware - Clerk JWT verification
import { Request, Response, NextFunction } from 'express';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Initialize Clerk client for user lookups
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!
});

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
  clerkUserId?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify Clerk JWT
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!
    });
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get or create user from Clerk ID
    let user = await prisma.user.findFirst({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        clerkId: true
      }
    });

    // If no user with clerkId, try to get Clerk user info and create/link
    if (!user) {
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses[0]?.emailAddress;

      if (email) {
        // Check if user exists by email (migrating from old auth)
        user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, role: true, clerkId: true }
        });

        if (user) {
          // Link existing user to Clerk
          await prisma.user.update({
            where: { id: user.id },
            data: { clerkId: clerkUserId }
          });
        } else {
          // Create new user
          user = await prisma.user.create({
            data: {
              email,
              name: clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : email,
              clerkId: clerkUserId,
              passwordHash: '' // Not used with Clerk auth
            },
            select: { id: true, email: true, name: true, role: true, clerkId: true }
          });
        }
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userId = user.id;
    req.user = user;
    req.clerkUserId = clerkUserId;

    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error?.message || error);
    if (error?.message?.includes('token')) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Optional auth - doesn't require auth but attaches user if token present
export async function optionalAuthMiddleware(
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true }
    });

    if (user) {
      req.userId = user.id;
      req.user = user;
    }

    next();
  } catch {
    // Ignore errors, just continue without auth
    next();
  }
}

// Check business access middleware
export function businessAccessMiddleware(requiredRoles: string[] = ['OWNER', 'ADMIN', 'STAFF']) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const businessId = req.params.businessId || req.params.id;
      const userId = req.userId;

      if (!businessId || !userId) {
        return res.status(400).json({ error: 'Business ID required' });
      }

      const businessUser = await prisma.businessUser.findFirst({
        where: {
          userId,
          businessId,
          role: { in: requiredRoles as any }
        }
      });

      if (!businessUser) {
        return res.status(403).json({ error: 'Access denied to this business' });
      }

      (req as any).businessRole = businessUser.role;
      next();
    } catch (error) {
      console.error('Business access check error:', error);
      res.status(500).json({ error: 'Access check failed' });
    }
  };
}
