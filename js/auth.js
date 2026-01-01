/**
 * THINKRIGHT - SUPABASE AUTHENTICATION MODULE
 * 
 * This module handles:
 * - Supabase initialization (CDN-loaded supabase-js)
 * - Email/password sign up
 * - Email/password login
 * - Session persistence
 * - User identity management
 * - Logout functionality
 * 
 * IMPORTANT: Only handles authentication. Does NOT touch questions, timers, or UI logic.
 * All questions still load from local JSON files.
 * 
 * SETUP REQUIRED:
 * 1. Create Supabase account at https://supabase.com
 * 2. Create a new project
 * 3. Enable Email/Password authentication
 * 4. Copy your SUPABASE_URL and SUPABASE_ANON_KEY
 * 5. Paste them in the config object below
 * 
 * FUTURE: Phase 2 will add:
 * - Email verification
 * - Password reset
 * - OAuth providers (Google, GitHub)
 * - User profiles database
 * - Analytics tracking
 */

// ============================================================================
// SUPABASE CONFIGURATION
// 
// Add your credentials from Supabase project settings
// ============================================================================

const SUPABASE_CONFIG = {
    // IMPORTANT: Replace these with your actual Supabase credentials
    // Get from: Supabase Dashboard → Settings → API
    URL: 'https://hqroqfkabptqwpqpplln.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxcm9xZmthYnB0cXdwcXBwbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDU5OTgsImV4cCI6MjA4MjY4MTk5OH0.pVci7zzscJsD1UJDAYgCV2UOSxdMLuMvYntWB5EDVzo',
};

// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// 
// Initialize the Supabase client using the CDN-loaded library.
// This is loaded in the HTML via script tag before this module.
// ============================================================================

let supabase = null;
window.authInitialized = false; // Global flag to track if Supabase is initialized

/**
 * Initialize Supabase client
 * 
 * This should be called once on app startup (in utils.js DOMContentLoaded).
 * Uses the global `window.supabase` object loaded via CDN.
 * 
 * @returns {boolean} True if initialization successful
 */
function initSupabase() {
    try {
        console.log('🔄 Initializing Supabase...');
        
        // Check if credentials are set
        if (!SUPABASE_CONFIG.URL || !SUPABASE_CONFIG.ANON_KEY) {
            console.error('❌ Supabase credentials not configured');
            return false;
        }

        // Check if Supabase library is available (loaded via CDN)
        if (!window.supabase || !window.supabase.createClient) {
            console.error('❌ Supabase library not loaded. Retrying...');
            return false;
        }

        // Initialize Supabase client
        supabase = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
        window.authInitialized = true;
        console.log('✅ Supabase initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing Supabase:', error);
        return false;
    }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// 
// Core auth operations: sign up, login, logout, session management.
// ============================================================================

/**
 * Sign up a new user with email, password, and username
 * 
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} username - User's display name
 * @returns {Promise<Object>} Result object with success status and data/error
 * 
 * Returns:
 * - { success: true, user: {...} } on successful signup
 * - { success: false, error: '...' } on failure
 * 
 * NOTE: Configured for instant login (no email confirmation required).
 * Phase 2 can add email verification if needed.
 * Username is stored in user metadata.
 */
async function signUp(email, password, username) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        // Validate input
        if (!email || !password || !username) {
            return { success: false, error: 'Email, password, and username required' };
        }

        if (username.trim().length < 2) {
            return { success: false, error: 'Username must be at least 2 characters' };
        }

        if (username.trim().length > 30) {
            return { success: false, error: 'Username must not exceed 30 characters' };
        }

        if (password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        if (!isValidEmail(email)) {
            return { success: false, error: 'Invalid email format' };
        }

        // Sign up with Supabase
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username.trim()
                }
            }
        });

        if (error) {
            console.error('❌ Supabase signup error:', error);
            // Handle common errors
            if (error.message.includes('already registered')) {
                return { success: false, error: 'Email already registered. Please login.' };
            }
            return { success: false, error: error.message };
        }

        if (!data || !data.user) {
            console.error('❌ No user data returned from signup');
            return { success: false, error: 'Signup failed - no user data received' };
        }

        // Store username in localStorage for easy access
        localStorage.setItem('thinkright_username', username.trim());

        console.log('✓ User signed up successfully:', data.user.email);
        return { success: true, user: data.user };
    } catch (error) {
        console.error('Error signing up:', error);
        return { success: false, error: error.message || 'Signup failed' };
    }
}

