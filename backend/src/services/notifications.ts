// Notification Service - Email and SMS notifications
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import jwt from 'jsonwebtoken';
import { PrismaClient, NotificationType, NotificationChannel } from '@prisma/client';
import { format } from 'date-fns';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const prisma = new PrismaClient();

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

export async function sendNotification(
  businessId: string,
  type: NotificationType,
  data: any
) {
  // Get notification settings for this business and type
  const settings = await prisma.notificationSetting.findMany({
    where: {
      businessId,
      type,
      enabled: true
    }
  });

  if (settings.length === 0) {
    console.log(`No notification settings for ${type} in business ${businessId}`);
    return;
  }

  // Get business name for notifications
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true }
  });

  for (const setting of settings) {
    try {
      switch (setting.channel) {
        case 'EMAIL':
          await sendEmailNotification(setting.recipient, type, data, business?.name || 'Your Business');
          break;
        case 'SMS':
          await sendSMSNotification(setting.recipient, type, data, business?.name || 'Your Business');
          break;
        case 'WEBHOOK':
          await sendWebhookNotification(setting.recipient, type, data);
          break;
      }
    } catch (error) {
      console.error(`Failed to send ${setting.channel} notification:`, error);
    }
  }
}

// ============================================
// EMAIL NOTIFICATIONS
// ============================================

async function sendEmailNotification(
  to: string,
  type: NotificationType,
  data: any,
  businessName: string
) {
  const { subject, html } = getEmailContent(type, data, businessName);

  await emailTransporter.sendMail({
    from: `"Handled" <${process.env.SMTP_FROM || 'notifications@handled.ai'}>`,
    to,
    subject,
    html
  });

  console.log(`Email sent to ${to}: ${subject}`);
}

