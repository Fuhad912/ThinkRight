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
        // Expose the initialized client on window for other modules that expect window.supabase
        try {
            window.supabase = supabase;
        } catch (e) {
            console.warn('Could not set window.supabase to client:', e);
        }
        // Provide a simple global logout handler for other modules
        try {
            window.handleLogout = async function() {
                try {
                    await logout();
                } catch (e) {
                    console.warn('logout error', e);
                }
                window.location.href = 'login.html';
            };
        } catch (e) {
            console.warn('Could not set window.handleLogout:', e);
        }
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
 * - { success: true, user: {...}, needsConfirmation: true } on successful signup
 * - { success: false, error: '...' } on failure
 * 
 * NOTE: Email confirmation is REQUIRED. User must confirm email before logging in.
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
        console.log('📝 Attempting to sign up with email:', email.toLowerCase());
        
        const { data, error } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
            options: {
                data: {
                    username: username.trim()
                }
            }
        });

        if (error) {
            console.error('❌ Supabase signup error:', error);
            console.error('Error message:', error.message);
            console.error('Error status:', error.status);
            console.error('Error code:', error.code);
            console.error('Full error object:', JSON.stringify(error, null, 2));
            
            const errorMessage = (error.message || '').toLowerCase();
            
            // Check for duplicate email errors
            if (errorMessage.includes('already registered') || 
                errorMessage.includes('user already exists') ||
                errorMessage.includes('duplicate') ||
                errorMessage.includes('email already') ||
                error.code === 'user_already_exists' ||
                error.code === 'email_exists') {
                return { success: false, error: 'This email is already registered. Please log in or check your email for confirmation.' };
            }
            
            return { success: false, error: error.message || 'Signup failed' };
        }

        if (!data || !data.user) {
            console.error('❌ No user data returned from signup');
            return { success: false, error: 'Signup failed - no user data received' };
        }

        // Create user_profile and subscription records in database
        try {
            const userId = data.user.id;
            
            // Create user profile
            const { error: profileError } = await supabase
                .from('user_profiles')
                .insert({
                    id: userId,
                    email: email.trim().toLowerCase(),
                    username: username.trim(),
                    is_premium: false
                });
            
            if (profileError) {
                console.warn('⚠️ Profile creation warning:', profileError);
                // Don't fail signup if profile creation fails
            } else {
                console.log('✅ User profile created');
            }
            
            // Create free subscription record
            const { error: subError } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: userId,
                    plan: 'free',
                    status: 'active',
                    started_at: new Date().toISOString(),
                    expires_at: null
                }, {
                    onConflict: 'user_id'
                });
            
            if (subError) {
                console.warn('⚠️ Subscription creation warning:', subError);
            } else {
                console.log('✅ Free subscription created');
            }
        } catch (dbError) {
            console.warn('⚠️ Database setup warning:', dbError);
            // Don't block signup if database operations fail
        }

        // Success - user created and confirmation email sent
        console.log('✓ User account created. Confirmation email sent to:', data.user.email);
        return { 
            success: true, 
            user: data.user,
            needsConfirmation: true,
            email: data.user.email
        };
    } catch (error) {
        console.error('Error signing up:', error);
        return { success: false, error: error.message || 'Signup failed' };
    }
}

