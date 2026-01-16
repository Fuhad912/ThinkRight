// Initialize Supabase
const SUPABASE_URL = 'https://hqroqfkabptqwpqpplln.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxcm9xZmthYnB0cXdwcXBwbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDU5OTgsImV4cCI6MjA4MjY4MTk5OH0.pVci7zzscJsD1UJDAYgCV2UOSxdMLuMvYntWB5EDVzo';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM elements
const resetPasswordForm = document.getElementById('resetPasswordForm');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');
const toggleNewPassword = document.getElementById('toggleNewPassword');
const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const loadingState = document.getElementById('loadingState');
const passwordMatchMessage = document.getElementById('passwordMatchMessage');

let resetToken = null;

/**
 * Initialize page on load
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('✓ Reset password page loaded');
    
    // Setup theme toggle
    setupThemeToggle();
    
    // Extract token from URL hash
    extractResetToken();
    
    // Setup event listeners
    setupEventListeners();
    
    // Verify the reset session with Supabase
    verifyResetSession();
});

/**
 * Extract reset token from URL hash
 * Supabase can send the token in different formats:
 * 1. #type=recovery&token=xxx
 * 2. ?type=recovery&token=xxx (query params)
 * 3. #access_token=xxx&type=recovery (fragment with access_token)
 */
function extractResetToken() {
    console.log('Extracting reset token...');
    
    // Try fragment first (#...)
    const fullHash = window.location.hash;
    const fullSearch = window.location.search;
    
    console.log('Full URL hash:', fullHash);
    console.log('Full URL search:', fullSearch);
    
    let hash = fullHash.substring(1);
    let params = new URLSearchParams(hash);
    
    // If no params in hash, try search (query string)
    if (params.size === 0 && fullSearch) {
        hash = fullSearch.substring(1);
        params = new URLSearchParams(hash);
        console.log('Using search params instead of hash');
    }
    
    console.log('All params:', Array.from(params.entries()));
    
    // Try different token field names
    let type = params.get('type');
    let token = params.get('token') || params.get('access_token');
    
    // If still no token, check if there's error or token in hash
    if (!token && fullHash) {
        const matches = fullHash.match(/token=([^&]+)/);
        if (matches) {
            token = matches[1];
            console.log('Token found via regex:', token.substring(0, 20) + '...');
        }
    }
    
    resetToken = token;
    
    console.log('Token type:', type);
    console.log('Reset token found:', !!resetToken);
    if (resetToken) {
        console.log('Token length:', resetToken.length);
        console.log('Token preview:', resetToken.substring(0, 30) + '...');
    }
    
    if (!resetToken) {
        console.error('❌ No token found in URL (hash or search)');
        showError('Invalid or expired reset link. No token detected. Please request a new password reset.');
        resetPasswordForm.style.display = 'none';
        return;
    }
    
    console.log('✓ Token extracted successfully');
}

/**
 * Verify the reset session is valid
 * This just checks if the token format is correct
 */
async function verifyResetSession() {
    if (!resetToken) {
        console.warn('⚠️ No token to verify');
        return;
    }
    
    try {
        // Just verify the token exists and has reasonable length
        // Supabase recovery tokens are typically long enough
        if (resetToken.length < 10) {
            console.warn('⚠️ Token seems too short:', resetToken.length);
            showError('This reset link appears invalid. Please request a new password reset.');
            resetPasswordForm.style.display = 'none';
            return;
        }
        
        console.log('✓ Reset token format looks valid, length:', resetToken.length);
    } catch (error) {
        console.error('Verification error:', error);
        // Don't block form submission, let user try to reset
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Verify form exists
    if (!resetPasswordForm) {
        console.error('❌ Reset password form not found!');
        return;
    }
    console.log('✓ Form found, adding submit listener');
    
    // Form submission
    resetPasswordForm.addEventListener('submit', function(e) {
        console.log('Form submitted!');
        handleResetPassword(e);
    });
    
    // Password visibility toggles
    if (toggleNewPassword) {
        toggleNewPassword.addEventListener('click', function(e) {
            console.log('Toggle new password clicked');
            e.preventDefault();
            togglePasswordVisibility(newPasswordInput);
        });
    }
    
    if (toggleConfirmPassword) {
        toggleConfirmPassword.addEventListener('click', function(e) {
            console.log('Toggle confirm password clicked');
            e.preventDefault();
            togglePasswordVisibility(confirmPasswordInput);
        });
    }
    
    // Real-time password match validation
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', validatePasswordMatch);
    }
    
    console.log('✓ Event listeners setup complete');
}

/**
 * Toggle password visibility
 */
