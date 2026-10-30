/* Public news: one source of truth for the auth carousel, archive and admin editor. */
(() => {
  'use strict';
  const categories = { jamb: 'JAMB news', admissions: 'Admissions', exam_prep: 'Exam prep', announcement: 'ThinkRight' };
  const columns = 'id,title,summary,body,category,source_name,source_url,status,featured,published_at,expires_at,created_at,updated_at';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeURL = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  };
  const date = value => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : 'Not published';
  function client() {
    if (!window.authInitialized) window.ThinkRightAuth?.initSupabase();
    if (typeof window.supabase?.from !== 'function') throw new Error('News is unavailable. Please try again.');
    return window.supabase;
  }
  async function result(query) {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }
  function publicQuery() {
    const now = new Date().toISOString();
    return client().from('news_posts').select(columns).eq('status', 'published')
      .lte('published_at', now).or(`expires_at.is.null,expires_at.gt.${now}`);
  }
  async function published({ offset = 0, limit = 12, category = '', carousel = false } = {}) {
    let query = publicQuery();
    if (category) query = query.eq('category', category);
    if (carousel) query = query.order('featured', { ascending: false });
    return result(query.order('published_at', { ascending: false }).order('id').range(offset, offset + limit - 1));
  }
  const href = post => `news.html?story=${encodeURIComponent(post.id)}`;
  const meta = post => `<span>${esc(categories[post.category] || 'Update')}</span><span aria-hidden="true">&middot;</span><span>${esc(post.source_name)}</span><span aria-hidden="true">&middot;</span><time datetime="${esc(post.published_at || '')}">${date(post.published_at)}</time>`;
  function article(post, heading = 'h2') {
    return `<span class="news-category">${esc(categories[post.category] || 'Update')}</span>
      <${heading} class="news-headline"><a href="${href(post)}">${esc(post.title)}</a></${heading}>
      <p class="news-summary">${esc(post.summary)}</p><div class="news-meta">${meta(post)}</div>`;
  }
  function brief(post) {
    return `<h2 class="news-headline">${esc(post.title)}</h2>
      <p class="news-summary">${esc(post.summary)}</p><div class="news-meta">${meta(post)}</div>`;
  }
  window.ThinkRightNews = { categories, esc, safeURL, date, client, result, published, columns, article, brief };

  async function initCarousel(root) {
    let posts;
    const status = root.querySelector('#auth-news-status');
    try { posts = await published({ limit: 5, carousel: true }); }
    catch { if (status) status.textContent = 'Updates couldn’t load right now. Please try again later.'; return; }
    if (!posts.length) { if (status) status.textContent = 'No updates have been published yet. Check back soon.'; return; }
    root.classList.remove('is-empty');
    root.setAttribute('aria-label', 'Latest JAMB and exam updates');
    root.setAttribute('aria-roledescription', 'carousel');
    root.innerHTML = `<header class="news-carousel-head"><span><i class="fa-regular fa-newspaper" aria-hidden="true"></i> The ThinkRight Brief</span></header>
      <p class="news-carousel-intro">A little insight.<br>A step ahead.</p>
      <div class="news-slides" aria-live="off">${posts.map((p, i) => `<article class="news-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${posts.length}" ${i ? 'inert aria-hidden="true"' : 'aria-hidden="false"'}>${brief(p)}</article>`).join('')}</div>
      <footer class="news-carousel-footer"><div class="news-position"><span class="news-current">01</span><span class="news-position-line"></span><span>${String(posts.length).padStart(2, '0')}</span></div>
      <div class="news-controls" ${posts.length < 2 ? 'hidden' : ''}><button type="button" data-news="previous" aria-label="Previous news update"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button><button type="button" data-news="pause" aria-label="Pause news rotation"><i class="fa-solid fa-pause" aria-hidden="true"></i></button><button type="button" data-news="next" aria-label="Next news update"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div></footer>`;
    const slides = [...root.querySelectorAll('.news-slide')];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, timer, paused = reduced.matches, hovered = false, focused = false, visible = true, touchStart, suppressClick = false, playRequested = false;
    const pauseButton = root.querySelector('[data-news="pause"]');
    function schedule() {
      clearTimeout(timer);
      if (posts.length > 1 && !paused && !hovered && (!focused || playRequested) && !document.hidden && visible) timer = setTimeout(() => show(index + 1), 8000);
    }
    function updatePause() {
      pauseButton.setAttribute('aria-label', paused ? 'Play news rotation' : 'Pause news rotation');
      pauseButton.innerHTML = `<i class="fa-solid fa-${paused ? 'play' : 'pause'}" aria-hidden="true"></i>`;
      root.querySelector('.news-slides').setAttribute('aria-live', paused || (focused && !playRequested) ? 'polite' : 'off');
    }
    function show(next) {
      index = (next + posts.length) % posts.length;
      slides.forEach((slide, i) => { slide.inert = i !== index; slide.setAttribute('aria-hidden', String(i !== index)); });
      root.querySelector('.news-current').textContent = String(index + 1).padStart(2, '0');
      schedule();
    }
    root.addEventListener('click', event => {
      if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
      const action = event.target.closest('[data-news]')?.dataset.news;
      if (!action) return;
      if (action === 'pause') { paused = !paused; playRequested = !paused; }
      else { paused = true; playRequested = false; show(index + (action === 'next' ? 1 : -1)); }
      updatePause(); schedule();
    });
    root.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
    root.addEventListener('pointerleave', () => { hovered = false; schedule(); });
    root.addEventListener('focusin', () => { focused = true; playRequested = false; updatePause(); schedule(); });
    root.addEventListener('focusout', event => { focused = root.contains(event.relatedTarget); updatePause(); schedule(); });
    root.addEventListener('touchstart', event => { const t = event.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; suppressClick = false; paused = true; playRequested = false; updatePause(); schedule(); }, { passive: true });
    root.addEventListener('touchend', event => {
      if (!touchStart) return;
      const t = event.changedTouches[0], dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && !event.target.closest('button')) { suppressClick = true; show(index + (dx < 0 ? 1 : -1)); }
      touchStart = null;
    }, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    reduced.addEventListener('change', () => { if (reduced.matches) paused = true; updatePause(); schedule(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }).observe(root);
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', schedule);
    updatePause(); schedule();
  }

  async function initArchive(root) {
    const story = new URLSearchParams(location.search).get('story');
    if (story) {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(story)) throw new Error('Invalid story');
        const posts = await result(publicQuery().eq('id', story).limit(1));
        if (!posts.length) { root.innerHTML = '<div class="news-empty"><h2>This update is no longer available.</h2><p>It may have expired or been archived.</p><a href="news.html">Browse current updates</a></div>'; return; }
        const post = posts[0];
        document.title = `${post.title} · ThinkRight`;
        const source = safeURL(post.source_url);
        root.innerHTML = `<article class="news-story"><a class="news-back" href="news.html"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All updates</a><span class="news-category">${esc(categories[post.category])}</span><h1>${esc(post.title)}</h1><div class="news-meta">${meta(post)}</div><p class="news-story-lead">${esc(post.summary)}</p><div class="news-story-body">${esc(post.body)}</div>${source ? `<a class="news-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">Read at ${esc(post.source_name)} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span class="news-sr-only"> (opens in a new tab)</span></a>` : ''}</article>`;
      } catch { root.innerHTML = '<div class="news-empty"><h2>We couldn’t load this update.</h2><p>Please check your connection and try again.</p><button type="button" class="news-source" id="news-retry">Try again</button></div>'; root.querySelector('#news-retry').onclick = () => initArchive(root); }
      return;
    }
    root.innerHTML = `<header class="news-page-heading"><span class="news-category"><i class="fa-regular fa-newspaper" aria-hidden="true"></i> THE THINKRIGHT BRIEF</span><h1>Stay in the know.<br><span>Keep moving forward.</span></h1><p>JAMB updates, admissions and exam prep, selected by ThinkRight.</p></header><nav class="news-filters" aria-label="Filter news">${[['','All updates'], ...Object.entries(categories)].map(([key,label]) => `<button type="button" data-category="${key}" aria-pressed="${!key}">${label}</button>`).join('')}</nav><div id="news-list" class="news-list"></div><p id="news-status" role="status"></p><button type="button" id="news-more" class="news-source" hidden>Load more updates <i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>`;
    const list = root.querySelector('#news-list'), status = root.querySelector('#news-status'), more = root.querySelector('#news-more');
    let offset = 0, category = '', request = 0, loading = false;
    async function load(reset = false) {
      const current = ++request;
      if (reset) { offset = 0; list.innerHTML = ''; }
      loading = true; more.disabled = true; status.textContent = 'Fetching updates…';
      try {
        const posts = await published({ offset, limit: 12, category });
        if (current !== request) return;
        list.insertAdjacentHTML('beforeend', posts.map(p => `<article class="news-list-item">${article(p)}<a class="news-read" href="${href(p)}">Read update <i class="fa-solid fa-arrow-right" aria-hidden="true"></i><span class="news-sr-only">: ${esc(p.title)}</span></a></article>`).join(''));
        offset += posts.length;
        status.textContent = offset ? '' : 'No updates here yet. Check back soon.';
        more.hidden = posts.length < 12;
        more.textContent = 'Load more updates';
      } catch {
        if (current !== request) return;
        status.textContent = 'Updates couldn’t load. Check your connection and try again.';
        more.hidden = false; more.textContent = 'Try again';
      } finally { if (current === request) { loading = false; more.disabled = false; } }
    }
    root.querySelector('.news-filters').addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      category = button.dataset.category;
      root.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      load(true);
    });
    more.addEventListener('click', () => { if (!loading) load(); });
    await load(true);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.querySelector('#auth-news');
    const archive = document.querySelector('#news-content');
    if (carousel) initCarousel(carousel);
    if (archive) initArchive(archive);
  });
})();
