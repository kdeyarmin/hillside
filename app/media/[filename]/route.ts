import { readFile } from 'fs/promises';
import { mediaContentType, mediaPath } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const filePath = mediaPath(filename);
  if (!filePath) return new Response('Not found', { status: 404 });

  try {
    const bytes = await readFile(filePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': mediaContentType(filename),
        'content-length': String(bytes.length),
        'cache-control': 'public, max-age=31536000, immutable',
        'content-disposition': `inline; filename="${filename}"`,
        'x-content-type-options': 'nosniff'
      }
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'ENOENT') console.error('Unable to serve uploaded image', error);
    return new Response('Not found', { status: 404 });
  }
}