function togglePasswordVisibility(input) {
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

/**
 * Validate passwords match in real-time
 */
function validatePasswordMatch() {
    if (newPasswordInput.value && confirmPasswordInput.value) {
        if (newPasswordInput.value !== confirmPasswordInput.value) {
            passwordMatchMessage.style.display = 'block';
        } else {
            passwordMatchMessage.style.display = 'none';
        }
    } else {
        passwordMatchMessage.style.display = 'none';
    }
}

/**
 * Handle password reset
 */
async function handleResetPassword(e) {
    e.preventDefault();
    
    // Clear previous messages
    hideError();
    hideSuccess();
    
    // Validate inputs
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();
    
    // Validation checks
    if (!newPassword || !confirmPassword) {
        showError('Please fill in all fields.');
        return;
    }
    
    if (newPassword.length < 6) {
        showError('Password must be at least 6 characters long.');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showError('Passwords do not match.');
        return;
    }
    
    if (!resetToken) {
        showError('Invalid reset link. Please request a new password reset.');
        return;
    }
    
    // Show loading state
    showLoading();
    resetPasswordBtn.disabled = true;
    
    try {
        console.log('🔐 Processing password reset with token...');
        
        // Step 1: Exchange recovery token for a session using OTP verification
        // This establishes an authenticated session from the recovery token
        const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: resetToken,
            type: 'recovery'
        });
        
        if (otpError) {
            console.error('❌ OTP verification error:', otpError);
            console.error('OTP Error details:', otpError);
            showError('Your reset link has expired or is invalid. Please request a new password reset.');
            hideLoading();
            resetPasswordBtn.disabled = false;
            return;
        }
        
        if (!otpData || !otpData.user) {
            console.error('❌ No user session from OTP verification');
            showError('Password reset failed. Please try again.');
            hideLoading();
            resetPasswordBtn.disabled = false;
            return;
        }
        
        console.log('✓ OTP verified, session established for user:', otpData.user.email);
        console.log('Session data:', otpData.session);
        
        // Small delay to ensure session is fully established
        await new Promise(r => setTimeout(r, 500));
        
        // Step 2: Update the password with the authenticated session
        // This should work now that we have a valid session from the recovery token
        console.log('Attempting to update password...');
        const { data: updateData, error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (updateError) {
            console.error('❌ Password update error:', updateError);
            console.error('Error code:', updateError.code);
            console.error('Error message:', updateError.message);
            console.error('Full error:', JSON.stringify(updateError));
            showError(updateError.message || 'Failed to update password. Please try again.');
            hideLoading();
            resetPasswordBtn.disabled = false;
            return;
        }
        
        console.log('✅ Password updated successfully');
        if (updateData && updateData.user) {
            console.log('User after update:', updateData.user.email);
        }
        
        // Step 3: Sign out to clear the temporary session
        await supabase.auth.signOut();
        console.log('✓ Signed out temporary session');
        
        // Show success message
        showSuccess('Password reset successful! Redirecting to login...');
        resetPasswordForm.style.display = 'none';
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        
    } catch (error) {
        console.error('❌ Password reset error:', error);
        console.error('Full error:', JSON.stringify(error, null, 2));
        showError(error.message || 'An error occurred while resetting your password. Please try again or contact support.');
        hideLoading();
        resetPasswordBtn.disabled = false;
    }
}

/**
 * Show error message
 */
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    console.error('Error:', message);
}

/**
 * Hide error message
 */
function hideError() {
    errorMessage.style.display = 'none';
}

/**
 * Show success message
 */
function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    console.log('Success:', message);
}

/**
 * Hide success message
 */
function hideSuccess() {
    successMessage.style.display = 'none';
}

/**
 * Show loading state
 */
function showLoading() {
    loadingState.style.display = 'flex';
}

/**
 * Hide loading state
 */
function hideLoading() {
    loadingState.style.display = 'none';
}

/**
 * Setup theme toggle
 */
function setupThemeToggle() {
    // Get current theme from localStorage
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    
    // Only setup toggle if element exists
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) {
        console.log('ℹ️ Theme toggle not found on this page');
        return;
    }
    
    updateThemeIcon(currentTheme, themeToggle);
    
    // Setup toggle button
    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        const newTheme = theme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme, themeToggle);
        
        console.log('Theme switched to:', newTheme);
    });
}

/**
 * Update theme icon based on current theme
 */
function updateThemeIcon(theme, themeToggle) {
    const icon = themeToggle?.querySelector('.theme-icon');
    if (icon) {
        if (theme === 'light') {
            icon.textContent = '🌙';
        } else {
            icon.textContent = '☀️';
        }
    }
}
