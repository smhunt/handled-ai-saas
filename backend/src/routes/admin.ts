// Admin Routes - Super Admin Panel for SaaS Owner
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Super Admin emails (configure in .env for production)
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'admin@handled.ai').split(',');

// Middleware: Verify Super Admin
async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user || !SUPER_ADMIN_EMAILS.includes(user.email)) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    (req as any).adminUser = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Apply middleware to all admin routes
router.use(requireSuperAdmin);

// ============================================
// DASHBOARD STATS
// ============================================

router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalBusinesses,
      totalConversations,
      totalBookings,
      totalOrders,
      recentUsers,
      recentBusinesses
    ] = await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
      prisma.conversation.count(),
      prisma.booking.count(),
      prisma.order.count(),
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      prisma.business.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
    ]);

    // Revenue by plan
    const businessesByPlan = await prisma.business.groupBy({
      by: ['plan'],
      _count: true
    });

    res.json({
      stats: {
        totalUsers,
        totalBusinesses,
        totalConversations,
        totalBookings,
        totalOrders,
        recentUsers,
        recentBusinesses,
        businessesByPlan
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

router.get('/users', async (req, res) => {
  try {
    const { page = '1', limit = '50', search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where = search ? {
      OR: [
        { email: { contains: search as string, mode: 'insensitive' as const } },
        { name: { contains: search as string, mode: 'insensitive' as const } }
      ]
    } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: {
            select: { businesses: true }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        businesses: {
          include: {
            business: true
          }
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Delete user's sessions first
    await prisma.session.deleteMany({ where: { userId } });

    // Delete user
    await prisma.user.delete({ where: { id: userId } });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// BUSINESS MANAGEMENT
// ============================================

router.get('/businesses', async (req, res) => {
  try {
    const { page = '1', limit = '50', search, plan } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (plan) {
      where.plan = plan;
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              conversations: true,
              bookings: true,
              orders: true,
              users: true
            }
          }
        }
      }),
      prisma.business.count({ where })
    ]);

    res.json({
      businesses,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Admin list businesses error:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

router.get('/businesses/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        users: {
          include: { user: true }
        },
        locations: true,
        apiKeys: true,
        _count: {
          select: {
            conversations: true,
            bookings: true,
            orders: true,
            services: true,
            menuCategories: true,
            menuItems: true,
            faqItems: true
          }
        }
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({ business });
  } catch (error) {
    console.error('Admin get business error:', error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

router.patch('/businesses/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { plan, planExpiresAt, isActive } = req.body;

    const business = await prisma.business.update({
      where: { id: businessId },
      data: {
        ...(plan && { plan }),
        ...(planExpiresAt && { planExpiresAt: new Date(planExpiresAt) }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json({ business });
  } catch (error) {
    console.error('Admin update business error:', error);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

router.delete('/businesses/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;

    // Delete related data (cascading)
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversation: { businessId } } }),
      prisma.conversation.deleteMany({ where: { businessId } }),
      prisma.orderItem.deleteMany({ where: { order: { businessId } } }),
      prisma.order.deleteMany({ where: { businessId } }),
      prisma.booking.deleteMany({ where: { businessId } }),
      prisma.apiKey.deleteMany({ where: { businessId } }),
      prisma.businessUser.deleteMany({ where: { businessId } }),
      prisma.menuItem.deleteMany({ where: { businessId } }),
      prisma.menuCategory.deleteMany({ where: { businessId } }),
      prisma.service.deleteMany({ where: { businessId } }),
      prisma.fAQItem.deleteMany({ where: { businessId } }),
      prisma.location.deleteMany({ where: { businessId } }),
      prisma.resource.deleteMany({ where: { businessId } }),
      prisma.availabilityRule.deleteMany({ where: { businessId } }),
      prisma.business.delete({ where: { id: businessId } })
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete business error:', error);
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

// ============================================
// ACTIVITY LOG
// ============================================

router.get('/activity', async (req, res) => {
  try {
    const { page = '1', limit = '100' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get recent conversations, bookings, orders
    const [conversations, bookings, orders] = await Promise.all([
      prisma.conversation.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          business: { select: { name: true } }
        }
      }),
      prisma.booking.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          business: { select: { name: true } }
        }
      }),
      prisma.order.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          business: { select: { name: true } }
        }
      })
    ]);

    res.json({
      activity: {
        conversations,
        bookings,
        orders
      }
    });
  } catch (error) {
    console.error('Admin activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export { router as adminRouter };
