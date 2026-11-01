(function () {
  const ROLE_CACHE_KEY = "thinkright_auth_role";

  const isTeacherRole = (role) => role === "teacher" || role === "tutor";

  function getCachedRole() {
    try {
      return window.thinkrightUserRole === 'teacher' ? 'teacher' : 'student';
    } catch (_e) {
      return "student";
    }
  }

  async function resolveAuthenticatedRole(user) {
    if (!user) return "student";
    const identity = await window.resolveWorkspaceIdentity();
    return identity.role;
  }

  function setRoleCache(role) {
    try {
      localStorage.setItem(ROLE_CACHE_KEY, role);
    } catch (_e) {
      // The shell still works when storage is unavailable.
    }
  }

  function updateRoleLabel(role) {
    const logo = document.querySelector(".tr-navbar__logo");
    if (!logo) return;

    let label = document.getElementById("tr-navbar-role-label");
    if (role === "teacher") {
      if (!label) {
        label = document.createElement("span");
        label.id = "tr-navbar-role-label";
        label.className = "tr-navbar__role-label";
        logo.appendChild(label);
      }
      label.textContent = "Educator";
    } else if (label) {
      label.remove();
    }
  }

  function applyAppShell(role) {
    const normalizedRole = isTeacherRole(role) ? "teacher" : "student";
    document.documentElement.dataset.appRole = normalizedRole;
    document.body?.setAttribute("data-app-role", normalizedRole);
    document.body?.classList.toggle("tr-role--teacher", normalizedRole === "teacher");
    document.body?.classList.toggle("tr-role--student", normalizedRole === "student");

    ensureCoreLinks(normalizedRole === "teacher");
    ensureMobileHomeBtn(normalizedRole === "teacher");
    ensureMobileProfileBtn(normalizedRole === "teacher");
    ensureStudentBottomNav(normalizedRole === "student");
    updateRoleLabel(normalizedRole);
    setActiveLinks();

    document.querySelectorAll("[data-shell-role]").forEach((element) => {
      const allowedRoles = element.dataset.shellRole.split(/\s+/);
      element.hidden = !allowedRoles.includes(normalizedRole);
    });

    document.dispatchEvent(new CustomEvent("thinkright:rolechange", {
      detail: { role: normalizedRole }
    }));

    return normalizedRole;
  }

  window.ThinkRightShell = window.ThinkRightShell || {};
  window.ThinkRightShell.resolveRole = resolveAuthenticatedRole;
  window.ThinkRightShell.applyRole = applyAppShell;
  window.ThinkRightShell.getRole = () => document.documentElement.dataset.appRole || getCachedRole();

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

    // Keep the unauthenticated shell student-focused until a real session is resolved.
    applyAppShell("student");
    setupTheme(themeToggle, themeToggleMobile);
    setupAuthHandlers(authBtn, mobileAuthBtn, logoutBtn, mobileLogoutBtn);
    setupMenuBehavior(hamburger, mobileMenu);
    displayUserInfo();
  }

  function ensureMobileHomeBtn(isTeacher = false) {
    const container = document.querySelector(".tr-navbar__container");
    const themeToggle = document.getElementById("tr-theme-toggle");
    if (container && !document.getElementById("tr-home-btn-mobile")) {
      const homeBtn = document.createElement("a");
      homeBtn.href = isTeacher ? "tutor-dashboard.html" : "index.html";
      homeBtn.id = "tr-home-btn-mobile";
      homeBtn.className = "tr-navbar__home-btn";
      homeBtn.title = "Home";
      homeBtn.setAttribute("aria-label", "Home");
      homeBtn.innerHTML = `<i class="fa-solid fa-house"></i>`;
      if (themeToggle) {
        container.insertBefore(homeBtn, themeToggle);
      } else {
        container.appendChild(homeBtn);
      }
    } else if (container) {
      const homeBtn = document.getElementById("tr-home-btn-mobile");
      if (homeBtn) homeBtn.href = isTeacher ? "tutor-dashboard.html" : "index.html";
    }
  }

  function ensureMobileProfileBtn(isTeacher = false) {
    const container = document.querySelector(".tr-navbar__container");
    const themeToggle = document.getElementById("tr-theme-toggle");
    if (container && !document.getElementById("tr-profile-btn-mobile")) {
      const profileBtn = document.createElement("a");
      profileBtn.href = isTeacher ? "tutor-onboarding.html" : "profile.html";
      profileBtn.id = "tr-profile-btn-mobile";
      profileBtn.className = "tr-navbar__profile-btn-mobile";
      profileBtn.title = isTeacher ? "Educator Profile" : "Profile";
      profileBtn.setAttribute("aria-label", isTeacher ? "Educator Profile" : "Profile");
      profileBtn.innerHTML = `<i class="fa-solid fa-user"></i>`;
      if (themeToggle) {
        container.insertBefore(profileBtn, themeToggle);
      } else {
        container.appendChild(profileBtn);
      }
    } else if (container) {
      const profileBtn = document.getElementById("tr-profile-btn-mobile");
      if (profileBtn) profileBtn.href = isTeacher ? "tutor-onboarding.html" : "profile.html";
    }
  }

  function ensureStudentBottomNav(isStudent) {
    let nav = document.getElementById('tr-student-bottom-nav');
    if (!isStudent) {
      closeStudentMore(false);
      nav?.remove();
      document.getElementById('tr-student-more-sheet')?.remove();
      return;
    }
    if (nav) return;
    nav = document.createElement('nav');
    nav.id = 'tr-student-bottom-nav';
    nav.className = 'tr-student-bottom-nav';
    nav.setAttribute('aria-label', 'Student navigation');
    nav.innerHTML = [
      ['index.html', 'Home', 'fa-house'],
      ['practice.html', 'Practice', 'fa-bullseye'],
      ['my-classes.html', 'Classes', 'fa-people-group'],
      ['dashboard.html', 'Dashboard', 'fa-chart-line']
    ].map(([href, label, icon]) => `<a class="tr-student-bottom-nav__link" href="${href}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span></a>`).join('');
    nav.insertAdjacentHTML('beforeend', '<button class="tr-student-bottom-nav__link tr-student-bottom-nav__more" id="tr-student-more-button" type="button" aria-haspopup="dialog" aria-controls="tr-student-more-sheet" aria-expanded="false"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span>More</span></button>');
    document.body.appendChild(nav);

    const isDarkInit = document.body.classList.contains('tr-dark') || document.documentElement.getAttribute('data-theme') === 'dark';
    const sheet = document.createElement('div');
    sheet.id = 'tr-student-more-sheet';
    sheet.className = 'tr-student-more-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `<div class="tr-student-more-sheet__scrim" data-more-close></div><section class="tr-student-more-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="tr-student-more-title"><div class="tr-student-more-sheet__handle" aria-hidden="true"></div><div class="tr-student-more-sheet__heading"><div><h2 id="tr-student-more-title">More to explore</h2></div><div class="tr-student-more-sheet__actions"><button type="button" class="tr-student-more-sheet__theme" id="tr-student-more-theme-btn" aria-label="Toggle dark mode" title="Toggle dark mode"><i class="fa-solid fa-sun tr-navbar__icon-sun" aria-hidden="true"></i><i class="fa-solid fa-moon tr-navbar__icon-moon" aria-hidden="true"></i></button><button type="button" class="tr-student-more-sheet__close" data-more-close aria-label="Close menu"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div></div><nav aria-label="More student pages"><a href="textbooks.html"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span>Textbooks</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a><a href="syllabus.html"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i><span>Syllabus</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a><a href="leaderboard.html"><i class="fa-solid fa-trophy" aria-hidden="true"></i><span>Leaderboard</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a><a href="profile.html"><i class="fa-solid fa-user" aria-hidden="true"></i><span>Profile</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a></nav></section>`;
    document.body.appendChild(sheet);
    sheet.querySelector('#tr-student-more-theme-btn')?.addEventListener('click', () => {
      const dark = !(document.body.classList.contains('tr-dark') || document.documentElement.getAttribute('data-theme') === 'dark');
      document.body.classList.toggle('tr-dark', dark);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try {
        const mode = dark ? 'dark' : 'light';
        localStorage.setItem('theme', mode);
        localStorage.setItem('thinkright_theme', mode);
      } catch (_e) {}
      document.querySelectorAll('.tr-navbar__theme-label').forEach((label) => {
        label.textContent = dark ? 'Light Mode' : 'Dark Mode';
      });
    });
    nav.querySelector('#tr-student-more-button').addEventListener('click', () => {
      sheet.hidden = false;
      document.body.classList.add('tr-student-more-open');
      nav.querySelector('#tr-student-more-button').setAttribute('aria-expanded', 'true');
      sheet.querySelector('.tr-student-more-sheet__close').focus();
    });
    sheet.querySelectorAll('[data-more-close]').forEach((button) => button.addEventListener('click', () => closeStudentMore(true)));
    sheet.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeStudentMore(true);
      if (event.key !== 'Tab') return;
      const controls = Array.from(sheet.querySelectorAll('button, a'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 900 && !sheet.hidden) closeStudentMore(false);
    });
  }

  function closeStudentMore(restoreFocus) {
    const sheet = document.getElementById('tr-student-more-sheet');
    const button = document.getElementById('tr-student-more-button');
    if (sheet) sheet.hidden = true;
    document.body.classList.remove('tr-student-more-open');
    button?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button?.focus();
  }

  function ensureCoreLinks(forceTeacher = false) {
    const desktopContainer = document.querySelector(".tr-navbar__nav");
    const mobileContainer = document.querySelector(".tr-navbar__mobile-nav");

    const isTeacher = forceTeacher === true;

    const studentNavItems = [
      { href: "index.html", label: "Home", isHome: true },
      { href: "practice.html", label: "Practice" },
      { href: "my-classes.html", label: "My Classes" },
      { href: "syllabus.html", label: "Syllabus" },
      { href: "textbooks.html", label: "Textbooks" },
      { href: "dashboard.html", label: "Dashboard" },
      { href: "leaderboard.html", label: "Leaderboard" },
      { href: "profile.html", label: "Profile" }
    ];

    const studentMobileExtraItems = [
      { href: "insider.html", label: "JAMB Insider" },
      { href: "settings.html", label: "Settings" }
    ];

    const teacherNavItems = [
      { href: "index.html", label: "Home", isHome: true },
      { href: "tutor-dashboard.html", label: "Workspace" },
      { href: "tutor-dashboard.html#classes", label: "My Classes" },
      { href: "tutor-payouts.html", label: "Payouts & Earnings" }
    ];

    const teacherMobileExtraItems = [
      { href: "classes.html?create=1", label: "+ Create Class" },
      { href: "tutor-onboarding.html", label: "Educator Profile" },
      { href: "dashboard.html", label: "Student CBT Analytics" }
    ];

    const coreNavItems = isTeacher ? teacherNavItems : studentNavItems;
    const mobileExtraItems = isTeacher ? teacherMobileExtraItems : studentMobileExtraItems;

    const populateNav = (container, linkClass, items, isMobile = false) => {
      if (!container) return;
      const utilityItems = isMobile
        ? Array.from(container.querySelectorAll("#tr-mobile-user-info, #tr-mobile-auth-btn, #tr-theme-toggle-mobile"))
          .map((element) => element.closest("li"))
          .filter(Boolean)
        : [];

      container.innerHTML = "";
      items.forEach((item) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = item.href;
        a.className = linkClass;
        if (item.isHome) {
          a.classList.add("tr-navbar__link--home");
          a.setAttribute("title", "Home");
          a.setAttribute("aria-label", "Home");
          if (isMobile) {
            a.innerHTML = `<i class="fa-solid fa-house" style="margin-right: 10px; font-size: 1rem; width: 20px; text-align: center;"></i> <span>Home</span>`;
          } else {
            a.innerHTML = `<i class="fa-solid fa-house"></i>`;
          }
        } else {
          a.textContent = item.label;
        }
        li.appendChild(a);

        if (item.isHome && container.firstChild) {
          container.insertBefore(li, container.firstChild);
        } else {
          container.appendChild(li);
        }
      });

      utilityItems.forEach((item) => container.appendChild(item));
    };

    populateNav(desktopContainer, "tr-navbar__link", coreNavItems, false);
    populateNav(mobileContainer, "tr-navbar__mobile-link", [...coreNavItems, ...mobileExtraItems], true);
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
      if (event.target === mobileMenu) {
        closeMenu(false);
        return;
      }
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
        const mode = dark ? "dark" : "light";
        localStorage.setItem("theme", mode);
        localStorage.setItem("thinkright_theme", mode);
      } catch (error) {
        console.warn("Unable to persist theme:", error);
      }

      document.querySelectorAll(".tr-navbar__theme-label").forEach(label => {
        label.textContent = dark ? "Light Mode" : "Dark Mode";
      });
    };

    try {
      const storedTheme = localStorage.getItem("theme") || localStorage.getItem("thinkright_theme");
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
            localStorage.removeItem(ROLE_CACHE_KEY);
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
    const bottomDestinations = {
      'index.html': 'index.html',
      'practice.html': 'practice.html',
      'my-classes.html': 'my-classes.html',
      'classes.html': 'my-classes.html',
      'cohort.html': 'my-classes.html',
      'dashboard.html': 'dashboard.html'
    };
    document.querySelectorAll('.tr-student-bottom-nav__link').forEach((link) => {
      const morePages = ['syllabus.html', 'leaderboard.html', 'profile.html', 'settings.html', 'onboarding.html', 'insider.html'];
      const active = link.id === 'tr-student-more-button'
        ? morePages.includes(currentPath)
        : link.getAttribute('href') === bottomDestinations[currentPath];
      link.classList.toggle('active', active);
      if (active && link.tagName === 'A') link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const links = document.querySelectorAll(
      ".tr-navbar__link:not(.tr-navbar__link--pricing), .tr-navbar__mobile-link:not(.tr-navbar__mobile-link--pricing), .tr-navbar__home-btn, .tr-navbar__profile-btn-mobile"
    );

    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && href.split("#")[0] === currentPath) {
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
          const avatarDesktop = document.getElementById("tr-user-avatar");
          const avatarMobile = document.getElementById("tr-mobile-user-avatar");
          if (userNameDesktop) userNameDesktop.textContent = cachedName;
          if (userNameMobile) userNameMobile.textContent = cachedName;
          [userNameDesktop, avatarDesktop, userNameMobile, avatarMobile].forEach((el) => {
            if (el && !el.closest("a")) {
              el.style.cursor = "pointer";
              el.onclick = () => {
                const isTeacher = getCachedRole() === "teacher";
                window.location.href = isTeacher ? "tutor-onboarding.html" : "profile.html";
              };
            }
          });
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
      if (starDesktop) starDesktop.style.display = "none";
      if (starMobile) starMobile.style.display = "none";

      const resolvedRole = await resolveAuthenticatedRole(user);
      const isTeacherUser = applyAppShell(resolvedRole) === "teacher";

      const targetProfileUrl = isTeacherUser ? "tutor-onboarding.html" : "profile.html";
      const userNavLinks = document.querySelectorAll(".tr-navbar__user-link, .tr-navbar__mobile-user-link");
      userNavLinks.forEach((link) => {
        link.href = targetProfileUrl;
      });
      [userNameDesktop, avatarDesktop, userNameMobile, avatarMobile].forEach((el) => {
        if (el && !el.closest("a")) {
          el.style.cursor = "pointer";
          el.title = isTeacherUser ? "Educator Profile" : "My Profile";
          el.onclick = () => {
            window.location.href = targetProfileUrl;
          };
        }
      });

      if (isTeacherUser) {
        let educatorBadge = document.getElementById("tr-user-educator-badge");
        if (!educatorBadge && userNameDesktop && userNameDesktop.parentNode) {
          educatorBadge = document.createElement("span");
          educatorBadge.id = "tr-user-educator-badge";
          educatorBadge.className = "home-pillar-card__badge home-pillar-card__badge--blue";
          educatorBadge.style.cssText = "font-size: 0.7rem; padding: 2px 7px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;";
          educatorBadge.textContent = "Educator";
          userNameDesktop.parentNode.insertBefore(educatorBadge, userNameDesktop.nextSibling);
        }

        let mobileEducatorBadge = document.getElementById("tr-mobile-user-educator-badge");
        if (!mobileEducatorBadge && userNameMobile && userNameMobile.parentNode) {
          mobileEducatorBadge = document.createElement("span");
          mobileEducatorBadge.id = "tr-mobile-user-educator-badge";
          mobileEducatorBadge.className = "home-pillar-card__badge home-pillar-card__badge--blue";
          mobileEducatorBadge.style.cssText = "font-size: 0.7rem; padding: 2px 7px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;";
          mobileEducatorBadge.textContent = "Educator";
          userNameMobile.parentNode.insertBefore(mobileEducatorBadge, userNameMobile.nextSibling);
        }

        const dashBanner = document.getElementById("dashboardEducatorBanner");
        if (dashBanner) {
          dashBanner.style.display = "flex";
        }
      }
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
