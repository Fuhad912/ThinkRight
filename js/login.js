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
            passwordToggle.textContent = isHidden ? '🙈' : '👁️';
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
