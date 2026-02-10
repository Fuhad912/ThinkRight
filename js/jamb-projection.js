(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProjection);
  } else {
    initProjection();
  }

  function initProjection() {
    const howBtn = document.getElementById("trProjectionHowBtn");
    const scoreEl = document.getElementById("trProjectionScore");
    const rangeEl = document.getElementById("trProjectionRange");
    const stateEl = document.getElementById("trProjectionState");

    if (!scoreEl || !stateEl) return;

    setupHowModal(howBtn);

    // Render quickly even if auth is still booting.
    renderState({
      mode: "loading",
      message: "Loading your projection...",
      scoreText: "-- / 400",
      rangeText: "",
      showRange: false,
      scoreEl,
      rangeEl,
      stateEl,
    });

    loadProjection({ scoreEl, rangeEl, stateEl }).catch((err) => {
      console.error("[projection] Failed to load projection:", err);
      renderState({
        mode: "info",
        message: "Projection unavailable right now.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        scoreEl,
        rangeEl,
        stateEl,
      });
    });
  }

  async function loadProjection({ scoreEl, rangeEl, stateEl }) {
    await waitForAuthInit(1500);

    const user = await safeGetUser();
    if (!user) {
      renderState({
        mode: "info",
        message: "Log in and take at least 3 tests to get your projection.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        scoreEl,
        rangeEl,
        stateEl,
      });
      return;
    }

    // Read recent tests from Supabase (preferred) or fall back to local stored results.
    const recent = await fetchRecentTestsForProjection(user.id, 5);
    if (!Array.isArray(recent) || recent.length < 3) {
      renderState({
        mode: "info",
        message: "Take at least 3 tests to get your projection.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        scoreEl,
        rangeEl,
        stateEl,
      });
      return;
    }

    const projection = computeProjectedJambScore(recent);
    if (!projection) {
      renderState({
        mode: "info",
        message: "Take at least 3 tests to get your projection.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        scoreEl,
        rangeEl,
        stateEl,
      });
      return;
    }

    renderState({
      mode: "ready",
      message: "Based on your recent practice performance (estimate).",
      scoreText: `${projection.projected} / 400`,
      rangeText: `Estimated range: ${projection.rangeLow}\u2013${projection.rangeHigh}`,
      showRange: true,
      scoreEl,
      rangeEl,
      stateEl,
    });
  }

  function renderState({
    mode,
    message,
    scoreText,
    rangeText,
    showRange,
    scoreEl,
    rangeEl,
    stateEl,
  }) {
    scoreEl.textContent = scoreText;
    stateEl.textContent = message;
    stateEl.dataset.mode = mode;
    if (rangeEl) {
      rangeEl.textContent = rangeText || "";
      rangeEl.hidden = !showRange;
    }
  }

  async function waitForAuthInit(maxMs) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (window.authInitialized) return true;
      await sleep(80);
    }
    return false;
  }

  async function safeGetUser() {
    try {
      if (window.getCurrentUser && typeof window.getCurrentUser === "function") {
        const u = await window.getCurrentUser().catch(() => null);
        if (u) return u;
      }
    } catch (e) {
      // ignore
    }

    try {
      if (window.supabase && window.supabase.auth && typeof window.supabase.auth.getUser === "function") {
        const { data } = await window.supabase.auth.getUser();
        return data ? data.user : null;
      }
    } catch (e) {
      // ignore
    }

    return null;
  }

  async function fetchRecentTestsForProjection(userId, limit) {
    // Prefer Supabase when available (deployed environments).
    const supa = await tryFetchRecentFromSupabase(userId, limit);
    if (Array.isArray(supa) && supa.length > 0) return supa;

    // Fallback: local results (this is what the app already uses for dashboard/history).
    const local = getRecentFromLocalResults(userId, limit);
    if (Array.isArray(local) && local.length > 0) return local;

    return [];
  }

  async function tryFetchRecentFromSupabase(userId, limit) {
    if (!window.supabase || typeof window.supabase.from !== "function") {
      return [];
    }

    // We don't have a schema file in-repo for the results table.
    // Try common table/column shapes without touching test logic.
    const tableCandidates = ["test_results", "results", "user_test_results", "test_attempts"];
    const userIdColumns = ["user_id", "userId", "uid"];
    const orderColumns = ["completed_at", "created_at"];
    const errors = [];

    for (const table of tableCandidates) {
      // 1) Try explicit user_id columns (most common).
      for (const userCol of userIdColumns) {
        for (const orderCol of orderColumns) {
          try {
            const { data, error } = await window.supabase
              .from(table)
              .select("*")
              .eq(userCol, userId)
              .order(orderCol, { ascending: false })
              .limit(limit);
            if (error) throw error;
            const normalized = normalizeResultRows(data);
            if (normalized.length > 0) return normalized;
          } catch (e) {
            errors.push(`${table}.${userCol}.${orderCol} -> ${e?.message || e}`);
          }
        }
      }

      // 2) Try without explicit filter (some schemas rely on RLS to scope to auth.uid()).
      for (const orderCol of orderColumns) {
        try {
          const { data, error } = await window.supabase
            .from(table)
            .select("*")
            .order(orderCol, { ascending: false })
            .limit(limit);
          if (error) throw error;
          const normalized = normalizeResultRows(data);
          if (normalized.length > 0) return normalized;
        } catch (e) {
          errors.push(`${table}.nofilter.${orderCol} -> ${e?.message || e}`);
        }
      }
    }

    console.warn("[projection] Unable to read recent results from Supabase.", errors);
    return [];
  }

  function getRecentFromLocalResults(userId, limit) {
    try {
      const sm = (typeof StorageManager !== "undefined" && StorageManager) || window.StorageManager;
      const allResults = sm && typeof sm.getResults === "function"
        ? sm.getResults()
        : (() => {
          try {
            const raw = localStorage.getItem("test_results");
            return raw ? JSON.parse(raw) : [];
          } catch (e) {
            return [];
          }
        })();

      if (!Array.isArray(allResults) || allResults.length === 0) return [];

      const matched = allResults.filter((r) => r && r.userId === userId);
      const anonymous = allResults.filter((r) => r && !r.userId);
      // Prefer strict per-user results, else use anonymous legacy results, else fall back to all local data.
      const scoped = matched.length > 0 ? matched : (anonymous.length > 0 ? anonymous : allResults);

      const normalized = normalizeResultRows(scoped)
        .filter((r) => r.completed_at)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
        .slice(0, limit);

      return normalized;
    } catch (e) {
      return [];
    }
  }

  function normalizeResultRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        const correctRaw =
          row?.correctCount ??
          row?.correct_count ??
          row?.correct ??
          row?.num_correct ??
          null;
        const totalRaw =
          row?.totalQuestions ??
          row?.total_questions ??
          row?.total ??
          row?.num_questions ??
          null;

        const scorePctRaw =
          row?.score_percentage ??
          row?.scorePercent ??
          row?.percentage ??
          row?.score ??
          null;

        let scorePct = toScorePercent(scorePctRaw);
        if (!Number.isFinite(scorePct)) {
          const correct = Number(correctRaw);
          const total = Number(totalRaw);
          if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
            scorePct = Math.max(0, Math.min(100, (correct / total) * 100));
          }
        }

        const completedAt = row?.completed_at || row?.completedAt || row?.created_at || row?.timestamp || null;

        return {
          score_percentage: scorePct,
          completed_at: completedAt,
        };
      })
      .filter((r) => Number.isFinite(r.score_percentage));
  }

  function toScorePercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // If the backend stores 0-1 fractions, upscale.
    const scaled = n <= 1 && n >= 0 ? n * 100 : n;
    return Math.max(0, Math.min(100, scaled));
  }

  // Pure function: compute weighted projection from recent tests (most recent first).
  function computeProjectedJambScore(recentTests) {
    const weights = [0.35, 0.25, 0.2, 0.12, 0.08];
    const scores = (recentTests || [])
      .map((t) => Number(t?.score_percentage))
      .filter((v) => Number.isFinite(v))
      .slice(0, 5);

    if (scores.length < 3) return null;

    const usedWeights = weights.slice(0, scores.length);
    const weightSum = usedWeights.reduce((a, b) => a + b, 0) || 1;
    const weightedAvg =
      scores.reduce((acc, score, idx) => acc + score * usedWeights[idx], 0) / weightSum;

    const projected = Math.round((weightedAvg / 100) * 400);
    const rangeLow = Math.max(0, projected - 12);
    const rangeHigh = Math.min(400, projected + 12);

    return { weightedAvg, projected, rangeLow, rangeHigh };
  }

  function setupHowModal(button) {
    if (!button) return;

    const modal = document.createElement("div");
    modal.className = "tr-projection-modal";
    modal.id = "trProjectionModal";
    modal.style.display = "none";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "trProjectionModalTitle");
    modal.innerHTML = `
      <div class="tr-projection-dialog">
        <button type="button" class="tr-projection-close" aria-label="Close projection details">&times;</button>
        <h3 id="trProjectionModalTitle">How it's calculated</h3>
        <p>This is a simple estimate based on your most recent practice tests.</p>
        <ul>
          <li>We take your last 5 completed tests (most recent first).</li>
          <li>Recent tests carry more weight than older ones.</li>
          <li>We convert the weighted average score percentage to a UTME score out of 400.</li>
          <li>We also show a small range to reflect normal performance variation.</li>
        </ul>
        <div class="tr-projection-modal-note">This is an estimate, not a guarantee.</div>
      </div>
    `;

    document.body.appendChild(modal);

    const open = () => {
      modal.style.display = "flex";
      document.body.classList.add("tr-modal-open");
      const closeBtn = modal.querySelector(".tr-projection-close");
      if (closeBtn) closeBtn.focus();
    };

    const close = () => {
      modal.style.display = "none";
      document.body.classList.remove("tr-modal-open");
      button.focus();
    };

    button.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    const closeBtn = modal.querySelector(".tr-projection-close");
    if (closeBtn) closeBtn.addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") close();
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
