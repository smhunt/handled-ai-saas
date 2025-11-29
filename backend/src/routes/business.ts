// Business Routes - Create, Read, Update businesses
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware);

// Create business schema
const createBusinessSchema = z.object({
  name: z.string().min(2),
  industry: z.enum([
    'RESTAURANT', 'SALON', 'SPA', 'AUTO_SERVICE', 'HEALTHCARE',
    'DENTAL', 'FITNESS', 'YOGA', 'PROFESSIONAL_SERVICES',
    'HOME_SERVICES', 'PET_SERVICES', 'OTHER'
  ]),
  description: z.string().optional(),
  website: z.string().url().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  timezone: z.string().default('America/Toronto'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional()
});

// Create business
router.post('/', async (req, res) => {
  try {
    const data = createBusinessSchema.parse(req.body);
    const userId = (req as any).userId;

    // Generate unique slug
    const baseSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.business.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create business with location
    const business = await prisma.business.create({
      data: {
        name: data.name,
        slug,
        industry: data.industry,
        description: data.description,
        website: data.website,
        phone: data.phone,
        email: data.email,
        timezone: data.timezone,
        users: {
          create: {
            userId,
            role: 'OWNER'
          }
        },
        ...(data.address && {
          locations: {
            create: {
              name: 'Main Location',
              address: data.address,
              city: data.city || '',
              state: data.state,
              postalCode: data.postalCode,
              isDefault: true
            }
          }
        }),
        // Create default availability (Mon-Fri 9-5)
        availabilityRules: {
          create: [1, 2, 3, 4, 5].map(day => ({
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
            isOpen: true
          }))
        }
      },
      include: {
        locations: true,
        users: true
      }
    });

    // Generate API key for widget
    const apiKey = `hnd_${nanoid(32)}`;
    await prisma.apiKey.create({
      data: {
        key: apiKey,
        name: 'Default Widget Key',
        businessId: business.id,
        permissions: ['widget']
      }
    });

    res.status(201).json({
      business,
      apiKey
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create business error:', error);
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// Get all businesses for user
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId;

    const businesses = await prisma.businessUser.findMany({
      where: { userId },
      include: {
        business: {
          include: {
            locations: true,
            _count: {
              select: {
                bookings: true,
                orders: true,
                conversations: true
              }
            }
          }
        }
      }
    });

    res.json(businesses.map(bu => ({
      ...bu.business,
      role: bu.role
    })));
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Get single business
router.get('/:id', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const businessUser = await prisma.businessUser.findFirst({
      where: { userId, businessId: id },
      include: {
        business: {
          include: {
            locations: true,
            services: { orderBy: { sortOrder: 'asc' } },
            menuCategories: {
              orderBy: { sortOrder: 'asc' },
              include: { items: { orderBy: { sortOrder: 'asc' } } }
            },
            availabilityRules: true,
            faqItems: { orderBy: { sortOrder: 'asc' } },
            notifications: true,
            integrations: true
          }
        }
      }
    });

    if (!businessUser) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get API keys
    const apiKeys = await prisma.apiKey.findMany({
      where: { businessId: id },
      select: {
        id: true,
        name: true,
        key: true,
        permissions: true,
        createdAt: true,
        lastUsedAt: true
      }
    });

    res.json({
      ...businessUser.business,
      role: businessUser.role,
      apiKeys
    });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

// Update business
router.patch('/:id', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    // Check access
    const access = await prisma.businessUser.findFirst({
      where: { userId, businessId: id, role: { in: ['OWNER', 'ADMIN'] } }
    });

    if (!access) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const business = await prisma.business.update({
      where: { id },
      data: req.body
    });

    res.json({ business });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// ============================================================================
// SERVICES CRUD
// ============================================================================

// Get all services
router.get('/:id/services', async (req, res) => {
  try {
    const { id } = req.params;
    const services = await prisma.service.findMany({
      where: { businessId: id },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(services);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Create service
router.post('/:id/services', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, duration, price, isActive, sortOrder } = req.body;

    const service = await prisma.service.create({
      data: {
        businessId: id,
        name,
        description,
        duration: parseInt(duration),
        price: price ? parseFloat(price) : null,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0
      }
    });

    res.status(201).json({ service });
  } catch (error) {
    console.error('Add service error:', error);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

// Update service
router.patch('/:id/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { name, description, duration, price, isActive, sortOrder } = req.body;

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(duration && { duration: parseInt(duration) }),
        ...(price !== undefined && { price: price ? parseFloat(price) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    });

    res.json({ service });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service
router.delete('/:id/services/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    await prisma.service.delete({ where: { id: serviceId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// ============================================================================
// MENU CRUD
// ============================================================================

// Get all menu categories with items
router.get('/:id/menu', async (req, res) => {
  try {
    const { id } = req.params;
    const categories = await prisma.menuCategory.findMany({
      where: { businessId: id },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: { orderBy: { sortOrder: 'asc' } }
      }
    });
    res.json(categories);
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// Create menu category
router.post('/:id/menu/categories', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, isActive } = req.body;

    const category = await prisma.menuCategory.create({
      data: {
        businessId: id,
        name,
        description,
        sortOrder: sortOrder ?? 0,
        isActive: isActive ?? true
      }
    });

    res.status(201).json({ category });
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// Update menu category
router.patch('/:id/menu/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, sortOrder, isActive } = req.body;

    const category = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json({ category });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete menu category
router.delete('/:id/menu/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    await prisma.menuCategory.delete({ where: { id: categoryId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Create menu item
router.post('/:id/menu/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, price, imageUrl, isAvailable, isPopular, calories, allergens, modifiers, sortOrder } = req.body;

    const item = await prisma.menuItem.create({
      data: {
        businessId: id,
        categoryId,
        name,
        description,
        price: parseFloat(price),
        imageUrl,
        isAvailable: isAvailable ?? true,
        isPopular: isPopular ?? false,
        calories,
        allergens: allergens || [],
        modifiers,
        sortOrder: sortOrder ?? 0
      }
    });

    res.status(201).json({ item });
  } catch (error) {
    console.error('Add menu item error:', error);
    res.status(500).json({ error: 'Failed to add menu item' });
  }
});

// Update menu item
router.patch('/:id/menu/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { categoryId, name, description, price, imageUrl, isAvailable, isPopular, calories, allergens, modifiers, sortOrder } = req.body;

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(categoryId !== undefined && { categoryId }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isPopular !== undefined && { isPopular }),
        ...(calories !== undefined && { calories }),
        ...(allergens !== undefined && { allergens }),
        ...(modifiers !== undefined && { modifiers }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    });

    res.json({ item });
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// Delete menu item
router.delete('/:id/menu/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    await prisma.menuItem.delete({ where: { id: itemId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ============================================================================
// AVAILABILITY CRUD
// ============================================================================

// Get availability rules
router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const rules = await prisma.availabilityRule.findMany({
      where: { businessId: id },
      orderBy: { dayOfWeek: 'asc' }
    });
    res.json(rules);
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Update availability rules (replace all)
router.put('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { rules } = req.body;

    // Delete existing rules
    await prisma.availabilityRule.deleteMany({ where: { businessId: id } });

    // Create new rules
    await prisma.availabilityRule.createMany({
      data: rules.map((rule: any) => ({
        businessId: id,
        dayOfWeek: rule.dayOfWeek,
        specificDate: rule.specificDate ? new Date(rule.specificDate) : null,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isOpen: rule.isOpen,
        maxBookings: rule.maxBookings
      }))
    });

    const newRules = await prisma.availabilityRule.findMany({
      where: { businessId: id }
    });

    res.json(newRules);
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// ============================================================================
// FAQ CRUD
// ============================================================================

// Get all FAQs
router.get('/:id/faqs', async (req, res) => {
  try {
    const { id } = req.params;
    const faqs = await prisma.fAQItem.findMany({
      where: { businessId: id },
      orderBy: { sortOrder: 'asc' }
    });
    res.json({ faqs });
  } catch (error) {
    console.error('Get FAQs error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

// Create FAQ
router.post('/:id/faqs', async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, sortOrder, isActive } = req.body;

    const faq = await prisma.fAQItem.create({
      data: {
        businessId: id,
        question,
        answer,
        category,
        sortOrder: sortOrder ?? 0,
        isActive: isActive ?? true
      }
    });

    res.status(201).json({ faq });
  } catch (error) {
    console.error('Add FAQ error:', error);
    res.status(500).json({ error: 'Failed to add FAQ' });
  }
});

// Update FAQ
router.patch('/:id/faqs/:faqId', async (req, res) => {
  try {
    const { faqId } = req.params;
    const { question, answer, category, sortOrder, isActive } = req.body;

    const faq = await prisma.fAQItem.update({
      where: { id: faqId },
      data: {
        ...(question && { question }),
        ...(answer && { answer }),
        ...(category !== undefined && { category }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json({ faq });
  } catch (error) {
    console.error('Update FAQ error:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

// Delete FAQ
router.delete('/:id/faqs/:faqId', async (req, res) => {
  try {
    const { faqId } = req.params;
    await prisma.fAQItem.delete({ where: { id: faqId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete FAQ error:', error);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

// Get team members
router.get('/:id/team', async (req, res) => {
  try {
    const { id } = req.params;
    const members = await prisma.businessUser.findMany({
      where: { businessId: id },
      include: {
        user: {
          select: { id: true, email: true, name: true, createdAt: true }
        }
      }
    });
    res.json(members.map(m => ({
      id: m.id,
      role: m.role,
      user: m.user,
      createdAt: m.createdAt
    })));
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Invite team member
router.post('/:id/team/invite', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create invited user with temp password (they'll need to reset)
      const bcrypt = await import('bcryptjs');
      const tempHash = await bcrypt.hash(Math.random().toString(36), 10);
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          passwordHash: tempHash,
          role: role || 'STAFF'
        }
      });
      // TODO: Send invitation email
    }

    // Check if already a member
    const existing = await prisma.businessUser.findFirst({
      where: { userId: user.id, businessId: id }
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a team member' });
    }

    const member = await prisma.businessUser.create({
      data: {
        userId: user.id,
        businessId: id,
        role: role || 'STAFF'
      },
      include: {
        user: { select: { id: true, email: true, name: true } }
      }
    });

    res.status(201).json(member);
  } catch (error) {
    console.error('Invite team member error:', error);
    res.status(500).json({ error: 'Failed to invite team member' });
  }
});

// Update team member role
router.patch('/:id/team/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { role } = req.body;

    const member = await prisma.businessUser.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: { select: { id: true, email: true, name: true } }
      }
    });

    res.json(member);
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// Remove team member
router.delete('/:id/team/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const userId = (req as any).userId;

    // Prevent removing yourself if you're the owner
    const member = await prisma.businessUser.findUnique({
      where: { id: memberId }
    });

    if (member?.userId === userId && member?.role === 'OWNER') {
      return res.status(400).json({ error: 'Cannot remove yourself as owner' });
    }

    await prisma.businessUser.delete({ where: { id: memberId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ============================================================================
// API KEYS
// ============================================================================

// Get API keys
router.get('/:id/api-keys', async (req, res) => {
  try {
    const { id } = req.params;
    const keys = await prisma.apiKey.findMany({
      where: { businessId: id },
      select: {
        id: true,
        name: true,
        key: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true
      }
    });
    res.json(keys);
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create API key
router.post('/:id/api-keys', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions } = req.body;

    const key = `hnd_${nanoid(32)}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        businessId: id,
        key,
        name: name || 'API Key',
        permissions: permissions || ['widget']
      }
    });

    res.status(201).json(apiKey);
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Update API key
router.patch('/:id/api-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { name, permissions, isActive } = req.body;

    const apiKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        ...(name && { name }),
        ...(permissions && { permissions }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json(apiKey);
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Delete API key
router.delete('/:id/api-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    await prisma.apiKey.delete({ where: { id: keyId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Regenerate API key
router.post('/:id/api-keys/:keyId/regenerate', async (req, res) => {
  try {
    const { keyId } = req.params;
    const newKey = `hnd_${nanoid(32)}`;

    const apiKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: { key: newKey }
    });

    res.json(apiKey);
  } catch (error) {
    console.error('Regenerate API key error:', error);
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

// ============================================================================
// LOCATIONS
// ============================================================================

// Get all locations
router.get('/:id/locations', async (req, res) => {
  try {
    const { id } = req.params;
    const locations = await prisma.location.findMany({
      where: { businessId: id },
      include: {
        _count: {
          select: { bookings: true, orders: true, resources: true }
        }
      }
    });
    res.json({ locations });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Create location
router.post('/:id/locations', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, city, state, postalCode, country, phone, email, isDefault, latitude, longitude } = req.body;

    // If this is default, unset other defaults
    if (isDefault) {
      await prisma.location.updateMany({
        where: { businessId: id },
        data: { isDefault: false }
      });
    }

    const location = await prisma.location.create({
      data: {
        businessId: id,
        name,
        address,
        city,
        state,
        postalCode,
        country: country || 'CA',
        phone,
        email,
        isDefault: isDefault ?? false,
        latitude,
        longitude
      }
    });

    res.status(201).json({ location });
  } catch (error) {
    console.error('Add location error:', error);
    res.status(500).json({ error: 'Failed to add location' });
  }
});

// Update location
router.patch('/:id/locations/:locationId', async (req, res) => {
  try {
    const { id, locationId } = req.params;
    const { name, address, city, state, postalCode, country, phone, email, isDefault, latitude, longitude } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.location.updateMany({
        where: { businessId: id, id: { not: locationId } },
        data: { isDefault: false }
      });
    }

    const location = await prisma.location.update({
      where: { id: locationId },
      data: {
        ...(name && { name }),
        ...(address && { address }),
        ...(city && { city }),
        ...(state !== undefined && { state }),
        ...(postalCode !== undefined && { postalCode }),
        ...(country && { country }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(isDefault !== undefined && { isDefault }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude })
      }
    });

    res.json({ location });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Delete location
router.delete('/:id/locations/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    await prisma.location.delete({ where: { id: locationId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// Get dashboard stats
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '7d' } = req.query;

    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [bookings, orders, conversations, revenue] = await Promise.all([
      prisma.booking.count({
        where: { businessId: id, createdAt: { gte: startDate } }
      }),
      prisma.order.count({
        where: { businessId: id, createdAt: { gte: startDate } }
      }),
      prisma.conversation.count({
        where: { businessId: id, startedAt: { gte: startDate } }
      }),
      prisma.order.aggregate({
        where: { businessId: id, createdAt: { gte: startDate }, paymentStatus: 'PAID' },
        _sum: { total: true }
      })
    ]);

    res.json({
      period,
      bookings,
      orders,
      conversations,
      revenue: revenue._sum.total || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export { router as businessRouter };
