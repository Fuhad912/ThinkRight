# In-app and installed PWA notifications

The inbox is enabled for every signed-in account without a subscription. Device notifications require a user to install the PWA and tap **Notifications → Enable device alerts**, then approve the browser permission request. An installation alone cannot grant notification permission. iOS requires a Home Screen web app on iOS 16.4 or later. Unsupported or blocked devices retain the inbox.

## Activate on Supabase

1. Apply `app_notifications.sql` after `teacher_workspace.sql` and `email_notifications.sql`. Existing users receive new events; historical events are not backfilled.
2. Run `node scripts/generate-push-keys.cjs` locally. Keep the VAPID private key and cron secret private. Set Edge Function secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFICATIONS_CRON_SECRET`, and `VAPID_CONTACT` (for example `mailto:thinkright912@gmail.com`). Supabase supplies its URL and service role key.
3. Store the public key in the database: `insert into public.app_notification_config(id,vapid_public_key) values(true,'YOUR_PUBLIC_KEY') on conflict(id) do update set vapid_public_key=excluded.vapid_public_key;`. The public key must match the Edge Function key pair. Keep keys stable; rotation requires devices to subscribe again.
4. Deploy with `supabase functions deploy dispatch-notifications --no-verify-jwt`. This endpoint authenticates exclusively with the separate cron secret. It is not a public user endpoint.
5. Create Vault secrets `notifications_project_url` (your Supabase HTTPS project URL) and `notifications_cron_secret` (matching the Edge secret). Apply `app_notifications_schedule.sql`. Never put these secrets in browser code.
6. Deploy the website, including both service worker copies. Open the installed app online to pick up the service worker update, sign in, open the bell, and enable device alerts.

## Timing and audiences

- Enrolment: the student gets class access confirmation and the teacher gets a new student update.
- Class review: admins get submissions; teachers get publication/change decisions.
- Admin email announcements to all/students/teachers/admins also populate those accounts' inboxes through `email_broadcast_logs`. Custom email recipients and mailing-list subscribers do not generate app notifications. This currently follows the existing email broadcast flow, rather than providing a separate app-only broadcast composer.
- One daily role-specific reminder at 10:00 Africa/Lagos for accounts signed in within the last 30 days. Daily keys prevent duplicate reminders on retries.
- The visible inbox refreshes every minute and on returning to the app. Device delivery runs every minute in batches of 50. Delivery time is subject to browser/network conditions; increase dispatcher throughput for a larger audience.

Device delivery retries five times with a five-minute lease; expired endpoints (404/410) are removed. Unread updates older than two days are not pushed. Turning off device alerts unsubscribes this device; in-app updates remain enabled. Signing out unsubscribes locally, and registering an endpoint under another account clears the old account's queued alerts. Push messages deliberately contain generic text so account details never appear on a shared lock screen. Tapping opens the signed-in account's inbox.

## Verification

Run `node scripts/test-app-notifications.cjs` and `node scripts/test-app-notification-worker.cjs`. These tests use a local database and mocked browser workers, with no live delivery. After deployment verify Android and iOS permission/denial, delivery while closed, notification taps, sign-out/account switching, role broadcasts and cron history. Monitor failed jobs (`attempts=5 and not done`) and Edge Function logs. Retain inbox data according to your product's retention policy; no automatic purge is installed.

References: [WebKit Home Screen Web Push](https://webkit.org/blog/13878/) and [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API).
