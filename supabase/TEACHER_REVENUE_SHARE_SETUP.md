# Teacher earnings share

Teachers receive 90% of newly recorded verified payments, rounded to the nearest kobo. ThinkRight retains the remainder, approximately 10%, before provider fees. New legacy-payment reconciliations also use 90%.

For an existing database, apply `teacher_revenue_share_90.sql` last, after all installed teacher, enrollment and settings migrations. It updates teacher profiles, defaults, pending-teacher insert policy, settlement and reconciliation functions. Existing earnings, payouts, access rules and payment retry protection are preserved. Reapplying the upgrade is safe.

A new ₦3,000 payment records ₦2,700 for the teacher. Previously recorded earnings retain their original amounts and share percentages.

Apply this migration in the hosted project's Supabase SQL editor before publishing the updated website. This local code change does not apply it to hosted Supabase. If older migrations are reapplied, apply this upgrade again last.
