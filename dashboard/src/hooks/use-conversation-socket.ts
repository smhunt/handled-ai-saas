// Real-time conversation socket hook
import { useEffect, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'

interface Message {
  id: string
  role: 'USER' | 'ASSISTANT'
  content: string
  createdAt: string
  isHuman?: boolean
}

interface ConversationUpdate {
  conversationId: string
  lastMessage: Message
}

interface TypingIndicator {
  conversationId?: string
  isTyping: boolean
  isHuman?: boolean
}

interface UseConversationSocketProps {
  socket: Socket | null
  isConnected: boolean
  businessId?: string
  onNewMessage?: (conversationId: string, message: Message) => void
  onConversationUpdated?: (update: ConversationUpdate) => void
  onNewConversation?: (conversation: any) => void
  onConversationResolved?: (data: { conversationId: string }) => void
  onHandoffRequest?: (conversation: any) => void
  onTyping?: (data: TypingIndicator) => void
}

export function useConversationSocket({
  socket,
  isConnected,
  businessId,
  onNewMessage,
  onConversationUpdated,
  onNewConversation,
  onConversationResolved,
  onHandoffRequest,
  onTyping
}: UseConversationSocketProps) {
  const watchedConversationRef = useRef<string | null>(null)

  // Subscribe to business-wide conversation events
  useEffect(() => {
    if (!socket || !isConnected || !businessId) return

    const handleNewMessage = (message: Message & { conversationId?: string }) => {
      if (message.conversationId || watchedConversationRef.current) {
        onNewMessage?.(message.conversationId || watchedConversationRef.current!, message)
      }
    }

    const handleConversationUpdated = (update: ConversationUpdate) => {
      onConversationUpdated?.(update)
    }

    const handleNewConversation = (conversation: any) => {
      onNewConversation?.(conversation)
    }

    const handleConversationResolved = (data: { conversationId: string }) => {
      onConversationResolved?.(data)
    }

    const handleHandoffRequest = (conversation: any) => {
      onHandoffRequest?.(conversation)
    }

    const handleTyping = (data: TypingIndicator) => {
      onTyping?.(data)
    }

    socket.on('new_message', handleNewMessage)
    socket.on('conversation_updated', handleConversationUpdated)
    socket.on('new_conversation', handleNewConversation)
    socket.on('conversation_resolved', handleConversationResolved)
    socket.on('handoff_request', handleHandoffRequest)
    socket.on('typing', handleTyping)

    return () => {
      socket.off('new_message', handleNewMessage)
      socket.off('conversation_updated', handleConversationUpdated)
      socket.off('new_conversation', handleNewConversation)
      socket.off('conversation_resolved', handleConversationResolved)
      socket.off('handoff_request', handleHandoffRequest)
      socket.off('typing', handleTyping)
    }
  }, [socket, isConnected, businessId, onNewMessage, onConversationUpdated, onNewConversation, onConversationResolved, onHandoffRequest, onTyping])

  // Watch a specific conversation (join room)
  const watchConversation = useCallback((conversationId: string) => {
    if (!socket || !isConnected) return

    // Leave previous conversation room if exists
    if (watchedConversationRef.current && watchedConversationRef.current !== conversationId) {
      socket.emit('unwatch_conversation', { conversationId: watchedConversationRef.current })
    }

    // Join new conversation room
    socket.emit('watch_conversation', { conversationId })
    watchedConversationRef.current = conversationId
  }, [socket, isConnected])

  // Stop watching a conversation (leave room)
  const unwatchConversation = useCallback((conversationId?: string) => {
    if (!socket || !isConnected) return

    const idToUnwatch = conversationId || watchedConversationRef.current
    if (idToUnwatch) {
      socket.emit('unwatch_conversation', { conversationId: idToUnwatch })
      if (watchedConversationRef.current === idToUnwatch) {
        watchedConversationRef.current = null
      }
    }
  }, [socket, isConnected])

  // Send message as staff
  const sendStaffMessage = useCallback((conversationId: string, content: string) => {
    if (!socket || !isConnected) return false

    socket.emit('staff_message', { conversationId, content })
    return true
  }, [socket, isConnected])

  // Take over conversation from AI
  const takeoverConversation = useCallback((conversationId: string) => {
    if (!socket || !isConnected) return false

    socket.emit('takeover_conversation', { conversationId })
    return true
  }, [socket, isConnected])

  // Return conversation to AI
  const returnToAI = useCallback((conversationId: string) => {
    if (!socket || !isConnected) return false

    socket.emit('return_to_ai', { conversationId })
    return true
  }, [socket, isConnected])

  // Emit typing indicator
  const emitTyping = useCallback((isTyping: boolean) => {
    if (!socket || !isConnected || !watchedConversationRef.current) return

    socket.emit(isTyping ? 'typing_start' : 'typing_stop')
  }, [socket, isConnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchedConversationRef.current && socket?.connected) {
        socket.emit('unwatch_conversation', { conversationId: watchedConversationRef.current })
      }
    }
  }, [socket])

  return {
    watchConversation,
    unwatchConversation,
    sendStaffMessage,
    takeoverConversation,
    returnToAI,
    emitTyping,
    watchedConversationId: watchedConversationRef.current
  }
}
