/**
 * ThinkRight - Student Classes Browsing, Enrollment, Curriculum Preview & Progress
 * Subject-course checkout includes every topic class from the selected teacher.
 */

(function () {
  "use strict";

  let currentUser = null;
  let isTeacherUser = false;
  let cohortsData = [];
  let userEnrollments = new Map(); // cohort_id -> { status, paid_amount }
  let userProgress = new Map();    // cohort_id -> { total: X, completed: Y }
  let activeFilter = "all";
  let searchQuery = "";


  // DOM references
  const cohortsGrid = document.getElementById("cohortsListGrid");
  const filterPills = document.querySelectorAll(".tr-filter-pill");
  const searchInput = document.getElementById("classesSearchInput");
  const curriculumModal = document.getElementById("curriculumModal");
  const curriculumCloseBtn = document.getElementById("curriculumCloseBtn");
  const curriculumModalBody = document.getElementById("curriculumModalBody");
  const curriculumModalTitle = document.getElementById("curriculumModalTitle");
  const curriculumModalTutor = document.getElementById("curriculumModalTutor");
  const curriculumModalFooter = document.getElementById("curriculumModalFooter");

  // Tutor DOM references
  const teacherClassesSection = document.getElementById("teacherClassesSection");
  const allClassesSectionHeader = document.getElementById("allClassesSectionHeader");
  const tutorCohortsListEl = document.getElementById("tutorCohortsList");
  const openCreateCohortBtn = document.getElementById("openCreateCohortBtn");
  const bannerCreateCohortBtn = document.getElementById("bannerCreateCohortBtn");

  const cohortModal = document.getElementById("cohortModal");
  const createCohortForm = document.getElementById("createCohortForm");
  const cohortSubjectSelect = document.getElementById("cohortSubjectSelect");
  const cohortTitleInput = document.getElementById("cohortTitleInput");
  const cohortStartDateInput = document.getElementById("cohortStartDateInput");
  const cohortPriceInput = document.getElementById("cohortPriceInput");
  const cohortWhatsappInput = document.getElementById("cohortWhatsappInput");
  const cohortFormError = document.getElementById("cohortFormError");
  const saveCohortBtn = document.getElementById("saveCohortBtn");

  const lessonModal = document.getElementById("lessonModal");
  const uploadLessonForm = document.getElementById("uploadLessonForm");
  const lessonTargetCohortId = document.getElementById("lessonTargetCohortId");
  const lessonModalSubtitle = document.getElementById("lessonModalSubtitle");
  const lessonTitleInput = document.getElementById("lessonTitleInput");
  const lessonTopicInput = document.getElementById("lessonTopicInput");
  const lessonVideoUrlInput = document.getElementById("lessonVideoUrlInput");
  const lessonOrderInput = document.getElementById("lessonOrderInput");
  const lessonFormError = document.getElementById("lessonFormError");
  const saveLessonBtn = document.getElementById("saveLessonBtn");

  // User resolution helper
  async function resolveUser() {
    let retries = 0;
    while (!window.authInitialized && retries < 15) {
      await new Promise((r) => setTimeout(r, 100));
      retries++;
    }

    if (window.getCurrentUser && typeof window.getCurrentUser === "function") {
      try {
        const u = await window.getCurrentUser();
        if (u) return u;
      } catch (e) { }
    }

    if (window.supabase && window.supabase.auth) {
      try {
        const res = await window.supabase.auth.getUser();
        return res?.data?.user || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Toast notification
  function showToast(message, type = "info") {
    let toast = document.getElementById("trClassesToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "trClassesToast";
      toast.className = "tr-toast";
      document.body.appendChild(toast);
    }

    toast.className = `tr-toast tr-toast--${type} is-visible`;
    const icon =
      type === "success"
        ? '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>'
        : type === "error"
          ? '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>'
          : '<i class="fa-solid fa-circle-info" style="color: #38bdf8;"></i>';

    toast.innerHTML = `${icon} <span></span>`;
    toast.querySelector('span').textContent = message;

    setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3500);
  }

  // Load User Enrollments & Progress
  async function loadUserEnrollmentsAndProgress() {
    if (!currentUser || !window.supabase) return;

    try {
      // 1. Fetch user active enrollments
      const { data: enrollments, error: eErr } = await window.supabase
        .from("enrollments")
        .select("cohort_id, status, paid_amount")
        .eq("user_id", currentUser.id)
        .eq("status", "active");

      if (!eErr && enrollments) {
        userEnrollments.clear();
        enrollments.forEach((e) => {
          userEnrollments.set(e.cohort_id, e);
        });
      }

      // 2. Fetch lesson progress for all enrolled cohorts
      if (userEnrollments.size > 0) {
        const enrolledIds = Array.from(userEnrollments.keys());

        // Get total lessons count per cohort
        const { data: lessons, error: lErr } = await window.supabase
          .from("lessons")
          .select("id, cohort_id")
          .in("cohort_id", enrolledIds);

        // Get completed lessons for user
        const { data: completed, error: pErr } = await window.supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", currentUser.id);

        const completedSet = new Set((completed || []).map((c) => c.lesson_id));

        if (!lErr && lessons) {
          userProgress.clear();
          enrolledIds.forEach((cid) => {
            const cohortLessons = lessons.filter((l) => l.cohort_id === cid);
            const total = cohortLessons.length;
            const done = cohortLessons.filter((l) => completedSet.has(l.id)).length;
            userProgress.set(cid, { total, completed: done });
          });
        }
      }
    } catch (err) {
      console.warn("Could not load user enrollment data:", err);
    }
  }

  // Load Cohorts Data
  async function loadCohorts() {
    cohortsData = [];

    if (window.supabase) {
      try {
        const { data, error } = await window.supabase
          .from("cohorts")
          .select(`
            id,
            subject_id,
            title,
            thumbnail_path,
            start_date,
            price,
            whatsapp_link,
            status,
            tutor_id,
            tutors (
              display_name,
              bio
            ),
            subjects (
              name,
              is_core,
              enrollment_price
            )
          `)
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false });

        if (error) throw error;
        cohortsData = (data || []).filter(cohort => cohort.tutors);
      } catch (err) {
        console.warn("Error fetching cohorts from Supabase:", err);
        cohortsGrid.innerHTML = '<p role="alert">Classes could not load. Please reload to retry.</p>';
        return;
      }
    }

    // Never offer enrollments into demo classes.

    renderCohorts();
  }

  // Filter cohorts based on active category & search query
  function getFilteredCohorts() {
    return cohortsData.filter((cohort) => {
      // Category filter
      if (activeFilter === "core") {
        const isCore = cohort.subjects?.is_core || cohort.subject_id === "english" || cohort.subject_id === "mathematics";
        if (!isCore) return false;
      } else if (activeFilter === "sciences") {
        const isScience = ["physics", "chemistry", "biology", "agriculture"].includes(cohort.subject_id);
        if (!isScience) return false;
      } else if (activeFilter === "arts") {
        const isArt = ["economics", "government", "literature", "commerce", "geography", "history", "crs", "irs"].includes(cohort.subject_id);
        if (!isArt) return false;
      }

      // Search query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (cohort.title || "").toLowerCase().includes(q);
        const subjectMatch = (cohort.subjects?.name || cohort.subject_id || "").toLowerCase().includes(q);
        const tutorMatch = (cohort.tutors?.display_name || "").toLowerCase().includes(q);
        if (!titleMatch && !subjectMatch && !tutorMatch) return false;
      }

      return true;
    });
  }

  // Render Cohorts Grid
  function renderCohorts() {
    if (!cohortsGrid) return;

    const filtered = getFilteredCohorts();

    if (filtered.length === 0) {
      cohortsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem;">
          <div style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-secondary);">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <h3 style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 1.3rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">
            No classes found matching your criteria
          </h3>
          <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto 1.5rem; font-size: 0.95rem;">
            Try clearing your search query or choosing another subject category to browse available classes.
          </p>
          <button type="button" class="tr-btn tr-btn--secondary" id="resetFiltersBtn">
            Reset Filters
          </button>
        </div>
      `;

      const resetBtn = document.getElementById("resetFiltersBtn");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          activeFilter = "all";
          searchQuery = "";
          if (searchInput) searchInput.value = "";
          filterPills.forEach((p) => p.classList.toggle("is-active", p.dataset.filter === "all"));
          renderCohorts();
        });
      }
      return;
    }

    cohortsGrid.innerHTML = filtered.map((cohort) => {
      const isEnrolled = userEnrollments.has(cohort.id);
      const isCore = cohort.subjects?.is_core || cohort.subject_id === "english" || cohort.subject_id === "mathematics";
      const subjectName = cohort.subjects?.name || (cohort.subject_id ? cohort.subject_id.toUpperCase() : "JAMB SUBJECT");
      const badgeClass = isCore ? "home-pillar-card__badge--blue" : "home-pillar-card__badge--green";
      const badgeText = isCore ? "Core Subject" : "Elective Subject";

      const price = cohort.subjects?.enrollment_price == null ? null : Number(cohort.subjects.enrollment_price);
      const priceHtml = price === null ? '<span class="student-cohort-card__price-tag">Price pending</span>' : price === 0
        ? `<span class="student-cohort-card__price-tag student-cohort-card__price-tag--free">Free</span>`
        : `<span class="student-cohort-card__price-tag">&#8358;${price.toLocaleString()}</span>`;

      // Progress bar if enrolled
      let progressHtml = "";
      if (isEnrolled) {
        const prog = userProgress.get(cohort.id) || { total: 0, completed: 0 };
        const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
        progressHtml = `
          <div class="cohort-progress-container">
            <div class="cohort-progress-header">
              <span>Study Progress: ${prog.completed}/${prog.total} Lessons</span>
              <span class="cohort-progress-pct">${pct}%</span>
            </div>
            <div class="cohort-progress-bar">
              <div class="cohort-progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }

      // Action buttons
      let actionButtons = "";
      const isMyCohort = currentUser && (cohort.tutor_id === currentUser.id);

      if (isMyCohort) {
        actionButtons = `
          <a href="cohort.html?id=${cohort.id}" class="tr-btn tr-btn--primary tr-btn--sm">
            Enter Classroom <i class="fa-solid fa-arrow-right"></i>
          </a>
          <a href="tutor-dashboard.html#classes" class="tr-btn tr-btn--outline tr-btn--sm">
            <i class="fa-solid fa-sliders"></i> Manage Class
          </a>
        `;
      } else if (isEnrolled) {
        actionButtons = `
          <button type="button" class="tr-btn tr-btn--outline tr-btn--sm btn-preview-curriculum" data-cohort-id="${cohort.id}">
            <i class="fa-solid fa-list-check"></i> Syllabus
          </button>
          <a href="cohort.html?id=${cohort.id}" class="tr-btn tr-btn--primary tr-btn--sm">
            Enter Classroom <i class="fa-solid fa-arrow-right"></i>
          </a>
        `;
      } else if (isTeacherUser) {
        actionButtons = `
          <button type="button" class="tr-btn tr-btn--outline tr-btn--sm btn-preview-curriculum" data-cohort-id="${cohort.id}">
            <i class="fa-solid fa-list-check"></i> Preview
          </button>
          <a href="cohort.html?id=${cohort.id}" class="tr-btn tr-btn--secondary tr-btn--sm">
            View Classroom <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
        `;
      } else {
        const enrollBtnText = price === null ? "Enrollment opens soon" : price === 0 ? "Enroll Free" : `Enrol in this class · &#8358;${price.toLocaleString()}`;
        actionButtons = `
          <button type="button" class="tr-btn tr-btn--outline tr-btn--sm btn-preview-curriculum" data-cohort-id="${cohort.id}">
            <i class="fa-solid fa-list-check"></i> Preview
          </button>
          <button type="button" class="tr-btn tr-btn--primary tr-btn--sm btn-enroll-cohort" data-cohort-id="${cohort.id}" ${price === null ? 'disabled' : ''}>
            ${enrollBtnText}
          </button>
        `;
      }

      const formattedStartDate = cohort.start_date
        ? new Date(cohort.start_date).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })
        : "October 2026";

      const coverPath = cohort.thumbnail_path;
      const coverURL = typeof coverPath === 'string' && /^[-a-f0-9]+\/[-a-f0-9]+\.(jpg|png|webp)$/.test(coverPath)
        ? window.supabase.storage.from('class-thumbnails').getPublicUrl(coverPath).data.publicUrl : '';
      return `
        <article class="student-cohort-card" data-cohort-id="${cohort.id}">
          <div class="class-cover">
            <div class="class-cover__fallback"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span>${escapeHtml(subjectName)}</span></div>
            ${coverURL?`<img src="${escapeHtml(coverURL)}" alt="${escapeHtml(cohort.title)} — ${escapeHtml(cohort.tutors?.display_name||'ThinkRight educator')}" width="640" height="360" loading="lazy" decoding="async">`:''}
          </div>
          <div class="student-cohort-card__badge-row">
            <span class="home-pillar-card__badge ${badgeClass}">${badgeText}: ${escapeHtml(subjectName)}</span>
            ${priceHtml}
          </div>

          <h3 class="student-cohort-card__title">${escapeHtml(cohort.title)}</h3>
          <p class="student-cohort-card__desc">
            ${escapeHtml(cohort.tutors?.bio || "Comprehensive syllabus coverage, structured async video lessons, WhatsApp peer groups, and weekly Q&A sessions.")}
          </p>

          <div class="student-cohort-card__meta-list">
            <div class="student-cohort-card__meta-item">
              <i class="fa-solid fa-chalkboard-user"></i>
              <span>Tutor: <strong>${escapeHtml(cohort.tutors?.display_name || "ThinkRight Lead Educator")}</strong></span>
            </div>
            <div class="student-cohort-card__meta-item">
              <i class="fa-regular fa-calendar-days"></i>
              <span>Starts: <strong>${formattedStartDate}</strong></span>
            </div>
            <div class="student-cohort-card__meta-item">
              <i class="fa-solid fa-circle-play" style="color: var(--accent-primary);"></i>
              <span>Format: <strong>100% Async Pre-recorded</strong></span>
            </div>
          </div>

          ${progressHtml}

          <div class="student-cohort-card__actions">
            ${actionButtons}
          </div>
        </article>
      `;
    }).join("");

    attachCardEventListeners();
  }

  // Attach Listeners to Card Buttons
  function attachCardEventListeners() {
    // Preview Curriculum buttons
    document.querySelectorAll(".btn-preview-curriculum").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cohortId = btn.getAttribute("data-cohort-id");
        openCurriculumModal(cohortId);
      });
    });

    // Enroll Cohort buttons
    document.querySelectorAll(".btn-enroll-cohort").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cohortId = btn.getAttribute("data-cohort-id");
        handleEnrollment(cohortId);
      });
    });
  }

  // Handle Enrollment & Payment Flow
  async function handleEnrollment(cohortId) {
    if (!currentUser) {
      location.href = 'login.html?next=' + encodeURIComponent('classes.html?enroll=' + cohortId);
      return;
    }
    if (handleEnrollment.busy) return;
    handleEnrollment.busy = true;
    const enrollmentButtons = [...document.querySelectorAll('.btn-enroll-cohort')].filter(button => button.dataset.cohortId === cohortId);
    enrollmentButtons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
    showToast('Opening secure checkout...', 'info');
    try {
      const { data, error } = await window.supabase.functions.invoke('class-checkout', { body: { action: 'initialize', cohort_id: cohortId } });
      if (error || data?.error) throw new Error(data?.error || 'Enrollment could not start. Please retry.');
      if (data.enrolled) location.href = 'cohort.html?id=' + encodeURIComponent(cohortId);
      else {
        const checkout = new URL(data.authorization_url);
        if (checkout.protocol !== 'https:' || checkout.username || checkout.password || !(checkout.hostname === 'flutterwave.com' || checkout.hostname.endsWith('.flutterwave.com') || checkout.hostname === 'ravemodal-dev.herokuapp.com')) throw new Error('Invalid checkout destination');
        try { sessionStorage.setItem('thinkright_class_payment_' + currentUser.id, data.reference); } catch (_) {}
        location.href = checkout.href;
      }
    } catch (error) { showToast(error.message, 'error'); }
    finally { handleEnrollment.busy = false; enrollmentButtons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); }); }
  }

  async function verifyCoursePayment(reference) {
    if (verifyCoursePayment.busy) return;
    if (!/^TR-[a-f0-9-]{36}$/i.test(reference || '')) { showToast('Invalid payment reference.', 'error'); return; }
    verifyCoursePayment.busy = true;
    let panel = document.getElementById('classPaymentStatus');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'classPaymentStatus';
      panel.className = 'class-payment-status';
      panel.setAttribute('aria-label', 'Class payment status');
      const target = document.getElementById('studentClassesHeader');
      if (target) target.insertAdjacentElement('afterend', panel);
      else if (cohortsGrid?.parentElement) cohortsGrid.parentElement.prepend(panel);
    }
    panel.innerHTML = '<h2>Checking your payment</h2><p role="status">Please wait while we confirm your course access.</p><small></small>';
    panel.querySelector('small').textContent = 'Reference: ' + reference;
    try {
      const { data, error } = await window.supabase.functions.invoke('class-checkout', { body: { action: 'verify', reference } });
      if (error || data?.error || !data?.cohort_id) throw new Error('We could not confirm your payment yet. If you have paid, do not pay again. Retry verification or contact support with the reference below.');
      try { sessionStorage.removeItem('thinkright_class_payment_' + currentUser.id); } catch (_) {}
      location.replace('cohort.html?id=' + encodeURIComponent(data.cohort_id));
    } catch (error) {
      panel.querySelector('h2').textContent = 'Your payment needs confirmation';
      panel.querySelector('p').textContent = error.message;
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Retry verification';
      retry.addEventListener('click', () => verifyCoursePayment(reference));
      panel.append(retry);
      const support = document.createElement('a');
      support.href = 'mailto:thinkright912@gmail.com?subject=' + encodeURIComponent('Class payment ' + reference);
      support.textContent = 'Contact support'; panel.append(support);
    } finally { verifyCoursePayment.busy = false; }
  }

  async function openCurriculumModal(cohortId) {
    const cohort = cohortsData.find((c) => c.id === cohortId);
    if (!cohort || !curriculumModal) return;

    const isEnrolled = userEnrollments.has(cohortId);
    const price = cohort.subjects?.enrollment_price == null ? null : Number(cohort.subjects.enrollment_price);

    if (curriculumModalTitle) {
      curriculumModalTitle.textContent = cohort.title;
    }
    if (curriculumModalTutor) {
      curriculumModalTutor.textContent = `Tutor: ${cohort.tutors?.display_name || "ThinkRight Educator"} • ${(cohort.subjects?.name || cohort.subject_id || "JAMB").toUpperCase()}`;
    }

    if (curriculumModalBody) {
      curriculumModalBody.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 0; color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;">
          <div class="tr-loader-spinner tr-loader-spinner--score" aria-hidden="true">
            <span class="tr-loader-spinner__core"></span>
          </div>
          <p style="margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);">Loading syllabus curriculum...</p>
        </div>
      `;
    }

    curriculumModal.classList.add("is-open");
    document.body.style.overflow = "hidden";

    // Fetch lessons from DB or sampleLessons
    let lessons = [];
    if (window.supabase) {
      try {
        const { data: dbLessons, error } = await window.supabase.rpc('class_curriculum', { p_cohort: cohortId });

        if (!error && dbLessons && dbLessons.length > 0) {
          lessons = dbLessons;
        }
      } catch (e) {
        console.warn("Could not fetch lessons from DB:", e);
      }
    }

    if (lessons.length === 0) {
      lessons = cohort.sampleLessons || [];
    }

    // Check user completed lesson progress if enrolled
    let completedSet = new Set();
    if (isEnrolled && currentUser && window.supabase) {
      try {
        const { data: progress } = await window.supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", currentUser.id);

        if (progress) {
          progress.forEach((p) => completedSet.add(p.lesson_id));
        }
      } catch (e) { }
    }

    // Render lessons inside modal body
    if (curriculumModalBody) {
      if (lessons.length === 0) {
        curriculumModalBody.innerHTML = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-secondary);">
            <p style="font-size: 0.95rem; margin: 0;">No syllabus lessons uploaded yet for this class.</p>
          </div>
        `;
      } else {
        const lessonRows = lessons.map((lesson, idx) => {
          const isDone = completedSet.has(lesson.id);
          let statusIcon = "";
          if (isEnrolled) {
            statusIcon = isDone
              ? `<span class="curriculum-lesson-row__status curriculum-lesson-row__status--completed" title="Completed"><i class="fa-solid fa-circle-check"></i></span>`
              : `<span class="curriculum-lesson-row__status" style="color: var(--accent-primary);" title="Ready to watch"><i class="fa-regular fa-circle-play"></i></span>`;
          } else {
            statusIcon = `<span class="curriculum-lesson-row__status curriculum-lesson-row__status--locked" title="Enroll to unlock"><i class="fa-solid fa-lock"></i></span>`;
          }

          return `
            <div class="curriculum-lesson-row">
              <div class="curriculum-lesson-row__left">
                <span class="curriculum-lesson-row__num">${lesson.order_index || idx + 1}</span>
                <div style="min-width: 0;">
                  <h5 class="curriculum-lesson-row__title">${escapeHtml(lesson.title)}</h5>
                  <p class="curriculum-lesson-row__topic">${escapeHtml(lesson.syllabus_topic || "JAMB Official Syllabus Topic")}</p>
                </div>
              </div>
              ${statusIcon}
            </div>
          `;
        }).join("");

        curriculumModalBody.innerHTML = `
          <div style="margin-bottom: 1.25rem;">
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0 0 1rem 0;">
              ${lessons.length} structured async lessons mapped to the official JAMB UTME syllabus.
            </p>
            <div class="curriculum-lessons-list">
              ${lessonRows}
            </div>
          </div>
        `;
      }
    }

    // Footer actions
    if (curriculumModalFooter) {
      if (isEnrolled) {
        curriculumModalFooter.innerHTML = `
          <span style="font-size: 0.85rem; color: #10b981; font-weight: 600;">
            <i class="fa-solid fa-circle-check"></i> Class unlocked
          </span>
          <a href="cohort.html?id=${cohortId}" class="tr-btn tr-btn--primary tr-btn--sm">
            Enter Classroom <i class="fa-solid fa-arrow-right"></i>
          </a>
        `;
      } else {
        const enrollBtnText = price === null ? "Enrollment opens soon" : price === 0 ? "Enroll Free" : `Enrol in this class · &#8358;${price.toLocaleString()}`;
        curriculumModalFooter.innerHTML = `
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">One-time class enrolment</span>
            <span style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">
              ${price === null ? 'Price pending' : price === 0 ? "Free" : `&#8358;${price.toLocaleString()}`}
            </span>
            <small style="color: var(--text-secondary);">Access to this class with this teacher. Other classes are purchased separately.</small>
          </div>
          <button type="button" class="tr-btn tr-btn--primary tr-btn--sm" id="modalEnrollBtn" ${price === null ? 'disabled' : ''}>
            ${enrollBtnText} <i class="fa-solid fa-arrow-right"></i>
          </button>
        `;

        const modalEnrollBtn = document.getElementById("modalEnrollBtn");
        if (modalEnrollBtn) {
          modalEnrollBtn.addEventListener("click", () => {
            closeCurriculumModal();
            handleEnrollment(cohortId);
          });
        }
      }
    }
  }

  // Close Curriculum Modal
  function closeCurriculumModal() {
    if (curriculumModal) {
      curriculumModal.classList.remove("is-open");
      document.body.style.overflow = "";
    }
  }

  // HTML escaping utility
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Filter & Search Event Listeners
  function initFilterListeners() {
    filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        filterPills.forEach((p) => p.classList.remove("is-active"));
        pill.classList.add("is-active");
        activeFilter = pill.getAttribute("data-filter") || "all";
        renderCohorts();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.trim();
        renderCohorts();
      });
    }

    if (curriculumCloseBtn) {
      curriculumCloseBtn.addEventListener("click", closeCurriculumModal);
    }

    if (curriculumModal) {
      curriculumModal.addEventListener("click", (e) => {
        if (e.target === curriculumModal) {
          closeCurriculumModal();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && curriculumModal?.classList.contains("is-open")) {
        closeCurriculumModal();
      }
    });
  }

  // Auto-prompt enrollment if URL param ?enroll=... is present
  function checkUrlEnrollment() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetCohortId = urlParams.get("enroll");
    if (targetCohortId) {
      setTimeout(() => {
        handleEnrollment(targetCohortId);
      }, 500);
    }
  }

  function applyRoleView(isTeacher) {
    const studentHeader = document.getElementById("studentClassesHeader");
    const teacherClassesSection = document.getElementById("teacherClassesSection");
    const studentBrowseSection = document.getElementById("studentBrowseSection");
    const tutorRecruitBanner = document.getElementById("tutorRecruitBanner");

    if (isTeacher) {
      if (studentHeader) studentHeader.style.display = "none";
      if (teacherClassesSection) teacherClassesSection.style.display = "block";
      if (studentBrowseSection) studentBrowseSection.style.display = "none";
      if (tutorRecruitBanner) tutorRecruitBanner.style.display = "none";
    } else {
      if (studentHeader) studentHeader.style.display = "flex";
      if (teacherClassesSection) teacherClassesSection.style.display = "none";
      if (studentBrowseSection) studentBrowseSection.style.display = "block";
      if (tutorRecruitBanner) tutorRecruitBanner.style.display = "none";
    }
  }

  // Initialization
  async function init() {
    try {
      window.ThinkRightLoader?.setProgress(30, 'Resolving candidate profile...');
      currentUser = await resolveUser();
      const identity = await window.resolveWorkspaceIdentity();
      if (identity.role === 'teacher' || identity.role === 'admin') {
        location.replace(identity.role === 'admin' ? 'admin.html' : (new URLSearchParams(location.search).get('create') === '1' || location.hash === '#create' ? 'tutor-class.html' : 'tutor-classes.html'));
        return;
      }
      isTeacherUser = false;
      applyRoleView(false);
      initFilterListeners();
      window.ThinkRightLoader?.setProgress(55, 'Syncing your enrollments...');
      await loadUserEnrollmentsAndProgress();
      window.ThinkRightLoader?.setProgress(80, 'Loading available classes...');
      await loadCohorts();
      const urlParams = new URLSearchParams(location.search);
      const reference = urlParams.get('tx_ref') || urlParams.get('reference');
      const paymentStatus = urlParams.get('status');
      if (reference) {
        if (paymentStatus === 'cancelled') {
          try { sessionStorage.removeItem('thinkright_class_payment_' + currentUser?.id); } catch (_) {}
          showToast('Checkout was cancelled. If your account was debited, contact support with your payment reference.', 'info');
          window.ThinkRightLoader?.done('Classes ready');
          return;
        }
        if (!currentUser) { location.replace('login.html?next=' + encodeURIComponent(location.pathname + location.search)); return; }
        await verifyCoursePayment(reference);
        return;
      }
      if (currentUser) {
        let pending;
        try { pending = sessionStorage.getItem('thinkright_class_payment_' + currentUser.id); } catch (_) {}
        if (pending) { await verifyCoursePayment(pending); return; }
      }
      checkUrlEnrollment();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      window.ThinkRightLoader?.done('Classes ready');
    }
  }

  document.addEventListener('error', event => {
    if (event.target.matches?.('.class-cover img')) event.target.hidden = true;
  }, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
