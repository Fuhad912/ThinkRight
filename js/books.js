(function () {
  'use strict';

  const BUCKET = 'textbooks';
  const LINK_LIFETIME_SECONDS = 60 * 60;
  async function loadCatalog() {
    const catalog = document.getElementById('booksCatalog');
    if (!catalog) return;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    try {
      const session = await window.supabase.auth.getSession();
      if (!session.data?.session) { catalog.innerHTML = '<p>Sign in to browse your textbooks. <a href="login.html?next=textbooks.html">Sign in</a></p>'; return; }
      const { data: books, error } = await window.supabase.from('textbooks').select('id,title,subject_id,file_path,image_url').eq('published', true).order('title');
      if (error) throw error;
      catalog.innerHTML = books.map(book => {
        let image = ''; try { const u = new URL(book.image_url); if (u.protocol === 'https:') image = u.href; } catch (_) {}
        return `<article class="book-card" data-book-path="${escape(book.file_path)}"><div class="book-card__cover">${image ? `<img src="${escape(image)}" alt="Cover of ${escape(book.title)}" loading="lazy" referrerpolicy="no-referrer">` : '<i class="fa-solid fa-book" aria-hidden="true"></i>'}</div><div class="book-card__body"><span class="book-card__subject">${escape(book.subject_id)}</span><h3>${escape(book.title)}</h3><p>Textbook PDF</p><div class="book-card__actions"><button class="book-open-button" type="button" data-book-action="open">Read book</button><button class="book-download-button" type="button" data-book-action="download" aria-label="Download ${escape(book.title)}"><i class="fa-solid fa-download" aria-hidden="true"></i></button></div></div></article>`;
      }).join('') || '<p>New textbooks will appear here when published.</p>';
    } catch (_) { catalog.textContent = 'The textbook library is unavailable. Please try again later.'; }
  }
  document.addEventListener('DOMContentLoaded', loadCatalog);

  async function openBook(button) {
    const card = button.closest('[data-book-path]');
    const status = document.getElementById('booksStatus');
    const path = card?.dataset.bookPath;
    if (!path || !window.supabase?.storage || !window.supabase?.auth) {
      if (status) status.textContent = 'The textbook service is unavailable. Please try again shortly.';
      return;
    }

    const actions = card.querySelectorAll('[data-book-action]');
    actions.forEach((action) => { action.disabled = true; });
    if (status) status.textContent = 'Preparing your secure book link…';

    try {
      const { data: sessionData, error: sessionError } = await window.supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) {
        window.location.href = 'login.html?next=textbooks.html';
        return;
      }
      const { data: identity, error: identityError } = await window.supabase.rpc('workspace_identity');
      if (identityError) throw identityError;
      if (identity?.role !== 'student') {
        if (status) status.textContent = 'Textbooks are available from a student account.';
        return;
      }

      const shouldDownload = button.dataset.bookAction === 'download';
      const { data, error } = await window.supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, LINK_LIFETIME_SECONDS, shouldDownload ? { download: true } : {});
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('A secure textbook link could not be created.');

      if (shouldDownload) {
        window.location.assign(data.signedUrl);
      } else {
        const opened = window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.assign(data.signedUrl);
      }
      if (status) status.textContent = 'Your secure link is ready. It will expire in one hour.';
    } catch (error) {
      console.error('Could not open textbook:', error);
      if (status) status.textContent = 'We could not open this textbook. Please try again or contact support.';
    } finally {
      actions.forEach((action) => { action.disabled = false; });
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-book-action]');
    if (button) openBook(button);
  });
})();
