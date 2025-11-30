// Integration Tests for Handled API
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from './app';

const prisma = new PrismaClient();

// Test data
let authToken: string;
let userId: string;
let businessId: string;
let serviceId: string;
let faqId: string;
let locationId: string;
let apiKeyId: string;
let menuCategoryId: string;
let menuItemId: string;

const testUser = {
  name: 'Test User',
  email: `test-${Date.now()}@example.com`,
  password: 'TestPassword123!'
};

const testBusiness = {
  name: 'Test Restaurant',
  industry: 'RESTAURANT'
};

// ============================================
// HEALTH CHECK TESTS
// ============================================

describe('Health Check', () => {
  it('GET / should return API info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Handled API');
    expect(res.body.status).toBe('running');
  });

  it('GET /health should return ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ============================================
// AUTH TESTS
// ============================================

describe('Authentication', () => {
  it('POST /api/auth/signup should create a new user', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);

    authToken = res.body.token;
    userId = res.body.user.id;
  });

  it('POST /api/auth/signup should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(testUser);

    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login should authenticate user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);

    authToken = res.body.token;
  });

  it('POST /api/auth/login should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword'
      });

    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me should return current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('GET /api/auth/me should reject invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });
});

// ============================================
// BUSINESS TESTS
// ============================================

describe('Business Management', () => {
  it('POST /api/businesses should create a business', async () => {
    const res = await request(app)
      .post('/api/businesses')
      .set('Authorization', `Bearer ${authToken}`)
      .send(testBusiness);

    expect(res.status).toBe(201);
    expect(res.body.business).toBeDefined();
    expect(res.body.business.name).toBe(testBusiness.name);

    businessId = res.body.business.id;
  });

  it('GET /api/businesses/:id should return business details', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.business.id).toBe(businessId);
    expect(res.body.business.name).toBe(testBusiness.name);
  });

  it('PATCH /api/businesses/:id should update business', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ description: 'A great restaurant' });

    expect(res.status).toBe(200);
    expect(res.body.business.description).toBe('A great restaurant');
  });
});

// ============================================
// SERVICES TESTS
// ============================================

describe('Services Management', () => {
  it('POST /api/businesses/:id/services should create a service', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/services`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Table Reservation',
        description: 'Reserve a table for dining',
        duration: 60,
        price: 0
      });

    expect(res.status).toBe(201);
    expect(res.body.service).toBeDefined();
    expect(res.body.service.name).toBe('Table Reservation');

    serviceId = res.body.service.id;
  });

  it('GET /api/businesses/:id/services should list services', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/services`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.services).toBeDefined();
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services.length).toBeGreaterThan(0);
  });

  it('PATCH /api/businesses/:id/services/:serviceId should update service', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ price: 25 });

    expect(res.status).toBe(200);
    expect(res.body.service.price).toBe(25);
  });
});

// ============================================
// FAQ TESTS
// ============================================

describe('FAQ Management', () => {
  it('POST /api/businesses/:id/faqs should create a FAQ', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/faqs`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        question: 'What are your hours?',
        answer: 'We are open from 11 AM to 10 PM daily.'
      });

    expect(res.status).toBe(201);
    expect(res.body.faq).toBeDefined();
    expect(res.body.faq.question).toBe('What are your hours?');

    faqId = res.body.faq.id;
  });

  it('GET /api/businesses/:id/faqs should list FAQs', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/faqs`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.faqs).toBeDefined();
    expect(Array.isArray(res.body.faqs)).toBe(true);
    expect(res.body.faqs.length).toBeGreaterThan(0);
  });

  it('PATCH /api/businesses/:id/faqs/:faqId should update FAQ', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/faqs/${faqId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ answer: 'We are open 7 days a week, 11 AM to 11 PM.' });

    expect(res.status).toBe(200);
    expect(res.body.faq.answer).toBe('We are open 7 days a week, 11 AM to 11 PM.');
  });
});

// ============================================
// LOCATION TESTS
// ============================================

describe('Location Management', () => {
  it('POST /api/businesses/:id/locations should create a location', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/locations`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Downtown',
        address: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        phone: '+1-555-0100'
      });

    expect(res.status).toBe(201);
    expect(res.body.location).toBeDefined();
    expect(res.body.location.name).toBe('Downtown');

    locationId = res.body.location.id;
  });

  it('GET /api/businesses/:id/locations should list locations', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/locations`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.locations).toBeDefined();
    expect(Array.isArray(res.body.locations)).toBe(true);
    expect(res.body.locations.length).toBeGreaterThan(0);
  });

  it('PATCH /api/businesses/:id/locations/:locationId should update location', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/locations/${locationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ phone: '+1-555-0200' });

    expect(res.status).toBe(200);
    expect(res.body.location.phone).toBe('+1-555-0200');
  });
});

