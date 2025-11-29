// Conversation Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get conversations for a business
router.get('/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { status, channel, limit = '50', offset = '0' } = req.query;

    const where: any = { businessId };
    
    if (status) where.status = status;
    if (channel) where.channel = channel;

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        },
        _count: { select: { messages: true, bookings: true, orders: true } }
      },
      orderBy: { lastMessageAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    const total = await prisma.conversation.count({ where });

    res.json({ conversations, total });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get single conversation with messages
router.get('/:businessId/:id', async (req, res) => {
  try {
    const { businessId, id } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, businessId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        bookings: true,
        orders: { include: { items: true } }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Send message as staff (human takeover)
router.post('/:businessId/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = (req as any).userId;

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        role: 'ASSISTANT',
        content,
        metadata: { sentBy: userId, isHuman: true }
      }
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Update conversation status
router.patch('/:businessId/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedTo, tags } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(assignedTo && { assignedTo }),
        ...(tags && { tags }),
        ...(status === 'RESOLVED' && { endedAt: new Date() })
      }
    });

    res.json(conversation);
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// Get conversations needing attention (handoff requests)
router.get('/:businessId/handoffs', async (req, res) => {
  try {
    const { businessId } = req.params;

    const conversations = await prisma.conversation.findMany({
      where: {
        businessId,
        handedOffToHuman: true,
        status: 'HANDED_OFF'
      },
      include: {
        messages: { take: 5, orderBy: { createdAt: 'desc' } }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    res.json(conversations);
  } catch (error) {
    console.error('Get handoffs error:', error);
    res.status(500).json({ error: 'Failed to fetch handoffs' });
  }
});

export { router as conversationRouter };
