(function () {
  "use strict";

  var LOOKBACK_DAYS = 60;
  var rootEl = document.getElementById("practiceStreakPill");
  var titleEl = document.getElementById("practiceStreakTitle");
  var subtitleEl = document.getElementById("practiceStreakSubtitle");
  var ctaEl = document.getElementById("practiceStreakCta");

  if (!rootEl || !titleEl || !subtitleEl || !ctaEl) {
    return;
  }

  function toLocalDayKey(dateValue) {
    var d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function shiftLocalDays(dateValue, dayDelta) {
    var d = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
    d.setDate(d.getDate() + dayDelta);
    return d;
  }

  function normalizeDayKey(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return toLocalDayKey(value);
  }

  function getStreakCount(practiceDays) {
    var days = Array.isArray(practiceDays) ? practiceDays : [];
    var daySet = new Set(
      days
        .map(normalizeDayKey)
        .filter(Boolean)
    );

    var today = new Date();
    var todayKey = toLocalDayKey(today);
    if (!todayKey || !daySet.has(todayKey)) {
      return 0;
    }

    var streak = 0;
    var cursor = new Date(today);
    while (daySet.has(toLocalDayKey(cursor))) {
      streak += 1;
      cursor = shiftLocalDays(cursor, -1);
    }

    return streak;
  }

  function setLoading() {
    rootEl.hidden = false;
    rootEl.classList.add("is-loading");
    titleEl.textContent = "Loading streak...";
    subtitleEl.textContent = "Checking your practice consistency";
    ctaEl.hidden = true;
  }

  function hidePill() {
    rootEl.hidden = true;
  }

  function renderStreak(streakCount) {
    rootEl.hidden = false;
    rootEl.classList.remove("is-loading");

    if (streakCount > 0) {
      var dayLabel = streakCount === 1 ? "day" : "days";
      titleEl.textContent = "Streak: " + streakCount + " " + dayLabel;
      subtitleEl.textContent = "Keep it going";
      ctaEl.hidden = true;
      return;
    }

    titleEl.textContent = "Start a streak \u{1F525}";
    subtitleEl.textContent = "No practice yet today";
    ctaEl.hidden = false;
  }

  async function fetchPracticeDays(userId) {
    if (!window.supabase || typeof window.supabase.from !== "function") {
      return [];
    }

    var sinceDate = shiftLocalDays(new Date(), -(LOOKBACK_DAYS - 1));
    var sinceDay = toLocalDayKey(sinceDate);

    var query = window.supabase
      .from("practice_days")
      .select("day, tests_completed")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .limit(LOOKBACK_DAYS);

    if (sinceDay) {
      query = query.gte("day", sinceDay);
    }

    var response = await query;
    if (response.error) {
      console.warn("[streak] Failed to fetch practice days:", response.error);
      return [];
    }

    return (response.data || [])
      .filter(function (row) {
        return Number(row.tests_completed) > 0;
      })
      .map(function (row) {
        return normalizeDayKey(row.day);
      })
      .filter(Boolean);
  }

  async function initPracticeStreak() {
    setLoading();

    var retries = 0;
    while (!window.authInitialized && retries < 40) {
      await new Promise(function (resolve) {
        setTimeout(resolve, 100);
      });
      retries += 1;
    }

    var user = null;
    if (typeof getCurrentUser === "function") {
      try {
        user = await getCurrentUser();
      } catch (_err) {
        user = null;
      }
    }

    if (!user || !user.id) {
      hidePill();
      return;
    }

    var practiceDays = await fetchPracticeDays(user.id);
    var streakCount = getStreakCount(practiceDays);
    renderStreak(streakCount);
  }

  ctaEl.addEventListener("click", function () {
    var subjectsSection = document.querySelector(".subjects-section");
    if (subjectsSection && typeof subjectsSection.scrollIntoView === "function") {
      subjectsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    var firstSubject = document.querySelector(".subject-card");
    if (firstSubject && typeof firstSubject.focus === "function") {
      firstSubject.focus();
    }
  });

  window.getStreakCount = getStreakCount;
  window.ThinkRightPracticeStreak = {
    getStreakCount: getStreakCount
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPracticeStreak);
  } else {
    initPracticeStreak();
  }
})();

