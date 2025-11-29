// Analytics Routes - Dashboard stats and reporting
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import { subDays, startOfDay, endOfDay, format, eachDayOfInterval } from 'date-fns';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get dashboard overview
router.get('/:businessId/overview', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { days = '7' } = req.query;
    
    const startDate = startOfDay(subDays(new Date(), parseInt(days as string)));
    const endDate = endOfDay(new Date());

    // Get counts
    const [
      totalConversations,
      totalBookings,
      totalOrders,
      handoffRequests,
      messageCount,
      revenue
    ] = await Promise.all([
      prisma.conversation.count({
        where: { businessId, startedAt: { gte: startDate, lte: endDate } }
      }),
      prisma.booking.count({
        where: { businessId, createdAt: { gte: startDate, lte: endDate } }
      }),
      prisma.order.count({
        where: { businessId, createdAt: { gte: startDate, lte: endDate } }
      }),
      prisma.conversation.count({
        where: { businessId, handedOffToHuman: true, startedAt: { gte: startDate, lte: endDate } }
      }),
      prisma.message.count({
        where: { 
          conversation: { businessId },
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      prisma.order.aggregate({
        where: { 
          businessId, 
          createdAt: { gte: startDate, lte: endDate },
          paymentStatus: 'PAID'
        },
        _sum: { total: true }
      })
    ]);

    // Calculate automation rate (conversations handled without human)
    const automatedConversations = totalConversations - handoffRequests;
    const automationRate = totalConversations > 0 
      ? Math.round((automatedConversations / totalConversations) * 100) 
      : 100;

    // Get previous period for comparison
    const prevStartDate = startOfDay(subDays(startDate, parseInt(days as string)));
    const [prevConversations, prevBookings, prevOrders] = await Promise.all([
      prisma.conversation.count({
        where: { businessId, startedAt: { gte: prevStartDate, lt: startDate } }
      }),
      prisma.booking.count({
        where: { businessId, createdAt: { gte: prevStartDate, lt: startDate } }
      }),
      prisma.order.count({
        where: { businessId, createdAt: { gte: prevStartDate, lt: startDate } }
      })
    ]);

    res.json({
      period: { start: startDate, end: endDate, days: parseInt(days as string) },
      metrics: {
        conversations: {
          total: totalConversations,
          change: calculateChange(totalConversations, prevConversations)
        },
        bookings: {
          total: totalBookings,
          change: calculateChange(totalBookings, prevBookings)
        },
        orders: {
          total: totalOrders,
          change: calculateChange(totalOrders, prevOrders)
        },
        messages: messageCount,
        revenue: revenue._sum.total || 0,
        automationRate,
        handoffRequests
      }
    });
  } catch (error) {
    console.error('Get analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get conversation analytics
router.get('/:businessId/conversations', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { days = '7' } = req.query;
    
    const startDate = startOfDay(subDays(new Date(), parseInt(days as string)));
    const endDate = endOfDay(new Date());

    // Get daily conversation counts
    const conversations = await prisma.conversation.findMany({
      where: { businessId, startedAt: { gte: startDate, lte: endDate } },
      select: { startedAt: true, status: true, handedOffToHuman: true, channel: true }
    });

    // Group by day
    const dailyData = eachDayOfInterval({ start: startDate, end: endDate }).map(date => {
      const dayConversations = conversations.filter(c => 
        format(c.startedAt, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
      );

      return {
        date: format(date, 'yyyy-MM-dd'),
        total: dayConversations.length,
        resolved: dayConversations.filter(c => c.status === 'RESOLVED').length,
        handedOff: dayConversations.filter(c => c.handedOffToHuman).length
      };
    });

    // Channel breakdown
    const channelBreakdown = conversations.reduce((acc: any, c) => {
      acc[c.channel] = (acc[c.channel] || 0) + 1;
      return acc;
    }, {});

    // Status breakdown
    const statusBreakdown = conversations.reduce((acc: any, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    // Average messages per conversation
    const messageStats = await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversation: { businessId, startedAt: { gte: startDate, lte: endDate } }
      },
      _count: true
    });

    const avgMessages = messageStats.length > 0
      ? Math.round(messageStats.reduce((sum, m) => sum + m._count, 0) / messageStats.length)
      : 0;

    res.json({
      daily: dailyData,
      channels: channelBreakdown,
      statuses: statusBreakdown,
      averageMessagesPerConversation: avgMessages,
      totalConversations: conversations.length
    });
  } catch (error) {
    console.error('Get conversation analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation analytics' });
  }
});

// Get booking analytics
router.get('/:businessId/bookings', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { days = '7' } = req.query;
    
    const startDate = startOfDay(subDays(new Date(), parseInt(days as string)));
    const endDate = endOfDay(new Date());

    const bookings = await prisma.booking.findMany({
      where: { businessId, createdAt: { gte: startDate, lte: endDate } },
      include: { service: true }
    });

    // Daily breakdown
    const dailyData = eachDayOfInterval({ start: startDate, end: endDate }).map(date => {
      const dayBookings = bookings.filter(b => 
        format(b.createdAt, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
      );

      return {
        date: format(date, 'yyyy-MM-dd'),
        total: dayBookings.length,
        confirmed: dayBookings.filter(b => b.status === 'CONFIRMED').length,
        cancelled: dayBookings.filter(b => b.status === 'CANCELLED').length,
        noShow: dayBookings.filter(b => b.status === 'NO_SHOW').length
      };
    });

    // Status breakdown
    const statusBreakdown = bookings.reduce((acc: any, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {});

    // Service breakdown
    const serviceBreakdown = bookings.reduce((acc: any, b) => {
      const serviceName = b.service?.name || 'General';
      acc[serviceName] = (acc[serviceName] || 0) + 1;
      return acc;
    }, {});

    // Popular booking times
    const timeBreakdown = bookings.reduce((acc: any, b) => {
      const hour = format(b.startTime, 'HH:00');
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    // Average party size
    const avgPartySize = bookings.length > 0
      ? Math.round((bookings.reduce((sum, b) => sum + b.partySize, 0) / bookings.length) * 10) / 10
      : 0;

    res.json({
      daily: dailyData,
      statuses: statusBreakdown,
      services: serviceBreakdown,
      popularTimes: timeBreakdown,
      averagePartySize: avgPartySize,
      totalBookings: bookings.length
    });
  } catch (error) {
    console.error('Get booking analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch booking analytics' });
  }
});

// Get order analytics
router.get('/:businessId/orders', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { days = '7' } = req.query;
    
    const startDate = startOfDay(subDays(new Date(), parseInt(days as string)));
    const endDate = endOfDay(new Date());

    const orders = await prisma.order.findMany({
      where: { businessId, createdAt: { gte: startDate, lte: endDate } },
      include: { items: true }
    });

    // Daily breakdown
    const dailyData = eachDayOfInterval({ start: startDate, end: endDate }).map(date => {
      const dayOrders = orders.filter(o => 
        format(o.createdAt, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
      );

      return {
        date: format(date, 'yyyy-MM-dd'),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((sum, o) => sum + o.total, 0)
      };
    });

    // Order type breakdown
    const typeBreakdown = orders.reduce((acc: any, o) => {
      acc[o.type] = (acc[o.type] || 0) + 1;
      return acc;
    }, {});

    // Top items
    const itemCounts: Record<string, number> = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });
    });

    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Revenue stats
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    res.json({
      daily: dailyData,
      orderTypes: typeBreakdown,
      topItems,
      totalOrders: orders.length,
      totalRevenue,
      averageOrderValue: Math.round(avgOrderValue * 100) / 100
    });
  } catch (error) {
    console.error('Get order analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch order analytics' });
  }
});

