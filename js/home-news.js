/* A small headline desk; full stories and category browsing live in news.html. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const feed = document.getElementById('homeNewsFeed');
    if (!feed) return;
    const status = document.getElementById('homeNewsStatus');
    const retry = document.getElementById('homeNewsRetry');
    let loading = false, timer;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function schedule() {
      clearTimeout(timer);
      if (feed.children.length > 1 && !document.hidden && !feed.contains(document.activeElement)) {
        timer = setTimeout(() => {
          feed.append(feed.firstElementChild);
          if (!reduced.matches && feed.animate) {
            feed.getAnimations().forEach(animation => animation.cancel());
            feed.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 300 });
          }
          schedule();
        }, 3000);
      }
    }
    document.addEventListener('visibilitychange', schedule);
    feed.addEventListener('focusin', () => clearTimeout(timer));
    feed.addEventListener('focusout', schedule);
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', schedule);
    async function load() {
      if (loading) return;
      loading = true;
      feed.setAttribute('aria-busy', 'true');
      status.textContent = 'Loading headlines...';
      retry.hidden = true;
      try {
        const news = window.ThinkRightNews;
        const posts = await news.published({ limit: 6 });
        feed.innerHTML = posts.map(post => `<article class="home-news-item"><div class="home-news-kicker"><span>${news.esc(news.categories[post.category] || 'Update')}</span><b aria-hidden="true">&middot;</b><time datetime="${news.esc(post.published_at || '')}">${news.esc(news.date(post.published_at))}</time></div><h3><a href="news.html?story=${encodeURIComponent(post.id)}">${news.esc(post.title)}</a></h3><p class="home-news-summary">${news.esc(post.summary)}</p><span class="home-news-source">${news.esc(post.source_name)}</span></article>`).join('');
        schedule();
        status.textContent = posts.length ? '' : 'No headlines yet. Check back for JAMB and admission updates.';
      } catch {
        status.textContent = 'Headlines are unavailable right now.';
        retry.hidden = false;
      } finally {
        loading = false;
        feed.setAttribute('aria-busy', 'false');
      }
    }
    retry.addEventListener('click', load);
    load();
  });
})();
