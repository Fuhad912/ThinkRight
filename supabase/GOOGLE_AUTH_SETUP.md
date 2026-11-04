# Google OAuth production configuration

Production origin: **https://thinkright.com.ng**.

On 2026-11-04 the live Supabase project still used `http://localhost:5500` as its Site URL. Its redirect allowlist contained development URLs and the obsolete `.name.ng` domain, but no `.com.ng` callbacks. This caused production OAuth returns to fall back to localhost for both login and signup.

Corrected the live Auth configuration through the Management API:

- Site URL: `https://thinkright.com.ng`
- Additional production redirect URLs: `https://thinkright.com.ng` and `https://thinkright.com.ng/**`
- Preserved the existing localhost development entries and removed obsolete `.name.ng` entries.
- Preserved the enabled Google provider, its existing client ID/secret, and signup availability.

Both login and signup return through `login.html`; query parameters preserve the requested role, signup intent, and next destination. The production wildcard is necessary for those parameterized callbacks.

Google Cloud's OAuth web client must authorize this redirect URI:

`https://hqroqfkabptqwpqpplln.supabase.co/auth/v1/callback`

Verified both production login and signup authorize requests return HTTP 302 to `accounts.google.com` with this Supabase callback URI. The live Auth configuration was read back after updating. Full account selection, consent, and post-login routing require a real user sign-in and were not completed automatically.

After changing redirect settings, start a fresh Google sign-in from the production login page; an already-open Google flow may retain its previous redirect target. Test student login, student signup with policy acceptance, teacher signup, and cancellation/error recovery. Never include OAuth state, authorization codes, sessions, or provider secrets in logs or commits.

The Edge Function `SITE_URL` secret is separate from Supabase Authentication's Site URL. Updating only the function secret does not fix OAuth redirects.
