(function () {
  const SUBJECTS = [
    { key: "english", label: "English" },
    { key: "mathematics", label: "Mathematics" },
    { key: "physics", label: "Physics" },
    { key: "chemistry", label: "Chemistry" },
    { key: "biology", label: "Biology" },
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
  };

  const elements = {
    weekLabel: document.getElementById("leaderboardWeekLabel"),
    projectedStatus: document.getElementById("projectedStatus"),
    projectedWrap: document.getElementById("projectedTableWrap"),
    projectedBody: document.getElementById("projectedBody"),
    projectedEmpty: document.getElementById("projectedEmpty"),
    myProjectedRank: document.getElementById("myProjectedRank"),
    subjectTabs: document.getElementById("subjectTabs"),
    subjectSelect: document.getElementById("subjectSelect"),
    subjectStatus: document.getElementById("subjectStatus"),
    subjectWrap: document.getElementById("subjectTableWrap"),
    subjectBody: document.getElementById("subjectBody"),
    subjectEmpty: document.getElementById("subjectEmpty"),
    mySubjectRank: document.getElementById("mySubjectRank"),
  };

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
    return String(subject || "")
      .trim()
      .toLowerCase();
  }

  function getMedal(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
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
    const { data, error } = await window.supabase.rpc("leaderboard_get_my_projected_rank", {
      p_week_id: state.weekId,
    });
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
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
    const { data, error } = await window.supabase.rpc("leaderboard_get_my_subject_rank", {
      p_subject: normalizeSubject(subjectKey),
      p_week_id: state.weekId,
    });
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  }

  async function loadProjectedSection() {
    if (elements.projectedStatus) elements.projectedStatus.textContent = "Loading projected rankings...";
    if (elements.projectedWrap) elements.projectedWrap.hidden = true;
    if (elements.projectedEmpty) elements.projectedEmpty.hidden = true;

    try {
      const [topRows, myRank] = await Promise.all([fetchTopProjected(), fetchMyProjectedRank()]);
      console.log("[leaderboard] top projected rows:", topRows.length);

      if (topRows.length === 0) {
        if (elements.projectedStatus) elements.projectedStatus.textContent = "";
        if (elements.projectedEmpty) elements.projectedEmpty.hidden = false;
      } else {
        renderProjectedRows(topRows);
        if (elements.projectedStatus) elements.projectedStatus.textContent = "";
        if (elements.projectedWrap) elements.projectedWrap.hidden = false;
      }

      renderSelfRank(
        elements.myProjectedRank,
        myRank,
        "You need at least 3 completed tests this week to appear."
      );
    } catch (error) {
      console.error("[leaderboard] projected section load error:", error);
      if (elements.projectedStatus) {
        elements.projectedStatus.textContent = "Unable to load projected leaderboard right now.";
      }
      renderSelfRank(elements.myProjectedRank, null, "Unable to load your position right now.");
    }
  }

  async function loadSubjectSection(subjectKey) {
    const normalized = normalizeSubject(subjectKey);
    state.activeSubject = normalized;
    syncSubjectControls(null);

    if (elements.subjectStatus) elements.subjectStatus.textContent = "Loading subject rankings...";
    if (elements.subjectWrap) elements.subjectWrap.hidden = true;
    if (elements.subjectEmpty) elements.subjectEmpty.hidden = true;

    try {
      const [topRows, myRank] = await Promise.all([
        fetchTopSubject(normalized),
        fetchMySubjectRank(normalized),
      ]);
      console.log("[leaderboard] top subject rows:", normalized, topRows.length);

      if (topRows.length === 0) {
        if (elements.subjectStatus) elements.subjectStatus.textContent = "";
        if (elements.subjectEmpty) elements.subjectEmpty.hidden = false;
      } else {
        renderSubjectRows(topRows);
        if (elements.subjectStatus) elements.subjectStatus.textContent = "";
        if (elements.subjectWrap) elements.subjectWrap.hidden = false;
      }

      renderSelfRank(
        elements.mySubjectRank,
        myRank,
        "You need at least 2 completed tests in this subject this week to appear."
      );
    } catch (error) {
      console.error("[leaderboard] subject section load error:", error);
      if (elements.subjectStatus) {
        elements.subjectStatus.textContent = "Unable to load subject leaderboard right now.";
      }
      renderSelfRank(elements.mySubjectRank, null, "Unable to load your subject position right now.");
    }
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
    state.weekId = await fetchCurrentWeekId();
    setWeekLabel(state.weekId);

    buildSubjectTabs();
    await Promise.all([loadProjectedSection(), loadSubjectSection(state.activeSubject)]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeaderboard);
  } else {
    initLeaderboard();
  }
})();
