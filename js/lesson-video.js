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
    const uploading = [...jobs.values()].some(item => item.running);
    document.querySelectorAll('[data-workspace-page="class"] [data-action]').forEach(control => {
      if (['save-class', 'submit-class', 'add-lesson', 'remove-lesson', 'remove-video', 'move-lesson', 'step'].includes(control.dataset.action)) {
        control.disabled = uploading;
      }
    });
    document.querySelectorAll('[data-video-status]').forEach(el => {
      if (el.dataset.videoStatus !== id) return;
      el.textContent = job.message;
      const progress = el.parentElement.querySelector('progress');
      if (progress) { if (job.phase === 'uploading' || job.percent === 100) progress.value = job.percent || 0; else progress.removeAttribute('value'); progress.hidden = !job.running && job.percent !== 100; }
      const meter = el.parentElement.querySelector('[data-upload-percent]');
      if (meter) meter.textContent = job.phase === 'uploading' || job.percent === 100 ? `${job.percent || 0}%` : job.running ? job.phase === 'verifying' ? 'Verifying' : 'Preparing' : '';
      const summary = el.parentElement.querySelector('[data-upload-file]');
      if (summary) { summary.textContent = job.filename || ''; summary.hidden = !job.filename; }
      el.parentElement.dataset.uploadState = job.running ? 'active' : job.percent === 100 ? 'complete' : 'idle';
      const heading = el.parentElement.querySelector('.tw-upload-heading strong');
      if (heading) heading.textContent = job.running ? 'Uploading your video' : 'Your lesson recording';
      const cancel = el.parentElement.querySelector('[data-video-cancel]');
      if (cancel) cancel.hidden = !job.running;
      const input = el.parentElement.querySelector('input[type=file]');
      if (input) input.disabled = job.running;
    });
  }
  function editor(lesson) {
    const job = jobs.get(lesson.id);
    return `<div class="lesson-video-upload ${lesson.video_asset_id ? 'has-video' : ''}" data-upload-state="${job?.running ? 'active' : job?.percent === 100 ? 'complete' : 'idle'}"><div class="tw-upload-heading"><div><strong>${job?.running?'Uploading your video':'Your lesson recording'}</strong><span>Choose a video from your device</span></div></div><label class="${lesson.video_asset_id ? 'tw-video-replace' : 'tw-field'}"><span>${lesson.video_asset_id ? 'Replace video' : 'Upload lesson video'}</span><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp" data-video-lesson="${esc(lesson.id)}" ${job?.running ? 'disabled' : ''}></label>
      ${lesson.video_asset_id || lesson.video_url ? `<button type="button" class="tw-remove-video" data-action="remove-video" data-lesson-id="${esc(lesson.id)}" ${job?.running?'disabled':''}><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Remove video</button>` : ''}
      ${lesson.video_asset_id ? '' : '<p class="tw-hint">Maximum file size: 500 MB. Make sure the video is very clear and easy to hear.</p>'}
      ${lesson.video_asset_id ? inlinePlayer(lesson.video_asset_id) : lesson.video_url ? '<p class="tw-hint">This lesson uses an old video link. Upload a replacement before sending the class for review.</p>' : ''}
      <video data-video-local="${esc(lesson.id)}" ${job?.previewURL ? `src="${esc(job.previewURL)}"` : 'hidden'} controls playsinline preload="metadata" style="width:100%;max-height:300px;background:#000" aria-label="Selected recording preview"></video>
      <p class="tw-upload-file" data-upload-file ${job?.filename ? '' : 'hidden'}>${esc(job?.filename)}</p>
      <div class="tw-upload-meter-label"><span>Upload progress</span><strong data-upload-percent>${job?.phase === 'uploading' || job?.percent === 100 ? `${job.percent}%` : job?.running ? 'Preparing' : ''}</strong></div>
      <progress max="100" ${job?.phase === 'uploading' || job?.percent === 100 || !job?.running ? `value="${job?.percent || 0}"` : ''} ${job?.running || job?.percent === 100 ? '' : 'hidden'} aria-label="Video upload progress" style="width:100%"></progress>
      <p class="tw-hint" role="status" data-video-status="${esc(lesson.id)}">${esc(job?.message || (lesson.video_asset_id ? 'Video uploaded. Changes go live after review.' : 'No video uploaded yet.'))}</p>
      <button type="button" class="tw-button small" data-video-cancel="${esc(lesson.id)}" ${job?.running ? '' : 'hidden'}>Cancel upload</button><small class="tw-upload-limit">Up to 500 MB per video</small></div><p class="tw-upload-wait">Continue after the upload finishes.</p>`;
  }
  function inlinePlayer(assetId) {
    return `<div class="tw-inline-video"><video-player><video-skin><video data-video-inline="${esc(assetId)}" controls playsinline preload="metadata" aria-label="Uploaded lesson video"></video></video-skin></video-player><p class="tw-hint" role="status">Loading lesson video…</p><button type="button" class="tw-icon-btn" data-video-retry aria-label="Retry loading video" title="Retry loading video" hidden><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button></div>`;
  }
  function mountInline(root) {
    root.querySelectorAll('[data-video-inline]').forEach(player => {
      const box = player.closest('.tw-inline-video'), status = box.querySelector('[role=status]'), retry = box.querySelector('[data-video-retry]');
      const fail = error => { status.textContent = error?.message || 'Video could not load. Try again.'; retry.hidden = false; };
      const load = async () => {
        retry.hidden = true; status.textContent = 'Loading lesson video…';
        try { await mount(player, player.dataset.videoInline); if (player.isConnected) status.textContent = ''; }
        catch (error) { if (player.isConnected) fail(error); }
      };
      retry.onclick = load;
      player.addEventListener('video-access-error', () => fail());
      load();
    });
  }
  function unmountInline(root) { root.querySelectorAll('[data-video-inline]').forEach(stop); }
  async function readChunk(blob) {
    try { return await blob.arrayBuffer(); }
    catch (error) {
      if (!['NotReadableError','NotAllowedError','SecurityError'].includes(error?.name)) throw error;
      // Some device/cloud file providers work through FileReader but reject Blob.arrayBuffer.
      return await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(new Error('Your browser cannot read this video. Save or download it to this device, then select it again. Keep the file in place until the upload finishes.'));
        reader.onabort=()=>reject(new Error('Reading the video was cancelled. Select it again to retry.'));
        reader.readAsArrayBuffer(blob);
      });
    }
  }
  async function fingerprint(file, job) {
    const hashes = [];
    for (let start = 0; start < file.size; start += 10 * 1024 * 1024) {
      if (job.cancelled) throw new Error('Upload cancelled');
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await readChunk(file.slice(start, start + 10 * 1024 * 1024))));
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
  async function upload(file, cohortId, lessonId, persistDraft) {
    if (jobs.get(lessonId)?.running) throw new Error('This lesson is already uploading');
    if (!file.size || file.size > 500 * 1024 * 1024) throw new Error('Choose a video up to 500 MB.');
    const types={mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',avi:'video/x-msvideo','3gp':'video/3gpp'};
    const contentType=types[file.name.split('.').pop().toLowerCase()]||file.type;
    if(!contentType?.startsWith('video/'))throw new Error('Choose a video recording.');
    const job = { running: true, cancelled: false, percent: 0, phase: 'preparing', filename: file.name, message: 'Checking video…', requests: new Set() }; jobs.set(lessonId, job); paint(lessonId);
    // Do not open a second media reader while the selected device/cloud file is uploading.
    try {
      job.message = 'Preparing upload…'; paint(lessonId);
      const hash = await fingerprint(file, job);
      if (job.cancelled) throw new Error('Upload cancelled');
      if (persistDraft) cohortId = await persistDraft();
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
        job.phase = 'uploading';
        const bytes = [...uploaded.values(), ...loading.values()].reduce((sum, value) => sum + value, 0);
        job.percent = Math.min(99, Math.floor(bytes / file.size * 100)); job.message = `Uploading ${file.name} · ${job.percent}%`; paint(lessonId);
      }
      async function worker() {
        while (next <= count && !job.cancelled) {
          const part = next++, offset = (part - 1) * start.chunk_size, blob = file.slice(offset, offset + start.chunk_size);
          if (uploaded.get(part) === blob.size) { progress(); continue; }
          // Send an owned byte buffer, not a live OS/cloud file reference. Reuse it on retry.
          const bytes = await readChunk(blob);
          for (let attempt = 0; attempt < 3; attempt++) {
            if (job.cancelled) throw new Error('Upload cancelled');
            try {
              const { url } = await api('sign', { asset_id: job.assetId, part_number: part });
              if (job.cancelled) throw new Error('Upload cancelled');
              await put(url, bytes, job, loaded => { loading.set(part, loaded); progress(); });
              loading.delete(part); uploaded.set(part, blob.size); progress(); break;
            } catch (error) { loading.delete(part); if (job.cancelled || attempt === 2) throw error; await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
          }
        }
      }
      const workers = await Promise.allSettled([worker(), worker(), worker()]);
      const failure = workers.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
      if (job.cancelled) throw new Error('Upload cancelled');
      job.phase = 'verifying'; job.message = 'Checking uploaded video…'; paint(lessonId);
      const completed = await api('complete', { asset_id: job.assetId });
      if (job.cancelled) throw new Error('Upload cancelled');
      job.percent = 100; job.message = 'Video uploaded. Save your draft to keep it.';
      return completed.asset_id;
    } catch (error) { job.message = error.message; throw error; }
    finally {
      job.running = false; job.previewURL = null;
      for (const xhr of job.requests) xhr.abort();
      document.querySelectorAll('[data-video-local]').forEach(el => { if (el.dataset.videoLocal === lessonId) { el.pause(); el.removeAttribute('src'); el.load(); el.hidden = true; } });
      paint(lessonId);
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
  function forgetUpload(id) {
    const job=jobs.get(id);
    if(job?.running)throw new Error('Finish or cancel the upload first.');
    if(job?.previewURL)URL.revokeObjectURL(job.previewURL);
    jobs.delete(id);
  }
  window.ThinkRightVideo = { api, editor, inlinePlayer, mountInline, unmountInline, upload, mount, stop, forgetUpload, busy: () => [...jobs.values()].some(j => j.running) };
  window.addEventListener('beforeunload', event => { if (window.ThinkRightVideo.busy()) { event.preventDefault(); event.returnValue = ''; } });
})();
