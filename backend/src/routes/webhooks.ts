// Webhook Routes - Stripe, Twilio, and other external service callbacks
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { sendPaymentFailedEmail } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();

const stripe = process.env.STRIPE_SECRET_KEY?.trim()
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' })
  : null;

// Stripe webhook
router.post('/stripe', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = req.body;
    }
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancelled(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const businessId = session.metadata?.businessId;
  const plan = session.metadata?.plan as any;

  if (!businessId) return;

  await prisma.business.update({
    where: { id: businessId },
    data: {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      plan: plan || 'PROFESSIONAL',
      planExpiresAt: null // Subscription is active
    }
  });

  console.log(`Business ${businessId} subscribed to ${plan}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const business = await prisma.business.findFirst({
    where: { stripeSubscriptionId: subscription.id }
  });

  if (!business) return;

  // Map Stripe price to plan
  const priceId = subscription.items.data[0]?.price.id;
  const planMap: Record<string, any> = {
    [process.env.STRIPE_STARTER_PRICE_ID || '']: 'STARTER',
    [process.env.STRIPE_PRO_PRICE_ID || '']: 'PROFESSIONAL',
    [process.env.STRIPE_BUSINESS_PRICE_ID || '']: 'BUSINESS'
  };

  const plan = planMap[priceId] || 'PROFESSIONAL';

  await prisma.business.update({
    where: { id: business.id },
    data: {
      plan,
      planExpiresAt: subscription.status === 'active' ? null : new Date(subscription.current_period_end * 1000)
    }
  });
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  const business = await prisma.business.findFirst({
    where: { stripeSubscriptionId: subscription.id }
  });

  if (!business) return;

  await prisma.business.update({
    where: { id: business.id },
    data: {
      plan: 'TRIAL',
      planExpiresAt: new Date(subscription.current_period_end * 1000),
      stripeSubscriptionId: null
    }
  });

  console.log(`Business ${business.id} subscription cancelled`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`Payment succeeded for invoice ${invoice.id}`);
  // Could send receipt email here
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const business = await prisma.business.findFirst({
    where: { stripeCustomerId: invoice.customer as string },
    include: {
      users: {
        where: { role: 'OWNER' },
        include: { user: { select: { email: true } } }
      }
    }
  });

  if (!business) return;

  // Send payment failed notification to owner
  const ownerEmail = business.users[0]?.user?.email;
  if (ownerEmail) {
    await sendPaymentFailedEmail(business, ownerEmail);
  }
  console.log(`Payment failed for business ${business.id}`);
}

// Twilio webhook (for SMS conversations)
router.post('/twilio/sms', async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    console.log(`Incoming SMS from ${From} to ${To}: ${Body?.substring(0, 50)}...`);

    // Normalize phone number for matching (remove non-digits except +)
    const normalizedTo = To.replace(/[^\d+]/g, '');

    // Find business by Twilio phone number (match last 10 digits)
    const business = await prisma.business.findFirst({
      where: {
        twilioPhoneNumber: {
          contains: normalizedTo.slice(-10)
        },
        isActive: true
      }
    });

    if (!business) {
      console.log(`No business found for Twilio number ${To}`);
      return res.status(200).send('<Response><Message>This number is not currently active.</Message></Response>');
    }

    // Normalize customer phone number
    const normalizedFrom = From.replace(/[^\d+]/g, '');

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        customerPhone: normalizedFrom,
        channel: 'SMS',
        status: { in: ['ACTIVE', 'WAITING'] }
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          businessId: business.id,
          visitorId: `sms_${normalizedFrom}`,
          customerPhone: normalizedFrom,
          channel: 'SMS',
          status: 'ACTIVE',
          metadata: { twilioMessageSid: MessageSid }
        }
      });

      // Log analytics event
      await prisma.analyticsEvent.create({
        data: {
          businessId: business.id,
          eventType: 'sms_conversation_started',
          visitorId: `sms_${normalizedFrom}`,
          eventData: { phone: From }
        }
      });
    }

    // Process with AI
    const { handleConversation } = await import('../services/conversation');
    let response = await handleConversation(business.id, conversation.id, Body);

    // Update last message timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    // Truncate response if too long for SMS (1600 char limit for concatenated)
    if (response.length > 1500) {
      response = response.substring(0, 1497) + '...';
    }

    // Remove markdown formatting for SMS (bold, italic, links)
    response = response
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
      .replace(/\*([^*]+)\*/g, '$1')      // Remove *italic*
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');  // Remove [links](url)

    // Send TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(response)}</Message>
</Response>`;

    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Twilio SMS webhook error:', error);
    res.status(500).send('<Response><Message>Sorry, something went wrong. Please try again.</Message></Response>');
  }
});

