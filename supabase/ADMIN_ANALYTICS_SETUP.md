# Admin analytics

Open `admin-analytics.html` through the Analytics link in the admin header.

Apply `admin_analytics.sql` in the Supabase SQL editor after `admin_console.sql`, `test_results.sql` and `subject_course_enrollment.sql` and their documented prerequisites. It is safe to reapply. Deploy the new HTML, CSS and JavaScript with the website. No new service key or external analytics account is needed.

Only authenticated users with the server-side admin role can call either analytics function. The underlying learning-events view is not granted to website users. No access policies on students' raw records are relaxed.

Dates include both endpoints in Africa/Lagos, with an equal-length preceding comparison window. Ranges are limited to 366 days. People reports return 25 records per page; activity timelines return the latest 100 events in the period. Search matches names. Subject filters match practice subject IDs or names against the subject catalog; historical unmatched practice labels appear under All subjects.

Active learners are distinct students who completed a synced test or recorded a lesson completion. New student counts cover all subjects. Teacher and admin identities are excluded from student aggregates. Teacher published class and lesson totals, last activity dates, and attention counts describe the current platform; enrollments and earnings use the date range. Course enrollments count teacher + subject purchases/access grants, avoiding duplicate classroom memberships. Verified revenue uses the verified-payment earnings ledger timestamp; legacy reconciliations are excluded. Teacher earnings include recorded earnings from both sources. Average scores weight each completed test equally. These are practice scores, not externally verified examination results.

The app does not currently measure logins, browsing sessions, actual watch time, textbook opens, checkout abandonment or time online in this dashboard. Lesson completion reflects a recorded completion action, not proof that a video was watched. Historical records that were never synced cannot be reconstructed. No tracking instrumentation or live database migration is performed by opening the page.

Run `node scripts/test-admin-analytics.js` for migration, authorization, date boundaries, aggregates and report checks. Run `node scripts/test-admin-analytics-ui.js` for interaction and safe rendering checks.
