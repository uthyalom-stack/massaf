import { createClient, Client } from '@libsql/client';
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

async function checkTableExists(client: Client, tableName: string): Promise<boolean> {
  try {
    const res = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [tableName],
    });
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

async function checkColumnExists(client: Client, tableName: string, columnName: string): Promise<boolean> {
  try {
    const res = await client.execute(`PRAGMA table_info("${tableName}")`);
    return res.rows.some((row) => String(row.name) === columnName);
  } catch {
    return false;
  }
}

/**
 * Custom deployment migration script for Turso / libSQL database deployments.
 * Inspects database schema state and executes pending SQL migrations directly against Turso
 * using @libsql/client while preserving Prisma's exact _prisma_migrations history table.
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
    const localMigrations: Array<{ dirName: string; sqlPath: string; sqlContent: string }> = [];

    for (const entry of dirEntries) {
      if (entry.isDirectory()) {
        const sqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
        if (fs.existsSync(sqlPath)) {
          const sqlContent = fs.readFileSync(sqlPath, 'utf8');
          localMigrations.push({
            dirName: entry.name,
            sqlPath,
            sqlContent,
          });
        }
      }
    }

    // Sort migrations chronologically
    localMigrations.sort((a, b) => a.dirName.localeCompare(b.dirName));

    // 4. Process each local migration: verify if applied in _prisma_migrations OR already present in schema
    let newlyAppliedCount = 0;
    let markedExistingCount = 0;

    for (const mig of localMigrations) {
      const isRecorded = appliedSet.has(mig.dirName);
      if (isRecorded) {
        continue; // Already recorded in _prisma_migrations
      }

      // Check if this migration's schema changes are already present in the runtime database
      let isSchemaAlreadyPresent = false;

      if (mig.dirName.includes('add_user_id_to_marketing_link')) {
        isSchemaAlreadyPresent = await checkTableExists(client, 'User');
      } else if (mig.dirName.includes('add_user_is_active')) {
        isSchemaAlreadyPresent = await checkColumnExists(client, 'User', 'isActive');
      } else if (mig.dirName.includes('add_homepage_selection_and_end_zip')) {
        isSchemaAlreadyPresent = await checkColumnExists(client, 'Therapist', 'isHomepageSelected');
      } else if (mig.dirName.includes('add_payment_methods_and_gift_cards')) {
        isSchemaAlreadyPresent = await checkTableExists(client, 'GiftCardSubmission');
      } else if (mig.dirName.includes('add_gift_card_images')) {
        isSchemaAlreadyPresent = await checkTableExists(client, 'GiftCardImage');
      } else if (mig.dirName.includes('add_us_zip_code_table')) {
        isSchemaAlreadyPresent = await checkTableExists(client, 'USZipCode');
      } else if (mig.dirName.includes('add_rotation_zip_eligibility_hourly_pricing')) {
        isSchemaAlreadyPresent = await checkColumnExists(client, 'Therapist', 'hourlyRate');
      }

      const migrationId = crypto.randomUUID();
      const checksum = getSha256(mig.sqlContent);
      const timestamp = new Date().toISOString();

      if (isSchemaAlreadyPresent) {
        // Schema is already present in DB but missing from _prisma_migrations record.
        // Mark as applied in _prisma_migrations without re-running duplicate DDL statements.
        console.log(`[deploy-turso-migrations] Schema for migration '${mig.dirName}' is already present in database. Marking as applied...`);
        await client.execute({
          sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, 1)`,
          args: [migrationId, checksum, mig.dirName, timestamp, timestamp],
        });
        markedExistingCount++;
      } else {
        // Migration schema is truly pending; execute SQL statements and record in _prisma_migrations
        console.log(`[deploy-turso-migrations] Executing pending migration: ${mig.dirName}...`);

        await client.execute({
          sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, 0)`,
          args: [migrationId, checksum, mig.dirName, timestamp],
        });

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
        await client.execute({
          sql: `UPDATE "_prisma_migrations" SET "finished_at" = ?, "applied_steps_count" = ? WHERE "id" = ?`,
          args: [finishedAt, stepCount, migrationId],
        });

        console.log(`[deploy-turso-migrations] Successfully applied migration: ${mig.dirName}`);
        newlyAppliedCount++;
      }
    }

    if (newlyAppliedCount === 0 && markedExistingCount === 0) {
      console.log('[deploy-turso-migrations] Database schema is up to date!');
    } else {
      console.log(`[deploy-turso-migrations] Migration deployment complete (${newlyAppliedCount} executed, ${markedExistingCount} existing recorded).`);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[deploy-turso-migrations] FATAL: Migration deployment failed:', errorMsg);
    process.exit(1);
  } finally {
    client.close();
  }
}

deployTursoMigrations();
