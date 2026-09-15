# MASSAF - U.S. Massage Therapist Booking Platform

MASSAF is a U.S.-based massage therapist booking platform controlled by one company. It allows customers to discover local therapists, schedule studio or in-home appointments, manage bookings, and leave reviews.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database:** [Turso](https://turso.tech/) / [libSQL](https://github.com/tursodatabase/libsql)
- **ORM:** [Prisma](https://www.prisma.io/) with `@prisma/adapter-libsql`
- **Validation:** [Zod](https://zod.dev/)
- **Hosting Target:** [Netlify](https://www.netlify.com/) (Eventual production target)

---

## Getting Started

### 1. Prerequisites

Ensure you have Node.js (v20+) and npm installed on your machine.

### 2. Environment Setup

Copy `.env.example` to create your local environment configuration:

```bash
cp .env.example .env
```

For local development fallback using SQLite:
```env
TURSO_DATABASE_URL="file:./dev.db"
TURSO_AUTH_TOKEN=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

For connecting to a remote Turso database:
```env
TURSO_DATABASE_URL="libsql://your-database-name-your-org.turso.io"
TURSO_AUTH_TOKEN="your-turso-auth-token"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Prisma Setup and Generation

To validate the schema and generate the Prisma client:

```bash
npx prisma validate
npx prisma generate
```

To sync local SQLite or Turso schema:

```bash
npx prisma db push
```

### 5. Running the Application

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Architectural Notes

### Database Access Layer
Database access is handled through `src/lib/db.ts`, which instantiates `@prisma/adapter-libsql` and `@libsql/client`.

### Payment Integration Note
Payment integration (such as cryptocurrency or other payment methods) is **intentionally NOT implemented in Phase 1**. The `Booking` model contains provider-agnostic fields (`amount`, `paymentStatus`, `paymentMethod`, `paymentReference`) to support flexible payment providers in future phases without vendor lock-in.

### Folder Structure
- `src/app/(customer)/`: Customer-facing routes and layouts.
- `src/app/admin/`: Platform administrative interface routes.
- `src/app/api/`: Server API routes.
- `src/lib/`: Shared utilities, database access layer, and Zod validation schemas.
- `src/types/`: Domain TypeScript type definitions.
