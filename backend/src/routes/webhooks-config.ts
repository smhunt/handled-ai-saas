// Webhook Configuration Routes - CRUD for webhook endpoints
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, businessAccessMiddleware } from '../middleware/auth';
import { generateWebhookSecret, WEBHOOK_EVENTS } from '../services/webhookService';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware);

// Get all webhook endpoints for a business
router.get('/:businessId', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
        // Note: secret is not returned for security
      }
    });

    res.json({
      endpoints,
      availableEvents: WEBHOOK_EVENTS
    });
  } catch (error) {
    console.error('Get webhook endpoints error:', error);
    res.status(500).json({ error: 'Failed to fetch webhook endpoints' });
  }
});

// Get a single webhook endpoint (with secret for initial setup)
router.get('/:businessId/:id', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id } = req.params;

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!endpoint) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    res.json(endpoint);
  } catch (error) {
    console.error('Get webhook endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch webhook endpoint' });
  }
});

// Create a new webhook endpoint
router.post('/:businessId', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const { name, url, events } = req.body;

    // Validate required fields
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Validate events
    const validEvents = events?.filter((e: string) => WEBHOOK_EVENTS.includes(e as any)) || [];
    if (validEvents.length === 0) {
      return res.status(400).json({
        error: 'At least one valid event is required',
        availableEvents: WEBHOOK_EVENTS
      });
    }

    // Generate secret
    const secret = generateWebhookSecret();

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        businessId,
        name,
        url,
        secret,
        events: validEvents,
        isActive: true
      }
    });

    // Return the full endpoint including secret (only time it's shown)
    res.status(201).json({
      ...endpoint,
      message: 'Webhook endpoint created. Save the secret - it will not be shown again.'
    });
  } catch (error) {
    console.error('Create webhook endpoint error:', error);
    res.status(500).json({ error: 'Failed to create webhook endpoint' });
  }
});

// Update a webhook endpoint
router.patch('/:businessId/:id', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id } = req.params;
    const { name, url, events, isActive } = req.body;

    // Check endpoint exists
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (url !== undefined) {
      try {
        new URL(url);
        updateData.url = url;
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
    }

    if (events !== undefined) {
      const validEvents = events.filter((e: string) => WEBHOOK_EVENTS.includes(e as any));
      if (validEvents.length === 0) {
        return res.status(400).json({
          error: 'At least one valid event is required',
          availableEvents: WEBHOOK_EVENTS
        });
      }
      updateData.events = validEvents;
    }

    const endpoint = await prisma.webhookEndpoint.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json(endpoint);
  } catch (error) {
    console.error('Update webhook endpoint error:', error);
    res.status(500).json({ error: 'Failed to update webhook endpoint' });
  }
});

// Regenerate webhook secret
router.post('/:businessId/:id/regenerate-secret', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id } = req.params;

    // Check endpoint exists
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    const newSecret = generateWebhookSecret();

    const endpoint = await prisma.webhookEndpoint.update({
      where: { id },
      data: { secret: newSecret }
    });

    res.json({
      id: endpoint.id,
      secret: newSecret,
      message: 'Secret regenerated. Save it - it will not be shown again.'
    });
  } catch (error) {
    console.error('Regenerate webhook secret error:', error);
    res.status(500).json({ error: 'Failed to regenerate secret' });
  }
});

// Delete a webhook endpoint
router.delete('/:businessId/:id', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id } = req.params;

    // Check endpoint exists
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    await prisma.webhookEndpoint.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Webhook endpoint deleted' });
  } catch (error) {
    console.error('Delete webhook endpoint error:', error);
    res.status(500).json({ error: 'Failed to delete webhook endpoint' });
  }
});

// Test webhook endpoint
router.post('/:businessId/:id/test', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id } = req.params;

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!endpoint) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    // Send test webhook
    const { triggerWebhooks } = await import('../services/webhookService');

    // Create a mock test event
    const testData = {
      test: true,
      message: 'This is a test webhook from Handled AI',
      timestamp: new Date().toISOString()
    };

    // For testing, we'll send directly instead of using triggerWebhooks
    const { generateSignature } = await import('../services/webhookService');
    const payload = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      businessId,
      data: testData
    });

    const signature = generateSignature(payload, endpoint.secret);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'test',
          'X-Webhook-Timestamp': new Date().toISOString(),
          'User-Agent': 'Handled-Webhook/1.0'
        },
        body: payload,
        signal: AbortSignal.timeout(10000)
      });

      res.json({
        success: response.ok,
        statusCode: response.status,
        statusText: response.statusText,
        message: response.ok ? 'Test webhook delivered successfully' : 'Webhook delivery failed'
      });
    } catch (fetchError: any) {
      res.json({
        success: false,
        statusCode: 0,
        message: `Failed to connect: ${fetchError.message}`
      });
    }
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({ error: 'Failed to test webhook' });
  }
});

// Get webhook delivery history for an endpoint
router.get('/:businessId/:id/deliveries', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id } = req.params;
    const { limit = '50', offset = '0', event, success } = req.query;

    // Verify endpoint belongs to business
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!endpoint) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    // Build filter
    const where: any = { endpointId: id };
    if (event) where.event = event as string;
    if (success !== undefined) where.success = success === 'true';

    const deliveries = await prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string), 100),
      skip: parseInt(offset as string),
      select: {
        id: true,
        event: true,
        statusCode: true,
        success: true,
        attempts: true,
        deliveredAt: true,
        createdAt: true
        // Don't return full payload/response in list view for performance
      }
    });

    const total = await prisma.webhookDelivery.count({ where });

    res.json({
      deliveries,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Get webhook deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch webhook deliveries' });
  }
});

// Get single delivery details (includes payload and response)
router.get('/:businessId/:id/deliveries/:deliveryId', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId, id, deliveryId } = req.params;

    // Verify endpoint belongs to business
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, businessId }
    });

    if (!endpoint) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpointId: id }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'Webhook delivery not found' });
    }

    res.json(delivery);
  } catch (error) {
    console.error('Get webhook delivery error:', error);
    res.status(500).json({ error: 'Failed to fetch webhook delivery' });
  }
});

export { router as webhooksConfigRouter };
