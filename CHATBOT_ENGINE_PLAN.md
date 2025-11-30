# Chatbot Engine Implementation Plan

## Executive Summary

The existing codebase has a **working prototype** of the AI conversation system. This plan outlines enhancements to make it production-ready.

### What Already Exists:
- `backend/src/services/conversation.ts` - Working ConversationService with Claude Sonnet integration
- `backend/src/services/socket.ts` - WebSocket handlers for real-time chat
- `backend/src/routes/widget.ts` - REST API for widget
- `backend/src/routes/webhooks.ts` - SMS integration via Twilio
- `widget/src/widget.js` - Embeddable chat widget
- Full Prisma schema with Conversations, Messages, Bookings, Orders

### What Needs Enhancement:
1. Better separation of concerns and testability
2. More sophisticated context management
3. Robust action system with validation
4. Streaming support for better UX
5. Multi-channel consistency
6. Observability and debugging tools

---

## Proposed Architecture

```
Widget/SMS ---> Message Router ---> AI Engine Core ---> Claude API
                (channel-aware)     |
                                    +-- ContextBuilder
                                    +-- ResponseGenerator
                                    +-- ActionHandler
                                    +-- StateManager
```

---

## New File Structure

```
backend/src/services/ai/
├── index.ts                    # Main AI engine export
├── AIEngine.ts                 # Core orchestrator
├── ContextBuilder.ts           # Builds prompts from business data
├── ResponseGenerator.ts        # Claude API interactions
├── ActionHandler.ts            # Executes tool calls
├── ConversationStateManager.ts # Manages state
├── StreamingHandler.ts         # Streaming responses
├── types.ts                    # TypeScript interfaces
│
├── actions/
│   ├── index.ts                # Action registry
│   ├── BookingActions.ts       # Booking tools
│   ├── OrderActions.ts         # Order tools
│   ├── InfoActions.ts          # Business info tools
│   └── HandoffActions.ts       # Human handoff
│
├── prompts/
│   ├── SystemPromptBuilder.ts  # Main system prompt
│   ├── IndustryPrompts.ts      # Industry-specific
│   └── PersonalityTemplates.ts # Tone/style
│
backend/src/services/channels/
├── index.ts                    # Channel router
├── WebChannel.ts               # Socket.io handler
├── SMSChannel.ts               # Twilio handler
└── BaseChannel.ts              # Abstract channel
```

---

## Implementation Phases

### Phase 1: Core Refactoring (5-7 days)
- [ ] Create new file structure and types
- [ ] Implement ContextBuilder
- [ ] Implement SystemPromptBuilder
- [ ] Implement AIEngine orchestrator
- [ ] Migrate existing conversation.ts

### Phase 2: Action System (5-7 days)
- [ ] Implement ActionHandler framework
- [ ] BookingActions (check_availability, create_booking, cancel_booking, lookup_booking)
- [ ] OrderActions (get_menu, add_to_order, remove_from_order, confirm_order)
- [ ] InfoActions (get_business_info, search_faq, get_hours)
- [ ] HandoffActions (handoff_to_human)

### Phase 3: Streaming & Channels (5-7 days)
- [ ] Add streaming support to ResponseGenerator
- [ ] Update widget routes for SSE streaming
- [ ] Update socket handlers for streaming
- [ ] Channel abstraction (WebChannel, SMSChannel)

### Phase 4: Production Hardening (5-7 days)
- [ ] Database migrations (ConversationState, AIUsage)
- [ ] Structured logging
- [ ] Usage tracking and billing
- [ ] Error recovery and rate limiting
- [ ] Load testing

---

## Database Additions Needed

```prisma
model ConversationState {
  id              String   @id @default(cuid())
  conversationId  String   @unique
  currentOrderItems Json?
  bookingDraft    Json?
  lastActivity    DateTime @default(now())
  customData      Json?

  conversation    Conversation @relation(...)
}

model AIUsage {
  id              String   @id @default(cuid())
  businessId      String
  conversationId  String?
  model           String
  inputTokens     Int
  outputTokens    Int
  toolCalls       Int      @default(0)
  cost            Float?
  createdAt       DateTime @default(now())
}
```

---

## Tool Definitions (Already Implemented)

Current tools in conversation.ts:
- `check_availability` - Check booking slots
- `create_booking` - Create reservation
- `get_menu` - Get menu items
- `add_to_order` - Add to current order
- `confirm_order` - Submit order
- `get_business_info` - Business info/hours
- `handoff_to_human` - Transfer to staff

---

## API Contracts

### REST Streaming (New)
```
POST /widget/conversations/:id/messages/stream
Content-Type: text/event-stream

data: {"type": "chunk", "content": "Hello"}
data: {"type": "chunk", "content": " there!"}
data: {"type": "action", "action": {...}}
data: {"type": "done"}
```

### WebSocket Events
```
Client -> Server:
- send_message { content: string }
- typing_start
- typing_stop

Server -> Client:
- response_chunk { chunk, conversationId }
- response_complete { content, actions, handedOff }
- typing { isTyping, isHuman }
- action_performed { type, data }
- human_joined { agentName }
```

---

## Key Files to Modify

1. **`backend/src/services/conversation.ts`** - Refactor to use new AIEngine
2. **`backend/src/services/socket.ts`** - Add streaming, channel abstraction
3. **`backend/src/routes/widget.ts`** - Add streaming endpoint
4. **`backend/prisma/schema.prisma`** - Add ConversationState, AIUsage
5. **`widget/src/widget.js`** - Handle streaming responses

---

## Priority Order

1. **High**: Ensure existing conversation.ts works reliably
2. **High**: Add streaming for better UX
3. **Medium**: Refactor into modular architecture
4. **Medium**: Add comprehensive action validation
5. **Low**: Multi-channel abstraction
6. **Low**: Advanced observability

---

Last Updated: 2025-11-29
