# Admin Panel Design Reference

## Primary Inspiration: Stripe Dashboard

Reference: Stripe Billing Overview (dashboard.stripe.com)

### Key Design Elements to Emulate

**Layout:**
- Clean left sidebar navigation with collapsible sections
- Icon + text for nav items
- "Shortcuts" section for quick access
- Grouped product sections (Products, Reporting, More)

**Visual Style:**
- Minimal, lots of whitespace
- Card-based content areas with subtle shadows
- Orange/amber accent color for test mode indicator
- Muted grays for secondary text

**Navigation Structure:**
```
- Home
- Balances
- Transactions
- Customers
- Product catalog

Shortcuts:
- Billing overview

Products:
- Payments (expandable)
- Billing (expandable)
  - Overview
  - Subscriptions
  - Invoices
  - Usage-based
  - Revenue recovery
- Reporting (expandable)
- More (expandable)
```

**Content Cards:**
- Feature cards with illustrations
- Clear CTAs ("Watch video", "Create a subscription")
- Badges for quick info ("Set up in 1 minute", "No code")

**Header:**
- Search bar (centered or prominent)
- Test mode toggle
- Icon buttons for settings, help, notifications

### Apply To Our Dashboard

- `/dashboard/` - React admin panel
- Use similar sidebar structure
- Card-based overview pages
- Clean typography with hierarchy