// Twilio status callback
router.post('/twilio/status', async (req, res) => {
  const { MessageSid, MessageStatus, To, ErrorCode } = req.body;

  console.log(`SMS ${MessageSid} to ${To}: ${MessageStatus}${ErrorCode ? ` (Error: ${ErrorCode})` : ''}`);

  res.status(200).send('OK');
});

// Twilio WhatsApp webhook
router.post('/twilio/whatsapp', async (req, res) => {
  try {
    const { From, To, Body, MessageSid, ProfileName } = req.body;

    // WhatsApp messages come with whatsapp: prefix
    const fromPhone = From.replace('whatsapp:', '');
    const toPhone = To.replace('whatsapp:', '');

    console.log(`Incoming WhatsApp from ${fromPhone} to ${toPhone}: ${Body?.substring(0, 50)}...`);

    // Normalize phone number for matching (remove non-digits except +)
    const normalizedTo = toPhone.replace(/[^\d+]/g, '');

    // Find business by WhatsApp phone number (match last 10 digits)
    const business = await prisma.business.findFirst({
      where: {
        whatsappPhoneNumber: {
          contains: normalizedTo.slice(-10)
        },
        whatsappEnabled: true,
        isActive: true
      }
    });

    if (!business) {
      console.log(`No business found for WhatsApp number ${toPhone}`);
      return res.status(200).send('<Response><Message>This WhatsApp number is not currently active.</Message></Response>');
    }

    // Normalize customer phone number
    const normalizedFrom = fromPhone.replace(/[^\d+]/g, '');

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        customerPhone: normalizedFrom,
        channel: 'WHATSAPP',
        status: { in: ['ACTIVE', 'WAITING'] }
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          businessId: business.id,
          visitorId: `whatsapp_${normalizedFrom}`,
          customerPhone: normalizedFrom,
          customerName: ProfileName || null, // WhatsApp provides profile name
          channel: 'WHATSAPP',
          status: 'ACTIVE',
          metadata: {
            twilioMessageSid: MessageSid,
            whatsappSessionStart: new Date().toISOString() // Track 24-hour session window
          }
        }
      });

      // Log analytics event
      await prisma.analyticsEvent.create({
        data: {
          businessId: business.id,
          eventType: 'whatsapp_conversation_started',
          visitorId: `whatsapp_${normalizedFrom}`,
          eventData: { phone: fromPhone, profileName: ProfileName }
        }
      });
    } else {
      // Update session start time if customer initiates new message (refreshes 24hr window)
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...(conversation.metadata as any || {}),
            whatsappSessionStart: new Date().toISOString()
          }
        }
      });
    }

    // Process with AI
    const { handleConversation } = await import('../services/conversation');
    let response = await handleConversation(business.id, conversation.id, Body);

    // Update last message timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    // WhatsApp has a 1600 character limit per message
    if (response.length > 1500) {
      response = response.substring(0, 1497) + '...';
    }

    // WhatsApp supports basic formatting: *bold*, _italic_, ~strikethrough~, ```code```
    // Keep markdown formatting but convert our standard format to WhatsApp format
    response = response
      .replace(/\*\*([^*]+)\*\*/g, '*$1*');  // Convert **bold** to *bold*

    // Send TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(response)}</Message>
