// Billing Routes - Subscription management
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { billingService } from '../services/billing';
import { businessAccessMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Get subscription status
router.get('/:businessId/subscription', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const subscription = await billingService.getSubscription(businessId);
    res.json(subscription);
  } catch (error: any) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create checkout session
router.post('/:businessId/checkout', businessAccessMiddleware(['OWNER']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const { plan } = req.body;
    
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    
    const checkoutUrl = await billingService.createCheckoutSession(
      businessId,
      plan,
      `${appUrl}/settings?billing=success`,
      `${appUrl}/settings?billing=cancelled`
    );
    
    res.json({ url: checkoutUrl });
  } catch (error: any) {
    console.error('Create checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create portal session
router.post('/:businessId/portal', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    
    const portalUrl = await billingService.createPortalSession(
      businessId,
      `${appUrl}/settings`
    );
    
    res.json({ url: portalUrl });
  } catch (error: any) {
    console.error('Create portal error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Change plan
router.post('/:businessId/change-plan', businessAccessMiddleware(['OWNER']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const { plan } = req.body;
    
    await billingService.changePlan(businessId, plan);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Change plan error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel subscription
router.post('/:businessId/cancel', businessAccessMiddleware(['OWNER']), async (req, res) => {
  try {
    const { businessId } = req.params;
    
    await billingService.cancelSubscription(businessId);
    
    res.json({ success: true, message: 'Subscription will be cancelled at end of billing period' });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get invoices
router.get('/:businessId/invoices', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;
    const { limit = '10' } = req.query;
    
    const invoices = await billingService.getInvoices(businessId, parseInt(limit as string));
    
    res.json(invoices);
  } catch (error: any) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check usage
router.get('/:businessId/usage', businessAccessMiddleware(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { businessId } = req.params;
    
    const usage = await billingService.checkUsageLimits(businessId);
    
    res.json(usage);
  } catch (error: any) {
    console.error('Check usage error:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as billingRouter };
