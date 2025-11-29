// Billing Service - Stripe subscription management
import Stripe from 'stripe';
import { PrismaClient, Plan } from '@prisma/client';

const prisma = new PrismaClient();

const stripe = process.env.STRIPE_SECRET_KEY?.trim()
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-10-28.acacia' })
  : null;

// Plan configuration
const PLAN_LIMITS = {
  TRIAL: {
    conversations: 50,
    messages: 500,
    teamMembers: 1,
    locations: 1,
  },
  STARTER: {
    conversations: 500,
    messages: 5000,
    teamMembers: 2,
    locations: 1,
  },
  PROFESSIONAL: {
    conversations: 2000,
    messages: 20000,
    teamMembers: 5,
    locations: 3,
  },
  BUSINESS: {
    conversations: 10000,
    messages: 100000,
    teamMembers: 20,
    locations: 10,
  },
  ENTERPRISE: {
    conversations: -1, // unlimited
    messages: -1,
    teamMembers: -1,
    locations: -1,
  },
};

const PRICE_IDS: Record<string, string> = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID || '',
  PROFESSIONAL: process.env.STRIPE_PRO_PRICE_ID || '',
  BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID || '',
};

export const billingService = {
  async getSubscription(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        plan: true,
        planExpiresAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!business) {
      throw new Error('Business not found');
    }

    let stripeSubscription = null;
    if (stripe && business.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
      } catch (err) {
        console.error('Failed to fetch Stripe subscription:', err);
      }
    }

    const limits = PLAN_LIMITS[business.plan] || PLAN_LIMITS.TRIAL;

    return {
      plan: business.plan,
      planExpiresAt: business.planExpiresAt,
      limits,
      stripeSubscription: stripeSubscription ? {
        status: stripeSubscription.status,
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      } : null,
    };
  },

  async createCheckoutSession(
    businessId: string,
    plan: string,
    successUrl: string,
    cancelUrl: string
  ) {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { users: { include: { user: true }, where: { role: 'OWNER' } } },
    });

    if (!business) {
      throw new Error('Business not found');
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    // Get or create Stripe customer
    let customerId = business.stripeCustomerId;
    if (!customerId) {
      const ownerEmail = business.users[0]?.user?.email || business.email;
      const customer = await stripe.customers.create({
        email: ownerEmail || undefined,
        name: business.name,
        metadata: { businessId },
      });
      customerId = customer.id;

      await prisma.business.update({
        where: { id: businessId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { businessId, plan },
      subscription_data: {
        metadata: { businessId, plan },
      },
    });

    return session.url;
  },

  async createPortalSession(businessId: string, returnUrl: string) {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business?.stripeCustomerId) {
      throw new Error('No billing account found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  },

  async changePlan(businessId: string, newPlan: string) {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business?.stripeSubscriptionId) {
      throw new Error('No active subscription');
    }

    const priceId = PRICE_IDS[newPlan];
    if (!priceId) {
      throw new Error(`Invalid plan: ${newPlan}`);
    }

    const subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);

    await stripe.subscriptions.update(business.stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: 'create_prorations',
      metadata: { plan: newPlan },
    });

    await prisma.business.update({
      where: { id: businessId },
      data: { plan: newPlan as Plan },
    });
  },

  async cancelSubscription(businessId: string) {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business?.stripeSubscriptionId) {
      throw new Error('No active subscription');
    }

    await stripe.subscriptions.update(business.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  },

  async getInvoices(businessId: string, limit: number = 10) {
    if (!stripe) {
      return [];
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business?.stripeCustomerId) {
      return [];
    }

    const invoices = await stripe.invoices.list({
      customer: business.stripeCustomerId,
      limit,
    });

    return invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      status: invoice.status,
      date: invoice.created ? new Date(invoice.created * 1000) : null,
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    }));
  },

  async checkUsageLimits(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new Error('Business not found');
    }

    const limits = PLAN_LIMITS[business.plan] || PLAN_LIMITS.TRIAL;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Count conversations this month
    const conversationCount = await prisma.conversation.count({
      where: {
        businessId,
        startedAt: { gte: startOfMonth },
      },
    });

    // Count messages this month
    const messageCount = await prisma.message.count({
      where: {
        conversation: { businessId },
        createdAt: { gte: startOfMonth },
      },
    });

    // Count team members
    const teamMemberCount = await prisma.businessUser.count({
      where: { businessId },
    });

    // Count locations
    const locationCount = await prisma.location.count({
      where: { businessId },
    });

    return {
      plan: business.plan,
      usage: {
        conversations: {
          used: conversationCount,
          limit: limits.conversations,
          remaining: limits.conversations === -1 ? -1 : Math.max(0, limits.conversations - conversationCount),
        },
        messages: {
          used: messageCount,
          limit: limits.messages,
          remaining: limits.messages === -1 ? -1 : Math.max(0, limits.messages - messageCount),
        },
        teamMembers: {
          used: teamMemberCount,
          limit: limits.teamMembers,
          remaining: limits.teamMembers === -1 ? -1 : Math.max(0, limits.teamMembers - teamMemberCount),
        },
        locations: {
          used: locationCount,
          limit: limits.locations,
          remaining: limits.locations === -1 ? -1 : Math.max(0, limits.locations - locationCount),
        },
      },
    };
  },

  async handleSubscriptionCreated(subscription: Stripe.Subscription) {
    const businessId = subscription.metadata?.businessId;
    const plan = subscription.metadata?.plan as Plan;

    if (!businessId) return;

    await prisma.business.update({
      where: { id: businessId },
      data: {
        stripeSubscriptionId: subscription.id,
        plan: plan || 'PROFESSIONAL',
        planExpiresAt: null,
      },
    });
  },

  async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const business = await prisma.business.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!business) return;

    const plan = subscription.metadata?.plan as Plan;

    await prisma.business.update({
      where: { id: business.id },
      data: {
        plan: plan || business.plan,
        planExpiresAt: subscription.cancel_at_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null,
      },
    });
  },

  async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const business = await prisma.business.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!business) return;

    await prisma.business.update({
      where: { id: business.id },
      data: {
        plan: 'TRIAL',
        stripeSubscriptionId: null,
        planExpiresAt: new Date(subscription.current_period_end * 1000),
      },
    });
  },

  getPlanLimits(plan: Plan) {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.TRIAL;
  },
};
