import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestSMSConversations() {
  // Get a business to attach conversations to
  const business = await prisma.business.findFirst({
    where: { isActive: true }
  });

  if (!business) {
    console.log('No business found');
    return;
  }

  console.log(`Creating SMS conversations for business: ${business.name} (${business.id})`);

  // Create 3 test SMS conversations
  const smsConversations = [
    {
      customerPhone: '+14165551234',
      customerName: 'John Smith',
      messages: [
        { role: 'USER', content: 'Hi, I want to book an appointment for tomorrow' },
        { role: 'ASSISTANT', content: 'Hi John! I can help you with that. What time works best for you? We have openings at 10:00 AM, 2:00 PM, and 4:30 PM.' },
        { role: 'USER', content: '2pm works great' },
        { role: 'ASSISTANT', content: 'Perfect! I have you booked for tomorrow at 2:00 PM. Your confirmation code is HND-SMS-001. See you then!' }
      ]
    },
    {
      customerPhone: '+14165559876',
      customerName: null, // Anonymous SMS user
      messages: [
        { role: 'USER', content: 'What are your hours?' },
        { role: 'ASSISTANT', content: 'We are open Monday to Friday from 9 AM to 6 PM, and Saturday from 10 AM to 4 PM. We are closed on Sundays.' },
        { role: 'USER', content: 'Thanks!' }
      ]
    },
    {
      customerPhone: '+14165555555',
      customerName: 'Maria Garcia',
      messages: [
        { role: 'USER', content: 'I need to cancel my appointment' },
        { role: 'ASSISTANT', content: 'I can help you with that, Maria. Could you please provide your confirmation code?' },
        { role: 'USER', content: 'HND-12345' },
        { role: 'ASSISTANT', content: 'I have found your appointment for today at 3:00 PM. Would you like me to cancel it or reschedule?' },
        { role: 'USER', content: 'Cancel please' },
        { role: 'ASSISTANT', content: 'Your appointment has been cancelled. If you would like to book again, just text us anytime!' }
      ]
    }
  ];

  for (const conv of smsConversations) {
    // Create conversation
    const normalizedPhone = conv.customerPhone.replace(/\D/g, '');
    const conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        visitorId: `sms_${normalizedPhone}`,
        customerPhone: conv.customerPhone,
        customerName: conv.customerName,
        channel: 'SMS',
        status: 'ACTIVE',
        lastMessageAt: new Date(),
        metadata: { testData: true }
      }
    });

    console.log(`Created SMS conversation: ${conversation.id} for ${conv.customerPhone}`);

    // Create messages
    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i];
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: msg.role as any,
          content: msg.content,
          createdAt: new Date(Date.now() - (conv.messages.length - i) * 60000) // Space out by 1 minute
        }
      });
    }

    console.log(`  Added ${conv.messages.length} messages`);
  }

  // Also create a couple web conversations for comparison
  const webConv = await prisma.conversation.create({
    data: {
      businessId: business.id,
      visitorId: 'visitor_web_test_123',
      customerName: 'Web Visitor',
      channel: 'WEB',
      status: 'ACTIVE',
      lastMessageAt: new Date(),
      metadata: { testData: true }
    }
  });

  await prisma.message.create({
    data: {
      conversationId: webConv.id,
      role: 'USER',
      content: 'Hello, I have a question about your services'
    }
  });
  await prisma.message.create({
    data: {
      conversationId: webConv.id,
      role: 'ASSISTANT',
      content: 'Hi there! I would be happy to help. What would you like to know?'
    }
  });

  console.log(`Created WEB conversation: ${webConv.id}`);

  console.log('\nDone! Created 3 SMS conversations and 1 WEB conversation for testing.');
}

createTestSMSConversations()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
