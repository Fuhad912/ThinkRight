Teacher Settings lives at `tutor-settings.html`.

- Apply `teacher_settings.sql` to enable authenticated name and subject updates. The function only edits the caller's teacher record and name metadata; it preserves approval, application evidence and classes.
- Deploy `supabase/functions/delete-teacher-account/index.ts` as `delete-teacher-account`, with gateway JWT verification disabled. The handler validates the user's token with Supabase Auth and checks the authoritative workspace role itself.
- The endpoint uses the standard Supabase URL, anonymous key and service-role key already available to Edge Functions. No service credentials are shipped to the browser.
- Deletion requires the literal confirmation `DELETE` and a teacher sign-in within the preceding ten minutes. It uses Supabase Auth's irreversible soft deletion to remove sign-in while retaining teaching and payment relationships, private lessons and existing student access. It does not claim to erase all retained teaching records. See [Supabase's deletion API](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
- Password reset links use `https://thinkright.com.ng/reset-password.html`.

Validation: `node scripts/test-teacher-settings.js`. Tests use an isolated database and mocked Auth requests. Never test successful deletion with an owner's or real teacher's account.
