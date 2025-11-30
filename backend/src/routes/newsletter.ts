// Newsletter Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { notificationService } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();

// Subscribe to newsletter
router.post('/', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if already subscribed (using a simple approach - in production, use a dedicated table)
    // For now, we'll just log and send confirmation

    // Log the subscription
    console.log('Newsletter subscription:', email);

    // Send confirmation email
    try {
      await notificationService.sendEmail({
        to: email,
        subject: 'Welcome to Handled Newsletter!',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #f97316;">Welcome to Handled!</h1>
            <p>Thanks for subscribing to our newsletter. You'll be the first to know about:</p>
            <ul>
              <li>New features and updates</li>
              <li>Tips for getting the most out of Handled</li>
              <li>Industry insights and best practices</li>
              <li>Special offers and promotions</li>
            </ul>
            <p>Stay tuned for our next update!</p>
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">
              You're receiving this because you signed up at handled.ai.
              <a href="#" style="color: #f97316;">Unsubscribe</a>
            </p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Continue even if email fails
    }

    // Notify admin of new subscriber
    try {
      await notificationService.sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@handled.ai',
        subject: 'New Newsletter Subscriber',
        html: `
          <h2>New Newsletter Subscription</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Date:</strong> ${new Date().toISOString()}</p>
        `
      });
    } catch (adminEmailError) {
      console.error('Failed to send admin notification:', adminEmailError);
    }

    res.json({
      success: true,
      message: 'Successfully subscribed to newsletter!'
    });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ error: 'Failed to subscribe to newsletter' });
  }
});

export { router as newsletterRouter };
