// Test App - Exports express app without starting server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import { authRouter } from '../src/routes/auth';
import { businessRouter } from '../src/routes/business';
import { bookingRouter } from '../src/routes/bookings';
import { orderRouter } from '../src/routes/orders';
import { conversationRouter } from '../src/routes/conversations';
import { widgetRouter } from '../src/routes/widget';
import { webhookRouter } from '../src/routes/webhooks';
import { analyticsRouter } from '../src/routes/analytics';
import { errorHandler } from '../src/middleware/errorHandler';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Handled API',
    version: '1.0.0',
    status: 'running'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/businesses', businessRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/orders', orderRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/analytics', analyticsRouter);

// Widget API
app.use('/widget', widgetRouter);

// Webhooks
app.use('/webhooks', webhookRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export { app };
