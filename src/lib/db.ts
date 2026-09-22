import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

import path from 'path';

function sanitizeEnvValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const cleaned = val.trim().replace(/^["\x27]|["\x27]$/g, '');
  return cleaned || undefined;
}

function createPrismaClient(): PrismaClient {
  let url = sanitizeEnvValue(process.env.TURSO_DATABASE_URL) || 'file:./prisma/dev.db';
  let authToken = sanitizeEnvValue(process.env.TURSO_AUTH_TOKEN);

  // If URL is remote (libsql:// or https://) but auth token is missing/empty, fall back to dev.db in dev/build environments
  if ((url.startsWith('libsql://') || url.startsWith('https://')) && !authToken) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[db.ts] TURSO_DATABASE_URL is remote but TURSO_AUTH_TOKEN is missing or empty. Falling back to local file:./prisma/dev.db');
      url = 'file:./prisma/dev.db';
    }
  }

  if (url === 'file:./dev.db' || url === 'file:./prisma/dev.db') {
    url = `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
  }

  const adapter = new PrismaLibSQL({
    url,
    authToken,
  });

  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
