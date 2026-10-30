/**
 * THINKRIGHT - STUDENT SOCIAL PROFILE CONTROLLER (profile.js)
 * Modern social media profile (Twitter/Threads style) with activity feed,
 * modal profile editor, JAMB combo cards, and Supabase / localStorage sync.
 */
(() => {
  'use strict';

  const ALL_SUBJECTS = [
    { id: 'english', name: 'Use of English', icon: 'fa-book' },
    { id: 'mathematics', name: 'Mathematics', icon: 'fa-calculator' },
    { id: 'physics', name: 'Physics', icon: 'fa-atom' },
    { id: 'chemistry', name: 'Chemistry', icon: 'fa-flask-vial' },
    { id: 'biology', name: 'Biology', icon: 'fa-dna' },
    { id: 'economics', name: 'Economics', icon: 'fa-chart-line' },
    { id: 'commerce', name: 'Commerce', icon: 'fa-briefcase' },
    { id: 'government', name: 'Government', icon: 'fa-landmark' },
    { id: 'literature', name: 'Literature in English', icon: 'fa-feather' },
    { id: 'crs', name: 'Christian Religious Studies', icon: 'fa-cross' },
    { id: 'irs', name: 'Islamic Religious Studies', icon: 'fa-moon' },
    { id: 'agriculture', name: 'Agricultural Science', icon: 'fa-seedling' },
    { id: 'geography', name: 'Geography', icon: 'fa-earth-africa' },
    { id: 'history', name: 'History', icon: 'fa-monument' },
    { id: 'computer', name: 'Computer Studies', icon: 'fa-laptop-code' }
  ];

  let currentUser = null;
  let currentProfile = null;
  let editReturnFocus = null;
  let previousBodyOverflow = '';
  let editSnapshot = null;
  let editWasSaved = false;

  // --- Toast Notification System ---
  function showToast(message, isError = false) {
    const toast = document.getElementById('profileToast');
    const toastMsg = document.getElementById('profileToastMsg');
    const toastIcon = document.getElementById('profileToastIcon');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;
    if (toastIcon) {
      toastIcon.className = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
      toastIcon.style.color = isError ? '#ef4444' : '#10b981';
    }
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  // --- Subject Combo Storage & Handling ---
  function getStoredCombo() {
    try {
      const raw = localStorage.getItem('thinkright_subject_combo');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 4) return parsed;
      }
    } catch (_e) {}

    const track = localStorage.getItem('thinkright_user_track') || 'Science';
    if (track === 'Commercial') return ['english', 'mathematics', 'economics', 'commerce'];
    if (track === 'Art') return ['english', 'literature', 'government', 'crs'];
    return ['english', 'mathematics', 'physics', 'chemistry'];
  }

  function populateSubjectDropdowns(selectedCombo) {
    const slots = [2, 3, 4];
    const available = ALL_SUBJECTS.filter(s => s.id !== 'english');

    slots.forEach((slotNum, idx) => {
      const select = document.getElementById(`selectSubject${slotNum}`);
      if (!select) return;

      const currentVal = selectedCombo[idx + 1] || available[idx]?.id;
      select.innerHTML = available.map(s => `
        <option value="${s.id}" ${s.id === currentVal ? 'selected' : ''}>${s.name}</option>
      `).join('');
    });

    renderSubjectGrid(selectedCombo);
  }

  function renderSubjectGrid(combo) {
    const grid = document.getElementById('socialSubjectGrid');
    if (!grid) return;

    grid.innerHTML = combo.map((subjId, idx) => {
      const subj = ALL_SUBJECTS.find(s => s.id === subjId) || { id: subjId, name: subjId, icon: 'fa-book' };
      const isCompulsory = idx === 0;

      return `
        <div class="social-combo-pill ${isCompulsory ? 'is-locked' : ''}">
          <div class="social-combo-pill__top">
            <span>Subject ${idx + 1}</span>
            <span class="social-combo-pill__badge">${isCompulsory ? 'Compulsory' : 'Selected'}</span>
          </div>
          <div class="social-combo-pill__name">
            <i class="fa-solid ${subj.icon}" style="color:var(--accent-primary)"></i>
            <span>${subj.name}</span>
          </div>
          <a href="test.html?subject=${subj.id}" class="social-combo-pill__btn">
            <i class="fa-solid fa-play"></i> Drill CBT
          </a>
        </div>
      `;
    }).join('');
  }

  // --- Test Stats & Activity Feed ---
  function computeTestStats() {
    let totalTests = 0;
    let avgAcc = 0;
    let testsList = [];

    try {
      const rawResults = localStorage.getItem('test_results');
      if (rawResults) {
        const tests = JSON.parse(rawResults);
        if (Array.isArray(tests) && tests.length > 0) {
          testsList = tests;
          totalTests = tests.length;
          const totalScores = tests.reduce((sum, t) => sum + (Number(t.score_percentage) || Number(t.score) || 0), 0);
          avgAcc = Math.round(totalScores / tests.length);
        }
      }
    } catch (_e) {}

    let streak = 0;
    try {
      const storedStreak = localStorage.getItem('thinkright_practice_streak');
      if (storedStreak) streak = parseInt(storedStreak, 10) || 0;
    } catch (_e) {}

    // Update stats bar UI
    const statTestsEl = document.getElementById('statCompletedTests');
    const statAccEl = document.getElementById('statAvgAccuracy');
    const statStreakEl = document.getElementById('statStreak');

    if (statTestsEl) statTestsEl.textContent = totalTests;
    if (statAccEl) statAccEl.textContent = totalTests > 0 ? `${avgAcc}%` : '—';
    if (statStreakEl) statStreakEl.textContent = `${streak} ${streak === 1 ? 'Day' : 'Days'}`;

    renderActivityFeed(testsList);

    return { totalTests, avgAcc, streak };
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return 'Recently';
    try {
      const date = new Date(isoString);
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch (_e) {
      return 'Recently';
    }
  }

  function renderActivityFeed(tests) {
    const feed = document.getElementById('socialActivityFeed');
    if (!feed) return;

    if (!tests || tests.length === 0) {
      feed.innerHTML = `
        <div class="social-feed-empty">
          <i class="fa-solid fa-feather"></i>
          <p>No practice tests completed yet.</p>
          <a href="practice.html" class="social-btn social-btn--primary" style="margin-top:10px">
            <i class="fa-solid fa-play"></i> Start Your First Test
          </a>
        </div>
      `;
      return;
    }

    // Sort descending by date
    const sorted = [...tests].reverse().slice(0, 10);

    feed.innerHTML = sorted.map(t => {
      const score = Math.round(Number(t.score_percentage) || Number(t.score) || 0);
      const isGood = score >= 70;
      const iconClass = isGood ? 'fa-solid fa-circle-check' : 'fa-solid fa-chart-simple';
      const iconColor = isGood ? '#10b981' : 'var(--accent-primary)';
      const bgIcon = isGood ? 'rgba(16,185,129,0.12)' : 'rgba(29,78,216,0.1)';
      const subjectName = t.subject ? (t.subject.charAt(0).toUpperCase() + t.subject.slice(1)) : 'UTME Practice Quiz';
      const timeAgo = formatTimeAgo(t.completed_at || t.timestamp || t.date);

      return `
        <div class="social-feed-item">
          <div class="social-feed-icon" style="background:${bgIcon};color:${iconColor}">
            <i class="${iconClass}"></i>
          </div>
          <div class="social-feed-content">
            <div class="social-feed-top">
              <h3 class="social-feed-title">${subjectName} Drill</h3>
              <span class="social-feed-time">${timeAgo}</span>
            </div>
            <p class="social-feed-desc">
              Scored <strong>${score}%</strong> (${t.total_questions || 20} questions completed).
              ${t.topic ? `Topic: ${t.topic}` : 'Great focus and consistency.'}
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  function updateMilestones({ isVerified, totalTests, streak, targetScore }) {
    const badgeScholar = document.getElementById('badgeScholar');
    const badgeStreak = document.getElementById('badgeStreak');
    const badgeTarget = document.getElementById('badgeTarget');
    const badgeCbt = document.getElementById('badgeCbt');
    const badgeCombo = document.getElementById('badgeCombo');
    const badgeLeaderboard = document.getElementById('badgeLeaderboard');

    if (badgeScholar) badgeScholar.classList.toggle('is-locked', !isVerified);
    if (badgeStreak) badgeStreak.classList.toggle('is-locked', streak < 1);
    if (badgeTarget) badgeTarget.classList.toggle('is-locked', targetScore < 300);
    if (badgeCbt) badgeCbt.classList.toggle('is-locked', totalTests < 1);
    if (badgeCombo) badgeCombo.classList.toggle('is-locked', false);
    if (badgeLeaderboard) badgeLeaderboard.classList.toggle('is-locked', totalTests < 3);
  }

  // --- Load Profile & Initialize ---
  async function loadProfile() {
    const cachedUsername = localStorage.getItem('thinkright_username') || 'JAMB Candidate';
    const cachedHandle = localStorage.getItem('thinkright_user_handle') || ('@' + cachedUsername.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    const cachedBio = localStorage.getItem('thinkright_user_bio') || '';
    const cachedTrack = localStorage.getItem('thinkright_user_track') || 'Science';
    const cachedLevel = localStorage.getItem('thinkright_class_level') || 'SS3';
    const cachedSchool = localStorage.getItem('thinkright_target_school') || '';
    const cachedCourse = localStorage.getItem('thinkright_target_course') || '';
    const cachedScore = parseInt(localStorage.getItem('thinkright_target_score'), 10) || null;

    applyValuesToUI({
      username: cachedUsername,
      handle: cachedHandle,
      bio: cachedBio,
      email: 'student@example.com',
      track: cachedTrack,
      class_level: cachedLevel,
      target_school: cachedSchool,
      target_course: cachedCourse,
      target_score: cachedScore,
      exam_year: localStorage.getItem('thinkright_exam_year'),
      daily_minutes: localStorage.getItem('thinkright_daily_minutes'),
      created_at: new Date().toISOString(),
      is_logged_in: false
    });

    const combo = getStoredCombo();
    populateSubjectDropdowns(combo);
    const stats = computeTestStats();
    updateMilestones({ isVerified: false, totalTests: stats.totalTests, streak: stats.streak, targetScore: cachedScore });

    // Supabase Auth Check & Profile Resolution
    try {
      if (!window.authInitialized && typeof window.initSupabase === 'function') {
        try { window.initSupabase(); } catch (_) {}
      }

      let retries = 0;
      while (!window.authInitialized && retries < 25) {
        await new Promise((r) => setTimeout(r, 40));
        retries++;
      }

      let user = null;
      if (typeof window.getCurrentUser === 'function') {
        try { user = await window.getCurrentUser(); } catch (_) {}
      }
      if (!user && window.supabase && window.supabase.auth) {
        try {
          const { data: authData } = await window.supabase.auth.getUser();
          user = authData?.user || null;
        } catch (_) {}
      }

      if (user) {
        currentUser = user;

        let profile = null;
        if (window.supabase) {
          const { data } = await window.supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          profile = data;
        }

        currentProfile = profile;
        if (Array.isArray(profile?.subject_combo) && profile.subject_combo.length === 4) {
          localStorage.setItem('thinkright_subject_combo', JSON.stringify(profile.subject_combo));
          populateSubjectDropdowns(profile.subject_combo);
        }

        const resolvedUsername = profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || cachedUsername;
        const resolvedHandle = localStorage.getItem('thinkright_user_handle') || ('@' + resolvedUsername.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        const resolvedBio = localStorage.getItem('thinkright_user_bio') || (profile?.goal || cachedBio);
        const resolvedTrack = profile?.track || cachedTrack;
        const resolvedLevel = profile?.class_level || cachedLevel;

        applyValuesToUI({
          username: resolvedUsername,
          handle: resolvedHandle,
          bio: resolvedBio,
          email: user.email,
          track: resolvedTrack,
          class_level: resolvedLevel,
          target_school: profile?.target_school ?? cachedSchool,
          target_course: profile?.target_course ?? cachedCourse,
          target_score: profile?.target_score ?? cachedScore,
          exam_year: profile?.exam_year ?? localStorage.getItem('thinkright_exam_year'),
          daily_minutes: profile?.daily_minutes ?? localStorage.getItem('thinkright_daily_minutes'),
          created_at: profile?.created_at || user.created_at,
          is_logged_in: true
        });

        const guestNotice = document.getElementById('profileGuestNotice');
        if (guestNotice) guestNotice.style.display = 'none';

        updateMilestones({ isVerified: true, totalTests: stats.totalTests, streak: stats.streak, targetScore: cachedScore });
      }
    } catch (err) {
      console.warn('[profile] Could not fetch remote profile:', err);
    } finally {
      window.ThinkRightLoader?.done('Profile ready');
    }
  }

  function applyValuesToUI(data) {
    // Identity Elements
    const nameEl = document.getElementById('socialDisplayName');
    const handleEl = document.getElementById('socialHandle');
    const bioEl = document.getElementById('socialBio');
    const avatarEl = document.getElementById('socialAvatar');
    const schoolEl = document.getElementById('socialSchool');
    const courseEl = document.getElementById('socialCourse');
    const trackEl = document.getElementById('socialTrack');
    const levelEl = document.getElementById('socialLevel');
    const joinedEl = document.getElementById('socialJoined');
    const scoreEl = document.getElementById('statTargetScore');
    const examYearEl = document.getElementById('socialExamYear');
    const studyGoalEl = document.getElementById('socialStudyGoal');

    if (nameEl) nameEl.textContent = data.username;
    if (handleEl) handleEl.textContent = data.handle.startsWith('@') ? data.handle : `@${data.handle}`;
    if (bioEl) bioEl.textContent = data.bio || 'Add a line about what you are working toward.';
    if (avatarEl) avatarEl.textContent = (data.username || 'U').charAt(0).toUpperCase();

    if (schoolEl) schoolEl.textContent = data.target_school || 'Still deciding';
    if (courseEl) courseEl.textContent = data.target_course || 'Still deciding';
    if (trackEl) trackEl.textContent = `${data.track} Track`;
    if (levelEl) levelEl.textContent = data.class_level;
    const examYear = data.exam_year ?? currentProfile?.exam_year ?? localStorage.getItem('thinkright_exam_year');
    const dailyMinutes = data.daily_minutes ?? currentProfile?.daily_minutes ?? localStorage.getItem('thinkright_daily_minutes');
    if (examYearEl) examYearEl.textContent = examYear || 'Not set';
    if (studyGoalEl) studyGoalEl.textContent = dailyMinutes ? `${dailyMinutes} min / day` : 'Not set';

    if (joinedEl && data.created_at) {
      const year = new Date(data.created_at).getFullYear() || 2026;
      joinedEl.textContent = `Joined ${year}`;
    }

    if (scoreEl) scoreEl.textContent = data.target_score ? `${data.target_score} / 400` : 'Set a target';
    const goalProgress = document.getElementById('goalProgress');
    if (goalProgress) goalProgress.style.width = `${Math.min(100, Math.max(0, Number(data.target_score) / 4 || 0))}%`;
    const verifiedBadge = document.getElementById('socialVerifiedBadge');
    if (verifiedBadge) verifiedBadge.hidden = !(data.is_logged_in ?? Boolean(currentUser));

    // Spotlight Card
    const spotHeading = document.getElementById('spotlightHeading');
    const spotSub = document.getElementById('spotlightSub');
    if (spotHeading) spotHeading.textContent = data.target_course || 'Your goal starts here';
    if (spotSub) spotSub.textContent = [data.target_school, data.target_score ? `Target: ${data.target_score}+` : 'Add a target score'].filter(Boolean).join(' · ');

    // Modal Form inputs
    const inputUsername = document.getElementById('inputUsername');
    const inputHandle = document.getElementById('inputHandle');
    const inputBio = document.getElementById('inputBio');
    const inputSchool = document.getElementById('inputTargetSchool');
    const inputCourse = document.getElementById('inputTargetCourse');
    const selectTrack = document.getElementById('selectTrack');
    const selectLevel = document.getElementById('selectLevel');
    const inputScore = document.getElementById('inputTargetScore');

    if (inputUsername) inputUsername.value = data.username;
    if (inputHandle) inputHandle.value = data.handle.replace(/^@/, '');
    if (inputBio) inputBio.value = data.bio;
    if (inputSchool) inputSchool.value = data.target_school;
    if (inputCourse) inputCourse.value = data.target_course;
    if (selectTrack) selectTrack.value = data.track;
    if (selectLevel) selectLevel.value = data.class_level;
    if (inputScore) inputScore.value = data.target_score;
  }

  // --- Modal Open / Close Logic ---
  function openEditModal() {
    const modal = document.getElementById('editProfileModal');
    if (!modal || modal.classList.contains('open')) return;
    editReturnFocus = document.activeElement;
    editSnapshot = Array.from(modal.querySelectorAll('input[id], textarea[id], select[id]')).map((field) => [field.id, field.value]);
    editWasSaved = false;
    previousBodyOverflow = document.body.style.overflow;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('profileMain')?.setAttribute('inert', '');
    document.querySelector('.tr-navbar')?.setAttribute('inert', '');
    setEditorError('');
    updateEditorPreview();
    showEditorSection('editorAbout');
    document.getElementById('inputUsername')?.focus();
  }

  function closeEditModal() {
    const modal = document.getElementById('editProfileModal');
    if (!modal?.classList.contains('open')) return;
    if (!editWasSaved && editSnapshot) {
      editSnapshot.forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
      });
      updateEditorPreview();
    }
    editSnapshot = null;
    modal.classList.remove('open');
    document.body.style.overflow = previousBodyOverflow;
    document.getElementById('profileMain')?.removeAttribute('inert');
    document.querySelector('.tr-navbar')?.removeAttribute('inert');
    editReturnFocus?.focus?.();
    editReturnFocus = null;
  }

  function setEditorError(message, sectionId) {
    const error = document.getElementById('editorError');
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
    if (message && sectionId) showEditorSection(sectionId);
  }

  function updateEditorPreview() {
    const name = document.getElementById('inputUsername')?.value.trim() || 'Your name';
    const handle = document.getElementById('inputHandle')?.value.trim().replace(/^@/, '') || 'candidate';
    const bioLength = document.getElementById('inputBio')?.value.length || 0;
    const previewName = document.getElementById('editorPreviewName');
    const previewHandle = document.getElementById('editorPreviewHandle');
    const previewAvatar = document.getElementById('editorAvatar');
    const bioCount = document.getElementById('editorBioCount');
    if (previewName) previewName.textContent = name;
    if (previewHandle) previewHandle.textContent = `@${handle}`;
    if (previewAvatar) previewAvatar.textContent = name.charAt(0).toUpperCase();
    if (bioCount) bioCount.textContent = `${bioLength} / 180`;
  }

  function showEditorSection(sectionId) {
    const sections = ['editorAbout', 'editorGoal', 'editorSubjects'];
    if (!sections.includes(sectionId)) return;
    sections.forEach((id) => {
      const section = document.getElementById(id);
      if (section) section.hidden = id !== sectionId;
    });
    document.querySelectorAll('[data-editor-target]').forEach((button) => {
      const active = button.dataset.editorTarget === sectionId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const scrollArea = document.getElementById('editorScrollArea');
    if (scrollArea) scrollArea.scrollTop = 0;
  }

  // --- Profile Save Handler ---
  async function handleProfileSave(event) {
    event.preventDefault();
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const username = (document.getElementById('inputUsername')?.value || '').trim();
      const rawHandle = (document.getElementById('inputHandle')?.value || '').trim().replace(/^@/, '').toLowerCase();
      const handle = rawHandle ? `@${rawHandle}` : `@${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const bio = (document.getElementById('inputBio')?.value || '').trim();
      const school = (document.getElementById('inputTargetSchool')?.value || '').trim();
      const course = (document.getElementById('inputTargetCourse')?.value || '').trim();
      const track = document.getElementById('selectTrack')?.value || 'Science';
      const level = document.getElementById('selectLevel')?.value || 'SS3';
      const scoreInput = (document.getElementById('inputTargetScore')?.value || '').trim();
      const targetScore = scoreInput ? Number(scoreInput) : null;

      // Extract subject combination
      const s2 = document.getElementById('selectSubject2')?.value || 'mathematics';
      const s3 = document.getElementById('selectSubject3')?.value || 'physics';
      const s4 = document.getElementById('selectSubject4')?.value || 'chemistry';

      const combo = ['english', s2, s3, s4];
      const uniqueSubjects = new Set(combo);
      if (!username) {
        setEditorError('Add your name before saving.', 'editorAbout');
        document.getElementById('inputUsername')?.focus();
        return;
      }
      if (rawHandle && !/^[a-z0-9_.]{3,30}$/.test(rawHandle)) {
        setEditorError('Use 3–30 letters, numbers, underscores or dots for your handle.', 'editorAbout');
        document.getElementById('inputHandle')?.focus();
        return;
      }
      if (scoreInput && (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 400)) {
        setEditorError('Enter a target score between 1 and 400, or leave it blank.', 'editorGoal');
        document.getElementById('inputTargetScore')?.focus();
        return;
      }
      if (uniqueSubjects.size !== 4) {
        setEditorError('Choose three different subjects besides Use of English.', 'editorSubjects');
        return;
      }

      if (currentUser && window.supabase) {
        const payload = { id: currentUser.id, email: currentUser.email || null, username, track, class_level: level, goal: bio || null, target_school: school || null, target_course: course || null, target_score: targetScore, subject_combo: combo };
        const { error } = await window.supabase.from('user_profiles').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
        currentProfile = { ...currentProfile, ...payload };
      }

      // Persist to localStorage
      localStorage.setItem('thinkright_username', username);
      localStorage.setItem('thinkright_user_handle', handle);
      localStorage.setItem('thinkright_user_bio', bio);
      localStorage.setItem('thinkright_target_school', school);
      localStorage.setItem('thinkright_target_course', course);
      localStorage.setItem('thinkright_user_track', track);
      localStorage.setItem('thinkright_class_level', level);
      localStorage.setItem('thinkright_target_score', targetScore ? String(targetScore) : '');
      localStorage.setItem('thinkright_subject_combo', JSON.stringify(combo));

      // Update UI in real-time
      applyValuesToUI({
        username,
        handle,
        bio,
        target_school: school,
        target_course: course,
        track,
        class_level: level,
        target_score: targetScore,
        created_at: currentProfile?.created_at || new Date().toISOString()
      });

      renderSubjectGrid(combo);

      showToast('Profile updated successfully!');
      editWasSaved = true;
      closeEditModal();
    } catch (err) {
      console.error('[profile] Error saving profile:', err);
      setEditorError('We could not save your changes. Please try again.');
      showToast('Failed to save profile. Please try again.', true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // --- Share Profile Feature ---
  function handleShareProfile() {
    const shareUrl = new URL('index.html', window.location.href).href;
    const shareData = {
      title: 'ThinkRight',
      text: 'I’m preparing for UTME with ThinkRight.',
      url: shareUrl
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('ThinkRight link copied to clipboard!');
      }).catch(() => {
        showToast('Failed to copy the link.', true);
      });
    }
  }

  // --- Tabs Switching ---
  function setupTabs() {
    const tabButtons = document.querySelectorAll('.social-tab-btn');
    const tabPanes = document.querySelectorAll('.social-tab-pane');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        tabButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
          b.tabIndex = -1;
        });
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.tabIndex = 0;

        const activePane = document.getElementById(`pane-${targetTab}`);
        if (activePane) {
          activePane.classList.add('active');
          if (window.matchMedia('(max-width: 640px)').matches) {
            activePane.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          }
        }
      });
      btn.addEventListener('keydown', (event) => {
        const tabs = Array.from(tabButtons);
        const index = tabs.indexOf(btn);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        tabs[next].click();
        tabs[next].focus();
      });
    });
  }

  // --- Initialize ---
  function initProfilePage() {
    loadProfile().then(() => {
      const SearchParams = window.URLSearchParams || (typeof URLSearchParams !== 'undefined' ? URLSearchParams : null);
      if (SearchParams && window.location?.search && new SearchParams(window.location.search).get('edit') === '1') {
        openEditModal();
        window.history?.replaceState?.({}, '', window.location.pathname);
      }
    });
    setupTabs();

    // Modal triggers
    const openBtn = document.getElementById('openEditModalBtn');
    const comboDirectBtn = document.getElementById('btnEditComboDirect');
    const closeBtn = document.getElementById('closeEditModalBtn');
    const cancelBtn = document.getElementById('cancelEditModalBtn');
    const modalOverlay = document.getElementById('editProfileModal');
    const form = document.getElementById('editProfileForm');
    const shareBtn = document.getElementById('shareProfileBtn');

    if (openBtn) openBtn.addEventListener('click', openEditModal);
    if (comboDirectBtn) comboDirectBtn.addEventListener('click', () => { openEditModal(); showEditorSection('editorSubjects'); document.getElementById('selectSubject2')?.focus(); });
    if (closeBtn) closeBtn.addEventListener('click', closeEditModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditModal);

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeEditModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!modalOverlay?.classList.contains('open')) return;
      if (e.key === 'Escape') {
        closeEditModal();
      } else if (e.key === 'Tab') {
        const focusable = Array.from(modalOverlay.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    if (form) form.addEventListener('submit', handleProfileSave);
    ['inputUsername', 'inputHandle', 'inputBio'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateEditorPreview);
    });
    document.querySelectorAll('[data-editor-target]').forEach((button) => {
      button.addEventListener('click', () => showEditorSection(button.dataset.editorTarget));
      button.addEventListener('keydown', (event) => {
        const tabs = Array.from(document.querySelectorAll('[data-editor-target]'));
        const index = tabs.indexOf(button);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        tabs[next].click();
        tabs[next].focus();
      });
    });
    if (shareBtn) shareBtn.addEventListener('click', handleShareProfile);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
  } else {
    initProfilePage();
  }
})();
