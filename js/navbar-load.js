(function () {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavbar);
  } else {
    initNavbar();
  }

  function initNavbar() {
    const hamburger = document.getElementById("tr-hamburger");
    const mobileMenu = document.getElementById("tr-mobile-menu");
    const authBtn = document.getElementById("tr-auth-btn");
    const mobileAuthBtn = document.getElementById("tr-mobile-auth-btn");
    const logoutBtn = document.getElementById("tr-logout-btn");
    const mobileLogoutBtn = document.getElementById("tr-mobile-logout-btn");
    const themeToggle = document.getElementById("tr-theme-toggle");
    const themeToggleMobile = document.getElementById("tr-theme-toggle-mobile");

    ensureLeaderboardLinks();
    setActiveLinks();
    setupTheme(themeToggle, themeToggleMobile);
    setupPricingHandlers(mobileMenu);
    setupAuthHandlers(authBtn, mobileAuthBtn, logoutBtn, mobileLogoutBtn);
    setupMenuBehavior(hamburger, mobileMenu);
    displayUserInfo();
  }

  function ensureLeaderboardLinks() {
    const addLink = (container, linkClass, beforeSelector) => {
      if (!container) return;
      if (container.querySelector('a[href="leaderboard.html"]')) return;

      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "leaderboard.html";
      a.className = linkClass;
      a.textContent = "Leaderboard";
      li.appendChild(a);

      const beforeNode = beforeSelector
        ? container.querySelector(beforeSelector)?.closest("li")
        : null;
      if (beforeNode) container.insertBefore(li, beforeNode);
      else container.appendChild(li);
    };

    addLink(
      document.querySelector(".tr-navbar__nav"),
      "tr-navbar__link",
      ".tr-navbar__link--pricing"
    );

    addLink(
      document.querySelector(".tr-navbar__mobile-nav"),
      "tr-navbar__mobile-link",
      ".tr-navbar__mobile-link--pricing"
    );
  }

  function setupMenuBehavior(hamburger, mobileMenu) {
    if (!hamburger || !mobileMenu) return;

    const openMenu = () => {
      hamburger.setAttribute("aria-expanded", "true");
      mobileMenu.classList.add("open");
      document.body.classList.add("tr-menu-open");
      const firstFocusTarget = mobileMenu.querySelector("a, button");
      if (firstFocusTarget) firstFocusTarget.focus();
    };

    const closeMenu = (restoreFocus = false) => {
      hamburger.setAttribute("aria-expanded", "false");
      mobileMenu.classList.remove("open");
      document.body.classList.remove("tr-menu-open");
      if (restoreFocus) hamburger.focus();
    };

    const toggleMenu = () => {
      const expanded = hamburger.getAttribute("aria-expanded") === "true";
      if (expanded) closeMenu(true);
      else openMenu();
    };

    hamburger.addEventListener("click", toggleMenu);

    mobileMenu.addEventListener("click", (event) => {
      const target = event.target.closest("a, button");
      if (target) closeMenu(false);
    });

    document.addEventListener("click", (event) => {
      if (!mobileMenu.classList.contains("open")) return;
      const clickedInsideMenu = event.target.closest("#tr-mobile-menu");
      const clickedHamburger = event.target.closest("#tr-hamburger");
      if (!clickedInsideMenu && !clickedHamburger) closeMenu(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileMenu.classList.contains("open")) {
        closeMenu(true);
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 900 && mobileMenu.classList.contains("open")) {
        closeMenu(false);
      }
    });
  }

  function setupTheme(themeToggle, themeToggleMobile) {
    const applyTheme = (dark) => {
      if (dark) {
        document.body.classList.add("tr-dark");
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.body.classList.remove("tr-dark");
        document.documentElement.setAttribute("data-theme", "light");
      }

      try {
        localStorage.setItem("theme", dark ? "dark" : "light");
      } catch (error) {
        console.warn("Unable to persist theme:", error);
      }
    };

    try {
      const storedTheme = localStorage.getItem("theme");
      applyTheme(storedTheme === "dark");
    } catch (error) {
      applyTheme(false);
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const isDark = document.body.classList.contains("tr-dark");
        applyTheme(!isDark);
      });
    }

    if (themeToggleMobile) {
      themeToggleMobile.addEventListener("click", () => {
        const isDark = document.body.classList.contains("tr-dark");
        applyTheme(!isDark);
      });
    }
  }

  function setupPricingHandlers(mobileMenu) {
    const pricingLinks = document.querySelectorAll(
      ".tr-navbar__link--pricing, .tr-navbar__mobile-link--pricing"
    );

    pricingLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        // Close mobile menu first to avoid any layering/pointer issues on small screens.
        if (mobileMenu && mobileMenu.classList.contains("open")) {
          mobileMenu.classList.remove("open");
          document.body.classList.remove("tr-menu-open");
          const hamburger = document.getElementById("tr-hamburger");
          if (hamburger) hamburger.setAttribute("aria-expanded", "false");
        }

        if (
          window.Subscription &&
          typeof window.Subscription.showPricingModal === "function"
        ) {
          window.Subscription.showPricingModal();
        } else if (typeof window.showPricingModal === "function") {
          window.showPricingModal();
        } else {
          console.log("Pricing modal unavailable.");
        }

        // (menu already closed above)
      });
    });

    // Robust modal close support (works with both legacy and premium modal versions)
    document.addEventListener("click", (event) => {
      const closeBtn = event.target.closest(
        ".tr-pricing-close, #pricingModal [aria-label='Close pricing'], #pricingModal button[onclick*='closePricingModal']"
      );
      if (closeBtn) {
        const closeFn =
          window.Subscription && typeof window.Subscription.closePricingModal === "function"
            ? window.Subscription.closePricingModal
            : typeof window.closePricingModal === "function"
              ? window.closePricingModal
              : null;
        if (closeFn) closeFn();
        return;
      }

      // Close when clicking the backdrop
      const pricingModal = document.getElementById("pricingModal");
      if (pricingModal && event.target === pricingModal) {
        const closeFn =
          window.Subscription && typeof window.Subscription.closePricingModal === "function"
            ? window.Subscription.closePricingModal
            : typeof window.closePricingModal === "function"
              ? window.closePricingModal
              : null;
        if (closeFn) closeFn();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const pricingModal = document.getElementById("pricingModal");
      if (!pricingModal) return;
      const closeFn =
        window.Subscription && typeof window.Subscription.closePricingModal === "function"
          ? window.Subscription.closePricingModal
          : typeof window.closePricingModal === "function"
            ? window.closePricingModal
            : null;
      if (closeFn) closeFn();
    });
  }

  function setupAuthHandlers(authBtn, mobileAuthBtn, logoutBtn, mobileLogoutBtn) {
    const handleAuth = async () => {
      try {
        if (window.handleLogout && typeof window.handleLogout === "function") {
          await window.handleLogout();
          return;
        }

        const user = window.getCurrentUser
          ? await window.getCurrentUser()
          : null;

        if (user && window.supabase && window.supabase.auth) {
          await window.supabase.auth.signOut();
          try {
            localStorage.removeItem("thinkright_username");
          } catch (_e) {
            // ignore storage errors
          }
          window.location.href = "login.html";
          return;
        }

        window.location.href = "login.html";
      } catch (error) {
        console.error("Auth action failed:", error);
        window.location.href = "login.html";
      }
    };

    if (authBtn) authBtn.addEventListener("click", handleAuth);
    if (mobileAuthBtn) mobileAuthBtn.addEventListener("click", handleAuth);
    if (logoutBtn) logoutBtn.addEventListener("click", handleAuth);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener("click", handleAuth);
  }

  function setActiveLinks() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const links = document.querySelectorAll(
      ".tr-navbar__link:not(.tr-navbar__link--pricing), .tr-navbar__mobile-link:not(.tr-navbar__mobile-link--pricing)"
    );

    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (href === currentPath) {
        link.classList.add("active");
      }
    });
  }

  async function displayUserInfo() {
    try {
      const userInfoDesktop = document.getElementById("tr-user-info");
      const userInfoMobile = document.getElementById("tr-mobile-user-info");
      const authBtn = document.getElementById("tr-auth-btn");
      const mobileAuthBtn = document.getElementById("tr-mobile-auth-btn");
      const logoutBtn = document.getElementById("tr-logout-btn");
      const mobileLogoutBtn = document.getElementById("tr-mobile-logout-btn");

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // Fast path: show cached username immediately (improves perceived load speed).
      // This does not grant access; it only renders UI while auth initializes.
      let didShowCached = false;
      try {
        const cachedName = localStorage.getItem("thinkright_username");
        if (cachedName) {
          const userNameDesktop = document.getElementById("tr-user-name");
          const userNameMobile = document.getElementById("tr-mobile-user-name");
          if (userNameDesktop) userNameDesktop.textContent = cachedName;
          if (userNameMobile) userNameMobile.textContent = cachedName;
          if (userInfoDesktop) userInfoDesktop.style.display = "flex";
          if (userInfoMobile) userInfoMobile.style.display = "flex";
          if (authBtn) authBtn.style.display = "none";
          if (mobileAuthBtn) mobileAuthBtn.style.display = "none";
          if (logoutBtn) logoutBtn.style.display = "inline-flex";
          if (mobileLogoutBtn) mobileLogoutBtn.style.display = "inline-flex";
          didShowCached = true;
        }
      } catch (e) {
        // ignore localStorage failures
      }

      // Resolve auth user without long delays, but also without flashing "Login"
      // just because Supabase/auth hasn't finished initializing yet.
      const resolveUser = async () => {
        // Prefer app helper if present.
        if (window.getCurrentUser && typeof window.getCurrentUser === "function") {
          try {
            const u = await window.getCurrentUser();
            if (u) return u;
          } catch (e) {
            // continue to fallback below
          }
        }

        // Fallback to Supabase directly if available.
        if (window.supabase && window.supabase.auth && typeof window.supabase.auth.getUser === "function") {
          try {
            const res = await window.supabase.auth.getUser();
            return res && res.data ? res.data.user : null;
          } catch (e) {
            return null;
          }
        }

        return null;
      };

      let user = null;
      for (let i = 0; i < 15; i++) {
        user = await resolveUser();
        if (user) break;

        // If auth isn't initialized yet, give it a short window to boot.
        const authReady =
          window.authInitialized === true ||
          (window.supabase && window.supabase.auth);
        if (!authReady) {
          await sleep(100);
          continue;
        }

        // Auth is ready but user is null: no need to wait much more.
        await sleep(50);
      }

      if (!user) {
        // If we never showed cached UI, keep login visible as normal.
        // If we did show cached UI, only switch back to login after this short confirm window.
        if (userInfoDesktop) userInfoDesktop.style.display = "none";
        if (userInfoMobile) userInfoMobile.style.display = "none";
        if (authBtn) authBtn.style.display = "inline-flex";
        if (mobileAuthBtn) mobileAuthBtn.style.display = "inline-flex";
        if (logoutBtn) logoutBtn.style.display = "none";
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = "none";
        return;
      }

      // Subscription is only needed for the premium star; init in the background.
      try {
        if (window.Subscription && typeof window.Subscription.init === "function") {
          await window.Subscription.init();
        }
      } catch (e) {
        // Not fatal for navbar rendering.
      }

      const userName =
        user.user_metadata?.username || user.email?.split("@")[0] || "User";

      // Persist for faster navbar rendering on future loads.
      try {
        if (userName) localStorage.setItem("thinkright_username", userName);
      } catch (e) {
        // ignore
      }

      const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.photoURL ||
        generateDefaultAvatar(userName);
      const isUserPremium =
        window.Subscription && typeof window.Subscription.isPremium === "function"
          ? window.Subscription.isPremium()
          : false;

      if (userInfoDesktop) userInfoDesktop.style.display = "flex";
      if (userInfoMobile) userInfoMobile.style.display = "flex";
      if (authBtn) authBtn.style.display = "none";
      if (mobileAuthBtn) mobileAuthBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "inline-flex";
      if (mobileLogoutBtn) mobileLogoutBtn.style.display = "inline-flex";

      const userNameDesktop = document.getElementById("tr-user-name");
      const userNameMobile = document.getElementById("tr-mobile-user-name");
      const avatarDesktop = document.getElementById("tr-user-avatar");
      const avatarMobile = document.getElementById("tr-mobile-user-avatar");
      const starDesktop = document.getElementById("tr-user-premium-star");
      const starMobile = document.getElementById("tr-mobile-user-premium-star");

      const premiumSuffix = isUserPremium ? " ★" : "";
      if (userNameDesktop) userNameDesktop.textContent = `${userName}${premiumSuffix}`;
      if (userNameMobile) userNameMobile.textContent = `${userName}${premiumSuffix}`;
      if (avatarDesktop) avatarDesktop.src = avatarUrl;
      if (avatarMobile) avatarMobile.src = avatarUrl;
      if (starDesktop) starDesktop.style.display = isUserPremium ? "flex" : "none";
      if (starMobile) starMobile.style.display = isUserPremium ? "flex" : "none";
    } catch (error) {
      console.error("Error displaying user info:", error);
    }
  }

  function generateDefaultAvatar(name) {
    const initial = (name || "U").charAt(0).toUpperCase();
    const svg = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="18" fill="#1d4ed8"/><text x="18" y="24" text-anchor="middle" fill="white" font-family="Arial" font-size="16" font-weight="bold">${initial}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
})();
