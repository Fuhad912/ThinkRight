/**
 * THINKRIGHT - LANDING PAGE APPLICATION
 * 
 * This module handles the landing/home page logic including:
 * - Authentication check (redirects to login if not authenticated)
 * - Subject selection and navigation
 * - LocalStorage management for selected subject
 * - Logout functionality
 * - Animations using GSAP
 * 
 * User Flow:
 * 1. Check if user is logged in (if not, redirect to login.html)
 * 2. User arrives at index.html
 * 3. Sees subject selection cards
 * 4. Clicks a subject card (Mathematics or Use of English)
 * 5. Selection is saved to localStorage
 * 6. Page redirects to test.html
 * 7. test.js retrieves the subject and loads appropriate questions
 */

// ============================================================================
// DOM REFERENCES
// 
// Cache DOM elements for better performance and readability.
// ============================================================================

const subjectCards = document.querySelectorAll('.subject-card');
const welcomeSection = document.querySelector('.welcome-section');
const subjectsSection = document.querySelector('.subjects-section');
const infoSection = document.querySelector('.info-section');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');

// ============================================================================
// SUBJECT SELECTION HANDLER
// 
// Handle when user clicks on a subject card.
// ============================================================================

/**
 * Initialize subject card event listeners
 * 
 * Each subject card has a data-subject attribute identifying the subject.
 * When clicked:
 * 1. Save subject to localStorage
 * 2. Show loading animation
 * 3. Redirect to test.html
 */
function initSubjectSelection() {
    subjectCards.forEach(card => {
        card.addEventListener('click', handleSubjectClick);
    });
}

/**
 * Handle subject card click
 * 
 * @param {Event} event - Click event
 */
function handleSubjectClick(event) {
    const rawSubject = this.getAttribute('data-subject');
    const subject = typeof normalizeSubject === 'function'
        ? normalizeSubject(rawSubject)
        : rawSubject;
    
    if (!subject) {
        console.error('Subject not found on clicked card');
        return;
    }

    // Save selected subject to localStorage for test.js to retrieve
    StorageManager.setSelectedSubject(subject);
    
    // Add loading state to prevent multiple clicks
    this.disabled = true;
    this.style.opacity = '0.6';
    
    // Show visual feedback with animation
    animateNavigation(this);
    
    // Small delay for visual feedback, then navigate
    setTimeout(() => {
        window.location.href = 'test.html';
    }, 300);
}

// ============================================================================
// ANIMATIONS
// 
// Use GSAP for smooth, professional animations.
// ============================================================================

/**
 * Animate subject card on selection
 * 
 * @param {HTMLElement} card - The clicked card element
 * 
 * Animation sequence:
 * 1. Scale up the card
 * 2. Fade the background
 * 3. Create a ripple effect
 */
function animateNavigation(card) {
    // Animate the selected card
    gsap.to(card, {
        duration: 0.3,
        scale: 1.05,
        ease: 'back.out'
    });

    // Fade out other cards
    subjectCards.forEach(c => {
        if (c !== card) {
            gsap.to(c, {
                duration: 0.2,
                opacity: 0.3
            });
        }
    });
}

/**
 * Animate page on load
 * 
 * Creates a pleasant entrance animation with staggered elements.
 */
function animatePageLoad() {
    // Animate header
    gsap.fromTo('.header',
        { opacity: 0, y: -30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );

    // Animate welcome section
    if (welcomeSection) {
        gsap.fromTo(welcomeSection,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.6, delay: 0.1, ease: 'power2.out' }
        );
    }

    // Animate subject cards with stagger
    gsap.fromTo(subjectCards,
        { opacity: 0, scale: 0.9 },
        {
            opacity: 1,
            scale: 1,
            duration: 0.5,
            delay: 0.2,
            stagger: 0.1,
            ease: 'back.out'
        }
    );

    // Animate info section
    if (infoSection) {
        gsap.fromTo(infoSection,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5, delay: 0.4, ease: 'power2.out' }
        );
    }

    // Animate footer
    gsap.fromTo('.footer',
        { opacity: 0 },
        { opacity: 1, duration: 0.5, delay: 0.5 }
    );
}

// ============================================================================
// INTERACTIVE ANIMATIONS
// 
// Add hover animations to subject cards for better UX.
// ============================================================================

/**
 * Add hover animations to subject cards
 * 
 * Makes the UI feel more responsive and modern.
 */
function addCardHoverAnimations() {
    subjectCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            gsap.to(card, {
                duration: 0.3,
                scale: 1.02,
                ease: 'power2.out'
            });
        });

        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                duration: 0.3,
                scale: 1,
                ease: 'power2.out'
            });
        });
    });
}

