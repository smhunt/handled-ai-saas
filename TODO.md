# Handled AI SaaS - Development TODO

## Priority: High (Must Fix)

### Backend API Fixes
- [x] Fix API response wrapping (service, faq, location, category, item)
- [ ] Fix service price defaulting to null instead of 0
- [ ] Fix location zipCode vs postalCode field name mismatch in frontend

### Integration Tests
- [ ] Fix test interdependency issues (tests cascade fail)
- [ ] Ensure all 33 tests pass

## Priority: High (Missing Features)

### Super Admin Panel
- [x] Create admin API routes (`/api/admin/*`)
  - [x] List all users
  - [x] List all businesses
  - [x] View platform analytics
  - [ ] Manage subscriptions
  - [ ] Disable/enable businesses
- [x] Create admin dashboard UI at `/admin`
- [x] Add SUPER_ADMIN role check middleware

## Priority: Medium (Non-functional Buttons)

### Dashboard - Settings Page
- [x] "Save Changes" button in Business tab
- [x] "Save Widget Settings" button
- [x] "Save AI Settings" button
- [ ] "Upgrade Plan" button (Stripe integration needed)
- [ ] "Billing History" button (Stripe integration needed)
- [ ] Edit (Pencil) button for services - no edit modal

### Dashboard - Other Pages
- [ ] Conversations page - search/filter not functional
- [ ] Bookings page - filter buttons
- [ ] Orders page - filter/search
- [ ] Analytics page - date range picker

## Priority: Medium (Missing Features)

### Stripe Integration
- [ ] Complete subscription checkout flow
- [ ] Webhook handling for subscription events
- [ ] Usage metering and limits

### Widget
- [ ] Complete embed.js script
- [ ] Chat functionality with AI
- [ ] Booking/ordering integration

### Notifications
- [ ] Email notification service (nodemailer setup)
- [ ] SMS notifications (Twilio integration)
- [ ] In-app notifications

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

---
Last Updated: 2025-11-29
