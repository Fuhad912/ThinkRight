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

  function renderWeekCalendar(practiceDays) {
    var weekTrack = document.getElementById("streakWeekTrack");
    if (!weekTrack) return;

    var days = Array.isArray(practiceDays) ? practiceDays : [];
    var daySet = new Set(days.map(normalizeDayKey).filter(Boolean));

    var today = new Date();
    var currentDayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    var sundayDate = shiftLocalDays(today, -currentDayOfWeek);

    var dotEls = weekTrack.querySelectorAll(".streak-day-dot");
    dotEls.forEach(function (dotEl) {
      var dayIndex = parseInt(dotEl.getAttribute("data-day"), 10);
      if (Number.isNaN(dayIndex)) return;

      var targetDate = shiftLocalDays(sundayDate, dayIndex);
      var targetKey = toLocalDayKey(targetDate);
      var bubble = dotEl.querySelector(".streak-day-dot__bubble");
      if (!bubble) return;

      var isPracticed = daySet.has(targetKey);
      var isToday = dayIndex === currentDayOfWeek;

      dotEl.classList.toggle("is-completed", isPracticed);
      dotEl.classList.toggle("is-today", isToday);

      if (isPracticed) {
        bubble.innerHTML = '<i class="fa-solid fa-fire"></i>';
        dotEl.title = targetKey + ": Practiced!";
      } else if (isToday) {
        bubble.innerHTML = '<i class="fa-solid fa-bolt"></i>';
        dotEl.title = "Today: Practice now to ignite!";
      } else {
        bubble.innerHTML = "•";
        dotEl.title = targetKey;
      }
    });
  }

  function renderStreak(streakCount, practiceDays) {
    rootEl.hidden = false;
    rootEl.classList.remove("is-loading");

    var milestoneBadge = document.getElementById("streakMilestoneBadge");

    if (streakCount > 0) {
      var dayLabel = streakCount === 1 ? "day" : "days";
      titleEl.textContent = streakCount + "-Day Streak Active!";
      subtitleEl.textContent = "You're on fire! Practice today to keep your momentum going.";
      ctaEl.hidden = true;

      if (milestoneBadge) {
        if (streakCount >= 7) {
          milestoneBadge.textContent = "🏆 " + streakCount + "-Day Master";
        } else if (streakCount >= 3) {
          milestoneBadge.textContent = "⚡ " + streakCount + "-Day Streak";
        } else {
          milestoneBadge.textContent = "🔥 " + streakCount + " " + dayLabel;
        }
      }
    } else {
      titleEl.textContent = "Start Day 1 Streak";
      subtitleEl.textContent = "Complete 1 quick drill today to ignite your flame!";
      ctaEl.hidden = false;
      ctaEl.textContent = "Ignite Streak";

      if (milestoneBadge) {
        milestoneBadge.textContent = "🎯 Day 1 Starts Today";
      }
    }

    renderWeekCalendar(practiceDays || []);
    checkStreakCompletionCelebration(streakCount, practiceDays);
  }

  function checkStreakCompletionCelebration(streakCount, practiceDays) {
    var params = new URLSearchParams(window.location.search);
    var isStreakCompletedParam = params.get("streak_completed") === "1" || params.get("completed") === "1";
    var isPending = sessionStorage.getItem("tr_pending_streak_celebration") === "true";

    if (isStreakCompletedParam || isPending) {
      sessionStorage.removeItem("tr_pending_streak_celebration");
      if (isStreakCompletedParam) {
        try {
          var cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (_e) {}
      }
      triggerStreakConfetti(streakCount);
    }
  }

  function triggerStreakConfetti(streakCount) {
    if (typeof window.confetti === "function") {
      try {
        window.confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.3 },
          colors: ["#2563eb", "#f97316", "#10b981", "#fbbf24"]
        });
      } catch (_e) {}
    }
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
      // Show inviting day-1 streak state for guest users instead of hiding
      renderStreak(0, []);
      return;
    }

    var practiceDays = await fetchPracticeDays(user.id);
    var streakCount = getStreakCount(practiceDays);
    renderStreak(streakCount, practiceDays);
  }

  // Interactive Flame Box Click - smoothly scrolls to target faculty hub
  var interactiveBox = document.getElementById("streakInteractiveBox");
  if (interactiveBox) {
    interactiveBox.addEventListener("click", function () {
      var hub = document.getElementById("practicePersonalizedHub");
      if (hub && typeof hub.scrollIntoView === "function") {
        hub.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  ctaEl.addEventListener("click", function () {
    var hub = document.getElementById("practicePersonalizedHub");
    if (hub && typeof hub.scrollIntoView === "function") {
      hub.scrollIntoView({ behavior: "smooth", block: "start" });
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