// ============================================================================
// INITIALIZATION
// 
// Run when DOM is ready.
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Landing page initialized');
    
    // Setup logout button click handlers FIRST (before checkAuth)
    const logoutBtnDesktop = document.getElementById('logoutBtn');
    const logoutBtnMobile = document.getElementById('logoutBtnMobile');
    
    if (logoutBtnDesktop) {
        logoutBtnDesktop.addEventListener('click', handleLogout);
        console.log('✓ Desktop logout button listener attached');
    }
    
    if (logoutBtnMobile) {
        logoutBtnMobile.addEventListener('click', handleLogout);
        console.log('✓ Mobile logout button listener attached');
    }
    
    // Setup theme toggle (for both desktop and mobile)
    setupThemeToggle();
    
    // Check authentication first
    checkAuth();
    
    // Initialize event listeners
    initSubjectSelection();
    
    // Initialize hamburger menu for mobile
    initHamburgerMenu();
    
    // Add interactive animations
    addCardHoverAnimations();
    
    // Animate page load for pleasant UX
    animatePageLoad();

    // Initialize trial banner (non-blocking)
    initTrialBanner();

    // Log for debugging (remove in production)
    console.log('Subject selection ready. Available subjects: Mathematics, English');
});

/**
 * Initialize hamburger menu for mobile devices
 * Premium implementation with smooth animations and touch support
 */
function initHamburgerMenu() {
    const btn = document.getElementById('hamburgerMenu');
    const menu = document.getElementById('mobileMenu');
    const menuLinks = menu?.querySelectorAll('.mobile-menu-link');
    const menuButtons = menu?.querySelectorAll('button');

    if (!btn || !menu) {
        console.error('Hamburger menu elements not found');
        return;
    }

    console.log('✓ Hamburger menu initialized');

    // Toggle a single class (`open`) on the header when hamburger clicked.
    // No inline styles are applied by JS; CSS handles animation, opacity and stacking.
    const header = document.querySelector('.header');
    if (!header) {
        console.error('Header element not found for hamburger menu');
        return;
    }

    // Single toggle on header
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        header.classList.toggle('open');
        console.log('Hamburger toggled. Open:', header.classList.contains('open'));
    });

    // Close menu when a menu link (or menu button except theme toggle) is clicked
    menuLinks?.forEach(link => {
        link.addEventListener('click', function(e) {
            header.classList.remove('open');
        });
    });

    menuButtons?.forEach(button => {
        if (button.id !== 'mobileThemeToggle') {
            button.addEventListener('click', function(e) {
                header.classList.remove('open');
            });
        }
    });

    // Close menu when clicking outside the header
    document.addEventListener('click', function(e) {
        if (header.classList.contains('open') && !header.contains(e.target)) {
            header.classList.remove('open');
        }
    });

    // Close on ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && header.classList.contains('open')) {
            header.classList.remove('open');
            const hb = document.getElementById('hamburgerMenu');
            if (hb) hb.focus();
        }
    });
}

// ============================================================================
// AUTHENTICATION CHECK
// 
// Verify user is logged in before showing landing page.
// ============================================================================

/**
 * Check if user is authenticated
 * 
 * If not logged in, redirect to login.html
 * If logged in, display user email and show logout button
 */
