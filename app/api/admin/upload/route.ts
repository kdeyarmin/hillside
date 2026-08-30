import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { rateLimited } from '@/lib/rate-limit';
import { saveUploadedImage, UploadValidationError, type UploadVariant } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A ceiling on the ladder, so one request cannot ask for unbounded writes. */
const MAX_VARIANTS = 6;

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: 'Your admin session has expired. Please sign in again.' },
      { status: 401 }
    );
  }

  if (await rateLimited(request, { name: 'admin-upload', limit: 20, windowMs: 15 * 60_000 })) {
    return NextResponse.json(
      { error: 'Too many uploads. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
    }

    /**
     * The browser resizes before uploading and sends the smaller copies along
     * with the full-size one, each under `variant-<width>`. Everything here is
     * optional: a browser that cannot re-encode — or a paste straight into the
     * URL field — simply posts `file` on its own and gets the behaviour this
     * endpoint has always had.
     */
    const variants: UploadVariant[] = [];
    for (const [name, value] of formData.entries()) {
      const match = /^variant-(\d{2,4})$/.exec(name);
      if (!match || !(value instanceof File)) continue;
      variants.push({ width: Number(match[1]), file: value });
      if (variants.length >= MAX_VARIANTS) break;
    }

    const url = await saveUploadedImage(file, {
      width: Number(formData.get('width')) || null,
      variants
    });
    return NextResponse.json(
      { url, originalName: file.name },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    console.error('Admin image upload failed', error);
    const message =
      error instanceof UploadValidationError ? error.message : 'The image could not be uploaded.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
