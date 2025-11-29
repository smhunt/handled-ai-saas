// Scheduled Jobs - Reminders, daily summaries, cleanup
// Run with: node dist/jobs/scheduler.js
// Or use a process manager like PM2

import { PrismaClient } from '@prisma/client';
import { addHours, subHours, startOfDay, endOfDay, subDays } from 'date-fns';
import { sendNotification, sendBookingReminder, sendTrialExpiredEmail } from '../services/notifications';

const prisma = new PrismaClient();

// ============================================
// JOB RUNNERS
// ============================================

/**
 * Send booking reminders (24 hours before)
 * Run every hour
 */
export async function sendBookingReminders() {
  console.log('[Job] Running booking reminders...');
  
  const now = new Date();
  const reminderWindowStart = addHours(now, 23);
  const reminderWindowEnd = addHours(now, 25);

  try {
    const bookings = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: reminderWindowStart,
          lte: reminderWindowEnd
        },
        status: 'CONFIRMED',
        reminderSent: false
      },
      include: {
        business: true
      }
    });

    console.log(`[Job] Found ${bookings.length} bookings to remind`);

    for (const booking of bookings) {
      try {
        await sendBookingReminder(booking);
        console.log(`[Job] Sent reminder for booking ${booking.confirmationCode}`);
      } catch (error) {
        console.error(`[Job] Failed to send reminder for ${booking.confirmationCode}:`, error);
      }
    }

    return { processed: bookings.length };
  } catch (error) {
    console.error('[Job] Booking reminders failed:', error);
    throw error;
  }
}

/**
 * Send daily summary emails to business owners
 * Run at 8 AM local time
 */
export async function sendDailySummaries() {
  console.log('[Job] Running daily summaries...');

  const yesterday = subDays(new Date(), 1);
  const startOfYesterday = startOfDay(yesterday);
  const endOfYesterday = endOfDay(yesterday);

  try {
    // Get all active businesses
    const businesses = await prisma.business.findMany({
      where: {
        plan: { not: 'TRIAL' }, // Only paid plans get daily summaries
        notifications: {
          some: {
            type: 'DAILY_SUMMARY',
            enabled: true
          }
        }
      }
    });

    console.log(`[Job] Sending summaries to ${businesses.length} businesses`);

    for (const business of businesses) {
      try {
        // Gather stats
        const [conversations, bookings, orders, revenue] = await Promise.all([
          prisma.conversation.count({
            where: {
              businessId: business.id,
              startedAt: { gte: startOfYesterday, lte: endOfYesterday }
            }
          }),
          prisma.booking.count({
            where: {
              businessId: business.id,
              createdAt: { gte: startOfYesterday, lte: endOfYesterday }
            }
          }),
          prisma.order.count({
            where: {
              businessId: business.id,
              createdAt: { gte: startOfYesterday, lte: endOfYesterday }
            }
          }),
          prisma.order.aggregate({
            where: {
              businessId: business.id,
              createdAt: { gte: startOfYesterday, lte: endOfYesterday },
              paymentStatus: 'PAID'
            },
            _sum: { total: true }
          })
        ]);

        // Calculate automation rate
        const handoffs = await prisma.conversation.count({
          where: {
            businessId: business.id,
            startedAt: { gte: startOfYesterday, lte: endOfYesterday },
            handedOffToHuman: true
          }
        });

        const automationRate = conversations > 0 
          ? Math.round(((conversations - handoffs) / conversations) * 100) 
          : 100;

        await sendNotification(business.id, 'DAILY_SUMMARY', {
          conversations,
          bookings,
          orders,
          revenue: revenue._sum.total || 0,
          automationRate,
          date: yesterday
        });

        console.log(`[Job] Sent summary to ${business.name}`);
      } catch (error) {
        console.error(`[Job] Failed to send summary to ${business.name}:`, error);
      }
    }

    return { processed: businesses.length };
  } catch (error) {
    console.error('[Job] Daily summaries failed:', error);
    throw error;
  }
}

/**
 * Mark no-show bookings
 * Run every hour
 */
export async function markNoShows() {
  console.log('[Job] Marking no-shows...');

  const twoHoursAgo = subHours(new Date(), 2);

  try {
    const result = await prisma.booking.updateMany({
      where: {
        startTime: { lt: twoHoursAgo },
        status: 'CONFIRMED'
      },
      data: {
        status: 'NO_SHOW'
      }
    });

    console.log(`[Job] Marked ${result.count} bookings as no-show`);
    return { processed: result.count };
  } catch (error) {
    console.error('[Job] Mark no-shows failed:', error);
    throw error;
  }
}