// Get AI performance metrics
router.get('/:businessId/ai-performance', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { days = '7' } = req.query;
    
    const startDate = startOfDay(subDays(new Date(), parseInt(days as string)));
    const endDate = endOfDay(new Date());

    // Get message statistics
    const messages = await prisma.message.findMany({
      where: {
        conversation: { businessId },
        createdAt: { gte: startDate, lte: endDate },
        role: 'ASSISTANT'
      },
      select: { tokensUsed: true, createdAt: true }
    });

    // Get conversation outcomes
    const conversations = await prisma.conversation.findMany({
      where: { businessId, startedAt: { gte: startDate, lte: endDate } },
      select: { 
        status: true, 
        handedOffToHuman: true, 
        handoffReason: true,
        metadata: true,
        _count: { select: { bookings: true, orders: true } }
      }
    });

    // Calculate metrics
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
    const automatedCount = conversations.filter(c => !c.handedOffToHuman).length;
    const conversionRate = conversations.length > 0
      ? Math.round((conversations.filter(c => c._count.bookings > 0 || c._count.orders > 0).length / conversations.length) * 100)
      : 0;

    // Handoff reasons
    const handoffReasons = conversations
      .filter(c => c.handoffReason)
      .reduce((acc: any, c) => {
        acc[c.handoffReason!] = (acc[c.handoffReason!] || 0) + 1;
        return acc;
      }, {});

    // Daily AI usage
    const dailyUsage = eachDayOfInterval({ start: startDate, end: endDate }).map(date => {
      const dayMessages = messages.filter(m => 
        format(m.createdAt, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
      );

      return {
        date: format(date, 'yyyy-MM-dd'),
        messages: dayMessages.length,
        tokens: dayMessages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0)
      };
    });

    res.json({
      daily: dailyUsage,
      totalMessages: messages.length,
      totalTokens,
      automationRate: conversations.length > 0 
        ? Math.round((automatedCount / conversations.length) * 100) 
        : 100,
      conversionRate,
      handoffReasons,
      estimatedCost: Math.round(totalTokens * 0.000003 * 100) / 100 // Rough estimate
    });
  } catch (error) {
    console.error('Get AI performance error:', error);
    res.status(500).json({ error: 'Failed to fetch AI performance' });
  }
});

function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export { router as analyticsRouter };
