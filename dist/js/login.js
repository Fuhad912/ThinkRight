/**
 * THINKRIGHT - LOGIN PAGE LOGIC
 * Handles email/password login
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Login page initialized');
    setupInstallAppCard();

    let retries = 0;
    while (!window.authInitialized && retries < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries += 1;
    }

    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const successMessage = document.getElementById('successMessage');
    const successText = document.getElementById('successText');

    if (!window.authInitialized) {
        errorMessage.style.display = 'block';
        errorText.textContent = 'System initialization error. Please refresh the page.';
        return;
    }

    try {
        const user = await getCurrentUser();
        if (user) {
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
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const themeToggle = document.getElementById('themeToggle');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    if (window.initTheme) {
        window.initTheme();
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('verified') === '1' && successMessage && successText) {
        successText.textContent = 'Email verified! You can now log in.';
        successMessage.style.display = 'block';
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        errorMessage.style.display = 'none';
        if (successMessage) {
            successMessage.style.display = 'none';
        }

        if (!email || !password) {
            showError('Please enter your email and password');
            return;
        }

        loginBtn.disabled = true;
        loginBtnText.style.display = 'none';
        loginBtnSpinner.style.display = 'inline-block';

        try {
            const result = await login(email, password);

            if (!result.success) {
                showError(result.error || 'Failed to login');
                loginBtn.disabled = false;
                loginBtnText.style.display = 'inline';
                loginBtnSpinner.style.display = 'none';
                return;
            }

            const nextUrl = urlParams.get('next') || 'index.html';
            window.location.href = nextUrl;
        } catch (error) {
            console.error('Login error:', error);
            showError(error.message || 'An error occurred during login');
            loginBtn.disabled = false;
            loginBtnText.style.display = 'inline';
            loginBtnSpinner.style.display = 'none';
        }
    });

    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';

        if (window.gsap) {
            gsap.fromTo(
                errorMessage,
                { opacity: 0, y: -10 },
                { opacity: 1, y: 0, duration: 0.3 }
            );
        }

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

    if (themeToggle) {
        themeToggle.addEventListener('click', (event) => {
            event.preventDefault();
            if (window.toggleTheme) {
                window.toggleTheme();
            }
        });
    }

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (event) => {
            event.preventDefault();
            showForgotPasswordModal();
        });
    }

    const passwordToggle = document.getElementById('passwordToggle');
    if (passwordToggle && passwordInput) {
        passwordToggle.setAttribute('aria-pressed', 'false');
        passwordToggle.setAttribute('aria-label', 'Show password');
        passwordToggle.addEventListener('click', (event) => {
            event.preventDefault();
            const hidden = passwordInput.type === 'password';
            passwordInput.type = hidden ? 'text' : 'password';
            passwordToggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
            passwordToggle.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
            passwordToggle.textContent = hidden ? 'Hide' : 'Show';
        });
    }

    const mobileThemeToggle = document.getElementById('mobileThemeToggle');
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', toggleTheme);
    }
});

function toggleTheme(event) {
    if (event) event.preventDefault();

    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const themeIcons = document.querySelectorAll('.theme-icon');
    themeIcons.forEach((icon) => {
        icon.textContent = newTheme === 'light' ? 'Moon' : 'Sun';
    });
}

function showForgotPasswordModal() {
    const modalId = 'forgotPasswordModal';

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
                Enter your email address and we will send you a link to reset your password.
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

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
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
                successDiv.textContent = 'Reset link sent. Check your inbox and spam folder.';
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
        } catch (error) {
            console.error('Error sending reset email:', error);
            errorDiv.textContent = 'An error occurred. Please try again.';
            errorDiv.style.display = 'block';
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Reset Link';
        }
    });

    emailInput.focus();
}

function setupInstallAppCard() {
    const card = document.getElementById('installAppCard');
    const toggleBtn = document.getElementById('installAppToggle');
    const installBtn = document.getElementById('loginInstallBtn');
    if (!card || !toggleBtn || !installBtn) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    let isOpen = false;

    const setAccordionState = (open) => {
        isOpen = open;
        card.classList.toggle('is-open', open);
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    setAccordionState(false);
    toggleBtn.addEventListener('click', () => {
        setAccordionState(!isOpen);
    });

    if (isStandalone) {
        card.style.display = 'none';
        return;
    }

    if (isIOS) {
        installBtn.style.display = 'none';
        return;
    }

    let deferredInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        installBtn.style.display = 'inline-flex';
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;

        installBtn.disabled = true;
        installBtn.textContent = 'Installing...';

        try {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
        } catch (error) {
            console.error('Install prompt error:', error);
        } finally {
            deferredInstallPrompt = null;
            installBtn.disabled = false;
            installBtn.textContent = 'Install App';
            installBtn.style.display = 'none';
        }
    });

    window.addEventListener('appinstalled', () => {
        installBtn.style.display = 'none';
    });
}
