# Lesson video infrastructure status

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

## Pending before activation

- Create separate bucket-scoped S3 credentials and store them directly in the corresponding Supabase function secrets. Do not put credentials in this document or GitHub.
- Confirm a writable deployment connection to ThinkRight's Supabase project. The existing MCP connection is read-only and exposes database/debugging features only.
- Follow `LESSON_VIDEOS_SETUP.md` to apply the database migration, deploy the function, set secrets, and schedule cleanup.
- Complete staging and production smoke tests, including upload resume, seeking, authorized playback, review, and legacy paid access.

The buckets being provisioned does not mean video uploads are live. Do not enable uploads or migrate published classes until the remaining backend setup is verified.
