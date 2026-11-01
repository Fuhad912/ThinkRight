# Admin console setup

Apply `admin_console.sql` in the Supabase SQL Editor after the existing teacher document and subject course migrations. This is an additive migration; do not rerun the original workspace installation on an existing database.

The migration adds the textbook catalog, seeds the existing Physics entry, protects catalog editing and uploads with `workspace_admin()`, and exposes an admin-only payment summary and paginated order history. It can be run again safely. It does not create admin users or change anyone's role.

Publish the updated web build. In Admin → Textbooks, upload a PDF (up to 50 MB), supply a cover image HTTPS URL, select a subject, and publish. The student library reads the published catalog. Unpublishing removes the book and prevents new student download links. Previously issued links remain usable until their expiry.

Payments shows verified class orders and pending/expired checkout records. It cannot mark an order as paid or transfer funds. Flutterwave verification and the existing settlement function remain authoritative. Payouts continues to record completed external transfers.

The dashboard reports class checkout revenue only; historical reconciled payments are handled in Reconciliation. Admin data is unavailable until this migration is applied. No live database changes are made by the web build.
