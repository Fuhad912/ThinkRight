# Subject course enrollment

One purchase covers **one teacher's subject course**, including every published
topic classroom and its lessons. For example, paying for Ada's Physics course
unlocks her Mechanics and Waves classes. New published Physics topics from Ada
are included. Chemistry and another teacher's Physics course are separate.

## Apply

1. Back up the database, then run `subject_course_enrollment.sql` in the Supabase
   SQL Editor **after** `cohorts_schema.sql` and `teacher_workspace.sql`.
2. Deploy the updated `class-checkout` Edge Function and web files.
3. Run `npm.cmd run test:teacher` locally. Tests use a local PostgreSQL runtime
   and mock payment-provider requests; they never charge a card.

The additive migration also works on existing installations and can be rerun.
Do not rerun the original `teacher_workspace.sql` over an existing installation;
it creates tables and policies that already exist.

## Existing purchases and access

Existing enrollments are grouped by student, teacher and subject. One source
enrollment controls each course's access; active access is preferred during
backfill. The migration grants the other published topic classrooms without
creating payments or teacher earnings. Existing financial history is retained;
historical duplicate payments are not automatically refunded or rewritten.

The source enrollment's cancellation and expiry control the entire course.
Support can restore access by updating that source enrollment. Checkout refuses
to charge an inactive existing course again; restoration goes through support.
Unpublished lessons remain inaccessible to students.

Prices come from `subjects.enrollment_price`. Checkout reuses an unexpired pending
order for the same student/teacher/subject. Settlement verifies the amount,
currency, owner and payment timestamp, and records the teacher share once.
Orders snapshot the teacher and subject. Published course identities cannot be
changed to a different subject or teacher; create a new course for that instead.

Applying SQL and deploying the function are required for these changes to take
effect on the live site. Local source changes do not update Supabase by themselves.

For payment secrets, webhook setup, deployment commands and the test-mode acceptance flow, see [FLUTTERWAVE_CLASS_CHECKOUT_SETUP.md](FLUTTERWAVE_CLASS_CHECKOUT_SETUP.md).
