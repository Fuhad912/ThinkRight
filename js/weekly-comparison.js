(function () {
  "use strict";

  const COMPARISON_RPC = "leaderboard_get_my_weekly_projection_comparison";
  const MY_RANK_RPC = "leaderboard_get_my_projected_rank";
  const CURRENT_WEEK_RPC = "tr_current_week_id";
  const LOCKED_MESSAGE = "Take at least 3 tests this week to unlock comparisons.";

  function toSafeInteger(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  }

  function clampInt(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeComparison(row) {
    if (!row || typeof row !== "object") return null;

    const totalEligible = Math.max(0, toSafeInteger(row.total_eligible, 0));
    const avgProjected = toSafeInteger(row.avg_projected, null);
    const myProjectedScore = toSafeInteger(row.my_projected_score, null);
    const myTestsThisWeek = Math.max(0, toSafeInteger(row.my_tests_this_week, 0));
    const belowMe = Math.max(0, toSafeInteger(row.below_me, 0));
    const percentile = clampInt(toSafeInteger(row.percentile, 0), 0, 100);
    const rank = toSafeInteger(row.rank, null);
    const qualifies = row.qualifies === true;
    const weekId = typeof row.week_id === "string" ? row.week_id : "";
    const message = typeof row.message === "string" && row.message.trim()
      ? row.message.trim()
      : LOCKED_MESSAGE;

    return {
      weekId,
      totalEligible,
      avgProjected,
      myProjectedScore,
      myTestsThisWeek,
      belowMe,
      percentile,
      rank,
      qualifies,
      message
    };
  }

  function getUtcIsoWeekId(dateValue) {
    const d = new Date(Date.UTC(
      dateValue.getUTCFullYear(),
      dateValue.getUTCMonth(),
      dateValue.getUTCDate()
    ));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  async function fetchCurrentWeekId() {
    try {
      const { data, error } = await window.supabase.rpc(CURRENT_WEEK_RPC);
      if (!error && data) {
        if (typeof data === "string") return data;
        if (Array.isArray(data) && data.length > 0) {
          if (typeof data[0] === "string") return data[0];
          if (data[0] && typeof data[0].tr_current_week_id === "string") {
            return data[0].tr_current_week_id;
          }
        }
      }
    } catch (_err) {
      // Local fallback below.
    }
    return getUtcIsoWeekId(new Date());
  }

  async function tryRpcComparison(userId, weekId) {
    const rpcPayload = {
      p_user_id: userId,
      p_week_id: weekId
    };

    let { data, error } = await window.supabase.rpc(COMPARISON_RPC, rpcPayload);
    if (error) {
      // Retry with minimal params for deployments that have stale schema cache.
      const retry = await window.supabase.rpc(COMPARISON_RPC, {
        p_user_id: userId
      });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return normalizeComparison(row);
  }

  async function fetchMyRankRow(userId, weekId) {
    try {
      let { data, error } = await window.supabase.rpc(MY_RANK_RPC, {
        p_user_id: userId,
        p_week_id: weekId
      });
      if (error) {
        const retry = await window.supabase.rpc(MY_RANK_RPC, {
          p_user_id: userId
        });
        data = retry.data;
        error = retry.error;
      }
      if (error) return null;
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (_err) {
      return null;
    }
  }

  function buildFallbackComparison(weekId, myRankRow, allRows, userId) {
    const rows = Array.isArray(allRows) ? allRows : [];
    const totalEligible = rows.length;

    const tableRow = rows.find((row) => String(row.user_id) === String(userId)) || null;
    const myProjectedScore = tableRow
      ? toSafeInteger(tableRow.projected_score, null)
      : toSafeInteger(myRankRow && myRankRow.projected_score, null);
    const myTestsThisWeek = tableRow
      ? Math.max(0, toSafeInteger(tableRow.tests_this_week, 0))
      : Math.max(0, toSafeInteger(myRankRow && myRankRow.tests_this_week, 0));

    const qualifiesByRankRow = !!(myRankRow && myRankRow.qualifies === true);
    const qualifies = qualifiesByRankRow || Number.isFinite(myProjectedScore);
    const lockedMessage = (myRankRow && myRankRow.message) || LOCKED_MESSAGE;

    if (!qualifies || totalEligible === 0 || !Number.isFinite(myProjectedScore)) {
      return {
        weekId,
        totalEligible,
        avgProjected: totalEligible > 0
          ? toSafeInteger(
              rows.reduce((sum, row) => sum + toSafeInteger(row.projected_score, 0), 0) / totalEligible,
              null
            )
          : null,
        myProjectedScore: Number.isFinite(myProjectedScore) ? myProjectedScore : null,
        myTestsThisWeek,
        belowMe: 0,
        percentile: 0,
        rank: null,
        qualifies: false,
        message: lockedMessage
      };
    }

    const avgProjected = toSafeInteger(
      rows.reduce((sum, row) => sum + toSafeInteger(row.projected_score, 0), 0) / totalEligible,
      null
    );
    const belowMe = rows.filter((row) => toSafeInteger(row.projected_score, 0) < myProjectedScore).length;
    const aheadCount = rows.filter((row) => {
      const score = toSafeInteger(row.projected_score, 0);
      const tests = Math.max(0, toSafeInteger(row.tests_this_week, 0));
      return score > myProjectedScore || (score === myProjectedScore && tests > myTestsThisWeek);
    }).length;

    return {
      weekId,
      totalEligible,
      avgProjected,
      myProjectedScore,
      myTestsThisWeek,
      belowMe,
      percentile: clampInt(toSafeInteger((belowMe / totalEligible) * 100, 0), 0, 100),
      rank: aheadCount + 1,
      qualifies: true,
      message: `Your rank: #${aheadCount + 1} this week`
    };
  }

  async function fetchComparisonFallback(userId, weekId) {
    const resolvedWeekId = weekId || await fetchCurrentWeekId();
    const myRankRow = await fetchMyRankRow(userId, resolvedWeekId);

    const { data, error } = await window.supabase
      .from("weekly_projected_rankings")
      .select("user_id, projected_score, tests_this_week")
      .eq("week_id", resolvedWeekId);

    if (error) {
      if (myRankRow) {
        return normalizeComparison({
          week_id: resolvedWeekId,
          total_eligible: 0,
          avg_projected: null,
          my_projected_score: myRankRow.projected_score,
          my_tests_this_week: myRankRow.tests_this_week,
          below_me: 0,
          percentile: 0,
          rank: null,
          qualifies: myRankRow.qualifies === true,
          message: myRankRow.message || LOCKED_MESSAGE
        });
      }
      throw error;
    }

    const fallback = buildFallbackComparison(resolvedWeekId, myRankRow, data, userId);
    return normalizeComparison({
      week_id: fallback.weekId,
      total_eligible: fallback.totalEligible,
      avg_projected: fallback.avgProjected,
      my_projected_score: fallback.myProjectedScore,
      my_tests_this_week: fallback.myTestsThisWeek,
      below_me: fallback.belowMe,
      percentile: fallback.percentile,
      rank: fallback.rank,
      qualifies: fallback.qualifies,
      message: fallback.message
    });
  }

  async function fetchMyWeeklyComparison(options) {
    const userId = options && options.userId ? options.userId : null;
    const weekId = options && options.weekId ? options.weekId : null;

    if (!window.supabase || typeof window.supabase.rpc !== "function") {
      throw new Error("Supabase client unavailable.");
    }

    if (!userId) {
      return {
        weekId: weekId || "",
        totalEligible: 0,
        avgProjected: null,
        myProjectedScore: null,
        myTestsThisWeek: 0,
        belowMe: 0,
        percentile: 0,
        rank: null,
        qualifies: false,
        message: LOCKED_MESSAGE
      };
    }

    try {
      return await tryRpcComparison(userId, weekId);
    } catch (rpcError) {
      console.warn("[comparison] RPC unavailable, using fallback path:", rpcError);
      return await fetchComparisonFallback(userId, weekId);
    }
  }

  function renderComparisonCard(cardElement, comparison) {
    if (!cardElement) return;

    const averageEl = cardElement.querySelector("[data-tr-comparison-average]");
    const percentileEl = cardElement.querySelector("[data-tr-comparison-percentile]");
    const rankEl = cardElement.querySelector("[data-tr-comparison-rank]");
    const messageEl = cardElement.querySelector("[data-tr-comparison-message]");

    const canShowStats =
      !!comparison &&
      comparison.qualifies === true &&
      comparison.totalEligible > 0 &&
      Number.isFinite(comparison.avgProjected) &&
      Number.isFinite(comparison.myProjectedScore);

    cardElement.hidden = false;
    cardElement.dataset.state = canShowStats ? "ready" : "locked";

    if (canShowStats) {
      if (averageEl) {
        averageEl.textContent = `Weekly average: ${comparison.avgProjected}/400`;
        averageEl.hidden = false;
      }
      if (percentileEl) {
        percentileEl.textContent = `You're above ${comparison.percentile}% of active users this week`;
        percentileEl.hidden = false;
      }
      if (rankEl) {
        rankEl.textContent = Number.isFinite(comparison.rank)
          ? `Your rank: #${comparison.rank} this week`
          : "";
        rankEl.hidden = !Number.isFinite(comparison.rank);
      }
      if (messageEl) {
        messageEl.textContent = "";
        messageEl.hidden = true;
      }
      return;
    }

    if (averageEl) {
      averageEl.textContent = "";
      averageEl.hidden = true;
    }
    if (percentileEl) {
      percentileEl.textContent = "";
      percentileEl.hidden = true;
    }
    if (rankEl) {
      rankEl.textContent = "";
      rankEl.hidden = true;
    }
    if (messageEl) {
      messageEl.textContent = (comparison && comparison.message) || LOCKED_MESSAGE;
      messageEl.hidden = false;
    }
  }

  window.ThinkRightWeeklyComparison = {
    fetchMyWeeklyComparison,
    renderComparisonCard,
    LOCKED_MESSAGE
  };
})();