async function checkAuth() {
    try {
        // Wait for Supabase to be initialized
        let retries = 0;
        while (!window.authInitialized && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (!window.authInitialized) {
            console.error('❌ Supabase not initialized');
            window.location.href = 'login.html?error=init';
            return;
        }

        const user = await getCurrentUser();
        
        if (!user) {
            // Not authenticated - redirect to login
            console.log('User not authenticated, redirecting to login...');
            window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname);
            return;
        }

        // User authenticated - show their username and navigation items
        console.log('✓ User authenticated:', user.email);
        
        // Wait for subscription module to be ready and initialized
        retries = 0;
        while ((!window.Subscription || typeof window.Subscription.init !== 'function') && retries < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }
        
        // Initialize subscription state
        if (window.Subscription && typeof window.Subscription.init === 'function') {
            await window.Subscription.init();
            console.log('✓ Subscription initialized');
        }
        
        // Get username from localStorage (stored during login/signup)
        const username = localStorage.getItem('thinkright_username') || user.email;
        
        // Check if user is premium (now that subscription is initialized)
        const isPremium = window.Subscription?.isPremium();
        console.log('Is Premium:', isPremium);
        
        // Show premium welcome banner if user is premium
        if (isPremium) {
            const premiumBanner = document.getElementById('premiumWelcomeBanner');
            if (premiumBanner) {
                premiumBanner.style.display = 'block';
                console.log('✓ Premium welcome banner displayed');
            }
        } else {
            // Show free test counter for non-premium users
            await displayFreeTestCounter(user);
        }
        
        // Update user email display (desktop)
        if (userEmail) {
            userEmail.textContent = username;
        }
        if (userInfo) {
            userInfo.style.display = 'block';
        }
        
        // Show premium badge if premium
        const premiumBadge = document.getElementById('premiumBadge');
        if (premiumBadge && isPremium) {
            premiumBadge.style.display = 'inline-block';
        }
        
        // Update user email display (mobile menu)
        const userEmailMobile = document.getElementById('userEmailMobile');
        const mobileMenuHeader = document.getElementById('mobileMenuHeader');
        if (userEmailMobile) {
            userEmailMobile.textContent = username;
            console.log('✓ Mobile menu username set to:', username);
        }
        
        // Show premium badge on mobile if premium
        const mobilePremiumBadge = document.getElementById('mobilePremiumBadge');
        if (mobilePremiumBadge && isPremium) {
            mobilePremiumBadge.style.display = 'inline-block';
        }
        
        if (mobileMenuHeader) {
            mobileMenuHeader.style.display = 'block';
            console.log('✓ Mobile menu header displayed');
        }
        
        // Show desktop dashboard link
        const dashboardLink = document.getElementById('dashboardLink');
        if (dashboardLink) {
            dashboardLink.style.display = 'block';
        }
        
        // Show desktop syllabus link
        const syllabusLink = document.getElementById('syllabusLink');
        if (syllabusLink) {
            syllabusLink.style.display = 'block';
        }
        
        // Show mobile dashboard link
        const dashboardLinkMobile = document.getElementById('dashboardLinkMobile');
        if (dashboardLinkMobile) {
            dashboardLinkMobile.style.display = 'block';
        }
        
        // Show desktop logout button
        const logoutBtnDesktop = document.getElementById('logoutBtn');
        if (logoutBtnDesktop) {
            logoutBtnDesktop.style.display = 'block';
            console.log('✓ Desktop logout button displayed');
        }
        
        // Show mobile logout button
        const logoutBtnMobile = document.getElementById('logoutBtnMobile');
        if (logoutBtnMobile) {
            logoutBtnMobile.style.display = 'block';
            console.log('✓ Mobile logout button displayed');
        } else {
            console.warn('⚠️ Mobile logout button not found in DOM');
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
}

// ============================================================================
// TRIAL BANNER
// ============================================================================
async function initTrialBanner() {
    try {
        // Wait until auth and subscription code ready
        let retries = 0;
        while ((!window.authInitialized || !window.Subscription || typeof window.Subscription.init !== 'function') && retries < 50) {
            await new Promise(r => setTimeout(r, 100));
            retries++;
        }

        if (!window.authInitialized || !window.Subscription) return;

        // Initialize subscription state (safe to call repeatedly)
        await window.Subscription.init();

        // Show banner only when trial active
        if (typeof window.Subscription.isTrialActive === 'function' && window.Subscription.isTrialActive()) {
            const banner = document.getElementById('trialBanner');
            if (!banner) return;
            const timeReadable = window.Subscription.getSubscriptionTimeReadable();
            banner.style.display = 'block';
            banner.style.background = '#fff7ed';
            banner.style.border = '1px solid #ffd89b';
            banner.style.padding = '12px 16px';
            banner.style.borderRadius = '8px';
            banner.style.margin = '12px 0';
            banner.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="font-size:20px;">⏳</div>
                        <div>
                            <strong>Your 24-hour free trial is active</strong>
                            <div style="font-size:13px;color:#444;">Access to tests only — expires in <span class="trial-remaining">${timeReadable}</span></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button id="trialUpgradeBtn" style="background:#667eea;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:600;">Upgrade</button>
                        <button id="trialDismissBtn" style="background:transparent;border:none;color:#666;padding:8px 12px;cursor:pointer;">Dismiss</button>
                    </div>
                </div>
            `;

            // Wire buttons
            const upgradeBtn = document.getElementById('trialUpgradeBtn');
            const dismissBtn = document.getElementById('trialDismissBtn');
            if (upgradeBtn) upgradeBtn.addEventListener('click', () => window.Subscription.showPricingModal());
            if (dismissBtn) dismissBtn.addEventListener('click', () => window.Subscription.dismissTrialBanner());

            // Start live countdown using shared function
            if (window.Subscription && typeof window.Subscription.startTrialBannerCountdown === 'function') {
                window.Subscription.startTrialBannerCountdown(banner);
            }
        }
    } catch (err) {
        console.error('Error initializing trial banner:', err);
    }
}

// NOTE: countdown and dismiss functions are provided by window.Subscription

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        // Disable both logout buttons
        const logoutBtnDesktop = document.getElementById('logoutBtn');
        if (logoutBtnDesktop) logoutBtnDesktop.disabled = true;
        
        const logoutBtnMobile = document.getElementById('logoutBtnMobile');
        if (logoutBtnMobile) logoutBtnMobile.disabled = true;
        
        console.log('Logging out...');
        const result = await logout();
        
        if (result.success) {
            console.log('✓ Logged out successfully');
            // Redirect to login
            window.location.href = 'login.html';
        } else {
            console.error('Logout failed:', result.error);
            alert('Logout failed. Please try again.');
            if (logoutBtnDesktop) logoutBtnDesktop.disabled = false;
            if (logoutBtnMobile) logoutBtnMobile.disabled = false;
        }
    } catch (error) {
        console.error('Error during logout:', error);
        const logoutBtnDesktop = document.getElementById('logoutBtn');
        const logoutBtnMobile = document.getElementById('logoutBtnMobile');
        if (logoutBtnDesktop) logoutBtnDesktop.disabled = false;
        if (logoutBtnMobile) logoutBtnMobile.disabled = false;
    }
}

// ============================================================================
// FREE TEST COUNTER DISPLAY
// ============================================================================

async function displayFreeTestCounter(user) {
    try {
        const freeTestCounter = document.getElementById('freeTestCounter');
        const freeTestText = document.getElementById('freeTestText');
        const upgradeBtn = document.getElementById('upgradeBtn');

        if (!freeTestCounter || !freeTestText || !upgradeBtn) return;

        // Source of truth: Subscription module + metadata counters
        if (window.Subscription && typeof window.Subscription.init === 'function') {
            await window.Subscription.init();
        }

        const isPremium = window.Subscription && typeof window.Subscription.isPremium === 'function'
            ? window.Subscription.isPremium()
            : false;
        const freeTestsUsed = window.Subscription && typeof window.Subscription.getFreeTestsUsed === 'function'
            ? window.Subscription.getFreeTestsUsed()
            : 0;
        const freeTestLimit = 6;
        const remaining = freeTestLimit - freeTestsUsed;

        // Don't show counter for premium users
        if (isPremium) {
            freeTestCounter.style.display = 'none';
            return;
        }

        // Show counter for free users
        freeTestCounter.style.display = 'block';

        if (remaining > 0) {
            freeTestText.textContent = `Free tests remaining: ${remaining}/${freeTestLimit}`;
            upgradeBtn.style.display = 'none';
        } else {
            freeTestText.textContent = 'You have used all your free tests';
            upgradeBtn.style.display = 'block';
        }

        // Add upgrade button handler
        upgradeBtn.addEventListener('click', () => {
            if (window.Subscription && typeof window.Subscription.showPricingModal === 'function') {
                window.Subscription.showPricingModal();
            } else {
                console.log('Open pricing modal');
            }
        });

        console.log('✓ Free test counter displayed:', { freeTestsUsed, remaining, isPremium });

    } catch (error) {
        console.error('Error displaying free test counter:', error);
    }
}

// ============================================================================
// THEME TOGGLE HANDLER
// ============================================================================

/**
 * Setup theme toggle for both desktop and mobile buttons
 */
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    const mobileThemeToggle = document.getElementById('mobileThemeToggle');
    
    // Desktop theme toggle
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
        console.log('✓ Desktop theme toggle attached');
    }
    
    // Mobile theme toggle (in hamburger menu)
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', toggleTheme);
        console.log('✓ Mobile theme toggle attached');
    }
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme(e) {
    if (e) e.preventDefault();
    
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Update theme attribute
    html.setAttribute('data-theme', newTheme);
    
    // Save to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Update all theme icons
    const themeIcons = document.querySelectorAll('.theme-icon');
    themeIcons.forEach(icon => {
        icon.textContent = newTheme === 'light' ? '🌙' : '☀️';
    });
    
    console.log(`🎨 Theme switched to: ${newTheme}`);
}

// ============================================================================
// HAMBURGER MENU HANDLER - MOBILE NAVIGATION
// ============================================================================


