// Auth Routes - Signup, Login, Sessions
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { z } from 'zod';
import { nanoid } from 'nanoid';

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'admin@handled.ai').split(',');

// Initialize Clerk client
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!
});

// Validation schemas
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = signupSchema.parse(req.body);

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name
      }
    });

    // Generate token with unique jti to avoid duplicate tokens
    const sessionId = nanoid();
    const token = jwt.sign({ userId: user.id, jti: sessionId }, JWT_SECRET, { expiresIn: '7d' });

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token with unique jti to avoid duplicate tokens
    const sessionId = nanoid();
    const token = jwt.sign({ userId: user.id, jti: sessionId }, JWT_SECRET, { expiresIn: '7d' });

    // Create session
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    // Get user's businesses
    const businesses = await prisma.businessUser.findMany({
      where: { userId: user.id },
      include: { business: true }
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: SUPER_ADMIN_EMAILS.includes(user.email)
      },
      businesses: businesses.map(bu => ({
        id: bu.business.id,
        name: bu.business.name,
        role: bu.role
      })),
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user (supports both Clerk and legacy JWT)
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let user;

    // Try Clerk token first
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!
      });
      const clerkUserId = payload.sub;

      // Find user by clerkId or create/link
      user = await prisma.user.findFirst({
        where: { clerkId: clerkUserId },
        select: { id: true, email: true, name: true, role: true, createdAt: true, clerkId: true }
      });

      // If no user with clerkId, get Clerk user info and create/link
      if (!user && clerkUserId) {
        const clerkUser = await clerk.users.getUser(clerkUserId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;

        if (email) {
          // Check if user exists by email
          user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, role: true, createdAt: true, clerkId: true }
          });

          if (user) {
            // Link to Clerk
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
                passwordHash: ''
              },
              select: { id: true, email: true, name: true, role: true, createdAt: true, clerkId: true }
            });
          }
        }
      }
    } catch {
      // Fallback to legacy JWT
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, name: true, role: true, createdAt: true, clerkId: true }
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const businesses = await prisma.businessUser.findMany({
      where: { userId: user.id },
      include: { business: true }
    });

    res.json({
      user: {
        ...user,
        isSuperAdmin: SUPER_ADMIN_EMAILS.includes(user.email)
      },
      businesses: businesses.map(bu => ({
        id: bu.business.id,
        name: bu.business.name,
        slug: bu.business.slug,
        role: bu.role
      }))
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(401).json({ error: 'Not authenticated' });
  }
});

export { router as authRouter };