function getEmailContent(type: NotificationType, data: any, businessName: string) {
  const baseStyle = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  `;

  switch (type) {
    case 'NEW_BOOKING':
      return {
        subject: `New Booking - ${data.customerName}`,
        html: `
          <div style="${baseStyle}">
            <h2 style="color: #f97316;">New Booking Received</h2>
            <p>A new booking has been made for <strong>${businessName}</strong>.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Customer:</strong> ${data.customerName}</p>
              <p><strong>Date:</strong> ${format(new Date(data.startTime), 'EEEE, MMMM d, yyyy')}</p>
              <p><strong>Time:</strong> ${format(new Date(data.startTime), 'h:mm a')}</p>
              <p><strong>Party Size:</strong> ${data.partySize}</p>
              ${data.customerPhone ? `<p><strong>Phone:</strong> ${data.customerPhone}</p>` : ''}
              ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
              <p><strong>Confirmation Code:</strong> ${data.confirmationCode}</p>
            </div>
            <p style="color: #666; font-size: 14px;">
              View and manage this booking in your <a href="${process.env.APP_URL}/dashboard">Handled Dashboard</a>.
            </p>
          </div>
        `
      };

    case 'BOOKING_CANCELLED':
      return {
        subject: `Booking Cancelled - ${data.customerName}`,
        html: `
          <div style="${baseStyle}">
            <h2 style="color: #ef4444;">Booking Cancelled</h2>
            <p>A booking has been cancelled for <strong>${businessName}</strong>.</p>
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Customer:</strong> ${data.customerName}</p>
              <p><strong>Original Date:</strong> ${format(new Date(data.startTime), 'EEEE, MMMM d, yyyy')}</p>
              <p><strong>Original Time:</strong> ${format(new Date(data.startTime), 'h:mm a')}</p>
              ${data.cancellationReason ? `<p><strong>Reason:</strong> ${data.cancellationReason}</p>` : ''}
            </div>
          </div>
        `
      };

    case 'NEW_ORDER':
      return {
        subject: `New Order #${data.orderNumber}`,
        html: `
          <div style="${baseStyle}">
            <h2 style="color: #f97316;">New Order Received</h2>
            <p>A new ${data.type.toLowerCase()} order has been placed at <strong>${businessName}</strong>.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Order #:</strong> ${data.orderNumber}</p>
              <p><strong>Customer:</strong> ${data.customerName}</p>
              <p><strong>Phone:</strong> ${data.customerPhone}</p>
              <p><strong>Type:</strong> ${data.type}</p>
              ${data.requestedTime ? `<p><strong>Requested Time:</strong> ${format(new Date(data.requestedTime), 'h:mm a')}</p>` : ''}
              <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
              <p><strong>Items:</strong></p>
              <ul>
                ${data.items?.map((item: any) => `<li>${item.quantity}x ${item.name} - $${item.totalPrice.toFixed(2)}</li>`).join('') || ''}
              </ul>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
              <p><strong>Total:</strong> $${data.total.toFixed(2)}</p>
              ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
            </div>
          </div>
        `
      };

    case 'HANDOFF_REQUEST':
      return {
        subject: `Human Assistance Needed - Conversation`,
        html: `
          <div style="${baseStyle}">
            <h2 style="color: #f97316;">Customer Needs Human Assistance</h2>
            <p>A customer at <strong>${businessName}</strong> has been handed off to human support.</p>
            <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Reason:</strong> ${data.handoffReason || 'Customer requested human assistance'}</p>
              ${data.customerName ? `<p><strong>Customer:</strong> ${data.customerName}</p>` : ''}
              ${data.customerPhone ? `<p><strong>Phone:</strong> ${data.customerPhone}</p>` : ''}
            </div>
            <p>
              <a href="${process.env.APP_URL}/dashboard/conversations/${data.conversationId}" 
                 style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Conversation
              </a>
            </p>
          </div>
        `
      };

    case 'DAILY_SUMMARY':
      return {
        subject: `Daily Summary - ${businessName}`,
        html: `
          <div style="${baseStyle}">
            <h2 style="color: #f97316;">Your Daily Summary</h2>
            <p>Here's what happened at <strong>${businessName}</strong> today:</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Conversations:</strong> ${data.conversations || 0}</p>
              <p><strong>Bookings:</strong> ${data.bookings || 0}</p>
              <p><strong>Orders:</strong> ${data.orders || 0}</p>
              <p><strong>Revenue:</strong> $${(data.revenue || 0).toFixed(2)}</p>
              <p><strong>AI Automation Rate:</strong> ${data.automationRate || 100}%</p>
            </div>
            <p>
              <a href="${process.env.APP_URL}/dashboard" 
                 style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Full Dashboard
              </a>
            </p>
          </div>
        `
      };

    default:
      return {
        subject: `Notification from ${businessName}`,
        html: `<div style="${baseStyle}"><p>You have a new notification.</p></div>`
      };
  }
}

// ============================================
// SMS NOTIFICATIONS
// ============================================

async function sendSMSNotification(
  to: string,
  type: NotificationType,
  data: any,
  businessName: string
) {
  if (!twilioClient || !TWILIO_PHONE) {
    console.log('Twilio not configured, skipping SMS');
    return;
  }

  const message = getSMSContent(type, data, businessName);

  await twilioClient.messages.create({
    body: message,
    from: TWILIO_PHONE,
    to
  });

  console.log(`SMS sent to ${to}`);
}

function getSMSContent(type: NotificationType, data: any, businessName: string): string {
  switch (type) {
    case 'NEW_BOOKING':
      return `📅 New booking at ${businessName}! ${data.customerName} for ${data.partySize} on ${format(new Date(data.startTime), 'MMM d')} at ${format(new Date(data.startTime), 'h:mm a')}. Code: ${data.confirmationCode}`;

    case 'BOOKING_CANCELLED':
      return `❌ Booking cancelled: ${data.customerName}'s reservation for ${format(new Date(data.startTime), 'MMM d')} has been cancelled.`;

    case 'NEW_ORDER':
      return `🍽️ New ${data.type.toLowerCase()} order #${data.orderNumber} at ${businessName}! ${data.customerName} - $${data.total.toFixed(2)}`;

    case 'HANDOFF_REQUEST':
      return `⚠️ Customer needs human help at ${businessName}. Check your dashboard to respond.`;

    default:
      return `New notification from ${businessName}. Check your dashboard for details.`;
  }
}

// ============================================
// WEBHOOK NOTIFICATIONS
// ============================================

