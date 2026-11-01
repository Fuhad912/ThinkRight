-- Apply after teacher_workspace.sql. News is curated by ThinkRight administrators.
begin;

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 140),
  summary text not null check (char_length(trim(summary)) between 1 and 600),
  body text not null default '' check (char_length(body) <= 16000),
  category text not null default 'jamb' check (category in ('jamb','admissions','exam_prep','announcement')),
  source_name text not null default 'ThinkRight' check (char_length(trim(source_name)) between 1 and 80),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_external_source check (lower(trim(source_name)) = 'thinkright' or source_url is not null),
  constraint news_readable_story check (status <> 'published' or source_url is not null or char_length(trim(body)) >= 20),
  constraint news_publication_date check (status <> 'published' or published_at is not null),
  constraint news_expiry check (expires_at is null or published_at is null or expires_at > published_at)
);

-- Upgrade the limit on existing installations as well as fresh ones.
alter table public.news_posts drop constraint if exists news_posts_summary_check;
alter table public.news_posts add constraint news_posts_summary_check
  check (char_length(trim(summary)) between 1 and 600);

create index if not exists news_posts_feed on public.news_posts (featured desc, published_at desc, id) where status = 'published';
alter table public.news_posts enable row level security;
revoke all on public.news_posts from anon, authenticated;
grant select on public.news_posts to anon, authenticated;
grant insert, update, delete on public.news_posts to authenticated;

drop policy if exists news_public_read on public.news_posts;
create policy news_public_read on public.news_posts for select to anon, authenticated
  using (status = 'published' and published_at <= now() and (expires_at is null or expires_at > now()));
drop policy if exists news_admin_read on public.news_posts;
create policy news_admin_read on public.news_posts for select to authenticated using (public.workspace_admin());
drop policy if exists news_admin_insert on public.news_posts;
create policy news_admin_insert on public.news_posts for insert to authenticated with check (public.workspace_admin());
drop policy if exists news_admin_update on public.news_posts;
create policy news_admin_update on public.news_posts for update to authenticated
  using (public.workspace_admin()) with check (public.workspace_admin());
drop policy if exists news_admin_delete on public.news_posts;
create policy news_admin_delete on public.news_posts for delete to authenticated
  using (public.workspace_admin());

create or replace function public.news_post_timestamps() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if TG_OP = 'INSERT' then
    new.created_at := now();
    new.published_at := case when new.status = 'published' then now() else null end;
  else
    new.created_at := old.created_at;
    new.published_at := coalesce(old.published_at, case when new.status = 'published' then now() else null end);
  end if;
  return new;
end;
$$;
drop trigger if exists news_post_timestamps on public.news_posts;
create trigger news_post_timestamps before insert or update on public.news_posts
  for each row execute function public.news_post_timestamps();

commit;
