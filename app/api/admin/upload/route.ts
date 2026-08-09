import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { saveUploadedImage } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Your admin session has expired. Please sign in again.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
    }

    const url = await saveUploadedImage(file);
    return NextResponse.json(
      { url, originalName: file.name },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    console.error('Admin image upload failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The image could not be uploaded.' },
      { status: 400 }
    );
  }
}
