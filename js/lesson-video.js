/* Private lesson uploads. R2 credentials are never sent to the browser. */
(function () {
  'use strict';
  const jobs = new Map(), players = new WeakMap();
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(action, body = {}) {
    const { data, error } = await window.supabase.functions.invoke('lesson-video', { body: { action, ...body } });
    if (error) {
      let message = 'Video request failed. Please retry.';
      try { message = (await error.context.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  function paint(id) {
    const job = jobs.get(id); if (!job) return;
    document.querySelectorAll('[data-video-status]').forEach(el => {
      if (el.dataset.videoStatus !== id) return;
      el.textContent = job.message;
      const progress = el.parentElement.querySelector('progress');
      if (progress) { progress.value = job.percent || 0; progress.hidden = !job.running; }
      const cancel = el.parentElement.querySelector('[data-video-cancel]');
      if (cancel) cancel.hidden = !job.running;
      const input = el.parentElement.querySelector('input[type=file]');
      if (input) input.disabled = job.running;
    });
  }
  function editor(lesson) {
    const job = jobs.get(lesson.id);
    return `<div class="lesson-video-upload"><label class="tw-field"><span>${lesson.video_asset_id ? 'Replace lesson video' : 'Upload lesson video'}</span><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp" data-video-lesson="${esc(lesson.id)}" ${job?.running ? 'disabled' : ''}></label>
      <p class="tw-hint">Maximum file size: 500 MB. Make sure the video is very clear and easy to hear.</p>
      ${lesson.video_asset_id ? `<button type="button" class="tw-button small" data-video-preview="${esc(lesson.video_asset_id)}">Preview uploaded video</button>` : lesson.video_url ? '<p class="tw-hint">This lesson uses an old video link. Upload a replacement before sending the class for review.</p>' : ''}
      <video data-video-local="${esc(lesson.id)}" ${job?.previewURL ? `src="${esc(job.previewURL)}"` : 'hidden'} controls playsinline preload="metadata" style="width:100%;max-height:300px;background:#000" aria-label="Selected recording preview"></video>
      <progress max="100" value="${job?.percent || 0}" ${job?.running ? '' : 'hidden'} aria-label="Video upload progress" style="width:100%"></progress>
      <p class="tw-hint" role="status" data-video-status="${esc(lesson.id)}">${esc(job?.message || (lesson.video_asset_id ? 'Video uploaded. Changes go live after review.' : 'No video uploaded yet.'))}</p>
      <button type="button" class="tw-button small" data-video-cancel="${esc(lesson.id)}" ${job?.running ? '' : 'hidden'}>Cancel upload</button></div>`;
  }
  async function fingerprint(file, job) {
    const hashes = [];
    for (let start = 0; start < file.size; start += 10 * 1024 * 1024) {
      if (job.cancelled) throw new Error('Upload cancelled');
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.slice(start, start + 10 * 1024 * 1024).arrayBuffer()));
      hashes.push(...hash);
    }
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(hashes))), b => b.toString(16).padStart(2, '0')).join('');
  }
  function put(url, blob, job, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); job.requests.add(xhr);
      const finish = () => job.requests.delete(xhr);
      xhr.open('PUT', url); xhr.timeout = 180000;
      xhr.upload.onprogress = e => onProgress(e.loaded);
      xhr.onload = () => { finish(); xhr.status >= 200 && xhr.status < 300 && xhr.getResponseHeader('ETag') ? resolve() : reject(new Error('Chunk upload failed. Check your connection and retry.')); };
      xhr.onerror = xhr.ontimeout = () => { finish(); reject(new Error('Connection interrupted. Reselect the same file to resume.')); };
      xhr.onabort = () => { finish(); reject(new Error('Upload cancelled')); };
      xhr.send(blob);
    });
  }
  async function upload(file, cohortId, lessonId) {
    if (jobs.get(lessonId)?.running) throw new Error('This lesson is already uploading');
    if (!file.size || file.size > 500 * 1024 * 1024) throw new Error('Choose a video up to 500 MB.');
    const types={mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',avi:'video/x-msvideo','3gp':'video/3gpp'};
    const contentType=types[file.name.split('.').pop().toLowerCase()]||file.type;
    if(!contentType?.startsWith('video/'))throw new Error('Choose a video recording.');
    const job = { running: true, cancelled: false, percent: 0, message: 'Checking video…', requests: new Set() }; jobs.set(lessonId, job); paint(lessonId);
    const previewURL = URL.createObjectURL(file);
    job.previewURL = previewURL;
    document.querySelectorAll('[data-video-local]').forEach(el => { if (el.dataset.videoLocal === lessonId) { el.src = previewURL; el.hidden = false; } });
    try {
      job.message = 'Preparing upload…'; paint(lessonId);
      const hash = await fingerprint(file, job);
      const start = await api('initiate', { cohort_id: cohortId, lesson_id: lessonId, filename: file.name, content_type: contentType, size_bytes: file.size, fingerprint: hash });
      job.assetId = start.asset_id;
      if (job.cancelled) { await api('cancel', { asset_id: job.assetId }); throw new Error('Upload cancelled'); }
      if (start.state === 'ready' || start.state === 'verifying') {
        await api('complete', { asset_id: job.assetId });
        job.percent = 100; job.message = 'Video uploaded. Save your draft to keep it.';
        return job.assetId;
      }
      const status = await api('status', { asset_id: job.assetId });
      const uploaded = new Map(status.parts.map(p => [p.number, p.size])), loading = new Map();
      const count = Math.ceil(file.size / start.chunk_size); let next = 1;
      function progress() {
        const bytes = [...uploaded.values(), ...loading.values()].reduce((sum, value) => sum + value, 0);
        job.percent = Math.min(99, Math.floor(bytes / file.size * 100)); job.message = `Uploading ${file.name} · ${job.percent}%`; paint(lessonId);
      }
      async function worker() {
        while (next <= count && !job.cancelled) {
          const part = next++, offset = (part - 1) * start.chunk_size, blob = file.slice(offset, offset + start.chunk_size);
          if (uploaded.get(part) === blob.size) { progress(); continue; }
          for (let attempt = 0; attempt < 3; attempt++) {
            if (job.cancelled) throw new Error('Upload cancelled');
            try {
              const { url } = await api('sign', { asset_id: job.assetId, part_number: part });
              if (job.cancelled) throw new Error('Upload cancelled');
              await put(url, blob, job, bytes => { loading.set(part, bytes); progress(); });
              loading.delete(part); uploaded.set(part, blob.size); progress(); break;
            } catch (error) { loading.delete(part); if (job.cancelled || attempt === 2) throw error; await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
          }
        }
      }
      const workers = await Promise.allSettled([worker(), worker(), worker()]);
      const failure = workers.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
      if (job.cancelled) throw new Error('Upload cancelled');
      job.message = 'Checking uploaded video…'; paint(lessonId);
      const completed = await api('complete', { asset_id: job.assetId });
      if (job.cancelled) throw new Error('Upload cancelled');
      job.percent = 100; job.message = 'Video uploaded. Save your draft to keep it.';
      return completed.asset_id;
    } catch (error) { job.message = error.message; throw error; }
    finally {
      job.running = false; job.previewURL = null;
      for (const xhr of job.requests) xhr.abort();
      document.querySelectorAll('[data-video-local]').forEach(el => { if (el.dataset.videoLocal === lessonId) { el.pause(); el.removeAttribute('src'); el.load(); el.hidden = true; } });
      URL.revokeObjectURL(previewURL); paint(lessonId);
    }
  }
  function stop(player) {
    const old = players.get(player); if (old) { clearTimeout(old.timer); player.removeEventListener('error', old.onError); if (old.onMetadata) player.removeEventListener('loadedmetadata', old.onMetadata); }
    players.delete(player); player.pause(); player.removeAttribute('src'); player.load();
  }
  async function mount(player, assetId) {
    stop(player);
    const state = { timer: null, refreshing: false, lastRefresh: 0 }; players.set(player, state);
    async function refresh(initial = false) {
      if (players.get(player) !== state || state.refreshing) return;
      state.refreshing = true;
      const position = player.currentTime, wasPlaying = !player.paused;
      try {
        const result = await api('playback', { asset_id: assetId });
        if (players.get(player) !== state) return;
        player.src = result.url;
        if (!initial) {
          state.onMetadata = () => { if (players.get(player) !== state) return; player.currentTime = position; if (wasPlaying) player.play().catch(() => {}); state.onMetadata = null; };
          player.addEventListener('loadedmetadata', state.onMetadata, { once: true });
        }
        state.lastRefresh = Date.now();
        clearTimeout(state.timer); state.timer = setTimeout(() => { if (player.isConnected) refresh().catch(() => {}); }, 50 * 60 * 1000);
      } finally { state.refreshing = false; }
    }
    state.onError = () => { if (Date.now() - state.lastRefresh > 30000) refresh().catch(() => { player.dispatchEvent(new CustomEvent('video-access-error')); }); };
    player.addEventListener('error', state.onError);
    await refresh(true);
  }
  document.addEventListener('click', async event => {
    const cancel = event.target.closest('[data-video-cancel]');
    if (cancel) {
      const job = jobs.get(cancel.dataset.videoCancel); if (!job) return;
      job.cancelled = true; for (const xhr of job.requests) xhr.abort();
      if (job.assetId) try { await api('cancel', { asset_id: job.assetId }); } catch (_) {}
      return;
    }
    const preview = event.target.closest('[data-video-preview]'); if (!preview) return;
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Lesson video preview');
    dialog.style.cssText = 'position:fixed;inset:0;margin:auto;width:min(850px,94vw);padding:16px;background:var(--bg-card,#111827);color:var(--text-primary,#fff);border:1px solid #64748b;border-radius:4px';
    dialog.innerHTML = '<button type="button" aria-label="Close video preview" style="float:right;padding:8px">Close</button><video controls playsinline preload="metadata" style="width:100%;max-height:75vh"></video><label>Playback speed <select aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><p role="status">Loading video…</p>';
    document.body.appendChild(dialog); const player = dialog.querySelector('video');
    dialog.querySelector('select').onchange = event => { player.playbackRate = Number(event.target.value); };
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { stop(player); dialog.remove(); }, { once: true }); dialog.showModal();
    try { await mount(player, preview.dataset.videoPreview); dialog.querySelector('p').textContent = ''; }
    catch (error) { dialog.querySelector('p').textContent = error.message; }
  });
  window.ThinkRightVideo = { api, editor, upload, mount, stop, busy: () => [...jobs.values()].some(j => j.running) };
  window.addEventListener('beforeunload', event => { if (window.ThinkRightVideo.busy()) { event.preventDefault(); event.returnValue = ''; } });
})();