// ============================================
// MENU TESTS
// ============================================

describe('Menu Management', () => {
  it('POST /api/businesses/:id/menu/categories should create a category', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/menu/categories`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Appetizers',
        description: 'Start your meal'
      });

    expect(res.status).toBe(201);
    expect(res.body.category).toBeDefined();
    expect(res.body.category.name).toBe('Appetizers');

    menuCategoryId = res.body.category.id;
  });

  it('POST /api/businesses/:id/menu/items should create a menu item', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/menu/items`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Spring Rolls',
        description: 'Crispy vegetable rolls',
        price: 8.99,
        categoryId: menuCategoryId
      });

    expect(res.status).toBe(201);
    expect(res.body.item).toBeDefined();
    expect(res.body.item.name).toBe('Spring Rolls');
    expect(res.body.item.price).toBe(8.99);

    menuItemId = res.body.item.id;
  });

  it('GET /api/businesses/:id/menu should return full menu', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/menu`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.categories).toBeDefined();
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('PATCH /api/businesses/:id/menu/items/:itemId should update menu item', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/menu/items/${menuItemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ price: 9.99 });

    expect(res.status).toBe(200);
    expect(res.body.item.price).toBe(9.99);
  });
});

// ============================================
// API KEY TESTS
// ============================================

describe('API Key Management', () => {
  it('POST /api/businesses/:id/api-keys should create an API key', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/api-keys`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Production Key'
      });

    expect(res.status).toBe(201);
    expect(res.body.apiKey).toBeDefined();
    expect(res.body.apiKey.name).toBe('Production Key');
    expect(res.body.apiKey.key).toBeDefined();

    apiKeyId = res.body.apiKey.id;
  });

  it('GET /api/businesses/:id/api-keys should list API keys', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/api-keys`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.apiKeys).toBeDefined();
    expect(Array.isArray(res.body.apiKeys)).toBe(true);
    expect(res.body.apiKeys.length).toBeGreaterThan(0);
  });
});

// ============================================
// TEAM TESTS
// ============================================

describe('Team Management', () => {
  it('GET /api/businesses/:id/team should list team members', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/team`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.members).toBeDefined();
    expect(Array.isArray(res.body.members)).toBe(true);
    // Should have at least the owner
    expect(res.body.members.length).toBeGreaterThan(0);
    expect(res.body.members[0].role).toBe('OWNER');
  });
});

// ============================================
// WIDGET TESTS
// ============================================

describe('Widget API', () => {
  let widgetApiKey: string;

  beforeAll(async () => {
    // Get API key for widget tests
    const res = await request(app)
      .get(`/api/businesses/${businessId}/api-keys`)
      .set('Authorization', `Bearer ${authToken}`);

    widgetApiKey = res.body.apiKeys[0]?.key;
  });

  it('GET /widget/config should return widget configuration', async () => {
    if (!widgetApiKey) {
      console.log('Skipping widget test - no API key');
      return;
    }

    const res = await request(app)
      .get('/widget/config')
      .set('x-api-key', widgetApiKey);

    expect(res.status).toBe(200);
    expect(res.body.businessId).toBeDefined();
    expect(res.body.businessName).toBeDefined();
  });
});

// ============================================
// CLEANUP - Delete test data
// ============================================

describe('Cleanup', () => {
  it('DELETE /api/businesses/:id/services/:serviceId should delete service', async () => {
    const res = await request(app)
      .delete(`/api/businesses/${businessId}/services/${serviceId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  it('DELETE /api/businesses/:id/faqs/:faqId should delete FAQ', async () => {
    const res = await request(app)
      .delete(`/api/businesses/${businessId}/faqs/${faqId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  it('DELETE /api/businesses/:id/menu/items/:itemId should delete menu item', async () => {
    const res = await request(app)
      .delete(`/api/businesses/${businessId}/menu/items/${menuItemId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  it('DELETE /api/businesses/:id/locations/:locationId should delete location', async () => {
    const res = await request(app)
      .delete(`/api/businesses/${businessId}/locations/${locationId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  it('DELETE /api/businesses/:id/api-keys/:keyId should delete API key', async () => {
    const res = await request(app)
      .delete(`/api/businesses/${businessId}/api-keys/${apiKeyId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });
});

// Final cleanup - remove test user and business from database
afterAll(async () => {
  try {
    // Clean up test data
    if (businessId) {
      await prisma.businessUser.deleteMany({ where: { businessId } });
      await prisma.menuCategory.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  } finally {
    await prisma.$disconnect();
  }
});
