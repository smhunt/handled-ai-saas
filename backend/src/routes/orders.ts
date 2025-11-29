// Order Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get orders for a business
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { status, type, startDate, endDate, limit = '50', offset = '0' } = req.query;

    const where: any = { businessId };
    
    if (status) where.status = status;
    if (type) where.type = type;
    if (startDate) where.createdAt = { gte: new Date(startDate as string) };
    if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(endDate as string) };

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: true,
        location: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    const total = await prisma.order.count({ where });

    res.json({ orders, total });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/:businessId/:id', async (req, res) => {
  try {
    const { businessId, id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, businessId },
      include: {
        items: { include: { menuItem: true } },
        location: true,
        conversation: {
          include: { messages: { take: 10, orderBy: { createdAt: 'desc' } } }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order status
router.patch('/:businessId/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, estimatedReady } = req.body;

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'COMPLETED') updateData.completedAt = new Date();
    }
    if (estimatedReady) updateData.estimatedReady = new Date(estimatedReady);

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: { items: true }
    });

    res.json(order);
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Get active orders (for kitchen display)
router.get('/:businessId/active', async (req, res) => {
  try {
    const { businessId } = req.params;

    const orders = await prisma.order.findMany({
      where: {
        businessId,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] }
      },
      include: {
        items: { include: { menuItem: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json(orders);
  } catch (error) {
    console.error('Get active orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

export { router as orderRouter };
