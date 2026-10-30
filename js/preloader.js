/**
 * THINKRIGHT UNIVERSAL LOADER — Dynamic Theme + ThinkRight Header + Orbital Spinner
 * Dynamically matches the user's active light/dark theme and waits for page readiness.
 */
(function () {
  "use strict";

  var MIN_VISIBLE_MS = 240;
  var SAFETY_TIMEOUT_MS = 2500;
  var startedAt = performance.now();
  var safetyTimer = null;

  function resetSafetyTimer(ms) {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    var timeout = typeof ms === "number" ? ms : SAFETY_TIMEOUT_MS;
    safetyTimer = window.setTimeout(function () {
      if (!state.isClosed && !state.isClosing) {
        console.warn("[preloader] Safety timeout reached (" + timeout + "ms), dismissing loader.");
        done();
      }
    }, timeout);
  }

  var ASYNC_DATA_PAGES = {
    "": true,
    "index": true,
    "index.html": true,
    "dashboard": true,
    "dashboard.html": true,
    "leaderboard": true,
    "leaderboard.html": true,
    "test": true,
    "test.html": true,
    "my-classes": true,
    "my-classes.html": true,
    "my-cohorts": true,
    "my-cohorts.html": true,
    "classes": true,
    "classes.html": true,
    "cohort": true,
    "cohort.html": true,
    "profile": true,
    "profile.html": true,
    "syllabus": true,
    "syllabus.html": true,
    "tutor-dashboard": true,
    "tutor-dashboard.html": true,
    "tutor-classes": true,
    "tutor-classes.html": true,
    "tutor-class": true,
    "tutor-class.html": true,
    "tutor-students": true,
    "tutor-students.html": true,
    "tutor-analytics": true,
    "tutor-analytics.html": true,
    "tutor-discussions": true,
    "tutor-discussions.html": true,
    "tutor-payouts": true,
    "tutor-payouts.html": true,
    "tutor-onboarding": true,
    "tutor-onboarding.html": true,
    "admin": true,
    "admin.html": true
  };

  function isDashboardPage() {
    var rawLoc = ((window.location.pathname || "") + " " + (window.location.href || "")).toLowerCase();
    if (rawLoc.indexOf("tutor-dashboard") !== -1) return false;
    if (rawLoc.indexOf("dashboard") !== -1) return true;
    if (document.body && (document.body.classList.contains("page-dashboard") || document.body.classList.contains("dashboard-page"))) return true;
    return false;
  }

  function isTestPage() {
    var rawLoc = ((window.location.pathname || "") + " " + (window.location.href || "")).toLowerCase();
    if (rawLoc.indexOf("test") !== -1 && rawLoc.indexOf("teacher") === -1 && rawLoc.indexOf("tutor") === -1) return true;
    if (document.body && (document.body.classList.contains("page-test") || document.body.classList.contains("test-page"))) return true;
    return false;
  }

  function getCurrentPageName() {
    var raw = (window.location.pathname || "").toLowerCase().replace(/\/+$/, "");
    var path = raw.split("/").pop();
    if (!path) {
      if (isDashboardPage()) return "dashboard.html";
      if (isTestPage()) return "test.html";
      return "index.html";
    }
    return path;
  }

  function isDarkThemePreferred() {
    // 1. Check explicit DOM theme attribute if already set
    var docTheme = document.documentElement.getAttribute("data-theme");
    if (docTheme === "dark") return true;
    if (docTheme === "light") return false;

    // 2. Check body class if already set
    if (document.body) {
      if (
        document.body.classList.contains("tr-dark") ||
        document.body.classList.contains("dark")
      ) {
        return true;
      }
    }

    // 3. Check localStorage ("theme" is primary across student & teacher views)
    try {
      var primaryTheme = localStorage.getItem("theme");
      if (primaryTheme === "dark") return true;
      if (primaryTheme === "light") return false;

      var secondaryTheme = localStorage.getItem("thinkright_theme");
      if (secondaryTheme === "dark") return true;
      if (secondaryTheme === "light") return false;
    } catch (_e) {}

    return false;
  }

  var initialDark = isDarkThemePreferred();
  if (document.documentElement) {
    document.documentElement.setAttribute("data-theme", initialDark ? "dark" : "light");
  }

  var pageName = getCurrentPageName();
  var isDashboard = isDashboardPage();
  var isTest = isTestPage();
  var rawHref = (window.location.href || "");
  var hasOAuthError = rawHref.indexOf("error=") !== -1;
  var isOAuthRedirect = !hasOAuthError && (
    (window.location.hash && (window.location.hash.indexOf("access_token") !== -1 || window.location.hash.indexOf("refresh_token") !== -1)) ||
    (window.location.search && (window.location.search.indexOf("code=") !== -1 || window.location.search.indexOf("oauth=google") !== -1))
  );
  var isAsyncPage = isDashboard || isTest || isOAuthRedirect || Object.prototype.hasOwnProperty.call(ASYNC_DATA_PAGES, pageName);
  if (isOAuthRedirect) {
    SAFETY_TIMEOUT_MS = 16000;
  }

  // Only the test and dashboard pages show a loading progress bar.
  // Every other page keeps the clean spinner-only loader.
  var PROGRESS_PAGES = {
    "test": true,
    "test.html": true,
    "dashboard": true,
    "dashboard.html": true
  };
  var showsProgress = isDashboard || isTest || Object.prototype.hasOwnProperty.call(PROGRESS_PAGES, pageName);
  var isDashboardProgress = isDashboard || pageName === "dashboard" || pageName === "dashboard.html";
  var defaultStartLabel = isDashboardProgress
    ? "Preparing your dashboard..."
    : "Preparing your questions...";
  var defaultDoneLabel = isDashboardProgress
    ? "Dashboard ready"
    : "Questions ready";

  // Async data pages (Supabase queries, Chart.js rendering) need a safe, realistic timeout (20s)
  // so the loader is NEVER dissolved mid-load by an eager 2.2s safety timer!
  if (isAsyncPage || showsProgress) {
    SAFETY_TIMEOUT_MS = 20000;
  }

  var state = {
    loaderEl: null,
    holds: new Set(typeof isOAuthRedirect !== "undefined" && isOAuthRedirect ? ["oauth-authenticating"] : []),
    domReady: document.readyState !== "loading",
    isClosing: false,
    isClosed: false,
    themeObserver: null,
    progress: 0,
    trickleTimer: null
  };

  if (isAsyncPage) {
    state.holds.add("page-controller");
  }

  function getSpinnerMarkup() {
    return (
      '<div class="tr-loader-stack">' +
        '<div class="tr-loader-brand">ThinkRight<span>.</span></div>' +
        '<div class="tr-loader-spinner" aria-hidden="true">' +
          '<span class="tr-loader-spinner__core"></span>' +
        '</div>' +
      '</div>'
    );
  }

  function syncLoaderTheme() {
    var loader = state.loaderEl || document.getElementById("tr-preloader");
    if (!loader) return;
    var dark = isDarkThemePreferred();
    loader.classList.toggle("tr-preloader--dark", dark);
    loader.classList.toggle("tr-preloader--light", !dark);
    if (!document.documentElement.getAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    }
  }

  function ensureLoaderDOM() {
    if (!document.body) return;

    // Dynamically re-verify if page is dashboard or test once body is available
    if (!showsProgress && (isDashboardPage() || isTestPage())) {
      showsProgress = true;
      isDashboardProgress = isDashboardPage();
      defaultStartLabel = isDashboardProgress ? "Preparing your dashboard..." : "Preparing your questions...";
      defaultDoneLabel = isDashboardProgress ? "Dashboard ready" : "Questions ready";
      SAFETY_TIMEOUT_MS = 20000;
      state.holds.add("page-controller");
      resetSafetyTimer(20000);
    }

    var loader = document.getElementById("tr-preloader");
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "tr-preloader";
      loader.className = "tr-preloader";
      loader.setAttribute("role", "status");
      loader.setAttribute("aria-live", "polite");
      loader.setAttribute("aria-label", "Loading ThinkRight");
      document.body.insertBefore(loader, document.body.firstChild);
    }

    if (!loader.querySelector(".tr-loader-brand") || !loader.querySelector(".tr-loader-spinner")) {
      loader.innerHTML = getSpinnerMarkup();
    }

    if (showsProgress) {
      ensureProgressDOM(loader);
    }

    if (!state.isClosing && !state.isClosed) {
      document.body.classList.add("tr-loading");
    }

    state.loaderEl = loader;
    syncLoaderTheme();

    if (!state.themeObserver && typeof MutationObserver === "function") {
      state.themeObserver = new MutationObserver(syncLoaderTheme);
      state.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class"]
      });
      state.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-theme", "class"]
      });
    }
  }

  // --------------------------------------------------------------------------
  // Progress bar (test & dashboard pages only)
  // --------------------------------------------------------------------------
  function ensureProgressDOM(loader) {
    if (!loader.querySelector(".tr-loader-progress")) {
      var stack = loader.querySelector(".tr-loader-stack") || loader;
      var wrap = document.createElement("div");
      wrap.className = "tr-loader-progress";
      wrap.innerHTML =
        '<div class="tr-loader-progress__meta">' +
          '<span class="tr-loader-progress__label">' + defaultStartLabel + '</span>' +
          '<span class="tr-loader-progress__pct">0%</span>' +
        '</div>' +
        '<div class="tr-loader-progress__track" role="progressbar" aria-label="Loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
          '<div class="tr-loader-progress__fill"></div>' +
        '</div>';
      stack.appendChild(wrap);
    }
    renderProgress(state.progress);
    startTrickle();
  }

  function renderProgress(value, label) {
    var loader = state.loaderEl || document.getElementById("tr-preloader");
    if (!loader) return;
    var fill = loader.querySelector(".tr-loader-progress__fill");
    var pct = loader.querySelector(".tr-loader-progress__pct");
    var track = loader.querySelector(".tr-loader-progress__track");
    var labelEl = loader.querySelector(".tr-loader-progress__label");
    var rounded = Math.round(value);
    if (fill) fill.style.width = value + "%";
    if (pct) pct.textContent = rounded + "%";
    if (track) track.setAttribute("aria-valuenow", String(rounded));
    if (labelEl && label) labelEl.textContent = label;
  }

  // Slowly creeps forward between real milestones so the bar never looks frozen,
  // but always stays below 90% until the page actually reports completion.
  function startTrickle() {
    if (state.trickleTimer || !showsProgress) return;
    state.trickleTimer = window.setInterval(function () {
      if (state.isClosing || state.isClosed) return stopTrickle();
      if (state.progress >= 90) return;
      state.progress = Math.min(90, state.progress + Math.max(0.4, (90 - state.progress) * 0.04));
      renderProgress(state.progress);
    }, 260);
  }

  function stopTrickle() {
    if (state.trickleTimer) {
      window.clearInterval(state.trickleTimer);
      state.trickleTimer = null;
    }
  }

  function setProgress(value, label) {
    if (!showsProgress || state.isClosed) return;
    var next = Math.max(0, Math.min(100, Number(value) || 0));
    // Never move backwards — keeps the bar feeling honest and smooth.
    state.progress = Math.max(state.progress, next);
    renderProgress(state.progress, label);
  }

  function hold(tag, label) {
    // Extend safety timer so loader is never closed mid-load when held
    resetSafetyTimer(20000);

    if (showsProgress && (state.isClosed || state.isClosing)) {
      state.isClosed = false;
      state.isClosing = false;
      state.progress = 0;
      startedAt = performance.now();
      ensureLoaderDOM();
      var loader = state.loaderEl || document.getElementById("tr-preloader");
      if (loader) {
        loader.classList.remove("is-hidden", "is-hiding");
        loader.removeAttribute("aria-hidden");
      }
      renderProgress(0, label || defaultStartLabel);
      startTrickle();
    }
    if (state.isClosed) return;
    state.holds.add(tag || "default");
    if (showsProgress && label) {
      renderProgress(state.progress, label);
    }
  }

  function release(tag) {
    state.holds.delete(tag || "default");
    checkAutoFinalize();
  }

  function checkAutoFinalize() {
    if (state.isClosing || state.isClosed) return;
    if (!state.domReady) return;
    if (state.holds.size > 0) return;
    finalize();
  }

  function finalize(doneLabel) {
    if (state.isClosing || state.isClosed) return;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    state.isClosing = true;
    state.holds.clear();

    var elapsed = performance.now() - startedAt;
    var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    // On progress-enabled pages, complete the bar to 100% and let it register visually
    // before the loader dissolves.
    if (showsProgress) {
      stopTrickle();
      state.progress = 100;
      renderProgress(100, doneLabel || defaultDoneLabel);
      wait = Math.max(wait, 420);
    }

    window.setTimeout(function () {
      var loader = state.loaderEl || document.getElementById("tr-preloader");
      if (!loader) {
        state.isClosed = true;
        if (state.themeObserver) state.themeObserver.disconnect();
        if (document.body) document.body.classList.remove("tr-loading");
        return;
      }

      loader.classList.add("is-hiding");
      if (document.body) document.body.classList.remove("tr-loading");

      window.setTimeout(function () {
        state.isClosed = true;
        if (state.themeObserver) state.themeObserver.disconnect();
        loader.classList.add("is-hidden");
        loader.setAttribute("aria-hidden", "true");
        if (document.body) document.body.classList.remove("tr-loading");
      }, 320);
    }, wait);
  }

  function done(doneLabel) {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    state.holds.delete("page-controller");
    state.holds.delete("default");
    state.domReady = true;
    finalize(doneLabel);
  }

  function ribbonStart() {}
  function ribbonDone() {}

  function show(label) {
    state.isClosed = false;
    state.isClosing = false;
    startedAt = performance.now();
    resetSafetyTimer(20000);
    ensureLoaderDOM();
    var loader = state.loaderEl || document.getElementById("tr-preloader");
    if (loader) {
      loader.classList.remove("is-hidden", "is-hiding");
      loader.removeAttribute("aria-hidden");
    }
    if (document.body) {
      document.body.classList.add("tr-loading");
    }
    syncLoaderTheme();
    if (showsProgress) {
      renderProgress(state.progress || 10, label || defaultStartLabel);
    }
  }

  window.ThinkRightLoader = {
    show: show,
    setProgress: setProgress,
    hold: hold,
    release: release,
    done: done,
    ribbonStart: ribbonStart,
    ribbonDone: ribbonDone
  };

  if (document.body) {
    ensureLoaderDOM();
  } else {
    document.addEventListener("DOMContentLoaded", ensureLoaderDOM, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        state.domReady = true;
        ensureLoaderDOM();
        checkAutoFinalize();
      },
      { once: true }
    );
  } else {
    state.domReady = true;
    ensureLoaderDOM();
    window.setTimeout(checkAutoFinalize, 60);
  }

  window.addEventListener(
    "load",
    function () {
      state.domReady = true;
      checkAutoFinalize();
    },
    { once: true }
  );

  resetSafetyTimer();
})();
