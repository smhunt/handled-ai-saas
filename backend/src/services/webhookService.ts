// Webhook Service - Deliver webhook notifications to external endpoints
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Webhook event types
export type WebhookEventType =
  | 'booking.created'
  | 'booking.updated'
  | 'booking.cancelled'
  | 'booking.confirmed'
  | 'order.created'
  | 'order.updated'
  | 'order.completed'
  | 'order.cancelled'
  | 'conversation.created'
  | 'conversation.ended'
  | 'conversation.handoff';

// All available webhook events
export const WEBHOOK_EVENTS = [
  'booking.created',
  'booking.updated',
  'booking.cancelled',
  'booking.confirmed',
  'order.created',
  'order.updated',
  'order.completed',
  'order.cancelled',
  'conversation.created',
  'conversation.ended',
  'conversation.handoff'
] as const;

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  businessId: string;
  data: Record<string, any>;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Trigger webhooks for a specific business and event
 */
export async function triggerWebhooks(
  businessId: string,
  event: WebhookEventType,
  data: Record<string, any>
): Promise<void> {
  try {
    // Find all active webhook endpoints subscribed to this event
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        businessId,
        isActive: true,
        events: {
          has: event
        }
      }
    });

    if (endpoints.length === 0) {
      return;
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      businessId,
      data
    };

    const payloadString = JSON.stringify(payload);

    // Send webhooks in parallel (fire-and-forget style with logging)
    const deliveryPromises = endpoints.map(async (endpoint) => {
      await deliverWebhookWithRetry(endpoint, event, payload, payloadString);
    });

    // Don't await - let webhooks be delivered asynchronously
    Promise.allSettled(deliveryPromises);
  } catch (error) {
    console.error('Error triggering webhooks:', error);
  }
}

/**
 * Deliver webhook with exponential backoff retry
 */
async function deliverWebhookWithRetry(
  endpoint: { id: string; url: string; secret: string },
  event: WebhookEventType,
  payload: WebhookPayload,
  payloadString: string,
  attempt: number = 1
): Promise<void> {
  const signature = generateSignature(payloadString, endpoint.secret);

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event,
        'X-Webhook-Timestamp': payload.timestamp,
        'X-Webhook-Attempt': String(attempt),
        'User-Agent': 'Handled-Webhook/1.0'
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(`Webhook delivery failed to ${endpoint.url}: ${response.status} ${response.statusText}`);

      // Log the failed attempt
      await logWebhookDelivery(endpoint.id, event, payload, false, response.status, responseText, attempt);

      // Retry if under max retries
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`Retrying webhook to ${endpoint.url} in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return deliverWebhookWithRetry(endpoint, event, payload, payloadString, attempt + 1);
      }
    } else {
      console.log(`Webhook delivered to ${endpoint.url} for event ${event}`);
      await logWebhookDelivery(endpoint.id, event, payload, true, response.status, responseText, attempt);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Webhook delivery error to ${endpoint.url}:`, error);

    // Log the failed attempt
    await logWebhookDelivery(endpoint.id, event, payload, false, 0, errorMessage, attempt);

    // Retry if under max retries
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.log(`Retrying webhook to ${endpoint.url} in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return deliverWebhookWithRetry(endpoint, event, payload, payloadString, attempt + 1);
    }
  }
}

/**
 * Log webhook delivery attempt to WebhookDelivery table
 */
async function logWebhookDelivery(
  endpointId: string,
  event: string,
  payload: WebhookPayload,
  success: boolean,
  statusCode: number,
  response: string,
  attempts: number
): Promise<void> {
  try {
    await prisma.webhookDelivery.create({
      data: {
        endpointId,
        event,
        payload,
        statusCode: statusCode || null,
        response: response?.substring(0, 5000) || null, // Limit response size
        success,
        attempts,
        deliveredAt: success ? new Date() : null
      }
    });
  } catch (error) {
    console.error('Error logging webhook delivery:', error);
  }
}

/**
 * Generate a secure random secret for a new webhook endpoint
 */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Verify webhook signature (utility for consumers)
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export const webhookService = {
  generateSignature,
  triggerWebhooks,
  generateWebhookSecret,
  verifySignature
};
