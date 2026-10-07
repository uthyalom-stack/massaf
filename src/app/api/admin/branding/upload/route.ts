import { verifyAdminApiKey } from '@/lib/admin-guard';
import { uploadToR2 } from '@/lib/r2';
import { getVerifiedAdminSession } from '@/lib/auth-session';

const MAX_BRANDING_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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
  // 1. Verify authorization strictly for SUPER_ADMIN or ADMIN
  const adminAuthError = await verifyAdminApiKey(request, ['SUPER_ADMIN', 'ADMIN']);
  const cookieHeader = request.headers.get('cookie') || undefined;
  const adminSession = await getVerifiedAdminSession(cookieHeader);

  const isAuthorizedAdmin =
    !adminAuthError || (adminSession && (adminSession.role === 'SUPER_ADMIN' || adminSession.role === 'ADMIN'));

  if (!isAuthorizedAdmin) {
    return Response.json(
      { success: false, error: 'Unauthorized: Only SUPER_ADMIN or ADMIN can upload branding assets.' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return Response.json(
        { success: false, error: 'No image file was provided in the request.' },
        { status: 400 }
      );
    }

    // 2. Validate file size (5 MB limit)
    if (file.size > MAX_BRANDING_FILE_SIZE_BYTES) {
      return Response.json(
        {
          success: false,
          error: `File size exceeds maximum permitted limit of 5 MB for branding assets. Provided file: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate client MIME type
    const clientType = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES[clientType]) {
      return Response.json(
        {
          success: false,
          error: 'Unsupported file type. Only JPEG, PNG, and WebP images are allowed for branding.',
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
      return Response.json(
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

    // 5. Generate server-controlled object key in branding namespace (no therapist reference)
    const timestamp = Date.now();
    const randomHash = Math.random().toString(36).substring(2, 10);
    const key = `branding/system-logo-${timestamp}-${randomHash}.${extension}`;

    // 6. Upload file to Cloudflare R2
    const uploadResult = await uploadToR2({
      fileBuffer,
      contentType,
      key,
    });

    return Response.json({
      success: true,
      url: uploadResult.url,
      key: uploadResult.key,
    });
  } catch (err: unknown) {
    console.error('Error in branding upload endpoint:', err);
    return Response.json(
      {
        success: false,
        error: 'An unexpected server error occurred during branding upload. Please try again.',
      },
      { status: 500 }
    );
  }
}
