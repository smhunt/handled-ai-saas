// Widget Routes - Public API for embeddable chat widget
// These endpoints are called by the widget embedded on customer websites

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { handleConversation } from '../services/conversation';
import { checkUsageLimit, checkBusinessActive } from '../middleware/usageLimits';
import { verifyToken } from '@clerk/backend';
import jwt from 'jsonwebtoken';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to validate API key
async function validateApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const key = await prisma.apiKey.findUnique({
    where: { key: apiKey }
  });

  if (!key || !key.isActive) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Check expiry
  if (key.expiresAt && key.expiresAt < new Date()) {
    return res.status(401).json({ error: 'API key expired' });
  }

  // Update last used
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() }
  });

  req.businessId = key.businessId;
  req.apiKeyId = key.id;
  next();
}

// Preview endpoint - uses dashboard auth instead of API key
// This allows testing the widget before creating API keys
router.post('/preview/chat', async (req, res) => {
  console.log('Preview chat request received:', { body: req.body, hasAuth: !!req.headers.authorization });
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      console.log('Preview chat: No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    let userId: string | null = null;

    // Try Clerk token first, then fallback to legacy JWT
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!
      });
      const clerkUserId = payload.sub;
      console.log('Preview chat: Clerk user ID:', clerkUserId);

      // Try to find by clerkId first
      let user = await prisma.user.findFirst({ where: { clerkId: clerkUserId } });

      // If not found by clerkId, get email from Clerk and find by email
      if (!user && clerkUserId) {
        console.log('Preview chat: User not found by clerkId, checking by email...');
        const { createClerkClient } = await import('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
        const clerkUser = await clerk.users.getUser(clerkUserId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;

        if (email) {
          user = await prisma.user.findUnique({ where: { email } });
          if (user) {
            // Link the user to Clerk
            await prisma.user.update({
              where: { id: user.id },
              data: { clerkId: clerkUserId }
            });
            console.log('Preview chat: Linked user to Clerk:', user.id);
          }
        }
      }

      userId = user?.id || null;
      console.log('Preview chat: Found user:', userId);
    } catch (clerkError) {
      console.log('Preview chat: Clerk verification failed, trying legacy JWT:', clerkError);
      // Fallback to legacy JWT
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        userId = decoded.userId;
        console.log('Preview chat: Legacy JWT user:', userId);
      } catch {
        console.log('Preview chat: Both auth methods failed');
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    if (!userId) {
      console.log('Preview chat: No user found');
      return res.status(401).json({ error: 'User not found' });
    }

    const { businessId, message, sessionId } = req.body;

    if (!businessId) {
      return res.status(400).json({ error: 'Business ID required' });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Verify user has access to this business
    const businessUser = await prisma.businessUser.findFirst({
      where: { userId, businessId }
    });

    if (!businessUser) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

    // Get or create preview conversation
    let conversationId = sessionId;
    if (!conversationId) {
      const conversation = await prisma.conversation.create({
        data: {
          businessId,
          visitorId: `preview_${userId}`,
          channel: 'WEB',
          status: 'ACTIVE',
          metadata: { isPreview: true }
        }
      });
      conversationId = conversation.id;
    }

    // Process with AI
    const aiResponse = await handleConversation(
      businessId,
      conversationId,
      message
    );

    res.json({
      response: aiResponse,
      sessionId: conversationId
    });
  } catch (error) {
    console.error('Preview chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

router.use(validateApiKey);
router.use(checkBusinessActive);

// Get widget configuration
router.get('/config', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        widgetPosition: true,
        widgetGreeting: true,
        widgetOfflineMessage: true,
        widgetButtonText: true,
        widgetShowBusinessName: true,
        industry: true
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Check if business is currently open
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const availability = await prisma.availabilityRule.findFirst({
      where: {
        businessId: req.businessId,
        dayOfWeek,
        isOpen: true
      }
    });

    const isOpen = availability && 
      currentTime >= availability.startTime && 
      currentTime <= availability.endTime;

    res.json({
      businessId: business.id,
      businessName: business.name,
      logoUrl: business.logoUrl,
      primaryColor: business.primaryColor,
      widgetPosition: business.widgetPosition,
      widgetGreeting: business.widgetGreeting,
      widgetOfflineMessage: business.widgetOfflineMessage,
      widgetButtonText: business.widgetButtonText,
      widgetShowBusinessName: business.widgetShowBusinessName,
      industry: business.industry,
      isOpen,
      currentTime: now.toISOString()
    });
  } catch (error) {
    console.error('Get widget config error:', error);
    res.status(500).json({ error: 'Failed to load widget' });
  }
});

// Start a new conversation
router.post('/conversations', checkUsageLimit('conversations'), async (req, res) => {
  try {
    const { visitorId, pageUrl, referrer, userAgent } = req.body;

    // Generate visitor ID if not provided
    const finalVisitorId = visitorId || `visitor_${nanoid(16)}`;

    // Check for existing active conversation from this visitor
    let conversation = await prisma.conversation.findFirst({
      where: {
        businessId: req.businessId,
        visitorId: finalVisitorId,
        status: { in: ['ACTIVE', 'WAITING'] }
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          businessId: req.businessId,
          visitorId: finalVisitorId,
          channel: 'WEB',
          status: 'ACTIVE',
          pageUrl,
          referrer,
          userAgent
        }
      });

      // Log analytics event
      await prisma.analyticsEvent.create({
        data: {
          businessId: req.businessId,
          eventType: 'conversation_started',
          visitorId: finalVisitorId,
          eventData: { pageUrl, referrer }
        }
      });
    }

    // Get initial greeting
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { widgetGreeting: true, name: true }
    });

    res.json({
      conversationId: conversation.id,
      visitorId: finalVisitorId,
      greeting: business?.widgetGreeting || `Hi! Welcome to ${business?.name}. How can I help you today?`
    });
  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

// Send a message
router.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, visitorId, attachment } = req.body;

    // Allow empty content if there's an attachment
    const hasContent = content && content.trim().length > 0;
    const hasAttachment = attachment && attachment.data;

    if (!hasContent && !hasAttachment) {
      return res.status(400).json({ error: 'Message content or attachment required' });
    }

    // Verify conversation belongs to this business
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        businessId: req.businessId
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Build message content
    let messageContent = content || '';

    // If there's an attachment, add note about it to the content for the AI
    if (hasAttachment) {
      const attachmentNote = `[User sent an image: ${attachment.name}]`;
      messageContent = messageContent
        ? `${messageContent}\n\n${attachmentNote}`
        : attachmentNote;
    }

    // Build metadata for the message
    const messageMetadata: any = {};
    if (hasAttachment) {
      messageMetadata.attachment = {
        name: attachment.name,
        type: attachment.type,
        // Store base64 data (in production, you'd upload to S3/CloudStorage)
        data: attachment.data
      };
    }

    // Check if user wants to return to AI
    const returnToAiPhrases = ['talk to ai', 'talk to bot', 'go back', 'return to assistant', 'back to ai', 'ai help', 'restart'];
    const wantsToReturnToAi = hasContent && returnToAiPhrases.some(phrase => content.toLowerCase().includes(phrase));

    // If conversation was handed off, check if user wants to return to AI
    if (conversation.handedOffToHuman) {
      if (wantsToReturnToAi) {
        // Reset handoff and continue with AI
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            handedOffToHuman: false,
            status: 'ACTIVE',
            lastMessageAt: new Date()
          }
        });
        // Continue to AI processing below
      } else {
        // Still handed off - queue for human
        const message = await prisma.message.create({
          data: {
            conversationId,
            role: 'USER',
            content: messageContent,
            metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : undefined
          }
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() }
        });

        return res.json({
          message,
          response: "I've passed your message to our team. Someone will respond shortly.",
          handedOff: true,
          quickReplies: ['Talk to AI assistant', 'Start new conversation']
        });
      }
    }

    // Process with AI (pass the content which includes attachment note)
    const aiResponse = await handleConversation(
      req.businessId,
      conversationId,
      messageContent
    );

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        businessId: req.businessId,
        eventType: 'message_sent',
        visitorId,
        sessionId: conversationId,
        eventData: {
          messageLength: messageContent.length,
          hasAttachment: hasAttachment
        }
      }
    });

    // Generate contextual quick replies based on response
    const quickReplies = generateQuickReplies(aiResponse, content || '');

    res.json({
      response: aiResponse,
      handedOff: false,
      quickReplies
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Generate quick reply suggestions based on AI response
function generateQuickReplies(response: string, userMessage: string): string[] {
  const replies: string[] = [];
  const lowerResponse = response.toLowerCase();
  const lowerMessage = userMessage.toLowerCase();

  // FIRST: Check if booking/order was already confirmed (highest priority)
  if (lowerResponse.includes('confirmation code') || lowerResponse.includes('order #') ||
      lowerResponse.includes('order number') || lowerResponse.includes('booking confirmed') ||
      lowerResponse.includes('appointment confirmed') || lowerResponse.includes('order confirmed') ||
      (lowerResponse.includes('confirmed') && lowerResponse.includes('hnd'))) {
    replies.push('Thank you!', 'Book another', 'Ask a question');
    return replies;
  }

  // If asking about time preferences
  if (lowerResponse.includes('what time') || lowerResponse.includes('which time') ||
      lowerResponse.includes('available times') || lowerResponse.includes('available slots')) {
    // Extract times from response (e.g., "10:00 AM", "2:30 PM")
    const timeMatches = response.match(/\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/g);
    if (timeMatches && timeMatches.length > 0) {
      return timeMatches.slice(0, 4); // Return up to 4 time options
    }
  }

  // If asking for confirmation (but NOT already confirmed)
  if ((lowerResponse.includes('would you like') || lowerResponse.includes('shall i') ||
      lowerResponse.includes('do you want') || lowerResponse.includes('ready to confirm')) &&
      !lowerResponse.includes('confirmation code')) {
    if (lowerResponse.includes('book') || lowerResponse.includes('reservation') || lowerResponse.includes('appointment')) {
      replies.push('Yes, book it!', 'Change the time', 'Cancel');
    } else if (lowerResponse.includes('order')) {
      replies.push('Yes, confirm order', 'Add more items', 'Cancel order');
    } else {
      replies.push('Yes', 'No', 'Tell me more');
    }
    return replies;
  }

  // If showing menu or services
  if (lowerResponse.includes('menu') || lowerResponse.includes('services') ||
      lowerResponse.includes('offer') || lowerResponse.includes('pricing')) {
    replies.push('Book appointment', 'Tell me more', 'What are your hours?');
    return replies;
  }

  // If greeting or start of conversation
  if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
    replies.push('Book appointment', 'View services', 'What are your hours?');
    return replies;
  }

  // Default - no quick replies
  return [];
}

// Get conversation history
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = '50' } = req.query;

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit as string),
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true
      }
    });

    // Transform messages to include attachment data if present
    const transformedMessages = messages.map(msg => ({
      ...msg,
      attachment: (msg.metadata as any)?.attachment || null
    }));

    res.json(transformedMessages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Upload file attachment (standalone endpoint for larger files)
router.post('/conversations/:conversationId/attachments', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { name, type, data } = req.body;

    if (!name || !type || !data) {
      return res.status(400).json({ error: 'Attachment name, type, and data required' });
    }

    // Verify conversation belongs to this business
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        businessId: req.businessId
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Validate file type (only images for now)
    if (!type.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are supported' });
    }

    // Validate file size (max 5MB base64)
    const base64Size = data.length * 0.75; // Approximate size in bytes
    if (base64Size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be less than 5MB' });
    }

    // In production, you would upload to S3/CloudStorage and return URL
    // For now, we just validate and return the data URL
    const attachmentUrl = data; // In production: await uploadToStorage(data)

    res.json({
      success: true,
      attachment: {
        name,
        type,
        url: attachmentUrl
      }
    });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// Update visitor info (when they provide name/email/phone)
router.patch('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { customerName, customerEmail, customerPhone } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(customerName && { customerName }),
        ...(customerEmail && { customerEmail }),
        ...(customerPhone && { customerPhone })
      }
    });

    res.json(conversation);
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// End conversation
router.post('/conversations/:conversationId/end', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { rating, feedback } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'RESOLVED',
        endedAt: new Date(),
        metadata: {
          rating,
          feedback
        }
      }
    });

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        businessId: req.businessId,
        eventType: 'conversation_ended',
        sessionId: conversationId,
        eventData: { rating, feedback }
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('End conversation error:', error);
    res.status(500).json({ error: 'Failed to end conversation' });
  }
});

