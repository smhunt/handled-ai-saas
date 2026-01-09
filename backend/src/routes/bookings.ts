// Booking Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { format } from 'date-fns';
import { triggerWebhooks } from '../services/webhookService';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get bookings for a business
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { status, startDate, endDate, limit = '50', offset = '0' } = req.query;

    const where: any = { businessId };
    
    if (status) where.status = status;
    if (startDate) where.startTime = { gte: new Date(startDate as string) };
    if (endDate) where.startTime = { ...where.startTime, lte: new Date(endDate as string) };

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        service: true,
        location: true,
        resource: true
      },
      orderBy: { startTime: 'asc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    const total = await prisma.booking.count({ where });

    res.json({ bookings, total });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get single booking
router.get('/:businessId/:id', async (req, res) => {
  try {
    const { businessId, id } = req.params;

    const booking = await prisma.booking.findFirst({
      where: { id, businessId },
      include: {
        service: true,
        location: true,
        resource: true,
        conversation: {
          include: { messages: { take: 10, orderBy: { createdAt: 'desc' } } }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// Update booking status
router.patch('/:businessId/:id', async (req, res) => {
  try {
    const { businessId, id } = req.params;
    const { status, notes, cancellationReason } = req.body;

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'CONFIRMED') updateData.confirmedAt = new Date();
      if (status === 'CANCELLED') {
        updateData.cancelledAt = new Date();
        if (cancellationReason) updateData.cancellationReason = cancellationReason;
      }
    }
    if (notes !== undefined) updateData.notes = notes;

    const booking = await prisma.booking.update({
      where: { id },
      data: updateData,
      include: { service: true, location: true }
    });

    // Trigger webhooks based on status change
    if (status === 'CONFIRMED') {
      triggerWebhooks(businessId, 'booking.confirmed', booking);
    } else if (status === 'CANCELLED') {
      triggerWebhooks(businessId, 'booking.cancelled', booking);
    } else {
      triggerWebhooks(businessId, 'booking.updated', booking);
    }

    res.json(booking);
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Create manual booking
router.post('/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { customerName, customerPhone, customerEmail, startTime, partySize, serviceId, notes } = req.body;

    const confirmationCode = `HND${Date.now().toString(36).toUpperCase()}`;

    const booking = await prisma.booking.create({
      data: {
        businessId,
        customerName,
        customerPhone,
        customerEmail,
        startTime: new Date(startTime),
        endTime: new Date(new Date(startTime).getTime() + 60 * 60 * 1000),
        partySize: partySize || 1,
        serviceId,
        notes,
        confirmationCode,
        status: 'CONFIRMED',
        confirmedAt: new Date()
      },
      include: { service: true, location: true }
    });

    // Trigger webhook for new booking
    triggerWebhooks(businessId, 'booking.created', booking);

    res.status(201).json(booking);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get today's bookings
router.get('/:businessId/today', async (req, res) => {
  try {
    const { businessId } = req.params;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const bookings = await prisma.booking.findMany({
      where: {
        businessId,
        startTime: { gte: today, lt: tomorrow },
        status: { in: ['PENDING', 'CONFIRMED'] }
      },
      include: { service: true },
      orderBy: { startTime: 'asc' }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Get today bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

export { router as bookingRouter };
