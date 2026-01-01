# Changelog

All notable changes to Handled AI SaaS will be documented in this file.

## [0.4.0] - 2026-01-01

### Added
- **SMS Conversations** - Full AI-powered conversations over SMS via Twilio
  - Inbound SMS webhook handler routes messages to AI
  - Each business can have dedicated Twilio phone number
  - Automatic markdown stripping for SMS responses
  - Response truncation for SMS character limits
- **SMS Dashboard View** - Manage SMS conversations from dashboard
  - Channel tabs (All/Web/SMS) with conversation counts
  - SMS icon badges on conversation list items
  - SMS reply functionality with character counter
  - Green color scheme distinguishes SMS from web chat
- Business `twilioPhoneNumber` field for per-business SMS numbers
- SMS booking and order confirmations use business-specific number
- Analytics tracking for SMS conversations

### Changed
- Widget typing indicator now shows business name ("Mario's Italian Kitchen is typing")
- Widget message grouping for consecutive same-sender messages
- Widget image support with logo in header
- Booking/order confirmation SMS use business's Twilio number when available

## [0.3.0] - 2025-12-30

### Added
- Port configuration updated to Slot 03 (Dashboard: 3003, API: 3103, Grafana: 3303, DB: 5403)
- CLAUDE.md with port documentation and access URLs
- vite.config.ts with strictPort and dev.ecoworks.ca host support
- .env.ports file for project port allocation

### Changed
- docker-compose.yml updated with Slot 03 ports
- Dockerfile updated to use port 3103
- Test pages updated with correct API keys and ports

## [0.2.0] - 2025-12-23

### Added
- Widget markdown rendering (bold, italic, lists, line breaks)
- Contextual quick reply buttons based on AI response
- "Talk to AI assistant" return flow when handed off to human
- "Start new conversation" button to reset chat
- BACKLOG.md for tracking widget improvements
- Comprehensive CLAUDE.md project documentation

### Fixed
- serviceId validation in booking creation (prevents FK constraint errors)
- Quick reply logic to show correct options after booking confirmation
- Handoff flow allows users to return to AI assistant

## [0.1.0] - 2025-12-22

### Added
- Mobile widget config settings in Business model
- URL-based navigation for settings tabs
- Widget preview in dashboard
- Clerk authentication integration
- Advanced settings panel

### Changed
- Migrated dashboard auth to Clerk with super admin detection
