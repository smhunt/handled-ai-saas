# Handled AI - Complete SaaS Platform

AI-powered booking and order management for service businesses. Never miss a booking again.

## Quick Start with Claude Code

```bash
# 1. Clone and enter directory
cd handled-ai

# 2. Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys (see below)

# 3. Start PostgreSQL (Docker or local)
docker run -d --name handled-db -e POSTGRES_PASSWORD=handled123 -e POSTGRES_DB=handled -p 5432:5432 postgres:16-alpine

# 4. Install and run backend
cd backend
pnpm install
npx prisma migrate dev --name init
npx prisma generate
pnpm dev

# 5. In new terminal - run dashboard
cd dashboard
pnpm install
pnpm dev

# 6. In new terminal - run landing page
cd landing
pnpm install
pnpm dev
```

## Required API Keys

Edit `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:handled123@localhost:5432/handled"
JWT_SECRET="generate-with-openssl-rand-base64-32"
ANTHROPIC_API_KEY="sk-ant-..."  # Required for AI chat

# Optional for full features:
STRIPE_SECRET_KEY="sk_test_..."
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
```

## Architecture

```
handled-ai/
├── backend/          # Express + Prisma + Socket.io API
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   ├── services/ # AI, notifications, billing
│   │   └── middleware/
│   └── prisma/       # Database schema
├── dashboard/        # React admin dashboard
├── landing/          # React marketing site
├── widget/           # Embeddable chat widget (vanilla JS)
├── nginx/            # Production reverse proxy
└── docker-compose.yml
```

## Key Features

- **AI Conversations**: Claude-powered chat handles bookings, orders, FAQs
- **Multi-tenant**: Each business gets isolated data
- **Real-time**: Socket.io for live chat updates
- **Widget**: Zero-dependency embeddable chat
- **Dashboard**: Full admin with analytics

## Ports

| Service | Port | URL |
|---------|------|-----|
| Backend API | 3001 | http://localhost:3001 |
| Dashboard | 5173 | http://localhost:5173 |
| Landing | 5174 | http://localhost:5174 |
| PostgreSQL | 5432 | - |

## Testing the AI Chat

1. Create account at http://localhost:5173
2. Note your API key in Settings
3. Test widget:

```html
<script src="http://localhost:3001/widget/widget.js" data-api-key="YOUR_KEY"></script>
```

## Docker Production

```bash
docker-compose up -d
```

## Database Commands

```bash
cd backend
npx prisma studio          # Visual DB editor
npx prisma migrate dev     # Run migrations
npx prisma db seed         # Seed data (if configured)
```

---
Built with Claude Code | EcoWorks Web Architecture Inc.
