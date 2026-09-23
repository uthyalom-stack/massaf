import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function sanitizeEnvValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const cleaned = val.trim().replace(/^["\x27]|["\x27]$/g, '');
  return cleaned || undefined;
}

function getSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Custom deployment migration script for Turso / libSQL database deployments.
 * Executes pending SQL migrations directly against Turso using @libsql/client
 * while preserving Prisma's exact _prisma_migrations history table structure and checksums.
 */
async function deployTursoMigrations() {
  console.log('[deploy-turso-migrations] Starting database migration check...');

  const tursoUrl = sanitizeEnvValue(process.env.TURSO_DATABASE_URL);
  const authToken = sanitizeEnvValue(process.env.TURSO_AUTH_TOKEN);

  let url = tursoUrl || 'file:./prisma/dev.db';

  if ((url.startsWith('libsql://') || url.startsWith('https://')) && !authToken) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[deploy-turso-migrations] TURSO_DATABASE_URL is remote but TURSO_AUTH_TOKEN is missing. Falling back to local file:./prisma/dev.db');
      url = 'file:./prisma/dev.db';
    }
  }

  if (url === 'file:./dev.db' || url === 'file:./prisma/dev.db') {
    url = `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
  }

  const client = createClient({
    url,
    authToken,
  });

  try {
    // 1. Ensure _prisma_migrations table exists
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      );
    `);

    // 2. Fetch applied migration names from _prisma_migrations
    const appliedResult = await client.execute(`
      SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL AND "finished_at" IS NOT NULL
    `);

    const appliedSet = new Set<string>();
    for (const row of appliedResult.rows) {
      if (typeof row.migration_name === 'string') {
        appliedSet.add(row.migration_name);
      }
    }

    // 3. Read local migration directories from prisma/migrations
    const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[deploy-turso-migrations] No migrations directory found. Skipping.');
      return;
    }

    const dirEntries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const pendingMigrations: Array<{ dirName: string; sqlPath: string; sqlContent: string }> = [];

    for (const entry of dirEntries) {
      if (entry.isDirectory()) {
        const sqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
        if (fs.existsSync(sqlPath) && !appliedSet.has(entry.name)) {
          const sqlContent = fs.readFileSync(sqlPath, 'utf8');
          pendingMigrations.push({
            dirName: entry.name,
            sqlPath,
            sqlContent,
          });
        }
      }
    }

    // Sort pending migrations chronologically by folder name timestamp
    pendingMigrations.sort((a, b) => a.dirName.localeCompare(b.dirName));

    if (pendingMigrations.length === 0) {
      console.log('[deploy-turso-migrations] No pending migrations. Database schema is up to date!');
      return;
    }

    console.log(`[deploy-turso-migrations] Found ${pendingMigrations.length} pending migration(s) to apply.`);

    // 4. Apply each pending migration sequentially
    for (const mig of pendingMigrations) {
      console.log(`[deploy-turso-migrations] Applying migration: ${mig.dirName}...`);
      const migrationId = crypto.randomUUID();
      const checksum = getSha256(mig.sqlContent);
      const startedAt = new Date().toISOString();

      // Insert migration record with started status
      await client.execute({
        sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, 0)`,
        args: [migrationId, checksum, mig.dirName, startedAt],
      });

      // Split SQL content into statements and execute each statement
      // SQLite/libSQL migration statements are separated by semicolons
      const statements = mig.sqlContent
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      let stepCount = 0;
      for (const statement of statements) {
        await client.execute(statement);
        stepCount++;
      }

      const finishedAt = new Date().toISOString();

      // Update migration record to finished
      await client.execute({
        sql: `UPDATE "_prisma_migrations" SET "finished_at" = ?, "applied_steps_count" = ? WHERE "id" = ?`,
        args: [finishedAt, stepCount, migrationId],
      });

      console.log(`[deploy-turso-migrations] Successfully applied migration: ${mig.dirName}`);
    }

    console.log('[deploy-turso-migrations] All pending migrations successfully applied!');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[deploy-turso-migrations] FATAL: Migration deployment failed:', errorMsg);
    process.exit(1);
  } finally {
    client.close();
  }
}

deployTursoMigrations();