</Response>`;

    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Twilio WhatsApp webhook error:', error);
    res.status(500).send('<Response><Message>Sorry, something went wrong. Please try again.</Message></Response>');
  }
});

// Generic webhook for integrations
router.post('/integrations/:integrationId', async (req, res) => {
  try {
    const { integrationId } = req.params;
    
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration || !integration.isActive) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Log the webhook
    await prisma.analyticsEvent.create({
      data: {
        businessId: integration.businessId,
        eventType: 'webhook_received',
        eventData: {
          integrationType: integration.type,
          payload: req.body
        }
      }
    });

    // Process based on integration type
    switch (integration.type) {
      case 'SQUARE':
        await handleSquareWebhook(integration, req.body);
        break;
      case 'TOAST':
        await handleToastWebhook(integration, req.body);
        break;
      case 'ZAPIER':
        // Zapier just sends data, acknowledge receipt
        break;
      default:
        console.log(`Unhandled integration type: ${integration.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Integration webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleSquareWebhook(integration: any, payload: any) {
  // Handle Square POS webhooks
  const eventType = payload.type;
  const businessId = integration.businessId;

  console.log('Square webhook:', eventType);

  switch (eventType) {
    case 'order.created':
    case 'order.updated': {
      const squareOrder = payload.data?.object?.order_created || payload.data?.object?.order_updated;
      if (squareOrder) {
        // Sync order from Square
        const existingOrder = await prisma.order.findFirst({
          where: {
            businessId,
            notes: { contains: `square:${squareOrder.order_id}` }
          }
        });

        if (!existingOrder) {
          // Create new order from Square
          await prisma.order.create({
            data: {
              businessId,
              orderNumber: `SQ-${squareOrder.order_id.slice(-8)}`,
              customerName: squareOrder.fulfillments?.[0]?.pickup_details?.recipient?.display_name || 'Square Customer',
              customerPhone: squareOrder.fulfillments?.[0]?.pickup_details?.recipient?.phone_number,
              type: 'PICKUP',
              status: 'CONFIRMED',
              subtotal: (squareOrder.total_money?.amount || 0) / 100,
              total: (squareOrder.total_money?.amount || 0) / 100,
              notes: `square:${squareOrder.order_id}`
            }
          });
          console.log(`Synced Square order ${squareOrder.order_id}`);
        }
      }
      break;
    }

    case 'payment.completed': {
      const payment = payload.data?.object?.payment;
      if (payment?.order_id) {
        // Update order payment status
        await prisma.order.updateMany({
          where: {
            businessId,
            notes: { contains: `square:${payment.order_id}` }
          },
          data: { paymentStatus: 'PAID' }
        });
        console.log(`Updated payment for Square order ${payment.order_id}`);
      }
      break;
    }

    default:
      console.log(`Unhandled Square event: ${eventType}`);
  }
}

async function handleToastWebhook(integration: any, payload: any) {
  // Handle Toast POS webhooks
  const eventType = payload.eventType;
  const businessId = integration.businessId;

  console.log('Toast webhook:', eventType);

  switch (eventType) {
    case 'orderCreated':
    case 'orderUpdated': {
      const toastOrder = payload.order;
      if (toastOrder) {
        const existingOrder = await prisma.order.findFirst({
          where: {
            businessId,
            notes: { contains: `toast:${toastOrder.guid}` }
          }
        });

        if (!existingOrder) {
          await prisma.order.create({
            data: {
              businessId,
              orderNumber: `TO-${toastOrder.displayNumber || toastOrder.guid.slice(-8)}`,
              customerName: toastOrder.customer?.firstName
                ? `${toastOrder.customer.firstName} ${toastOrder.customer.lastName || ''}`
                : 'Toast Customer',
              customerPhone: toastOrder.customer?.phone,
              type: toastOrder.diningOption === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
              status: 'CONFIRMED',
              subtotal: (toastOrder.totalAmount || 0) / 100,
              total: (toastOrder.totalAmount || 0) / 100,
              notes: `toast:${toastOrder.guid}`
            }
          });
          console.log(`Synced Toast order ${toastOrder.guid}`);
        }
      }
      break;
    }

    case 'menuUpdated': {
      // Log menu updates - could trigger a full menu sync
      console.log(`Toast menu updated for business ${businessId}`);
      // In a full implementation, would fetch updated menu and sync
      break;
    }

    default:
      console.log(`Unhandled Toast event: ${eventType}`);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export { router as webhookRouter };
