/**
 * ThinkRight Syllabus Page Controller (js/syllabus.js)
 * - Instant preloader synchronization & optimistic rendering
 * - Stream filter tabs (All 15, Sciences, Commercial, Arts)
 * - Quick high-yield topic chips & live search integration
 * - Direct PDF viewer launcher + one-click Practice test modal trigger
 */
(function () {
  "use strict";

  const DEV_MODE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.search.includes("debugEntitlements=1");

  const logDev = (...args) => {
    if (DEV_MODE) {
      console.log("[syllabus]", ...args);
    }
  };

  let activeStream = "all";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSyllabusPage);
  } else {
    initSyllabusPage();
  }

  async function initSyllabusPage() {
    try {
      // 1. Bind all interactive controls immediately so UI is responsive right away
      initSyllabusButtons();
      initPracticeButtons();
      initStreamFilterTabs();
      initQuickTopicChips();
      animatePageLoad();
    } catch (error) {
      console.error("Syllabus UI setup error:", error);
    } finally {
      // Release universal loader immediately so page reveals without network lag
      window.ThinkRightLoader?.done("Syllabus ready");
    }

    // 2. Non-blocking background auth check
    checkAuthInBackground();
  }

  async function checkAuthInBackground() {
    try {
      if (!window.authInitialized && typeof window.initSupabase === "function") {
        try { window.initSupabase(); } catch (_) {}
      }

      let retries = 0;
      while (!window.authInitialized && retries < 25) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        retries += 1;
      }

      if (typeof window.getCurrentUser === "function") {
        const user = await window.getCurrentUser();
        if (!user) {
          // Allow guests with cached session or redirect if strictly unauthenticated
          const hasCachedUser = Boolean(localStorage.getItem("thinkright_username"));
          if (!hasCachedUser) {
            window.location.href =
              "login.html?next=" + encodeURIComponent(window.location.pathname);
          }
        }
      }
    } catch (error) {
      console.warn("Syllabus background auth check notice:", error);
    }
  }

  function setButtonDefaultMarkup(button) {
    if (!button) return;
    if (!button.querySelector("i")) {
      button.innerHTML =
        '<i class="fa-solid fa-file-pdf"></i><span>Open Syllabus PDF</span>';
    }
  }

  function initSyllabusButtons() {
    const buttons = document.querySelectorAll(".view-btn");

    buttons.forEach((button) => {
      const card = button.closest(".syllabus-item");
      const subjectName =
        card && card.querySelector("h3")
          ? card.querySelector("h3").textContent.trim()
          : "";

      button.dataset.subject = subjectName;
      button.dataset.canView = "true";

      applyCardAccessState({ card, button });
      bindViewClick(button);
    });

    logDev("render branch", "all syllabi unlocked");
  }

  function applyCardAccessState({ card, button }) {
    setButtonDefaultMarkup(button);
    if (!card) return;
    card.classList.remove("is-locked");
    removeLockedOverlay(card);
  }

  function removeLockedOverlay(card) {
    const overlay = card.querySelector(".locked-overlay");
    if (overlay) {
      overlay.remove();
    }
  }

  function bindViewClick(button) {
    if (button.dataset.boundClick === "true") return;

    button.dataset.boundClick = "true";
    button.addEventListener("click", () => {
      const subjectName = button.dataset.subject || "";
      const fileName = button.getAttribute("data-file") || "";

      logDev("view click", { subjectName, branch: "open" });
      openSyllabusFile(fileName);
    });
  }

  function openSyllabusFile(fileName) {
    if (!fileName) {
      console.error("Missing syllabus file name");
      return;
    }

    const pdfPath = `assets/syllabus/${fileName}`;
    const win = window.open(pdfPath, "_blank", "noopener");

    if (win) return;

    // Fallback when popups are blocked.
    const link = document.createElement("a");
    link.href = pdfPath;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function initPracticeButtons() {
    const practiceBtns = document.querySelectorAll(".syllabus-practice-btn");
    practiceBtns.forEach((btn) => {
      if (btn.dataset.boundPractice === "true") return;
      btn.dataset.boundPractice = "true";

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const rawSubject = btn.getAttribute("data-practice-subject") || "";
        const subject =
          typeof window.normalizeSubject === "function"
            ? window.normalizeSubject(rawSubject)
            : rawSubject;

        if (!subject) {
          window.location.href = "practice.html";
          return;
        }

        // Trigger the ThinkRight test confirmation modal directly if available
        if (typeof window.showTestConfirmationModal === "function") {
          window.showTestConfirmationModal(subject, {
            sourceCard: btn.closest(".syllabus-item") || btn,
          });
          return;
        }

        // Fallback: save selected subject and open test
        if (
          window.StorageManager &&
          typeof window.StorageManager.setSelectedSubject === "function"
        ) {
          window.StorageManager.setSelectedSubject(subject);
        } else {
          localStorage.setItem("selected_subject", subject);
        }
        window.location.href = "test.html";
      });
    });
  }

  function initStreamFilterTabs() {
    const tabs = document.querySelectorAll(".syllabus-stream-tab");
    const searchInput = document.getElementById("tr-syllabus-topic-search");
    const clearBtn = document.getElementById("syllabusSearchClearBtn");
    const resetBtn = document.getElementById("syllabusResetFiltersBtn");

    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const stream = tab.getAttribute("data-stream") || "all";
        activeStream = stream;

        tabs.forEach((t) => {
          const isCurrent = t === tab;
          t.classList.toggle("is-active", isCurrent);
          t.setAttribute("aria-selected", isCurrent ? "true" : "false");
        });

        applyStreamAndCountFilter();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        if (clearBtn) {
          clearBtn.hidden = !searchInput.value.trim();
        }
        syncQuickChipActiveState(searchInput.value.trim());
        // Wait a tick for navbar-search.js to update card.hidden, then sync count & stream
        window.setTimeout(applyStreamAndCountFilter, 20);
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearBtn.hidden = true;
        syncQuickChipActiveState("");
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.focus();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        activeStream = "all";
        tabs.forEach((t) => {
          const isAll = t.getAttribute("data-stream") === "all";
          t.classList.toggle("is-active", isAll);
          t.setAttribute("aria-selected", isAll ? "true" : "false");
        });

        if (searchInput) {
          searchInput.value = "";
          if (clearBtn) clearBtn.hidden = true;
          syncQuickChipActiveState("");
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        applyStreamAndCountFilter();
      });
    }
  }

  function initQuickTopicChips() {
    const chips = document.querySelectorAll(".syllabus-topic-filter-chip");
    const searchInput = document.getElementById("tr-syllabus-topic-search");
    const clearBtn = document.getElementById("syllabusSearchClearBtn");

    if (!chips.length || !searchInput) return;

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const topic = chip.getAttribute("data-topic-query") || "";
        const currentVal = searchInput.value.trim().toLowerCase();
        const isSame = currentVal === topic.toLowerCase();

        const nextVal = isSame ? "" : topic;
        searchInput.value = nextVal;
        if (clearBtn) {
          clearBtn.hidden = !nextVal;
        }
        syncQuickChipActiveState(nextVal);
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        window.setTimeout(applyStreamAndCountFilter, 350);
      });
    });
  }

  function syncQuickChipActiveState(query) {
    const q = (query || "").trim().toLowerCase();
    const chips = document.querySelectorAll(".syllabus-topic-filter-chip");
    chips.forEach((chip) => {
      const chipTopic = (chip.getAttribute("data-topic-query") || "")
        .trim()
        .toLowerCase();
      chip.classList.toggle("is-active", q !== "" && q === chipTopic);
    });
  }

  function applyStreamAndCountFilter() {
    const cards = document.querySelectorAll(".syllabus-item");
    const searchInput = document.getElementById("tr-syllabus-topic-search");
    const emptyState = document.getElementById("tr-syllabus-search-empty");
    const countBadge = document.getElementById("syllabusCountBadge");
    const q = searchInput ? searchInput.value.trim().toLowerCase() : "";

    let visibleCount = 0;

    cards.forEach((card) => {
      const cardStream = (card.getAttribute("data-stream") || "").toLowerCase();
      const cardSubject = (card.getAttribute("data-subject") || "").toLowerCase();

      // Use of English is compulsory across all JAMB streams
      const matchesStream =
        activeStream === "all" ||
        cardSubject === "english" ||
        cardStream.includes(activeStream);

      const titleText = card.querySelector("h3")?.textContent || "";
      const descText = card.querySelector(".syllabus-description")?.textContent || "";
      const pillsText = card.querySelector(".syllabus-topic-pills")?.textContent || "";
      const haystack = `${titleText} ${descText} ${pillsText}`.toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const shouldShow = matchesStream && matchesSearch;

      card.classList.toggle("is-stream-hidden", !matchesStream);
      card.hidden = !shouldShow;

      if (shouldShow) {
        visibleCount += 1;
      }
    });

    if (countBadge) {
      countBadge.textContent =
        visibleCount === 1
          ? "Showing 1 subject"
          : `Showing ${visibleCount} subjects`;
    }

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  function animatePageLoad() {
    const syllabusItems = document.querySelectorAll(".syllabus-item");
    const welcomeSection = document.querySelector(".welcome-section");

    if (typeof window.gsap === "undefined" || !syllabusItems.length) return;

    if (welcomeSection) {
      window.gsap.fromTo(
        welcomeSection,
        { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }
      );
    }

    window.gsap.fromTo(
      syllabusItems,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.35,
        stagger: 0.035,
        ease: "power2.out",
        delay: 0.06,
      }
    );
  }
})();