async function sendWebhookNotification(
  url: string,
  type: NotificationType,
  data: any
) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Handled-Event': type
      },
      body: JSON.stringify({
        event: type,
        timestamp: new Date().toISOString(),
        data
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    console.log(`Webhook sent to ${url}`);
  } catch (error) {
    console.error(`Webhook to ${url} failed:`, error);
  }
}

// ============================================
// CUSTOMER NOTIFICATIONS
// ============================================

export async function sendBookingConfirmation(booking: any) {
  if (!booking.customerEmail && !booking.customerPhone) return;

  const business = await prisma.business.findUnique({
    where: { id: booking.businessId },
    select: { name: true, phone: true, email: true, twilioPhoneNumber: true }
  });

  // Email confirmation
  if (booking.customerEmail) {
    try {
      await emailTransporter.sendMail({
        from: `"${business?.name}" <${process.env.SMTP_FROM || 'notifications@handled.ai'}>`,
        to: booking.customerEmail,
        subject: `Booking Confirmed - ${business?.name}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Your Booking is Confirmed! ✓</h2>
            <p>Hi ${booking.customerName},</p>
            <p>Your reservation at <strong>${business?.name}</strong> has been confirmed.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Date:</strong> ${format(new Date(booking.startTime), 'EEEE, MMMM d, yyyy')}</p>
              <p><strong>Time:</strong> ${format(new Date(booking.startTime), 'h:mm a')}</p>
              <p><strong>Party Size:</strong> ${booking.partySize}</p>
              <p><strong>Confirmation Code:</strong> ${booking.confirmationCode}</p>
            </div>
            <p>Need to make changes? Reply to this email or call us at ${business?.phone || 'our phone number'}.</p>
            <p>See you soon!</p>
            <p style="color: #666;">— The ${business?.name} Team</p>
          </div>
        `
      });
    } catch (error) {
      console.error('Failed to send booking confirmation email:', error);
    }
  }

  // SMS confirmation - use business's Twilio number if available, fallback to global
  if (booking.customerPhone && twilioClient) {
    const fromNumber = business?.twilioPhoneNumber || TWILIO_PHONE;
    if (fromNumber) {
      try {
        await twilioClient.messages.create({
          body: `✓ Booking confirmed at ${business?.name}! ${format(new Date(booking.startTime), 'MMM d')} at ${format(new Date(booking.startTime), 'h:mm a')} for ${booking.partySize}. Code: ${booking.confirmationCode}`,
          from: fromNumber,
          to: booking.customerPhone
        });
        console.log(`Booking confirmation SMS sent to ${booking.customerPhone}`);
      } catch (error) {
        console.error('Failed to send booking confirmation SMS:', error);
      }
    }
  }
}

export async function sendOrderConfirmation(order: any) {
  if (!order.customerPhone || !twilioClient) return;

  const business = await prisma.business.findUnique({
    where: { id: order.businessId },
    select: { name: true, twilioPhoneNumber: true }
  });

  // Use business's Twilio number if available, fallback to global
  const fromNumber = business?.twilioPhoneNumber || TWILIO_PHONE;
  if (!fromNumber) return;

  try {
    await twilioClient.messages.create({
      body: `✓ Order #${order.orderNumber} confirmed at ${business?.name}! Your ${order.type.toLowerCase()} order will be ready soon. Total: $${order.total.toFixed(2)}`,
      from: fromNumber,
      to: order.customerPhone
    });
    console.log(`Order confirmation SMS sent to ${order.customerPhone}`);
  } catch (error) {
    console.error('Failed to send order confirmation SMS:', error);
  }
}

export async function sendPaymentFailedEmail(business: any, ownerEmail: string) {
  try {
    await emailTransporter.sendMail({
      from: `"Handled" <${process.env.SMTP_FROM || 'notifications@handled.ai'}>`,
      to: ownerEmail,
      subject: `Payment Failed - ${business.name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #ef4444;">Payment Failed</h2>
          <p>Hi there,</p>
          <p>We were unable to process your payment for <strong>${business.name}</strong> on Handled.</p>
          <p>Please update your payment method to avoid any interruption to your service:</p>
          <p>
            <a href="${process.env.APP_URL}/settings?tab=billing"
               style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Update Payment Method
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            If you believe this is an error or need assistance, please reply to this email.
          </p>
        </div>
      `
    });
    console.log(`Payment failed email sent to ${ownerEmail}`);
  } catch (error) {
    console.error('Failed to send payment failed email:', error);
  }
}

