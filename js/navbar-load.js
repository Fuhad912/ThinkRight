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

    setActiveLinks();
    setupTheme(themeToggle, themeToggleMobile);
    setupPricingHandlers(mobileMenu);
    setupAuthHandlers(authBtn, mobileAuthBtn, logoutBtn, mobileLogoutBtn);
    setupMenuBehavior(hamburger, mobileMenu);
    displayUserInfo();
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

        if (mobileMenu && mobileMenu.classList.contains("open")) {
          mobileMenu.classList.remove("open");
          document.body.classList.remove("tr-menu-open");
          const hamburger = document.getElementById("tr-hamburger");
          if (hamburger) hamburger.setAttribute("aria-expanded", "false");
        }
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
          window.location.reload();
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
      let retries = 0;
      while (
        (!window.Subscription || typeof window.Subscription.init !== "function") &&
        retries < 50
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }

      if (window.Subscription && typeof window.Subscription.init === "function") {
        await window.Subscription.init();
      }

      const user = window.getCurrentUser ? await window.getCurrentUser() : null;
      const userInfoDesktop = document.getElementById("tr-user-info");
      const userInfoMobile = document.getElementById("tr-mobile-user-info");
      const authBtn = document.getElementById("tr-auth-btn");
      const mobileAuthBtn = document.getElementById("tr-mobile-auth-btn");
      const logoutBtn = document.getElementById("tr-logout-btn");
      const mobileLogoutBtn = document.getElementById("tr-mobile-logout-btn");

      if (!user) {
        if (userInfoDesktop) userInfoDesktop.style.display = "none";
        if (userInfoMobile) userInfoMobile.style.display = "none";
        if (authBtn) authBtn.style.display = "inline-flex";
        if (mobileAuthBtn) mobileAuthBtn.style.display = "inline-flex";
        if (logoutBtn) logoutBtn.style.display = "none";
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = "none";
        return;
      }

      const userName =
        user.user_metadata?.username || user.email?.split("@")[0] || "User";
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

      if (userNameDesktop) userNameDesktop.textContent = userName;
      if (userNameMobile) userNameMobile.textContent = userName;
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
