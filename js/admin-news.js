/* Admin-only publishing UI. Database RLS is the authorization boundary. */
(() => {
  'use strict';
  let dirty = false, activeHost;
  const N = () => window.ThinkRightNews;
  function leaving(event) {
    if (!dirty || !activeHost?.isConnected) return;
    const link = event.target.closest('a[href],button[data-action="admin-tab"]');
    if (!link || link.target === '_blank' || activeHost.contains(link)) return;
    if (!confirm('Leave without saving this news draft?')) { event.preventDefault(); event.stopImmediatePropagation(); }
    else dirty = false;
  }
  document.addEventListener('click', leaving, true);
  window.addEventListener('beforeunload', event => { if (dirty && activeHost?.isConnected) { event.preventDefault(); event.returnValue = ''; } });

  async function mount(host) {
    if (!host || host.dataset.mounted) return;
    host.dataset.mounted = 'true'; activeHost = host; dirty = false;
    const { esc, categories, date, client, result, columns, safeURL, brief } = N();
    let rows = [], filter = '', offset = 0, request = 0, busy = false;
    const options = (values, current) => Object.entries(values).map(([key, label]) => `<option value="${key}" ${key === current ? 'selected' : ''}>${esc(label)}</option>`).join('');
    const statusOf = post => post.status === 'published' && post.expires_at && new Date(post.expires_at) <= new Date() ? 'expired' : post.status;
    function message(text, error = false) { const el = host.querySelector('#news-admin-feedback'); if (el) { el.textContent = text; el.dataset.error = String(error); } }
    function errorMessage(error) {
      return /could not find.*news_posts|relation.*news_posts.*does not exist|schema cache/i.test(error.message) ? 'Website news setup is not complete. Apply supabase/news.sql to your Supabase project, then try again.' : error.message;
    }
    function row(post) {
      const status = statusOf(post);
      return `<article class="news-admin-row"><div><span class="news-admin-status ${status}"><i class="fa-solid ${status === 'published' ? 'fa-circle-check' : 'fa-file-lines'}" aria-hidden="true"></i> ${status}${post.featured ? ' · Featured' : ''}</span><h3>${esc(post.title)}</h3><p>${esc(post.source_name)} &middot; ${date(post.published_at || post.created_at)}</p></div><div class="news-admin-actions"><button type="button" class="tw-button" data-news-edit="${post.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit<span class="news-sr-only"> ${esc(post.title)}</span></button>${post.status !== 'archived' ? `<button type="button" class="tw-button" data-news-archive="${post.id}" aria-label="Archive ${esc(post.title)}"><i class="fa-solid fa-box-archive" aria-hidden="true"></i> Archive</button>` : ''}<button type="button" class="tw-button news-admin-delete" data-news-delete="${post.id}" aria-label="Permanently delete ${esc(post.title)}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Delete</button></div></article>`;
    }
    function listShell() {
      dirty = false;
      host.innerHTML = `<header class="news-admin-head"><div><h2>The publishing desk</h2><p>Choose the stories students see on the sign-in page and in the news feed.</p></div><button type="button" class="tw-button primary" id="news-create"><i class="fa-solid fa-plus" aria-hidden="true"></i> Write an update</button></header><nav class="news-filters" aria-label="Filter publication status">${Object.entries({ '': 'All stories', draft: 'Drafts', published: 'Published', archived: 'Archived' }).map(([key, label]) => `<button type="button" data-news-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join('')}</nav><div id="news-admin-feedback" class="news-admin-feedback" role="status" aria-live="polite"></div><div class="news-admin-list" id="news-admin-list"></div><button class="tw-button" type="button" id="news-admin-more" hidden>Load more</button>`;
      host.querySelector('#news-create').onclick = () => { if (!busy) editor(); };
      host.querySelector('#news-admin-more').onclick = () => load();
      host.querySelector('.news-filters').onclick = event => {
        const button = event.target.closest('[data-news-filter]'); if (!button || busy) return;
        filter = button.dataset.newsFilter; listShell(); load(true);
      };
    }
    async function load(reset = false) {
      if (reset) { offset = 0; rows = []; }
      const version = ++request;
      const more = host.querySelector('#news-admin-more');
      more.disabled = true; message('Loading stories…');
      try {
        let query = client().from('news_posts').select(columns);
        if (filter) query = query.eq('status', filter);
        const posts = await result(query.order('created_at', { ascending: false }).order('id').range(offset, offset + 29));
        if (!host.isConnected || version !== request || !host.querySelector('#news-admin-list')) return;
        rows.push(...posts); offset += posts.length;
        host.querySelector('#news-admin-list').innerHTML = rows.map(row).join('');
        message(rows.length ? '' : 'No stories yet. Write your first update and save it as a draft or publish it.');
        more.hidden = posts.length < 30; more.textContent = 'Load more';
      } catch (error) { if (version === request) { message(errorMessage(error), true); more.hidden = false; more.textContent = 'Try again'; } }
      finally { more.disabled = false; }
    }
    function editor(post = {}) {
      ++request;
      const input = (label, name, value = '', extra = '') => `<label class="tw-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${extra}></label>`;
      let expiry = '';
      if (post.expires_at) { const d = new Date(post.expires_at); expiry = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
      host.innerHTML = `<header class="news-admin-head"><div><h2>${post.id ? 'Edit update' : 'Write an update'}</h2><p>${post.status === 'published' ? 'Publishing changes updates this live story immediately.' : 'Start with a clear headline and the details students need.'}</p></div><button type="button" class="tw-button" id="news-editor-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All stories</button></header><div class="news-admin-editor"><form class="news-admin-form" id="news-editor-form">
        ${input('Headline', 'title', post.title, 'required maxlength="70" placeholder="What do students need to know?"')}
        <label class="tw-field"><span>Short update</span><textarea name="summary" rows="5" required minlength="20" maxlength="600" placeholder="Write the update students need to know.">${esc(post.summary || '')}</textarea><small>20–600 characters. Students read this in the news card.</small></label>
        <label class="tw-field"><span>Category</span><select name="category">${options(categories, post.category || 'jamb')}</select></label>
        <div class="news-admin-pair">${input('Source name', 'source_name', post.source_name || 'ThinkRight', 'required maxlength="80"')}${input('Source link', 'source_url', post.source_url, 'type="url" maxlength="2048" placeholder="https://…"')}</div>
        <small>Link to the original article when sharing another publisher’s news. Write your own summary.</small>
        ${input('Hide after (optional, your local time)', 'expires_at', expiry, 'type="datetime-local"')}
        <label class="news-admin-check"><input type="checkbox" name="featured" ${post.featured ? 'checked' : ''}> Prioritize in the auth-page rotation</label>
        <small>The rotation shows up to five current updates, with featured stories first.</small>
        <div id="news-admin-feedback" class="news-admin-feedback" role="status" aria-live="polite"></div>
        <div class="news-admin-actions"><button class="tw-button" type="submit" name="decision" value="draft">${post.status === 'published' ? 'Unpublish to draft' : 'Save draft'}</button><button class="tw-button primary" type="submit" name="decision" value="published"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${post.status === 'published' ? 'Publish changes' : 'Publish update'}</button></div>
        </form><aside class="news-admin-preview" aria-label="Sign-in card preview"><p>Sign-in card preview</p><div id="news-live-preview"></div></aside></div>`;
      const form = host.querySelector('#news-editor-form');
      function preview() {
        const fields = Object.fromEntries(new FormData(form));
        host.querySelector('#news-live-preview').innerHTML = brief({ ...fields, title: fields.title || 'Your next headline goes here.', summary: fields.summary || 'Give students the essential update in a sentence or two.', published_at: post.published_at || new Date().toISOString() });
      }
      form.addEventListener('input', () => { dirty = true; preview(); });
      host.querySelector('#news-editor-back').onclick = () => {
        if (busy || (dirty && !confirm('Leave without saving this news draft?'))) return;
        listShell(); load(true);
      };
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        const fields = Object.fromEntries(new FormData(form));
        const payload = { title: fields.title.trim(), summary: fields.summary.trim(), body: fields.summary.trim(), category: fields.category, source_name: fields.source_name.trim(), source_url: fields.source_url.trim() || null, expires_at: fields.expires_at ? new Date(fields.expires_at).toISOString() : null, featured: fields.featured === 'on', status: event.submitter?.value === 'published' ? 'published' : 'draft' };
        if (!payload.title || !payload.summary || !payload.source_name) { message('Add a headline, summary and source name.', true); return; }
        if (payload.source_url && !safeURL(payload.source_url)) { message('Use a full HTTPS source link without a username or password.', true); return; }
        if (payload.source_url) payload.source_url = safeURL(payload.source_url);
        if (payload.source_name.toLowerCase() !== 'thinkright' && !payload.source_url) { message('Add the original source link for this publisher.', true); return; }
        if (payload.status === 'published' && payload.summary.length < 20) { message('Write a useful update of at least 20 characters before publishing.', true); return; }
        if (payload.status === 'published' && payload.expires_at && new Date(payload.expires_at) <= new Date()) { message('Choose a future expiry time or clear it before publishing.', true); return; }
        busy = true; form.querySelectorAll('button,input,textarea,select').forEach(control => { control.disabled = true; }); message('Saving update…');
        try {
          const query = post.id ? client().from('news_posts').update(payload).eq('id', post.id) : client().from('news_posts').insert(payload);
          const saved = await result(query.select('id'));
          if (!saved.length) throw new Error('This update could not be saved. Check your admin access and try again.');
          dirty = false;
          if (!host.isConnected) return;
          filter = ''; listShell(); await load(true);
          message(payload.status === 'published' ? 'Published. Your update is now available to students.' : 'Draft saved. It is hidden from students.');
        } catch (error) { message(errorMessage(error), true); }
        finally { busy = false; form.querySelectorAll('button,input,textarea,select').forEach(control => { control.disabled = false; }); }
      });
      preview(); form.querySelector('[name="title"]').focus();
    }
    host.addEventListener('click', async event => {
      if (busy) return;
      const edit = event.target.closest('[data-news-edit]'), archive = event.target.closest('[data-news-archive]'), remove = event.target.closest('[data-news-delete]');
      if (edit) { const post = rows.find(p => p.id === edit.dataset.newsEdit); if (post) editor(post); }
      if (archive) {
        busy = true; archive.disabled = true;
        try {
          const saved = await result(client().from('news_posts').update({ status: 'archived' }).eq('id', archive.dataset.newsArchive).select('id'));
          if (!saved.length) throw new Error('Could not archive this update. Check your admin access.');
          await load(true); message('Archived and hidden from students. You can edit it to publish again.');
        } catch (error) { message(errorMessage(error), true); }
        finally { busy = false; archive.disabled = false; }
      }
      if (remove) {
        const post = rows.find(p => p.id === remove.dataset.newsDelete);
        if (!post || !confirm(`Permanently delete “${post.title}”? This cannot be undone. Archive it instead if you may need it later.`)) return;
        busy = true; remove.disabled = true;
        try {
          const deleted = await result(client().from('news_posts').delete().eq('id', post.id).select('id'));
          if (!deleted.length) throw new Error('Could not delete this update. Check your admin access and try again.');
          await load(true); message('Update permanently deleted.');
        } catch (error) { message(errorMessage(error), true); }
        finally { busy = false; if (remove.isConnected) remove.disabled = false; }
      }
    });
    listShell(); await load(true);
  }
  window.ThinkRightAdminNews = { mount };
})();
