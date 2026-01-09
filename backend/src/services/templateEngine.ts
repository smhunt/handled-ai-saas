// Template Engine Service - SMS Template Interpolation
// Handles variable substitution for customizable SMS templates

import { SmsTemplateType } from '@prisma/client';

// ============================================
// DEFAULT TEMPLATES
// ============================================

export const DEFAULT_TEMPLATES: Record<SmsTemplateType, string> = {
  BOOKING_CONFIRMATION:
    'Booking confirmed at {{businessName}}! {{date}} at {{time}} for {{partySize}}. Code: {{confirmationCode}}',

  ORDER_CONFIRMATION:
    'Order #{{orderNumber}} confirmed at {{businessName}}! Your {{orderType}} order will be ready soon. Total: ${{total}}',

  BOOKING_REMINDER:
    'Reminder: You have a reservation at {{businessName}} tomorrow at {{time}} for {{partySize}}. See you then!'
};

// ============================================
// AVAILABLE VARIABLES PER TEMPLATE TYPE
// ============================================

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

export const TEMPLATE_VARIABLES: Record<SmsTemplateType, TemplateVariable[]> = {
  BOOKING_CONFIRMATION: [
    { name: 'businessName', description: 'Name of the business', example: 'Mario\'s Restaurant' },
    { name: 'customerName', description: 'Customer\'s name', example: 'John Smith' },
    { name: 'date', description: 'Booking date (e.g., Jan 15)', example: 'Jan 15' },
    { name: 'time', description: 'Booking time (e.g., 7:00 PM)', example: '7:00 PM' },
    { name: 'partySize', description: 'Number of guests', example: '4' },
    { name: 'confirmationCode', description: 'Unique confirmation code', example: 'ABC123' },
    { name: 'serviceName', description: 'Service booked (if applicable)', example: 'Haircut' },
    { name: 'notes', description: 'Special requests/notes', example: 'Window seat preferred' }
  ],
  ORDER_CONFIRMATION: [
    { name: 'businessName', description: 'Name of the business', example: 'Mario\'s Restaurant' },
    { name: 'customerName', description: 'Customer\'s name', example: 'John Smith' },
    { name: 'orderNumber', description: 'Order number', example: 'ORD-1234' },
    { name: 'orderType', description: 'Order type (pickup/delivery)', example: 'pickup' },
    { name: 'total', description: 'Order total (formatted)', example: '42.50' },
    { name: 'estimatedTime', description: 'Estimated ready/delivery time', example: '6:30 PM' },
    { name: 'itemCount', description: 'Number of items ordered', example: '3' }
  ],
  BOOKING_REMINDER: [
    { name: 'businessName', description: 'Name of the business', example: 'Mario\'s Restaurant' },
    { name: 'customerName', description: 'Customer\'s name', example: 'John Smith' },
    { name: 'date', description: 'Booking date (e.g., Jan 15)', example: 'Jan 15' },
    { name: 'time', description: 'Booking time (e.g., 7:00 PM)', example: '7:00 PM' },
    { name: 'partySize', description: 'Number of guests', example: '4' },
    { name: 'confirmationCode', description: 'Unique confirmation code', example: 'ABC123' },
    { name: 'serviceName', description: 'Service booked (if applicable)', example: 'Haircut' }
  ]
};

// ============================================
// TEMPLATE INTERPOLATION
// ============================================

/**
 * Interpolates a template string with the provided variables
 * Replaces {{variableName}} with the corresponding value
 *
 * @param template - The template string with {{variable}} placeholders
 * @param variables - Object containing variable values
 * @returns The interpolated string
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined || value === null) {
      // Return empty string for undefined/null variables
      return '';
    }
    return String(value);
  });
}

/**
 * Validates a template string for proper syntax and variable usage
 *
 * @param template - The template string to validate
 * @param type - The template type (for checking allowed variables)
 * @returns Validation result with any warnings
 */
export function validateTemplate(
  template: string,
  type: SmsTemplateType
): { isValid: boolean; warnings: string[]; charCount: number } {
  const warnings: string[] = [];
  const charCount = template.length;

  // Check for SMS length (160 chars is standard SMS limit)
  if (charCount > 160) {
    warnings.push(`Template exceeds 160 characters (${charCount} chars). This may result in multiple SMS messages being sent.`);
  }

  // Extract all variable names used in template
  const usedVariables = template.match(/\{\{(\w+)\}\}/g) || [];
  const allowedVariableNames = TEMPLATE_VARIABLES[type].map(v => v.name);

  // Check for unknown variables
  usedVariables.forEach(varMatch => {
    const varName = varMatch.replace(/\{\{|\}\}/g, '');
    if (!allowedVariableNames.includes(varName)) {
      warnings.push(`Unknown variable: {{${varName}}}. This will be replaced with an empty string.`);
    }
  });

  // Check for unclosed braces
  const openBraces = (template.match(/\{\{/g) || []).length;
  const closeBraces = (template.match(/\}\}/g) || []).length;
  if (openBraces !== closeBraces) {
    warnings.push('Template has mismatched braces. Some variables may not render correctly.');
  }

  return {
    isValid: warnings.filter(w => w.includes('mismatched')).length === 0,
    warnings,
    charCount
  };
}

/**
 * Generates a preview of the template with sample data
 *
 * @param template - The template string
 * @param type - The template type
 * @returns Preview string with sample values
 */
export function generateTemplatePreview(
  template: string,
  type: SmsTemplateType
): string {
  const sampleVariables: Record<string, string> = {};

  TEMPLATE_VARIABLES[type].forEach(variable => {
    sampleVariables[variable.name] = variable.example;
  });

  return interpolateTemplate(template, sampleVariables);
}

/**
 * Gets template type label for display
 */
export function getTemplateTypeLabel(type: SmsTemplateType): string {
  const labels: Record<SmsTemplateType, string> = {
    BOOKING_CONFIRMATION: 'Booking Confirmation',
    ORDER_CONFIRMATION: 'Order Confirmation',
    BOOKING_REMINDER: 'Booking Reminder'
  };
  return labels[type];
}
