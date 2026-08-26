# ShopSphere — E-Commerce Platform

A production-ready e-commerce platform built with **Node.js · Express · EJS · MongoDB**, following MVC architecture with a dedicated service layer.

> Status: **Production-ready** — all 12 roadmap phases complete.

[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-184%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-~87%25%20statements-yellow)

## Features

**Implemented**

- Express application shell with MVC + service-layer architecture
- Centralized configuration via environment variables (fail-fast in production)
- Winston logging (console + rotating JSON files)
- Centralized error handling with standardized `{ success, data, message }` envelopes
- Security baseline: Helmet (with CSP), CORS, global rate limiting, cookie parsing
- **Authentication**: register / login / logout / forgot & reset password (bcrypt, JWT cookies, RBAC, anti-enumeration, rate limits)
- **Product catalog API**: text search, filters, discount-aware sorting, pagination, suggestions, related products, admin CRUD with integrity guards
- **Storefront frontend**
  - Home page wired to live data: hero, category chips, featured & latest product grids
  - `/products` catalog: filter sidebar (category/brand/price/rating/in-stock), sort dropdown, responsive card grid, windowed pagination preserving filters, empty states
  - `/products/:slug` detail: image gallery, quantity stepper, discount badges, stock indicators, specifications table, related products, breadcrumbs
  - Reusable partials: `product-card`, `pagination`, `star-rating`
  - Navbar search with debounced live suggestion dropdown
  - Graceful degraded mode: storefront renders with empty sections when MongoDB is unreachable
- **Shopping**
  - Cart API with stock guards (`Only N unit(s) left`), quantity clamping and per-user isolation
  - Prices always recomputed from live product data — client-sent prices are stripped and ignored
  - Wishlist with idempotent adds and a transactional move-to-cart (cart first; on failure the product stays wishlisted)
  - Server-rendered navbar badge counts + live badge updates after mutations
  - `/cart` page: quantity steppers, line totals, summary card, empty state
  - `/wishlist` page: product cards with move-to-cart / remove actions
- **Checkout**
  - Coupon engine: percentage/fixed discounts, minimum-order floors, max-discount caps, expiry and usage limits enforced with **atomic consumption** (`$inc` inside the update filter — races cannot over-consume)
  - Payment gateway abstraction: COD adapter + simulated card gateway (decline paths deterministic); real providers (Stripe...) plug into the same interface. Card data is validated in memory and never stored
  - Order pipeline with server-side recomputation of every amount, then **atomic per-line stock decrement** (`stock >= qty` filter) and full compensating rollback (stock restored, coupon released) on any failure
  - Orders carry immutable line snapshots + status history
  - Shipping rules: flat rate, free above configurable threshold (post-discount)
  - `/checkout` 3-step wizard (address → payment → review) with saved-address support, live coupon validation and order confirmation page
  - Customer cancellation with automatic restock (pre-shipment only)
  - Ownership enforced with 404s (no existence leakage)
- **Order lifecycle**
  - Admin-driven state machine: `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`, cancellation only pre-shipment; illegal transitions return the allowed list
  - Tracking numbers on shipment (explicit or auto-generated `TRK-…`)
  - Cancellations restock items; PAID orders are marked REFUNDED
  - Lifecycle emails on placed / confirmed / shipped / delivered / cancelled (console transport without SMTP)
  - Visual progress timeline + tracking block on the order page
  - `/admin/orders` console: status filter chips, per-row legal-transition dropdowns, tracking input
- **Reviews**
  - Verified-purchase enforcement (any non-cancelled order qualifies)
  - One review per user per product (compound unique index + race-safe 409s)
  - Moderation workflow: new reviews start unapproved, admins approve/reject via `/api/admin/reviews*`
  - Editing a review sends it back to moderation; owner or admin can delete
  - Denormalized `rating`/`reviewCount` recomputed from APPROVED reviews after every mutation
  - Product page: average + list of published reviews, per-visitor eligibility messaging, accessible star input, inline edit/delete for your own review
- **Admin dashboard & management** (`/admin`, dedicated sidebar layout)
  - KPI cards: customers, revenue (paid card orders + delivered COD), pending orders, low-stock alerts
  - Charts (Chart.js): revenue & orders per month (6-month series), sales by category doughnut
  - Top products by units sold and low-stock table
  - Products: search, create/edit form, active/featured toggles, delete
  - Categories & Brands managers: create, inline rename, activate, referential-safe delete
  - Inventory console: low-stock/out-of-stock queues with quick stock adjustments
  - Orders lifecycle console (status transitions + tracking)
  - Coupons manager: create/list/delete
  - Review moderation queue: approve / unpublish / delete
  - Users manager: search, activate/deactivate (clears their cart), promote/demote — self-changes blocked
  - Store settings: shipping flat rate / free threshold / low-stock level editable in admin, instantly driving checkout & dashboards
- **Advanced features**
  - Image uploads: `POST /api/uploads/image` (admin) with mimetype+extension whitelists (JPEG/PNG/WEBP), 2 MB cap, random filenames on local disk — Cloudinary/S3 can slot behind the same service
  - Profile page (`/profile`): personal info, change password (current-password verified), address book with default promotion logic
  - Newsletter: public subscribe endpoint (anti-enumeration), wired footer & home forms, admin subscriber list endpoint
  - Smarter recommendations: related products cascade same-category → same-brand → popular
