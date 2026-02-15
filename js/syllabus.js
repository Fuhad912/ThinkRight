/**
 * ThinkRight Syllabus Page
 * Single-source gating via window.ThinkRightEntitlements.canViewSyllabus(...)
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

  const FALLBACK_FREE_SUBJECTS = new Set(["english", "math"]);

  document.addEventListener("DOMContentLoaded", initSyllabusPage);

  async function initSyllabusPage() {
    try {
      setSyllabusEntitlementLoading(true);
      animatePageLoad();

      const user = await checkAuth();
      if (!user) return;

      const entitlement = await getEntitlement(user.id);
      const entitlementFlags = {
        isPremium: entitlement.isPremium === true,
        isAdmin: entitlement.isAdmin === true,
      };

      logDev("entitlement loaded", {
        user_id: user.id,
        isPremium: entitlementFlags.isPremium,
        isAdmin: entitlementFlags.isAdmin,
      });

      initSyllabusButtons(entitlementFlags);
    } catch (error) {
      console.error("Syllabus initialization failed:", error);
      initSyllabusButtons({ isPremium: false, isAdmin: false });
    } finally {
      setSyllabusEntitlementLoading(false);
    }
  }

  async function checkAuth() {
    try {
      let retries = 0;
      while (!window.authInitialized && retries < 30) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries += 1;
      }

      if (typeof window.getCurrentUser !== "function") {
        window.location.href =
          "login.html?next=" + encodeURIComponent(window.location.pathname);
        return null;
      }

      const user = await window.getCurrentUser();
      if (!user) {
        window.location.href =
          "login.html?next=" + encodeURIComponent(window.location.pathname);
        return null;
      }

      return user;
    } catch (error) {
      console.error("Auth check failed:", error);
      window.location.href =
        "login.html?next=" + encodeURIComponent(window.location.pathname);
      return null;
    }
  }

  async function getEntitlement(userId) {
    if (window.Subscription && typeof window.Subscription.init === "function") {
      await window.Subscription.init().catch(() => null);
    }
    if (
      window.Subscription &&
      typeof window.Subscription.ensureSubscriptionValid === "function"
    ) {
      await window.Subscription.ensureSubscriptionValid().catch(() => null);
    }

    if (
      window.ThinkRightEntitlements &&
      typeof window.ThinkRightEntitlements.fetchSyllabusEntitlement ===
        "function"
    ) {
      try {
        return await window.ThinkRightEntitlements.fetchSyllabusEntitlement({
          supabase: window.supabase,
          userId,
        });
      } catch (error) {
        console.warn("Entitlement fetch failed, using subscription fallback:", error);
      }
    }

    const subscriptionPlanRaw =
      (window.Subscription && typeof window.Subscription.getSubscription === "function"
        ? window.Subscription.getSubscription()?.plan
        : "") || "";
    const subscriptionPlan = subscriptionPlanRaw.toString().trim().toLowerCase();

    return {
      isPremium:
        window.Subscription && typeof window.Subscription.isPremium === "function"
          ? window.Subscription.isPremium() === true
          : false,
      isAdmin: subscriptionPlan === "admin",
    };
  }

  function setSyllabusEntitlementLoading(isLoading) {
    const loader = document.getElementById("syllabusEntitlementLoader");
    const grid = document.querySelector(".syllabus-grid");
    const buttons = document.querySelectorAll(".view-btn");

    if (loader) {
      loader.hidden = !isLoading;
      loader.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    if (grid) {
      grid.classList.toggle("is-entitlement-loading", isLoading);
    }

    buttons.forEach((button) => {
      const defaultLabel =
        button.dataset.defaultLabel || button.textContent.trim() || "View Syllabus";
      button.dataset.defaultLabel = defaultLabel;
      button.disabled = isLoading;
      button.style.cursor = isLoading ? "wait" : "";
      button.textContent = isLoading ? "Checking access..." : defaultLabel;
    });
  }

  function initSyllabusButtons(entitlement) {
    const buttons = document.querySelectorAll(".view-btn");

    buttons.forEach((button) => {
      const card = button.closest(".syllabus-item");
      const subjectName =
        card && card.querySelector("h3")
          ? card.querySelector("h3").textContent.trim()
          : "";
      const normalizedSubject =
        window.ThinkRightEntitlements &&
        typeof window.ThinkRightEntitlements.normalizeSubject === "function"
          ? window.ThinkRightEntitlements.normalizeSubject(subjectName)
          : normalizeSubjectFallback(subjectName);

      let canView = false;
      if (
        window.ThinkRightEntitlements &&
        typeof window.ThinkRightEntitlements.canViewSyllabus === "function"
      ) {
        canView = window.ThinkRightEntitlements.canViewSyllabus({
          subjectName,
          isPremium: entitlement.isPremium === true,
          isAdmin: entitlement.isAdmin === true,
        });
      } else {
        canView =
          FALLBACK_FREE_SUBJECTS.has(normalizedSubject) ||
          entitlement.isPremium === true ||
          entitlement.isAdmin === true;
      }

      button.dataset.subject = subjectName;
      button.dataset.canView = canView ? "true" : "false";

      logDev("subject gating", {
        subjectName,
        normalizedSubject,
        canView,
      });

      applyCardAccessState({ card, button, canView });
      bindViewClick(button);
    });

    logDev("render branch", "unlocked/locked per-card applied");
  }

  function applyCardAccessState({ card, button, canView }) {
    const defaultLabel = button.dataset.defaultLabel || "View Syllabus";

    if (!card) {
      button.textContent = canView ? defaultLabel : "Premium Only";
      return;
    }

    if (canView) {
      card.classList.remove("is-locked");
      button.textContent = defaultLabel;
      removeLockedOverlay(card);
      return;
    }

    card.classList.add("is-locked");
    button.textContent = "Premium Only";
    ensureLockedOverlay(card);
  }

  function ensureLockedOverlay(card) {
    let overlay = card.querySelector(".locked-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "locked-overlay";
      overlay.innerHTML =
        '<div class="locked-content">' +
        '<div class="lock-icon">🔒</div>' +
        '<div class="lock-text">Premium Required</div>' +
        '<div class="lock-subtext">Upgrade to access this syllabus</div>' +
        "</div>";
      card.appendChild(overlay);
    }
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
      const canView = button.dataset.canView === "true";

      if (canView) {
        logDev("view click", { subjectName, branch: "open" });
        openSyllabusFile(fileName);
        return;
      }

      logDev("view click", { subjectName, branch: "premium-only" });
      showPremiumOnlyPrompt();
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

  function showPremiumOnlyPrompt() {
    if (window.Subscription && typeof window.Subscription.showPricingModal === "function") {
      window.Subscription.showPricingModal();
      return;
    }

    if (window.Subscription && typeof window.Subscription.showPaywallModal === "function") {
      window.Subscription.showPaywallModal("syllabus");
      return;
    }

    alert("Premium only. Upgrade to access this syllabus.");
  }

  function normalizeSubjectFallback(name) {
    const normalized = (name || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    if (normalized === "english" || normalized === "use of english") return "english";
    if (normalized === "mathematics" || normalized === "math" || normalized === "maths") {
      return "math";
    }

    return normalized;
  }

  function animatePageLoad() {
    const syllabusItems = document.querySelectorAll(".syllabus-item");
    const welcomeSection = document.querySelector(".welcome-section");

    if (typeof window.gsap === "undefined" || !syllabusItems.length) return;

    if (welcomeSection) {
      window.gsap.fromTo(
        welcomeSection,
        { opacity: 0, y: -16 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );
    }

    window.gsap.fromTo(
      syllabusItems,
      { opacity: 0, y: 16 },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.06,
        ease: "power2.out",
        delay: 0.12,
      }
    );
  }
})();
