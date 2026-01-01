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
    const subject = this.getAttribute('data-subject');
    
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
    
    // Check authentication first
    checkAuth();
    
    // Initialize event listeners
    initSubjectSelection();
    
    // Set up logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Add interactive animations
    addCardHoverAnimations();
    
    // Animate page load for pleasant UX
    animatePageLoad();

    // Log for debugging (remove in production)
    console.log('Subject selection ready. Available subjects: Mathematics, English');
});

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

        // User authenticated - show their username and dashboard link
        console.log('✓ User authenticated:', user.email);
        if (userEmail) {
            // Get username from localStorage (stored during login/signup)
            const username = localStorage.getItem('thinkright_username') || user.email;
            userEmail.textContent = username;
        }
        if (userInfo) {
            userInfo.style.display = 'block';
        }
        // Show dashboard link
        const dashboardLink = document.getElementById('dashboardLink');
        if (dashboardLink) {
            dashboardLink.style.display = 'block';
        }
        if (logoutBtn) {
            logoutBtn.style.display = 'block';
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
        logoutBtn.disabled = true;
        
        const result = await logout();
        
        if (result.success) {
            console.log('✓ Logged out successfully');
            // Redirect to login
            window.location.href = 'login.html';
        } else {
            console.error('Logout failed:', result.error);
            alert('Logout failed. Please try again.');
            logoutBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error during logout:', error);
        logoutBtn.disabled = false;
    }
}
