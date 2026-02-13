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
            const urlParams = new URLSearchParams(window.location.search);
            const nextUrl = urlParams.get('next') || 'index.html';
            window.location.href = nextUrl;
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
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

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

    // Forgot Password link handler
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            showForgotPasswordModal();
        });
    }

    // Initialize theme on page load
    if (window.initTheme) {
        window.initTheme();
    }

    // Password visibility toggle (adds accessible eye toggle; no inline styles)
    const passwordToggle = document.getElementById('passwordToggle');
    if (passwordToggle && passwordInput) {
        // Ensure initial icon/aria state
        passwordToggle.setAttribute('aria-pressed', 'false');
        passwordToggle.setAttribute('aria-label', 'Show password');
        passwordToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = passwordInput.type === 'password';
            passwordInput.type = isHidden ? 'text' : 'password';
            passwordToggle.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
            passwordToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            passwordToggle.textContent = isHidden ? 'Hide' : 'Show';
        });
    }

    // Setup theme toggle for mobile button
    const mobileThemeToggle = document.getElementById('mobileThemeToggle');
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', toggleTheme);
        console.log('✓ Mobile theme toggle attached');
    }
});

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

/**
 * Show forgot password modal
 */
function showForgotPasswordModal() {
    const modalId = 'forgotPasswordModal';
    
    // Remove existing modal if present
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="
            background: var(--color-bg-primary);
            border-radius: 12px;
            padding: 40px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        ">
            <h2 style="margin-top: 0; color: var(--color-text-primary);">Reset Your Password</h2>
            <p style="color: var(--color-text-secondary); margin-bottom: 20px;">
                Enter your email address and we'll send you a link to reset your password.
            </p>

            <div id="forgotPasswordError" style="
                background: #fee;
                color: #c33;
                padding: 12px;
                border-radius: 6px;
                margin-bottom: 15px;
                display: none;
                font-size: 0.9rem;
            "></div>

            <div id="forgotPasswordSuccess" style="
                background: #efe;
                color: #3c3;
                padding: 12px;
                border-radius: 6px;
                margin-bottom: 15px;
                display: none;
                font-size: 0.9rem;
            "></div>

            <input 
                type="email" 
                id="forgotPasswordEmail" 
                placeholder="your@email.com"
                style="
                    width: 100%;
                    padding: 10px;
                    border: 1px solid var(--color-border);
                    border-radius: 6px;
                    margin-bottom: 20px;
                    font-size: 1rem;
                    background: var(--color-bg-secondary);
                    color: var(--color-text-primary);
                    box-sizing: border-box;
                "
            >

            <div style="display: flex; gap: 10px;">
                <button id="forgotPasswordSendBtn" style="
                    flex: 1;
                    padding: 10px;
                    background: var(--color-accent);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    cursor: pointer;
                ">Send Reset Link</button>
                <button id="forgotPasswordCloseBtn" style="
                    flex: 1;
                    padding: 10px;
                    background: var(--color-border);
                    color: var(--color-text-primary);
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    cursor: pointer;
                ">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const emailInput = document.getElementById('forgotPasswordEmail');
    const sendBtn = document.getElementById('forgotPasswordSendBtn');
    const closeBtn = document.getElementById('forgotPasswordCloseBtn');
    const errorDiv = document.getElementById('forgotPasswordError');
    const successDiv = document.getElementById('forgotPasswordSuccess');

    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    sendBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();

        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        if (!email) {
            errorDiv.textContent = 'Please enter your email address.';
            errorDiv.style.display = 'block';
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        try {
            const result = await window.resetPassword(email);

            if (result.success) {
                successDiv.textContent = 'Reset link sent! Check your email inbox (and spam folder).';
                successDiv.style.display = 'block';
                emailInput.disabled = true;
                sendBtn.disabled = true;

                setTimeout(() => {
                    modal.remove();
                }, 3000);
            } else {
                errorDiv.textContent = result.error || 'Failed to send reset email.';
                errorDiv.style.display = 'block';
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Reset Link';
            }
        } catch (err) {
            console.error('Error sending reset email:', err);
            errorDiv.textContent = 'An error occurred. Please try again.';
            errorDiv.style.display = 'block';
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Reset Link';
        }
    });

    emailInput.focus();
}
