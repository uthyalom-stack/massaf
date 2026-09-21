import { NextResponse } from 'next/server';
import { verifyAdminApiKey } from '@/lib/admin-guard';
import { uploadToR2, generateObjectKey } from '@/lib/r2';
import { db } from '@/lib/db';
import { getVerifiedTherapistSession } from '@/lib/auth-session';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ALLOWED_FOLDERS = new Set(['profile', 'gallery']);

/**
 * Inspects buffer magic bytes to ensure file content actually matches an allowed image format.
 */
function validateImageMagicBytes(buffer: Buffer): { valid: boolean; format?: string } {
  if (buffer.length < 8) {
    return { valid: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: 'image/png' };
  }

  // WebP: RIFF (bytes 0-3 = 52 49 46 46), WEBP (bytes 8-11 = 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: 'image/webp' };
  }

  return { valid: false };
}

export async function POST(request: Request) {
  // 1. Verify authorization (admin OR verified therapist session)
  const adminAuthError = await verifyAdminApiKey(request);
  const therapistSession = await getVerifiedTherapistSession();

  if (adminAuthError && !therapistSession) {
    return adminAuthError;
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folderInput = (formData.get('folder') as string) || 'profile';
    const therapistIdInput = (formData.get('therapistId') as string) || 'temp';

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No image file was provided in the request.' },
        { status: 400 }
      );
    }

    // 2. Validate and restrict folder namespace strictly to 'profile' or 'gallery'
    const folder = folderInput.trim().toLowerCase();
    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid target folder. Only "profile" and "gallery" folders are supported.',
        },
        { status: 400 }
      );
    }

    // 3. Validate therapist reference ID format and DB existence if not 'temp'
    const therapistId = therapistIdInput.trim();
    const idPattern = /^[a-zA-Z0-9_-]+$/;

    if (!therapistId || !idPattern.test(therapistId) || therapistId.includes('..')) {
      return NextResponse.json(
        { success: false, error: 'Invalid therapist reference identifier.' },
        { status: 400 }
      );
    }

    // Strict ownership verification: if authenticating via therapist session, ensure therapistId matches session
    if (therapistSession && adminAuthError) {
      if (therapistId !== therapistSession.entityId) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Therapists can only upload media to their own profile.' },
          { status: 403 }
        );
      }
    }

    if (therapistId !== 'temp') {
      const therapistExists = await db.therapist.findUnique({
        where: { id: therapistId },
        select: { id: true },
      });

      if (!therapistExists) {
        return NextResponse.json(
          { success: false, error: 'Referenced therapist profile was not found.' },
          { status: 404 }
        );
      }
    }

    // 4. Validate file size (10 MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `File size exceeds maximum permitted limit of 10 MB. Provided file: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
        },
        { status: 400 }
      );
    }

    // 5. Validate client MIME type
    const clientType = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES[clientType]) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file type. Only JPEG, PNG, and WebP images are allowed.',
        },
        { status: 400 }
      );
    }

    // Convert file to Buffer for server-side processing
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 6. Server-side magic bytes validation
    const magicCheck = validateImageMagicBytes(fileBuffer);
    if (!magicCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file contents. The file content does not match a valid JPEG, PNG, or WebP image.',
        },
        { status: 400 }
      );
    }

    // Use detected format
    const contentType = magicCheck.format || clientType;
    const extension = ALLOWED_MIME_TYPES[contentType] || ALLOWED_MIME_TYPES[clientType] || 'webp';

    // 7. Generate safe unique object key (server-authoritative)
    const key = generateObjectKey(folder, therapistId, extension);

    // 8. Upload file to Cloudflare R2
    const uploadResult = await uploadToR2({
      fileBuffer,
      contentType,
      key,
    });

    // 9. Return safe JSON response
    return NextResponse.json({
      success: true,
      url: uploadResult.url,
      key: uploadResult.key,
    });
  } catch (err: unknown) {
    console.error('Error in media upload endpoint:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected server error occurred during image upload. Please try again.',
      },
      { status: 500 }
    );
  }
}
