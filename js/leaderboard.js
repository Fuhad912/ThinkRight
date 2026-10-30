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
    { key: "english", label: "Use of English", icon: "fa-book-open" },
    { key: "mathematics", label: "Mathematics", icon: "fa-calculator" },
    { key: "physics", label: "Physics", icon: "fa-atom" },
    { key: "chemistry", label: "Chemistry", icon: "fa-flask-vial" },
    { key: "biology", label: "Biology", icon: "fa-dna" },
    { key: "agriculture", label: "Agricultural Science", icon: "fa-wheat-awn" },
    { key: "computer", label: "Computer Studies", icon: "fa-laptop-code" },
    { key: "economics", label: "Economics", icon: "fa-chart-line" },
    { key: "commerce", label: "Commerce", icon: "fa-coins" },
    { key: "government", label: "Government", icon: "fa-landmark" },
    { key: "literature", label: "Literature in English", icon: "fa-feather" },
    { key: "geography", label: "Geography", icon: "fa-earth-africa" },
    { key: "history", label: "History", icon: "fa-hourglass-half" },
    { key: "crs", label: "Christian Religious Studies", icon: "fa-cross" },
    { key: "irs", label: "Islamic Religious Studies", icon: "fa-moon" },
  ];

  // Benchmark pacemakers displayed gracefully if fewer than 3 users have completed the 3-test threshold early in the week
  const BENCHMARK_PACEMAKERS = [
    { username: "David O. (Pacesetter)", projected_score: 348, tests_this_week: 11, ambition: "Target: 350+ UI Medicine", isBenchmark: true },
    { username: "Chioma A. (Pacesetter)", projected_score: 334, tests_this_week: 9, ambition: "Target: 330+ UNILAG Law", isBenchmark: true },
    { username: "Ibrahim K. (Pacesetter)", projected_score: 320, tests_this_week: 8, ambition: "Target: 320+ OAU Eng", isBenchmark: true }
  ];

  const state = {
    user: null,
    weekId: null,
    activeMode: "projected", // "projected" or "subject"
    activeSubject: "english",
    projectedRows: [],
    subjectRows: [],
    myProjectedRank: null,
    myComparison: null,
    mySubjectRank: null,
    access: {
      isPremium: false,
      isAdmin: false,
      isExplicitFree: false,
    },
    accessLoading: true,
    initialLoadDone: false,
  };

  const elements = {
    weekLabel: document.getElementById("leaderboardWeekLabel"),
    projectedStatus: document.getElementById("projectedStatus"),
    subjectStatus: document.getElementById("subjectStatus"),
    podium: document.getElementById("arenaPodium"),
    podiumHeading: document.getElementById("podiumHeading"),
    podiumSubheading: document.getElementById("podiumSubheading"),
    rosterTitle: document.getElementById("rosterTitle"),
    rosterSubtitle: document.getElementById("rosterSubtitle"),
    rosterList: document.getElementById("candidateRosterList"),
    rosterCountBadge: document.getElementById("rosterCountBadge"),
    emptyState: document.getElementById("arenaEmptyState"),
    tabModeProjected: document.getElementById("tabModeProjected"),
    tabModeSubject: document.getElementById("tabModeSubject"),
    subjectPickerContainer: document.getElementById("subjectPickerContainer"),
    subjectTabs: document.getElementById("subjectTabs"),
    subjectSelect: document.getElementById("subjectSelect"),
    stickyHud: document.getElementById("stickyRankHud"),
    hudUsername: document.getElementById("hudUsername"),
    hudUserAvatar: document.getElementById("hudUserAvatar"),
    hudRankBadge: document.getElementById("hudRankBadge"),
    hudScoreVal: document.getElementById("hudScoreVal"),
    hudGapText: document.getElementById("hudGapText"),
    hudShareBtn: document.getElementById("hudShareBtn"),
    scoringRulesModal: document.getElementById("scoringRulesModal"),
    openScoringRulesBtn: document.getElementById("openScoringRulesBtn"),
    closeScoringRulesBtn: document.getElementById("closeScoringRulesBtn"),
    gotItRulesBtn: document.getElementById("gotItRulesBtn"),
    shareRankModal: document.getElementById("shareRankModal"),
    closeShareModalBtn: document.getElementById("closeShareModalBtn"),
    shareCardName: document.getElementById("shareCardName"),
    shareCardRank: document.getElementById("shareCardRank"),
    shareCardScore: document.getElementById("shareCardScore"),
    shareWhatsappBtn: document.getElementById("shareWhatsappBtn"),
    copyShareTextBtn: document.getElementById("copyShareTextBtn"),
    trToast: document.getElementById("trToast"),
    loadingOverlay: document.getElementById("leaderboardLoadingOverlay"),
    loadingLabel: document.getElementById("leaderboardLoadingLabel"),
    loadingProgressBar: document.getElementById("leaderboardLoadingProgressBar"),
    loadingPercent: document.getElementById("leaderboardLoadingPercent"),
    // Legacy elements for backward compatibility
    projectedWrap: document.getElementById("projectedTableWrap"),
    projectedBody: document.getElementById("projectedBody"),
    projectedEmpty: document.getElementById("projectedEmpty"),
    subjectWrap: document.getElementById("subjectTableWrap"),
    subjectBody: document.getElementById("subjectBody"),
    subjectEmpty: document.getElementById("subjectEmpty"),
    mySubjectRank: document.getElementById("mySubjectRank"),
  };

  // Toast Notification
  function showToast(message, type = "info") {
    const toast = elements.trToast;
    if (!toast) return;
    toast.textContent = message;
    toast.className = `tr-toast tr-toast--${type} is-visible`;
    setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3200);
  }

  // Loader Progress
  function renderLoaderProgress(value) {
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));
    if (elements.loadingPercent) elements.loadingPercent.textContent = String(Math.round(clamped));
    if (elements.loadingProgressBar) elements.loadingProgressBar.style.width = `${clamped}%`;
  }

  function setLoaderProgress(progress, label) {
    const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
    if (window.ThinkRightLoader && typeof window.ThinkRightLoader.setProgress === "function") {
      window.ThinkRightLoader.setProgress(clamped, label);
    }
    if (elements.loadingLabel && label) elements.loadingLabel.textContent = label;
    renderLoaderProgress(clamped);
  }

  function showLeaderboardLoader(show, progress = 0, label = "Loading...") {
    if (window.ThinkRightLoader) {
      if (show) {
        if (state.initialLoadDone && typeof window.ThinkRightLoader.ribbonStart === "function") {
          window.ThinkRightLoader.ribbonStart();
        } else {
          window.ThinkRightLoader.setProgress(progress, label);
        }
      } else {
        if (state.initialLoadDone && typeof window.ThinkRightLoader.ribbonDone === "function") {
          window.ThinkRightLoader.ribbonDone();
        }
        if (typeof window.ThinkRightLoader.done === "function") {
          window.ThinkRightLoader.done("Arena ready");
        }
      }
    }
    const overlay = elements.loadingOverlay;
    if (overlay) {
      overlay.classList.add("is-hidden");
      overlay.setAttribute("aria-busy", "false");
    }
  }

  // Helpers: Avatar & Colors
  const AVATAR_GRADIENTS = [
    "linear-gradient(135deg, #1d4ed8, #4f46e5)",
    "linear-gradient(135deg, #059669, #10b981)",
    "linear-gradient(135deg, #7c3aed, #9333ea)",
    "linear-gradient(135deg, #d97706, #f59e0b)",
    "linear-gradient(135deg, #e11d48, #f43f5e)",
    "linear-gradient(135deg, #0284c7, #38bdf8)",
  ];

  function getAvatarGradient(name) {
    let hash = 0;
    const str = String(name || "TR");
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[index];
  }

  function getInitials(name) {
    const clean = String(name || "User").replace(/[^a-zA-Z0-9\s]/g, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || "TR";
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  // League Tiers Helper
  function getLeagueTier(score, isSubject) {
    if (isSubject) {
      const avg = Number(score) || 0;
      if (avg >= 85) return { name: "Subject Titan", class: "arena-tier-chip--titan", icon: "fa-crown" };
      if (avg >= 70) return { name: "Scholar", class: "arena-tier-chip--scholar", icon: "fa-medal" };
      if (avg >= 55) return { name: "Contender", class: "arena-tier-chip--contender", icon: "fa-bolt" };
      return { name: "Rising Star", class: "arena-tier-chip--contender", icon: "fa-rocket" };
    }

    const val = Number(score) || 0;
    if (val >= 300) return { name: "300+ Titan", class: "arena-tier-chip--titan", icon: "fa-crown" };
    if (val >= 250) return { name: "Scholar", class: "arena-tier-chip--scholar", icon: "fa-medal" };
    if (val >= 200) return { name: "Contender", class: "arena-tier-chip--contender", icon: "fa-bolt" };
    return { name: "Rising Star", class: "arena-tier-chip--contender", icon: "fa-rocket" };
  }

  // Live Weekly Countdown Timer
  function setupCountdownTimer() {
    const daysEl = document.getElementById("timerDays");
    const hoursEl = document.getElementById("timerHours");
    const minsEl = document.getElementById("timerMins");
    const secsEl = document.getElementById("timerSecs");
    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    function getNextSundayMidnightUTC() {
      const now = new Date();
      const currentDay = now.getUTCDay(); // 0 is Sunday
      const daysUntilSunday = currentDay === 0 ? 7 : (7 - currentDay);
      const nextSunday = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilSunday,
        23, 59, 59, 999
      ));
      return nextSunday.getTime();
    }

    const targetTime = getNextSundayMidnightUTC();

    function update() {
      const now = Date.now();
      const diff = Math.max(0, targetTime - now);

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      daysEl.textContent = String(d).padStart(2, "0");
      hoursEl.textContent = String(h).padStart(2, "0");
      minsEl.textContent = String(m).padStart(2, "0");
      secsEl.textContent = String(s).padStart(2, "0");
    }

    update();
    setInterval(update, 1000);
  }

  // Supabase Readiness Check
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
    const normalized = String(subject || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const aliasMap = {
      "use of english": "english",
      maths: "mathematics",
      math: "mathematics",
      gov: "government",
      govt: "government",
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
    };
    return aliasMap[normalized] || normalized;
  }

  function localIsoWeekIdUTC(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  async function fetchCurrentWeekId() {
    if (isSupabaseReady()) {
      try {
        const { data, error } = await window.supabase.rpc("tr_current_week_id");
        if (!error && data) {
          if (typeof data === "string") return data;
          if (Array.isArray(data) && data.length > 0) {
            return typeof data[0] === "string" ? data[0] : (data[0].tr_current_week_id || localIsoWeekIdUTC(new Date()));
          }
        }
      } catch (err) {
        console.warn("[leaderboard] Week ID RPC error:", err);
      }
    }
    return localIsoWeekIdUTC(new Date());
  }

  // --- RPC Fetchers ---
  async function fetchTopProjected() {
    if (!isSupabaseReady()) return [];
    const { data, error } = await window.supabase.rpc("leaderboard_get_top_projected", {
      p_week_id: state.weekId,
      p_limit: 50,
    });
    if (error) {
      console.warn("[leaderboard] top projected rpc error:", error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  async function fetchMyProjectedRank() {
    if (!isSupabaseReady() || !state.user) return null;
    try {
      const { data, error } = await window.supabase.rpc("leaderboard_get_my_projected_rank", {
        p_user_id: state.user.id,
        p_week_id: state.weekId,
      });
      if (!error && Array.isArray(data) && data.length > 0) return data[0];
    } catch (_e) {}
    return null;
  }

  async function fetchMyComparison() {
    if (window.ThinkRightWeeklyComparison && typeof window.ThinkRightWeeklyComparison.fetchMyWeeklyComparison === "function") {
      try {
        return await window.ThinkRightWeeklyComparison.fetchMyWeeklyComparison({
          userId: state.user?.id || null,
          weekId: state.weekId,
        });
      } catch (_e) {}
    }
    return null;
  }

  async function fetchTopSubject(subjectKey) {
    if (!isSupabaseReady()) return [];
    try {
      const { data, error } = await window.supabase.rpc("leaderboard_get_top_subject", {
        p_subject: normalizeSubject(subjectKey),
        p_week_id: state.weekId,
        p_limit: 50,
      });
      if (!error && Array.isArray(data)) return data;
    } catch (_e) {}
    return [];
  }

  async function fetchMySubjectRank(subjectKey) {
    if (!isSupabaseReady() || !state.user) return null;
    try {
      const { data, error } = await window.supabase.rpc("leaderboard_get_my_subject_rank", {
        p_subject: normalizeSubject(subjectKey),
        p_user_id: state.user.id,
        p_week_id: state.weekId,
      });
      if (!error && Array.isArray(data) && data.length > 0) return data[0];
    } catch (_e) {}
    return null;
  }

  // --- Rendering Champions Podium ---
  function renderPodium(rows, isSubject) {
    if (!elements.podium) return;

    // Use top 3 rows. If fewer than 3 exist in early week, fill with benchmark pacemakers
    let podiumRows = rows.slice(0, 3);
    if (podiumRows.length < 3 && !isSubject) {
      const needed = 3 - podiumRows.length;
      for (let i = 0; i < needed; i++) {
        podiumRows.push(BENCHMARK_PACEMAKERS[podiumRows.length]);
      }
    }

    if (podiumRows.length === 0) {
      elements.podium.innerHTML = "";
      return;
    }

    const rank1 = podiumRows[0];
    const rank2 = podiumRows[1] || null;
    const rank3 = podiumRows[2] || null;

    // Visual ordering: #2 on left, #1 in center, #3 on right
    const slots = [
      { row: rank2, rankNum: 2, slotClass: "podium-slot--rank2", medal: "🥈", label: "2nd Place" },
      { row: rank1, rankNum: 1, slotClass: "podium-slot--rank1", medal: "👑", label: "Champion" },
      { row: rank3, rankNum: 3, slotClass: "podium-slot--rank3", medal: "🥉", label: "3rd Place" },
    ];

    elements.podium.innerHTML = slots.map((slot) => {
      const row = slot.row;
      if (!row) return `<div class="podium-slot ${slot.slotClass}"><div class="podium-base"><span class="podium-rank-tag">#${slot.rankNum}</span></div></div>`;

      const username = row.username || "Candidate";
      const initials = getInitials(username);
      const avatarBg = slot.rankNum === 1 ? "" : `style="background: ${getAvatarGradient(username)};"`;
      const scoreDisplay = isSubject
        ? `${Number(row.best3_average || 0).toFixed(1)}%`
        : `${Math.round(Number(row.projected_score || 0))} / 400`;
      const testsDisplay = Number(row.tests_this_week) > 0 ? `<i class="fa-solid fa-fire"></i> ${row.tests_this_week} tests` : "Pacesetter";
      const ambitionText = row.ambition || (slot.rankNum === 1 ? "National Leader" : "Challenger");

      return `
        <div class="podium-slot ${slot.slotClass}">
          <div class="podium-top">
            ${slot.rankNum === 1 ? `<div class="podium-crown"><i class="fa-solid fa-crown"></i></div>` : ""}
            <div class="podium-avatar" ${avatarBg}>${initials}</div>
            <h4 class="podium-name" title="${escapeHtml(username)}">${escapeHtml(username)}</h4>
            <div class="podium-score">${scoreDisplay}</div>
            <span class="podium-badge-pill">${testsDisplay}</span>
          </div>
          <div class="podium-base">
            <span class="podium-rank-tag">#${slot.rankNum}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // --- Rendering Candidates Roster (Ranks 4+) ---
  function renderRoster(rows, isSubject) {
    if (!elements.rosterList) return;

    // Everything after rank 3
    const rosterRows = rows.slice(3);

    if (rosterRows.length === 0) {
      if (rows.length === 0) {
        if (elements.emptyState) elements.emptyState.style.display = "block";
      } else {
        if (elements.emptyState) elements.emptyState.style.display = "none";
      }
      elements.rosterList.innerHTML = "";
      if (elements.rosterCountBadge) elements.rosterCountBadge.textContent = `${rows.length} Total Contenders`;
      return;
    }

    if (elements.emptyState) elements.emptyState.style.display = "none";
    if (elements.rosterCountBadge) elements.rosterCountBadge.textContent = `${rows.length} Total Contenders`;

    elements.rosterList.innerHTML = rosterRows.map((row, idx) => {
      const rank = idx + 4;
      const username = row.username || "Candidate";
      const initials = getInitials(username);
      const isSelf = state.user && String(row.user_id) === String(state.user.id);
      const score = isSubject ? Number(row.best3_average || 0) : Number(row.projected_score || 0);
      const scoreDisplay = isSubject ? `${score.toFixed(1)}%` : `${Math.round(score)} / 400`;
      const tier = getLeagueTier(score, isSubject);
      const tests = Number(row.tests_this_week) || 1;

      return `
        <article class="candidate-row ${isSelf ? "candidate-row--self" : ""}">
          <div class="candidate-row__left">
            <span class="candidate-rank-badge">#${rank}</span>
            <div class="candidate-avatar" style="background: ${getAvatarGradient(username)};">
              ${initials}
            </div>
            <div class="candidate-info">
              <div class="candidate-name-row">
                <span class="candidate-name" title="${escapeHtml(username)}">${escapeHtml(username)}</span>
                ${isSelf ? `<span class="candidate-self-tag">YOU</span>` : ""}
              </div>
              <div class="candidate-meta-row">
                <span class="arena-tier-chip ${tier.class}" style="padding: 0.1rem 0.5rem; font-size: 0.72rem;">
                  <i class="fa-solid ${tier.icon}"></i> ${tier.name}
                </span>
                <span>•</span>
                <span><i class="fa-solid fa-fire"></i> ${tests} tests</span>
              </div>
            </div>
          </div>
          <div class="candidate-row__right">
            <div class="candidate-score-block">
              <span class="candidate-score-val">${scoreDisplay}</span>
              <span class="candidate-score-lbl">${isSubject ? "Best 3 Avg" : "Projected"}</span>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  // --- Sticky HUD Controller ---
  function updateStickyHud() {
    if (!elements.stickyHud) return;

    if (!state.user) {
      if (elements.hudUsername) elements.hudUsername.textContent = "Guest";
      if (elements.hudUserAvatar) elements.hudUserAvatar.textContent = "TR";
      if (elements.hudRankBadge) elements.hudRankBadge.textContent = "Log In";
      if (elements.hudScoreVal) elements.hudScoreVal.textContent = "-- / 400";
      if (elements.hudGapText) elements.hudGapText.textContent = "Log in to track your live national ranking";
      return;
    }

    const username = state.user.user_metadata?.username
      || (state.user.email ? state.user.email.split("@")[0] : "You");
    if (elements.hudUsername) elements.hudUsername.textContent = username;
    if (elements.hudUserAvatar) {
      elements.hudUserAvatar.textContent = getInitials(username);
      elements.hudUserAvatar.style.background = getAvatarGradient(username);
    }

    const isSubject = state.activeMode === "subject";
    const rankData = isSubject ? state.mySubjectRank : (state.myProjectedRank || state.myComparison);

    if (!rankData || !rankData.qualifies || !rankData.rank) {
      const tests = rankData?.tests_this_week || rankData?.my_tests_this_week || 0;
      const needed = Math.max(0, (isSubject ? 2 : 3) - tests);
      if (elements.hudRankBadge) elements.hudRankBadge.textContent = "Unranked";
      if (elements.hudScoreVal) elements.hudScoreVal.textContent = "--";
      if (elements.hudGapText) {
        elements.hudGapText.textContent = needed > 0
          ? `Complete ${needed} more test${needed > 1 ? "s" : ""} to enter rankings!`
          : "Complete tests to earn a projected score";
      }
      return;
    }

    const rankNum = Number(rankData.rank);
    if (elements.hudRankBadge) elements.hudRankBadge.textContent = `#${rankNum}`;

    const scoreNum = Number(isSubject ? (rankData.best3_average || 0) : (rankData.projected_score || rankData.my_projected_score || 0));
    if (elements.hudScoreVal) {
      elements.hudScoreVal.textContent = isSubject ? `${scoreNum.toFixed(1)}%` : `${Math.round(scoreNum)} / 400`;
    }

    // Dynamic Overtake Gap calculation
    const activeRows = isSubject ? state.subjectRows : state.projectedRows;
    if (rankNum === 1) {
      if (elements.hudGapText) elements.hudGapText.innerHTML = '<i class="fa-solid fa-crown" style="color: #f59e0b;"></i> You are currently #1 Champion this week!';
    } else if (rankNum <= 3) {
      if (elements.hudGapText) elements.hudGapText.innerHTML = '<i class="fa-solid fa-trophy" style="color: #eab308;"></i> You are on the National Podium!';
    } else {
      // Find candidate right ahead of user
      const candidateAhead = activeRows.find((r, i) => i === (rankNum - 2));
      if (candidateAhead) {
        const aheadScore = Number(isSubject ? candidateAhead.best3_average : candidateAhead.projected_score) || 0;
        const gap = Math.max(1, Math.round(aheadScore - scoreNum));
        if (elements.hudGapText) elements.hudGapText.innerHTML = `<i class="fa-solid fa-bolt" style="color: #3b82f6;"></i> Only ${gap} pt${gap > 1 ? "s" : ""} behind #${rankNum - 1}! 1 test can overtake them.`;
      } else {
        if (elements.hudGapText) elements.hudGapText.textContent = `You are ranked #${rankNum} nationwide!`;
      }
    }
  }

  // --- Modal Handlers ---
  function setupModals() {
    // Scoring Rules Modal
    if (elements.openScoringRulesBtn && elements.scoringRulesModal) {
      elements.openScoringRulesBtn.addEventListener("click", () => {
        elements.scoringRulesModal.classList.add("is-open");
      });
    }

    if (elements.closeScoringRulesBtn && elements.scoringRulesModal) {
      elements.closeScoringRulesBtn.addEventListener("click", () => {
        elements.scoringRulesModal.classList.remove("is-open");
      });
    }

    if (elements.gotItRulesBtn && elements.scoringRulesModal) {
      elements.gotItRulesBtn.addEventListener("click", () => {
        elements.scoringRulesModal.classList.remove("is-open");
      });
    }

    // Share Modal
    if (elements.hudShareBtn && elements.shareRankModal) {
      elements.hudShareBtn.addEventListener("click", openShareModal);
    }

    if (elements.closeShareModalBtn && elements.shareRankModal) {
      elements.closeShareModalBtn.addEventListener("click", () => {
        elements.shareRankModal.classList.remove("is-open");
      });
    }

    // Close on backdrop click
    [elements.scoringRulesModal, elements.shareRankModal].forEach((modal) => {
      if (!modal) return;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("is-open");
      });
    });

    // Share Actions
    if (elements.shareWhatsappBtn) {
      elements.shareWhatsappBtn.addEventListener("click", () => {
        const text = generateShareText();
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank");
      });
    }

    if (elements.copyShareTextBtn) {
      elements.copyShareTextBtn.addEventListener("click", () => {
        const text = generateShareText();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            showToast("Challenge text copied to clipboard!", "success");
          });
        } else {
          showToast("Copied to clipboard!", "success");
        }
      });
    }
  }

  function openShareModal() {
    if (!elements.shareRankModal) return;
    const isSubject = state.activeMode === "subject";
    const rankData = isSubject ? state.mySubjectRank : (state.myProjectedRank || state.myComparison);

    const username = state.user?.user_metadata?.username
      || (state.user?.email ? state.user.email.split("@")[0] : "Candidate");
    const rankVal = rankData?.rank ? `#${rankData.rank}` : "Contender";
    const scoreVal = rankData?.qualifies
      ? (isSubject ? `${Number(rankData.best3_average || 0).toFixed(1)}%` : `${Math.round(Number(rankData.projected_score || rankData.my_projected_score || 0))} / 400`)
      : "In Training";

    if (elements.shareCardName) elements.shareCardName.textContent = username;
    if (elements.shareCardRank) elements.shareCardRank.textContent = `Rank ${rankVal}`;
    if (elements.shareCardScore) elements.shareCardScore.textContent = `${scoreVal} Projected UTME`;

    elements.shareRankModal.classList.add("is-open");
  }

  function generateShareText() {
    const isSubject = state.activeMode === "subject";
    const rankData = isSubject ? state.mySubjectRank : (state.myProjectedRank || state.myComparison);
    const rankVal = rankData?.rank ? `#${rankData.rank}` : "Top Contender";
    const scoreVal = rankData?.qualifies
      ? (isSubject ? `${Number(rankData.best3_average || 0).toFixed(1)}%` : `${Math.round(Number(rankData.projected_score || rankData.my_projected_score || 0))}/400`)
      : "active practice";

    return `🏆 I am currently ranked ${rankVal} on the ThinkRight National UTME Arena with a projected score of ${scoreVal}! Can you beat my score? Take the challenge at: https://thinkright.ng/leaderboard.html`;
  }

  // --- Mode Switcher Controller ---
  function setupModeSwitcher() {
    if (elements.tabModeProjected) {
      elements.tabModeProjected.addEventListener("click", () => {
        if (state.activeMode === "projected") return;
        state.activeMode = "projected";
        elements.tabModeProjected.classList.add("is-active");
        elements.tabModeSubject?.classList.remove("is-active");
        if (elements.subjectPickerContainer) elements.subjectPickerContainer.style.display = "none";

        if (elements.podiumHeading) elements.podiumHeading.textContent = "Top 3 National Contenders";
        if (elements.podiumSubheading) elements.podiumSubheading.textContent = "The current frontrunners setting the standard this week";
        if (elements.rosterTitle) elements.rosterTitle.textContent = "Contenders Leaderboard";

        renderPodium(state.projectedRows, false);
        renderRoster(state.projectedRows, false);
        updateStickyHud();
      });
    }

    if (elements.tabModeSubject) {
      elements.tabModeSubject.addEventListener("click", async () => {
        if (state.activeMode === "subject") return;
        state.activeMode = "subject";
        elements.tabModeSubject.classList.add("is-active");
        elements.tabModeProjected?.classList.remove("is-active");
        if (elements.subjectPickerContainer) elements.subjectPickerContainer.style.display = "flex";

        await loadSubjectData(state.activeSubject);
      });
    }
  }

  // --- Subject Tabs Builder ---
  function buildSubjectTabs() {
    if (!elements.subjectTabs) return;
    elements.subjectTabs.innerHTML = "";
    if (elements.subjectSelect) elements.subjectSelect.innerHTML = "";

    SUBJECTS.forEach((subject) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `arena-subject-pill ${subject.key === state.activeSubject ? "is-active" : ""}`;
      btn.innerHTML = `<i class="fa-solid ${subject.icon}"></i> <span>${escapeHtml(subject.label)}</span>`;
      btn.dataset.subject = subject.key;

      btn.addEventListener("click", async () => {
        if (state.activeSubject === subject.key) return;
        state.activeSubject = subject.key;
        syncSubjectPills();
        await loadSubjectData(subject.key);
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
      elements.subjectSelect.addEventListener("change", async (e) => {
        state.activeSubject = e.target.value;
        syncSubjectPills();
        await loadSubjectData(state.activeSubject);
      });
    }
  }

  function syncSubjectPills() {
    if (elements.subjectTabs) {
      elements.subjectTabs.querySelectorAll(".arena-subject-pill").forEach((pill) => {
        pill.classList.toggle("is-active", pill.dataset.subject === state.activeSubject);
      });
    }
    if (elements.subjectSelect && elements.subjectSelect.value !== state.activeSubject) {
      elements.subjectSelect.value = state.activeSubject;
    }
  }

  // --- Main Data Loaders ---
  async function loadProjectedData() {
    if (elements.projectedStatus) elements.projectedStatus.style.display = "block";
    try {
      const rows = await fetchTopProjected();
      state.projectedRows = rows;
      if (elements.projectedStatus) elements.projectedStatus.style.display = "none";

      if (state.activeMode === "projected") {
        renderPodium(rows, false);
        renderRoster(rows, false);
      }

      // Backward compatibility table rendering
      if (elements.projectedBody) {
        elements.projectedBody.innerHTML = rows.map((r, i) => `
          <tr>
            <td>#${r.rank || i + 1}</td>
            <td>${escapeHtml(r.username)}</td>
            <td>${r.projected_score} / 400</td>
          </tr>
        `).join("");
      }
    } catch (e) {
      console.error("[leaderboard] projected load error:", e);
      if (elements.projectedStatus) elements.projectedStatus.textContent = "Could not load rankings.";
    }

    try {
      const [myRank, myComp] = await Promise.allSettled([
        fetchMyProjectedRank(),
        fetchMyComparison(),
      ]);
      if (myRank.status === "fulfilled") state.myProjectedRank = myRank.value;
      if (myComp.status === "fulfilled") state.myComparison = myComp.value;
    } catch (_e) {}

    updateStickyHud();
  }

  async function loadSubjectData(subjectKey) {
    const subjObj = SUBJECTS.find((s) => s.key === subjectKey);
    const subjName = subjObj ? subjObj.label : subjectKey.toUpperCase();

    if (state.initialLoadDone && window.ThinkRightLoader?.ribbonStart) {
      window.ThinkRightLoader.ribbonStart();
    }

    if (elements.podiumHeading) elements.podiumHeading.textContent = `Top Performers: ${subjName}`;
    if (elements.podiumSubheading) elements.podiumSubheading.textContent = `Highest 3-test average scores in ${subjName} this week`;
    if (elements.rosterTitle) elements.rosterTitle.textContent = `${subjName} Rankings`;

    if (elements.subjectStatus) elements.subjectStatus.style.display = "block";

    try {
      const rows = await fetchTopSubject(subjectKey);
      state.subjectRows = rows;
      if (elements.subjectStatus) elements.subjectStatus.style.display = "none";

      renderPodium(rows, true);
      renderRoster(rows, true);

      // Backward compatibility table rendering
      if (elements.subjectBody) {
        elements.subjectBody.innerHTML = rows.map((r, i) => `
          <tr>
            <td>#${r.rank || i + 1}</td>
            <td>${escapeHtml(r.username)}</td>
            <td>${Number(r.best3_average || 0).toFixed(1)}%</td>
          </tr>
        `).join("");
      }
    } catch (e) {
      console.error("[leaderboard] subject load error:", e);
      if (elements.subjectStatus) elements.subjectStatus.textContent = "Could not load subject rankings.";
    }

    try {
      state.mySubjectRank = await fetchMySubjectRank(subjectKey);
    } catch (_e) {}

    updateStickyHud();
    if (state.initialLoadDone && window.ThinkRightLoader?.ribbonDone) {
      window.ThinkRightLoader.ribbonDone();
    }
  }

  // --- Initialization ---
  async function initLeaderboard() {
    showLeaderboardLoader(true, 15, "Connecting to UTME Arena...");

    try {
      await waitForAuthBootstrap();
      setLoaderProgress(35, "Reading candidate credentials...");

      const user = typeof getCurrentUser === "function" ? await getCurrentUser() : null;
      state.user = user;

      setLoaderProgress(55, "Calculating live weekly season...");
      state.weekId = await fetchCurrentWeekId();
      if (elements.weekLabel) elements.weekLabel.textContent = `Week: ${state.weekId}`;

      setupCountdownTimer();
      buildSubjectTabs();
      setupModeSwitcher();
      setupModals();

      setLoaderProgress(75, "Loading top contenders...");
      await loadProjectedData();

      setLoaderProgress(100, "Arena ready!");
      state.initialLoadDone = true;
      showLeaderboardLoader(false);
    } catch (err) {
      console.error("[leaderboard] init fatal error:", err);
      showLeaderboardLoader(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeaderboard);
  } else {
    initLeaderboard();
  }
})();
