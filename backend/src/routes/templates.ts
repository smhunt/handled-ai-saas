// SMS Templates Routes - Manage customizable SMS notification templates
import { Router } from 'express';
import { PrismaClient, SmsTemplateType } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  validateTemplate,
  generateTemplatePreview,
  getTemplateTypeLabel
} from '../services/templateEngine';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware);

// Template update schema
const updateTemplateSchema = z.object({
  content: z.string().min(1, 'Template content is required').max(500, 'Template too long'),
  isActive: z.boolean().optional()
});

// ============================================================================
// GET SMS TEMPLATES
// ============================================================================

/**
 * GET /api/businesses/:id/sms-templates
 * Get all SMS templates for a business (with defaults)
 */
router.get('/:id/sms-templates', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id: businessId } = req.params;

    // Verify access to business
    const access = await prisma.businessUser.findFirst({
      where: { userId, businessId }
    });

    if (!access) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get existing custom templates
    const customTemplates = await prisma.smsTemplate.findMany({
      where: { businessId }
    });

    // Build response with all template types (custom or default)
    const allTemplateTypes: SmsTemplateType[] = [
      'BOOKING_CONFIRMATION',
      'ORDER_CONFIRMATION',
      'BOOKING_REMINDER'
    ];

    const templates = allTemplateTypes.map(type => {
      const custom = customTemplates.find(t => t.type === type);

      if (custom) {
        return {
          id: custom.id,
          type,
          label: getTemplateTypeLabel(type),
          content: custom.content,
          isActive: custom.isActive,
          isCustom: true,
          defaultContent: DEFAULT_TEMPLATES[type],
          variables: TEMPLATE_VARIABLES[type],
          preview: generateTemplatePreview(custom.content, type),
          validation: validateTemplate(custom.content, type),
          updatedAt: custom.updatedAt
        };
      }

      // Return default template info
      return {
        id: null,
        type,
        label: getTemplateTypeLabel(type),
        content: DEFAULT_TEMPLATES[type],
        isActive: true,
        isCustom: false,
        defaultContent: DEFAULT_TEMPLATES[type],
        variables: TEMPLATE_VARIABLES[type],
        preview: generateTemplatePreview(DEFAULT_TEMPLATES[type], type),
        validation: validateTemplate(DEFAULT_TEMPLATES[type], type),
        updatedAt: null
      };
    });

    res.json({ templates });
  } catch (error) {
    console.error('Get SMS templates error:', error);
    res.status(500).json({ error: 'Failed to fetch SMS templates' });
  }
});

// ============================================================================
// UPDATE SMS TEMPLATE
// ============================================================================

/**
 * PUT /api/businesses/:id/sms-templates/:type
 * Create or update an SMS template
 */
router.put('/:id/sms-templates/:type', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id: businessId, type } = req.params;

    // Validate template type
    if (!['BOOKING_CONFIRMATION', 'ORDER_CONFIRMATION', 'BOOKING_REMINDER'].includes(type)) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    const templateType = type as SmsTemplateType;

    // Verify access (OWNER or ADMIN only)
    const access = await prisma.businessUser.findFirst({
      where: { userId, businessId, role: { in: ['OWNER', 'ADMIN'] } }
    });

    if (!access) {
      return res.status(403).json({ error: 'Access denied. Only owners and admins can edit templates.' });
    }

    // Validate request body
    const data = updateTemplateSchema.parse(req.body);

    // Validate template content
    const validation = validateTemplate(data.content, templateType);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid template syntax',
        warnings: validation.warnings
      });
    }

    // Upsert the template
    const template = await prisma.smsTemplate.upsert({
      where: {
        businessId_type: {
          businessId,
          type: templateType
        }
      },
      create: {
        businessId,
        type: templateType,
        content: data.content,
        isActive: data.isActive ?? true
      },
      update: {
        content: data.content,
        isActive: data.isActive ?? true
      }
    });

    res.json({
      template: {
        id: template.id,
        type: template.type,
        label: getTemplateTypeLabel(template.type),
        content: template.content,
        isActive: template.isActive,
        isCustom: true,
        defaultContent: DEFAULT_TEMPLATES[templateType],
        variables: TEMPLATE_VARIABLES[templateType],
        preview: generateTemplatePreview(template.content, templateType),
        validation: validateTemplate(template.content, templateType),
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update SMS template error:', error);
    res.status(500).json({ error: 'Failed to update SMS template' });
  }
});

// ============================================================================
// RESET SMS TEMPLATE TO DEFAULT
// ============================================================================

/**
 * DELETE /api/businesses/:id/sms-templates/:type
 * Reset an SMS template to default (delete custom version)
 */
router.delete('/:id/sms-templates/:type', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id: businessId, type } = req.params;

    // Validate template type
    if (!['BOOKING_CONFIRMATION', 'ORDER_CONFIRMATION', 'BOOKING_REMINDER'].includes(type)) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    const templateType = type as SmsTemplateType;

    // Verify access (OWNER or ADMIN only)
    const access = await prisma.businessUser.findFirst({
      where: { userId, businessId, role: { in: ['OWNER', 'ADMIN'] } }
    });

    if (!access) {
      return res.status(403).json({ error: 'Access denied. Only owners and admins can reset templates.' });
    }

    // Delete the custom template (if exists)
    await prisma.smsTemplate.deleteMany({
      where: {
        businessId,
        type: templateType
      }
    });

    // Return default template
    res.json({
      template: {
        id: null,
        type: templateType,
        label: getTemplateTypeLabel(templateType),
        content: DEFAULT_TEMPLATES[templateType],
        isActive: true,
        isCustom: false,
        defaultContent: DEFAULT_TEMPLATES[templateType],
        variables: TEMPLATE_VARIABLES[templateType],
        preview: generateTemplatePreview(DEFAULT_TEMPLATES[templateType], templateType),
        validation: validateTemplate(DEFAULT_TEMPLATES[templateType], templateType),
        updatedAt: null
      },
      message: 'Template reset to default'
    });
  } catch (error) {
    console.error('Reset SMS template error:', error);
    res.status(500).json({ error: 'Failed to reset SMS template' });
  }
});

// ============================================================================
// PREVIEW TEMPLATE
// ============================================================================

/**
 * POST /api/businesses/:id/sms-templates/preview
 * Generate a preview of a template with sample data
 */
router.post('/:id/sms-templates/preview', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id: businessId } = req.params;
    const { content, type } = req.body;

    // Validate template type
    if (!['BOOKING_CONFIRMATION', 'ORDER_CONFIRMATION', 'BOOKING_REMINDER'].includes(type)) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    // Verify access
    const access = await prisma.businessUser.findFirst({
      where: { userId, businessId }
    });

    if (!access) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const templateType = type as SmsTemplateType;
    const preview = generateTemplatePreview(content, templateType);
    const validation = validateTemplate(content, templateType);

    res.json({
      preview,
      validation,
      charCount: content.length
    });
  } catch (error) {
    console.error('Preview template error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

export { router as templatesRouter };
