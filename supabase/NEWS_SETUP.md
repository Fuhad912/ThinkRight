# Website news

Apply `news.sql` in the Supabase SQL Editor after `teacher_workspace.sql`. The migration is repeatable and creates `news_posts`, publication timestamps, and row-level permissions. It does not publish sample stories or send email.

Existing admins (accounts with `workspace_roles.role = 'admin'`) can open **Administration → Website news** (`admin.html#news`).

1. Write a headline and summary, choose a category, and name the source.
2. For another publisher, add the original HTTPS article link and write your own summary. For a ThinkRight update, supply the full text or a source link.
3. Save a draft or publish. Optional expiry hides time-sensitive stories automatically. Featured stories take priority in the auth carousel, which shows at most five current stories.
4. Archive removes a story from public access; edit and publish it again to restore it. “Unpublish to draft” also removes a live story from public access. Delete permanently removes a story after confirmation and cannot be undone.

`news.html` is a public, paginated archive with category filters. `news.html?story=<id>` opens a story without sign-in. Drafts, expired and archived posts are blocked by database policies for non-admin readers, including direct API requests. The public pages also filter statuses explicitly when an administrator is reading them.

The auth page always shows the ThinkRight Brief. It displays a clear empty or unavailable state until a story is published, then shows the rotating headlines. Email alerts remain a separate, explicit admin action.

Local validation: `npm run test:news` and `npm run build:web`. The SQL tests use an isolated in-memory PostgreSQL database and do not contact production.
