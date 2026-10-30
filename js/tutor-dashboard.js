/**
 * ThinkRight - Tutor Dashboard Client Logic
 * Handles cohort creation, lesson uploads & management, and real-time statistics.
 */

(function () {
  "use strict";

  // State
  let currentUser = null;
  let currentTutor = null;
  let subjectsList = [];
  let cohortsList = [];
  let lessonsByCohort = {};
  let enrollmentsByCohort = {};
  let openDrawers = new Set();
  let enrolledStudentsList = [];

  // DOM Elements
  const tutorCohortCountEl = document.getElementById("tutorCohortCount");
  const tutorStudentCountEl = document.getElementById("tutorStudentCount");
  const tutorGrossRevenueEl = document.getElementById("tutorGrossRevenue");
  const tutorNetEarningsEl = document.getElementById("tutorNetEarnings");
  const tutorCohortsListEl = document.getElementById("tutorCohortsList");
  const openCreateCohortBtn = document.getElementById("openCreateCohortBtn");

  const tabClassesBtn = document.getElementById("tabClassesBtn");
  const tabStudentsBtn = document.getElementById("tabStudentsBtn");
  const tutorStudentsTabCountEl = document.getElementById("tutorStudentsTabCount");
  const tutorClassesSection = document.getElementById("classes") || document.getElementById("tutorClassesSection");
  const tutorStudentsSection = document.getElementById("tutorStudentsSection");
  const tutorStudentsListEl = document.getElementById("tutorStudentsList");
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

  const trToast = document.getElementById("trToast");

  // Tab switching logic
  function setupTabs() {
    if (tabClassesBtn && tabStudentsBtn) {
      tabClassesBtn.addEventListener("click", () => {
        tabClassesBtn.classList.add("is-active");
        tabClassesBtn.setAttribute("aria-selected", "true");
        tabStudentsBtn.classList.remove("is-active");
        tabStudentsBtn.setAttribute("aria-selected", "false");
        if (tutorClassesSection) tutorClassesSection.style.display = "block";
        if (tutorStudentsSection) tutorStudentsSection.style.display = "none";
      });

      tabStudentsBtn.addEventListener("click", () => {
        tabStudentsBtn.classList.add("is-active");
        tabStudentsBtn.setAttribute("aria-selected", "true");
        tabClassesBtn.classList.remove("is-active");
        tabClassesBtn.setAttribute("aria-selected", "false");
        if (tutorClassesSection) tutorClassesSection.style.display = "none";
        if (tutorStudentsSection) tutorStudentsSection.style.display = "block";
      });
    }
  }

  // Helper: Toast Notifications
  function showToast(message, type = "success") {
    if (!trToast) return;
    trToast.textContent = message;
    trToast.className = `tr-toast tr-toast--${type} is-visible`;
    setTimeout(() => {
      trToast.classList.remove("is-visible");
    }, 3500);
  }

  // Modal Handlers
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("is-open");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const firstInput = modalEl.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function initModalDismissals() {
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const modalId = btn.getAttribute("data-close-modal");
        closeModal(document.getElementById(modalId));
      });
    });

    [cohortModal, lessonModal].forEach((modal) => {
      if (!modal) return;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal(cohortModal);
        closeModal(lessonModal);
      }
    });
  }

  // Auth & Tutor Verification
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
      } catch (e) {}
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

  async function checkTutorAuth() {
    currentUser = await resolveUser();
    if (!currentUser) {
      window.location.href = "login.html?next=" + encodeURIComponent("tutor-dashboard.html");
      return false;
    }

    try {
      let { data: tutor, error } = await window.supabase
        .from("tutors")
        .select("id, status, display_name, subjects, revenue_share_pct")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error) {
        console.warn("Notice checking tutor record:", error);
      }

      // If user registered as teacher or has teacher role, ensure tutor profile exists
      const isTeacherRole = localStorage.getItem("thinkright_auth_role") === "teacher" || currentUser.user_metadata?.role === "teacher" || currentUser.user_metadata?.role === "tutor";
      if (isTeacherRole) {
        localStorage.setItem("thinkright_auth_role", "teacher");
      }
      if (!tutor && isTeacherRole) {
        const name = String(currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.user_metadata?.username || currentUser.email?.split("@")[0] || "Educator").trim();
        try {
          const { data: newTutor, error: insErr } = await window.supabase
            .from("tutors")
            .upsert({
              id: currentUser.id,
              display_name: name,
              status: "active",
              revenue_share_pct: 70.0
            })
            .select()
            .single();

          if (!insErr && newTutor) {
            tutor = newTutor;
          }
        } catch (_insE) {
          console.warn("Could not auto-create tutor row:", _insE);
        }
      }

      if (!tutor) {
        window.location.href = "tutor-onboarding.html";
        return false;
      }

      if (tutor.status === "suspended") {
        window.location.href = "tutor-onboarding.html";
        return false;
      }

      currentTutor = tutor;

      // If pending, show notice banner but allow creating classes & uploading lessons
      if (tutor.status === "pending") {
        const pendingBanner = document.getElementById("tutorPendingNoticeBanner");
        if (pendingBanner) pendingBanner.style.display = "flex";
      }

      return true;
    } catch (err) {
      console.error("Tutor verification error:", err);
      return false;
    }
  }

  // Load Canonical Subjects
  async function loadSubjects() {
    try {
      const { data, error } = await window.supabase
        .from("subjects")
        .select("id, name, is_core")
        .order("is_core", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      subjectsList = data || [];

      if (cohortSubjectSelect) {
        cohortSubjectSelect.innerHTML = `<option value="">Select subject...</option>` +
          subjectsList.map((s) => `<option value="${s.id}">${s.name} ${s.is_core ? "(Core)" : ""}</option>`).join("");
      }
    } catch (e) {
      console.warn("Could not load subjects:", e);
    }
  }

  // Auto-fill title suggestion when subject changes
  if (cohortSubjectSelect) {
    cohortSubjectSelect.addEventListener("change", () => {
      const selectedId = cohortSubjectSelect.value;
      const subj = subjectsList.find((s) => s.id === selectedId);
      if (subj && (!cohortTitleInput.value || cohortTitleInput.value.includes("JAMB 2026"))) {
        cohortTitleInput.value = `JAMB 2026 ${subj.name} Intensive Mastery`;
      }
    });
  }

  // Set default start date to next Monday
  function setDefaultStartDate() {
    if (!cohortStartDateInput) return;
    const now = new Date();
    const day = now.getDay();
    const diff = (8 - day) % 7 || 7; // days until next Monday
    const nextMonday = new Date(now.setDate(now.getDate() + diff));
    cohortStartDateInput.value = nextMonday.toISOString().split("T")[0];
  }

  // Fetch Dashboard Data
  async function loadTutorData() {
    if (!currentUser) return;

    try {
      // 1. Fetch Cohorts
      const { data: cohorts, error: cErr } = await window.supabase
        .from("cohorts")
        .select("id, subject_id, title, start_date, price, whatsapp_link, status, created_at")
        .eq("tutor_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (cErr) throw cErr;
      cohortsList = cohorts || [];

      // Update Active Classes Stat
      const activeCount = cohortsList.filter((c) => c.status === "open" || c.status === "in_progress").length;
      if (tutorCohortCountEl) tutorCohortCountEl.textContent = activeCount;

      if (cohortsList.length === 0) {
        if (tutorStudentCountEl) tutorStudentCountEl.textContent = "0";
        renderEmptyState();
        return;
      }

      const cohortIds = cohortsList.map((c) => c.id);

      // 2. Fetch Lessons for these cohorts
      const { data: lessons, error: lErr } = await window.supabase
        .from("lessons")
        .select("id, cohort_id, title, syllabus_topic, video_url, order_index, created_at")
        .in("cohort_id", cohortIds)
        .order("order_index", { ascending: true });

      if (!lErr && lessons) {
        lessonsByCohort = {};
        lessons.forEach((l) => {
          if (!lessonsByCohort[l.cohort_id]) lessonsByCohort[l.cohort_id] = [];
          lessonsByCohort[l.cohort_id].push(l);
        });
      }

      // 3. Fetch Enrollments with paid amount and date
      const { data: enrollments, error: eErr } = await window.supabase
        .from("enrollments")
        .select("id, cohort_id, user_id, paid_amount, status, enrolled_at")
        .in("cohort_id", cohortIds)
        .eq("status", "active");

      enrollmentsByCohort = {};
      const uniqueStudents = new Set();
      let grossRevenue = 0;
      enrolledStudentsList = enrollments || [];

      if (!eErr && enrollments) {
        enrollments.forEach((e) => {
          enrollmentsByCohort[e.cohort_id] = (enrollmentsByCohort[e.cohort_id] || 0) + 1;
          uniqueStudents.add(e.user_id);
          const amount = Number(e.paid_amount || 0);
          grossRevenue += amount;
        });
      }

      const revSharePct = Number(currentTutor?.revenue_share_pct || 70) / 100;
      const netEarnings = grossRevenue * revSharePct;

      if (tutorGrossRevenueEl) tutorGrossRevenueEl.textContent = `₦${Math.round(grossRevenue).toLocaleString()}`;
      if (tutorNetEarningsEl) tutorNetEarningsEl.textContent = `₦${Math.round(netEarnings).toLocaleString()}`;
      if (tutorStudentCountEl) tutorStudentCountEl.textContent = uniqueStudents.size;
      if (tutorStudentsTabCountEl) tutorStudentsTabCountEl.textContent = uniqueStudents.size;

      // 4. Render Cohort Cards
      renderCohortsList();

      // 5. Render Students Roster
      await renderStudentsRoster(enrolledStudentsList, uniqueStudents);
    } catch (err) {
      console.error("Failed to load tutor dashboard data:", err);
      if (tutorCohortsListEl) {
        tutorCohortsListEl.innerHTML = `
          <div style="padding: 2rem 1rem; text-align: center; color: var(--text-secondary);">
            <p>Failed to load classes. Please refresh the page.</p>
          </div>
        `;
      }
    }
  }

  async function renderStudentsRoster(enrollments, uniqueUserIds) {
    if (!tutorStudentsListEl) return;

    if (!enrollments || enrollments.length === 0) {
      tutorStudentsListEl.innerHTML = `
        <div style="padding: 3rem 1.5rem; text-align: center; background: rgba(100, 116, 139, 0.03); border: 1px dashed var(--border-color); border-radius: 16px;">
          <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(37, 99, 235, 0.1); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; margin: 0 auto 1rem;">
            <i class="fa-solid fa-user-graduate"></i>
          </div>
          <h3 style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.5rem 0;">
            No Student Enrollments Yet
          </h3>
          <p style="color: var(--text-secondary); max-width: 440px; margin: 0 auto; font-size: 0.9rem; line-height: 1.5;">
            When students register and enroll in your classes, their profile and contact details will appear here.
          </p>
        </div>
      `;
      return;
    }

    // Fetch student profile names if available
    let profilesMap = {};
    if (uniqueUserIds && uniqueUserIds.size > 0 && window.supabase) {
      try {
        const { data: profiles } = await window.supabase
          .from("user_profiles")
          .select("id, username, email")
          .in("id", Array.from(uniqueUserIds));
        if (profiles) {
          profiles.forEach((p) => {
            profilesMap[p.id] = p.username || p.email?.split("@")[0] || "Candidate";
          });
        }
      } catch (_e) {}
    }

    const cohortMap = {};
    cohortsList.forEach((c) => { cohortMap[c.id] = c.title; });

    tutorStudentsListEl.innerHTML = `
      <div class="tutor-students-grid">
        ${enrollments.map((enr) => {
          const studentName = profilesMap[enr.user_id] || "JAMB Candidate";
          const cohortTitle = cohortMap[enr.cohort_id] || "JAMB Class";
          const initial = studentName.charAt(0).toUpperCase();
          const enrolledDate = enr.enrolled_at ? new Date(enr.enrolled_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" }) : "Recently";
          const amount = Number(enr.paid_amount || 0) > 0 ? `₦${Number(enr.paid_amount).toLocaleString()}` : "Free";

          return `
            <div class="tutor-student-card">
              <div class="tutor-student-card__head">
                <div class="tutor-student-card__avatar">${initial}</div>
                <div style="min-width: 0;">
                  <h4 class="tutor-student-card__name">${escapeHtml(studentName)}</h4>
                  <p class="tutor-student-card__cohort">${escapeHtml(cohortTitle)}</p>
                </div>
              </div>
              <div class="tutor-student-card__meta">
                <span>Enrolled: <strong>${enrolledDate}</strong></span>
                <span class="home-pillar-card__badge home-pillar-card__badge--green" style="margin: 0; padding: 2px 8px; font-size: 0.72rem;">${amount}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderEmptyState() {
    if (!tutorCohortsListEl) return;
    tutorCohortsListEl.innerHTML = `
      <div style="padding: 3rem 1.5rem; text-align: center; background: rgba(100, 116, 139, 0.03); border: 1px dashed var(--border-color); border-radius: 16px;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(37, 99, 235, 0.1); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin: 0 auto 1.25rem;">
          <i class="fa-solid fa-chalkboard-user"></i>
        </div>
        <h3 style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.5rem 0;">
          You haven't created any classes yet
        </h3>
        <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto 1.75rem; font-size: 0.95rem; line-height: 1.6;">
          Launch your first JAMB syllabus class and upload pre-recorded video lessons. Students learn on their own schedule, and you earn 70% of every enrollment fee.
        </p>
        <button type="button" class="tr-btn tr-btn--primary" id="emptyCreateBtn">
          <i class="fa-solid fa-plus"></i> Create Your First Class
        </button>
      </div>
    `;

    const emptyBtn = document.getElementById("emptyCreateBtn");
    if (emptyBtn) {
      emptyBtn.addEventListener("click", () => openModal(cohortModal));
    }
  }

  function renderCohortsList() {
    if (!tutorCohortsListEl) return;

    tutorCohortsListEl.innerHTML = cohortsList.map((cohort) => {
      const subj = subjectsList.find((s) => s.id === cohort.subject_id);
      const subjName = subj ? subj.name : cohort.subject_id;
      const lessons = lessonsByCohort[cohort.id] || [];
      const studentCount = enrollmentsByCohort[cohort.id] || 0;
      const isDrawerOpen = openDrawers.has(cohort.id);

      const statusBadge = cohort.status === "open"
        ? `<span class="home-pillar-card__badge home-pillar-card__badge--green">Enrollment Open</span>`
        : cohort.status === "in_progress"
        ? `<span class="home-pillar-card__badge home-pillar-card__badge--blue">In Progress</span>`
        : `<span class="home-pillar-card__badge" style="background: rgba(100, 116, 139, 0.15); color: var(--text-secondary);">Closed</span>`;

      const formattedPrice = Number(cohort.price) > 0 ? `₦${Number(cohort.price).toLocaleString()}` : "Free Intake";
      const formattedDate = new Date(cohort.start_date).toLocaleDateString("en-NG", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });

      // Lessons items HTML
      let lessonsHtml = "";
      if (lessons.length === 0) {
        lessonsHtml = `
          <div style="padding: 1.5rem 1rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
            <p style="margin: 0 0 0.75rem 0;">No lessons uploaded to this class yet.</p>
            <button type="button" class="tr-btn tr-btn--secondary tr-btn--sm" data-action="upload-lesson" data-cohort-id="${cohort.id}" data-cohort-title="${encodeURIComponent(cohort.title)}">
              <i class="fa-solid fa-cloud-arrow-up"></i> Upload Lesson 1
            </button>
          </div>
        `;
      } else {
        lessonsHtml = `
          <div class="tutor-lessons-list">
            ${lessons.map((l) => `
              <div class="tutor-lesson-item">
                <div class="tutor-lesson-item__left">
                  <span class="tutor-lesson-item__index">${l.order_index}</span>
                  <div class="tutor-lesson-item__info">
                    <h5 class="tutor-lesson-item__name">${escapeHtml(l.title)}</h5>
                    <p class="tutor-lesson-item__topic"><i class="fa-solid fa-bookmark" style="font-size: 0.75rem; margin-right: 4px; color: var(--accent-primary);"></i>${escapeHtml(l.syllabus_topic || "General Topic")}</p>
                  </div>
                </div>
                <div class="tutor-lesson-item__actions">
                  <a href="${escapeHtml(l.video_url)}" target="_blank" rel="noopener noreferrer" class="tutor-lesson-action-btn" title="View video source">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                  </a>
                  <button type="button" class="tutor-lesson-action-btn tutor-lesson-action-btn--delete" data-action="delete-lesson" data-lesson-id="${l.id}" data-cohort-id="${cohort.id}" title="Delete lesson">
                    <i class="fa-regular fa-trash-can"></i>
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }

      return `
        <article class="tutor-cohort-card" id="cohort-card-${cohort.id}">
          <div class="tutor-cohort-card__header">
            <div>
              <span class="home-pillar-card__badge home-pillar-card__badge--blue">${escapeHtml(subjName)}</span>
              <h3 class="tutor-cohort-card__title">${escapeHtml(cohort.title)}</h3>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="tutor-cohort-card__meta">
            <div class="tutor-cohort-card__meta-item">
              <i class="fa-regular fa-calendar" style="color: var(--accent-primary);"></i>
              <span>Starts: <strong>${formattedDate}</strong></span>
            </div>
            <div class="tutor-cohort-card__meta-item">
              <i class="fa-solid fa-tag" style="color: #10b981;"></i>
              <span>Price: <strong>${formattedPrice}</strong></span>
            </div>
            <div class="tutor-cohort-card__meta-item">
              <i class="fa-solid fa-users" style="color: #6366f1;"></i>
              <span>Enrolled: <strong>${studentCount} candidate${studentCount === 1 ? "" : "s"}</strong></span>
            </div>
            <div class="tutor-cohort-card__meta-item">
              <i class="fa-solid fa-video" style="color: #f59e0b;"></i>
              <span>Lessons: <strong>${lessons.length} uploaded</strong></span>
            </div>
            <div class="tutor-cohort-card__meta-item">
              <i class="fa-solid fa-circle-play" style="color: var(--accent-primary);"></i>
              <span>Format: <strong>100% Async Lessons</strong></span>
            </div>
          </div>

          <div class="tutor-cohort-card__actions">
            <button type="button" class="tr-btn tr-btn--primary tr-btn--sm" data-action="upload-lesson" data-cohort-id="${cohort.id}" data-cohort-title="${encodeURIComponent(cohort.title)}">
              <i class="fa-solid fa-cloud-arrow-up"></i> Upload Lesson
            </button>
            <button type="button" class="tr-btn tr-btn--secondary tr-btn--sm" data-action="toggle-drawer" data-cohort-id="${cohort.id}">
              <i class="fa-solid fa-list-check"></i> Manage Lessons (${lessons.length})
            </button>
            <a href="cohort.html?id=${cohort.id}" target="_blank" class="tr-btn tr-btn--outline tr-btn--sm">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Preview Classroom
            </a>
            ${cohort.whatsapp_link ? `
              <a href="${escapeHtml(cohort.whatsapp_link)}" target="_blank" rel="noopener noreferrer" class="tr-btn tr-btn--outline tr-btn--sm" style="color: #25d366 !important;" title="Open WhatsApp Group">
                <i class="fa-brands fa-whatsapp"></i> WhatsApp Group
              </a>
            ` : ""}
          </div>

          <!-- Inline Lesson Drawer -->
          <div class="tutor-lessons-drawer ${isDrawerOpen ? "is-open" : ""}" id="drawer-${cohort.id}">
            <div class="tutor-lessons-drawer__header">
              <h4 class="tutor-lessons-drawer__title">Syllabus Lessons (${lessons.length})</h4>
              <button type="button" class="tr-btn tr-btn--secondary tr-btn--sm" data-action="upload-lesson" data-cohort-id="${cohort.id}" data-cohort-title="${encodeURIComponent(cohort.title)}">
                <i class="fa-solid fa-plus"></i> Add Lesson
              </button>
            </div>
            ${lessonsHtml}
          </div>
        </article>
      `;
    }).join("");

    attachCohortEventListeners();
  }

  function attachCohortEventListeners() {
    // Toggle Drawer
    document.querySelectorAll('[data-action="toggle-drawer"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const cohortId = btn.getAttribute("data-cohort-id");
        const drawer = document.getElementById(`drawer-${cohortId}`);
        if (!drawer) return;

        if (drawer.classList.contains("is-open")) {
          drawer.classList.remove("is-open");
          openDrawers.delete(cohortId);
        } else {
          drawer.classList.add("is-open");
          openDrawers.add(cohortId);
        }
      });
    });

    // Upload Lesson Button
    document.querySelectorAll('[data-action="upload-lesson"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const cohortId = btn.getAttribute("data-cohort-id");
        const cohortTitle = decodeURIComponent(btn.getAttribute("data-cohort-title") || "");
        openUploadLessonModal(cohortId, cohortTitle);
      });
    });

    // Delete Lesson Button
    document.querySelectorAll('[data-action="delete-lesson"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const lessonId = btn.getAttribute("data-lesson-id");
        const cohortId = btn.getAttribute("data-cohort-id");
        handleDeleteLesson(lessonId, cohortId);
      });
    });
  }

  function openUploadLessonModal(cohortId, cohortTitle) {
    if (!lessonModal) return;
    if (lessonTargetCohortId) lessonTargetCohortId.value = cohortId;
    if (lessonModalSubtitle) lessonModalSubtitle.textContent = `Class: ${cohortTitle}`;

    // Auto-compute next order number
    const existingLessons = lessonsByCohort[cohortId] || [];
    if (lessonOrderInput) {
      lessonOrderInput.value = existingLessons.length + 1;
    }

    if (lessonTitleInput) lessonTitleInput.value = "";
    if (lessonTopicInput) lessonTopicInput.value = "";
    if (lessonVideoUrlInput) lessonVideoUrlInput.value = "";
    if (lessonFormError) lessonFormError.style.display = "none";

    openModal(lessonModal);
  }

  // Handle Cohort Form Submit
  async function handleCreateCohortSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const subjectId = cohortSubjectSelect?.value;
    const title = cohortTitleInput?.value.trim();
    const startDate = cohortStartDateInput?.value;
    const price = Number(cohortPriceInput?.value || 0);
    const whatsapp = cohortWhatsappInput?.value.trim();

    if (!subjectId || !title || !startDate || !whatsapp) {
      if (cohortFormError) {
        cohortFormError.textContent = "Please fill in all required fields.";
        cohortFormError.style.display = "block";
      }
      return;
    }

    if (saveCohortBtn) {
      saveCohortBtn.disabled = true;
      saveCohortBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Creating...`;
    }

    try {
      const { data, error } = await window.supabase
        .from("cohorts")
        .insert({
          tutor_id: currentUser.id,
          subject_id: subjectId,
          title: title,
          start_date: startDate,
          price: price,
          whatsapp_link: whatsapp,
          status: "open"
        })
        .select()
        .single();

      if (error) throw error;

      closeModal(cohortModal);
      showToast("Class created successfully!", "success");

      // Reset form
      createCohortForm.reset();
      setDefaultStartDate();

      // Refresh list
      await loadTutorData();
    } catch (err) {
      console.error("Failed to create cohort:", err);
      if (cohortFormError) {
        cohortFormError.textContent = err.message || "Failed to create class. Please try again.";
        cohortFormError.style.display = "block";
      }
    } finally {
      if (saveCohortBtn) {
        saveCohortBtn.disabled = false;
        saveCohortBtn.textContent = "Create Class";
      }
    }
  }

  // Handle Lesson Form Submit
  async function handleUploadLessonSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const cohortId = lessonTargetCohortId?.value;
    const title = lessonTitleInput?.value.trim();
    const topic = lessonTopicInput?.value.trim();
    const videoUrl = lessonVideoUrlInput?.value.trim();
    const orderIndex = parseInt(lessonOrderInput?.value || "1", 10);

    if (!cohortId || !title || !topic || !videoUrl) {
      if (lessonFormError) {
        lessonFormError.textContent = "Please fill in all required fields.";
        lessonFormError.style.display = "block";
      }
      return;
    }

    if (saveLessonBtn) {
      saveLessonBtn.disabled = true;
      saveLessonBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`;
    }

    try {
      const { error } = await window.supabase
        .from("lessons")
        .insert({
          cohort_id: cohortId,
          title: title,
          syllabus_topic: topic,
          video_url: videoUrl,
          order_index: orderIndex
        });

      if (error) throw error;

      closeModal(lessonModal);
      showToast("Lesson uploaded successfully!", "success");

      // Keep drawer open for this cohort
      openDrawers.add(cohortId);

      // Refresh data
      await loadTutorData();
    } catch (err) {
      console.error("Failed to upload lesson:", err);
      if (lessonFormError) {
        lessonFormError.textContent = err.message || "Failed to upload lesson. Please check the video link.";
        lessonFormError.style.display = "block";
      }
    } finally {
      if (saveLessonBtn) {
        saveLessonBtn.disabled = false;
        saveLessonBtn.textContent = "Save Lesson";
      }
    }
  }

  // Handle Delete Lesson
  async function handleDeleteLesson(lessonId, cohortId) {
    if (!confirm("Are you sure you want to delete this lesson? Enrolled students will no longer see it.")) {
      return;
    }

    try {
      const { error } = await window.supabase
        .from("lessons")
        .delete()
        .eq("id", lessonId);

      if (error) throw error;

      showToast("Lesson deleted", "success");
      openDrawers.add(cohortId);
      await loadTutorData();
    } catch (err) {
      console.error("Failed to delete lesson:", err);
      showToast("Could not delete lesson: " + err.message, "error");
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Setup Event Listeners
  function init() {
    setupTabs();
    initModalDismissals();
    setDefaultStartDate();

    if (openCreateCohortBtn) {
      openCreateCohortBtn.addEventListener("click", () => {
        if (cohortFormError) cohortFormError.style.display = "none";
        openModal(cohortModal);
      });
    }

    const pendingCreateCohortBtn = document.getElementById("pendingCreateCohortBtn");
    if (pendingCreateCohortBtn) {
      pendingCreateCohortBtn.addEventListener("click", () => {
        if (cohortFormError) cohortFormError.style.display = "none";
        openModal(cohortModal);
      });
    }

    if (createCohortForm) {
      createCohortForm.addEventListener("submit", handleCreateCohortSubmit);
    }

    if (uploadLessonForm) {
      uploadLessonForm.addEventListener("submit", handleUploadLessonSubmit);
    }

    function handleHashRouting() {
      const hash = window.location.hash;
      const urlParams = new URLSearchParams(window.location.search);

      if (urlParams.get("create") === "1" || hash === "#create") {
        window.location.href = "classes.html?create=1";
        return;
      } else if (hash === "#classes") {
        window.location.href = "classes.html";
        return;
      }
    }
    window.addEventListener("hashchange", handleHashRouting);

    // Authenticate and load
    checkTutorAuth().then((isAuthed) => {
      if (isAuthed) {
        loadSubjects();
        loadTutorData();
        handleHashRouting();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