/**
 * Login user with email and password
 * 
 * Requires email confirmation before login succeeds.
 * Retrieves username from user metadata on successful login
 * and stores it in localStorage.
 * 
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} Result object with success status and data/error
 * 
 * Returns:
 * - { success: true, user: {...}, session: {...} } on successful login
 * - { success: false, error: '...' } on failure
 * - { success: false, error: 'Please confirm your email before logging in.' } if unconfirmed
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
        console.log('🔐 Attempting to login with email:', email);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password,
        });

        if (error) {
            console.error('❌ Login error:', error);
            console.error('Error message:', error.message);
            
            // Handle invalid credentials
            if (error.message.includes('Invalid login credentials')) {
                return { success: false, error: 'Invalid email or password' };
            }
            
            // Handle unconfirmed email
            if (error.message.includes('Email not confirmed') || 
                error.message.includes('email_not_confirmed') ||
                error.message.includes('unconfirmed')) {
                return { success: false, error: 'Please confirm your email before logging in.' };
            }
            
            return { success: false, error: error.message };
        }

        if (!data || !data.user) {
            console.error('❌ No user data returned from login');
            return { success: false, error: 'Login failed - no user data received' };
        }

        // STRICT: Check if email is confirmed - absolutely required
        if (!data.user.email_confirmed_at) {
            console.warn('⚠️ BLOCKED: Email not confirmed for:', data.user.email);
            console.warn('⚠️ Confirmation timestamp:', data.user.email_confirmed_at);
            // Force logout this unconfirmed session
            await supabase.auth.signOut();
            return { success: false, error: 'Please confirm your email before logging in. Check your inbox for the confirmation link.' }
        }
        
        console.log('✓ Email confirmed at:', data.user.email_confirmed_at);

        // Store username from user metadata in localStorage
        if (data.user.user_metadata && data.user.user_metadata.username) {
            localStorage.setItem('thinkright_username', data.user.user_metadata.username);
        } else {
            // Fallback to email if username not available
            localStorage.setItem('thinkright_username', data.user.email);
        }

        // Ensure OTP/password login users always have baseline app rows
        try {
            await ensureUserBootstrapData(data.user);
        } catch (bootstrapError) {
            console.warn('Could not ensure user bootstrap rows:', bootstrapError);
        }


        console.log('✓ User logged in successfully:', data.user.email);
        return { success: true, user: data.user, session: data.session };
    } catch (error) {
        console.error('Error logging in:', error);
        return { success: false, error: error.message || 'Login failed' };
    }
}

/**
 * Ensure a default subscription row exists for a user.
 * Does not downgrade existing paid plans.
 *
 * @param {string} userId
 */
async function ensureSubscriptionRow(userId) {
    if (!supabase || !userId) return;

    const { data: existing, error: readError } = await supabase
        .from('subscriptions')
        .select('user_id, plan, status')
        .eq('user_id', userId)
        .maybeSingle();

    if (readError) {
        console.warn('Subscription read check failed:', readError);
        return;
    }

    if (existing) return;

    const { error: insertError } = await supabase
        .from('subscriptions')
        .insert({
            user_id: userId,
            plan: 'free',
            status: 'active',
            started_at: new Date().toISOString(),
            expires_at: null
        });

    if (insertError && insertError.code !== '23505') {
        console.warn('Subscription default insert failed:', insertError);
    }
}

/**
 * Derive a fallback username from email for profile bootstrap.
 *
 * @param {string} email
 * @returns {string}
 */
function getEmailUsernameFallback(email) {
    const fallback = String(email || '').split('@')[0].trim();
    if (!fallback) return 'User';
    return fallback.slice(0, 30);
}

/**
 * Ensure a user profile row exists for the authenticated user.
 * This keeps onboarding flags and profile-driven features stable for OTP sign-ins.
 *
 * @param {Object} user
 */
async function ensureUserProfileRow(user) {
    if (!supabase || !user || !user.id) return;

    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    const metadataUsername = String(user.user_metadata?.username || '').trim();
    const fallbackUsername = getEmailUsernameFallback(normalizedEmail);

    const { data: existingProfile, error: readError } = await supabase
        .from('user_profiles')
        .select('id, email, username')
        .eq('id', user.id)
        .maybeSingle();

    if (readError) {
        console.warn('Profile read check failed:', readError);
        return;
    }

    if (!existingProfile) {
        const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({
                id: user.id,
                email: normalizedEmail,
                username: metadataUsername || fallbackUsername
            });

        if (insertError && insertError.code !== '23505') {
            console.warn('Profile default insert failed:', insertError);
        }
        return;
    }

    const profileUpdates = {};
    if (!existingProfile.email && normalizedEmail) {
        profileUpdates.email = normalizedEmail;
    }
    if ((!existingProfile.username || !existingProfile.username.trim()) && (metadataUsername || fallbackUsername)) {
        profileUpdates.username = metadataUsername || fallbackUsername;
    }

    if (Object.keys(profileUpdates).length === 0) return;

    const { error: updateError } = await supabase
        .from('user_profiles')
        .update(profileUpdates)
        .eq('id', user.id);

    if (updateError) {
        console.warn('Profile baseline update failed:', updateError);
    }
}

/**
 * Ensure core per-user rows required by the app are present.
 *
 * @param {Object} user
 */
