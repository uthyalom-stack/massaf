import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

interface UploadOptions {
  fileBuffer: Buffer;
  contentType: string;
  key: string;
}

interface UploadResult {
  url: string;
  key: string;
}

interface DeleteResult {
  success: boolean;
  skipped?: boolean;
}

// In-memory mock storage for local dev / testing when R2 credentials are not set
const mockStorage = new Map<string, { buffer: Buffer; contentType: string }>();

/**
 * Checks whether real Cloudflare R2 credentials are fully configured.
 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

/**
 * Returns an S3Client instance configured for Cloudflare R2 S3-compatible API.
 */
function getS3Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 credentials are not configured on the server.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Generates a clean, unique object key for media storage.
 * Example format: therapists/{therapistId}/{folder}/{uuid}.{ext}
 */
export function generateObjectKey(folder: string, therapistId: string, extension: string): string {
  const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'profile';
  const sanitizedTherapistId = therapistId.replace(/[^a-zA-Z0-9_-]/g, '') || 'temp';
  const sanitizedExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'webp';
  const uniqueId = crypto.randomUUID();

  return `therapists/${sanitizedTherapistId}/${sanitizedFolder}/${uniqueId}.${sanitizedExt}`;
}

/**
 * Generates a clean, unique object key for private gift card image proof uploads.
 * Example format: gift-cards/{bookingId}/{uuid}.{ext}
 */
export function generateGiftCardObjectKey(bookingId: string, extension: string): string {
  const sanitizedBookingId = bookingId.replace(/[^a-zA-Z0-9_-]/g, '') || 'temp';
  const sanitizedExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
  const uniqueId = crypto.randomUUID();

  return `gift-cards/${sanitizedBookingId}/${uniqueId}.${sanitizedExt}`;
}

/**
 * Uploads a file buffer to Cloudflare R2 or mock storage in dev/test.
 */
export async function uploadToR2({
  fileBuffer,
  contentType,
  key,
}: UploadOptions): Promise<UploadResult> {
  const configured = isR2Configured();

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Cloudflare R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL) are missing in production.'
      );
    }

    // Dev/Test Mock Mode
    mockStorage.set(key, { buffer: fileBuffer, contentType });
    const mockPublicBase = process.env.R2_PUBLIC_URL || 'https://r2-mock.massaf.com';
    const baseUrl = mockPublicBase.replace(/\/+$/, '');
    const publicUrl = `${baseUrl}/${key}`;

    return {
      url: publicUrl,
      key,
    };
  }

  const bucketName = process.env.R2_BUCKET_NAME!;
  const publicBaseUrl = process.env.R2_PUBLIC_URL!.replace(/\/+$/, '');
  const s3 = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await s3.send(command);

  const publicUrl = `${publicBaseUrl}/${key}`;

  return {
    url: publicUrl,
    key,
  };
}

/**
 * Safely derives and validates the object key from a full public URL or relative object key.
 * Strictly verifies protocol, host/origin, and key namespace structure.
 */
export function extractAndValidateR2Key(publicUrlOrKey: string): string | null {
  if (!publicUrlOrKey || typeof publicUrlOrKey !== 'string') {
    return null;
  }

  const trimmed = publicUrlOrKey.trim();
  if (!trimmed) {
    return null;
  }

  const mockPublicBase = process.env.R2_PUBLIC_URL || 'https://r2-mock.massaf.com';

  let extractedKey = trimmed;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const targetUrl = new URL(trimmed);
      const configuredBaseUrl = new URL(mockPublicBase);

      // Verify protocol and origin match MASSAF configured R2 public domain exactly
      if (
        targetUrl.protocol !== configuredBaseUrl.protocol ||
        targetUrl.origin.toLowerCase() !== configuredBaseUrl.origin.toLowerCase()
      ) {
        // External URL (e.g. Unsplash, external CDN) -> return null to safely skip R2 deletion
        return null;
      }

      // Check base pathname prefix if configured public URL has a path (e.g., https://domain.com/storage)
      const baseBasePath = configuredBaseUrl.pathname.replace(/\/+$/, '');
      let targetPath = targetUrl.pathname;

      if (baseBasePath && baseBasePath !== '/') {
        if (!targetPath.startsWith(baseBasePath)) {
          return null;
        }
        targetPath = targetPath.substring(baseBasePath.length);
      }

      extractedKey = targetPath.replace(/^\/+/, '');
    } catch {
      // Invalid URL format
      return null;
    }
  }

  // Validate extracted key namespace structure: must start with 'therapists/', no path traversal ('..')
  if (!extractedKey || extractedKey.includes('..')) {
    return null;
  }

  // Key must strictly match valid MASSAF object key namespace
  // e.g. therapists/{therapistId}/{folder}/{uuid}.{ext}
  const validKeyPattern = /^therapists\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/;
  if (!validKeyPattern.test(extractedKey)) {
    return null;
  }

  return extractedKey;
}

/**
 * Safely deletes an object from Cloudflare R2 if the URL matches the configured R2 domain and object key structure.
 * Safely skips external URLs (e.g. Unsplash, external CDNs) without attempting deletion.
 */
export async function deleteFromR2(publicUrlOrKey: string): Promise<DeleteResult> {
  const key = extractAndValidateR2Key(publicUrlOrKey);

  if (!key) {
    // URL/key is external, invalid, or doesn't belong to MASSAF R2 storage
    return { success: true, skipped: true };
  }

  const configured = isR2Configured();

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Cloudflare R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL) are missing in production.'
      );
    }

    // Dev/Test Mock Mode deletion
    mockStorage.delete(key);
    return { success: true };
  }

  const bucketName = process.env.R2_BUCKET_NAME!;
  const s3 = getS3Client();

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3.send(command);
    return { success: true };
  } catch (err) {
    console.error('Failed to delete object from R2:', err);
    return { success: false };
  }
}

/**
 * Gets a mock stored item (for unit testing purposes in non-prod).
 */
export function getMockStorageItem(key: string) {
  return mockStorage.get(key);
}

/**
 * Clears mock storage (for unit testing reset).
 */
export function clearMockStorage() {
  mockStorage.clear();
}
