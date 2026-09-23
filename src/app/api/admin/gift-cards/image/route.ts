import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { isR2Configured, getMockStorageItem } from '@/lib/r2';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || undefined;
    const adminSession = await getVerifiedAdminSession(cookieHeader);

    if (!adminSession) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin authentication required to access gift card proof images.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID parameter is required.' },
        { status: 400 }
      );
    }

    const imageRecord = await db.giftCardImage.findUnique({
      where: { id: imageId },
    });

    if (!imageRecord) {
      return NextResponse.json(
        { error: 'Gift card image record not found.' },
        { status: 404 }
      );
    }

    const storageKey = imageRecord.storageKey;

    if (!isR2Configured()) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Storage provider is not configured.' },
          { status: 500 }
        );
      }

      // Dev/Test Mock Storage serving
      const mockItem = getMockStorageItem(storageKey);
      if (mockItem) {
        return new NextResponse(new Uint8Array(mockItem.buffer), {
          headers: {
            'Content-Type': mockItem.contentType || 'image/jpeg',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }

      // Fallback 1x1 transparent PNG for unseeded mock keys in dev/test
      const mockPng = Buffer.from(
        'iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      return new NextResponse(new Uint8Array(mockPng), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: storageKey,
    });

    const r2Response = await s3.send(command);
    if (!r2Response.Body) {
      return NextResponse.json(
        { error: 'Image body stream missing from storage provider.' },
        { status: 404 }
      );
    }

    const byteArray = await r2Response.Body.transformToByteArray();
    const contentType = r2Response.ContentType || 'image/jpeg';

    return new NextResponse(Buffer.from(byteArray), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Error fetching admin gift card image:', err);
    return NextResponse.json(
      { error: 'An error occurred while retrieving the gift card image.' },
      { status: 500 }
    );
  }
}
