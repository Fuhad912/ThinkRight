/**
 * THINKRIGHT - SIGNUP PAGE LOGIC
 * Email/password signup + inline OTP verification (signup only)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Signup page initialized');

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
        showError('System initialization error. Please refresh the page.');
        return;
    }

    try {
        const user = await getCurrentUser();
        if (user) {
            const nextUrl = new URLSearchParams(window.location.search).get('next') || 'index.html';
            window.location.href = nextUrl;
            return;
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }

    const signupForm = document.getElementById('signupForm');
    const signupFormStep = document.getElementById('signupFormStep');
    const otpVerifyStep = document.getElementById('otpVerifyStep');

    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordHint = document.getElementById('passwordHint');

    const signupBtn = document.getElementById('signupBtn');
    const signupBtnText = document.getElementById('signupBtnText');
    const signupBtnSpinner = document.getElementById('signupBtnSpinner');

    const otpCodeInput = document.getElementById('otpCode');
    const otpTargetEmail = document.getElementById('otpTargetEmail');
    const otpStepMessage = document.getElementById('otpStepMessage');

    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const verifyCodeBtnText = document.getElementById('verifyCodeBtnText');
    const verifyCodeBtnSpinner = document.getElementById('verifyCodeBtnSpinner');

    const resendCodeBtn = document.getElementById('resendCodeBtn');
    const resendCountdown = document.getElementById('resendCountdown');
    const changeEmailBtn = document.getElementById('changeEmailBtn');
    const themeToggle = document.getElementById('themeToggle');

    const OTP_COOLDOWN_SECONDS = 30;
    const DEV_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    const SIGNUP_STATE = {
        SIGNUP_FORM: 'signup_form',
        OTP_VERIFY: 'otp_verify',
        VERIFIED_DONE: 'verified_done'
    };

    let currentState = SIGNUP_STATE.SIGNUP_FORM;
    let pendingEmail = '';
    let resendSeconds = 0;
    let resendTimer = null;

    function clearMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }

    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }

    function showSuccess(message) {
        successText.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }

    function setSignupLoading(isLoading) {
        signupBtn.disabled = isLoading;
        signupBtnText.style.display = isLoading ? 'none' : 'inline';
        signupBtnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    function setVerifyLoading(isLoading) {
        verifyCodeBtn.disabled = isLoading;
        verifyCodeBtnText.style.display = isLoading ? 'none' : 'inline';
        verifyCodeBtnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    function stopResendCooldown() {
        if (resendTimer) {
            clearInterval(resendTimer);
            resendTimer = null;
        }
    }

    function updateResendButton() {
        if (resendSeconds > 0) {
            resendCodeBtn.disabled = true;
            resendCodeBtn.textContent = `Resend code in ${resendSeconds}s`;
            if (resendCountdown) {
                resendCountdown.textContent = String(resendSeconds);
            }
            return;
        }

        resendCodeBtn.disabled = false;
        resendCodeBtn.textContent = 'Resend code';
    }

    function startResendCooldown(seconds = OTP_COOLDOWN_SECONDS) {
        stopResendCooldown();
        resendSeconds = seconds;
        updateResendButton();

        resendTimer = setInterval(() => {
            resendSeconds -= 1;
            updateResendButton();
            if (resendSeconds <= 0) {
                stopResendCooldown();
            }
        }, 1000);
    }

    function setState(nextState) {
        currentState = nextState;

        if (nextState === SIGNUP_STATE.SIGNUP_FORM) {
            signupForm.hidden = false;
            signupFormStep.hidden = false;
            otpVerifyStep.hidden = true;
            stopResendCooldown();
            updateResendButton();
            return;
        }

        if (nextState === SIGNUP_STATE.OTP_VERIFY) {
            signupFormStep.hidden = true;
            otpVerifyStep.hidden = false;
            otpCodeInput.value = '';
            otpCodeInput.focus();
            return;
        }

        if (nextState === SIGNUP_STATE.VERIFIED_DONE) {
            verifyCodeBtn.disabled = true;
            resendCodeBtn.disabled = true;
            changeEmailBtn.disabled = true;
            return;
        }
    }

    async function sendOtpForSignup(isResend = false) {
        if (!pendingEmail) {
            showError('No email pending verification. Please create your account again.');
            setState(SIGNUP_STATE.SIGNUP_FORM);
            return false;
        }

        const result = await sendSignupVerificationOtp(pendingEmail);
        if (!result.success) {
            if (DEV_MODE) {
                console.error('[signup otp] send failed:', result.rawError || result.error);
            }
            showError('Account created, but we could not send a verification code yet. Tap Resend code.');
            return false;
        }

        if (isResend) {
            showSuccess('A new verification code was sent.');
        } else {
            showSuccess("We've sent a 6-digit code to your email. Enter it to verify your account.");
        }
        startResendCooldown();
        return true;
    }

    async function handleSignupSubmit(event) {
        event.preventDefault();
        if (currentState !== SIGNUP_STATE.SIGNUP_FORM) return;

        const email = emailInput.value.trim().toLowerCase();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        clearMessages();

        if (!email || !username || !password || !confirmPassword) {
            showError('Please fill in all fields.');
            return;
        }
        if (username.length < 2 || username.length > 30) {
            showError('Username must be between 2 and 30 characters.');
            return;
        }
        if (password.length < 6) {
            showError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            showError('Passwords do not match.');
            return;
        }

        setSignupLoading(true);
        try {
            const signupResult = await signUp(email, password, username);
            if (!signupResult.success) {
                showError(signupResult.error || 'Failed to create account.');
                return;
            }

            pendingEmail = email;
            otpTargetEmail.textContent = pendingEmail;
            otpStepMessage.textContent = "We've sent a 6-digit code to your email. Enter it to verify your account.";
            setState(SIGNUP_STATE.OTP_VERIFY);
            await sendOtpForSignup(false);
        } catch (error) {
            console.error('Signup submit error:', error);
            showError(error.message || 'An error occurred during signup.');
        } finally {
            setSignupLoading(false);
        }
    }

    async function handleVerifyOtp() {
        if (currentState !== SIGNUP_STATE.OTP_VERIFY) return;

        const code = otpCodeInput.value.replace(/\D/g, '').slice(0, 6);
        otpCodeInput.value = code;
        clearMessages();

        if (!pendingEmail) {
            showError('Verification session expired. Please create your account again.');
            setState(SIGNUP_STATE.SIGNUP_FORM);
            return;
        }
        if (code.length !== 6) {
            showError('Enter the 6-digit code sent to your email.');
            otpCodeInput.focus();
            return;
        }

        setVerifyLoading(true);
        try {
            const verifyResult = await verifyEmailOtp(pendingEmail, code);
            if (!verifyResult.success) {
                showError(verifyResult.error || 'Invalid or expired code.');
                return;
            }

            if (!verifyResult.user?.email_confirmed_at && DEV_MODE) {
                console.warn('[signup otp] verify succeeded but email_confirmed_at was not returned on user payload');
            }

            setState(SIGNUP_STATE.VERIFIED_DONE);
            showSuccess('Email verified! You can now log in.');

            // Keep login flow email+password by clearing any transient verified session.
            await logout();

            setTimeout(() => {
                window.location.href = 'login.html?verified=1';
            }, 1200);
        } catch (error) {
            console.error('Verify OTP error:', error);
            showError(error.message || 'Unable to verify code right now.');
        } finally {
            setVerifyLoading(false);
        }
    }

    async function handleResendCode() {
        if (currentState !== SIGNUP_STATE.OTP_VERIFY || resendSeconds > 0) return;
        await sendOtpForSignup(true);
    }

    function handleChangeEmail() {
        clearMessages();
        pendingEmail = '';
        otpCodeInput.value = '';
        setState(SIGNUP_STATE.SIGNUP_FORM);
        emailInput.focus();
    }

    passwordInput.addEventListener('input', () => {
        if (passwordInput.value.length < 6) {
            passwordHint.textContent = 'Minimum 6 characters.';
            return;
        }
        passwordHint.textContent = 'Password looks good.';
    });

    otpCodeInput.addEventListener('input', () => {
        otpCodeInput.value = otpCodeInput.value.replace(/\D/g, '').slice(0, 6);
    });

    otpCodeInput.addEventListener('paste', (event) => {
        event.preventDefault();
        const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        otpCodeInput.value = pasted;
    });

    const passwordToggle = document.getElementById('passwordToggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', (event) => {
            event.preventDefault();
            const hidden = passwordInput.type === 'password';
            passwordInput.type = hidden ? 'text' : 'password';
            passwordToggle.textContent = hidden ? 'Hide' : 'Show';
            passwordToggle.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
            passwordToggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
        });
    }

    const confirmPasswordToggle = document.getElementById('confirmPasswordToggle');
    if (confirmPasswordToggle) {
        confirmPasswordToggle.addEventListener('click', (event) => {
            event.preventDefault();
            const hidden = confirmPasswordInput.type === 'password';
            confirmPasswordInput.type = hidden ? 'text' : 'password';
            confirmPasswordToggle.textContent = hidden ? 'Hide' : 'Show';
            confirmPasswordToggle.setAttribute('aria-label', hidden ? 'Hide confirm password' : 'Show confirm password');
            confirmPasswordToggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
        });
    }

    signupForm.addEventListener('submit', handleSignupSubmit);
    verifyCodeBtn.addEventListener('click', handleVerifyOtp);
    resendCodeBtn.addEventListener('click', handleResendCode);
    changeEmailBtn.addEventListener('click', handleChangeEmail);

    if (themeToggle) {
        themeToggle.addEventListener('click', (event) => {
            event.preventDefault();
            if (window.toggleTheme) {
                window.toggleTheme();
            }
        });
    }

    if (window.initTheme) {
        window.initTheme();
    }

    // Refresh fallback: no persisted pending state, so always start at form.
    setState(SIGNUP_STATE.SIGNUP_FORM);
    updateResendButton();
});
