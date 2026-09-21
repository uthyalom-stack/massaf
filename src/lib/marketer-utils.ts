import crypto from 'crypto';
import { db } from '@/lib/db';

/**
 * Safely normalizes a marketer's human name into a unique, predictable login ID format: `<normalized_name>@massaf.com`.
 * Handles duplicates automatically by appending incremental numeric suffixes (e.g. `john.doe2@massaf.com`).
 */
export async function generateLoginId(name: string): Promise<string> {
  const cleanName = name
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

  const baseName = cleanName.length >= 2 ? cleanName : 'marketer';
  const baseEmail = `${baseName}@massaf.com`;

  const existingBase = await db.user.findUnique({
    where: { email: baseEmail },
  });

  if (!existingBase) {
    return baseEmail;
  }

  let counter = 2;
  while (counter < 1000) {
    const candidateEmail = `${baseName}${counter}@massaf.com`;
    const existingCandidate = await db.user.findUnique({
      where: { email: candidateEmail },
    });
    if (!existingCandidate) {
      return candidateEmail;
    }
    counter++;
  }

  return `${baseName}.${Date.now().toString().slice(-4)}@massaf.com`;
}

/**
 * Generates a cryptographically secure random password including uppercase letters,
 * lowercase letters, digits, and special characters.
 */
export function generateSecurePassword(length = 12): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const allChars = uppers + lowers + digits + symbols;

  // Guarantee character variety
  const passwordChars: string[] = [
    uppers[crypto.randomInt(0, uppers.length)],
    uppers[crypto.randomInt(0, uppers.length)],
    lowers[crypto.randomInt(0, lowers.length)],
    lowers[crypto.randomInt(0, lowers.length)],
    digits[crypto.randomInt(0, digits.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  while (passwordChars.length < length) {
    passwordChars.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  // Fisher-Yates shuffle using cryptographically secure random indices
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
}

/**
 * Derives a clean, uppercase referral code from a marketer's name.
 * Automatically resolves duplicates by appending numeric suffixes (e.g. `JOHNDOE2`).
 */
export async function generateReferralCode(name: string): Promise<string> {
  const cleanCode = name
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);

  const baseCode = cleanCode.length >= 2 ? cleanCode : 'MARKETER';

  const existingBase = await db.marketingLink.findUnique({
    where: { code: baseCode },
  });

  if (!existingBase) {
    return baseCode;
  }

  let counter = 2;
  while (counter < 1000) {
    const candidateCode = `${baseCode}${counter}`;
    const existingCandidate = await db.marketingLink.findUnique({
      where: { code: candidateCode },
    });
    if (!existingCandidate) {
      return candidateCode;
    }
    counter++;
  }

  return `${baseCode}${Math.floor(100 + Math.random() * 900)}`;
}
