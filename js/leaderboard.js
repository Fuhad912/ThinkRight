(function () {
  const DEV_MODE = (
    window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.search.includes("debugLeaderboard=1")
  );

  function devLog(label, payload) {
    if (!DEV_MODE) return;
    console.log(label, payload);
  }

  const SUBJECTS = [
    { key: "english", label: "English" },
    { key: "mathematics", label: "Mathematics" },
    { key: "physics", label: "Physics" },
    { key: "chemistry", label: "Chemistry" },
    { key: "biology", label: "Biology" },
    { key: "agriculture", label: "Agricultural Science" },
    { key: "computer", label: "Computer Studies" },
    { key: "crs", label: "Christian Religious Studies" },
    { key: "irs", label: "Islamic Religious Studies" },
    { key: "economics", label: "Economics" },
    { key: "commerce", label: "Commerce" },
    { key: "government", label: "Government" },
    { key: "literature", label: "Literature" },
    { key: "geography", label: "Geography" },
    { key: "history", label: "History" },
  ];

  const state = {
    user: null,
    weekId: null,
    activeSubject: "english",
    access: {
      isPremium: false,
      isAdmin: false,
      isExplicitFree: false,
    },
    accessLoading: true,
    entitlementDebugLogged: false,
  };

  const elements = {
    weekLabel: document.getElementById("leaderboardWeekLabel"),
    projectedStatus: document.getElementById("projectedStatus"),
    projectedWrap: document.getElementById("projectedTableWrap"),
    projectedBody: document.getElementById("projectedBody"),
    projectedEmpty: document.getElementById("projectedEmpty"),
    projectedMyRankCard: document.getElementById("projectedMyRankCard"),
    projectedMyRankStatus: document.getElementById("projectedMyRankStatus"),
    projectedMyRankSensitive: document.getElementById("projectedMyRankSensitive"),
    projectedMyRankValue: document.getElementById("projectedMyRankValue"),
    projectedMyScoreValue: document.getElementById("projectedMyScoreValue"),
    projectedMyPercentileItem: document.getElementById("projectedMyPercentileItem"),
    projectedMyPercentileValue: document.getElementById("projectedMyPercentileValue"),
    projectedMyRankOverlay: document.getElementById("projectedMyRankOverlay"),
    projectedMyRankUpgradeBtn: document.getElementById("projectedMyRankUpgradeBtn"),
    subjectTabs: document.getElementById("subjectTabs"),
    subjectSelect: document.getElementById("subjectSelect"),
    subjectStatus: document.getElementById("subjectStatus"),
    subjectWrap: document.getElementById("subjectTableWrap"),
    subjectBody: document.getElementById("subjectBody"),
    subjectEmpty: document.getElementById("subjectEmpty"),
    mySubjectRank: document.getElementById("mySubjectRank"),
  };

  function normalizePlan(plan) {
    return String(plan || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .replace(/\s+/g, "");
  }

  function isPaidPlan(plan) {
    const normalized = normalizePlan(plan);
    return normalized === "monthly"
      || normalized === "quarter"
      || normalized === "quarterly"
      || normalized === "3-month"
      || normalized === "3-months"
      || normalized === "3months"
      || normalized === "3month";
  }

  function boolish(value) {
    if (value === true) return true;
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "true"
      || normalized === "1"
      || normalized === "yes"
      || normalized === "y"
      || normalized === "on";
  }

  function isActiveLikeStatus(status) {
    const normalized = String(status || "active").trim().toLowerCase();
    return normalized === "active" || normalized === "trial";
  }

  function getLiveAccessSnapshot() {
    const userMeta = state.user?.user_metadata || {};
    const appMeta = state.user?.app_metadata || {};
    const subscriptionRow = window.Subscription?.__latestSubscriptionRow
      || (typeof window.Subscription?.getSubscription === "function" ? window.Subscription.getSubscription() : null)
      || null;
    const premiumMeta = typeof window.Subscription?.getPremiumStatus === "function"
      ? window.Subscription.getPremiumStatus()
      : null;
    const plan = normalizePlan(subscriptionRow?.plan || premiumMeta?.subscription_plan);
    const role = String(appMeta.role || userMeta.role || "").toLowerCase();

    let isPremium = false;
    if (window.Subscription && typeof window.Subscription.isPremium === "function") {
      isPremium = window.Subscription.isPremium() === true;
    } else if (window.Subscription && typeof window.Subscription.canAccessDashboard === "function") {
      isPremium = window.Subscription.canAccessDashboard() === true;
    } else {
      isPremium = boolish(userMeta.is_premium) || boolish(appMeta.is_premium);
    }

    const isAdmin = (
      role === "admin"
      || boolish(userMeta.is_admin)
      || boolish(appMeta.is_admin)
      || plan === "admin"
    );

    return {
      isPremium: isPremium === true || isAdmin === true,
      isAdmin: isAdmin === true,
      plan,
      subscriptionRow,
      premiumMeta,
    };
  }

  // Uses the same shared entitlement source used by the rest of the app.
  async function resolveAccessFlags() {
    const userMeta = state.user?.user_metadata || {};
    const appMeta = state.user?.app_metadata || {};
    let isPremium = false;
    let isAdmin = false;
    let entitlementLoaded = false;
    let raw = null;

    if (window.Subscription && typeof window.Subscription.init === "function") {
      try {
        const initOk = await window.Subscription.init();
        if (initOk === true) entitlementLoaded = true;
      } catch (_err) {
        // ignore
      }
    }

    const snapshot = getLiveAccessSnapshot();
    const subscriptionRow = snapshot.subscriptionRow;
    const premiumMeta = snapshot.premiumMeta;

    if (subscriptionRow || premiumMeta) {
      entitlementLoaded = true;
    }

    const plan = normalizePlan(subscriptionRow?.plan || premiumMeta?.subscription_plan);
    const role = String(appMeta.role || userMeta.role || "").toLowerCase();

    isPremium = snapshot.isPremium === true;
    isAdmin = snapshot.isAdmin === true || role === "admin";

    const access = {
      isAdmin: isAdmin === true,
      isPremium: isPremium === true || isAdmin === true,
      isExplicitFree: entitlementLoaded ? (!isPremium && !isAdmin) : false,
      entitlementLoaded: entitlementLoaded === true,
    };

    raw = subscriptionRow || premiumMeta || { userMeta, appMeta };
    devLog("[entitlement]", {
      userId: state.user?.id || null,
      isAdmin: access.isAdmin,
      isPremium: access.isPremium,
      raw,
    });

    return access;
  }

  function isSupabaseReady() {
    return !!(window.supabase && typeof window.supabase.rpc === "function");
  }

  async function waitForAuthBootstrap() {
    let retries = 0;
    while (!window.authInitialized && retries < 40) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }
  }

  function normalizeSubject(subject) {
    const normalized = String(subject || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    const aliasMap = {
      "use of english": "english",
      maths: "mathematics",
      math: "mathematics",
      gov: "government",
      govt: "government",
      goverment: "government",
      "literature in english": "literature",
      "christian religious studies": "crs",
      "christian religious knowledge": "crs",
      crk: "crs",
      "islamic religious studies": "irs",
      "islamic religious knowledge": "irs",
      irk: "irs",
      "computer studies": "computer",
      "computer science": "computer",
      "agricultural science": "agriculture",
      "agricultural studies": "agriculture",
    };

    return aliasMap[normalized] || normalized;
  }

  function getMedal(rank) {
    if (rank === 1) return "\u{1F947}";
    if (rank === 2) return "\u{1F948}";
    if (rank === 3) return "\u{1F949}";
    return "";
  }

  function setWeekLabel(weekId) {
    if (!elements.weekLabel) return;
    elements.weekLabel.textContent = weekId ? `Week: ${weekId}` : "Week: --";
  }

  function localIsoWeekIdUTC(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weekPadded = String(weekNo).padStart(2, "0");
    return `${d.getUTCFullYear()}-W${weekPadded}`;
  }

  async function fetchCurrentWeekId() {
    if (isSupabaseReady()) {
      try {
        const { data, error } = await window.supabase.rpc("tr_current_week_id");
        if (!error && data) {
          if (typeof data === "string") return data;
          if (Array.isArray(data) && data.length > 0) {
            if (typeof data[0] === "string") return data[0];
            if (data[0] && typeof data[0].tr_current_week_id === "string") {
              return data[0].tr_current_week_id;
            }
          }
        }
      } catch (err) {
        console.warn("[leaderboard] Failed to fetch server week_id:", err);
      }
    }
    return localIsoWeekIdUTC(new Date());
  }

  function renderRankCell(rank) {
    const wrapper = document.createElement("span");
    wrapper.className = "leaderboard-rank-cell";
    if (rank === 1) wrapper.classList.add("leaderboard-rank-top1");
    if (rank === 2) wrapper.classList.add("leaderboard-rank-top2");
    if (rank === 3) wrapper.classList.add("leaderboard-rank-top3");

    const rankText = document.createElement("span");
    rankText.textContent = `#${rank}`;
    wrapper.appendChild(rankText);
    return wrapper;
  }

  function renderUsernameCell(targetCell, rank, usernameRaw) {
    const username = usernameRaw || "User";
    targetCell.className = "leaderboard-cell-username";
    targetCell.title = username;
    targetCell.textContent = "";

    const wrap = document.createElement("span");
    wrap.className = "leaderboard-username-wrap";

    const medal = getMedal(rank);
    if (medal) {
      const medalEl = document.createElement("span");
      medalEl.className = "leaderboard-username-medal";
      medalEl.textContent = medal;
      wrap.appendChild(medalEl);
    }

    const textEl = document.createElement("span");
    textEl.className = "leaderboard-username-text";
    textEl.textContent = username;
    wrap.appendChild(textEl);

    targetCell.appendChild(wrap);
  }

  function renderProjectedRows(rows) {
    if (!elements.projectedBody) return;
    elements.projectedBody.innerHTML = "";

    rows.forEach((row, index) => {
      const rank = Number(row.rank) || index + 1;
      const tr = document.createElement("tr");

      const rankTd = document.createElement("td");
      rankTd.className = "leaderboard-cell-rank";
      rankTd.appendChild(renderRankCell(rank));
      tr.appendChild(rankTd);

      const nameTd = document.createElement("td");
      renderUsernameCell(nameTd, rank, row.username);
      tr.appendChild(nameTd);

      const scoreTd = document.createElement("td");
      scoreTd.className = "leaderboard-cell-score";
      const projected = Number(row.projected_score);
      scoreTd.textContent = Number.isFinite(projected) ? `${projected} / 400` : "--";
      const tests = Number(row.tests_this_week);
      if (Number.isFinite(tests)) scoreTd.title = `${tests} tests this week`;
      tr.appendChild(scoreTd);

      elements.projectedBody.appendChild(tr);
    });
  }

  function renderSubjectRows(rows) {
    if (!elements.subjectBody) return;
    elements.subjectBody.innerHTML = "";

    rows.forEach((row, index) => {
      const rank = Number(row.rank) || index + 1;
      const tr = document.createElement("tr");

      const rankTd = document.createElement("td");
      rankTd.className = "leaderboard-cell-rank";
      rankTd.appendChild(renderRankCell(rank));
      tr.appendChild(rankTd);

      const nameTd = document.createElement("td");
      renderUsernameCell(nameTd, rank, row.username);
      tr.appendChild(nameTd);

      const avgTd = document.createElement("td");
      avgTd.className = "leaderboard-cell-score";
      const avg = Number(row.best3_average);
      avgTd.textContent = Number.isFinite(avg) ? `${avg.toFixed(2)}%` : "--";
      const tests = Number(row.tests_this_week);
      if (Number.isFinite(tests)) avgTd.title = `${tests} tests this week`;
      tr.appendChild(avgTd);

      elements.subjectBody.appendChild(tr);
    });
  }

  function renderSelfRank(targetEl, payload, fallbackMessage) {
    if (!targetEl) return;

    if (!payload) {
      targetEl.textContent = fallbackMessage;
      targetEl.style.display = "";
      return;
    }

    const messageText = String(payload.message || "").trim().toLowerCase();
    if (messageText.includes("admin accounts are excluded from public rankings")) {
      targetEl.textContent = "";
      targetEl.style.display = "none";
      return;
    }

    if (payload.qualifies === true && payload.rank) {
      targetEl.textContent = payload.message || `Your position this week: #${payload.rank}`;
      targetEl.style.display = "";
      return;
    }

    if (payload.message) {
      targetEl.textContent = payload.message;
      targetEl.style.display = "";
      return;
    }

    targetEl.textContent = fallbackMessage;
    targetEl.style.display = "";
  }

  async function fetchTopProjected() {
    if (!isSupabaseReady()) throw new Error("Supabase client unavailable.");
    const { data, error } = await window.supabase.rpc("leaderboard_get_top_projected", {
      p_week_id: state.weekId,
      p_limit: 10,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function fetchMyProjectedRank() {
    if (!isSupabaseReady()) throw new Error("Supabase client unavailable.");
    const userId = state.user?.id || null;
    let { data, error } = await window.supabase.rpc("leaderboard_get_my_projected_rank", {
      p_user_id: userId,
      p_week_id: state.weekId,
    });

    // Retry with minimal args to tolerate schema-cache/default-arg quirks.
    if (error) {
      console.warn("[leaderboard] my projected rank rpc retry:", error);
      const retry = await window.supabase.rpc("leaderboard_get_my_projected_rank", {
        p_user_id: userId,
      });
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  }

  async function fetchMyComparison() {
    if (window.ThinkRightWeeklyComparison && typeof window.ThinkRightWeeklyComparison.fetchMyWeeklyComparison === "function") {
      return window.ThinkRightWeeklyComparison.fetchMyWeeklyComparison({
        userId: state.user?.id || null,
        weekId: state.weekId,
      });
    }
    return null;
  }

  function setProjectedMyRankBlur(blurred) {
    if (!elements.projectedMyRankSensitive || !elements.projectedMyRankOverlay) return;
    elements.projectedMyRankCard?.classList.toggle("is-locked", blurred);
    elements.projectedMyRankSensitive.classList.toggle("is-blurred", blurred);
    elements.projectedMyRankOverlay.hidden = !blurred;
    if (!blurred) {
      elements.projectedMyRankOverlay.style.display = "none";
    } else {
      elements.projectedMyRankOverlay.style.removeProperty("display");
    }
  }

  function forceUnlockMyRankUI() {
    if (!elements.projectedMyRankSensitive || !elements.projectedMyRankOverlay) return;
    elements.projectedMyRankCard?.classList.remove("is-locked");
    elements.projectedMyRankSensitive.classList.remove("is-blurred");
    elements.projectedMyRankOverlay.hidden = true;
    elements.projectedMyRankOverlay.style.display = "none";
  }

  function setMaskedMyRankValues() {
    elements.projectedMyRankValue.textContent = "â€¢â€¢â€¢";
    elements.projectedMyScoreValue.textContent = "â€¢â€¢â€¢";
    elements.projectedMyPercentileValue.textContent = "â€¢â€¢â€¢";
    elements.projectedMyPercentileItem.hidden = false;
  }

  function formatPercentileText(percentile) {
    const value = Number(percentile);
    if (!Number.isFinite(value)) return "";
    return `Above ${Math.max(0, Math.min(100, Math.round(value)))}% of active users`;
  }

  function openPricingModal() {
    if (window.Subscription && typeof window.Subscription.showPricingModal === "function") {
      window.Subscription.showPricingModal();
      return;
    }
    if (typeof window.showPricingModal === "function") {
      window.showPricingModal();
    }
  }

  function renderProjectedMyRankCard(topRows, myRank, myComparison) {
    const card = elements.projectedMyRankCard;
    if (!card) return;

    card.hidden = false;
    card.classList.toggle("is-loading", state.accessLoading === true);
    forceUnlockMyRankUI();

    if (state.accessLoading) {
      elements.projectedMyRankStatus.textContent = "Checking your access...";
      elements.projectedMyRankValue.textContent = "--";
      elements.projectedMyScoreValue.textContent = "-- / 400";
      elements.projectedMyPercentileItem.hidden = true;
      return;
    }

    const selfFromTop = Array.isArray(topRows)
      ? topRows.find((row) => String(row.user_id) === String(state.user?.id))
      : null;
    const rankNum = Number(myRank?.rank ?? myComparison?.rank ?? selfFromTop?.rank);
    const scoreNum = Number(myRank?.projected_score ?? myComparison?.myProjectedScore ?? selfFromTop?.projected_score);
    const hasNumbers = Number.isFinite(rankNum) && Number.isFinite(scoreNum);
    const qualifies = myRank?.qualifies === true || myComparison?.qualifies === true || hasNumbers;
    const inTop10 = Array.isArray(topRows) && topRows.some((row) => String(row.user_id) === String(state.user?.id));
    const liveAccess = getLiveAccessSnapshot();
    const isAdmin = state.access.isAdmin === true || liveAccess.isAdmin === true;
    const isPremium = state.access.isPremium === true || liveAccess.isPremium === true;

    if (!qualifies || !hasNumbers) {
      const eligibilityMessage = String(myRank?.message || myComparison?.message || "Take at least 3 tests this week to get ranked.");
      if (isAdmin || isPremium) {
        elements.projectedMyRankStatus.textContent = "Your weekly rank is updating. Complete more tests to appear.";
      } else {
        elements.projectedMyRankStatus.textContent = eligibilityMessage.includes("excluded")
          ? "Take at least 3 tests this week to get ranked."
          : eligibilityMessage;
      }
      elements.projectedMyRankValue.textContent = "--";
      elements.projectedMyScoreValue.textContent = "-- / 400";
      elements.projectedMyPercentileItem.hidden = true;
      forceUnlockMyRankUI();
      return;
    }

    // Final gate for this card: show unlocked when inTop10 OR admin OR premium.
    const canSee = inTop10 || isAdmin || isPremium;
    const shouldBlur = !(canSee || isAdmin || isPremium);
    if (DEV_MODE && !state.entitlementDebugLogged) {
      console.log("[leaderboard entitlement]", {
        entitlementLoaded: state.accessLoading !== true,
        isPremium,
        isAdmin,
        inTop10,
        access: state.access,
        liveAccess,
      });
      state.entitlementDebugLogged = true;
    }
    devLog("[rankCard]", { inTop10, shouldBlur });
    if (shouldBlur) {
      elements.projectedMyRankStatus.textContent = "Your weekly ranking details are available on Premium.";
      setMaskedMyRankValues();
      setProjectedMyRankBlur(true);
      return;
    }

    forceUnlockMyRankUI();
    elements.projectedMyRankValue.textContent = `#${rankNum}`;
    elements.projectedMyScoreValue.textContent = `${Math.round(scoreNum)} / 400`;

    const percentileValue = Number(myComparison?.percentile);
    if (Number.isFinite(percentileValue)) {
      elements.projectedMyPercentileValue.textContent = formatPercentileText(percentileValue);
      elements.projectedMyPercentileItem.hidden = false;
    } else {
      elements.projectedMyPercentileItem.hidden = true;
    }
    if (inTop10) {
      elements.projectedMyRankStatus.textContent = "You're currently #" + rankNum + " 🎉";
      return;
    }

    elements.projectedMyRankStatus.textContent = "Your rank this week: #" + rankNum;
  }

  async function fetchTopSubject(subjectKey) {
    if (!isSupabaseReady()) throw new Error("Supabase client unavailable.");
    const { data, error } = await window.supabase.rpc("leaderboard_get_top_subject", {
      p_subject: normalizeSubject(subjectKey),
      p_week_id: state.weekId,
      p_limit: 10,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function fetchMySubjectRank(subjectKey) {
    if (!isSupabaseReady()) throw new Error("Supabase client unavailable.");
    const userId = state.user?.id || null;
    let { data, error } = await window.supabase.rpc("leaderboard_get_my_subject_rank", {
      p_subject: normalizeSubject(subjectKey),
      p_user_id: userId,
      p_week_id: state.weekId,
    });

    if (error) {
      console.warn("[leaderboard] my subject rank rpc retry:", error);
      const retry = await window.supabase.rpc("leaderboard_get_my_subject_rank", {
        p_subject: normalizeSubject(subjectKey),
        p_user_id: userId,
      });
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  }

  async function loadProjectedSection() {
    if (elements.projectedStatus) elements.projectedStatus.textContent = "Loading projected rankings...";
    if (elements.projectedWrap) elements.projectedWrap.hidden = true;
    if (elements.projectedEmpty) elements.projectedEmpty.hidden = true;
    let topRows = [];
    let myRank = null;
    let myComparison = null;

    renderProjectedMyRankCard(topRows, myRank, myComparison);

    if (state.accessLoading) {
      try {
        state.access = await resolveAccessFlags();
      } finally {
        state.accessLoading = state.access.entitlementLoaded !== true;
      }
    }

    try {
      topRows = await fetchTopProjected();
      console.log("[leaderboard] top projected rows:", topRows.length);
      if (topRows.length === 0) {
        if (elements.projectedStatus) elements.projectedStatus.textContent = "";
        if (elements.projectedEmpty) elements.projectedEmpty.hidden = false;
      } else {
        renderProjectedRows(topRows);
        if (elements.projectedStatus) elements.projectedStatus.textContent = "";
        if (elements.projectedWrap) elements.projectedWrap.hidden = false;
      }
    } catch (error) {
      console.error("[leaderboard] projected top load error:", error);
      if (elements.projectedStatus) {
        elements.projectedStatus.textContent = "Unable to load projected leaderboard right now.";
      }
    }

    const [myRankResult, myComparisonResult] = await Promise.allSettled([
      fetchMyProjectedRank(),
      fetchMyComparison(),
    ]);

    if (myRankResult.status === "fulfilled") {
      myRank = myRankResult.value;
    } else {
      console.error("[leaderboard] projected position load error:", myRankResult.reason);
    }

    if (myComparisonResult.status === "fulfilled") {
      myComparison = myComparisonResult.value;
    } else {
      console.warn("[leaderboard] comparison load warning:", myComparisonResult.reason);
    }

    renderProjectedMyRankCard(topRows, myRank, myComparison);
  }

  async function loadSubjectSection(subjectKey) {
    const normalized = normalizeSubject(subjectKey);
    state.activeSubject = normalized;
    syncSubjectControls(null);

    if (elements.subjectStatus) elements.subjectStatus.textContent = "Loading subject rankings...";
    if (elements.subjectWrap) elements.subjectWrap.hidden = true;
    if (elements.subjectEmpty) elements.subjectEmpty.hidden = true;

    let topRows = [];
    let myRank = null;

    try {
      topRows = await fetchTopSubject(normalized);
      console.log("[leaderboard] top subject rows:", normalized, topRows.length);

      if (topRows.length === 0) {
        if (elements.subjectStatus) elements.subjectStatus.textContent = "";
        if (elements.subjectEmpty) elements.subjectEmpty.hidden = false;
      } else {
        renderSubjectRows(topRows);
        if (elements.subjectStatus) elements.subjectStatus.textContent = "";
        if (elements.subjectWrap) elements.subjectWrap.hidden = false;
      }
    } catch (error) {
      console.error("[leaderboard] subject top load error:", error);
      if (elements.subjectStatus) {
        elements.subjectStatus.textContent = "Unable to load subject leaderboard right now.";
      }
    }

    try {
      myRank = await fetchMySubjectRank(normalized);
    } catch (error) {
      console.error("[leaderboard] subject position load error:", error);
    }

    renderSelfRank(
      elements.mySubjectRank,
      myRank,
      "You need at least 2 completed tests in this subject this week to appear."
    );
  }

  function syncSubjectControls(tabButton) {
    const buttons = elements.subjectTabs
      ? elements.subjectTabs.querySelectorAll(".leaderboard-tab")
      : [];
    buttons.forEach((btn) => {
      const selected = btn.dataset.subject === state.activeSubject;
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.tabIndex = selected ? 0 : -1;
    });
    if (elements.subjectSelect && elements.subjectSelect.value !== state.activeSubject) {
      elements.subjectSelect.value = state.activeSubject;
    }
  }

  function buildSubjectTabs() {
    if (!elements.subjectTabs) return;
    elements.subjectTabs.innerHTML = "";
    if (elements.subjectSelect) {
      elements.subjectSelect.innerHTML = "";
    }

    const preferredSubject = normalizeSubject(localStorage.getItem("selectedSubject"));
    if (SUBJECTS.some((item) => item.key === preferredSubject)) {
      state.activeSubject = preferredSubject;
    }

    SUBJECTS.forEach((subject) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "leaderboard-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", subject.key === state.activeSubject ? "true" : "false");
      btn.tabIndex = subject.key === state.activeSubject ? 0 : -1;
      btn.textContent = subject.label;
      btn.dataset.subject = subject.key;

      btn.addEventListener("click", async () => {
        if (state.activeSubject === subject.key) return;
        state.activeSubject = subject.key;
        syncSubjectControls(btn);
        await loadSubjectSection(subject.key);
      });

      elements.subjectTabs.appendChild(btn);

      if (elements.subjectSelect) {
        const option = document.createElement("option");
        option.value = subject.key;
        option.textContent = subject.label;
        elements.subjectSelect.appendChild(option);
      }
    });

    if (elements.subjectSelect) {
      elements.subjectSelect.value = state.activeSubject;
      if (elements.subjectSelect.dataset.bound !== "true") {
        elements.subjectSelect.dataset.bound = "true";
        elements.subjectSelect.addEventListener("change", async (event) => {
          const nextSubject = normalizeSubject(event.target.value);
          if (!nextSubject || nextSubject === state.activeSubject) return;
          state.activeSubject = nextSubject;
          syncSubjectControls(null);
          await loadSubjectSection(nextSubject);
        });
      }
    }
  }

  async function initLeaderboard() {
    await waitForAuthBootstrap();

    const user = typeof getCurrentUser === "function" ? await getCurrentUser() : null;
    if (!user) {
      window.location.href = `login.html?next=${encodeURIComponent("leaderboard.html")}`;
      return;
    }

    state.user = user;
    state.accessLoading = true;
    state.weekId = await fetchCurrentWeekId();
    setWeekLabel(state.weekId);

    if (elements.projectedMyRankUpgradeBtn && elements.projectedMyRankUpgradeBtn.dataset.bound !== "true") {
      elements.projectedMyRankUpgradeBtn.dataset.bound = "true";
      elements.projectedMyRankUpgradeBtn.addEventListener("click", openPricingModal);
    }

    buildSubjectTabs();
    await Promise.all([loadProjectedSection(), loadSubjectSection(state.activeSubject)]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeaderboard);
  } else {
    initLeaderboard();
  }
})();

