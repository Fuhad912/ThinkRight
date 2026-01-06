// Initialize Supabase
const SUPABASE_URL = 'https://ajxqisvlccpdmmyhoydk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqeHFpc3ZsY2NwZG1teWhveWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAzNzc4MjgsImV4cCI6MjA0NTk1MzgyOH0.EAb3d3aLvFNnZdPBxCJ_ZHqQfI0pNRkqC7EkYx8mHZc';
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
const themeToggle = document.getElementById('themeToggle');

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
 * Format: #type=recovery&token=xxx
 */
function extractResetToken() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    
    const type = params.get('type');
    resetToken = params.get('token');
    
    console.log('Token type:', type);
    console.log('Reset token found:', !!resetToken);
    
    if (type !== 'recovery' || !resetToken) {
        showError('Invalid or expired reset link. Please request a new password reset.');
        resetPasswordForm.style.display = 'none';
    }
}

/**
 * Verify the reset session is valid
 * This just checks if the token format is correct
 */
async function verifyResetSession() {
    if (!resetToken) {
        return;
    }
    
    try {
        // Just verify the token format is valid UUID-like
        // The actual OTP verification happens during password update
        if (resetToken.length < 20) {
            console.warn('⚠️ Invalid token format');
            showError('This reset link has expired or is invalid. Please request a new password reset.');
            resetPasswordForm.style.display = 'none';
            return;
        }
        
        console.log('✓ Reset token format valid');
    } catch (error) {
        console.error('Verification error:', error);
        // Don't block form submission, let user try to reset
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Form submission
    resetPasswordForm.addEventListener('submit', handleResetPassword);
    
    // Password visibility toggles
    toggleNewPassword.addEventListener('click', function(e) {
        e.preventDefault();
        togglePasswordVisibility(newPasswordInput);
    });
    
    toggleConfirmPassword.addEventListener('click', function(e) {
        e.preventDefault();
        togglePasswordVisibility(confirmPasswordInput);
    });
    
    // Real-time password match validation
    confirmPasswordInput.addEventListener('input', validatePasswordMatch);
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
            showError('Your reset link has expired. Please request a new password reset.');
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
        
        // Step 2: Now update the password with the authenticated session
        const { data: updateData, error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (updateError) {
            console.error('❌ Password update error:', updateError);
            console.error('Error code:', updateError.code);
            console.error('Error message:', updateError.message);
            showError(updateError.message || 'Failed to update password. Please try again.');
            hideLoading();
            resetPasswordBtn.disabled = false;
            return;
        }
        
        if (!updateData || !updateData.user) {
            console.error('❌ No user data returned from password update');
            showError('Password update failed. Please try again.');
            hideLoading();
            resetPasswordBtn.disabled = false;
            return;
        }
        
        console.log('✅ Password updated successfully for user:', updateData.user.email);
        
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
        showError(error.message || 'An error occurred while resetting your password.');
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
    updateThemeIcon(currentTheme);
    
    // Setup toggle button
    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        const newTheme = theme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        
        console.log('Theme switched to:', newTheme);
    });
}

/**
 * Update theme icon based on current theme
 */
function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('.theme-icon');
    if (theme === 'light') {
        icon.textContent = '🌙';
    } else {
        icon.textContent = '☀️';
    }
}
