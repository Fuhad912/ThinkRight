/**
 * THINKRIGHT - PRACTICE GROUND ENHANCEMENTS (js/practice.js)
 * 
 * Provides interactive enhancements for practice.html:
 * - Standout Merged Spotlight Hub (Target Faculty Combos + Recommended Drills)
 * - Surprise Speed Drill picking strictly from Recommended / Target track subjects
 * - Category stream filters (All, Sciences, Commercial, Arts)
 * - Real-time keyword search
 * - Dynamic personalized greeting
 * - Micro-celebrations via canvas-confetti
 * 
 * 100% Font Awesome 6 icons, zero Lucide dependencies.
 */

(function () {
  "use strict";

  const SUBJECT_META = {
    mathematics: { name: "Mathematics", icon: "fa-calculator", color: "#2563eb" },
    english: { name: "Use of English", icon: "fa-book-open", color: "#7c3aed" },
    biology: { name: "Biology", icon: "fa-dna", color: "#059669" },
    physics: { name: "Physics", icon: "fa-atom", color: "#d97706" },
    chemistry: { name: "Chemistry", icon: "fa-flask-vial", color: "#dc2626" },
    economics: { name: "Economics", icon: "fa-chart-line", color: "#0891b2" },
    government: { name: "Government", icon: "fa-landmark-dome", color: "#4f46e5" },
    literature: { name: "Literature in English", icon: "fa-feather-pointed", color: "#9333ea" },
    commerce: { name: "Commerce", icon: "fa-cart-shopping", color: "#ca8a04" },
    agriculture: { name: "Agricultural Science", icon: "fa-wheat-awn", color: "#16a34a" },
    geography: { name: "Geography", icon: "fa-earth-africa", color: "#0284c7" },
    crs: { name: "Christian Rel. Studies", icon: "fa-cross", color: "#6366f1" },
    irs: { name: "Islamic Rel. Studies", icon: "fa-moon", color: "#10b981" },
    history: { name: "History", icon: "fa-monument", color: "#b45309" },
    computer: { name: "Computer Studies", icon: "fa-laptop-code", color: "#0d9488" }
  };

  const FACULTY_COMBOS = {
    medicine: {
      name: "Medicine & Health",
      subjects: ["english", "biology", "chemistry", "physics"],
      subtitle: "Medicine, Nursing, Pharmacy & Anatomy"
    },
    engineering: {
      name: "Engineering & Tech",
      subjects: ["english", "mathematics", "physics", "chemistry"],
      subtitle: "Mechanical, Electrical, Computer & Civil"
    },
    law: {
      name: "Law & Arts",
      subjects: ["english", "literature", "government", "crs"],
      subtitle: "Law, Mass Comm & Humanities"
    },
    commercial: {
      name: "Business & Finance",
      subjects: ["english", "economics", "commerce", "mathematics"],
      subtitle: "Accounting, Business Admin & Economics"
    }
  };

  const STREAM_MAP = {
    all: null, // show all
    sciences: ["mathematics", "physics", "chemistry", "biology", "agriculture", "computer"],
    commercial: ["economics", "commerce", "government", "geography"],
    arts: ["english", "literature", "crs", "irs", "history"]
  };

  let activeStream = "all";
  let activeCombo = null;
  let searchQuery = "";

  function initPracticePage() {
    setupPersonalizedGreeting();
    setupFacultyComboPresets();
    renderCuratedRail();
    setupStreamTabs();
    setupSearchFilter();
    setupRandomDrillButton();
  }

  // 1. Personalized Greeting
  function setupPersonalizedGreeting() {
    const greetingEl = document.getElementById("practiceGreetingTitle");
    if (!greetingEl) return;

    function updateGreeting(name) {
      if (name) {
        greetingEl.textContent = `Ready for today's test drill, ${name}?`;
      } else {
        greetingEl.textContent = "Ready for today's test drill?";
      }
    }

    // Check supabase session if available
    if (window.supabase && typeof window.supabase.auth?.getSession === "function") {
      window.supabase.auth.getSession().then(({ data }) => {
        const user = data?.session?.user;
        if (user) {
          const name = user.user_metadata?.username
            || user.user_metadata?.full_name
            || (user.email ? user.email.split("@")[0] : null);
          updateGreeting(name);
        }
      }).catch(() => {});
    }
  }

  // 2. Helper to determine the Recommended Subject Pool
  function getRecommendedSubjectKeys() {
    // A: If active faculty combo is selected by user
    if (activeCombo && FACULTY_COMBOS[activeCombo]) {
      return FACULTY_COMBOS[activeCombo].subjects;
    }

    // B: Check onboarding profile in storage
    try {
      const profileRaw = localStorage.getItem("thinkright_onboarding_profile") || localStorage.getItem("profile");
      if (profileRaw) {
        const profile = typeof profileRaw === "string" ? JSON.parse(profileRaw) : profileRaw;
        if (window.ThinkRightOnboarding && typeof window.ThinkRightOnboarding.recommendationsFromProfile === "function") {
          const rec = window.ThinkRightOnboarding.recommendationsFromProfile(profile);
          if (rec && rec.subjects && rec.subjects.length) {
            return rec.subjects;
          }
        }
      }
    } catch (_e) {}

    // C: Default to Medicine & Health combo (core high-yield UTME track)
    return FACULTY_COMBOS.medicine.subjects;
  }

  // 3. Merged Standout Spotlight Hub: Curated Quick Launcher Rail
  function renderCuratedRail() {
    const container = document.getElementById("practiceCuratedChips");
    const titleEl = document.getElementById("practiceCuratedTitle");
    if (!container) return;

    const keys = getRecommendedSubjectKeys();
    let label = "Recommended 4:";
    if (activeCombo && FACULTY_COMBOS[activeCombo]) {
      label = `${FACULTY_COMBOS[activeCombo].name} Target:`;
    }
    if (titleEl) {
      titleEl.textContent = label;
    }

    container.innerHTML = keys
      .map((key) => {
        const meta = SUBJECT_META[key] || { name: key, icon: "fa-book", color: "#2563eb" };
        return `
          <button type="button" class="practice-curated-pill" data-subject="${key}" title="Launch quick drill in ${meta.name}">
            <span class="practice-curated-pill__icon" style="color: ${meta.color};"><i class="fa-solid ${meta.icon}"></i></span>
            <span class="practice-curated-pill__name">${meta.name}</span>
            <span class="practice-curated-pill__action">Drill <i class="fa-solid fa-arrow-right"></i></span>
          </button>
        `;
      })
      .join("");

    // Attach 1-click test launcher to each pill
    container.querySelectorAll(".practice-curated-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const subject = pill.getAttribute("data-subject");
        if (!subject) return;

        const card = document.querySelector(`.subject-card[data-subject="${subject}"]`);
        if (card) {
          card.classList.add("is-combo-highlighted");
        }

        if (typeof window.showTestConfirmationModal === "function") {
          window.showTestConfirmationModal(subject, { sourceCard: card || pill });
        } else if (card) {
          card.click();
        }
      });
    });
  }

  // 4. Faculty Combination Shortcuts (Merged into Spotlight Hub)
  function setupFacultyComboPresets() {
    const presetChips = document.querySelectorAll(".faculty-preset-chip");
    if (!presetChips.length) return;

    presetChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const comboKey = chip.getAttribute("data-combo");

        if (activeCombo === comboKey) {
          // Toggle off
          activeCombo = null;
          chip.classList.remove("is-active");
          clearComboHighlights();
          renderCuratedRail();
          return;
        }

        // Set active
        activeCombo = comboKey;
        presetChips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");

        applyComboHighlights(comboKey);
        renderCuratedRail();

        const comboInfo = FACULTY_COMBOS[comboKey];
        if (comboInfo) {
          showToast(`Target Faculty: ${comboInfo.name} active (${comboInfo.subjects.length} subjects highlighted)`);
        }
      });
    });
  }

  function clearComboHighlights() {
    const cards = document.querySelectorAll(".subject-card");
    cards.forEach((card) => card.classList.remove("is-combo-highlighted"));
  }

  function applyComboHighlights(comboKey) {
    clearComboHighlights();
    const combo = FACULTY_COMBOS[comboKey];
    if (!combo) return;

    const cards = document.querySelectorAll(".subject-card");
    cards.forEach((card) => {
      const subject = (card.getAttribute("data-subject") || "").toLowerCase().trim();
      if (combo.subjects.includes(subject)) {
        card.classList.add("is-combo-highlighted");
      }
    });
  }

  // 5. Category Stream Tabs Filter
  function setupStreamTabs() {
    const tabs = document.querySelectorAll(".practice-stream-tab");
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const stream = tab.getAttribute("data-stream") || "all";
        if (activeStream === stream) return;

        activeStream = stream;
        tabs.forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");

        applyCardFilters();
      });
    });
  }

  // 6. Live Search Filter
  function setupSearchFilter() {
    const searchInput = document.getElementById("practiceSearchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", (e) => {
      searchQuery = (e.target.value || "").toLowerCase().trim();
      applyCardFilters();
    });
  }

  function applyCardFilters() {
    const cards = document.querySelectorAll(".subject-card");
    const allowedInStream = STREAM_MAP[activeStream];
    let visibleCount = 0;

    cards.forEach((card) => {
      const subject = (card.getAttribute("data-subject") || "").toLowerCase().trim();
      const title = (card.querySelector("h3")?.textContent || "").toLowerCase();
      const snippet = (card.querySelector(".subject-topic-snippet")?.textContent || "").toLowerCase();

      const matchesStream = !allowedInStream || allowedInStream.includes(subject);
      const matchesSearch = !searchQuery || title.includes(searchQuery) || snippet.includes(searchQuery) || subject.includes(searchQuery);

      if (matchesStream && matchesSearch) {
        card.classList.remove("is-hidden");
        visibleCount++;
      } else {
        card.classList.add("is-hidden");
      }
    });

    const countBadge = document.getElementById("practiceCountBadge");
    if (countBadge) {
      countBadge.textContent = `${visibleCount} Subject${visibleCount !== 1 ? "s" : ""}`;
    }
  }

  // 7. Surprise Speed Drill Button (Picks strictly from Recommended Subjects)
  function setupRandomDrillButton() {
    const randomBtn = document.getElementById("practiceRandomBtn");
    if (!randomBtn) return;

    randomBtn.addEventListener("click", () => {
      // Strictly pick from recommended pool
      const recommendedKeys = getRecommendedSubjectKeys();
      if (!recommendedKeys.length) return;

      const chosenKey = recommendedKeys[Math.floor(Math.random() * recommendedKeys.length)];
      const meta = SUBJECT_META[chosenKey] || { name: chosenKey, icon: "fa-book" };
      const targetCard = document.querySelector(`.subject-card[data-subject="${chosenKey}"]`);

      showToast(`🎯 Speed Drill: ${meta.name} chosen from your recommended track!`);

      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        targetCard.classList.add("is-combo-highlighted");
      }

      setTimeout(() => {
        if (typeof window.showTestConfirmationModal === "function") {
          window.showTestConfirmationModal(chosenKey, { sourceCard: targetCard || randomBtn });
        } else if (targetCard) {
          targetCard.click();
        }
      }, 350);
    });
  }

  // Toast Notification Helper
  function showToast(message) {
    let toast = document.getElementById("practiceActionToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "practiceActionToast";
      toast.className = "tr-toast";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid fa-crosshairs" style="color: #2563eb;"></i> <span>${message}</span>`;
    toast.classList.add("is-visible");

    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3200);
  }

  window.ThinkRightPractice = {
    getRecommendedSubjectKeys,
    renderCuratedRail,
    showToast
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPracticePage);
  } else {
    initPracticePage();
  }
})();