- Database seeder (`npm run seed`): demo accounts, 6 categories, 6 brands, 24 products + generated SVG images
- Server-rendered responsive UI (Bootstrap 5) · `GET /health` liveness endpoint · Docker Compose

**Planned** (Phases 5–12): cart & wishlist, checkout with coupons and payment gateways, orders with lifecycle tracking, reviews, admin dashboard UI, email templates, uploads, CI/CD.

## Technologies

| Layer | Stack |
|---|---|
| Backend | Node.js, Express.js |
| Views | EJS, Bootstrap 5, vanilla ES6+ |
| Database | MongoDB, Mongoose |
| Auth (planned) | JWT (HTTP-only cookies), bcrypt |
| Testing | Jest, Supertest (184 tests, in-memory MongoDB) |
| Quality | ESLint · GitHub Actions CI (lint → tests → docker build + health smoke) |
| DevOps | Docker, Docker Compose |

## Getting started

### Prerequisites
- Node.js ≥ 20
- MongoDB running locally **or** Docker

### Local setup

```bash
npm install
cp .env.example .env        # then edit values as needed
npm run dev                 # development (nodemon)
```

Visit http://localhost:3000 — health check at http://localhost:3000/health.

### Docker

```bash
docker compose up --build
```

Starts the app on port 3000 and MongoDB with a persistent volume.

## Environment variables

See [.env.example](.env.example) for every variable with documentation. Secrets are never committed; `.env` is gitignored.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Run in production mode |
| `npm run dev` | Run with hot reload |
| `npm test` | Run Jest test suite |
| `npm run test:coverage` | Tests + coverage report |
| `npm run lint` | ESLint |
| `npm run seed` | Seed demo data (`-- --fresh` to reset) |

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR to `main`/`develop`:

1. **Lint** (ESLint)
2. **Tests** on Node 20 & 22 (in-memory MongoDB binary is cached between runs)
3. **Docker build** + container smoke test against `/health`

## Security notes

- Passwords hashed with bcrypt (cost 12); JWT in HttpOnly SameSite cookies; roles re-read from DB per request
- All prices/totals recomputed server-side; client payloads stripped via Joi
- Atomic stock decrements prevent overselling; failed checkouts roll back stock + coupon usage
- Helmet CSP, rate limiting (global + login-specific), Origin/Referer CSRF guard
- No card data ever stored; upload whitelists enforced by type and size
- Production mode hides stack traces and requires strong secrets at boot

## Project structure

```
src/
├── config/       environment, database connection, logger
├── controllers/  thin HTTP handlers
├── middlewares/  auth, admin, validation, upload, error handling
├── models/       Mongoose schemas
├── routes/       page routes + REST API (/api/*)
├── services/     business logic layer
├── validators/   Joi schemas
├── utils/        helpers (response envelope, errors, jwt...)
├── views/        EJS layouts, partials and pages
├── public/       css, js, images, uploads
└── app.js        Express application
tests/            unit + integration tests
```

## Roadmap

1. ✅ Foundation (Express, config, logging, errors, Docker)
2. ✅ Authentication (register/login/logout, JWT, RBAC, password reset)
3. ✅ Product catalog API (search, filters, sorting, pagination, seeder)
4. ✅ Storefront frontend (home, catalog page, product details, search UX)
5. ✅ Shopping (cart, wishlist, stock validation, badges)
6. ✅ Checkout (coupons, payment gateway architecture, atomic orders)
7. ✅ Orders & lifecycle (state machine, tracking, timeline, emails)
8. ✅ Reviews (verified purchases, moderation, rating aggregation)
9. ✅ Admin dashboard (analytics, charts, full management UI)
10. ✅ Advanced features (uploads, profile, newsletter, settings)
11. ✅ Test hardening (security suite, coverage ~87%, ESLint)
12. ✅ DevOps (GitHub Actions CI, Docker hardening)

## Final quality checklist

- [x] Authentication & authorization (RBAC) — tested
- [x] Product CRUD, categories, brands — tested
- [x] Search, filters, sorting, pagination — tested
- [x] Cart & wishlist with stock guards — tested
- [x] Checkout with coupons & gateway architecture — tested
- [x] Orders lifecycle with atomic stock — tested
- [x] Reviews with verified purchases & moderation — tested
- [x] Admin dashboard & management modules — tested
- [x] Inventory alerts & settings-driven rules — tested
- [x] Emails (console transport w/o SMTP) — tested via capture
- [x] Image uploads with validation — tested
- [x] Responsive UI (320px → 1920px)
- [x] Security suite (headers, XSS escaping, injection, mass assignment)
- [x] 184 tests passing · ESLint clean · Docker health-checked
- [x] No secrets committed (.env gitignored; .env.example documents all vars)
4. Storefront frontend polish
5. Shopping cart & wishlist
6. Checkout (addresses, coupons, payment gateway architecture)
7. Orders & lifecycle tracking
8. Reviews with verified purchases
9. Admin dashboard
10. Email, recommendations, uploads, analytics
11. Full test suite
12. CI/CD & production hardening

## License

MIT
