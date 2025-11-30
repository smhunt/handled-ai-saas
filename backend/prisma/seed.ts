// Database Seed Script
// Run with: pnpm db:seed
// Reset and seed: pnpm db:reset

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ============================================
  // USERS
  // ============================================
  console.log('Creating users...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@handled.ai' },
    update: {},
    create: {
      email: 'demo@handled.ai',
      passwordHash: hashedPassword,
      name: 'Demo User',
      role: 'OWNER'
    }
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@handled.ai' },
    update: {},
    create: {
      email: 'admin@handled.ai',
      passwordHash: hashedPassword,
      name: 'Admin User',
      role: 'OWNER' // Super admin is determined by SUPER_ADMIN_EMAILS env var
    }
  });

  console.log(`  ✓ Created demo user: demo@handled.ai (password: password123)`);
  console.log(`  ✓ Created admin user: admin@handled.ai (password: password123)`);
  console.log(`    (admin@handled.ai is super admin via SUPER_ADMIN_EMAILS env var)\n`);

  // ============================================
  // DEMO RESTAURANT BUSINESS
  // ============================================
  console.log('Creating demo restaurant...');

  const restaurant = await prisma.business.upsert({
    where: { id: 'demo-restaurant' },
    update: {},
    create: {
      id: 'demo-restaurant',
      name: 'Mario\'s Italian Kitchen',
      slug: 'marios-italian-kitchen',
      industry: 'RESTAURANT',
      description: 'Authentic Italian cuisine in the heart of downtown. Family recipes passed down for generations.',
      phone: '+1-555-123-4567',
      email: 'contact@marioskitchen.com',
      website: 'https://marioskitchen.com',
      timezone: 'America/New_York',
      plan: 'PROFESSIONAL',
      primaryColor: '#c41e3a',
      widgetGreeting: 'Ciao! Welcome to Mario\'s Italian Kitchen. How can I help you today? I can help you make a reservation, view our menu, or place a takeout order.',
      widgetPosition: 'BOTTOM_RIGHT',
      aiPersonality: 'Friendly and warm with a slight Italian flair. Use occasional Italian phrases like "Perfetto!" or "Grazie". Be helpful with menu recommendations.',
      aiInstructions: 'Always mention our daily specials. For parties of 6 or more, suggest calling ahead. Our most popular dishes are the Chicken Parmigiana and the Truffle Mushroom Risotto.'
    }
  });

  // Link user to business
  await prisma.businessUser.upsert({
    where: {
      userId_businessId: {
        userId: demoUser.id,
        businessId: restaurant.id
      }
    },
    update: {},
    create: {
      userId: demoUser.id,
      businessId: restaurant.id,
      role: 'OWNER'
    }
  });

  // Create API key for restaurant
  await prisma.apiKey.upsert({
    where: { id: 'demo-restaurant-key' },
    update: {},
    create: {
      id: 'demo-restaurant-key',
      businessId: restaurant.id,
      name: 'Demo Widget Key',
      key: 'hnd_demo_' + nanoid(24),
      isActive: true
    }
  });

  // Restaurant location
  await prisma.location.upsert({
    where: { id: 'demo-restaurant-location' },
    update: {},
    create: {
      id: 'demo-restaurant-location',
      businessId: restaurant.id,
      name: 'Downtown',
      address: '123 Main Street',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'USA',
      phone: '+1-555-123-4567',
      isDefault: true
    }
  });

  // Menu categories
  const appetizers = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-appetizers' },
    update: {},
    create: {
      id: 'demo-cat-appetizers',
      businessId: restaurant.id,
      name: 'Appetizers',
      description: 'Start your meal right',
      sortOrder: 0
    }
  });

  const pasta = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-pasta' },
    update: {},
    create: {
      id: 'demo-cat-pasta',
      businessId: restaurant.id,
      name: 'Pasta',
      description: 'Handmade daily',
      sortOrder: 1
    }
  });

  const mains = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-mains' },
    update: {},
    create: {
      id: 'demo-cat-mains',
      businessId: restaurant.id,
      name: 'Main Courses',
      description: 'Signature dishes',
      sortOrder: 2
    }
  });

  const desserts = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-desserts' },
    update: {},
    create: {
      id: 'demo-cat-desserts',
      businessId: restaurant.id,
      name: 'Desserts',
      description: 'Sweet endings',
      sortOrder: 3
    }
  });

  // Menu items
  const menuItems = [
    { id: 'item-bruschetta', categoryId: appetizers.id, name: 'Bruschetta', description: 'Grilled bread with fresh tomatoes, garlic, and basil', price: 12.99 },
    { id: 'item-calamari', categoryId: appetizers.id, name: 'Fried Calamari', description: 'Crispy calamari with marinara sauce', price: 15.99 },
    { id: 'item-caprese', categoryId: appetizers.id, name: 'Caprese Salad', description: 'Fresh mozzarella, tomatoes, and basil with balsamic glaze', price: 14.99 },
    { id: 'item-spaghetti', categoryId: pasta.id, name: 'Spaghetti Bolognese', description: 'Classic meat sauce with parmesan', price: 18.99 },
    { id: 'item-fettuccine', categoryId: pasta.id, name: 'Fettuccine Alfredo', description: 'Creamy parmesan sauce', price: 17.99 },
    { id: 'item-lasagna', categoryId: pasta.id, name: 'Lasagna', description: 'Layers of pasta, meat, ricotta, and mozzarella', price: 21.99 },
    { id: 'item-risotto', categoryId: pasta.id, name: 'Truffle Mushroom Risotto', description: 'Arborio rice with wild mushrooms and truffle oil', price: 24.99 },
    { id: 'item-chicken-parm', categoryId: mains.id, name: 'Chicken Parmigiana', description: 'Breaded chicken breast with marinara and melted mozzarella', price: 23.99 },
    { id: 'item-veal', categoryId: mains.id, name: 'Veal Piccata', description: 'Tender veal in lemon caper butter sauce', price: 28.99 },
    { id: 'item-salmon', categoryId: mains.id, name: 'Grilled Salmon', description: 'Atlantic salmon with lemon herb butter', price: 26.99 },
    { id: 'item-tiramisu', categoryId: desserts.id, name: 'Tiramisu', description: 'Classic Italian coffee dessert', price: 9.99 },
    { id: 'item-cannoli', categoryId: desserts.id, name: 'Cannoli', description: 'Crispy shells filled with sweet ricotta', price: 8.99 },
    { id: 'item-gelato', categoryId: desserts.id, name: 'Gelato', description: 'Choice of vanilla, chocolate, or pistachio', price: 7.99 },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        ...item,
        businessId: restaurant.id,
        isAvailable: true,
        sortOrder: 0
      }
    });
  }

  // FAQs
  const faqs = [
    { question: 'Do you take reservations?', answer: 'Yes! You can make a reservation right here in the chat, or call us at (555) 123-4567.' },
    { question: 'Do you offer takeout?', answer: 'Absolutely! You can place a takeout order through our chat or call ahead. Pickup is available during all business hours.' },
    { question: 'Do you have vegetarian options?', answer: 'Yes, we have many vegetarian dishes including our Caprese Salad, Fettuccine Alfredo, Truffle Mushroom Risotto, and more.' },
    { question: 'Do you have gluten-free options?', answer: 'We can prepare many of our dishes gluten-free. Please let your server know about any dietary restrictions.' },
    { question: 'Is there parking available?', answer: 'We have a small parking lot behind the restaurant, and there is also street parking available. Valet parking is available on Friday and Saturday evenings.' },
    { question: 'Do you cater events?', answer: 'Yes! We offer catering for events of all sizes. Contact us at catering@marioskitchen.com for more information.' },
  ];

  for (let i = 0; i < faqs.length; i++) {
    await prisma.fAQItem.upsert({
      where: { id: `demo-faq-${i}` },
      update: {},
      create: {
        id: `demo-faq-${i}`,
        businessId: restaurant.id,
        ...faqs[i],
        sortOrder: i
      }
    });
  }

  // Sample bookings
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const bookings = [
    {
      id: 'demo-booking-1',
      customerName: 'John Smith',
      customerPhone: '+1-555-111-2222',
      customerEmail: 'john@example.com',
      partySize: 4,
      startTime: new Date(tomorrow.setHours(18, 30, 0, 0)),
      status: 'CONFIRMED',
      confirmationCode: 'MIK-' + nanoid(6).toUpperCase()
    },
    {
      id: 'demo-booking-2',
      customerName: 'Sarah Johnson',
      customerPhone: '+1-555-333-4444',
      partySize: 2,
      startTime: new Date(tomorrow.setHours(19, 0, 0, 0)),
      status: 'CONFIRMED',
      confirmationCode: 'MIK-' + nanoid(6).toUpperCase()
    },
    {
      id: 'demo-booking-3',
      customerName: 'Michael Chen',
      customerPhone: '+1-555-555-6666',
      customerEmail: 'mchen@example.com',
      partySize: 6,
      startTime: new Date(tomorrow.setHours(20, 0, 0, 0)),
      status: 'PENDING',
      notes: 'Anniversary dinner - please prepare something special!',
      confirmationCode: 'MIK-' + nanoid(6).toUpperCase()
    }
  ];

  for (const booking of bookings) {
    await prisma.booking.upsert({
      where: { id: booking.id },
      update: {},
      create: {
        ...booking,
        businessId: restaurant.id,
        locationId: 'demo-restaurant-location',
        endTime: new Date(booking.startTime.getTime() + 90 * 60 * 1000) // 90 min duration
      }
    });
  }

  console.log(`  ✓ Created restaurant: Mario's Italian Kitchen`);
  console.log(`    - 4 menu categories with 13 items`);
  console.log(`    - 6 FAQs`);
  console.log(`    - 3 sample bookings\n`);

  // ============================================
  // DEMO SALON BUSINESS
  // ============================================
  console.log('Creating demo salon...');

  const salon = await prisma.business.upsert({
    where: { id: 'demo-salon' },
    update: {},
    create: {
      id: 'demo-salon',
      name: 'Luxe Hair Studio',
      slug: 'luxe-hair-studio',
      industry: 'SALON',
      description: 'Premium hair salon offering cuts, color, and styling services.',
      phone: '+1-555-987-6543',
      email: 'hello@luxehairstudio.com',
      website: 'https://luxehairstudio.com',
      timezone: 'America/Los_Angeles',
      plan: 'STARTER',
      primaryColor: '#9333ea',
      widgetGreeting: 'Welcome to Luxe Hair Studio! I can help you book an appointment, check our services and pricing, or answer any questions.',
      widgetPosition: 'BOTTOM_RIGHT',
      aiPersonality: 'Friendly, trendy, and professional. Use beauty industry terminology appropriately.',
      aiInstructions: 'Always ask about the type of service they want. Mention that consultations are free. For color services, recommend booking extra time.'
    }
  });

  await prisma.businessUser.upsert({
    where: {
      userId_businessId: {
        userId: demoUser.id,
        businessId: salon.id
      }
    },
    update: {},
    create: {
      userId: demoUser.id,
      businessId: salon.id,
      role: 'OWNER'
    }
  });

  // Salon services
  const services = [
    { id: 'svc-haircut-women', name: 'Women\'s Haircut', description: 'Includes wash, cut, and style', duration: 60, price: 65 },
    { id: 'svc-haircut-men', name: 'Men\'s Haircut', description: 'Classic cut and style', duration: 30, price: 35 },
    { id: 'svc-blowout', name: 'Blowout', description: 'Wash and professional blowdry styling', duration: 45, price: 45 },
    { id: 'svc-color-root', name: 'Root Touch-Up', description: 'Color roots only', duration: 90, price: 85 },
    { id: 'svc-color-full', name: 'Full Color', description: 'Single process all-over color', duration: 120, price: 120 },
    { id: 'svc-highlights', name: 'Highlights', description: 'Partial or full highlights', duration: 150, price: 175 },
    { id: 'svc-balayage', name: 'Balayage', description: 'Hand-painted highlights for natural look', duration: 180, price: 225 },
    { id: 'svc-treatment', name: 'Deep Conditioning Treatment', description: 'Intensive hair repair treatment', duration: 30, price: 40 },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: {},
      create: {
        ...service,
        businessId: salon.id,
        isActive: true,
        sortOrder: 0
      }
    });
  }

  // Salon FAQs
  const salonFaqs = [
    { question: 'Do I need an appointment?', answer: 'We recommend booking an appointment, especially for color services. Walk-ins are welcome for haircuts based on availability.' },
    { question: 'How early should I arrive?', answer: 'Please arrive 5-10 minutes before your appointment time. This allows time for a consultation if needed.' },
    { question: 'What if I need to cancel?', answer: 'We ask for 24-hour notice for cancellations. Late cancellations may be subject to a fee.' },
    { question: 'Do you offer consultations?', answer: 'Yes! Free consultations are available for color and major style changes. Book a consultation to discuss your goals.' },
  ];

  for (let i = 0; i < salonFaqs.length; i++) {
    await prisma.fAQItem.upsert({
      where: { id: `demo-salon-faq-${i}` },
      update: {},
      create: {
        id: `demo-salon-faq-${i}`,
        businessId: salon.id,
        ...salonFaqs[i],
        sortOrder: i
      }
    });
  }

  console.log(`  ✓ Created salon: Luxe Hair Studio`);
  console.log(`    - 8 services`);
  console.log(`    - 4 FAQs\n`);

  // ============================================
  // SAMPLE CONVERSATIONS
  // ============================================
  console.log('Creating sample conversations...');

  const conversation = await prisma.conversation.upsert({
    where: { id: 'demo-conversation-1' },
    update: {},
    create: {
      id: 'demo-conversation-1',
      businessId: restaurant.id,
      visitorId: 'visitor_demo123',
      channel: 'WEB',
      status: 'RESOLVED',
      customerName: 'Emily Davis',
      customerEmail: 'emily@example.com',
      startedAt: new Date(Date.now() - 3600000), // 1 hour ago
      lastMessageAt: new Date(Date.now() - 3000000) // 50 min ago
    }
  });

  const messages = [
    { role: 'USER', content: 'Hi, I\'d like to make a reservation for tonight' },
    { role: 'ASSISTANT', content: 'Ciao! I\'d be happy to help you with a reservation for tonight. How many guests will be joining you, and what time were you thinking?' },
    { role: 'USER', content: '4 people at 7pm' },
    { role: 'ASSISTANT', content: 'Perfetto! Let me check our availability for 4 guests at 7:00 PM tonight... Great news! We have a table available. May I have your name and phone number to complete the reservation?' },
    { role: 'USER', content: 'Emily Davis, 555-777-8888' },
    { role: 'ASSISTANT', content: 'Wonderful! Your reservation is confirmed:\n\n📅 Tonight at 7:00 PM\n👥 4 guests\n📍 Mario\'s Italian Kitchen\n\nYour confirmation code is MIK-DEMO1. We look forward to seeing you! Is there anything else I can help you with?' },
    { role: 'USER', content: 'No that\'s all, thank you!' },
    { role: 'ASSISTANT', content: 'Grazie! See you tonight. Buon appetito! 🍝' },
  ];

  for (let i = 0; i < messages.length; i++) {
    await prisma.message.upsert({
      where: { id: `demo-msg-${i}` },
      update: {},
      create: {
        id: `demo-msg-${i}`,
        conversationId: conversation.id,
        role: messages[i].role as 'USER' | 'ASSISTANT',
        content: messages[i].content,
        createdAt: new Date(Date.now() - 3600000 + i * 30000) // Spaced 30 seconds apart
      }
    });
  }

  console.log(`  ✓ Created 1 sample conversation with 8 messages\n`);

  // ============================================
  // DONE
  // ============================================
  console.log('✅ Database seeded successfully!\n');
  console.log('Demo accounts:');
  console.log('  📧 demo@handled.ai / password123 (regular user)');
  console.log('  📧 admin@handled.ai / password123 (super admin)\n');
  console.log('Demo businesses:');
  console.log('  🍝 Mario\'s Italian Kitchen (Restaurant)');
  console.log('  💇 Luxe Hair Studio (Salon)\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
