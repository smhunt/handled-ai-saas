# Handled AI SaaS - Development TODO

## Priority: High (Must Fix)

### Backend API Fixes
- [x] Fix API response wrapping (service, faq, location, category, item)
- [x] Fix service price defaulting to null instead of 0
- [x] Fix location zipCode vs postalCode field name mismatch in frontend

### Integration Tests
- [x] Fix test interdependency issues (tests cascade fail)
- [x] Ensure all 33 tests pass

## Priority: High (Missing Features)

### Super Admin Panel
- [x] Create admin API routes (`/api/admin/*`)
  - [x] List all users
  - [x] List all businesses
  - [x] View platform analytics
  - [x] Manage subscriptions
  - [x] Disable/enable businesses
- [x] Create admin dashboard UI at `/admin`
- [x] Add SUPER_ADMIN role check middleware

## Priority: Medium (Non-functional Buttons)

### Dashboard - Settings Page
- [x] "Save Changes" button in Business tab
- [x] "Save Widget Settings" button
- [x] "Save AI Settings" button
- [x] "Upgrade Plan" button (Stripe integration complete)
- [x] "Billing History" button (Stripe integration complete)
- [x] Edit (Pencil) button for services - edit modal added

### Dashboard - Other Pages
- [x] Conversations page - search/filter functional
- [x] Bookings page - filter buttons (status, date, search)
- [x] Orders page - filter/search (already implemented)
- [x] Analytics page - date range picker

## Priority: Medium (Missing Features)

### Stripe Integration
- [x] Complete subscription checkout flow
- [x] Webhook handling for subscription events
- [x] Usage metering and limits (middleware + dashboard display)

### Widget
- [x] Complete embed.js script (with configurable API URL)
- [x] Chat functionality with AI (Claude-powered)
- [x] Booking/ordering integration (AI tool calling)

### Notifications
- [x] Email notification service (nodemailer setup)
- [x] SMS notifications (Twilio integration)
- [x] Webhook notifications
- [ ] In-app notifications (requires WebSocket)

## Priority: Low (Nice to Have)

### Dashboard Improvements
- [ ] Dark mode toggle
- [ ] Real-time updates via WebSocket
- [ ] Export data to CSV
- [ ] Bulk operations

### Landing Page
- [ ] Contact form submission
- [ ] Newsletter signup
- [ ] Demo video

## Completed

- [x] Initial project setup (backend, dashboard, landing, widget)
- [x] Authentication (signup, login, JWT)
- [x] Business creation and management
- [x] Services CRUD
- [x] Menu CRUD (categories + items)
- [x] FAQ CRUD
- [x] Locations CRUD
- [x] Team management
- [x] API key generation
- [x] Dashboard Settings UI for all management features
- [x] Fix landing page broken links
- [x] Git repo initialized and pushed to GitHub
- [x] Fix duplicate session token bug (nanoid jti)
- [x] Super admin panel API routes
- [x] Super admin dashboard UI
- [x] Settings Save buttons (Business, Widget, AI)
- [x] API response wrapping fixes
- [x] Stripe billing integration (routes, frontend buttons, webhooks)
- [x] All 33 API tests passing
- [x] Dashboard search/filter on Conversations, Bookings, Analytics pages
- [x] Orders page search/filter
- [x] Usage metering middleware + dashboard display
- [x] Widget embed.js script (configurable API URL)
- [x] AI chat with Claude tool calling
- [x] Email notifications (nodemailer)
- [x] SMS notifications (Twilio)
- [x] Webhook notifications

---
Last Updated: 2025-11-30
