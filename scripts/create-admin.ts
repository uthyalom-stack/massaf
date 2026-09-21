import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';
import { hashPassword } from '../src/lib/auth-password';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          stdout.write('\n');
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          process.exit(130);
        }

        if (char === '\r' || char === '\n') {
          stdout.write('\n');
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          resolve(value);
          return;
        }

        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        value += char;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is required.');
  }

  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is required.');
  }

  const email = (await promptHidden('Admin email: ')).trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('A valid admin email is required.');
  }

  const password = await promptHidden('Admin password: ');
  if (password.length < 8) {
    throw new Error('Admin password must be at least 8 characters.');
  }

  const db = createClient({ url, authToken });

  const existing = await db.execute({
    sql: 'SELECT id, role FROM User WHERE email = ? LIMIT 1',
    args: [email],
  });

  if (existing.rows.length > 0) {
    throw new Error(`A User already exists for ${email}. No changes were made.`);
  }

  const passwordHash = hashPassword(password);
  const id = randomUUID();

  await db.execute({
    sql: `
      INSERT INTO User (id, email, name, passwordHash, role, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    args: [id, email, null, passwordHash, 'SUPER_ADMIN'],
  });

  console.log(`Admin account created for ${email} with role SUPER_ADMIN.`);
  console.log('The password was never printed or stored in the repository.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
