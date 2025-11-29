// Handled - AI Conversation Service
// This is the brain that powers all customer interactions

import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient, Business, Conversation, Message } from '@prisma/client';
import { format, parseISO, isWithinInterval, addMinutes } from 'date-fns';
import { sendNotification } from './notifications';

const prisma = new PrismaClient();
const anthropic = new Anthropic();

// Types for AI tool calls
interface BookingRequest {
  action: 'create' | 'check_availability' | 'cancel' | 'modify';
  date?: string;
  time?: string;
  partySize?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceId?: string;
  notes?: string;
  confirmationCode?: string;
}

interface OrderRequest {
  action: 'create' | 'add_item' | 'remove_item' | 'get_menu' | 'confirm';
  items?: Array<{
    menuItemId: string;
    quantity: number;
    modifiers?: string[];
    notes?: string;
  }>;
  orderType?: 'pickup' | 'delivery' | 'dine_in';
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  requestedTime?: string;
  notes?: string;
}

interface FAQRequest {
  question: string;
}

// Tool definitions for Claude
const tools: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description: 'Check available time slots for bookings/reservations on a specific date',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date to check in YYYY-MM-DD format' },
        partySize: { type: 'number', description: 'Number of guests/people' },
        serviceId: { type: 'string', description: 'Optional service ID for service-based bookings' }
      },
      required: ['date']
    }
  },
  {
    name: 'create_booking',
    description: 'Create a new booking/reservation',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
        partySize: { type: 'number', description: 'Number of guests' },
        customerName: { type: 'string', description: 'Customer name' },
        customerPhone: { type: 'string', description: 'Customer phone number' },
        customerEmail: { type: 'string', description: 'Customer email (optional)' },
        serviceId: { type: 'string', description: 'Service ID (optional)' },
        notes: { type: 'string', description: 'Special requests or notes' }
      },
      required: ['date', 'time', 'customerName']
    }
  },
  {
    name: 'get_menu',
    description: 'Get the menu with categories and items',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Optional category to filter by' }
      }
    }
  },
  {
    name: 'add_to_order',
    description: 'Add items to the current order',
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Item name or ID' },
              quantity: { type: 'number', description: 'Quantity' },
              modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifications' },
              notes: { type: 'string', description: 'Special instructions' }
            },
            required: ['name', 'quantity']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'confirm_order',
    description: 'Confirm and submit the order',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerName: { type: 'string' },
        customerPhone: { type: 'string' },
        orderType: { type: 'string', enum: ['pickup', 'delivery', 'dine_in'] },
        requestedTime: { type: 'string', description: 'When they want it ready (HH:MM)' },
        deliveryAddress: { type: 'string', description: 'Required for delivery orders' },
        notes: { type: 'string' }
      },
      required: ['customerName', 'customerPhone', 'orderType']
    }
  },
  {
    name: 'get_business_info',
    description: 'Get business information like hours, location, contact info',
    input_schema: {
      type: 'object' as const,
      properties: {
        infoType: { 
          type: 'string', 
          enum: ['hours', 'location', 'contact', 'services', 'policies'],
          description: 'Type of information to retrieve'
        }
      },
      required: ['infoType']
    }
  },
  {
    name: 'handoff_to_human',
    description: 'Transfer the conversation to a human staff member when the AI cannot help',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Why handoff is needed' }
      },
      required: ['reason']
    }
  }
];

export class ConversationService {
  private businessId: string;
  private business: Business | null = null;
  private conversationId: string;
  private currentOrder: any[] = []; // Track items in current order

  constructor(businessId: string, conversationId: string) {
    this.businessId = businessId;
    this.conversationId = conversationId;
  }

  async initialize() {
    this.business = await prisma.business.findUnique({
      where: { id: this.businessId },
      include: {
        locations: true,
        services: { where: { isActive: true } },
        menuCategories: { where: { isActive: true }, include: { items: { where: { isAvailable: true } } } },
        availabilityRules: true,
        faqItems: { where: { isActive: true } }
      }
    });
    
    if (!this.business) {
      throw new Error('Business not found');
    }
  }

