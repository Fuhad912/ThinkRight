/**
 * THINKRIGHT - SYLLABUS PAGE APPLICATION
 * 
 * This module handles the syllabus download page including:
 * - Authentication check (redirects to login if not authenticated)
 * - Hamburger menu initialization for mobile
 * - PDF preview functionality (opens in new tab)
 * - Dark/light theme toggle
 * 
 * User Flow:
 * 1. Check if user is logged in (if not, redirect to login.html)
 * 2. User arrives at syllabus.html
 * 3. Sees 9 subject syllabus cards with download buttons
 * 4. Clicks "View Syllabus" to preview PDF in new tab
 * 5. Can use dashboard link or return to practice tests
 */

// ============================================================================
// DOM REFERENCES
// ============================================================================

const viewButtons = document.querySelectorAll('.view-btn');
const logoutBtnDesktop = document.getElementById('logoutBtn');
const logoutBtnMobile = document.getElementById('logoutBtnMobile');

// ============================================================================
// INITIALIZATION
// 
// Run when page loads to verify authentication and setup interactions.
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎓 Syllabus page loaded');
    
    // Check authentication first (must be done before anything else)
    await checkAuth();
    console.log('✅ Auth check complete');
    
    // Initialize subscription system and check syllabus access
    await window.Subscription?.init();
    if (window.Subscription && typeof window.Subscription.ensureSubscriptionValid === 'function') {
        await window.Subscription.ensureSubscriptionValid().catch(() => null);
    }
    if (window.Subscription && typeof window.Subscription.refreshMetadata === 'function') {
        await window.Subscription.refreshMetadata().catch(() => null);
    }
    const accessStatus = window.Subscription?.getAccessStatus();
    console.log('📊 Access Status:', accessStatus);
    
    // Always allow access to syllabus page, but lock individual subjects for free users
    const isPremium = window.Subscription?.isPremium();
    console.log('👑 User is premium:', isPremium);
    
    // Initialize hamburger menu for mobile
    initHamburgerMenu();
    console.log('✅ Hamburger menu initialized');
    
    // Initialize syllabus view buttons
    const premiumForSyllabus = await resolvePremiumStatusForSyllabus();
    initSyllabusButtons(premiumForSyllabus);
    console.log('✅ Syllabus buttons initialized');
    
    // Setup logout handlers
    setupLogoutHandlers();
    console.log('✅ Logout handlers setup');
    
    // Setup theme toggle
    setupThemeToggle();
    console.log('✅ Theme toggle setup');
    
    // Animate page load
    animatePageLoad();
    console.log('✅ Page animations complete');
    
    console.log('✅ Syllabus page ready');
});

async function resolvePremiumStatusForSyllabus() {
    try {
        const base = window.Subscription && typeof window.Subscription.isPremium === 'function'
            ? !!window.Subscription.isPremium()
            : false;
        if (base) return true;

        // Canonical fallback: read subscriptions row directly.
        if (!window.supabase || typeof getCurrentUser !== 'function') return base;
        const user = await getCurrentUser();
        if (!user) return base;

        const { data, error } = await window.supabase
            .from('subscriptions')
            .select('plan,status,expires_at,updated_at')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('subscriptions premium fallback read failed:', error);
            // Unknown state (fail-open in UI, enforce on click).
            return null;
        }
        if (!data) return base;

        const status = (data.status || 'active').toString().trim().toLowerCase();
        const rawPlan = (data.plan || '').toString().trim().toLowerCase();
        const compactPlan = rawPlan.replace(/\\s+/g, '').replace(/_/g, '-');
        const normalizedPlan = compactPlan === 'quarterly' ? '3-month' : compactPlan;
        const isPaidPlan = normalizedPlan === 'monthly' || normalizedPlan === '3-month' || normalizedPlan === 'admin';
        const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();

        return status === 'active' && isPaidPlan && notExpired;
    } catch (err) {
        console.warn('resolvePremiumStatusForSyllabus error:', err);
        return null;
    }
}

