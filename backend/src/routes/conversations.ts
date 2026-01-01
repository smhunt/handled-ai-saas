// Conversation Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import twilio from 'twilio';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Twilio client for sending SMS
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

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

// Send SMS message from dashboard
router.post('/sms/send', async (req, res) => {
  try {
    const { to, message, businessId, conversationId } = req.body;
    const userId = (req as any).userId;

    if (!to || !message || !businessId) {
      return res.status(400).json({ error: 'Missing required fields: to, message, businessId' });
    }

    if (!twilioClient) {
      return res.status(503).json({ error: 'SMS service not configured' });
    }

    // Get business's Twilio number
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { twilioPhoneNumber: true, name: true }
    });

    const fromNumber = business?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      return res.status(400).json({ error: 'Business does not have SMS enabled' });
    }

    // Normalize phone number
    let normalizedTo = to.replace(/[^\d+]/g, '');
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`;
    } else if (!normalizedTo.startsWith('+')) {
      normalizedTo = `+${normalizedTo}`;
    }

    // Send the SMS
    const result = await twilioClient.messages.create({
      to: normalizedTo,
      from: fromNumber,
      body: message
    });

    console.log(`SMS sent to ${to} from dashboard: ${result.sid}`);

    // Store the outbound message in the conversation
    if (conversationId) {
      await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: message,
          metadata: {
            twilioSid: result.sid,
            sentByHuman: true,
            sentByUserId: userId,
            channel: 'SMS'
          }
        }
      });

      // Update conversation last message time
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() }
      });
    }

    // Log analytics event
    await prisma.analyticsEvent.create({
      data: {
        businessId,
        eventType: 'sms_sent_from_dashboard',
        sessionId: conversationId,
        eventData: { to, messageLength: message.length, twilioSid: result.sid }
      }
    });

    res.json({ success: true, messageSid: result.sid });
  } catch (error: any) {
    console.error('Send SMS error:', error);
    res.status(500).json({ error: error.message || 'Failed to send SMS' });
  }
});

export { router as conversationRouter };
