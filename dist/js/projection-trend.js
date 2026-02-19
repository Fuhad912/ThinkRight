(() => {
  const TREND_RPC = "leaderboard_get_my_projection_trend";
  const CURRENT_WEEK_RPC = "tr_current_week_id";

  function getIsoWeekId(dateInput) {
    const date = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date();
    if (!Number.isFinite(date.getTime())) return "";

    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function getWeekStartUtc(weekId) {
    const m = String(weekId || "").match(/^(\d{4})-W(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const week = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;

    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const weekStart = new Date(mondayWeek1);
    weekStart.setUTCDate(mondayWeek1.getUTCDate() + ((week - 1) * 7));
    return weekStart;
  }

  function getPreviousWeekId(weekId) {
    const weekStart = getWeekStartUtc(weekId);
    if (!weekStart) return "";
    const prev = new Date(weekStart);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return getIsoWeekId(prev);
  }

  function normalizeTrendRow(row) {
    if (!row || typeof row !== "object") {
      return {
        qualifiesCurrent: false,
        qualifiesPrevious: false,
        currentWeekScore: null,
        previousWeekScore: null,
        delta: null,
        weekId: "",
        previousWeekId: "",
        status: "hidden",
        text: "",
        title: ""
      };
    }

    const qualifiesCurrent = !!row.qualifies_current;
    const qualifiesPrevious = !!row.qualifies_previous;
    const currentWeekScore = Number.isFinite(Number(row.current_projected_score))
      ? Number(row.current_projected_score)
      : null;
    const previousWeekScore = Number.isFinite(Number(row.previous_projected_score))
      ? Number(row.previous_projected_score)
      : null;
    const delta = Number.isFinite(Number(row.delta)) ? Number(row.delta) : null;

    if (!qualifiesCurrent || currentWeekScore == null) {
      return {
        qualifiesCurrent,
        qualifiesPrevious,
        currentWeekScore,
        previousWeekScore,
        delta,
        weekId: String(row.week_id || ""),
        previousWeekId: String(row.previous_week_id || ""),
        status: "hidden",
        text: "",
        title: String(row.message || "Trend unavailable")
      };
    }

    if (!qualifiesPrevious || previousWeekScore == null) {
      return {
        qualifiesCurrent,
        qualifiesPrevious,
        currentWeekScore,
        previousWeekScore,
        delta: null,
        weekId: String(row.week_id || ""),
        previousWeekId: String(row.previous_week_id || ""),
        status: "new",
        text: "New this week",
        title: "No eligible previous-week score"
      };
    }

    if (!Number.isFinite(delta) || delta === 0) {
      return {
        qualifiesCurrent,
        qualifiesPrevious,
        currentWeekScore,
        previousWeekScore,
        delta: 0,
        weekId: String(row.week_id || ""),
        previousWeekId: String(row.previous_week_id || ""),
        status: "neutral",
        text: "\u2192 0 this week",
        title: "No change vs last week"
      };
    }

    if (delta > 0) {
      return {
        qualifiesCurrent,
        qualifiesPrevious,
        currentWeekScore,
        previousWeekScore,
        delta,
        weekId: String(row.week_id || ""),
        previousWeekId: String(row.previous_week_id || ""),
        status: "up",
        text: `\u2191 +${delta} this week`,
        title: `Up ${delta} vs last week`
      };
    }

    return {
      qualifiesCurrent,
      qualifiesPrevious,
      currentWeekScore,
      previousWeekScore,
      delta,
      weekId: String(row.week_id || ""),
      previousWeekId: String(row.previous_week_id || ""),
      status: "down",
      text: `\u2193 ${delta} this week`,
      title: `Down ${Math.abs(delta)} vs last week`
    };
  }

  async function fetchServerWeekId() {
    if (!window.supabase || typeof window.supabase.rpc !== "function") {
      return getIsoWeekId(new Date());
    }

    try {
      const { data, error } = await window.supabase.rpc(CURRENT_WEEK_RPC);
      if (!error && typeof data === "string") return data;
      if (!error && Array.isArray(data) && data[0] && typeof data[0][CURRENT_WEEK_RPC] === "string") {
        return data[0][CURRENT_WEEK_RPC];
      }
    } catch (e) {
      // ignore
    }
    return getIsoWeekId(new Date());
  }

  async function fetchTrendFallback({ userId, weekId }) {
    if (!window.supabase || typeof window.supabase.from !== "function") return null;
    if (!userId || !weekId) return null;
    const previousWeekId = getPreviousWeekId(weekId);
    if (!previousWeekId) return null;

    const { data, error } = await window.supabase
      .from("weekly_projected_rankings")
      .select("week_id, projected_score")
      .eq("user_id", userId)
      .in("week_id", [weekId, previousWeekId]);

    if (error) return null;
    const rows = Array.isArray(data) ? data : [];
    const current = rows.find((r) => r && r.week_id === weekId);
    const previous = rows.find((r) => r && r.week_id === previousWeekId);
    return normalizeTrendRow({
      week_id: weekId,
      previous_week_id: previousWeekId,
      current_projected_score: current ? current.projected_score : null,
      previous_projected_score: previous ? previous.projected_score : null,
      delta: current && previous ? Number(current.projected_score) - Number(previous.projected_score) : null,
      qualifies_current: !!current,
      qualifies_previous: !!previous,
      message: current ? (previous ? "Trend available" : "New this week") : "Trend unavailable"
    });
  }

  async function fetchProjectionTrend(options = {}) {
    if (!window.supabase || typeof window.supabase.rpc !== "function") return null;

    const userId = options.userId || null;
    const weekId = options.weekId || (await fetchServerWeekId());

    try {
      const { data, error } = await window.supabase.rpc(TREND_RPC, {
        p_user_id: userId,
        p_week_id: weekId
      });

      if (!error && Array.isArray(data) && data[0]) {
        return normalizeTrendRow(data[0]);
      }
    } catch (e) {
      // ignore and use fallback
    }

    return fetchTrendFallback({ userId, weekId });
  }

  function applyTrendChip(chipEl, trend) {
    if (!chipEl) return;
    chipEl.hidden = true;
    chipEl.textContent = "";
    chipEl.className = "tr-projection-trend";
    chipEl.removeAttribute("title");

    if (!trend || trend.status === "hidden" || !trend.text) {
      return;
    }

    chipEl.hidden = false;
    chipEl.textContent = trend.text;
    chipEl.classList.add(`tr-projection-trend--${trend.status}`);
    if (trend.title) chipEl.title = trend.title;
  }

  window.ThinkRightProjectionTrend = {
    fetchProjectionTrend,
    applyTrendChip,
    getIsoWeekId,
    getPreviousWeekId,
    normalizeTrendRow
  };
})();
