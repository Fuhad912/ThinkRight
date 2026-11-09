# Class removal

Apply class_removal.sql in Supabase SQL Editor after course_studio.sql and its title and owner-id fixes. Safe to run again. Deploy the website afterward. Do not rerun older workspace or enrollment migrations afterward.

The trash icon on My classes opens a confirmation. Teachers can remove drafts and published classes without enrollment or paid-payment records. Withdraw submissions before deleting. An unexpired pending payment blocks immediate deletion.

Classes with enrollment or payment records require a reason and admin review. Requests appear in Administration → Class reviews. Admins can keep or retire the class with a reason. Retirement stops new enrollments and prevents republishing. Existing students retain lessons, conversation and private video playback; pending payments can still settle.

Removal hides unused classes with a stored timestamp. No lesson, upload, enrollment, payment or earnings rows are physically deleted. Decisions are audited.

Local checks: node scripts/test-course-studio.cjs and node scripts/test-teacher-ui.js. After deployment, verify confirmation, removal requests, admin decisions and enrolled student playback on the actual site.
