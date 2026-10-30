/* Isolated publication/RLS checks and DOM interaction tests. No live writes. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { PGlite } = require('@electric-sql/pglite');

async function databaseTests() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      create table public.workspace_roles(user_id uuid primary key, role text);
      alter table public.workspace_roles enable row level security;
      create function public.workspace_admin() returns boolean language sql stable security definer set search_path = public as $$
        select exists(select 1 from workspace_roles where user_id=auth.uid() and role='admin'); $$;
      insert into workspace_roles values ('10000000-0000-4000-8000-000000000001','admin'),
        ('10000000-0000-4000-8000-000000000002','student'),('10000000-0000-4000-8000-000000000003','teacher');`);
    const migration = readFileSync('supabase/news.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    async function as(role) {
      await db.exec('reset role');
      const id = { admin: '1', student: '2', teacher: '3' }[role];
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ? `10000000-0000-4000-8000-00000000000${id}` : '']);
      await db.exec(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`);
    }
    const count = async () => (await db.query('select * from news_posts')).rows.length;
    await as('admin');
    const post = (await db.query("insert into news_posts(title,summary,body) values('Test update','A summary for students.','An original update with enough context for students.') returning *")).rows[0];
    assert.equal(post.status, 'draft'); assert.equal(post.published_at, null);
    for (const role of ['anon','student','teacher']) {
      await as(role); assert.equal(await count(), 0, `${role} cannot read drafts`);
      await assert.rejects(() => db.query("insert into news_posts(title,summary) values('Unauthorized','Not allowed')"), /permission denied|row-level security/);
    }
    await as('admin');
    const published = (await db.query("update news_posts set status='published', published_at='2000-01-01' where id=$1 returning *", [post.id])).rows[0];
    assert.ok(new Date(published.published_at).getFullYear() > 2000, 'publication time comes from database');
    await assert.rejects(() => db.query("insert into news_posts(title,summary,source_name) values('Outside news','Summary','Example Prep')"), /news_external_source/);
    await assert.rejects(() => db.query("insert into news_posts(title,summary,source_url) values('Bad link','Summary','javascript:alert(1)')"), /check constraint/);
    await assert.rejects(() => db.query("insert into news_posts(title,summary,status) values('Empty story','Summary','published')"), /news_readable_story/);
    const external = (await db.query("insert into news_posts(title,summary,status,source_name,source_url) values('External news','Our own summary','published','Example Prep','https://example.com/story') returning id")).rows[0];
    for (const role of ['anon','student','teacher']) { await as(role); assert.equal(await count(), 2, `${role} can read published stories`); }
    await as('student');
    assert.equal((await db.query("update news_posts set title='Tampered' where id=$1 returning id", [post.id])).rows.length, 0);
    assert.equal((await db.query('delete from news_posts where id=$1 returning id', [post.id])).rows.length, 0, 'non-admin cannot delete news');
    await as('admin');
    assert.equal((await db.query('select title from news_posts where id=$1', [post.id])).rows[0].title, 'Test update');
    await db.query("update news_posts set status='archived' where id=$1", [external.id]);
    await as('anon'); assert.equal(await count(), 1);
    // Seed historical expired content as the database owner; production timestamps are protected.
    await db.exec('reset role; alter table news_posts disable trigger news_post_timestamps');
    await db.query("insert into news_posts(title,summary,body,status,published_at,expires_at) values('Expired','Old deadline','This deadline has passed.','published',now()-interval '2 days',now()-interval '1 day')");
    await db.exec('alter table news_posts enable trigger news_post_timestamps');
    await as('anon'); assert.equal(await count(), 1, 'expired stories are private');
    await as('admin'); assert.equal(await count(), 3, 'admin can manage archived and expired stories');
    await db.query("update news_posts set status='draft' where id=$1", [post.id]);
    await as('anon'); assert.equal(await count(), 0, 'unpublishing removes public access');
    await as('admin');
    assert.equal((await db.query('delete from news_posts where id=$1 returning id', [external.id])).rows.length, 1, 'admin can permanently delete news');
    assert.equal(await count(), 2, 'deleted news is removed from the database');
    console.log('PASS: admin publishing, anonymous/student/teacher permissions, expiry, archive, validation, repeatable migration');
  } finally { await db.close(); }
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
async function page(html, posts, { reduced = false, error = null, search = '' } = {}) {
  const { document, window: domWindow } = parseHTML(html);
  let nextTimer = 0;
  const timers = new Map();
  const query = {};
  for (const method of ['select','eq','lte','or','order','range','limit']) query[method] = () => query;
  query.then = (resolve, reject) => Promise.resolve({ data: posts, error }).then(resolve, reject);
  const window = { authInitialized: true, supabase: { from: () => query }, addEventListener: () => {} };
  const context = vm.createContext({ window, document, URL, URLSearchParams, Date, console,
    location: { search }, matchMedia: () => ({ matches: reduced, addEventListener: () => {} }),
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(readFileSync('js/news.js','utf8'), context);
  document.dispatchEvent(new domWindow.Event('DOMContentLoaded')); await flush();
  return { document, domWindow, timers, context, window };
}
async function domTests() {
  const auth = readFileSync('login.html','utf8');
  const stories = [0,1,2].map(i => ({ id: `10000000-0000-4000-8000-00000000000${i}`, title: `Update ${i}`, summary: 'A short summary.', body: 'Full story.', category: 'jamb', source_name: 'ThinkRight', published_at: '2026-10-22T10:00:00Z' }));
  stories[1].title = '<img src=x onerror=alert(1)> A safe headline';
  const initial = parseHTML(auth).document;
  assert.equal(initial.querySelector('#auth-news').hasAttribute('hidden'), false, 'news is visible before JavaScript loads');
  assert.equal(initial.querySelector('.auth-visual-panel').hasAttribute('aria-hidden'), false, 'news is exposed to assistive technology');
  assert.ok(initial.querySelector('.auth-visual-panel.has-news'), 'news is shown on the mobile layout');
  const test = await page(auth, stories);
  const root = test.document.querySelector('#auth-news');
  assert.equal(root.hidden, false); assert.equal(root.querySelectorAll('.news-slide').length, 3);
  assert.equal(root.classList.contains('is-empty'), false);
  assert.equal(root.querySelectorAll('.news-slide[aria-hidden="false"]').length, 1);
  assert.equal(root.querySelector('img'), null, 'news content is escaped');
  assert.equal(root.querySelector('a'), null, 'auth news stays on the page');
  assert.equal(root.querySelector('.news-slide[aria-hidden="false"] .news-summary').textContent, 'A short summary.');
  assert.equal(test.timers.size, 1);
  root.dispatchEvent(new test.domWindow.Event('focusin'));
  assert.equal(test.timers.size, 0, 'focus pauses rotation');
  root.dispatchEvent(new test.domWindow.Event('focusout'));
  assert.equal(test.timers.size, 1);
  root.querySelector('[data-news="next"]').click();
  assert.equal(root.querySelector('.news-current').textContent, '02');
  assert.equal(test.timers.size, 0, 'manual navigation stays paused');
  assert.match(root.querySelector('[aria-hidden="false"] .news-headline').textContent, /<img/);
  root.querySelector('[data-news="previous"]').click();
  assert.equal(root.querySelector('.news-current').textContent, '01');
  root.querySelector('[data-news="previous"]').click();
  assert.equal(root.querySelector('.news-current').textContent, '03', 'previous wraps');
  root.querySelector('[data-news="pause"]').click();
  assert.equal(test.timers.size, 1, 'explicit play resumes');
  const headline = root.querySelector('.news-slide[aria-hidden="false"] .news-headline');
  const touchStart = new test.domWindow.Event('touchstart', { bubbles: true });
  touchStart.touches = [{ clientX: 200, clientY: 100 }]; headline.dispatchEvent(touchStart);
  const touchEnd = new test.domWindow.Event('touchend', { bubbles: true });
  touchEnd.changedTouches = [{ clientX: 100, clientY: 103 }]; headline.dispatchEvent(touchEnd);
  assert.equal(root.querySelector('.news-current').textContent, '01', 'swiping a headline changes the story');
  const click = new test.domWindow.Event('click', { bubbles: true, cancelable: true }); headline.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true, 'swiping does not open the headline');
  root.dispatchEvent(new test.domWindow.Event('focusin'));
  root.querySelector('[data-news="pause"]').click();
  assert.equal(test.timers.size, 1, 'keyboard users can explicitly resume while focused');
  assert.equal(root.querySelector('.news-slides').getAttribute('aria-live'), 'off', 'automatic rotation does not repeatedly announce headlines');
  const reduced = await page(auth, stories, { reduced: true }); assert.equal(reduced.timers.size, 0);
  const single = await page(auth, stories.slice(0,1)); assert.equal(single.timers.size, 0); assert.equal(single.document.querySelector('.news-controls').hidden, true);
  const empty = await page(auth, []);
  assert.equal(empty.document.querySelector('#auth-news').hidden, false);
  assert.equal(empty.document.querySelector('#auth-news').classList.contains('is-empty'), true);
  assert.match(empty.document.querySelector('#auth-news-status').textContent, /No updates have been published yet/);
  const failed = await page(auth, [], { error: { message: 'Offline' } });
  assert.equal(failed.document.querySelector('#auth-news').hidden, false);
  assert.match(failed.document.querySelector('#auth-news-status').textContent, /couldn’t load right now/);
  const archive = await page(readFileSync('news.html','utf8'), stories); assert.equal(archive.document.querySelectorAll('.news-list-item').length, 3);
  const story = await page(readFileSync('news.html','utf8'), [{ ...stories[0], body: '<script>alert(1)</script>', source_url: 'javascript:alert(1)' }], { search: '?story=' + stories[0].id });
  assert.equal(story.document.querySelector('.news-story-body script'), null); assert.equal(story.document.querySelector('.news-source'), null);
  const missing = await page(readFileSync('news.html','utf8'), [], { search: '?story=' + stories[0].id }); assert.match(missing.document.querySelector('#news-content').textContent, /no longer available/);
  console.log('PASS: carousel navigation, pause/play, reduced motion, one/zero stories, offline fallback, archive, XSS-safe rendering');
}

async function adminTests() {
  const test = await page('<html><body><section id="admin-news"></section></body></html>', []);
  const records = [];
  let offline = false;
  test.context.FormData = class {
    constructor(form) { this.form = form; }
    *[Symbol.iterator]() {
      for (const element of this.form.querySelectorAll('input[name],textarea[name],select[name]')) {
        if (element.type === 'checkbox') { if (element.checked || element.hasAttribute('checked')) yield [element.name, 'on']; }
        else yield [element.name, element.value || ''];
      }
    }
  };
  let confirmDelete = true;
  test.context.confirm = () => confirmDelete;
  test.window.supabase.from = () => {
    let payload, update = false, deleting = false, id, status;
    const query = {
      select: () => query, order: () => query, range: () => query,
      eq: (key, value) => { if (key === 'id') id = value; if (key === 'status') status = value; return query; },
      insert: value => { payload = value; return query; },
      update: value => { payload = value; update = true; return query; },
      delete: () => { deleting = true; return query; },
      then(resolve, reject) {
        if (offline) return Promise.resolve({ data: null, error: { message: 'Connection interrupted' } }).then(resolve, reject);
        let data;
        if (deleting) {
          const index = records.findIndex(r => r.id === id);
          data = index < 0 ? [] : [{ id: records.splice(index, 1)[0].id }];
        } else if (payload) {
          let record = update ? records.find(r => r.id === id) : null;
          if (!update) { record = { id: '10000000-0000-4000-8000-000000000001', created_at: new Date().toISOString() }; records.push(record); }
          if (record) Object.assign(record, payload, { published_at: record.published_at || (payload.status === 'published' ? new Date().toISOString() : null) });
          data = record ? [{ ...record }] : [];
        } else data = records.filter(r => !status || r.status === status).map(r => ({ ...r }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return query;
  };
  vm.runInContext(readFileSync('js/admin-news.js','utf8'), test.context);
  const host = test.document.querySelector('#admin-news');
  await test.window.ThinkRightAdminNews.mount(host);
  host.querySelector('#news-create').click();
  function fill(name, value) {
    const el = host.querySelector(`[name="${name}"]`); el.value = value;
    el.dispatchEvent(new test.domWindow.Event('input', { bubbles: true }));
  }
  async function submit(decision) {
    const form = host.querySelector('form');
    const event = new test.domWindow.Event('submit', { bubbles: true, cancelable: true });
    event.submitter = form.querySelector(`[value="${decision}"]`);
    // Linkedom does not reflect HTMLButtonElement.value; browsers do.
    event.submitter.value = decision;
    form.dispatchEvent(event); await flush();
  }
  fill('title', '<img src=x> A useful update'); fill('summary', 'A summary for students.'); fill('source_name', 'Example Prep');
  assert.equal(host.querySelector('#news-live-preview img'), null);
  await submit('published'); assert.equal(records.length, 0); assert.match(host.textContent, /original source link/);
  fill('source_url', 'HTTPS://example.com/article');
  await submit('draft'); assert.equal(records[0].status, 'draft'); assert.equal(records[0].source_url, 'https://example.com/article');
  host.querySelector('[data-news-edit]').click();
  await submit('published'); assert.equal(records[0].status, 'published', host.textContent); assert.match(host.textContent, /now available to students/);
  host.querySelector('[data-news-archive]').click(); await flush(); assert.equal(records[0].status, 'archived');
  host.querySelector('[data-news-edit]').click(); fill('title', 'Keep this unsaved change');
  offline = true; await submit('draft');
  assert.equal(host.querySelector('[name="title"]').value, 'Keep this unsaved change'); assert.match(host.textContent, /Connection interrupted/);
  offline = false; await submit('draft'); assert.equal(records[0].title, 'Keep this unsaved change'); assert.equal(records[0].status, 'draft');
  confirmDelete = false; host.querySelector('[data-news-delete]').click(); await flush(); assert.equal(records.length, 1, 'cancel preserves the update');
  confirmDelete = true; offline = true; host.querySelector('[data-news-delete]').click(); await flush();
  assert.equal(records.length, 1, 'failed delete preserves the update'); assert.match(host.textContent, /Connection interrupted/);
  offline = false; host.querySelector('[data-news-delete]').click(); await flush();
  assert.equal(records.length, 0, 'confirmed delete removes the update'); assert.match(host.textContent, /permanently deleted/);
  console.log('PASS: admin preview, source validation, draft/publish/archive/delete, link normalization, failed-save recovery');
}
(async () => { await databaseTests(); await domTests(); await adminTests(); })().catch(error => { console.error(error); process.exitCode = 1; });
