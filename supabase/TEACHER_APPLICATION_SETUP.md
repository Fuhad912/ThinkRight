# Teacher application upgrade

For an existing workspace database, run `teacher_application_upgrade.sql` in the Supabase SQL Editor before deploying the updated web files. New installations receive the same changes from `teacher_workspace.sql`.

The upgrade adds a private `teacher_applications` table with read access limited to the applicant and administrators. Writes use the existing checked workspace RPC. Public tutor profiles do not expose application evidence.

Applicants provide full name, location, qualification, institution, qualification year, experience, credential evidence, JAMB background, teaching plan, weekly availability, recording setup and an accuracy declaration. Approval requires an administrator's review checklist and a written decision; reviewer identity and time are recorded. These are reviewer attestations, not automated credential verification.

Existing active teachers keep access. Existing pending teachers must complete the expanded application before approval. Reviewers should verify linked credentials and teaching claims before checking the approval boxes.

## Certificate document uploads

Run `teacher_document_upload.sql` in the Supabase SQL Editor before deploying the upload UI. It includes the application upgrade and current workspace RPCs, creates the private `teacher-credentials` bucket, sets a 5 MB per-file cap and allows only PDF/JPEG/PNG. No public URLs are stored. The application stores the object path and original filename. Reviewers and applicants request a signed download link valid for five minutes.

Upload access is restricted to each authenticated user's own folder. Only the applicant and administrators can read documents. Submitted documents cannot be overwritten or deleted by the applicant; a replacement uses a new object path. Existing link-only applications must upload a document before approval. This SQL has not been applied to a live Supabase project by the local build.
