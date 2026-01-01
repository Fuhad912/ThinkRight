/**
 * THINKRIGHT - LOGIN PAGE LOGIC
 * Handles email/password login
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Login page initialized');

    // Wait for Supabase to be initialized
    let retries = 0;
    while (!window.authInitialized && retries < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (!window.authInitialized) {
        console.error('❌ Supabase not initialized');
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('errorText').textContent = 'System initialization error. Please refresh the page.';
        return;
    }

    // Check if already logged in
    try {
        const user = await getCurrentUser();
        if (user) {
            console.log('User already logged in, redirecting...');
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }

    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginBtnSpinner = document.getElementById('loginBtnSpinner');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const themeToggle = document.getElementById('themeToggle');

    // Handle login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Clear previous messages
        errorMessage.style.display = 'none';

        // Validate inputs
        if (!email || !password) {
            showError('Please enter your email and password');
            return;
        }

        // Show loading state
        loginBtn.disabled = true;
        loginBtnText.style.display = 'none';
        loginBtnSpinner.style.display = 'inline-block';

        try {
            // Call login function from auth.js
            const result = await login(email, password);

            if (!result.success) {
                showError(result.error || 'Failed to login');
                loginBtn.disabled = false;
                loginBtnText.style.display = 'inline';
                loginBtnSpinner.style.display = 'none';
                return;
            }

            if (result.user) {
                console.log('✅ Login successful');
                // Check for redirect URL in query params
                const urlParams = new URLSearchParams(window.location.search);
                const nextUrl = urlParams.get('next') || 'index.html';
                
                // Redirect to landing page or specified next URL
                window.location.href = nextUrl;
            }

        } catch (err) {
            console.error('Login error:', err);
            showError(err.message || 'An error occurred during login');
            loginBtn.disabled = false;
            loginBtnText.style.display = 'inline';
            loginBtnSpinner.style.display = 'none';
        }
    });

    // Show error message with animation
    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
        
        if (window.gsap) {
            gsap.fromTo(errorMessage, 
                { opacity: 0, y: -10 },
                { opacity: 1, y: 0, duration: 0.3 }
            );
        }

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (window.gsap) {
                gsap.to(errorMessage, {
                    opacity: 0,
                    y: -10,
                    duration: 0.3,
                    onComplete: () => {
                        errorMessage.style.display = 'none';
                    }
                });
            } else {
                errorMessage.style.display = 'none';
            }
        }, 5000);
    }

    // Theme toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.toggleTheme) {
                window.toggleTheme();
            }
        });
    }

    // Initialize theme on page load
    if (window.initTheme) {
        window.initTheme();
    }

    // ============================================================================
    // FORGOT PASSWORD FUNCTIONALITY
    // ============================================================================

    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const closeForgotModal = document.getElementById('closeForgotModal');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const sendResetBtn = document.getElementById('sendResetBtn');
    const sendResetBtnText = document.getElementById('sendResetBtnText');
    const sendResetBtnSpinner = document.getElementById('sendResetBtnSpinner');
    const forgotEmail = document.getElementById('forgotEmail');
    const forgotErrorMessage = document.getElementById('forgotErrorMessage');
    const forgotErrorText = document.getElementById('forgotErrorText');
    const forgotSuccessMessage = document.getElementById('forgotSuccessMessage');
    const forgotSuccessText = document.getElementById('forgotSuccessText');

    // Open forgot password modal
    forgotPasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordModal.style.display = 'flex';
        modalOverlay.style.display = 'block';
        forgotEmail.focus();
        console.log('Forgot password modal opened');
    });

    // Close forgot password modal
    function closeForgotPasswordModal() {
        forgotPasswordModal.style.display = 'none';
        modalOverlay.style.display = 'none';
        forgotPasswordForm.reset();
        forgotErrorMessage.style.display = 'none';
        forgotSuccessMessage.style.display = 'none';
        console.log('Forgot password modal closed');
    }

    closeForgotModal.addEventListener('click', closeForgotPasswordModal);
    backToLoginBtn.addEventListener('click', closeForgotPasswordModal);
    modalOverlay.addEventListener('click', closeForgotPasswordModal);

    // Handle forgot password form submission
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = forgotEmail.value.trim();

        // Clear previous messages
        forgotErrorMessage.style.display = 'none';
        forgotSuccessMessage.style.display = 'none';

        // Validate email
        if (!email) {
            showForgotError('Please enter your email address');
            return;
        }

        if (!isValidEmail(email)) {
            showForgotError('Please enter a valid email address');
            return;
        }

        // Show loading state
        sendResetBtn.disabled = true;
        sendResetBtnText.style.display = 'none';
        sendResetBtnSpinner.style.display = 'inline-block';

        try {
            console.log('Sending password reset email to:', email);

            // Call resetPassword from auth.js
            const result = await resetPassword(email);

            if (!result.success) {
                showForgotError(result.error || 'Failed to send reset email');
                sendResetBtn.disabled = false;
                sendResetBtnText.style.display = 'inline';
                sendResetBtnSpinner.style.display = 'none';
                return;
            }

            console.log('✅ Password reset email sent successfully');
            
            // Show success message
            forgotSuccessText.textContent = `A password reset link has been sent to ${email}. Please check your email (including spam folder) and follow the link to reset your password.`;
            forgotSuccessMessage.style.display = 'block';

            // Reset form
            forgotPasswordForm.reset();

            // Close modal after 3 seconds
            setTimeout(() => {
                closeForgotPasswordModal();
            }, 3000);

            sendResetBtn.disabled = false;
            sendResetBtnText.style.display = 'inline';
            sendResetBtnSpinner.style.display = 'none';

        } catch (err) {
            console.error('Password reset error:', err);
            showForgotError(err.message || 'An error occurred. Please try again.');
            sendResetBtn.disabled = false;
            sendResetBtnText.style.display = 'inline';
            sendResetBtnSpinner.style.display = 'none';
        }
    });

    // Show forgot password error message
    function showForgotError(message) {
        forgotErrorText.textContent = message;
        forgotErrorMessage.style.display = 'block';

        if (window.gsap) {
            gsap.fromTo(forgotErrorMessage, 
                { opacity: 0, y: -10 },
                { opacity: 1, y: 0, duration: 0.3 }
            );
        }

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (window.gsap) {
                gsap.to(forgotErrorMessage, {
                    opacity: 0,
                    y: -10,
                    duration: 0.3,
                    onComplete: () => {
                        forgotErrorMessage.style.display = 'none';
                    }
                });
            } else {
                forgotErrorMessage.style.display = 'none';
            }
        }, 5000);
    }

    // Validate email format
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Expose close function globally
    window.closeForgotPasswordModal = closeForgotPasswordModal;
});
