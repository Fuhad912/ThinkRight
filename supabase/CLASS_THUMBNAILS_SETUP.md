# Class thumbnails

Run `class_thumbnails.sql` in Supabase SQL Editor after the teacher workspace migrations, then deploy the website. The migration adds `cohorts.thumbnail_path`, the public `class-thumbnails` bucket, teacher upload policies and validation of draft images.

Teachers upload JPG, PNG or WebP files up to 3 MB from Class studio > Details. Use a landscape 16:9 cover. Save the draft and submit it for review. Approval publishes the cover with the class; removing or replacing a cover also requires approval. Existing classes keep working without an image and show a subject placeholder.

Only active teachers can upload into their own folder. Files are immutable and deliberately public, so upload only images intended for the student catalogue. Revisions validate file existence and teacher ownership. Unused uploads are retained so old approved covers are not accidentally deleted.

Local validation: `node scripts/test-class-specific.cjs` tests draft isolation, publication, removal, ownership rejection and repeatable migration alongside class payment access.
