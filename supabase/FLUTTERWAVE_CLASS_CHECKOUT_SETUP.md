# Flutterwave class checkout

Class enrollment uses Flutterwave v3 Standard hosted checkout. One purchase unlocks one teacher's subject course and its published topic classrooms. CBT practice remains free. Prices are read from the database; browser-supplied prices are ignored.

## 1. Database

On an existing workspace database, run `supabase/subject_course_enrollment.sql`, then `supabase/class_specific_enrollment.sql` in the Supabase SQL Editor. If the subject migration is already installed, run only the class migration. See `CLASS_ENROLLMENT_SETUP.md`. Do not rerun the older subject migration after the class migration.

Set each subject's price using **Admin > Subject enrollment prices**. The teacher must be approved and the class must be published and open for enrollment. A zero price grants access directly; a positive price starts Flutterwave checkout. A missing price disables enrollment.

## 2. Function configuration

In Supabase **Edge Functions > Secrets**, set:

- `FLUTTERWAVE_SECRET_KEY`: the Flutterwave v3 secret key, initially from test mode.
- `FLUTTERWAVE_SECRET_HASH`: a long random webhook secret, identical to the hash configured in Flutterwave.
- `SITE_URL`: the exact HTTPS website origin, for example `https://thinkright.name.ng`.
- `CHECKOUT_ALLOWED_ORIGINS`: optional comma-separated additional frontend origins. Include preview origins only when needed.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function. All secret keys stay in server configuration.

From this project directory, deploy with the Supabase CLI:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy class-checkout --no-verify-jwt
```

`supabase/config.toml` also records `verify_jwt = false` for this function. Flutterwave needs to reach the webhook without a Supabase JWT. The handler independently authenticates checkout requests with Supabase Auth and webhook requests using `verif-hash`.

## 3. Flutterwave dashboard

Configure the webhook URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/class-checkout
```

Set the same webhook secret hash as `FLUTTERWAVE_SECRET_HASH`, enable charge-completed events, and enable retries. Test and live modes need their own corresponding keys and webhook configuration. The function sets the hosted checkout return URL to `SITE_URL/classes.html`.

## 4. Publish the frontend

Run `npm run build:web` and publish the updated web files, including `classes.html`, `js/classes.js`, and `css/class-checkout.css`.

## 5. Account-specific acceptance check

Use Flutterwave test mode before accepting real payments:

1. Sign in as a student and enroll in an approved teacher's published class with a nonzero subject price.
2. Complete a Flutterwave test transaction. The return to Classes must verify payment before opening the classroom.
3. Confirm that My Classes includes the purchased teacher's subject topics and that lessons unlock.
4. Repeat the return/verification and confirm there is one payment and one earnings record.
5. Cancel a separate checkout and confirm it does not grant enrollment.
6. Close the payment tab after paying, then return to Classes in the same browser session. The stored reference should trigger verification. The webhook should also settle payment independently.
7. Confirm another teacher's course or another subject remains locked.

Switch the function's secret key to the live-mode key only after the test-mode flow succeeds and the live Flutterwave account is ready to collect payments.

## Delayed payment confirmation

The Classes page preserves the reference for the signed-in browser session and offers **Retry verification** and **Contact support** if confirmation is delayed. It never grants access based only on the return URL's status. Verification and authenticated webhook delivery both ask Flutterwave for the transaction's actual details, then use the database's service-only settlement function. The database checks the order, owner, amount, currency and timestamp, and settlement is idempotent.

## Local checks

`node scripts/test-class-checkout.js` mocks all provider and Supabase HTTP calls. `node scripts/test-class-payment-ui.js` covers the browser checkout and retry flow. `node scripts/test-teacher-workspace.js` checks enrollment/payment behavior in local PostgreSQL. None of these charges a card or verifies a live account configuration.

References: [Flutterwave Standard](https://developer.flutterwave.com/docs/flutterwave-standard-1), [webhooks](https://developer.flutterwave.com/docs/webhooks), [verification by reference](https://developer.flutterwave.com/reference/verify-transaction-with-tx_ref).
