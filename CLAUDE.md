# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Handled AI is a multi-tenant SaaS platform providing AI-powered booking and order management for service businesses. The AI (Claude) handles customer conversations via an embeddable widget, taking bookings, processing orders, and answering FAQs.

## Tech Stack

- **Backend**: Express + TypeScript + Prisma ORM + PostgreSQL + Socket.io
- **Dashboard**: React 19 + Vite + TanStack Query + Tailwind CSS + shadcn/ui
- **Widget**: Vanilla JavaScript (zero dependencies, embeddable)
- **Auth**: Clerk (JWT verification)
- **AI**: Anthropic Claude API with tool use for bookings/orders
- **Payments**: Stripe

## Project Structure

```
├── backend/           # Express API server
│   ├── src/
│   │   ├── routes/    # API endpoints (auth, business, bookings, orders, widget, etc.)
│   │   ├── services/  # Core services (conversation.ts is the AI brain)
│   │   └── middleware/# Auth (Clerk JWT), error handling, rate limiting
│   └── prisma/        # Database schema and migrations
├── dashboard/         # React admin dashboard (single App.tsx file)
│   └── src/
│       └── components/ui/  # shadcn/ui components
├── widget/            # Embeddable chat widget
│   └── src/widget.js  # Self-contained IIFE, zero dependencies
└── .claude/design-refs/   # UI design references (Stripe-inspired)
```

## Ports (Slot 03)

| Service | Port | Formula |
|---------|------|---------|
| Dashboard | 3003 | 30XX |
| Backend API | 3103 | 31XX |
| Grafana | 3303 | 33XX |
| Database | 5403 | 54XX |

See `~/.claude/PORTS.md` for full registry and `.env.ports` for this project's allocation.

## Access URLs

- **Dashboard:** https://handled.dev.ecoworks.ca (port 3003)
- **API:** https://api.handled.dev.ecoworks.ca (port 3103)

## Commands

```bash
# Root level (monorepo)
pnpm install              # Install all dependencies
pnpm dev                  # Start all dev servers
pnpm build                # Build all packages
pnpm test                 # Run tests

# Backend specific
cd backend
pnpm dev                  # Start API server (tsx watch)
pnpm test                 # Run vitest
pnpm test:watch           # Watch mode tests
npx prisma generate       # Generate Prisma client
npx prisma migrate dev    # Run migrations
npx prisma studio         # Visual DB editor
pnpm db:seed              # Seed database (tsx prisma/seed.ts)
pnpm db:reset             # Reset DB completely

# Dashboard specific
cd dashboard
pnpm dev                  # Start Vite dev server
pnpm build                # TypeScript check + Vite build
pnpm lint                 # ESLint
```

## Architecture

### AI Conversation Flow (`backend/src/services/conversation.ts`)

The `ConversationService` class is the AI brain:
1. Builds a dynamic system prompt from business data (menu, services, hours, FAQs)
2. Uses Claude with tool definitions for: `check_availability`, `create_booking`, `get_menu`, `add_to_order`, `confirm_order`, `get_business_info`, `handoff_to_human`
3. Executes tool calls and loops until Claude returns text
4. Persists all messages to the database

### Multi-Tenant Data Model

- `Business` is the central entity (multi-location support via `Location`)
- `BusinessUser` links users to businesses with roles (OWNER, ADMIN, STAFF)
- Every data entity (bookings, orders, conversations) belongs to a `businessId`
- API keys (`ApiKey` model) authenticate widget requests per-business

### Authentication

- Dashboard uses Clerk React SDK
- Backend verifies Clerk JWTs via `@clerk/backend` in `middleware/auth.ts`
- Widget uses API key auth (X-API-Key header) via `routes/widget.ts`

### Real-time

- Socket.io server in `backend/src/services/socket.ts`
- Dashboard connects for live conversation updates
- Widget currently uses HTTP polling (WebSocket optional)

## Key Files

- `backend/src/services/conversation.ts` - AI conversation logic with tool use
- `backend/src/routes/widget.ts` - Public widget API endpoints
- `backend/prisma/schema.prisma` - Complete data model
- `dashboard/src/App.tsx` - Entire dashboard in one file (large, ~2000 lines)
- `widget/src/widget.js` - Self-contained embeddable widget

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. Required:
- `DATABASE_URL` - PostgreSQL connection string
- `CLERK_SECRET_KEY` - Clerk backend secret
- `ANTHROPIC_API_KEY` - For AI conversations

Optional: Stripe, Twilio, SMTP for full features.

## Multi-Session Work

When multiple Claude sessions work simultaneously, use Git worktrees:

```bash
git worktree add ../handled-ai-saas-$(openssl rand -hex 3) -b worktree/session-$(date +%s)
cd ../handled-ai-saas-*
pnpm install && npx prisma generate
```

Cleanup: `git worktree remove <path>`

## Design References

Check `.claude/design-refs/admin-panel.md` for Stripe-inspired dashboard design patterns. Use card-based layouts, minimal whitespace, and orange (#f97316) accent colors.
