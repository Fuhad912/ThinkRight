/* A small headline desk; full stories and category browsing live in news.html. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const feed = document.getElementById('homeNewsFeed');
    if (!feed) return;
    const status = document.getElementById('homeNewsStatus');
    const retry = document.getElementById('homeNewsRetry');
    let loading = false;
    let timer, posts = [], offset = 0, paused = false, hovered = false, focused = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    paused = reduced.matches;
    function schedule() {
      clearTimeout(timer);
      if (posts.length > 1 && !paused && !hovered && !focused && !document.hidden) timer = setTimeout(() => rotate(1), 7000);
    }
    function rotate(direction) {
      offset = (offset + direction + posts.length) % posts.length;
      // Move existing nodes to preserve their links and accessible content.
      const nodes = [...feed.children];
      if (direction > 0) feed.append(nodes[0]);
      else feed.prepend(nodes[nodes.length - 1]);
      if (!reduced.matches && feed.animate) {
        feed.getAnimations().forEach(animation => animation.cancel());
        feed.animate([{ opacity: .15, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' });
      }
      schedule();
    }
    feed.addEventListener('pointerenter', () => { hovered = true; schedule(); });
    feed.addEventListener('pointerleave', () => { hovered = false; schedule(); });
    const section = feed.closest('section');
    section.addEventListener('focusin', () => { focused = true; schedule(); });
    section.addEventListener('focusout', event => { focused = section.contains(event.relatedTarget); schedule(); });
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', schedule);
    reduced.addEventListener('change', () => { if (reduced.matches) { paused = true; updatePause(); } schedule(); });
    let pauseButton;
    function updatePause() {
      if (!pauseButton) return;
      pauseButton.setAttribute('aria-label', paused ? 'Play news rotation' : 'Pause news rotation');
      pauseButton.innerHTML = `<i class="fa-solid fa-${paused ? 'play' : 'pause'}" aria-hidden="true"></i>`;
    }
    async function load() {
      if (loading) return;
      loading = true;
      feed.setAttribute('aria-busy', 'true');
      status.textContent = 'Loading headlines...';
      retry.hidden = true;
      try {
        const news = window.ThinkRightNews;
        posts = await news.published({ limit: 6 });
        feed.innerHTML = posts.map(post => `<article class="home-news-item"><div class="home-news-kicker"><span>${news.esc(news.categories[post.category] || 'Update')}</span><b aria-hidden="true">&middot;</b><time datetime="${news.esc(post.published_at || '')}">${news.esc(news.date(post.published_at))}</time></div><h3><a href="news.html?story=${encodeURIComponent(post.id)}">${news.esc(post.title)}</a></h3></article>`).join('');
        if (posts.length > 1 && !pauseButton) {
          const controls = document.createElement('div');
          controls.className = 'home-news-controls';
          controls.innerHTML = '<button type="button" aria-label="Previous headlines"><i class="fa-solid fa-angle-left" aria-hidden="true"></i></button><button type="button" aria-label="Pause news rotation"></button><button type="button" aria-label="Next headlines"><i class="fa-solid fa-angle-right" aria-hidden="true"></i></button>';
          section.querySelector('header').append(controls);
          const buttons = controls.querySelectorAll('button');
          pauseButton = buttons[1];
          buttons[0].onclick = () => { paused = true; updatePause(); rotate(-1); };
          buttons[2].onclick = () => { paused = true; updatePause(); rotate(1); };
          pauseButton.onclick = () => { paused = !paused; updatePause(); schedule(); };
          updatePause();
        }
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
