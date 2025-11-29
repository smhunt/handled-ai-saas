// Socket.io Handlers - Real-time chat functionality
import { Server as SocketServer, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { handleConversation } from './conversation';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  businessId?: string;
  conversationId?: string;
  isWidget?: boolean;
  apiKey?: string;
}

export function setupSocketHandlers(io: SocketServer) {
  // Middleware for authentication
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const apiKey = socket.handshake.auth.apiKey;
      const conversationId = socket.handshake.auth.conversationId;

      // Dashboard user authentication
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        socket.userId = decoded.userId;
        
        // Get user's businesses
        const businessUsers = await prisma.businessUser.findMany({
          where: { userId: decoded.userId },
          select: { businessId: true }
        });
        
        if (businessUsers.length > 0) {
          socket.businessId = businessUsers[0].businessId;
        }
      }
      // Widget authentication
      else if (apiKey) {
        const key = await prisma.apiKey.findUnique({
          where: { key: apiKey }
        });

        if (!key || !key.isActive) {
          return next(new Error('Invalid API key'));
        }

        socket.isWidget = true;
        socket.apiKey = apiKey;
        socket.businessId = key.businessId;
        socket.conversationId = conversationId;
      }
      else {
        return next(new Error('Authentication required'));
      }

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id} (${socket.isWidget ? 'widget' : 'dashboard'})`);

    // Join business room for real-time updates
    if (socket.businessId) {
      socket.join(`business:${socket.businessId}`);
    }

    // Join conversation room if widget
    if (socket.conversationId) {
      socket.join(`conversation:${socket.conversationId}`);
    }

    // ============================================
    // WIDGET EVENTS
    // ============================================

    // Widget: Join conversation
    socket.on('join_conversation', async (data: { conversationId: string }) => {
      socket.conversationId = data.conversationId;
      socket.join(`conversation:${data.conversationId}`);
      
      // Get conversation history
      const messages = await prisma.message.findMany({
        where: { conversationId: data.conversationId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true
        }
      });

      socket.emit('conversation_history', messages);
    });

    // Widget: Send message
    socket.on('send_message', async (data: { content: string; visitorId?: string }) => {
      if (!socket.conversationId || !socket.businessId) {
        return socket.emit('error', { message: 'No active conversation' });
      }

      try {
        // Emit typing indicator
        socket.to(`conversation:${socket.conversationId}`).emit('typing', { isTyping: true });
        io.to(`business:${socket.businessId}`).emit('typing', { 
          conversationId: socket.conversationId,
          isTyping: true 
        });

        // Process message with AI
        const response = await handleConversation(
          socket.businessId,
          socket.conversationId,
          data.content
        );

        // Get the saved messages
        const messages = await prisma.message.findMany({
          where: { conversationId: socket.conversationId },
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true
          }
        });

        // Emit to conversation participants
        socket.emit('message_sent', messages[1]); // User message
        
        setTimeout(() => {
          io.to(`conversation:${socket.conversationId}`).emit('new_message', messages[0]); // AI response
          io.to(`conversation:${socket.conversationId}`).emit('typing', { isTyping: false });
        }, 500);

        // Notify dashboard users
        io.to(`business:${socket.businessId}`).emit('conversation_updated', {
          conversationId: socket.conversationId,
          lastMessage: messages[0]
        });

      } catch (error) {
        console.error('Socket message error:', error);
        socket.emit('error', { message: 'Failed to process message' });
        io.to(`conversation:${socket.conversationId}`).emit('typing', { isTyping: false });
      }
    });

    // Widget: End conversation
    socket.on('end_conversation', async (data: { rating?: number; feedback?: string }) => {
      if (!socket.conversationId) return;

      await prisma.conversation.update({
        where: { id: socket.conversationId },
        data: {
          status: 'RESOLVED',
          endedAt: new Date(),
          metadata: { rating: data.rating, feedback: data.feedback }
        }
      });

      socket.leave(`conversation:${socket.conversationId}`);
      socket.emit('conversation_ended');

      // Notify dashboard
      io.to(`business:${socket.businessId}`).emit('conversation_resolved', {
        conversationId: socket.conversationId
      });
    });

    // ============================================
    // DASHBOARD EVENTS
    // ============================================

    // Dashboard: Join specific conversation for monitoring
    socket.on('watch_conversation', (data: { conversationId: string }) => {
      socket.join(`conversation:${data.conversationId}`);
    });

    // Dashboard: Stop watching conversation
    socket.on('unwatch_conversation', (data: { conversationId: string }) => {
      socket.leave(`conversation:${data.conversationId}`);
    });

    // Dashboard: Send message as human (takeover)
    socket.on('staff_message', async (data: { conversationId: string; content: string }) => {
      if (!socket.userId) return;

      try {
        // Save message
        const message = await prisma.message.create({
          data: {
            conversationId: data.conversationId,
            role: 'ASSISTANT',
            content: data.content,
            metadata: { sentBy: socket.userId, isHuman: true }
          }
        });

        // Update conversation
        await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { 
            lastMessageAt: new Date(),
            handedOffToHuman: true,
            assignedTo: socket.userId,
            status: 'HANDED_OFF'
          }
        });

        // Emit to conversation
        io.to(`conversation:${data.conversationId}`).emit('new_message', {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          isHuman: true
        });

      } catch (error) {
        console.error('Staff message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Dashboard: Take over conversation
    socket.on('takeover_conversation', async (data: { conversationId: string }) => {
      if (!socket.userId) return;

      await prisma.conversation.update({
        where: { id: data.conversationId },
        data: {
          handedOffToHuman: true,
          assignedTo: socket.userId,
          status: 'HANDED_OFF'
        }
      });

      // Notify widget
      io.to(`conversation:${data.conversationId}`).emit('human_joined', {
        message: "You're now connected with a team member."
      });

      socket.emit('takeover_success', { conversationId: data.conversationId });
    });

    // Dashboard: Return to AI
    socket.on('return_to_ai', async (data: { conversationId: string }) => {
      await prisma.conversation.update({
        where: { id: data.conversationId },
        data: {
          handedOffToHuman: false,
          status: 'ACTIVE'
        }
      });

      io.to(`conversation:${data.conversationId}`).emit('ai_resumed', {
        message: "You're now chatting with our AI assistant."
      });
    });

    // Dashboard: Get active conversations
    socket.on('get_active_conversations', async () => {
      if (!socket.businessId) return;

      const conversations = await prisma.conversation.findMany({
        where: {
          businessId: socket.businessId,
          status: { in: ['ACTIVE', 'WAITING', 'HANDED_OFF'] }
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });

      socket.emit('active_conversations', conversations);
    });

    // ============================================
    // COMMON EVENTS
    // ============================================

    // Typing indicator
    socket.on('typing_start', () => {
      if (socket.conversationId) {
        socket.to(`conversation:${socket.conversationId}`).emit('typing', { 
          isTyping: true,
          isHuman: !socket.isWidget 
        });
      }
    });

    socket.on('typing_stop', () => {
      if (socket.conversationId) {
        socket.to(`conversation:${socket.conversationId}`).emit('typing', { 
          isTyping: false 
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  // ============================================
  // SERVER-SIDE EMITTERS (for use by other services)
  // ============================================

  return {
    // Notify business of new booking
    notifyNewBooking(businessId: string, booking: any) {
      io.to(`business:${businessId}`).emit('new_booking', booking);
    },

    // Notify business of new order
    notifyNewOrder(businessId: string, order: any) {
      io.to(`business:${businessId}`).emit('new_order', order);
    },

    // Notify business of handoff request
    notifyHandoffRequest(businessId: string, conversation: any) {
      io.to(`business:${businessId}`).emit('handoff_request', conversation);
    },

    // Send message to specific conversation
    sendToConversation(conversationId: string, event: string, data: any) {
      io.to(`conversation:${conversationId}`).emit(event, data);
    },

    // Broadcast to all connected dashboard users of a business
    broadcastToBusiness(businessId: string, event: string, data: any) {
      io.to(`business:${businessId}`).emit(event, data);
    }
  };
}
