# Admin photo uploads on Railway

Products have their own photography editor in the owner dashboard: a named slot
for the main, lifestyle, detail, scale and packaging photographs, plus a
reorderable strip of additional ones. Every slot takes a file from a phone,
tablet or computer — chosen with a button or dropped onto the panel — and fills
its URL in automatically. Everywhere else on the dashboard (classes, care
sheets, gallery items, collections, Amazon picks) a plainer **Choose and upload
photo** control is added below each `Photo URL` field and behaves the same way.

## What happens to a photo on the way up

Resizing happens in the browser, before the upload, which is why a picture
straight off a phone is fine:

1. The file is decoded with `imageOrientation: 'from-image'`, so a photograph
   taken sideways stops arriving sideways.
2. It is drawn onto a canvas at up to 1600px on the long edge and re-encoded as
   WebP. This also normalises formats the server cannot read on its own, such as
   iOS HEIC.
3. Smaller copies at 400, 800 and 1200px are produced and uploaded alongside it.

The stored filename carries the widths that exist beside it —
`<uuid>-v400-800-1200-1600.webp` — so `lib/image-srcset.ts` can build a
`srcset` for an uploaded photograph with nothing to look up. Photos uploaded
before this existed have unmarked names, carry no `srcset`, and are served
exactly as they always were.

Each step falls back to uploading the original file: an older browser, a decoder
that refuses the format, or a canvas that will not encode WebP all end with the
picture uploaded at full size rather than with an error. If any of the smaller
copies cannot be written, the whole ladder is dropped rather than leaving the
master's name advertising a file that is not there.

## Persistent Railway storage

Railway application files are otherwise replaced during redeployment, so
production photo uploads should be stored on a Railway Volume.

1. Open the Hillside web service in Railway.
2. Add a Volume to that service.
3. Mount the Volume at `/data`.
4. Add these variables to the web service:

```text
UPLOAD_DIR=/data/uploads
UPLOAD_MAX_BYTES=8388608
```

`UPLOAD_MAX_BYTES=8388608` allows images up to 8 MB, applied to each uploaded
file including the smaller copies. The upload endpoint accepts JPEG, PNG, WebP,
AVIF and GIF and intentionally rejects SVG and other executable formats. AVIF is
accepted because recent phones produce it, not because anything asks for it.

## How images are served

Uploaded files receive random UUID filenames and are served through
`/media/<filename>`. The route only serves names matching the upload pattern, so
nothing under `/media/` can name a file outside the upload directory. The upload
endpoint is protected by the same signed owner session as the rest of `/admin`,
and the server verifies file size, format and binary signature before writing.

Keep the web service to one replica unless every replica shares the same mounted
Volume. For a future multi-region or high-traffic deployment, the same admin
interface can be switched to S3-compatible object storage without changing
product records, because the database stores ordinary image URLs.

## Generic artwork

A product with no photograph of its own falls back to shared category artwork so
the shop never shows a broken tile. `lib/product-photos.ts` is the one place
that decides what counts as stand-in artwork, and both the customer-facing
visual and the dashboard's **Missing photograph** chip ask it — so a product
showing the shared house-plants picture is flagged as needing a photograph
rather than passing for one.

## Local development

When `UPLOAD_DIR` is not set, images are written under `.data/uploads` in the
project directory. `.data` is ignored by Git.
