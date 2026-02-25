/*
 * THINKRIGHT - Onboarding + Recommendations
 *
 * Runs once after signup/first login:
 * - Collects class level, track, and optional goal
 * - Saves to public.user_profiles and sets onboarding_completed = true
 * - Shows a one-time product intro modal (dismissible) and persists has_seen_product_onboarding = true
 * - Renders "Recommended subjects for you" on Home/Dashboard
 *
 * This is UI-only + profile persistence; does not modify auth/payment/test flows.
 */

(function () {
  const PROFILE_TABLE = "user_profiles";

  const CLASS_LEVELS = ["SS1", "SS2", "SS3", "Other"];
  const TRACKS = ["Science", "Art", "Commercial", "Undecided"];
  const GOALS = [
    "Medicine / Health",
    "Engineering / Tech",
    "Law",
    "Business / Accounting",
    "Economics / Social Sciences",
    "Arts / Humanities",
    "Not sure",
  ];

  const PRODUCT_ONBOARDING_STEPS = [
    {
      title: "Take a test",
      description: "Pick any subject and complete a timed practice test in minutes.",
    },
    {
      title: "Get your projected JAMB score",
      description: "See your calibrated estimate update as your weekly performance improves.",
    },
    {
      title: "Compete on the leaderboard",
      description: "Track your rank and compare progress with other serious learners.",
    },
  ];

  const SUBJECT_LABELS = {
    mathematics: "Mathematics",
    english: "Use of English",
    physics: "Physics",
    chemistry: "Chemistry",
    biology: "Biology",
    agriculture: "Agricultural Science",
    computer: "Computer Studies",
    crs: "Christian Religious Studies",
    irs: "Islamic Religious Studies",
    commerce: "Commerce",
    economics: "Economics",
    government: "Government",
    literature: "Literature in English",
    geography: "Geography",
    history: "History",
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getRecoHost() {
    return document.getElementById("tr-recommendations");
  }

  function isHomePage() {
    return document.body && document.body.classList.contains("page-home");
  }

  function isDashboardPage() {
    return document.body && document.body.classList.contains("page-dashboard");
  }

  function log(...args) {
    console.log("[onboarding]", ...args);
  }

  function warn(...args) {
    console.warn("[onboarding]", ...args);
  }

  function err(...args) {
    console.error("[onboarding]", ...args);
  }

  async function waitForSupabaseReady() {
    let tries = 0;
    while ((!window.authInitialized || !window.supabase) && tries < 50) {
      await sleep(100);
      tries++;
    }
    return !!window.supabase;
  }

  async function getUser() {
    if (typeof window.getCurrentUser !== "function") return null;
    try {
      return await window.getCurrentUser();
    } catch (e) {
      return null;
    }
  }

  async function fetchProfile(userId) {
    try {
      if (!window.supabase) return { profile: null, error: new Error("supabase missing") };

      const { data, error } = await window.supabase
        .from(PROFILE_TABLE)
        .select("id,email,username,is_premium,class_level,track,goal,onboarding_completed,has_seen_product_onboarding,updated_at,created_at")
        .eq("id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        return { profile: null, error };
      }
      return { profile: data || null, error: null };
    } catch (e) {
      return { profile: null, error: e };
    }
  }

  async function ensureProfileRow(user) {
    const { profile, error } = await fetchProfile(user.id);
    if (profile) return { profile, error: null };

    // If the table doesn't exist or is blocked by RLS, don't crash the app.
    if (error) {
      warn("Profile read failed:", error);
    }

    try {
      const username =
        user.user_metadata?.username ||
        user.user_metadata?.full_name ||
        user.email ||
        "ThinkRight User";

      const { error: insertError } = await window.supabase.from(PROFILE_TABLE).insert({
        id: user.id,
        email: (user.email || "").toLowerCase(),
        username: String(username).slice(0, 60),
        is_premium: false,
        onboarding_completed: false,
        has_seen_product_onboarding: false,
      });

      if (insertError && insertError.code !== "23505") {
        warn("Profile insert failed:", insertError);
      }
    } catch (e) {
      warn("Profile insert exception:", e);
    }

    // Try read again
    return await fetchProfile(user.id);
  }

  function localFallbackKey(userId) {
    return `tr_onboarding_completed_${userId}`;
  }

  function localProductOnboardingKey(userId) {
    return `tr_product_onboarding_seen_${userId}`;
  }

  function isOnboardingCompleted(profile, userId) {
    if (profile && profile.onboarding_completed === true) return true;
    try {
      return localStorage.getItem(localFallbackKey(userId)) === "1";
    } catch (e) {
      return false;
    }
  }

  function hasSeenProductOnboarding(profile, userId) {
    if (profile && profile.has_seen_product_onboarding === true) return true;
    try {
      return localStorage.getItem(localProductOnboardingKey(userId)) === "1";
    } catch (e) {
      return false;
    }
  }

  async function saveOnboarding(userId, payload) {
    // Best-effort DB persistence; local fallback prevents repeated prompts if DB is missing.
    try {
      if (!window.supabase) throw new Error("supabase missing");

      const { error } = await window.supabase
        .from(PROFILE_TABLE)
        .upsert(
          {
            id: userId,
            class_level: payload.class_level || null,
            track: payload.track || null,
            goal: payload.goal || null,
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (error) throw error;
    } catch (e) {
      warn("Failed to persist onboarding to DB (fallback to local only):", e);
      try {
        localStorage.setItem(localFallbackKey(userId), "1");
      } catch (err2) {
        // ignore
      }
    }
  }

  async function saveProductOnboardingSeen(userId) {
    try {
      if (!window.supabase) throw new Error("supabase missing");

      const { error } = await window.supabase
        .from(PROFILE_TABLE)
        .upsert(
          {
            id: userId,
            has_seen_product_onboarding: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (error) throw error;
    } catch (e) {
      warn("Failed to persist product onboarding flag to DB (fallback to local only):", e);
    } finally {
      try {
        localStorage.setItem(localProductOnboardingKey(userId), "1");
      } catch (err2) {
        // ignore
      }
    }
  }

  function normalizeTrack(track) {
    const t = (track || "").toString().trim().toLowerCase();
    if (t === "science") return "Science";
    if (t === "art" || t === "arts") return "Art";
    if (t === "commercial" || t === "commerce") return "Commercial";
    return "Undecided";
  }

  function recommendationsFromProfile(profile) {
    const track = normalizeTrack(profile?.track);
    const goal = (profile?.goal || "").toString().toLowerCase();

    // Base recommendations by track
    let subjects = [];
    if (track === "Science") {
      subjects = ["mathematics", "english", "physics", "chemistry", "biology"];
    } else if (track === "Art") {
      subjects = ["english", "literature", "government", "economics"];
    } else if (track === "Commercial") {
      subjects = ["mathematics", "english", "economics", "commerce", "government"];
    } else {
      subjects = ["english", "mathematics", "economics", "government"];
    }

    // Goal refinements (soft suggestions)
    const bumpToFront = (list) => {
      const seen = new Set();
      const out = [];
      list.forEach((s) => {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      });
      subjects.forEach((s) => {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      });
      subjects = out;
    };

    if (goal.includes("medicine") || goal.includes("health")) {
      bumpToFront(["biology", "chemistry", "physics", "mathematics", "english"]);
    } else if (goal.includes("engineer") || goal.includes("tech")) {
      bumpToFront(["physics", "mathematics", "chemistry", "english"]);
    } else if (goal === "law" || goal.includes("law")) {
      bumpToFront(["english", "government", "literature", "economics"]);
    } else if (goal.includes("business") || goal.includes("account")) {
      bumpToFront(["mathematics", "economics", "commerce", "english", "government"]);
    } else if (goal.includes("economics") || goal.includes("social")) {
      bumpToFront(["economics", "government", "mathematics", "english"]);
    } else if (goal.includes("arts") || goal.includes("human")) {
      bumpToFront(["literature", "english", "government", "economics"]);
    }

    // Only suggest from available subjects
    subjects = subjects.filter((s) => !!SUBJECT_LABELS[s]).slice(0, 5);

    return {
      track,
      subjects,
    };
  }

  function renderRecommendations(profile) {
    const host = getRecoHost();
    if (!host) return;

    const rec = recommendationsFromProfile(profile);
    if (!rec.subjects || rec.subjects.length === 0) return;

    const chips = rec.subjects
      .map(
        (key) =>
          `<button type="button" class="tr-reco-chip" data-subject="${key}">${SUBJECT_LABELS[key]}</button>`
      )
      .join("");

    host.innerHTML = `
      <div class="tr-recos-card">
        <div class="tr-recos-header">
          <div>
            <p class="eyebrow">Personalized</p>
            <h2>Recommended subjects for you</h2>
            <p class="tr-recos-subtitle">Based on your ${rec.track.toLowerCase()} track. You can still choose any subject.</p>
          </div>
        </div>
        <div class="tr-recos-chips" role="list">
          ${chips}
        </div>
      </div>
    `;

    host.hidden = false;

    host.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-subject]") : null;
      if (!btn) return;
      const subject = btn.getAttribute("data-subject");
      if (!subject) return;

      try {
        if (window.StorageManager && typeof window.StorageManager.setSelectedSubject === "function") {
          window.StorageManager.setSelectedSubject(subject);
        } else {
          localStorage.setItem("selected_subject", subject);
        }
      } catch (err2) {
        // ignore
      }

      // If we're on home, jump straight to test like the subject cards do.
      if (isHomePage()) {
        window.location.href = "test.html";
        return;
      }

      // On dashboard, navigate to home to choose a test (non-forcing suggestion).
      if (isDashboardPage()) {
        window.location.href = "index.html";
      }
    });
  }

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "tr-onboarding-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="tr-onboarding-dialog">
        <div class="tr-onboarding-header">
          <p class="eyebrow">Quick setup</p>
          <h2 id="trOnboardingTitle">Personalize your study plan</h2>
          <p class="tr-onboarding-subtitle">Answer 3 quick questions. This helps us suggest subjects, not restrict access.</p>
        </div>

        <div class="tr-onboarding-body">
          <div class="tr-onboarding-progress" aria-hidden="true">
            <span class="dot active" data-dot="1"></span>
            <span class="dot" data-dot="2"></span>
            <span class="dot" data-dot="3"></span>
          </div>

          <div class="tr-onboarding-step" data-step="1">
            <h3>What class are you in?</h3>
            <div class="tr-choice-grid" data-field="class_level">
              ${CLASS_LEVELS.map((v) => `<button type="button" class="tr-choice" data-value="${v}">${v}</button>`).join("")}
            </div>
          </div>

          <div class="tr-onboarding-step" data-step="2" hidden>
            <h3>What track best describes you?</h3>
            <div class="tr-choice-grid" data-field="track">
              ${TRACKS.map((v) => `<button type="button" class="tr-choice" data-value="${v}">${v}</button>`).join("")}
            </div>
          </div>

          <div class="tr-onboarding-step" data-step="3" hidden>
            <h3>Your main goal (optional)</h3>
            <label class="tr-field-label" for="trGoalSelect">Select a goal</label>
            <select id="trGoalSelect" class="tr-field-select">
              <option value="">Choose (optional)</option>
              ${GOALS.map((v) => `<option value="${v}">${v}</option>`).join("")}
            </select>
            <p class="tr-helper">You can leave this blank. Recommendations are suggestions only.</p>
          </div>

          <p class="tr-onboarding-error" id="trOnboardingError" hidden></p>
        </div>

        <div class="tr-onboarding-footer">
          <button type="button" class="tr-btn tr-btn-secondary" data-action="back" disabled>Back</button>
          <button type="button" class="tr-btn tr-btn-secondary" data-action="skip">Skip</button>
          <button type="button" class="tr-btn tr-btn-primary" data-action="next">Next</button>
        </div>
      </div>
    `;
    return modal;
  }

  async function runOnboarding(user, existingProfile) {
    const modal = createModal();
    document.body.appendChild(modal);

    const errorEl = modal.querySelector("#trOnboardingError");
    const steps = Array.from(modal.querySelectorAll(".tr-onboarding-step"));
    const dots = Array.from(modal.querySelectorAll(".tr-onboarding-progress .dot"));
    const backBtn = modal.querySelector('[data-action="back"]');
    const nextBtn = modal.querySelector('[data-action="next"]');
    const skipBtn = modal.querySelector('[data-action="skip"]');
    const goalSelect = modal.querySelector("#trGoalSelect");

    const state = {
      step: 1,
      class_level: existingProfile?.class_level || "",
      track: existingProfile?.track || "",
      goal: existingProfile?.goal || "",
    };

    function setError(msg) {
      if (!errorEl) return;
      if (!msg) {
        errorEl.hidden = true;
        errorEl.textContent = "";
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = msg;
    }

    function showStep(n) {
      state.step = n;
      steps.forEach((s) => {
        const sn = parseInt(s.getAttribute("data-step") || "0", 10);
        s.hidden = sn !== n;
      });
      dots.forEach((d) => {
        const dn = parseInt(d.getAttribute("data-dot") || "0", 10);
        d.classList.toggle("active", dn <= n);
      });
      if (backBtn) backBtn.disabled = n === 1;
      if (nextBtn) nextBtn.textContent = n === 3 ? "Finish" : "Next";
      setError("");
    }

    function setSelected(field, value) {
      if (field === "class_level") state.class_level = value;
      if (field === "track") state.track = value;
      modal.querySelectorAll(`.tr-choice-grid[data-field="${field}"] .tr-choice`).forEach((b) => {
        b.classList.toggle("selected", b.getAttribute("data-value") === value);
      });
    }

    // Preselect existing values
    if (state.class_level) setSelected("class_level", state.class_level);
    if (state.track) setSelected("track", state.track);
    if (goalSelect && state.goal) goalSelect.value = state.goal;

    modal.addEventListener("click", async (e) => {
      const choice = e.target && e.target.closest ? e.target.closest(".tr-choice") : null;
      if (choice) {
        const fieldWrap = choice.closest(".tr-choice-grid");
        const field = fieldWrap ? fieldWrap.getAttribute("data-field") : null;
        const value = choice.getAttribute("data-value");
        if (field && value) {
          setSelected(field, value);
        }
        return;
      }

      const actionBtn = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
      if (!actionBtn) return;

      const action = actionBtn.getAttribute("data-action");
      if (action === "back") {
        showStep(Math.max(1, state.step - 1));
        return;
      }

      if (action === "skip") {
        // Mark completed with minimal defaults to avoid re-prompting.
        const payload = {
          class_level: state.class_level || null,
          track: state.track || "Undecided",
          goal: (goalSelect && goalSelect.value) || null,
        };
        await saveOnboarding(user.id, payload);
        modal.remove();
        renderRecommendations(payload);
        return;
      }

      if (action === "next") {
        if (state.step === 1 && !state.class_level) {
          setError("Select your class level to continue.");
          return;
        }
        if (state.step === 2 && !state.track) {
          setError("Select a track to continue.");
          return;
        }
        if (state.step < 3) {
          showStep(state.step + 1);
          return;
        }

        // Finish
        const payload = {
          class_level: state.class_level,
          track: state.track,
          goal: (goalSelect && goalSelect.value) || null,
        };
        nextBtn.disabled = true;
        nextBtn.textContent = "Saving...";
        await saveOnboarding(user.id, payload);
        modal.remove();
        renderRecommendations(payload);
      }
    });

    // Prevent accidental close; only explicit skip/finish.
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        // keep open
      }
    });

    showStep(1);
  }

  function createProductOnboardingModal() {
    const modal = document.createElement("div");
    modal.className = "tr-product-onboarding-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "trProductOnboardingTitle");
    modal.innerHTML = `
      <div class="tr-product-onboarding-dialog">
        <button type="button" class="tr-product-onboarding-close" data-action="dismiss" aria-label="Close onboarding">&times;</button>
        <p class="eyebrow">Welcome to ThinkRight</p>
        <h2 id="trProductOnboardingTitle">Start in 3 quick steps</h2>
        <p class="tr-product-onboarding-subtitle">This quick walkthrough appears once per account.</p>
        <ol class="tr-product-onboarding-steps">
          ${PRODUCT_ONBOARDING_STEPS.map(
            (step, index) => `
              <li class="tr-product-onboarding-step">
                <span class="tr-product-onboarding-step-number">${index + 1}</span>
                <div class="tr-product-onboarding-step-copy">
                  <p class="tr-product-onboarding-step-title">${step.title}</p>
                  <p class="tr-product-onboarding-step-text">${step.description}</p>
                </div>
              </li>
            `
          ).join("")}
        </ol>
        <div class="tr-product-onboarding-footer">
          <button type="button" class="tr-btn tr-btn-primary" data-action="dismiss">Got it</button>
        </div>
      </div>
    `;
    return modal;
  }

  async function runProductOnboarding(user) {
    const modal = createProductOnboardingModal();
    document.body.appendChild(modal);

    let closed = false;
    const dismissBtn = modal.querySelector('[data-action="dismiss"].tr-btn');
    if (dismissBtn) {
      dismissBtn.focus();
    }

    const close = async () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown);
      await saveProductOnboardingSeen(user.id);
      modal.remove();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close().catch(() => null);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    modal.addEventListener("click", (event) => {
      const actionBtn = event.target && event.target.closest ? event.target.closest('[data-action="dismiss"]') : null;
      if (actionBtn || event.target === modal) {
        close().catch(() => null);
      }
    });
  }

  async function init() {
    try {
      if (!(isHomePage() || isDashboardPage())) return;
      const ready = await waitForSupabaseReady();
      if (!ready) return;

      const user = await getUser();
      if (!user) return;

      const ensured = await ensureProfileRow(user);
      if (ensured.error) {
        // Table might not exist; don't break the app.
        warn("Profile ensure error:", ensured.error);
      }

      let profile = ensured.profile;
      let renderRecoFromInit = true;

      if (!isOnboardingCompleted(profile, user.id)) {
        log("Starting onboarding modal for user:", user.id);
        await runOnboarding(user, profile);
        renderRecoFromInit = false;

        const refreshed = await fetchProfile(user.id);
        if (refreshed && refreshed.profile) {
          profile = refreshed.profile;
        }
      }

      // Already completed: render recommendations if we have data.
      if (renderRecoFromInit && profile) renderRecommendations(profile);

      if (!hasSeenProductOnboarding(profile, user.id)) {
        log("Starting product intro modal for user:", user.id);
        await runProductOnboarding(user);
      }
    } catch (e) {
      err("init failed:", e);
    }
  }

  window.ThinkRightOnboarding = {
    init,
    recommendationsFromProfile,
    runProductOnboarding,
  };

  document.addEventListener("DOMContentLoaded", () => {
    init().catch(() => null);
  });
})();