  private buildSystemPrompt(): string {
    if (!this.business) throw new Error('Business not initialized');

    const b = this.business as any; // With includes
    
    let prompt = `You are a helpful AI assistant for ${b.name}. Your personality is ${b.aiPersonality}.

BUSINESS TYPE: ${b.industry}

YOUR CAPABILITIES:
- Take reservations and bookings
- Process takeout/delivery orders
- Answer questions about the business
- Provide menu/service information
- Handle scheduling inquiries

BUSINESS INFORMATION:
- Name: ${b.name}
- Phone: ${b.phone || 'Not provided'}
- Email: ${b.email || 'Not provided'}
- Website: ${b.website || 'Not provided'}
- Timezone: ${b.timezone}
`;

    // Add location info
    if (b.locations?.length > 0) {
      const loc = b.locations[0];
      prompt += `
LOCATION:
- Address: ${loc.address}, ${loc.city}${loc.state ? ', ' + loc.state : ''} ${loc.postalCode || ''}
`;
    }

    // Add services if available
    if (b.services?.length > 0) {
      prompt += `
SERVICES OFFERED:
${b.services.map((s: any) => `- ${s.name}: ${s.duration} minutes, $${s.price}`).join('\n')}
`;
    }

    // Add menu if available
    if (b.menuCategories?.length > 0) {
      prompt += `
MENU:
${b.menuCategories.map((cat: any) => `
${cat.name}:
${cat.items?.map((item: any) => `  - ${item.name}: $${item.price}${item.description ? ' - ' + item.description : ''}`).join('\n')}`).join('\n')}
`;
    }

    // Add availability
    if (b.availabilityRules?.length > 0) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const regularHours = b.availabilityRules.filter((r: any) => r.dayOfWeek !== null && r.isOpen);
      
      prompt += `
OPERATING HOURS:
${regularHours.map((r: any) => `- ${days[r.dayOfWeek]}: ${r.startTime} - ${r.endTime}`).join('\n')}
`;
    }

    // Add FAQs
    if (b.faqItems?.length > 0) {
      prompt += `
FREQUENTLY ASKED QUESTIONS:
${b.faqItems.map((faq: any) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')}
`;
    }

    // Add custom instructions
    if (b.aiInstructions) {
      prompt += `
SPECIAL INSTRUCTIONS:
${b.aiInstructions}
`;
    }

    prompt += `
IMPORTANT GUIDELINES:
1. Be friendly, helpful, and professional
2. Always confirm details before finalizing bookings or orders
3. If you can't help with something, offer to connect them with a human
4. Use the provided tools to check availability, create bookings, and process orders
5. Never make up information - use the tools to get accurate data
6. For orders, always summarize what they've ordered before confirming
7. For bookings, always confirm the date, time, party size, and contact info
8. Today's date is ${format(new Date(), 'EEEE, MMMM d, yyyy')}
`;

