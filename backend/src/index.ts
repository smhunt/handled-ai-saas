// Handled API - Main Server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { bookingRouter } from './routes/bookings';
import { orderRouter } from './routes/orders';
import { conversationRouter } from './routes/conversations';
import { widgetRouter } from './routes/widget';
import { webhookRouter } from './routes/webhooks';
import { analyticsRouter } from './routes/analytics';
import { errorHandler } from './middleware/errorHandler';
import { setupSocketHandlers } from './services/socket';

const app = express();
const httpServer = createServer(app);

// Socket.io for real-time chat
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Widget endpoint has separate rate limiting (more permissive)
const widgetLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: 'Rate limit exceeded' }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Handled API',
    version: '1.0.0',
    status: 'running',
    docs: {
      auth: '/api/auth',
      businesses: '/api/businesses',
      bookings: '/api/bookings',
      orders: '/api/orders',
      conversations: '/api/conversations',
      analytics: '/api/analytics',
      widget: '/widget',
      webhooks: '/webhooks'
    }
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

// Widget API (public, with API key auth)
app.use('/widget', widgetLimiter, widgetRouter);

// Webhooks (Stripe, Twilio, etc.)
app.use('/webhooks', webhookRouter);

// Socket.io handlers
setupSocketHandlers(io);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Handled API running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
});

export { io };
