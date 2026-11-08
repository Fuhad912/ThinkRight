# Course studio rollout

The production editor is tutor-class.html. The design preview remains available separately.

## Database

Run **course_studio.sql** in the Supabase SQL Editor after the existing class-specific enrollment, thumbnail, private video and 90% revenue-share migrations. This migration is transactional and safe to run again. Do not rerun older workspace or enrollment migrations afterward.

Prerequisites already used by the site: teacher_workspace.sql, teacher application/settings upgrades, subject_course_enrollment.sql, class_specific_enrollment.sql, class_thumbnails.sql, lesson_videos.sql, and teacher_revenue_share_90.sql. Keep the installed lesson-video Edge Function and R2 configuration. No replacement Edge Function or new secrets are needed.

The migration adds course metadata and suggested prices, preserves the installed workspace action behind a private wrapper, and updates order pricing without removing the video enrollment guard. Existing enrollments, recorded earnings, pending payment amounts and published recordings remain intact. Legacy courses retain their existing price behavior until updated through review.

## Website

Deploy the website only after the database migration succeeds. Use the normal website build. Changed runtime files: tutor-class.html, admin.html, classes.html, cohort.html, js/course-studio.js, js/teacher-workspace.js, css/teacher-studio.css, js/classes.js and js/cohort.js. GitHub pushes remain paused.

## Behavior

- Setup uses applied teaching subjects, focused topic or complete subject scope, learning outcomes and a cover. The cover is required at submission, not navigation or draft saving.
- One empty lesson initially; additional lessons are added below the list. Each lesson requires its title, topic and a ready private recording.
- Teachers propose a course price. Admins approve that price or suggest a different one with feedback. A different price publishes only after the teacher accepts the current offer. Teachers can request a different price with a note, or withdraw to edit the course.
- Approved course prices drive catalog/checkout. Subject-wide price changes do not overwrite them. Teacher earnings remain 90%.
- The existing classroom hosts the ongoing enrolled-student/teacher conversation. It refreshes every ten seconds while visible and shows the latest 100 messages. No WhatsApp group is required. Published teacher courses link to the conversation.
- Existing courses require explicit type, outcomes, cover and uploaded recordings when next submitted. Published subject cannot change underneath purchases.

## Verification

Run node scripts/test-course-studio.cjs and node scripts/test-course-studio-ui.cjs, plus the existing video and checkout checks. These use an isolated local database, not production.

After deployment, smoke-test save/reload, a real upload and playback, admin review, a changed price and teacher acceptance, student checkout, and conversation permissions. Verify at 320px, 390px and desktop widths in both themes. Automated browser visual verification was unavailable in this session.
