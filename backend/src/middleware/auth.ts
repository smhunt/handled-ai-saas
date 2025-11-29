// Auth Middleware - JWT verification
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
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

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Check session exists and is valid
    const session = await prisma.session.findFirst({
      where: {
        token,
        userId: decoded.userId,
        expiresAt: { gt: new Date() }
      }
    });

    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userId = user.id;
    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
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
