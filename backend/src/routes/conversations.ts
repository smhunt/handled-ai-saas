// Conversation Routes
import { Router } from 'express';
import { PrismaClient, Conversation, Message } from '@prisma/client';
import twilio from 'twilio';
import { authMiddleware, businessAccessMiddleware } from '../middleware/auth';
import { format } from 'date-fns';
import { triggerWebhooks } from '../services/webhookService';

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
    const { businessId, id } = req.params;
    const { status, assignedTo, tags } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(assignedTo && { assignedTo }),
        ...(tags && { tags }),
        ...(status === 'RESOLVED' && { endedAt: new Date() })
      },
      include: {
        _count: { select: { messages: true, bookings: true, orders: true } }
      }
    });

    // Trigger webhook when conversation is resolved (ended)
    if (status === 'RESOLVED') {
      triggerWebhooks(businessId, 'conversation.ended', {
        conversationId: conversation.id,
        channel: conversation.channel,
        customerName: conversation.customerName,
        customerEmail: conversation.customerEmail,
        customerPhone: conversation.customerPhone,
        startedAt: conversation.startedAt,
        endedAt: conversation.endedAt,
        messageCount: conversation._count.messages,
        bookingCount: conversation._count.bookings,
        orderCount: conversation._count.orders,
        handedOffToHuman: conversation.handedOffToHuman,
        handoffReason: conversation.handoffReason
      });
    }

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

// Send WhatsApp message from dashboard
router.post('/whatsapp/send', async (req, res) => {
  try {
    const { to, message, businessId, conversationId } = req.body;
    const userId = (req as any).userId;

    if (!to || !message || !businessId) {
      return res.status(400).json({ error: 'Missing required fields: to, message, businessId' });
    }

    if (!twilioClient) {
      return res.status(503).json({ error: 'WhatsApp service not configured' });
    }

    // Get business's WhatsApp number
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { whatsappPhoneNumber: true, whatsappEnabled: true, name: true }
    });

    if (!business?.whatsappEnabled || !business?.whatsappPhoneNumber) {
      return res.status(400).json({ error: 'Business does not have WhatsApp enabled' });
    }

    // Normalize phone number and add whatsapp: prefix
    let normalizedTo = to.replace(/[^\d+]/g, '');
    if (normalizedTo.length === 10) {
      normalizedTo = `+1${normalizedTo}`;
    } else if (!normalizedTo.startsWith('+')) {
      normalizedTo = `+${normalizedTo}`;
    }

    // Add whatsapp: prefix
    const whatsappTo = `whatsapp:${normalizedTo}`;
    const whatsappFrom = business.whatsappPhoneNumber.startsWith('whatsapp:')
      ? business.whatsappPhoneNumber
      : `whatsapp:${business.whatsappPhoneNumber}`;

    // Send the WhatsApp message
    const result = await twilioClient.messages.create({
      to: whatsappTo,
      from: whatsappFrom,
      body: message
    });

    console.log(`WhatsApp sent to ${to} from dashboard: ${result.sid}`);

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
            channel: 'WHATSAPP'
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
        eventType: 'whatsapp_sent_from_dashboard',
        sessionId: conversationId,
        eventData: { to, messageLength: message.length, twilioSid: result.sid }
      }
    });

    res.json({ success: true, messageSid: result.sid });
  } catch (error: any) {
    console.error('Send WhatsApp error:', error);
    res.status(500).json({ error: error.message || 'Failed to send WhatsApp message' });
  }
});

// Export conversations as CSV or JSON
router.get('/:businessId/export', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const { format: exportFormat = 'json', startDate, endDate, status, channel } = req.query;

    // Build query filters
    const where: any = { businessId };
    if (status) where.status = status as string;
    if (channel) where.channel = channel as string;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = new Date(startDate as string);
      if (endDate) where.startedAt.lte = new Date(endDate as string);
    }

    // Fetch conversations with messages
    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        bookings: {
          select: {
            id: true,
            confirmationCode: true,
            startTime: true,
            status: true
          }
        },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
            status: true
          }
        }
      },
      orderBy: { startedAt: 'desc' }
    });

    if (exportFormat === 'csv') {
      // Generate CSV with streaming for large datasets
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="conversations-${format(new Date(), 'yyyy-MM-dd')}.csv"`);

      // Write CSV header
      res.write('Conversation ID,Channel,Status,Customer Name,Customer Email,Customer Phone,Started At,Ended At,Message Count,Booking Count,Order Count,Messages\n');

      // Stream each conversation
      for (const conv of conversations) {
        const messagesText = conv.messages
          .map(m => `[${m.role}] ${m.content.replace(/"/g, '""').replace(/\n/g, ' ')}`)
          .join(' | ');

        const row = [
          conv.id,
          conv.channel,
          conv.status,
          (conv.customerName || '').replace(/"/g, '""'),
          (conv.customerEmail || '').replace(/"/g, '""'),
          (conv.customerPhone || '').replace(/"/g, '""'),
          conv.startedAt.toISOString(),
          conv.endedAt?.toISOString() || '',
          conv.messages.length,
          conv.bookings.length,
          conv.orders.length,
          `"${messagesText.substring(0, 5000)}"` // Limit message length for CSV
        ].join(',');

        res.write(row + '\n');
      }

      res.end();
    } else {
      // JSON format with nested structure
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="conversations-${format(new Date(), 'yyyy-MM-dd')}.json"`);

      const exportData = {
        exportedAt: new Date().toISOString(),
        businessId,
        filters: { startDate, endDate, status, channel },
        totalConversations: conversations.length,
        conversations: conversations.map(conv => ({
          id: conv.id,
          channel: conv.channel,
          status: conv.status,
          customer: {
            name: conv.customerName,
            email: conv.customerEmail,
            phone: conv.customerPhone
          },
          visitorId: conv.visitorId,
          startedAt: conv.startedAt.toISOString(),
          endedAt: conv.endedAt?.toISOString() || null,
          lastMessageAt: conv.lastMessageAt.toISOString(),
          handedOffToHuman: conv.handedOffToHuman,
          handoffReason: conv.handoffReason,
          tags: conv.tags,
          messages: conv.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            tokensUsed: m.tokensUsed,
            modelUsed: m.modelUsed
          })),
          bookings: conv.bookings,
          orders: conv.orders
        }))
      };

      res.json(exportData);
    }
  } catch (error) {
    console.error('Export conversations error:', error);
    res.status(500).json({ error: 'Failed to export conversations' });
  }
});

export { router as conversationRouter };
