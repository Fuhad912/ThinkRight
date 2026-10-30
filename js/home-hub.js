/**
 * ThinkRight - Home Hub Controller
 * Manages dual-state homepage:
 * - Logged-out: High-converting landing page highlighting Classes + Free Practice
 * - Logged-in: Student Hub with Continue Practicing + Your Classes
 */

(function () {
  "use strict";

  const loggedOutSection = document.getElementById("homeLoggedOutView");
  const loggedInSection = document.getElementById("homeLoggedInHub");
  const teacherHubSection = document.getElementById("homeTeacherHub");
  const hubUserName = document.getElementById("hubUserName");
  const hubStreakValue = document.getElementById("hubStreakValue");
  const hubCohortsContainer = document.getElementById("hubCohortsContainer");
  const hubCohortsLoading = document.getElementById("hubCohortsLoading");
  const hubCohortsEmpty = document.getElementById("hubCohortsEmpty");

  async function resolveUser() {
    if (window.getCurrentUser && typeof window.getCurrentUser === "function") {
      try {
        const u = await window.getCurrentUser();
        if (u) return u;
      } catch (e) {}
    }

    if (window.supabase && window.supabase.auth) {
      try {
        const res = await window.supabase.auth.getUser();
        if (res?.data?.user) return res.data.user;
      } catch (e) {}

      try {
        const sessionRes = await window.supabase.auth.getSession();
        if (sessionRes?.data?.session?.user) return sessionRes.data.session.user;
      } catch (e) {}
    }
    return null;
  }

  function getCachedAuthState() {
    try {
      const cachedRole = localStorage.getItem("thinkright_auth_role");
      const cachedName = localStorage.getItem("thinkright_username");

      if (cachedRole === "teacher") {
        return { role: "teacher", name: cachedName || "Educator" };
      }

      if (cachedName) {
        return { role: "student", name: cachedName };
      }

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
          const item = localStorage.getItem(k);
          if (item) {
            try {
              const parsed = JSON.parse(item);
              const user = parsed?.user;
              if (user) {
                const name =
                  user.user_metadata?.username ||
                  user.user_metadata?.full_name ||
                  user.email?.split("@")[0] ||
                  "Student";
                return { role: "student", name };
              }
            } catch (_) {}
          }
          return { role: "student", name: "Student" };
        }
      }
    } catch (_) {}

    return { role: "guest", name: "" };
  }

  async function initHomeHub() {
    // 1. Instant optimistic local hydration (0ms)
    // Synchronously displays the correct view matching cached auth state
    const cached = getCachedAuthState();
    if (cached.role === "teacher") {
      showTeacherState({ user_metadata: { username: cached.name } });
    } else if (cached.role === "student") {
      showLoggedInState({ user_metadata: { username: cached.name } });
    } else {
      showLoggedOutState();
    }

    // Dismiss loader immediately so preloader dissolves cleanly without blank screen or lag
    if (window.ThinkRightLoader && typeof window.ThinkRightLoader.done === "function") {
      window.ThinkRightLoader.done();
    }

    // 2. Background verification & live data sync (non-blocking)
    verifyAndSyncInBackground(cached);
  }

  async function verifyAndSyncInBackground(cached) {
    try {
      if (!window.authInitialized && typeof window.initSupabase === "function") {
        try { window.initSupabase(); } catch (_) {}
      }

      let retries = 0;
      while (!window.authInitialized && retries < 25) {
        await new Promise((r) => setTimeout(r, 30));
        retries++;
      }

      const user = await resolveUser();

      if (!user) {
        if (cached.role !== "guest") {
          showLoggedOutState();
        }
        return;
      }

      const role = await resolveRole(user);
      if (role === "teacher") {
        showTeacherState(user);
        return;
      }

      showLoggedInState(user);
      loadUserCohorts(user.id);
      loadUserStreak(user.id);
    } catch (err) {
      console.warn("Background home hub sync notice:", err);
    }
  }

  function showLoggedOutState() {
    document.documentElement.classList.remove("tr-cached-student", "tr-cached-teacher");
    document.documentElement.classList.add("tr-cached-guest");
    if (loggedOutSection) loggedOutSection.style.display = "block";
    if (loggedInSection) loggedInSection.style.display = "none";
    if (teacherHubSection) teacherHubSection.style.display = "none";
  }

  function showLoggedInState(user) {
    document.documentElement.classList.remove("tr-cached-guest", "tr-cached-teacher");
    document.documentElement.classList.add("tr-cached-student");
    if (loggedOutSection) loggedOutSection.style.display = "none";
    if (loggedInSection) loggedInSection.style.display = "block";
    if (teacherHubSection) teacherHubSection.style.display = "none";

    const name =
      user?.user_metadata?.username ||
      user?.user_metadata?.full_name ||
      user?.email?.split("@")[0] ||
      localStorage.getItem("thinkright_username") ||
      "Student";

    if (hubUserName) {
      hubUserName.textContent = name;
    }
  }

  async function resolveRole(user) {
    if (window.ThinkRightShell?.resolveRole) {
      return window.ThinkRightShell.resolveRole(user);
    }

    if (user.user_metadata?.role === "teacher" || user.user_metadata?.role === "tutor") {
      return "teacher";
    }

    if (window.supabase) {
      try {
        const { data: tutor } = await window.supabase
          .from("tutors")
          .select("id, status")
          .eq("id", user.id)
          .maybeSingle();
        if (tutor && (tutor.status === "active" || tutor.status === "pending")) return "teacher";
      } catch (_e) {}
    }

    return "student";
  }

  function showTeacherState(user) {
    document.documentElement.classList.remove("tr-cached-guest", "tr-cached-student");
    document.documentElement.classList.add("tr-cached-teacher");
    if (loggedOutSection) loggedOutSection.style.display = "none";
    if (loggedInSection) loggedInSection.style.display = "none";
    if (teacherHubSection) teacherHubSection.style.display = "block";

    const teacherName = document.getElementById("teacherHubUserName");
    if (teacherName) {
      teacherName.textContent =
        user?.user_metadata?.username ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "Educator";
    }
  }

  async function loadUserStreak(userId) {
    if (!hubStreakValue) return;

    try {
      if (typeof window.getStreakCount === "function" && window.supabase) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 59);
        const sinceStr = sinceDate.toISOString().slice(0, 10);

        const { data, error } = await window.supabase
          .from("practice_days")
          .select("day, tests_completed")
          .eq("user_id", userId)
          .gte("day", sinceStr)
          .order("day", { ascending: false });

        if (!error && Array.isArray(data)) {
          const days = data
            .filter((r) => Number(r.tests_completed) > 0)
            .map((r) => r.day);
          const streak = window.getStreakCount(days);
          hubStreakValue.textContent = `${streak} Day${streak === 1 ? "" : "s"} Streak`;
          return;
        }
      }
      hubStreakValue.textContent = "Active";
    } catch (e) {
      console.warn("Streak fetch failed:", e);
      hubStreakValue.textContent = "Ready";
    }
  }

  async function loadUserCohorts(userId) {
    if (!hubCohortsContainer) return;

    if (hubCohortsLoading) hubCohortsLoading.style.display = "block";
    if (hubCohortsEmpty) hubCohortsEmpty.style.display = "none";

    if (!window.supabase) {
      if (hubCohortsLoading) hubCohortsLoading.style.display = "none";
      if (hubCohortsEmpty) hubCohortsEmpty.style.display = "block";
      return;
    }

    try {
      // Query enrolled cohorts with cohort details
      const { data: enrollments, error } = await window.supabase
        .from("enrollments")
        .select(`
          id,
          status,
          cohort_id,
          cohorts (
            id,
            title,
            subject_id,
            start_date,
            status,
            whatsapp_link,
            tutors (
              display_name
            )
          )
        `)
        .eq("user_id", userId)
        .eq("status", "active");

      if (hubCohortsLoading) hubCohortsLoading.style.display = "none";

      if (error || !enrollments || enrollments.length === 0) {
        if (hubCohortsEmpty) hubCohortsEmpty.style.display = "block";
        return;
      }

      renderEnrolledCohorts(enrollments);
    } catch (err) {
      console.warn("Error loading cohorts:", err);
      if (hubCohortsLoading) hubCohortsLoading.style.display = "none";
      if (hubCohortsEmpty) hubCohortsEmpty.style.display = "block";
    }
  }

  function renderEnrolledCohorts(enrollments) {
    const list = document.createElement("div");
    list.className = "hub-cohorts-list";

    enrollments.forEach((item) => {
      const cohort = item.cohorts;
      if (!cohort) return;

      const tutorName = cohort.tutors?.display_name || "Tutor";
      const card = document.createElement("article");
      card.className = "hub-cohort-card";
      card.innerHTML = `
        <div class="hub-cohort-card__head">
          <span class="hub-cohort-card__badge">${cohort.subject_id?.toUpperCase() || "JAMB"}</span>
          <span class="hub-cohort-card__status">${cohort.status === "in_progress" ? "In Progress" : "Active"}</span>
        </div>
        <h4 class="hub-cohort-card__title">${cohort.title}</h4>
        <p class="hub-cohort-card__tutor">Tutor: <strong>${tutorName}</strong></p>
        <div class="hub-cohort-card__actions">
          <a href="cohort.html?id=${cohort.id}" class="tr-btn tr-btn--primary tr-btn--sm">Go to Classroom</a>
          ${
            cohort.whatsapp_link
              ? `<a href="${cohort.whatsapp_link}" target="_blank" rel="noopener" class="tr-btn tr-btn--outline tr-btn--sm">WhatsApp Group</a>`
              : ""
          }
        </div>
      `;
      list.appendChild(card);
    });

    hubCohortsContainer.innerHTML = "";
    hubCohortsContainer.appendChild(list);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomeHub);
  } else {
    initHomeHub();
  }

  document.addEventListener("thinkright:rolechange", (event) => {
    if (event.detail?.role !== "teacher" || !teacherHubSection) return;
    resolveUser().then((user) => {
      if (user) showTeacherState(user);
    });
  });
})();