async function ensureUserBootstrapData(user) {
    if (!user || !user.id) return;
    await ensureSubscriptionRow(user.id);
    await ensureUserProfileRow(user);
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

        // Clear local identity cache to prevent stale UI and fallback state.
        try {
            localStorage.removeItem('thinkright_username');
        } catch (_e) {
            // ignore storage errors
        }

        console.log('✓ User logged out successfully');
        return { success: true };
    } catch (error) {
        console.error('Error logging out:', error);
        return { success: false, error: error.message || 'Logout failed' };
    }
}

// ============================================================================
// PASSWORD RECOVERY
// 
// Handle forgot password flow using Supabase
// ============================================================================

/**
 * Send password reset email to user
 * 
 * Sends an email with a password recovery link to the provided email address.
 * The user clicks the link to reset their password.
 * 
 * @param {string} email - User's email address
 * @returns {Promise<Object>} Result object with success status and error message if any
 */
async function resetPassword(email) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        console.log('Sending password reset email to:', email);

        // Use the correct redirect URL
        const redirectUrl = 'https://thinkright.name.ng/reset-password.html';
        console.log('Reset redirect URL:', redirectUrl);

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
        });

        if (error) {
            console.error('Password reset error:', error);
            return { success: false, error: error.message || 'Failed to send reset email' };
        }

        console.log('✓ Password reset email sent successfully');
        console.log('Email should contain a link with the reset token');
        return { success: true, data };

    } catch (error) {
        console.error('Error in resetPassword:', error);
        return { success: false, error: error.message || 'An error occurred' };
    }
}

/**
 * Update user password (used after clicking reset link)
 * 
 * Called when user is on the password reset page after clicking the email link.
 * 
 * @param {string} newPassword - The new password
 * @returns {Promise<Object>} Result object with success status
 */
async function updatePassword(newPassword) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        const { data, error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) {
            console.error('Password update error:', error);
            return { success: false, error: error.message || 'Failed to update password' };
        }

        console.log('✅ Password updated successfully');
        return { success: true, data };

    } catch (error) {
        console.error('Error in updatePassword:', error);
        return { success: false, error: error.message || 'An error occurred' };
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
// Handle OTP-based authentication for signup/login (web, PWA, Capacitor).
// ============================================================================

// SUPABASE DASHBOARD CHANGES (required for code-first verification emails):
// 1) Authentication -> Providers -> Email:
//    - Keep "Enable Email provider" ON.
//    - Keep "Confirm email" ON.
//      Reason: login/password flow should block unverified users until OTP verification succeeds.
//
// 2) Authentication -> Email Templates -> Confirm signup:
//    - Edit template body to include the token prominently.
//    - Example line:
//      "Your ThinkRight verification code: {{ .Token }}"
//    - Keep/remove {{ .ConfirmationURL }} based on preference, but make code the primary CTA.
//
// 3) Authentication -> Email Templates -> Magic Link:
//    - Edit template body to include the same token line:
//      "Your ThinkRight verification code: {{ .Token }}"
//    - This template is used when signup page triggers resend/send OTP after account creation.
//
// 4) Authentication -> Security / OTP settings:
//    - Keep OTP length/expiry configured in dashboard.
//    - This app expects a 6-digit token input on signup verification UI.

/**
 * Normalize email input used by OTP methods.
 *
 * @param {string} email
 * @returns {string}
 */
function normalizeEmailInput(email) {
    return String(email || '').trim().toLowerCase();
}

/**
 * Convert Supabase OTP errors to clearer messages for UI.
 *
 * @param {Object} error
 * @returns {string}
 */
function formatOtpErrorMessage(error) {
    const rawMessage = String(error?.message || '').toLowerCase();
    const rawCode = String(error?.code || '').toLowerCase();

    if (rawCode === 'otp_expired' || rawMessage.includes('expired')) {
        return 'Code expired. Request a new code and try again.';
    }
    if (rawCode === 'invalid_otp' || rawMessage.includes('invalid') || rawMessage.includes('token')) {
        return 'Invalid code. Check the 6-digit code and try again.';
    }
    if (
        rawCode === 'over_email_send_rate_limit' ||
        rawCode === 'over_request_rate_limit' ||
        rawMessage.includes('rate limit')
    ) {
        return 'Too many attempts. Please wait a moment and retry.';
    }

    return error?.message || 'Unable to complete verification right now.';
}

/**
 * Send a one-time email code for passwordless auth.
 * shouldCreateUser=true supports both first-time signup and existing-user login.
 *
 * @param {string} email
 * @param {Object} [options]
 * @param {boolean} [options.shouldCreateUser=true]
 * @returns {Promise<Object>}
 */
async function sendEmailOtp(email, options = {}) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        const normalizedEmail = normalizeEmailInput(email);
        if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
            return { success: false, error: 'Enter a valid email address.' };
        }

        const shouldCreateUser = options.shouldCreateUser !== false;
        console.log('Sending email OTP:', normalizedEmail, 'shouldCreateUser=', shouldCreateUser);

        const { data, error } = await supabase.auth.signInWithOtp({
            email: normalizedEmail,
            options: {
                shouldCreateUser
            }
        });

        if (error) {
            console.error('OTP send error:', error);
            return { success: false, error: formatOtpErrorMessage(error), rawError: error };
        }

        return { success: true, email: normalizedEmail, data };
    } catch (error) {
        console.error('Error in sendEmailOtp:', error);
        return { success: false, error: error.message || 'Unable to send code right now.' };
    }
}