/**
 * Show locked syllabus message to trial/unpaid users
 */
function showSyllabusLockedMessage() {
    const pageContent = document.querySelector('.syllabus-content') || document.querySelector('main');
    
    if (!pageContent) return;
    
    pageContent.innerHTML = `
        <div class="syllabus-locked" style="margin: 3rem auto; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
            <h2 style="margin-top: 0; color: var(--color-accent);">Syllabus is a Premium Feature</h2>
            <p style="font-size: 1.1rem; color: var(--color-text-secondary); margin-bottom: 2rem;">
                Upgrade to the 3-month subscription plan to unlock exclusive syllabus PDFs and study materials.
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                <button id="syllabusUpgradeBtn" type="button"
                        style="background: var(--color-accent); color: white; border: none; padding: 0.875rem 2rem; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1rem;">
                    Upgrade Now
                </button>
                <button id="syllabusBackBtn" type="button"
                        style="background: transparent; color: var(--color-accent); border: 2px solid var(--color-accent); padding: 0.75rem 2rem; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1rem;">
                    Back to Tests
                </button>
            </div>
        </div>
    `;

    // CSP-safe wiring (no inline onclick).
    const upgradeBtn = document.getElementById('syllabusUpgradeBtn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => {
            if (window.Subscription && typeof window.Subscription.showPricingModal === 'function') {
                window.Subscription.showPricingModal();
            } else if (window.Subscription && typeof window.Subscription.showPaywallModal === 'function') {
                window.Subscription.showPaywallModal('syllabus');
            }
        });
    }

    const backBtn = document.getElementById('syllabusBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
}

// ============================================================================
// SYLLABUS BUTTON HANDLER
// 
// Open PDF files in new tabs for preview.
// ============================================================================

/**
 * Initialize view syllabus button event listeners
 */
function initSyllabusButtons(premiumOverride) {
    const isPremium = typeof premiumOverride === 'boolean'
        ? premiumOverride
        : window.Subscription?.isPremium();
    const freeSubjects = ['Use-of-English.pdf', 'Mathematics.pdf'];
    
    viewButtons.forEach(button => {
        const filename = button.getAttribute('data-file');
        const isFreeSubject = freeSubjects.includes(filename);

        // Reset any previous lock state before applying current rules.
        button.disabled = false;
        button.style.background = '';
        button.style.cursor = '';
        const syllabusItem = button.closest('.syllabus-item');
        if (syllabusItem) {
            const existingOverlay = syllabusItem.querySelector('.locked-overlay');
            if (existingOverlay) existingOverlay.remove();
        }
        
        if (!isPremium && !isFreeSubject) {
            // Lock button for free users
            button.disabled = true;
            button.textContent = '🔒 Premium Only';
            button.style.background = '#ccc';
            button.style.cursor = 'not-allowed';
            
            // Add locked overlay to the syllabus item
            if (syllabusItem) {
                const overlay = document.createElement('div');
                overlay.className = 'locked-overlay';
                overlay.innerHTML = `
                    <div class="locked-content">
                        <div class="lock-icon">🔒</div>
                        <div class="lock-text">Premium Required</div>
                        <div class="lock-subtext">Upgrade to access this syllabus</div>
                    </div>
                `;
                syllabusItem.appendChild(overlay);
            }
        } else {
            // Enable button for premium users or free subjects
            if (button.dataset.bound !== 'true') {
                button.dataset.bound = 'true';
                button.addEventListener('click', function() {
                    handleViewSyllabus(filename);
                });
            }
        }
    });
    
    console.log(`✓ Initialized ${viewButtons.length} syllabus view buttons (${isPremium ? 'all enabled' : 'free subjects enabled'})`);
}

/**
 * Handle View Syllabus button click
 * Opens PDF in new tab for preview
 * 
 * @param {string} filename - PDF filename (e.g., 'Use-of-English.pdf')
 */