// Get menu (for order-taking businesses)
router.get('/menu', async (req, res) => {
  try {
    const categories = await prisma.menuCategory.findMany({
      where: {
        businessId: req.businessId,
        isActive: true
      },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            isPopular: true,
            allergens: true
          }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// Get services (for appointment-based businesses)
router.get('/services', async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: {
        businessId: req.businessId,
        isActive: true
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        duration: true,
        price: true
      }
    });

    res.json(services);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Check availability (public endpoint for booking widgets)
router.get('/availability', async (req, res) => {
  try {
    const { date, serviceId } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date required' });
    }

    const queryDate = new Date(date as string);
    const dayOfWeek = queryDate.getDay();

    // Get availability rules
    const rules = await prisma.availabilityRule.findMany({
      where: {
        businessId: req.businessId,
        OR: [
          { dayOfWeek },
          { specificDate: queryDate }
        ]
      }
    });

    // Get existing bookings
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await prisma.booking.findMany({
      where: {
        businessId: req.businessId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { in: ['PENDING', 'CONFIRMED'] }
      },
      select: { startTime: true, endTime: true }
    });

    // Generate available slots
    const slots: string[] = [];
    const openRule = rules.find(r => r.isOpen);

    if (openRule) {
      const [startHour, startMin] = openRule.startTime.split(':').map(Number);
      const [endHour, endMin] = openRule.endTime.split(':').map(Number);

      for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += 30) {
          if (hour === startHour && min < startMin) continue;
          if (hour === endHour - 1 && min > endMin) continue;

          const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
          const slotTime = new Date(queryDate);
          slotTime.setHours(hour, min, 0, 0);

          // Check if slot is taken
          const isTaken = existingBookings.some(booking => {
            const bookingStart = new Date(booking.startTime);
            return bookingStart.getTime() === slotTime.getTime();
          });

          if (!isTaken && slotTime > new Date()) {
            slots.push(timeStr);
          }
        }
      }
    }

    res.json({
      date: date,
      available: slots.length > 0,
      slots
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Track widget events (analytics)
router.post('/events', async (req, res) => {
  try {
    const { eventType, visitorId, sessionId, eventData } = req.body;

    await prisma.analyticsEvent.create({
      data: {
        businessId: req.businessId,
        eventType,
        visitorId,
        sessionId,
        eventData
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

export { router as widgetRouter };
