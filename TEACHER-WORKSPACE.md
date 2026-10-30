# Teacher workspace rollout

## What changed

Dedicated teacher dashboard, class studio, students, analytics, discussions, earnings and profile pages share the student typography and colour tokens. Mobile layouts include a compact header, bottom navigation, navigation drawer, stacked forms and responsive student tables. `admin.html` provides teacher/class review, subject pricing, bank review, manual payout recording and historical payment reconciliation.

Teacher identity comes from the authenticated database role, not URL parameters or cached browser values. New teacher applications are pending. Teachers can prepare drafts; active teachers may submit for review. Editing a published class does not change its live version until approval.

## Deployment order

1. Back up the database and rehearse this migration in a staging Supabase project. Existing `cohorts_schema.sql` and `user_profiles.sql` must already be installed. Do not rerun the old schema scripts after the new migration: they restore permissive policies.
2. Run `supabase/teacher_workspace.sql` once using the SQL editor or your migration pipeline. It backfills published revisions for existing classes and preserves enrollment records. Subject prices deliberately start unconfigured; legacy prices are not treated as a pricing decision.
3. Bootstrap a trusted admin using the SQL editor, substituting the verified account UUID:

   ```sql
   insert into public.workspace_roles(user_id, role)
   values ('YOUR-VERIFIED-USER-UUID', 'admin')
   on conflict(user_id) do update set role = excluded.role;
   ```

4. Configure Edge Function secrets `PAYSTACK_SECRET_KEY` and `SITE_URL` (the HTTPS app origin without a trailing slash). Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Optional `CHECKOUT_ALLOWED_ORIGINS` is a comma-separated list of additional trusted origins. Never put service-role or Paystack secret keys in browser JavaScript.
5. Deploy `supabase functions deploy class-checkout --no-verify-jwt`. The function explicitly validates user bearer tokens; provider webhook requests instead require the Paystack HMAC signature. Configure the Paystack webhook to your project's `/functions/v1/class-checkout` URL. Use Paystack test mode first.
6. Sign in as admin at `admin.html`, configure subject prices, review existing teacher statuses and bank details, then publish approved classes. Existing teacher statuses are preserved; new applicants remain pending.
7. Deploy the frontend together with these backend changes. `npm run build:web` includes all new pages. Do not release this frontend alone: identity, reviews and checkout require the migration/function.

## Money and migration rules

- Price is configured per subject in NGN. Each purchase grants enrollment in one class. A zero price explicitly means free; unconfigured prices disable enrollment.
- A checkout order locks its quoted amount for 15 minutes. New orders use the latest subject price. Existing completed payments retain their recorded amounts.
- Only server verification of a successful Paystack transaction can settle a paid order. Callback and webhook retries are idempotent. The teacher share is 70% of the verified gross amount, before provider fees.
- Payouts are **records of completed external transfers**, not automatic transfers. Review bank details and check actual bank evidence before recording. The database rejects payouts above the unpaid balance. Changing bank details resets review; previous payout bank snapshots remain unchanged.
- Historical paid enrollments do not become payable automatically. Use Reconciliation only after checking external payment evidence. References must be unique. Refunds/chargebacks and duplicate or late successful payments require a reviewed support/accounting process; no automatic refund integration is included.
- If Paystack confirms a payment but settlement fails, retain the reference and resolve it through support; do not ask the student to pay again. Check function logs and the provider dashboard for unresolved webhook retries.

## Verification

`npm run test:teacher` runs isolated PostgreSQL workflow/security tests, 36 empty/populated DOM page checks and mocked checkout/webhook tests. It does not contact production or move money. `npm run build:web` checks asset packaging. Approved lesson removals archive content so existing progress history is retained.

The implementation-time dependency audit reported zero production dependency vulnerabilities and four development-tool advisories (three high, one critical). Review the existing Capacitor tooling dependencies separately before packaging native apps; no broad dependency upgrade was applied during this UI change.

Before release, test at 320, 375, 390, 768 and 1440px in a real browser, including keyboard focus, the mobile drawer, dark mode, long class titles, empty states, draft saves, review decisions and a complete Paystack test checkout/webhook. Test student, pending teacher, active teacher, suspended teacher and admin accounts. Browser-based visual QA and live provider integration must be completed in staging.

Server transaction integration follows the [Paystack transaction API](https://paystack.com/docs/api/transaction/).
