import { createClient, Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function sanitizeEnvValue(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const cleaned = val.trim().replace(/^[\"\x27]|[\"\x27]$/g, '');
  return cleaned || undefined;
}

function getSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

type SchemaExpectations = {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
  indexes: Set<string>;
};

function parseSchemaExpectations(sql: string): SchemaExpectations {
  const tables = new Set<string>();
  const columns = new Map<string, Set<string>>();
  const indexes = new Set<string>();
  const renames = new Map<string, string>();

  const renameRegex = /ALTER\s+TABLE\s+\"([^\"]+)\"\s+RENAME\s+TO\s+\"([^\"]+)\"/gi;
  for (const match of sql.matchAll(renameRegex)) {
    renames.set(match[1], match[2]);
  }

  const createTableRegex =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+\"([^\"]+)\"\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(createTableRegex)) {
    const rawTableName = match[1];
    const tableName = renames.get(rawTableName) ?? rawTableName;
    tables.add(tableName);

    const tableColumns = columns.get(tableName) ?? new Set<string>();
    for (const line of match[2].split('\n')) {
      const columnMatch = line.match(/^\s*\"([^\"]+)\"\s+/);
      if (columnMatch) tableColumns.add(columnMatch[1]);
    }
    columns.set(tableName, tableColumns);
  }

  const addColumnRegex =
    /ALTER\s+TABLE\s+\"([^\"]+)\"\s+ADD\s+COLUMN\s+\"([^\"]+)\"/gi;
  for (const match of sql.matchAll(addColumnRegex)) {
    const tableName = renames.get(match[1]) ?? match[1];
    tables.add(tableName);
    const tableColumns = columns.get(tableName) ?? new Set<string>();
    tableColumns.add(match[2]);
    columns.set(tableName, tableColumns);
  }

  const createIndexRegex =
    /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+\"([^\"]+)\"/gi;
  for (const match of sql.matchAll(createIndexRegex)) {
    indexes.add(match[1]);
  }

  return { tables, columns, indexes };
}

async function inspectDatabaseSchema(client: Client): Promise<{
  tables: Set<string>;
  indexes: Set<string>;
  columns: Map<string, Set<string>>;
}> {
  const tablesResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const indexesResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
  );

  const tables = new Set<string>();
  for (const row of tablesResult.rows) {
    if (typeof row.name === 'string') tables.add(row.name);
  }

  const indexes = new Set<string>();
  for (const row of indexesResult.rows) {
    if (typeof row.name === 'string') indexes.add(row.name);
  }

  const columns = new Map<string, Set<string>>();
  for (const tableName of tables) {
    const escapedTableName = tableName.replace(/\"/g, '\"\"');
    const result = await client.execute(
      `PRAGMA table_info("${escapedTableName}")`
    );
    const tableColumns = new Set<string>();
    for (const row of result.rows) {
      if (typeof row.name === 'string') tableColumns.add(row.name);
    }
    columns.set(tableName, tableColumns);
  }

  return { tables, indexes, columns };
}

function getMissingSchemaObjects(
  expected: SchemaExpectations,
  actual: Awaited<ReturnType<typeof inspectDatabaseSchema>>
): string[] {
  const missing: string[] = [];

  for (const table of expected.tables) {
    if (!actual.tables.has(table)) missing.push(`table ${table}`);
  }

  for (const [table, expectedColumns] of expected.columns) {
    const actualColumns = actual.columns.get(table);
    if (!actualColumns) continue;
    for (const column of expectedColumns) {
      if (!actualColumns.has(column)) {
        missing.push(`column ${table}.${column}`);
      }
    }
  }

  for (const index of expected.indexes) {
    if (!actual.indexes.has(index)) missing.push(`index ${index}`);
  }

  return missing;
}

function countMigrationStatements(sql: string): number {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean).length;
}

async function deployTursoMigrations() {
  console.log('[deploy-turso-migrations] Starting database migration check...');

  const tursoUrl = sanitizeEnvValue(process.env.TURSO_DATABASE_URL);
  const authToken = sanitizeEnvValue(process.env.TURSO_AUTH_TOKEN);

  let url = tursoUrl || 'file:./prisma/dev.db';

  if ((url.startsWith('libsql://') || url.startsWith('https://')) && !authToken) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[deploy-turso-migrations] TURSO_DATABASE_URL is remote but TURSO_AUTH_TOKEN is missing. Falling back to local file:./prisma/dev.db'
      );
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
    const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[deploy-turso-migrations] No migrations directory found. Skipping.');
      return;
    }

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

    const historyResult = await client.execute(`
      SELECT "id", "checksum", "migration_name", "finished_at", "rolled_back_at", "applied_steps_count"
      FROM "_prisma_migrations"
      ORDER BY "started_at" ASC
    `);

    const history = new Map<
      string,
      {
        id: string;
        checksum: string;
        finishedAt: unknown;
        rolledBackAt: unknown;
        appliedStepsCount: unknown;
      }
    >();

    for (const row of historyResult.rows) {
      if (typeof row.migration_name === 'string') {
        history.set(row.migration_name, {
          id: String(row.id),
          checksum: String(row.checksum),
          finishedAt: row.finished_at,
          rolledBackAt: row.rolled_back_at,
          appliedStepsCount: row.applied_steps_count,
        });
      }
    }

    const dirEntries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const localMigrations: Array<{ dirName: string; sqlContent: string }> = [];

    for (const entry of dirEntries) {
      if (!entry.isDirectory()) continue;
      const sqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;

      localMigrations.push({
        dirName: entry.name,
        sqlContent: fs.readFileSync(sqlPath, 'utf8'),
      });
    }

    localMigrations.sort((a, b) => a.dirName.localeCompare(b.dirName));

    const actualSchema = await inspectDatabaseSchema(client);
    console.log(
      `[deploy-turso-migrations] Database inspection: ${actualSchema.tables.size} tables, ${actualSchema.indexes.size} named indexes, ${history.size} migration-history record(s).`
    );

    let newlyAppliedCount = 0;
    let markedExistingCount = 0;
    const pendingNames: string[] = [];

    for (const migration of localMigrations) {
      const checksum = getSha256(migration.sqlContent);
      const existingHistory = history.get(migration.dirName);

      if (existingHistory && existingHistory.rolledBackAt == null) {
        if (existingHistory.finishedAt == null) {
          throw new Error(
            `Migration '${migration.dirName}' has an unfinished _prisma_migrations record. Refusing to guess or re-run it.`
          );
        }

        if (existingHistory.checksum !== checksum) {
          throw new Error(
            `Migration '${migration.dirName}' is recorded as applied, but its checksum does not match the repository migration.sql. Refusing to modify migration history.`
          );
        }

        const missingFromAppliedMigration = getMissingSchemaObjects(
          parseSchemaExpectations(migration.sqlContent),
          actualSchema
        );
        if (missingFromAppliedMigration.length > 0) {
          throw new Error(
            `Migration '${migration.dirName}' is recorded as applied, but the database is missing schema objects: ${missingFromAppliedMigration.join(', ')}. Refusing to continue.`
          );
        }

        console.log(`[deploy-turso-migrations] Applied: ${migration.dirName}`);
        continue;
      }

      const expectedSchema = parseSchemaExpectations(migration.sqlContent);
      const missingObjects = getMissingSchemaObjects(expectedSchema, actualSchema);
      const expectedObjectCount =
        expectedSchema.tables.size +
        [...expectedSchema.columns.values()].reduce(
          (count, cols) => count + cols.size,
          0
        ) +
        expectedSchema.indexes.size;
      const presentObjectCount = expectedObjectCount - missingObjects.length;

      if (missingObjects.length === 0) {
        const migrationId = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const stepCount = countMigrationStatements(migration.sqlContent);

        console.log(
          `[deploy-turso-migrations] Schema already matches migration '${migration.dirName}'. Recording it as applied without executing SQL.`
        );

        await client.execute({
          sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            migrationId,
            checksum,
            migration.dirName,
            timestamp,
            timestamp,
            stepCount,
          ],
        });
        markedExistingCount++;
        continue;
      }

      if (presentObjectCount > 0) {
        throw new Error(
          `Migration '${migration.dirName}' is partially reflected in the database. Missing: ${missingObjects.join(', ')}. Refusing to execute the full migration because that could duplicate existing schema objects.`
        );
      }

      pendingNames.push(migration.dirName);
    }

    console.log(
      `[deploy-turso-migrations] Genuinely pending migration(s): ${pendingNames.length ? pendingNames.join(', ') : 'none'}`
    );

    for (const migration of localMigrations) {
      if (!pendingNames.includes(migration.dirName)) continue;

      const migrationId = crypto.randomUUID();
      const checksum = getSha256(migration.sqlContent);
      const startedAt = new Date().toISOString();
      const statements = migration.sqlContent
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);

      console.log(
        `[deploy-turso-migrations] Applying genuinely pending migration: ${migration.dirName}...`
      );

      await client.execute({
        sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, 0)`,
        args: [migrationId, checksum, migration.dirName, startedAt],
      });

      let stepCount = 0;
      for (const statement of statements) {
        await client.execute(statement);
        stepCount++;
      }

      await client.execute({
        sql: `UPDATE "_prisma_migrations" SET "finished_at" = ?, "applied_steps_count" = ? WHERE "id" = ?`,
        args: [new Date().toISOString(), stepCount, migrationId],
      });

      newlyAppliedCount++;
      console.log(
        `[deploy-turso-migrations] Successfully applied migration: ${migration.dirName}`
      );
    }

    if (newlyAppliedCount === 0 && markedExistingCount === 0) {
      console.log(
        '[deploy-turso-migrations] Database schema and migration history are already up to date.'
      );
    } else {
      console.log(
        `[deploy-turso-migrations] Migration deployment complete (${newlyAppliedCount} executed, ${markedExistingCount} existing schema states recorded).`
      );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      '[deploy-turso-migrations] FATAL: Migration deployment failed:',
      errorMsg
    );
    process.exit(1);
  } finally {
    client.close();
  }
}

deployTursoMigrations();
