# Private R2 lesson videos

## Deployment order

The application code is not sufficient on its own. Configure and test staging before production. The Cloudflare plugin must be authenticated before it can inspect or configure your account; an installed plugin is not an authenticated session.

1. In Cloudflare, enable R2 billing if needed. Create private `thinkright-videos-staging` and `thinkright-videos-production` buckets. Keep both public custom domains and `r2.dev` access disabled. Create a separate bucket-scoped Object Read & Write S3 credential for each environment. Store credentials in Supabase function secrets, never browser configuration or GitHub.
2. Configure bucket CORS. Replace these example origins with the exact production/staging origins. Add the actual Capacitor origin from the native build before mobile testing; do not use `*`.

```json
[
  {
    "AllowedOrigins": ["https://thinkright.com.ng"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "range", "if-match", "if-none-match", "x-amz-*"],
    "ExposeHeaders": ["ETag", "Content-Range", "Accept-Ranges", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Configure an R2 lifecycle rule to abort incomplete multipart uploads after **one day**, without expiring completed objects. This also covers the rare case where an upload initiation succeeds at R2 but its response is lost.
4. Set the following Supabase Edge Function secrets independently in staging and production:

| Secret | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_VIDEO_BUCKET` | Environment's private bucket |
| `R2_ACCESS_KEY_ID` | Bucket-scoped S3 access key |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped S3 secret |
| `SITE_URL` | Canonical website origin, without trailing slash |
| `VIDEO_ALLOWED_ORIGINS` | Other approved origins, comma separated |
| `VIDEO_UPLOADS_ENABLED` | `true` when ready to allow uploads; `false` to pause them |
| `VIDEO_CLEANUP_SECRET` | A unique random secret of at least 32 bytes |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase. Do not replace existing payment secrets. Do not paste private credentials into chat.

5. Back up the database. Apply `lesson_videos.sql` **once**, after the existing teacher workspace/application/document, class enrollment, and thumbnail migrations. Do not rerun older setup migrations afterward: they can replace the guarded enrollment function. This migration intentionally blocks new enrollment in classes that still have legacy videos. Existing enrollments and in-flight payment settlement are preserved.
6. Deploy the Edge Function with the repository's `supabase/config.toml`: `supabase functions deploy lesson-video --project-ref YOUR_PROJECT_REF`. User JWTs and the cleanup secret are validated inside the handler; its gateway JWT verification is disabled intentionally.
7. Deploy the website from GitHub only after the database and function are ready. The new frontend requires the new lesson asset column and function. R2 files are never stored in the repository or website build.
8. In Supabase Vault, add secrets named `lesson_video_supabase_url` (the project URL) and `lesson_video_cleanup_secret` (same value as `VIDEO_CLEANUP_SECRET`). Enable `pg_cron` and `pg_net`, then apply `lesson_video_schedule.sql`. The hourly cleanup removes only unreferenced expired uploads. Saved revision and published lesson references always protect a file.

## Smoke test before production rollout

- Approved teacher: create a class, add a lesson, choose a video recording under 500 MB, watch progress and preview the uploaded video. Save, reload, and verify the preview still works.
- Interrupt a large upload, reload, then reselect the identical file. It should reuse completed chunks. Session lifetime is 24 hours; after that a new upload is required.
- Upload recordings from different devices, including MOV and WebM, plus a non-video file and an oversized file. Valid video containers pass without codec restrictions; invalid files and files over 500 MB are rejected.
- Submit the class, preview it as admin, approve it, enroll a student, and test playback/seek/fullscreen/speed on desktop, Android and iPhone. Test foregrounding a mobile app after playback credentials expire.
- An unenrolled student, a second teacher and a signed-out browser must not receive playback links. Draft replacement videos must not be visible to enrolled students until approved.
- Existing YouTube class: confirm existing students still watch it, new orders are rejected, and an existing pending payment settles. Replace every lesson and approve; enrollment should reopen with the class's existing availability.
- Wait for cleanup on one abandoned upload and verify a referenced video is retained. Check function errors, upload failures, R2 bytes/operations, and cleanup counts before broad rollout.

## API and storage behavior

`lesson-video` accepts POST JSON with `action`. User operations use the current Supabase session. `initiate` accepts `cohort_id`, `lesson_id`, `filename`, `size_bytes`, `content_type`, and a full-file chunk-hash fingerprint; returns `asset_id`, `chunk_size`, and optionally a resumable state. `status`, `sign` (plus `part_number`), `complete`, and `cancel` use `asset_id`. `playback` returns a one-hour signed GET URL only after class-access checks. `cleanup` requires the dedicated cleanup secret as its bearer token.

Uploads use 10 MiB parts, three concurrent browser requests, and up to three attempts per part with newly signed permissions. Each signed upload permission lasts 15 minutes. Resume requires reselecting the same file; the browser computes a fingerprint over all file chunks with bounded memory. After R2 assembly, the server checks object size and video-container signatures using bounded range reads before marking the asset ready. It does not enforce particular video or audio codecs, decode every frame, or transcode the recording. Admins preview recordings and assess clarity before approval.

The internal `https://video.thinkright.invalid/assets/UUID` marker in `video_url` preserves compatibility with the existing workspace's HTTPS validation. It is not a public video endpoint. `video_asset_id` is authoritative, and actual playback uses an authorized temporary URL. Neither object keys nor signed URLs should be added to public curriculum responses or logs.

Files have one original playback quality. R2 does not transcode or add adaptive streaming. Signed URLs are bearer links valid until expiry; they do not provide DRM or prevent recording/downloading by an authorized viewer. Revoking enrollment blocks new links immediately; existing signed links can remain usable for up to one hour.

## Rollback

Set `VIDEO_UPLOADS_ENABLED=false` to stop new upload operations without interrupting uploaded-video playback or legacy paid access. Keep the new database schema, function, published files, and compatible player in place. Do not drop the asset table or revert the website to an iframe-only player after publishing uploaded lessons. Restore any individual published class from a verified database backup only through a coordinated support operation, preserving enrollments and financial records.

## Local checks

`npm.cmd run test:video` runs isolated API, media metadata, database and browser DOM tests. No tests connect to R2 or live Supabase. `npm.cmd run test:teacher` and `npm.cmd run build:web` cover the existing teacher/payment code and website bundle. Production smoke tests remain necessary after credentials and infrastructure are configured.

References: [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [multipart uploads](https://developers.cloudflare.com/r2/objects/upload-objects/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Teacher guidance

Show only two main recommendations: maximum file size 500 MB, and a very clear video with audible speech. Teachers do not need to choose codecs or convert files to pass upload validation. Native-browser playback support still varies by recording format; R2 storage does not provide automatic conversion. A successful upload is not a guarantee that the original recording plays on every student device.