/**
 * Send signup verification OTP for an already-created email/password account.
 * This keeps login flow as password-based while reusing Supabase OTP delivery.
 *
 * @param {string} email
 * @returns {Promise<Object>}
 */
async function sendSignupVerificationOtp(email) {
    return sendEmailOtp(email, { shouldCreateUser: false });
}

/**
 * Verify OTP code and establish an authenticated session.
 * Uses type:"email" (current Supabase recommendation).
 *
 * @param {string} email
 * @param {string} token
 * @returns {Promise<Object>}
 */
async function verifyEmailOtp(email, token) {
    try {
        if (!supabase) {
            return { success: false, error: 'Supabase not initialized' };
        }

        const normalizedEmail = normalizeEmailInput(email);
        const otpCode = String(token || '').trim();

        if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
            return { success: false, error: 'Enter a valid email address.' };
        }
        if (!/^\d{6}$/.test(otpCode)) {
            return { success: false, error: 'Enter the 6-digit code sent to your email.' };
        }

        const { data, error } = await supabase.auth.verifyOtp({
            email: normalizedEmail,
            token: otpCode,
            type: 'email'
        });

        if (error || !data?.session) {
            console.error('OTP verify error:', error);
            return { success: false, error: formatOtpErrorMessage(error) };
        }

        const user = data.user || (await getCurrentUser());
        if (!user) {
            return { success: false, error: 'Verification succeeded but user session is missing.' };
        }

        // Ensure app-required rows exist for first-time OTP users.
        try {
            await ensureUserBootstrapData(user);
        } catch (bootstrapError) {
            console.warn('OTP bootstrap warning:', bootstrapError);
        }

        try {
            const username = String(user.user_metadata?.username || '').trim() || getEmailUsernameFallback(user.email);
            localStorage.setItem('thinkright_username', username);
        } catch (_storageError) {
            // no-op
        }

        return { success: true, user, session: data.session };
    } catch (error) {
        console.error('Error in verifyEmailOtp:', error);
        return { success: false, error: error.message || 'Unable to verify code right now.' };
    }
}

// Backward-compatible aliases for older callers.
async function signInWithOTP(email) {
    return sendEmailOtp(email, { shouldCreateUser: true });
}

async function signUpWithOTP(email) {
    return sendEmailOtp(email, { shouldCreateUser: true });
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
    sendEmailOtp,
    sendSignupVerificationOtp,
    verifyEmailOtp,
    signInWithOTP,
    signUpWithOTP,
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
window.sendEmailOtp = sendEmailOtp;
window.sendSignupVerificationOtp = sendSignupVerificationOtp;
window.verifyEmailOtp = verifyEmailOtp;
window.signInWithOTP = signInWithOTP;
window.signUpWithOTP = signUpWithOTP;
window.logout = logout;
window.resetPassword = resetPassword;
window.updatePassword = updatePassword;
window.getCurrentUser = getCurrentUser;
window.isAuthenticated = isAuthenticated;
window.getSession = getSession;
window.onAuthStateChange = onAuthStateChange;

console.log('✓ Auth module loaded. Available at window.ThinkRightAuth');