export async function sendTrialExpiredEmail(business: any, ownerEmail: string) {
  try {
    await emailTransporter.sendMail({
      from: `"Handled" <${process.env.SMTP_FROM || 'notifications@handled.ai'}>`,
      to: ownerEmail,
      subject: `Your Handled trial has ended - ${business.name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #f97316;">Your Trial Has Ended</h2>
          <p>Hi there,</p>
          <p>Your 14-day free trial for <strong>${business.name}</strong> on Handled has ended.</p>
          <p>During your trial, you were able to:</p>
          <ul>
            <li>Automate customer conversations with AI</li>
            <li>Accept bookings and orders 24/7</li>
            <li>Manage your business from anywhere</li>
          </ul>
          <p>To continue using Handled and keep your data, please upgrade to a paid plan:</p>
          <p>
            <a href="${process.env.APP_URL}/settings?tab=billing"
               style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Upgrade Now
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Questions? Reply to this email and we'll be happy to help.
          </p>
        </div>
      `
    });
    console.log(`Trial expired email sent to ${ownerEmail}`);
  } catch (error) {
    console.error('Failed to send trial expired email:', error);
  }
}

export async function sendBookingReminder(booking: any) {
  // Send reminder 24 hours before
  if (!booking.customerPhone || !twilioClient) return;

  const business = await prisma.business.findUnique({
    where: { id: booking.businessId },
    select: { name: true, twilioPhoneNumber: true }
  });

  // Use business's Twilio number if available, fallback to global
  const fromNumber = business?.twilioPhoneNumber || TWILIO_PHONE;
  if (!fromNumber) return;

  try {
    await twilioClient.messages.create({
      body: `Reminder: You have a reservation at ${business?.name} tomorrow at ${format(new Date(booking.startTime), 'h:mm a')} for ${booking.partySize}. See you then!`,
      from: fromNumber,
      to: booking.customerPhone
    });

    // Mark reminder as sent
    await prisma.booking.update({
      where: { id: booking.id },
      data: { reminderSent: true }
    });
    console.log(`Booking reminder SMS sent to ${booking.customerPhone}`);
  } catch (error) {
    console.error('Failed to send booking reminder SMS:', error);
  }
}

// ============================================
// TEAM INVITATION
// ============================================

export async function sendTeamInvitationEmail(
  userEmail: string,
  userId: string,
  businessName: string,
  role: string
) {
  try {
    // Generate an invitation token (expires in 7 days)
    const inviteToken = jwt.sign(
      { userId, purpose: 'team-invite' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const setPasswordUrl = `${process.env.APP_URL || 'http://localhost:5173'}/set-password?token=${inviteToken}`;

    await emailTransporter.sendMail({
      from: `"Handled" <${process.env.SMTP_FROM || 'notifications@handled.ai'}>`,
      to: userEmail,
      subject: `You've been invited to join ${businessName} on Handled`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #f97316;">You've Been Invited!</h2>
          <p>Hi there,</p>
          <p>You've been invited to join <strong>${businessName}</strong> on Handled as a <strong>${role}</strong>.</p>
          <p>Handled is an AI-powered platform that helps businesses manage bookings, orders, and customer conversations.</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Business:</strong> ${businessName}</p>
            <p style="margin: 10px 0 0;"><strong>Your Role:</strong> ${role}</p>
          </div>
          <p>To get started, click the button below to set your password:</p>
          <p>
            <a href="${setPasswordUrl}"
               style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Set Your Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This invitation link will expire in 7 days. If you didn't expect this invitation, you can ignore this email.
          </p>
        </div>
      `
    });

    console.log(`Team invitation email sent to ${userEmail} for business ${businessName}`);
  } catch (error) {
    console.error('Failed to send team invitation email:', error);
  }
}
