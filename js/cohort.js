/**
 * ThinkRight - Cohort Classroom View
 * Loads cohort details, syllabus lessons, video playback, and Q&A posts.
 */

(function () {
  "use strict";

  const urlParams = new URLSearchParams(window.location.search);
  const cohortId = urlParams.get("id");

  let currentUser = null;
  let currentCohort = null;
  let lessonsList = [];
  let currentLesson = null;
  let completedLessons = new Set();

  // DOM Elements
  const cohortSubjectBadge = document.getElementById("cohortSubjectBadge");
  const cohortTitle = document.getElementById("cohortTitle");
  const cohortTutor = document.getElementById("cohortTutor");
  const cohortCommunityLinks = document.getElementById("cohortCommunityLinks");
  const videoPlaceholder = document.getElementById("videoPlaceholder");
  const videoIframe = document.getElementById("videoIframe");
  const currentLessonTitle = document.getElementById("currentLessonTitle");
  const currentLessonTopic = document.getElementById("currentLessonTopic");
  const markCompleteBtn = document.getElementById("markCompleteBtn");
  const lessonsListEl = document.getElementById("lessonsList");
  const postsListEl = document.getElementById("postsList");
  const postForm = document.getElementById("postForm");
  const postInput = document.getElementById("postInput");

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

  // Parse video URLs (YouTube, Vimeo, Loom) to embeddable src
  function getEmbedUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return '';

      // YouTube
      if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
        let videoId = "";
        if (parsed.hostname.includes("youtu.be")) {
          videoId = parsed.pathname.slice(1);
        } else if (parsed.searchParams.has("v")) {
          videoId = parsed.searchParams.get("v");
        } else if (parsed.pathname.includes("/embed/")) {
          return url;
        }
        return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : url;
      }

      // Vimeo
      if (parsed.hostname.includes("vimeo.com")) {
        const match = parsed.pathname.match(/(\d+)/);
        if (match) return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
      }

      // Loom
      if (parsed.hostname.includes("loom.com")) {
        return url.replace("/share/", "/embed/");
      }

      return url;
    } catch (e) {
      return url;
    }
  }

  async function loadCohort() {
    if (!cohortId) {
      if (cohortTitle) cohortTitle.textContent = "Class Not Found";
      if (cohortTutor) cohortTutor.textContent = "Please select a valid class from the catalog.";
      return;
    }

    try {
      // 1. Fetch Cohort info + Tutor info
      const { data: cohort, error: cErr } = await window.supabase
        .from("cohorts")
        .select("id, subject_id, title, start_date, price, whatsapp_link, tutor_id, tutors(display_name, bio)")
        .eq("id", cohortId)
        .single();

      if (cErr) throw cErr;
      currentCohort = cohort;

      if (cohortTitle) cohortTitle.textContent = cohort.title;
      if (cohortSubjectBadge) cohortSubjectBadge.textContent = (cohort.subject_id || "Class").toUpperCase();
      if (cohortTutor) {
        cohortTutor.textContent = `Tutor: ${cohort.tutors?.display_name || "ThinkRight Educator"}`;
      }

      if (cohortCommunityLinks && /^https:\/\//i.test(cohort.whatsapp_link || '')) {
        cohortCommunityLinks.innerHTML = `
          <a href="${escapeHtml(cohort.whatsapp_link)}" target="_blank" rel="noopener noreferrer" class="tr-btn tr-btn--outline tr-btn--sm" style="color: #25d366 !important; border-color: rgba(37, 211, 102, 0.4);">
            <i class="fa-brands fa-whatsapp"></i> Join Class WhatsApp
          </a>
        `;
      }

      // Check if current user is the tutor for this cohort
      const classroomEducatorBar = document.getElementById("classroomEducatorBar");
      if (classroomEducatorBar) {
        const isTutor = currentUser && (cohort.tutor_id === currentUser.id);
        classroomEducatorBar.style.display = isTutor ? "flex" : "none";
      }

      // 2. Fetch Lessons
      const { data: lessons, error: lErr } = await window.supabase
        .from("lessons")
        .select("id, title, syllabus_topic, video_url, order_index")
        .eq("cohort_id", cohortId)
        .order("order_index", { ascending: true });

      if (lErr) throw lErr;
      lessonsList = lessons || [];

      // 2b. Fetch User Lesson Progress
      if (currentUser && window.supabase) {
        try {
          const { data: progressData } = await window.supabase
            .from("lesson_progress")
            .select("lesson_id")
            .eq("user_id", currentUser.id);

          if (progressData) {
            completedLessons = new Set(progressData.map((p) => p.lesson_id));
          }
        } catch (e) {
          console.warn("Could not load lesson progress:", e);
        }
      }

      renderLessons();

      if (lessonsList.length > 0) {
        playLesson(lessonsList[0]);
      } else {
        if (lessonsListEl) {
          lessonsListEl.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.9rem; padding: 1rem 0;">No lessons uploaded yet for this class.</p>`;
        }
      }

      // 3. Load Q&A posts
      loadPosts();
    } catch (err) {
      console.error("Failed to load cohort:", err);
      if (cohortTitle) cohortTitle.textContent = "Unable to load class";
      if (cohortTutor) cohortTutor.textContent = "Could not fetch classroom details. Please try again.";
    }
  }

  function renderLessons() {
    if (!lessonsListEl) return;

    lessonsListEl.innerHTML = lessonsList.map((lesson) => {
      const isSelected = currentLesson && currentLesson.id === lesson.id;
      const isCompleted = completedLessons.has(lesson.id);

      const statusIcon = isCompleted
        ? `<i class="fa-solid fa-circle-check" style="font-size: 0.9rem; color: #10b981; margin-left: 0.5rem;" title="Watched"></i>`
        : `<i class="fa-solid fa-play" style="font-size: 0.8rem; color: var(--accent-primary); margin-left: 0.5rem;" title="Play lesson"></i>`;

      return `
        <div class="cohort-lesson-row ${isSelected ? "is-active" : ""}" data-lesson-id="${lesson.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-radius: 10px; cursor: pointer; background: ${isSelected ? "rgba(37, 99, 235, 0.08)" : "var(--bg-card)"}; border: 1px solid ${isSelected ? "var(--accent-primary)" : "var(--border-color)"}; transition: all 0.2s ease;">
          <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
            <span style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 0.85rem; font-weight: 700; color: var(--accent-primary); width: 24px; height: 24px; border-radius: 50%; background: rgba(37, 99, 235, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${lesson.order_index}
            </span>
            <div style="min-width: 0;">
              <h5 style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(lesson.title)}
              </h5>
              <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 0;">
                ${escapeHtml(lesson.syllabus_topic || "")}
              </p>
            </div>
          </div>
          ${statusIcon}
        </div>
      `;
    }).join("");

    document.querySelectorAll(".cohort-lesson-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-lesson-id");
        const found = lessonsList.find((l) => l.id === id);
        if (found) playLesson(found);
      });
    });
  }

  function playLesson(lesson) {
    currentLesson = lesson;

    if (currentLessonTitle) currentLessonTitle.textContent = lesson.title;
    if (currentLessonTopic) currentLessonTopic.textContent = lesson.syllabus_topic || "JAMB Syllabus Topic";

    const embedUrl = getEmbedUrl(lesson.video_url);

    if (videoPlaceholder) videoPlaceholder.style.display = "none";
    if (videoIframe) {
      videoIframe.style.display = "block";
      videoIframe.src = embedUrl;
    }

    if (markCompleteBtn) {
      markCompleteBtn.disabled = false;
      const isCompleted = completedLessons.has(lesson.id);
      if (isCompleted) {
        markCompleteBtn.innerHTML = "&#10003; Watched";
        markCompleteBtn.className = "tr-btn tr-btn--primary tr-btn--sm";
      } else {
        markCompleteBtn.innerHTML = "&#10003; Mark as Watched";
        markCompleteBtn.className = "tr-btn tr-btn--secondary tr-btn--sm";
      }
    }

    renderLessons();
  }

  async function loadPosts() {
    if (!postsListEl || !cohortId) return;

    try {
      const { data: posts, error } = await window.supabase
        .from("cohort_posts")
        .select("id, body, created_at, author_id")
        .eq("cohort_id", cohortId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;

      if (!posts || posts.length === 0) {
        postsListEl.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem;">No questions posted yet. Be the first to ask!</p>`;
        return;
      }

      postsListEl.innerHTML = posts.map((p) => {
        const timeStr = new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const isTutorAuthor = currentCohort && p.author_id === currentCohort.tutor_id;
        const authorBadge = isTutorAuthor 
          ? `<span class="home-pillar-card__badge home-pillar-card__badge--blue" style="margin: 0 0 0 6px; padding: 1px 6px; font-size: 0.68rem;">Educator</span>` 
          : "";

        return `
          <div style="padding: 0.65rem 0.85rem; background: rgba(100, 116, 139, 0.05); border-radius: 8px; border: 1px solid var(--border-color);">
            <p style="font-size: 0.88rem; color: var(--text-primary); margin: 0 0 4px 0;">${escapeHtml(p.body)}</p>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.72rem; color: var(--text-secondary);">${timeStr}</span>
              ${authorBadge}
            </div>
          </div>
        `;
      }).join("");

      postsListEl.scrollTop = postsListEl.scrollHeight;
    } catch (e) {
      console.warn("Could not load posts:", e);
    }
  }

  async function handlePostSubmit(e) {
    e.preventDefault();
    if (!currentUser) {
      alert("Please login to post questions.");
      return;
    }

    const text = postInput?.value.trim();
    if (!text || !cohortId) return;

    try {
      const { error } = await window.supabase
        .from("cohort_posts")
        .insert({
          cohort_id: cohortId,
          lesson_id: currentLesson ? currentLesson.id : null,
          author_id: currentUser.id,
          body: text
        });

      if (error) throw error;

      if (postInput) postInput.value = "";
      loadPosts();
    } catch (err) {
      console.error("Failed to post comment:", err);
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

  async function handleMarkComplete() {
    if (!currentLesson || !currentUser || !window.supabase) return;

    const isCompleted = completedLessons.has(currentLesson.id);

    try {
      if (isCompleted) {
        // Toggle uncomplete
        const { error } = await window.supabase
          .from("lesson_progress")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("lesson_id", currentLesson.id);
        if (error) throw error;

        completedLessons.delete(currentLesson.id);
        markCompleteBtn.innerHTML = "&#10003; Mark as Watched";
        markCompleteBtn.className = "tr-btn tr-btn--secondary tr-btn--sm";
      } else {
        // Mark complete
        const { error } = await window.supabase
          .from("lesson_progress")
          .insert({
            user_id: currentUser.id,
            lesson_id: currentLesson.id
          });
        if (error) throw error;

        completedLessons.add(currentLesson.id);
        markCompleteBtn.innerHTML = "&#10003; Watched";
        markCompleteBtn.className = "tr-btn tr-btn--primary tr-btn--sm";
      }

      renderLessons();
    } catch (err) {
      console.warn("Failed to update lesson progress:", err);
    }
  }

  async function init() {
    try {
      window.ThinkRightLoader?.setProgress(35, "Verifying classroom access...");
      currentUser = await resolveUser();
      window.ThinkRightLoader?.setProgress(70, "Loading lessons & discussions...");
      await loadCohort();
    } finally {
      window.ThinkRightLoader?.done("Classroom ready");
    }

    if (postForm) {
      postForm.addEventListener("submit", handlePostSubmit);
    }

    if (markCompleteBtn) {
      markCompleteBtn.addEventListener("click", handleMarkComplete);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
