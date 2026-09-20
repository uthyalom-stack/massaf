# MASSAF — U.S. Massage Therapist Booking Platform

MASSAF is a U.S.-based massage therapist booking platform controlled by one company. It enables customers to discover local therapists, schedule studio or in-home appointments, process card/crypto-settled payments via PayLio, track marketing referrals, and manage administrative operations.

---

## Architecture & Core Systems

- **Framework:** [Next.js](https://nextjs.org/) (App Router, Turbopack, TypeScript)
- **Database & ORM:** [Turso](https://turso.tech/) / [libSQL](https://github.com/tursodatabase/libsql) with [Prisma](https://www.prisma.io/) (`@prisma/adapter-libsql`) & local SQLite fallback (`file:./dev.db`)
- **Payment Processing:** Server-authoritative PayLio hosted payment flow (card-funded USD payments with automated Polygon USDC settlements)
- **Media Storage:** Server-side Cloudflare R2 object storage via AWS SDK S3 client for device photo uploads in admin forms
- **Matching Engine:** Data-backed therapist matching algorithm (`/match-me`) using active therapist capabilities and availability schedules
- **Notifications:** Multi-channel operational alerts (Email & Telegram) for booking confirmations, cancellations, completions, expirations, and reminders
- **Scheduled Jobs:** Vercel Cron-compatible job route (`/api/cron/scheduled-jobs`) executing 30-minute unpaid booking holds and idempotent 24h / 3h appointment reminders
- **Administrative Control:** Complete therapist, booking, review moderation, marketing link, and system health management (`/admin`) guarded by server-side authorization keys

---

## Setup & Local Development

### 1. Prerequisites

- Node.js v20+ and npm
- Git

### 2. Environment Configuration

Copy `.env.example` to create your local `.env` file:

```bash
cp .env.example .env
```

For local development with SQLite (uses built-in mock mode when R2 keys are not set):
```env
TURSO_DATABASE_URL="file:./dev.db"
TURSO_AUTH_TOKEN=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
MASSAF_ADMIN_API_KEY="dev-admin-key"
CRON_SECRET="dev-cron-secret"
PAYLIO_MOCK_MODE="true"
TELEGRAM_MOCK_MODE="true"
RESEND_MOCK_MODE="true"
```

For production or staging with remote Turso and Cloudflare R2:
```env
TURSO_DATABASE_URL="libsql://your-database-name-your-org.turso.io"
TURSO_AUTH_TOKEN="your-turso-auth-token"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
MASSAF_ADMIN_API_KEY="your-production-admin-key"
CRON_SECRET="your-production-cron-secret"
R2_ACCOUNT_ID="your_cloudflare_account_id"
R2_ACCESS_KEY_ID="your_r2_access_key_id"
R2_SECRET_ACCESS_KEY="your_r2_secret_access_key"
R2_BUCKET_NAME="massaf"
R2_PUBLIC_URL="https://pub-your-r2-hash.r2.dev"
PAYLIO_API_KEY="your-paylio-api-key"
PAYLIO_API_URL="https://paylio.org/api/v1"
MASSAF_POLYGON_WALLET_ADDRESS="0xYourPolygonWalletAddress"
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
TELEGRAM_ADMIN_CHAT_ID="your-telegram-admin-chat-id"
RESEND_API_KEY="re_your_resend_key"
```

### 3. Cloudflare R2 Bucket Configuration

To enable live image uploads in production:
1. Log in to the Cloudflare Dashboard and navigate to **R2**.
2. Create a new bucket (e.g. `massaf`).
3. Under **Bucket Settings**, enable **R2.dev Subdomain** or configure a **Custom Domain** (e.g. `https://media.massaf.com`).
4. Generate an R2 API Token with **Object Read & Write** permissions scoped to the `massaf` bucket.
5. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_PUBLIC_URL` to server environment variables.
6. Open `/admin/therapists/new` or edit an existing therapist to select and upload profile/gallery images directly from mobile or desktop.

### 4. Install Dependencies & Initialize Database

```bash
npm install
npx prisma validate
npx prisma generate
TURSO_DATABASE_URL="file:./dev.db" npx prisma db push
```

### 5. Running Local Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Suite

Run the full quality and verification suite:

```bash
# 1. Type checking & Prisma validation
npm run lint
npx tsc --noEmit
npx prisma validate

# 2. Production build verification
npm run build

# 3. Cloudflare R2 media upload test suite
npm run test:r2

# 4. Automated concurrency test (Requires running local server)
npm run test:concurrency

# 5. Automated PayLio payment flow test suite (Requires running local server)
npm run test:paylio

# 6. Automated lifecycle and notification test suite
npx tsx scripts/test-phase15-notifications.ts
```

---

## Production & Deployment Requirements

### Vercel Cron Configuration Note
The application specifies a **15-minute cron schedule** (`*/15 * * * *`) in `vercel.json` to handle 30-minute unpaid booking expirations and appointment reminders:

```json
{
  "crons": [
    {
      "path": "/api/cron/scheduled-jobs",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

*Note on Vercel Hosting Plans:* Standard Vercel Hobby accounts limit cron execution frequency to once per day (`0 0 * * *`). To run 15-minute scheduled jobs in production on Vercel, a **Vercel Pro plan** is required. Alternatively, external scheduled job triggers (e.g. GitHub Actions, Cron-job.org) can invoke `POST https://your-domain.com/api/cron/scheduled-jobs` with header `Authorization: Bearer <CRON_SECRET>`.

### PayLio Gateway Configuration
In PayLio dashboard:
1. Set the callback URL to: `https://your-domain.com/api/payments/paylio/callback`
2. Configure settlement currency to **USDC** on **Polygon Network**.
3. Supply `PAYLIO_API_KEY` and `MASSAF_POLYGON_WALLET_ADDRESS` in server environment variables.

---

## Directory Overview

- `src/app/(customer)/` — Customer pages (therapist discovery, profiles, match wizard, checkout, confirmation)
- `src/app/admin/` — Administrative pages (therapists, bookings, review moderation, marketing links, system settings)
- `src/app/api/` — Server API routes (`/api/bookings`, `/api/payments/paylio/*`, `/api/cron/*`, `/api/admin/*`, `/api/match`)
- `src/lib/` — Core libraries (database client, PayLio client, R2 storage, notifications, matching engine, availability, validations)
- `scripts/` — Automated integration, R2 upload, and concurrency test suites
