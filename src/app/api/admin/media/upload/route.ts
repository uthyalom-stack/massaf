import { NextResponse } from 'next/server';
import { verifyAdminApiKey } from '@/lib/admin-guard';
import { uploadToR2, deleteFromR2, generateObjectKey } from '@/lib/r2';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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
  // 1. Verify admin authorization
  const authError = verifyAdminApiKey(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || 'profile';
    const therapistId = (formData.get('therapistId') as string) || 'temp';
    const oldUrl = formData.get('oldUrl') as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No image file was provided in the request.' },
        { status: 400 }
      );
    }

    // 2. Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `File size exceeds maximum permitted limit of 10 MB. Provided file: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate client MIME type
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

    // 4. Server-side magic bytes validation
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

    // Use detected or matched file extension
    const contentType = magicCheck.format || clientType;
    const extension = ALLOWED_MIME_TYPES[contentType] || ALLOWED_MIME_TYPES[clientType] || 'webp';

    // 5. Generate safe unique key
    const key = generateObjectKey(folder, therapistId, extension);

    // 6. Upload file to R2
    const uploadResult = await uploadToR2({
      fileBuffer,
      contentType,
      key,
    });

    // 7. If replacing an existing image, safely delete old image if it belongs to R2 bucket
    if (oldUrl) {
      try {
        await deleteFromR2(oldUrl);
      } catch (delErr) {
        console.error('Non-critical error deleting old image from R2:', delErr);
      }
    }

    // 8. Return safe JSON response
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
        error: err instanceof Error ? err.message : 'An unexpected server error occurred during image upload.',
      },
      { status: 500 }
    );
  }
}