    return prompt;
  }

  async processMessage(userMessage: string): Promise<string> {
    if (!this.business) {
      await this.initialize();
    }

    // Get conversation history
    const history = await prisma.message.findMany({
      where: { conversationId: this.conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20 // Last 20 messages for context
    });

    // Build messages array
    const messages: Anthropic.MessageParam[] = history.map(msg => ({
      role: msg.role === 'USER' ? 'user' : 'assistant',
      content: msg.content
    }));

    // Add new user message
    messages.push({ role: 'user', content: userMessage });

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: this.conversationId,
        role: 'USER',
        content: userMessage
      }
    });

    // Update conversation last message time
    await prisma.conversation.update({
      where: { id: this.conversationId },
      data: { lastMessageAt: new Date() }
    });

    // Call Claude
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: this.buildSystemPrompt(),
      tools: tools,
      messages: messages
    });

    // Handle tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUseBlock) break;

      const toolResult = await this.executeToolCall(toolUseBlock.name, toolUseBlock.input as Record<string, any>);

      // Add assistant's tool use and result to messages
      messages.push({
        role: 'assistant',
        content: response.content
      });

      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult)
        }]
      });

      // Get next response
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: this.buildSystemPrompt(),
        tools: tools,
        messages: messages
      });
    }

    // Extract text response
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const assistantMessage = textBlock?.text || "I'm sorry, I couldn't process that. How else can I help?";

    // Save assistant message
    await prisma.message.create({
      data: {
        conversationId: this.conversationId,
        role: 'ASSISTANT',
        content: assistantMessage,
        tokensUsed: response.usage?.output_tokens,
        modelUsed: 'claude-sonnet-4-20250514'
      }
    });

    return assistantMessage;
  }

  private async executeToolCall(toolName: string, input: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'check_availability':
        return this.checkAvailability(input);
      case 'create_booking':
        return this.createBooking(input);
      case 'get_menu':
        return this.getMenu(input);
      case 'add_to_order':
        return this.addToOrder(input);
      case 'confirm_order':
        return this.confirmOrder(input);
      case 'get_business_info':
        return this.getBusinessInfo(input);
      case 'handoff_to_human':
        return this.handoffToHuman(input);
      default:
        return { error: 'Unknown tool' };
    }
  }

  private async checkAvailability(input: { date: string; partySize?: number; serviceId?: string }): Promise<any> {
    const { date, partySize = 2 } = input;
    
    // Get availability rules for the day
    const dayOfWeek = new Date(date).getDay();
    const rules = await prisma.availabilityRule.findMany({
      where: {
        businessId: this.businessId,
        OR: [
          { dayOfWeek: dayOfWeek },
          { specificDate: new Date(date) }
        ]
      }
    });

    if (rules.length === 0 || !rules.some(r => r.isOpen)) {
      return { available: false, message: 'We are closed on this date.' };
    }

    const openRule = rules.find(r => r.isOpen);
    if (!openRule) {
      return { available: false, message: 'No availability found.' };
    }

    // Get existing bookings for the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await prisma.booking.findMany({
      where: {
        businessId: this.businessId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { in: ['PENDING', 'CONFIRMED'] }
      }
    });

    // Generate available slots (simplified - every 30 minutes)
    const slots: string[] = [];
    const [startHour, startMin] = openRule.startTime.split(':').map(Number);
    const [endHour, endMin] = openRule.endTime.split(':').map(Number);
    
    let currentTime = new Date(date);
    currentTime.setHours(startHour, startMin, 0, 0);
    
    const endTime = new Date(date);
    endTime.setHours(endHour, endMin, 0, 0);

    while (currentTime < endTime) {
      const timeStr = format(currentTime, 'HH:mm');
      
      // Check if slot is available (simplified check)
      const slotTaken = existingBookings.some(b => 
        format(b.startTime, 'HH:mm') === timeStr
      );

      if (!slotTaken) {
        slots.push(format(currentTime, 'h:mm a'));
      }

      currentTime = addMinutes(currentTime, 30);
    }

    return {
      available: slots.length > 0,
      date: format(new Date(date), 'EEEE, MMMM d, yyyy'),
      availableSlots: slots.slice(0, 10), // Return first 10 slots
      totalSlots: slots.length
    };
  }

  private async createBooking(input: any): Promise<any> {
    const { date, time, partySize = 2, customerName, customerPhone, customerEmail, serviceId, notes } = input;

    // Generate confirmation code
    const confirmationCode = `HND${Date.now().toString(36).toUpperCase()}`;

    // Parse date and time
    const [hours, minutes] = time.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);

    // Assume 1 hour duration for restaurants, or use service duration
    let duration = 60;
    if (serviceId) {
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (service) duration = service.duration;
    }
    const endTime = addMinutes(startTime, duration);

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        businessId: this.businessId,
        conversationId: this.conversationId,
        customerName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        startTime,
        endTime,
        partySize,
        serviceId: serviceId || null,
        notes: notes || null,
        confirmationCode,
        status: 'CONFIRMED',
        confirmedAt: new Date()
      }
    });

    return {
      success: true,
      confirmationCode: booking.confirmationCode,
      date: format(startTime, 'EEEE, MMMM d, yyyy'),
      time: format(startTime, 'h:mm a'),
      partySize,
      customerName,
      message: `Booking confirmed! Confirmation code: ${booking.confirmationCode}`
    };
  }

  private async getMenu(input: { category?: string }): Promise<any> {
    const categories = await prisma.menuCategory.findMany({
      where: {
        businessId: this.businessId,
        isActive: true,
        ...(input.category ? { name: { contains: input.category, mode: 'insensitive' as const } } : {})
      },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    return {
      categories: categories.map(cat => ({
        name: cat.name,
        description: cat.description,
        items: cat.items.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          popular: item.isPopular
        }))
      }))
    };
  }

  private async addToOrder(input: { items: Array<{ name: string; quantity: number; modifiers?: string[]; notes?: string }> }): Promise<any> {
    const addedItems: any[] = [];
    
    for (const item of input.items) {
      // Find menu item by name
      const menuItem = await prisma.menuItem.findFirst({
        where: {
          businessId: this.businessId,
          name: { contains: item.name, mode: 'insensitive' },
          isAvailable: true
        }
      });

      if (menuItem) {
        const orderItem = {
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity: item.quantity,
          unitPrice: menuItem.price,
          totalPrice: menuItem.price * item.quantity,
          modifiers: item.modifiers || [],
          notes: item.notes || ''
        };
        this.currentOrder.push(orderItem);
        addedItems.push(orderItem);
      }
    }

    const orderTotal = this.currentOrder.reduce((sum, item) => sum + item.totalPrice, 0);

    return {
      success: true,
      addedItems,
      currentOrder: this.currentOrder,
      subtotal: orderTotal,
      itemCount: this.currentOrder.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  private async confirmOrder(input: any): Promise<any> {
    const { customerName, customerPhone, orderType, requestedTime, deliveryAddress, notes } = input;

    if (this.currentOrder.length === 0) {
      return { success: false, message: 'No items in order' };
    }

    const subtotal = this.currentOrder.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = subtotal * 0.13; // 13% HST
    const total = subtotal + tax;

    // Generate order number
    const orderNumber = `ORD${Date.now().toString(36).toUpperCase()}`;

    // Create order
    const order = await prisma.order.create({
      data: {
        businessId: this.businessId,
        conversationId: this.conversationId,
        customerName,
        customerPhone,
        orderNumber,
        type: orderType?.toUpperCase() || 'PICKUP',
        status: 'CONFIRMED',
        subtotal,
        tax,
        total,
        requestedTime: requestedTime ? new Date(`1970-01-01T${requestedTime}`) : null,
        deliveryAddress: deliveryAddress || null,
        notes: notes || null,
        items: {
          create: this.currentOrder.map(item => ({
            menuItemId: item.menuItemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            modifiers: item.modifiers,
            notes: item.notes
          }))
        }
      }
    });

    // Clear current order
    this.currentOrder = [];

    return {
      success: true,
      orderNumber: order.orderNumber,
      orderType: order.type,
      items: this.currentOrder,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      estimatedTime: '20-30 minutes',
      message: `Order confirmed! Your order number is ${order.orderNumber}`
    };
  }

  private async getBusinessInfo(input: { infoType: string }): Promise<any> {
    const b = this.business as any;
    
    switch (input.infoType) {
      case 'hours':
        const rules = b.availabilityRules?.filter((r: any) => r.dayOfWeek !== null && r.isOpen) || [];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return {
          hours: rules.map((r: any) => ({
            day: days[r.dayOfWeek],
            open: r.startTime,
            close: r.endTime
          }))
        };
      
      case 'location':
        const loc = b.locations?.[0];
        return loc ? {
          address: loc.address,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode
        } : { message: 'Location information not available' };
      
      case 'contact':
        return {
          phone: b.phone,
          email: b.email,
          website: b.website
        };
      
      case 'services':
        return {
          services: b.services?.map((s: any) => ({
            name: s.name,
            duration: s.duration,
            price: s.price
          })) || []
        };
      
      default:
        return { message: 'Information not available' };
    }
  }

  private async handoffToHuman(input: { reason: string }): Promise<any> {
    // Update conversation to handed off status
    const conversation = await prisma.conversation.update({
      where: { id: this.conversationId },
      data: {
        handedOffToHuman: true,
        handoffReason: input.reason,
        status: 'HANDED_OFF'
      }
    });

    // Send notification to business owner
    await sendNotification(this.businessId, 'HANDOFF_REQUEST', {
      conversationId: this.conversationId,
      handoffReason: input.reason,
      customerName: conversation.customerName,
      customerPhone: conversation.customerPhone,
      customerEmail: conversation.customerEmail
    });

    return {
      success: true,
      message: 'I\'ve notified our team and someone will be with you shortly. Is there anything else I can help with in the meantime?'
    };
  }
}

// Factory function to create conversation handler
export async function handleConversation(
  businessId: string, 
  conversationId: string, 
  message: string
): Promise<string> {
  const service = new ConversationService(businessId, conversationId);
  return service.processMessage(message);
}
