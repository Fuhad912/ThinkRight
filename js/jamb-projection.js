(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProjection);
  } else {
    initProjection();
  }

  function initProjection() {
    const howBtn = document.getElementById("trProjectionHowBtn");
    const scoreEl = document.getElementById("trProjectionScore");
    const badgeEl = document.getElementById("trProjectionBadge");
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
      readiness: null,
      scoreEl,
      badgeEl,
      rangeEl,
      stateEl,
    });

    loadProjection({ scoreEl, badgeEl, rangeEl, stateEl }).catch((err) => {
      console.error("[projection] Failed to load projection:", err);
      renderState({
        mode: "info",
        message: "Projection unavailable right now.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        readiness: null,
        scoreEl,
        badgeEl,
        rangeEl,
        stateEl,
      });
    });
  }

  async function loadProjection({ scoreEl, badgeEl, rangeEl, stateEl }) {
    await waitForAuthInit(1500);

    const user = await safeGetUser();
    if (!user) {
      renderState({
        mode: "info",
        message: "Log in and take at least 3 tests to get your projection.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        readiness: null,
        scoreEl,
        badgeEl,
        rangeEl,
        stateEl,
      });
      return;
    }

    // Best-effort: if this browser has local history, backfill it to Supabase so
    // projections/dashboard are consistent across browsers/devices.
    try {
      await backfillLocalResultsToSupabase(user.id);
    } catch (e) {
      console.warn("[projection] Backfill warning:", e);
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
        readiness: null,
        scoreEl,
        badgeEl,
        rangeEl,
        stateEl,
      });
      return;
    }

    const projection = computeProjectionFromSharedHelper(recent);
    if (!projection) {
      renderState({
        mode: "info",
        message: "Take at least 3 tests to get your projection.",
        scoreText: "-- / 400",
        rangeText: "",
        showRange: false,
        readiness: null,
        scoreEl,
        badgeEl,
        rangeEl,
        stateEl,
      });
      return;
    }

    const readiness = getReadinessFromSharedHelper(projection.projected);

    renderState({
      mode: "ready",
      message: "Based on your recent practice performance (estimate).",
      scoreText: `${projection.projected} / 400`,
      rangeText: `Estimated range: ${projection.rangeLow}\u2013${projection.rangeHigh}`,
      showRange: true,
      readiness,
      scoreEl,
      badgeEl,
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
    readiness,
    scoreEl,
    badgeEl,
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
    if (badgeEl) {
      badgeEl.hidden = !readiness;
      badgeEl.className = "tr-readiness-badge";
      if (readiness && readiness.colorClass) {
        badgeEl.classList.add(readiness.colorClass);
        badgeEl.textContent = readiness.label;
      } else {
        badgeEl.textContent = "";
      }
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

  function fnv1a32Hex(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function buildClientRef(r, userId) {
    const uid = (userId || r?.userId || "").toString();
    const subject = (r?.subject || "").toString();
    const ts = (r?.timestamp || r?.completed_at || r?.completedAt || "").toString();
    const score = Number(r?.score ?? r?.score_percentage ?? "");
    const correct = Number(r?.correctCount ?? r?.correct_count ?? "");
    const wrong = Number(r?.wrongCount ?? r?.wrong_count ?? "");
    const total = Number(r?.totalQuestions ?? r?.total_questions ?? "");
    const base = [uid, subject, ts, score, correct, wrong, total].join("|");
    return "tr_" + fnv1a32Hex(base);
  }

  async function backfillLocalResultsToSupabase(userId) {
    if (!userId) return 0;
    if (!window.supabase || typeof window.supabase.from !== "function") return 0;

    let allResults = [];
    try {
      const sm = (typeof StorageManager !== "undefined" && StorageManager) || window.StorageManager;
      allResults = sm && typeof sm.getResults === "function" ? sm.getResults() : [];
    } catch (e) {
      allResults = [];
    }
    if (!Array.isArray(allResults) || allResults.length === 0) return 0;

    const mine = allResults.filter((r) => r && r.userId === userId).slice(-200);
    if (mine.length === 0) return 0;

    const rows = [];
    for (const r of mine) {
      const clientRef = (r.clientRef || r.client_ref || buildClientRef(r, userId)).toString();
      const scorePct = Number(r.score ?? r.score_percentage);
      const correct = Number(r.correctCount ?? r.correct_count);
      const wrong = Number(r.wrongCount ?? r.wrong_count);
      const total = Number(r.totalQuestions ?? r.total_questions);
      const completedAt = r.timestamp || r.completed_at || r.completedAt || new Date().toISOString();

      if (!Number.isFinite(scorePct) || !Number.isFinite(correct) || !Number.isFinite(wrong) || !Number.isFinite(total)) continue;

      rows.push({
        client_ref: clientRef,
        user_id: userId,
        subject: (r.subject || "").toString(),
        score_percentage: scorePct,
        correct_count: correct,
        wrong_count: wrong,
        total_questions: total,
        completed_at: completedAt,
      });
    }
    if (rows.length === 0) return 0;

    const { error } = await window.supabase
      .from("test_results")
      .upsert(rows, { onConflict: "client_ref", ignoreDuplicates: true });
    if (error) {
      // If the table isn't created yet, don't spam user-facing UI; just return.
      console.warn("[projection] Backfill upsert error:", error);
      return 0;
    }
    return rows.length;
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

  function computeProjectionFromSharedHelper(recentTests) {
    if (
      window.ThinkRightProjection &&
      typeof window.ThinkRightProjection.computeProjectedJambScore === "function"
    ) {
      return window.ThinkRightProjection.computeProjectedJambScore(recentTests);
    }
    console.warn("[projection] Shared projection helper unavailable.");
    return null;
  }

  function getReadinessFromSharedHelper(score) {
    if (
      window.ThinkRightProjection &&
      typeof window.ThinkRightProjection.getReadinessLevel === "function"
    ) {
      return window.ThinkRightProjection.getReadinessLevel(score);
    }
    return null;
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
          <li>Projection is calibrated to better reflect real exam conditions. It's an estimate, not a guarantee.</li>
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