/**
 * Login user with email and password
 *  * Retrieves username from user metadata on successful login
 * and stores it in localStorage.
 *  * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} Result object with success status and data/error
 * 
 * Returns:
 * - { success: true, user: {...}, session: {...} } on successful login
 * - { success: false, error: '...' } on failure
 */
async function login(email, password) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        // Validate input
        if (!email || !password) {
            return { success: false, error: 'Email and password required' };
        }

        // Login with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // Handle common errors
            if (error.message.includes('Invalid login credentials')) {
                return { success: false, error: 'Invalid email or password' };
            }
            return { success: false, error: error.message };
        }

        // Store username from user metadata in localStorage
        if (data.user.user_metadata && data.user.user_metadata.username) {
            localStorage.setItem('thinkright_username', data.user.user_metadata.username);
        } else {
            // Fallback to email if username not available
            localStorage.setItem('thinkright_username', data.user.email);
        }

        console.log('✓ User logged in successfully:', data.user.email);
        return { success: true, user: data.user, session: data.session };
    } catch (error) {
        console.error('Error logging in:', error);
        return { success: false, error: error.message || 'Login failed' };
    }
}

/**
 * Logout the current user
 * 
 * @returns {Promise<Object>} Result object with success status
 * 
 * Returns:
 * - { success: true } on successful logout
 * - { success: false, error: '...' } on failure
 */
async function logout() {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        const { error } = await supabase.auth.signOut();

        if (error) {
            return { success: false, error: error.message };
        }

        console.log('✓ User logged out successfully');
        return { success: true };
    } catch (error) {
        console.error('Error logging out:', error);
        return { success: false, error: error.message || 'Logout failed' };
    }
}

// ============================================================================
// SESSION & USER MANAGEMENT
// 
// Get current user, check authentication status, watch for changes.
// ============================================================================

/**
 * Get the currently logged-in user
 * 
 * This retrieves the session from Supabase auth state.
 * Works even after page refresh (Supabase handles persistence).
 * 
 * @returns {Promise<Object|null>} User object or null if not logged in
 */
