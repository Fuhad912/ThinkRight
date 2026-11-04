# Lesson video infrastructure status

## Latest production status

On 2026-11-04, confirmed both R2 credential secret names are present in Supabase. Enabled `VIDEO_UPLOADS_ENABLED=true` after diagnosing the disabled switch as the cause of the teacher upload "temporarily unavailable" message. This supersedes the earlier disabled-upload setup notes below. A full teacher upload/playback smoke test and scheduled cleanup configuration still need verification.

Verified on 2026-11-04 through the authenticated Cloudflare MCP connection.

| Setting | Staging | Production |
| --- | --- | --- |
| Bucket | `thinkright-videos-staging` | `thinkright-videos-production` |
| Storage class | Standard | Standard |
| Public r2.dev access | Disabled | Disabled |
| Custom domains | None | None |
| Allowed browser origins | `http://localhost:3000`, `http://127.0.0.1:3000` | `https://thinkright.com.ng` |
| Allowed methods | GET, PUT, HEAD | GET, PUT, HEAD |
| Exposed headers | ETag, Content-Range, Accept-Ranges, Content-Length | ETag, Content-Range, Accept-Ranges, Content-Length |
| Incomplete multipart upload expiry | 24 hours | 24 hours |
| Completed object expiry | None | None |

The staging origins are for local validation; a hosted staging origin must be added before testing from a staging website. Native app origins must be verified and added separately before mobile rollout.

## Supabase deployment

- A separate `supabase-deploy` MCP connection is scoped to the ThinkRight project. The original read-only connection is unchanged.
- Applied migration `private_r2_lesson_videos` on 2026-11-04. Verified the asset table, RLS, upload/review/publish guards, and recorded migration. Neither anonymous nor authenticated roles have direct asset-table access.
- Deployed `lesson-video` version 1, status ACTIVE. Gateway JWT checks are disabled because the handler authenticates user sessions and the cleanup secret itself.
- At deployment inspection there were zero lesson rows; no existing published lesson migration gates were activated.
- Upload activation and end-to-end R2 testing remain pending secret configuration.

## Pending before activation

- Create separate bucket-scoped S3 credentials and store them directly in the corresponding Supabase function secrets. Do not put credentials in this document or GitHub.
- Set the function secrets in the Supabase Dashboard, including the production origin `https://thinkright.com.ng`. Keep `VIDEO_UPLOADS_ENABLED=false` until ready for the controlled upload test.
- Follow `LESSON_VIDEOS_SETUP.md` to configure the Vault secrets and schedule cleanup after function secrets are saved.
- Complete staging and production smoke tests, including upload resume, seeking, authorized playback, review, and legacy paid access.

The buckets being provisioned does not mean video uploads are live. Do not enable uploads or migrate published classes until the remaining backend setup is verified.