function handleViewSyllabus(filename) {
    const pdfPath = `assets/syllabus/${filename}`;
    
    // Open PDF in new tab
    const newWindow = window.open(pdfPath, '_blank');
    
    if (newWindow) {
        console.log(`✓ Opened syllabus: ${filename}`);
        // Browser's security will handle the new tab
    } else {
        console.error(`⚠️ Failed to open syllabus: ${filename}`);
        // Fallback: try direct download if new tab blocked
        const link = document.createElement('a');
        link.href = pdfPath;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ============================================================================
// LOGOUT HANDLER
// ============================================================================

/**
 * Setup logout button event listeners
 */
function setupLogoutHandlers() {
    if (logoutBtnDesktop) {
        logoutBtnDesktop.addEventListener('click', handleLogout);
        console.log('✓ Desktop logout button listener attached');
    }
    
    if (logoutBtnMobile) {
        logoutBtnMobile.addEventListener('click', handleLogout);
        console.log('✓ Mobile logout button listener attached');
    }
}

/**
 * Handle logout action
 */
async function handleLogout() {
    const logoutBtnDesktop = document.getElementById('logoutBtn');
    const logoutBtnMobile = document.getElementById('logoutBtnMobile');
    
    // Disable buttons during logout
    if (logoutBtnDesktop) logoutBtnDesktop.disabled = true;
    if (logoutBtnMobile) logoutBtnMobile.disabled = true;
    
    const result = await logout();
    
    if (result.success) {
        console.log('✅ Logged out successfully');
        window.location.href = 'login.html';
    } else {
        console.error('❌ Logout failed:', result.error);
        // Re-enable buttons
        if (logoutBtnDesktop) logoutBtnDesktop.disabled = false;
        if (logoutBtnMobile) logoutBtnMobile.disabled = false;
    }
}

// ============================================================================
// THEME TOGGLE
// ============================================================================

/**
 * Setup theme toggle functionality
 */
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    const mobileThemeToggle = document.getElementById('mobileThemeToggle');
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
    
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', toggleTheme);
    }
    
    // Load saved theme preference - use standard 'theme' key
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    console.log(`🎨 Theme switched to: ${newTheme}`);
}

/**
 * Apply theme to the document
 * 
 * @param {string} theme - 'light' or 'dark'
 */
function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    
    // Update icon
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
    }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

/**
 * Animate page load with staggered card entrance
 */
function animatePageLoad() {
    const syllabusItems = document.querySelectorAll('.syllabus-item');
    const welcomeSection = document.querySelector('.welcome-section');
    
    // Only animate if GSAP is available and there are items to animate
    if (typeof gsap === 'undefined' || !syllabusItems.length) {
        console.log('⚠️ GSAP not available or no cards found, skipping animations');
        return;
    }
    
    // Animate title (fade in from top)
    if (welcomeSection) {
        gsap.fromTo(welcomeSection, 
            { opacity: 0, y: -20 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
        );
    }
    
    // Stagger animate cards (fade in from bottom)
    gsap.fromTo(syllabusItems,
        { opacity: 0, y: 20 },
        { 
            opacity: 1, 
            y: 0,
            duration: 0.5,
            stagger: 0.08,
            ease: 'power2.out',
            delay: 0.2
        }
    );
    
    console.log(`✓ Animated ${syllabusItems.length} syllabus cards`);
}

/**
 * Add hover lift effect to syllabus cards
 */
function addCardHoverAnimations() {
    const syllabusItems = document.querySelectorAll('.syllabus-item');
    
    syllabusItems.forEach(card => {
        card.addEventListener('mouseenter', function() {
            gsap.to(this, {
                duration: 0.3,
                y: -8,
                boxShadow: '0 12px 24px rgba(0,0,0,0.15)',
                ease: 'power2.out'
            });
        });
        
        card.addEventListener('mouseleave', function() {
            gsap.to(this, {
                duration: 0.3,
                y: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                ease: 'power2.out'
            });
        });
    });
}

// Log completion
console.log('📄 syllabus.js module loaded');