async function getCurrentUser() {
    try {
        if (!supabase) {
            return null;
        }

        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
            return null;
        }

        return data.user;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Check if user is currently authenticated
 * 
 * @returns {Promise<boolean>} True if user is logged in
 */
async function isAuthenticated() {
    const user = await getCurrentUser();
    return user !== null;
}

/**
 * Get current session (access token, refresh token, etc.)
 * 
 * Useful for making authenticated API calls in Phase 2.
 * 
 * @returns {Promise<Object|null>} Session object or null
 */
async function getSession() {
    try {
        if (!supabase) {
            return null;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session) {
            return null;
        }

        return data.session;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

/**
 * Watch for authentication state changes
 * 
 * Useful for:
 * - Updating UI when user logs in/out
 * - Redirecting on logout
 * - Syncing auth state across tabs
 * 
 * @param {Function} callback - Function to call when auth state changes
 *   Receives: { event, session } where event is 'SIGNED_IN', 'SIGNED_OUT', etc.
 * 
 * @returns {Function} Unsubscribe function to stop listening
 */
function onAuthStateChange(callback) {
    if (!supabase) {
        console.warn('Supabase not initialized for auth state watching');
        return () => {};
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        callback({ event, session });
    });

    // Return unsubscribe function
    return () => subscription.unsubscribe();
}

// ============================================================================
// VALIDATION HELPERS
// 
// Validate user input before sending to Supabase.
// ============================================================================

/**
 * Validate email format
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 * 
 * Requirements:
 * - At least 6 characters
 * - At least one uppercase letter
 * - At least one number
 * 
 * @param {string} password - Password to validate
 * @returns {Object} { isValid: boolean, message: string }
 */
function validatePassword(password) {
    if (password.length < 6) {
        return { isValid: false, message: 'Password must be at least 6 characters' };
    }

    if (!/[A-Z]/.test(password)) {
        return { isValid: false, message: 'Password must contain at least one uppercase letter' };
    }

    if (!/\d/.test(password)) {
        return { isValid: false, message: 'Password must contain at least one number' };
    }

    return { isValid: true, message: 'Password is valid' };
}

// ============================================================================
// REDIRECT HELPERS
// 
// Help with navigation after auth events.
// ============================================================================

/**
 * Redirect to login if not authenticated
 * 
 * Useful for protecting pages.
 * Call this on protected pages (index.html, test.html).
 * 
 * @param {string} nextUrl - Optional: URL to redirect to after login
 *   If provided, will append as ?next= parameter
 */
async function requireAuth(nextUrl = null) {
    const user = await getCurrentUser();

    if (!user) {
        // Redirect to login
        let loginUrl = 'login.html';
        if (nextUrl) {
            loginUrl += `?next=${encodeURIComponent(nextUrl)}`;
        }
        window.location.href = loginUrl;
    }
}

/**
 * Get the 'next' URL from query parameters
 * 
 * Useful on login/signup pages to redirect back to original page.
 * 
 * @returns {string} The 'next' URL if present, or 'index.html' as default
 */
function getNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('next') || 'index.html';
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Format error message for display to user
 * 
 * Makes error messages more user-friendly.
 * 
 * @param {string} errorMessage - Raw error message from Supabase
 * @returns {string} Formatted, user-friendly message
 */
function formatErrorMessage(errorMessage) {
    const errorMap = {
        'Invalid login credentials': 'Email or password is incorrect',
        'already registered': 'Email is already registered',
        'rate_limit_exceeded': 'Too many login attempts. Please try again later',
        'user_not_found': 'User does not exist',
    };

    for (const [key, value] of Object.entries(errorMap)) {
        if (errorMessage.includes(key)) {
            return value;
        }
    }

    return errorMessage || 'An error occurred. Please try again.';
}

// ============================================================================
// OTP AUTHENTICATION FUNCTIONS
// 
// Handle OTP-based authentication for signup verification and passwordless login.
// ============================================================================

/**
 * Sign up with email and password, then send OTP to email
 * 
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} { success: boolean, data, error }
 */
async function signUpWithOTP(email, password) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        if (!email || !password) {
            return { success: false, error: 'Email and password required' };
        }

        if (password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        console.log('🔄 Signing up with OTP:', email);

        // Sign up the user
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (signUpError) {
            console.error('❌ Signup error:', signUpError);
            return { success: false, error: signUpError.message };
        }

        if (!signUpData.user) {
            return { success: false, error: 'Signup failed - no user data' };
        }

        console.log('✓ User created, OTP sent to email:', email);
        return { success: true, data: signUpData };
    } catch (error) {
        console.error('❌ Error in signUpWithOTP:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sign in with email only (passwordless OTP)
 * Sends an OTP code to the user's email
 * 
 * @param {string} email - User's email
 * @returns {Promise<Object>} { success: boolean, error }
 */
async function signInWithOTP(email) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        if (!email) {
            return { success: false, error: 'Email required' };
        }

        console.log('🔄 Sending OTP to:', email);

        const { data, error } = await supabase.auth.signInWithOtp({
            email: email,
        });

        if (error) {
            console.error('❌ OTP send error:', error);
            return { success: false, error: error.message };
        }

        console.log('✓ OTP sent to email:', email);
        return { success: true, data: data };
    } catch (error) {
        console.error('❌ Error sending OTP:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Verify OTP token
 * Used for both signup verification and passwordless login
 * 
 * @param {string} email - User's email
 * @param {string} token - OTP code (6 digits)
 * @returns {Promise<Object>} { success: boolean, user, error }
 */
async function verifyOTP(email, token) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        if (!email || !token) {
            return { success: false, error: 'Email and OTP code required' };
        }

        console.log('🔄 Verifying OTP for:', email);

        const { data, error } = await supabase.auth.verifyOtp({
            email: email,
            token: token,
            type: 'email', // Can be 'email' for signup or 'recovery' for password reset
        });

        if (error) {
            console.error('❌ OTP verification error:', error);
            return { success: false, error: error.message };
        }

        if (!data.user) {
            return { success: false, error: 'Verification failed - no user data' };
        }

        console.log('✓ OTP verified successfully for:', email);
        return { success: true, user: data.user };
    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// EXPORT FOR TESTING
// 
// Make functions available globally for debugging in browser console.
// Remove in production if desired.
// ============================================================================

window.ThinkRightAuth = {
    initSupabase,
    signUp,
    login,
    logout,
    getCurrentUser,
    isAuthenticated,
    getSession,
    onAuthStateChange,
    requireAuth,
    getNextUrl,
};

// Make auth functions globally available for easy access
window.signUp = signUp;
window.login = login;
window.logout = logout;
window.getCurrentUser = getCurrentUser;
window.isAuthenticated = isAuthenticated;
window.getSession = getSession;
window.onAuthStateChange = onAuthStateChange;

console.log('✓ Auth module loaded. Available at window.ThinkRightAuth');
