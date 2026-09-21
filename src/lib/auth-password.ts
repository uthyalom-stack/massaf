import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Hashes a plaintext password using Node.js scrypt with a unique random salt.
 * Returns formatted string: `<salt_hex>:<hash_hex>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored `<salt_hex>:<hash_hex>` password hash
 * using timing-safe string comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) {
    return false;
  }

  const hashToTest = scryptSync(password, salt, 64);
  const originalHashBuffer = Buffer.from(originalHash, 'hex');

  if (hashToTest.length !== originalHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashToTest, originalHashBuffer);
}
