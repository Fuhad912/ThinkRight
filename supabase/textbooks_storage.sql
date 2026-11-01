-- Run once in the Supabase SQL Editor for the ThinkRight project.
-- Keep the textbooks bucket private. Signed-in students can request short-lived
-- links for the books listed in the student library.
insert into storage.buckets (id, name, public)
values ('textbooks', 'textbooks', false)
on conflict (id) do nothing;

drop policy if exists "Signed-in students can read textbooks" on storage.objects;
create policy "Signed-in students can read textbooks"
on storage.objects
for select
to authenticated
using (bucket_id = 'textbooks' and (public.workspace_identity()->>'role') = 'student');
