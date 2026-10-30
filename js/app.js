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
    const cards = document.querySelectorAll('.subject-card');
    cards.forEach(card => {
        card.addEventListener('click', handleSubjectClick);
    });

    // Also attach delegated click handler on .subjects-grid for maximum resilience
    const grid = document.querySelector('.subjects-grid');
    if (grid) {
        grid.addEventListener('click', (event) => {
            const card = event.target.closest('.subject-card');
            if (card && !card.__tr_handled) {
                handleSubjectClick.call(card, event);
            }
        });
    }
}

/**
 * Handle subject card click
 * 
 * @param {Event} event - Click event
 */
function handleSubjectClick(event) {
    if (event) {
        event.stopPropagation();
    }
    const card = this && this.getAttribute ? this : (event && event.target ? event.target.closest('.subject-card') : null);
    if (!card) return;

    // Prevent rapid multiple clicks
    card.__tr_handled = true;
    setTimeout(() => { card.__tr_handled = false; }, 500);

    const rawSubject = card.getAttribute('data-subject');
    const subject = typeof normalizeSubject === 'function'
        ? normalizeSubject(rawSubject)
        : rawSubject;
    
    if (!subject) {
        console.error('Subject not found on clicked card:', card);
        return;
    }

    // Show confirmation modal before going to test page
    if (typeof window.showTestConfirmationModal === 'function') {
        window.showTestConfirmationModal(subject, {
            sourceCard: card
        });
        return;
    }

    // Fallback if modal is unavailable
    if (window.StorageManager && typeof window.StorageManager.setSelectedSubject === 'function') {
        StorageManager.setSelectedSubject(subject);
    } else {
        localStorage.setItem('selected_subject', subject);
    }
    
    try {
        card.disabled = true;
        card.style.opacity = '0.6';
    } catch (e) {
        // ignore
    }
    
    try {
        animateNavigation(card);
    } catch (animErr) {
        console.warn('Animation error:', animErr);
    }
    
    setTimeout(() => {
        window.location.href = 'test.html';
    }, 250);
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
 */
function animateNavigation(card) {
    if (!window.gsap) return;
    try {
        // Animate the selected card
        gsap.to(card, {
            duration: 0.3,
            scale: 1.05,
            ease: 'back.out'
        });

        // Fade out other cards
        const allCards = document.querySelectorAll('.subject-card');
        allCards.forEach(c => {
            if (c !== card) {
                gsap.to(c, {
                    duration: 0.2,
                    opacity: 0.3
                });
            }
        });
    } catch (e) {
        console.warn('GSAP navigation animation error:', e);
    }
}

/**
 * Animate page on load
 * 
 * Creates a pleasant entrance animation with staggered elements.
 */
function animatePageLoad() {
    if (!window.gsap) return;
    try {
        // Animate header
        gsap.fromTo('.header',
            { opacity: 0, y: -30 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
        );

        // Animate welcome section
        const welcome = document.querySelector('.welcome-section');
        if (welcome) {
            gsap.fromTo(welcome,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.6, delay: 0.1, ease: 'power2.out' }
            );
        }

        // Animate subject cards with stagger
        const cards = document.querySelectorAll('.subject-card');
        if (cards.length > 0) {
            gsap.fromTo(cards,
                { opacity: 0, scale: 0.9 },
                {
                    opacity: 1,
                    scale: 1,
                    duration: 0.5,
                    delay: 0.2,
                    stagger: 0.05,
                    ease: 'back.out'
                }
            );
        }

        // Animate info section
        const info = document.querySelector('.info-section');
        if (info) {
            gsap.fromTo(info,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5, delay: 0.4, ease: 'power2.out' }
            );
        }

        // Animate footer
        gsap.fromTo('.footer',
            { opacity: 0 },
            { opacity: 1, duration: 0.5, delay: 0.5 }
        );
    } catch (e) {
        console.warn('animatePageLoad error:', e);
    }
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
    if (!window.gsap) return;
    if (document.body && document.body.classList.contains('page-practice')) {
        return; // Remove hover effect on subject cards per design refinement
    }
    const cards = document.querySelectorAll('.subject-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            try {
                if (window.gsap) {
                    gsap.to(card, {
                        duration: 0.3,
                        scale: 1.02,
                        ease: 'power2.out'
                    });
                }
            } catch (e) {}
        });

        card.addEventListener('mouseleave', () => {
            try {
                if (window.gsap) {
                    gsap.to(card, {
                        duration: 0.3,
                        scale: 1,
                        ease: 'power2.out'
                    });
                }
            } catch (e) {}
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

    // Log for debugging (remove in production)
    console.log(`Subject selection ready. Available subjects: ${subjectCards.length}`);
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

    const header = document.querySelector('.header');
    if (!header) {
        console.error('Header element not found for hamburger menu');
        return;
    }

    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        header.classList.toggle('open');
        console.log('Hamburger toggled. Open:', header.classList.contains('open'));
    });

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

    document.addEventListener('click', function(e) {
        if (header.classList.contains('open') && !header.contains(e.target)) {
            header.classList.remove('open');
        }
    });

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
    }
}

/**
 * Setup theme toggle
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
