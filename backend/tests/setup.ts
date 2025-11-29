// Test Setup
import 'dotenv/config';
import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Clean test data before running tests
  console.log('Setting up test environment...');
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
