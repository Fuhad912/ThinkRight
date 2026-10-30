/* Student onboarding and gentle completion reminder. */
(() => {
  'use strict';

  const SUBJECTS = [
    ['mathematics', 'Mathematics'], ['physics', 'Physics'], ['chemistry', 'Chemistry'],
    ['biology', 'Biology'], ['economics', 'Economics'], ['commerce', 'Commerce'],
    ['government', 'Government'], ['literature', 'Literature in English'],
    ['agriculture', 'Agricultural Science'], ['geography', 'Geography'],
    ['history', 'History'], ['computer', 'Computer Studies'],
    ['crs', 'Christian Religious Studies'], ['irs', 'Islamic Religious Studies']
  ];
  const SUGGESTED = {
    Science: ['mathematics', 'physics', 'chemistry', 'biology'],
    Art: ['literature', 'government', 'economics', 'history'],
    Commercial: ['mathematics', 'economics', 'commerce', 'government'],
    Undecided: []
  };
  const STEP_COPY = [
    ['Your path', 'FIRST, THE BASICS', 'Where are you starting from?', 'We’ll use this to keep your experience relevant to you.'],
    ['Your destination', 'LOOKING AHEAD', 'What are you working toward?', 'A direction helps us make your progress feel meaningful.'],
    ['Your plan', 'MAKE IT YOURS', 'Build your subject lineup.', 'Your four subjects and a realistic rhythm make a good starting point.']
  ];
  const $ = (selector) => document.querySelector(selector);
  const safeLocal = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const saveLocal = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };

  async function identity() {
    if (!window.authInitialized && typeof window.initSupabase === 'function') window.initSupabase();
    return window.resolveWorkspaceIdentity ? window.resolveWorkspaceIdentity() : { role: 'guest' };
  }

  async function profileFor(user) {
    const { data, error } = await window.supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  function showError(message) {
    const error = $('#obError');
    error.textContent = message;
    error.hidden = !message;
    if (message) error.scrollIntoView({ block: 'nearest' });
  }

  async function initPage() {
    const loading = $('#obLoading');
    try {
      const current = await identity();
      if (current.role === 'teacher' || current.role === 'admin') {
        location.replace(current.role === 'teacher' ? 'tutor-dashboard.html' : 'admin.html');
        return;
      }
      if (!current.user) {
        location.replace('login.html?next=onboarding.html');
        return;
      }
      $('.ob-exit')?.addEventListener('click', () => saveLocal(`thinkright_onboarding_deferred_${current.user.id}`, '1'));
      const profile = await profileFor(current.user);
      const form = $('#onboardingForm');
      const ownedLocal = safeLocal('thinkright_profile_owner_id') === current.user.id;
      const ownedValue = (key) => ownedLocal ? safeLocal(key) : null;
      const state = { step: 1, class_level: profile?.class_level || ownedValue('thinkright_class_level') || '', track: profile?.track || ownedValue('thinkright_user_track') || '', subjects: new Set() };
      const currentYear = new Date().getFullYear();
      const yearSelect = $('#obExamYear');
      for (let year = currentYear; year <= currentYear + 4; year += 1) yearSelect.add(new Option(String(year), String(year)));
      yearSelect.value = String(profile?.exam_year || ownedValue('thinkright_exam_year') || '');
      $('#obName').value = profile?.username || current.user.user_metadata?.username || ownedValue('thinkright_username') || '';
      $('#obCourse').value = profile?.target_course || ownedValue('thinkright_target_course') || '';
      $('#obSchool').value = profile?.target_school || ownedValue('thinkright_target_school') || '';
      $('#obTargetScore').value = profile?.target_score || ownedValue('thinkright_target_score') || '';
      $('#obStudyMinutes').value = String(profile?.daily_minutes || ownedValue('thinkright_daily_minutes') || 30);
      const storedSubjects = profile?.subject_combo || (() => { try { return JSON.parse(ownedValue('thinkright_subject_combo') || '[]'); } catch (_) { return []; } })();
      if (Array.isArray(storedSubjects)) storedSubjects.filter((subject) => subject !== 'english' && SUBJECTS.some(([id]) => id === subject)).slice(0, 3).forEach((subject) => state.subjects.add(subject));

      function setChoice(field, value) {
        state[field] = value;
        document.querySelectorAll(`[data-field="${field}"] button`).forEach((button) => {
          const selected = button.dataset.value === value;
          button.classList.toggle('is-selected', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
        if (field === 'track') renderSubjects();
      }

      function renderSubjects() {
        const suggestions = SUGGESTED[state.track] || [];
        const ordered = [...SUBJECTS].sort((a, b) => {
          const aIndex = suggestions.indexOf(a[0]);
          const bIndex = suggestions.indexOf(b[0]);
          return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
        });
        $('#obSubjects').innerHTML = ordered.map(([id, label]) => `<button type="button" data-subject="${id}" aria-pressed="${state.subjects.has(id)}" class="${state.subjects.has(id) ? 'is-selected' : ''}"><span>${label}</span>${suggestions.includes(id) ? '<small>Suggested</small>' : ''}</button>`).join('');
        $('#obSubjectCount').textContent = `${state.subjects.size} of 3 selected`;
      }

      function showStep(step) {
        state.step = step;
        document.querySelectorAll('.ob-step').forEach((section) => { section.hidden = Number(section.dataset.step) !== step; });
        $('#obStepLabel').textContent = `STEP ${step} OF 3`;
        $('#obProgressText').textContent = STEP_COPY[step - 1][0];
        $('#obProgressFill').style.width = `${step / 3 * 100}%`;
        $('#obKicker').textContent = STEP_COPY[step - 1][1];
        $('#obHeading').textContent = STEP_COPY[step - 1][2];
        $('#obDescription').textContent = STEP_COPY[step - 1][3];
        $('#obBack').hidden = step === 1;
        $('#obNext').innerHTML = step === 3 ? 'Finish setup <span aria-hidden="true">→</span>' : 'Continue <span aria-hidden="true">→</span>';
        showError('');
        window.scrollTo({ top: 0, behavior: 'instant' });
      }

      document.querySelectorAll('.ob-choices').forEach((group) => group.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-value]');
        if (button) { setChoice(group.dataset.field, button.dataset.value); showError(''); }
      }));
      $('#obSubjects').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-subject]');
        if (!button) return;
        const value = button.dataset.subject;
        if (state.subjects.has(value)) state.subjects.delete(value);
        else if (state.subjects.size < 3) state.subjects.add(value);
        else { showError('Choose exactly three subjects. Tap one to remove it first.'); return; }
        showError('');
        renderSubjects();
      });
      $('#obBack').addEventListener('click', () => showStep(Math.max(1, state.step - 1)));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.step === 1) {
          if (!$('#obName').value.trim()) { showError('Add your name to continue.'); $('#obName').focus(); return; }
          if (!state.class_level || !state.track || !yearSelect.value) { showError('Choose your level, track and exam year to continue.'); return; }
          showStep(2); return;
        }
        if (state.step === 2) {
          const score = $('#obTargetScore').value.trim();
          if (score && (!Number.isInteger(Number(score)) || Number(score) < 1 || Number(score) > 400)) { showError('Your target score should be between 1 and 400.'); $('#obTargetScore').focus(); return; }
          showStep(3); return;
        }
        if (state.subjects.size !== 3) { showError('Choose exactly three subjects to complete your UTME combination.'); return; }
        const button = $('#obNext');
        button.disabled = true;
        button.textContent = 'Saving your plan…';
        const payload = {
          username: $('#obName').value.trim(), class_level: state.class_level, track: state.track,
          exam_year: Number(yearSelect.value), target_course: $('#obCourse').value.trim() || null,
          target_school: $('#obSchool').value.trim() || null,
          target_score: $('#obTargetScore').value ? Number($('#obTargetScore').value) : null,
          subject_combo: ['english', ...state.subjects], daily_minutes: Number($('#obStudyMinutes').value),
          onboarding_completed: true
        };
        // 1. Immediately persist everything to localStorage so student data is NEVER lost
        saveLocal('thinkright_username', payload.username);
        saveLocal('thinkright_class_level', payload.class_level);
        saveLocal('thinkright_user_track', payload.track);
        saveLocal('thinkright_exam_year', String(payload.exam_year));
        saveLocal('thinkright_target_course', payload.target_course || '');
        saveLocal('thinkright_target_school', payload.target_school || '');
        saveLocal('thinkright_target_score', payload.target_score ? String(payload.target_score) : '');
        saveLocal('thinkright_subject_combo', JSON.stringify(payload.subject_combo));
        saveLocal('thinkright_daily_minutes', String(payload.daily_minutes));
        saveLocal('thinkright_profile_owner_id', current.user.id);
        saveLocal(`thinkright_onboarding_deferred_${current.user.id}`, '0');
        saveLocal(`thinkright_onboarding_completed_${current.user.id}`, '1');

        // 2. Synchronize to Supabase with progressive fallbacks
        try {
          let activeUser = current.user;
          if (window.supabase && window.supabase.auth) {
            try {
              const { data: sessionData } = await window.supabase.auth.getSession();
              if (sessionData?.session?.user) activeUser = sessionData.session.user;
            } catch (_) {}
          }

          if (window.supabase && activeUser?.id) {
            const fullPayload = {
              id: activeUser.id,
              email: activeUser.email || null,
              username: payload.username,
              class_level: payload.class_level,
              track: payload.track,
              exam_year: payload.exam_year,
              target_course: payload.target_course,
              target_school: payload.target_school,
              target_score: payload.target_score,
              subject_combo: payload.subject_combo,
              daily_minutes: payload.daily_minutes,
              onboarding_completed: true
            };

            let saved = false;
            // Attempt 1: Full upsert
            try {
              const { error: fullError } = await window.supabase
                .from('user_profiles')
                .upsert(fullPayload, { onConflict: 'id' });
              if (!fullError) saved = true;
              else console.warn('[onboarding] Full upsert failed:', fullError);
            } catch (e1) {
              console.warn('[onboarding] Full upsert threw:', e1);
            }

            // Attempt 2: If upsert failed, try direct update on existing row
            if (!saved) {
              try {
                const { error: updateError } = await window.supabase
                  .from('user_profiles')
                  .update(fullPayload)
                  .eq('id', activeUser.id);
                if (!updateError) saved = true;
                else console.warn('[onboarding] Full update failed:', updateError);
              } catch (e2) {
                console.warn('[onboarding] Full update threw:', e2);
              }
            }

            // Attempt 3: If new columns are not yet in remote DB schema, fallback to baseline columns
            if (!saved) {
              try {
                const basePayload = {
                  id: activeUser.id,
                  email: activeUser.email || null,
                  username: payload.username,
                  class_level: payload.class_level,
                  track: payload.track,
                  target_school: payload.target_school,
                  target_course: payload.target_course,
                  target_score: payload.target_score,
                  subject_combo: payload.subject_combo
                };
                const { error: baseError } = await window.supabase
                  .from('user_profiles')
                  .upsert(basePayload, { onConflict: 'id' });
                if (!baseError) saved = true;
                else {
                  await window.supabase
                    .from('user_profiles')
                    .update(basePayload)
                    .eq('id', activeUser.id);
                }
              } catch (e3) {
                console.warn('[onboarding] Baseline sync threw:', e3);
              }
            }
          }
        } catch (syncErr) {
          console.warn('[onboarding] Remote sync warning (local cache preserved):', syncErr);
        }

        // 3. Setup is complete! Smoothly transition to profile
        location.assign('profile.html?setup=complete');
      });
      if (state.class_level) setChoice('class_level', state.class_level);
      if (state.track) setChoice('track', state.track);
      renderSubjects();
      showStep(1);
      loading.hidden = true;
      form.hidden = false;
    } catch (error) {
      console.warn('[onboarding] Could not load student setup:', error);
      loading.innerHTML = 'We couldn’t load your study space. <a href="index.html">Go back home</a> and try again.';
    }
  }

  async function initReminder() {
    try {
      const current = await identity();
      if (current.role !== 'student' || !current.user) return;
      const profile = await profileFor(current.user);
      const completedLocally = safeLocal(`thinkright_onboarding_completed_${current.user.id}`) === '1';
      if (profile.onboarding_completed || completedLocally) {
        let rawCombo = profile.subject_combo;
        if (!Array.isArray(rawCombo) || !rawCombo.length) {
          try { rawCombo = JSON.parse(safeLocal('thinkright_subject_combo') || '[]'); } catch (_) {}
        }
        const combo = (Array.isArray(rawCombo) ? rawCombo : []).filter((id) => id === 'english' || SUBJECTS.some(([subjectId]) => subjectId === id));
        if (combo.length) {
          const labels = Object.fromEntries([['english', 'Use of English'], ...SUBJECTS]);
          const host = $('#tr-recommendations') || document.createElement('section');
          host.classList.add('ob-recos');
          host.innerHTML = `<div><span class="ob-reminder__eyebrow">MADE FOR YOUR PLAN</span><h2>Your subjects, ready when you are.</h2><p>Jump straight into practice with your UTME combination.</p></div><div class="ob-recos__links">${combo.map((id) => `<a href="test.html?subject=${id}">${labels[id]} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('')}</div>`;
          if (!host.isConnected) ($('#homeLoggedInHub') || document.querySelector('main') || document.body).prepend(host);
          host.hidden = false;
        }
        return;
      }
      const reminderKey = `thinkright_onboarding_prompt_seen_${current.user.id}`;
      if (safeLocal(reminderKey) === '1') return;
      const host = document.createElement('aside');
      host.className = 'ob-reminder';
      host.setAttribute('aria-label', 'Complete your study setup');
      host.innerHTML = '<div><span class="ob-reminder__eyebrow">A BETTER WAY TO STUDY</span><strong>Make ThinkRight feel like yours.</strong><p>Add your goal and four subjects to shape your profile and practice.</p></div><a href="onboarding.html">Set up my study space <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>';
      const target = $('#homeLoggedInHub') || document.querySelector('main') || document.body;
      target.prepend(host);
      saveLocal(reminderKey, '1');
    } catch (error) { console.warn('[onboarding] Reminder unavailable:', error); }
  }

  const run = () => { if (document.body.classList.contains('page-onboarding')) initPage(); else initReminder(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
