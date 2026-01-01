/**
 * THINKRIGHT - SIGNUP PAGE LOGIC
 * Handles email/password signup
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Signup page initialized');

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

    // Check if user already logged in
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

    const signupForm = document.getElementById('signupForm');
    const signupBtn = document.getElementById('signupBtn');
    const signupBtnText = document.getElementById('signupBtnText');
    const signupBtnSpinner = document.getElementById('signupBtnSpinner');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const successMessage = document.getElementById('successMessage');
    const successText = document.getElementById('successText');
    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordHint = document.getElementById('passwordHint');
    const themeToggle = document.getElementById('themeToggle');

    // Password validation hint
    passwordInput.addEventListener('input', () => {
        const password = passwordInput.value;
        
        if (password.length < 6) {
            passwordHint.textContent = '❌ Must be at least 6 characters';
            passwordHint.style.color = 'var(--color-danger)';
        } else {
            passwordHint.textContent = '✓ Password looks good';
            passwordHint.style.color = 'var(--color-success)';
        }
    });

    // Handle signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Clear previous messages
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';

        // Validate inputs
        if (!email || !username || !password || !confirmPassword) {
            showError('Please fill in all fields');
            return;
        }

        if (username.length < 2) {
            showError('Username must be at least 2 characters');
            return;
        }

        if (username.length > 30) {
            showError('Username must not exceed 30 characters');
            return;
        }

        if (password.length < 6) {
            showError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        // Show loading state
        signupBtn.disabled = true;
        signupBtnText.style.display = 'none';
        signupBtnSpinner.style.display = 'inline-block';

        try {
            // Call signup function from auth.js with username
            const result = await signUp(email, password, username);

            if (!result.success) {
                showError(result.error || 'Failed to create account');
                signupBtn.disabled = false;
                signupBtnText.style.display = 'inline';
                signupBtnSpinner.style.display = 'none';
                return;
            }

            if (result.user) {
                console.log('✅ Account created successfully');
                showSuccess('Account created successfully! Redirecting to login...');
                
                // Redirect to login page after 2 seconds
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            }

        } catch (err) {
            console.error('Signup error:', err);
            showError(err.message || 'An error occurred during signup');
            signupBtn.disabled = false;
            signupBtnText.style.display = 'inline';
            signupBtnSpinner.style.display = 'none';
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

    // Show success message with animation
    function showSuccess(message) {
        successText.textContent = message;
        successMessage.style.display = 'block';
        
        if (window.gsap) {
            gsap.fromTo(successMessage,
                { opacity: 0, y: -10 },
                { opacity: 1, y: 0, duration: 0.3 }
            );
        }
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
});
