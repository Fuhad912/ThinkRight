# Class enrolment

Students make a one-time purchase of a specific teacher's class. The subject price remains centrally set by admin. Other classes, including classes by the same teacher, require separate enrolment. CBT subscriptions are separate.

For an existing installation, run `class_specific_enrollment.sql` in Supabase SQL Editor after `subject_course_enrollment.sql`. Do not rerun the older subject migration afterwards. Deploy the updated `class-checkout` Edge Function and website together with this migration.

Existing enrollment rows and financial records are retained, including access previously granted under subject bundles. New purchases and newly published classes do not inherit subject-wide access. Existing pending orders settle against their recorded class, teacher, price and subject; coordinate rollout so students have no in-flight checkout under the old bundle wording.

Flutterwave verification grants access only to the purchased class and records 70% of the payment for its teacher. Payouts remain manual. Repeated verification of the same payment does not duplicate earnings.

Local checks: `node scripts/test-class-specific.cjs` and `node scripts/test-class-checkout.js`.