/**
 * Clean up abandoned conversations
 * Run daily
 */
export async function cleanupAbandonedConversations() {
  console.log('[Job] Cleaning up abandoned conversations...');

  const oneDayAgo = subDays(new Date(), 1);

  try {
    const result = await prisma.conversation.updateMany({
      where: {
        status: { in: ['ACTIVE', 'WAITING'] },
        lastMessageAt: { lt: oneDayAgo }
      },
      data: {
        status: 'ABANDONED',
        endedAt: new Date()
      }
    });

    console.log(`[Job] Marked ${result.count} conversations as abandoned`);
    return { processed: result.count };
  } catch (error) {
    console.error('[Job] Cleanup abandoned failed:', error);
    throw error;
  }
}

/**
 * Expire trial accounts
 * Run daily
 */
export async function expireTrials() {
  console.log('[Job] Expiring trials...');

  const fourteenDaysAgo = subDays(new Date(), 14);

  try {
    const expiredTrials = await prisma.business.findMany({
      where: {
        plan: 'TRIAL',
        createdAt: { lt: fourteenDaysAgo },
        planExpiresAt: null
      },
      include: {
        users: {
          where: { role: 'OWNER' },
          include: { user: { select: { email: true } } }
        }
      }
    });

    for (const business of expiredTrials) {
      await prisma.business.update({
        where: { id: business.id },
        data: { planExpiresAt: new Date() }
      });

      // Send trial expired email to owner
      const ownerEmail = business.users[0]?.user?.email;
      if (ownerEmail) {
        await sendTrialExpiredEmail(business, ownerEmail);
      }
      console.log(`[Job] Trial expired for ${business.name}`);
    }

    return { processed: expiredTrials.length };
  } catch (error) {
    console.error('[Job] Expire trials failed:', error);
    throw error;
  }
}

/**
 * Clean up old analytics events (keep 90 days)
 * Run weekly
 */
export async function cleanupOldAnalytics() {
  console.log('[Job] Cleaning up old analytics...');

  const ninetyDaysAgo = subDays(new Date(), 90);

  try {
    const result = await prisma.analyticsEvent.deleteMany({
      where: {
        createdAt: { lt: ninetyDaysAgo }
      }
    });

    console.log(`[Job] Deleted ${result.count} old analytics events`);
    return { processed: result.count };
  } catch (error) {
    console.error('[Job] Cleanup analytics failed:', error);
    throw error;
  }
}

/**
 * Clean up expired sessions
 * Run daily
 */
export async function cleanupExpiredSessions() {
  console.log('[Job] Cleaning up expired sessions...');

  try {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    console.log(`[Job] Deleted ${result.count} expired sessions`);
    return { processed: result.count };
  } catch (error) {
    console.error('[Job] Cleanup sessions failed:', error);
    throw error;
  }
}

// ============================================
// SIMPLE SCHEDULER (for development)
// In production, use proper job scheduler like Bull, Agenda, or cron
// ============================================

const JOBS = [
  { name: 'bookingReminders', fn: sendBookingReminders, interval: 60 * 60 * 1000 }, // Every hour
  { name: 'dailySummaries', fn: sendDailySummaries, interval: 24 * 60 * 60 * 1000 }, // Daily
  { name: 'markNoShows', fn: markNoShows, interval: 60 * 60 * 1000 }, // Every hour
  { name: 'cleanupConversations', fn: cleanupAbandonedConversations, interval: 24 * 60 * 60 * 1000 }, // Daily
  { name: 'expireTrials', fn: expireTrials, interval: 24 * 60 * 60 * 1000 }, // Daily
  { name: 'cleanupSessions', fn: cleanupExpiredSessions, interval: 24 * 60 * 60 * 1000 }, // Daily
  { name: 'cleanupAnalytics', fn: cleanupOldAnalytics, interval: 7 * 24 * 60 * 60 * 1000 }, // Weekly
];

export function startScheduler() {
  console.log('[Scheduler] Starting job scheduler...');

  for (const job of JOBS) {
    // Run immediately on startup
    job.fn().catch(err => console.error(`[Scheduler] ${job.name} initial run failed:`, err));

    // Schedule recurring runs
    setInterval(() => {
      job.fn().catch(err => console.error(`[Scheduler] ${job.name} failed:`, err));
    }, job.interval);

    console.log(`[Scheduler] Scheduled ${job.name} every ${job.interval / 1000 / 60} minutes`);
  }
}

// Run scheduler if this file is executed directly
if (require.main === module) {
  startScheduler();
}
