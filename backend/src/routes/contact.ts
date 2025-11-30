// Contact Form Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { notificationService } from '../services/notifications';

const router = Router();
const prisma = new PrismaClient();

// Submit contact form
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Store in database (we'll use a simple model)
    // For now, just send notification and respond

    // Send email notification to admin
    try {
      await notificationService.sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@handled.ai',
        subject: `Contact Form: ${subject}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>From:</strong> ${name} (${email})</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Continue even if email fails
    }

    // Log the submission
    console.log('Contact form submission:', { name, email, subject });

    res.json({
      success: true,
      message: 'Thank you for your message. We\'ll get back to you soon!'
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to submit contact form' });
  }
});

export { router as contactRouter };
