# Admin photo uploads on Railway

The Hillside Gardens owner dashboard automatically adds a **Choose and upload photo** control below every `Photo URL` field. Tammy can select a picture from a phone, tablet or computer; the site uploads it and fills the URL field automatically. She then saves the product, class, care sheet, gallery item or Amazon pick normally.

## Persistent Railway storage

Railway application files are otherwise replaced during redeployment, so production photo uploads should be stored on a Railway Volume.

1. Open the Hillside web service in Railway.
2. Add a Volume to that service.
3. Mount the Volume at `/data`.
4. Add these variables to the web service:

```text
UPLOAD_DIR=/data/uploads
UPLOAD_MAX_BYTES=8388608
```

`UPLOAD_MAX_BYTES=8388608` allows images up to 8 MB. The upload endpoint accepts JPEG, PNG, WebP and GIF files and intentionally rejects SVG and other executable formats.

## How images are served

Uploaded files receive random UUID filenames and are served through `/media/<filename>`. The upload endpoint is protected by the same signed owner session as the rest of `/admin`. The server verifies file size, MIME type and basic binary signature before writing the file.

Keep the web service to one replica unless every replica shares the same mounted Volume. For a future multi-region or high-traffic deployment, the same admin interface can be switched to S3-compatible object storage without changing product records because the database stores ordinary image URLs.

## Local development

When `UPLOAD_DIR` is not set, images are written under `.data/uploads` in the project directory. `.data` is ignored by Git.
