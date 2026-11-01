/**
 * THINKRIGHT - UNIFIED AUTH PAGE LOGIC
 * Handles both Sign In and Sign Up (with inline OTP verification) in a single card
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('Unified Auth page initialized');
    setupInstallAppCard();
    const POLICY_VERSION = '2026-10-31';
    const POLICY_ACCEPTANCE_KEY = 'thinkright_policy_acceptance';
    const policyAgreement = document.getElementById('policyAgreement');
    try {
        if (localStorage.getItem('thinkright_policy_version') === POLICY_VERSION && policyAgreement) {
            policyAgreement.checked = true;
        }
    } catch (_error) {}

    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const successMessage = document.getElementById('successMessage');
    const successText = document.getElementById('successText');

    function clearMessages() {
        if (errorMessage) errorMessage.style.display = 'none';
        if (successMessage) successMessage.style.display = 'none';
    }

    function showError(message) {
        if (!errorMessage || !errorText) return;
        errorText.textContent = message;
        errorMessage.style.display = 'block';
        if (successMessage) successMessage.style.display = 'none';

        if (window.gsap) {
            gsap.fromTo(
                errorMessage,
                { opacity: 0, y: -8 },
                { opacity: 1, y: 0, duration: 0.25 }
            );
        }
    }

    function showSuccess(message) {
        if (!successMessage || !successText) return;
        successText.textContent = message;
        successMessage.style.display = 'block';
        if (errorMessage) errorMessage.style.display = 'none';

        if (window.gsap) {
            gsap.fromTo(
                successMessage,
                { opacity: 0, y: -8 },
                { opacity: 1, y: 0, duration: 0.25 }
            );
        }
    }

    // --- ROLE SWITCHER LOGIC (STUDENT VS TEACHER / EDUCATOR) ---
    let currentRole = 'student';
    const roleStudentBtn = document.getElementById('roleStudentBtn');
    const roleTeacherBtn = document.getElementById('roleTeacherBtn');
    const roleDescText = document.getElementById('roleDescText');
    const loginHeaderTitle = document.getElementById('loginHeaderTitle');
    const loginHeaderSubtitle = document.getElementById('loginHeaderSubtitle');
    const signupHeaderTitle = document.getElementById('signupHeaderTitle');
    const signupHeaderSubtitle = document.getElementById('signupHeaderSubtitle');
    const signupUsernameLabel = document.getElementById('signupUsernameLabel');
    const signupUsernameInput = document.getElementById('signupUsername');

    // Cancel an interrupted entrance so rapid switching never leaves stale styles.
    const authEntrances = new WeakMap();
    function animateAuthSwitch(element) {
        if (!element) return;
        authEntrances.get(element)?.cancel();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !element.animate) return;
        const animation = element.animate([
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 360, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        authEntrances.set(element, animation);
    }

    function switchRole(role, updateUrl = true) {
        currentRole = role === 'teacher' ? 'teacher' : 'student';
        const isTeacher = currentRole === 'teacher';

        if (roleStudentBtn && roleTeacherBtn) {
            roleStudentBtn.classList.toggle('is-active', !isTeacher);
            roleStudentBtn.setAttribute('aria-checked', !isTeacher ? 'true' : 'false');
            roleTeacherBtn.classList.toggle('is-active', isTeacher);
            roleTeacherBtn.setAttribute('aria-checked', isTeacher ? 'true' : 'false');
        }

        if (roleDescText) {
            if (isTeacher) {
                roleDescText.innerHTML = '<strong>Educator Account:</strong> Teach JAMB students through video lessons and earn 70% of each class payment.';
            } else {
                roleDescText.textContent = 'Practice 10,000+ JAMB questions, join tutor classes, and track your scores.';
            }
        }

        if (loginHeaderTitle) {
            loginHeaderTitle.textContent = isTeacher ? 'Teacher Sign In' : 'Welcome Back';
        }
        if (loginHeaderSubtitle) {
            loginHeaderSubtitle.textContent = isTeacher
                ? 'Access your cohorts, student questions, and lesson management.'
                : 'Enter your credentials to continue your practice.';
        }
        if (signupHeaderTitle) {
            signupHeaderTitle.textContent = isTeacher ? 'Create Teacher Account' : 'Create Your Account';
        }
        if (signupHeaderSubtitle) {
            signupHeaderSubtitle.textContent = isTeacher
                ? 'Join as an educator to mentor candidates nationwide.'
                : 'Join ThinkRight to start your timed CBT practice.';
        }
        if (signupUsernameLabel) {
            signupUsernameLabel.textContent = isTeacher ? 'Full Name / Educator Title' : 'Username';
        }
        if (signupUsernameInput) {
            signupUsernameInput.placeholder = isTeacher ? 'e.g. Mr. David A. or Dr. Michael B.' : 'Choose a username';
        }

        if (updateUrl) {
            animateAuthSwitch(document.querySelector('.auth-role-desc-banner'));
            animateAuthSwitch(document.querySelector('.auth-panel:not([hidden])'));
        }
        localStorage.setItem('thinkright_auth_role', currentRole);

        if (updateUrl) {
            const url = new URL(window.location.href);
            if (isTeacher) {
                url.searchParams.set('role', 'teacher');
            } else {
                url.searchParams.delete('role');
            }
            history.replaceState(null, '', url.toString());
        }
    }

    if (roleStudentBtn) {
        roleStudentBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchRole('student');
        });
    }
    if (roleTeacherBtn) {
        roleTeacherBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchRole('teacher');
        });
    }

    // --- TAB SWITCHER LOGIC ---
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const loginPanel = document.getElementById('loginPanel');
    const signupPanel = document.getElementById('signupPanel');
    const switchToSignupBtn = document.getElementById('switchToSignupBtn');
    const switchToLoginBtn = document.getElementById('switchToLoginBtn');

    function switchMode(mode, updateUrl = true) {
        clearMessages();
        const isLogin = mode === 'login';

        if (tabLogin && tabSignup && loginPanel && signupPanel) {
            tabLogin.classList.toggle('is-active', isLogin);
            tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');

            tabSignup.classList.toggle('is-active', !isLogin);
            tabSignup.setAttribute('aria-selected', !isLogin ? 'true' : 'false');

            loginPanel.hidden = !isLogin;
            signupPanel.hidden = isLogin;

            if (updateUrl) {
                const url = new URL(window.location.href);
                if (isLogin) {
                    url.searchParams.delete('mode');
                    if (url.hash === '#signup') {
                        history.replaceState(null, '', url.pathname + (url.search || ''));
                    } else {
                        history.replaceState(null, '', url.toString());
                    }
                } else {
                    url.searchParams.set('mode', 'signup');
                    history.replaceState(null, '', url.toString());
                }
            }

            if (updateUrl) animateAuthSwitch(isLogin ? loginPanel : signupPanel);

        }
    }

    if (tabLogin) {
        tabLogin.addEventListener('click', (e) => {
            e.preventDefault();
            switchMode('login');
        });
    }
    if (tabSignup) {
        tabSignup.addEventListener('click', (e) => {
            e.preventDefault();
            switchMode('signup');
        });
    }
    if (switchToSignupBtn) {
        switchToSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchMode('signup');
        });
    }
    if (switchToLoginBtn) {
        switchToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchMode('login');
        });
    }

    // Check URL parameters / hash on initial load
    const urlParams = new URLSearchParams(window.location.search);
    const initialMode = urlParams.get('mode') || (window.location.hash === '#signup' ? 'signup' : 'login');
    if (initialMode === 'signup') {
        switchMode('signup', false);
    } else {
        switchMode('login', false);
    }

    const initialRoleParam = urlParams.get('role');
    if (initialRoleParam === 'teacher' || initialRoleParam === 'tutor') {
        switchRole('teacher', false);
    } else {
        switchRole('student', false);
    }

    if (urlParams.get('verified') === '1') {
        showSuccess('Email verified! You can now sign in.');
    }

    // --- CHECK FOR OAUTH ERROR PARAMETERS ---
    function checkOAuthErrors() {
        let errorDesc = null;
        if (window.location.hash && window.location.hash.includes('error=')) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            errorDesc = hashParams.get('error_description') || hashParams.get('error');
        }
        if (!errorDesc && window.location.search && window.location.search.includes('error=')) {
            errorDesc = urlParams.get('error_description') || urlParams.get('error');
        }

        if (errorDesc) {
            const cleanMsg = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
            showError(cleanMsg || 'Google authentication was cancelled or failed.');
            try {
                const cleanUrl = new URL(window.location.href);
                cleanUrl.hash = '';
                cleanUrl.searchParams.delete('error');
                cleanUrl.searchParams.delete('error_code');
                cleanUrl.searchParams.delete('error_description');
                history.replaceState(null, '', cleanUrl.toString());
            } catch (_) {}
            return true;
        }
        return false;
    }
    const hasOAuthError = checkOAuthErrors();

    // Simple authenticating state handler (replaces raw text banner with a sleek loader)
    const authAuthenticatingLoader = document.getElementById('authAuthenticatingLoader');
    const authRoleSwitcher = document.querySelector('.auth-role-switcher');
    const authRoleDescBanner = document.getElementById('roleDescBanner');
    const authModeSwitcher = document.querySelector('.auth-mode-switcher');
    const loginPanelEl = document.getElementById('loginPanel');
    const signupPanelEl = document.getElementById('signupPanel');

    function setAuthenticatingState(isAuthenticating) {
        clearMessages();
        if (authAuthenticatingLoader) {
            authAuthenticatingLoader.style.display = isAuthenticating ? 'flex' : 'none';
        }
        if (authRoleSwitcher) authRoleSwitcher.style.display = isAuthenticating ? 'none' : '';
        if (authRoleDescBanner) authRoleDescBanner.style.display = isAuthenticating ? 'none' : '';
        if (authModeSwitcher) authModeSwitcher.style.display = isAuthenticating ? 'none' : '';
        if (isAuthenticating) {
            if (loginPanelEl) loginPanelEl.style.display = 'none';
            if (signupPanelEl) signupPanelEl.style.display = 'none';
            if (window.ThinkRightLoader?.hold) {
                window.ThinkRightLoader.hold('oauth-authenticating');
            }
        } else {
            const currentMode = urlParams.get('mode') || (window.location.hash === '#signup' ? 'signup' : 'login');
            switchMode(currentMode, false);
            if (window.ThinkRightLoader?.release) {
                window.ThinkRightLoader.release('oauth-authenticating');
            }
            if (window.ThinkRightLoader?.done) {
                window.ThinkRightLoader.done();
            }
        }
    }

    // Show simple loading while returning from Google OAuth redirect instead of text
    const isOAuthCallback = !hasOAuthError && (
        (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('refresh_token'))) ||
        (window.location.search && (window.location.search.includes('code=') || urlParams.get('oauth') === 'google'))
    );
    if (isOAuthCallback) {
        setAuthenticatingState(true);
        // Safety timeout: if authentication takes longer than 15s without an event, restore form
        setTimeout(() => {
            if (!authRedirectHandled) {
                setAuthenticatingState(false);
                showError('Authentication timed out. Please try signing in again.');
            }
        }, 15000);
    }

    // --- CENTRALIZED POST-AUTH ROUTING & BOOTSTRAP ---
    let authRedirectHandled = false;
    const isTeacherGoogleSignupCallback = !hasOAuthError
        && urlParams.get('oauth') === 'google'
        && urlParams.get('mode') === 'signup'
        && urlParams.get('role') === 'teacher';
    async function handleSuccessfulAuth(user, roleOverride = null) {
        if (!user || authRedirectHandled) return;
        authRedirectHandled = true;

        try {
            if (urlParams.get('oauth') === 'google' && urlParams.get('mode') === 'signup') {
                const acceptance = JSON.parse(sessionStorage.getItem(POLICY_ACCEPTANCE_KEY) || 'null');
                if (!acceptance || acceptance.version !== POLICY_VERSION || !acceptance.acceptedAt) {
                    throw new Error('Please return to account creation and accept the Terms of Use and Privacy Notice.');
                }
                const { error: consentError } = await window.supabase.auth.updateUser({
                    data: {
                        terms_accepted_at: acceptance.acceptedAt,
                        privacy_notice_acknowledged_at: acceptance.acceptedAt,
                        policy_version: POLICY_VERSION
                    }
                });
                if (consentError) throw consentError;
                try { sessionStorage.removeItem(POLICY_ACCEPTANCE_KEY); } catch (_error) {}
                try { localStorage.setItem('thinkright_policy_version', POLICY_VERSION); } catch (_error) {}
            }

            // 1. Store username from Google metadata or email
            const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || '').trim() || (user.email ? user.email.split('@')[0] : 'User');
            if (name) {
                localStorage.setItem('thinkright_username', name);
            }

            const teacherSession = roleOverride === 'teacher' || user.user_metadata?.role === 'teacher' || user.user_metadata?.role === 'tutor';
            if (teacherSession) {
                // The onboarding page loads and validates the teacher's application itself.
                window.location.replace('tutor-onboarding.html');
                return;
            }

            // 2. Ensure baseline user profile and subscription rows
            try {
                if (window.ensureUserBootstrapData) {
                    await window.ensureUserBootstrapData(user);
                }
            } catch (bootstrapErr) {
                console.warn('Bootstrap error:', bootstrapErr);
            }

            // Registration may request teaching; only a pending application can be created here.
            if (roleOverride === 'teacher' && !await window.getTutorProfile(user.id)) {
                const { error } = await window.supabase.from('tutors').insert({
                    id: user.id, display_name: name, status: 'pending', revenue_share_pct: 70
                });
                if (error && error.code !== '23505') throw error;
            }
            if (roleOverride === 'teacher') {
                window.location.href = 'tutor-onboarding.html';
                return;
            }
            window.location.href = await window.workspaceDestination(urlParams.get('next'));
        } catch (err) {
            console.error('Error during successful auth handling:', err);
            authRedirectHandled = false;
            setAuthenticatingState(false);
            showError('You signed in, but we could not finish setting up your workspace. Please try again.');
        }
    }

    // --- ASYNC AUTH CHECK & OAUTH STATE CHANGE LISTENER ---
    async function checkExistingAuth() {
        let retries = 0;
        while (!window.authInitialized && retries < 25) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            retries += 1;
        }

        if (!window.authInitialized) return;

        // Listen for SIGNED_IN event (for OAuth callback / session restore)
        if (window.onAuthStateChange) {
            window.onAuthStateChange(async ({ event, session }) => {
                if (event === 'SIGNED_IN' && session?.user && !authRedirectHandled) {
                    await handleSuccessfulAuth(session.user, isTeacherGoogleSignupCallback ? 'teacher' : null);
                }
            });
        }

        try {
            const user = await getCurrentUser();
            if (user && !authRedirectHandled) {
                await handleSuccessfulAuth(user, isTeacherGoogleSignupCallback ? 'teacher' : null);
            }
        } catch (error) {
            console.error('Error checking auth:', error);
        }
    }
    checkExistingAuth();

    // --- GOOGLE OAUTH HANDLERS ---
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const googleSignupBtn = document.getElementById('googleSignupBtn');

    async function handleGoogleAuth(button, mode) {
        clearMessages();
        if (mode === 'signup' && !policyAgreement?.checked) {
            showError('Please agree to the Terms of Use and acknowledge the Privacy Notice to continue with Google.');
            policyAgreement?.focus();
            return;
        }
        try {
            if (mode === 'signup') sessionStorage.setItem(POLICY_ACCEPTANCE_KEY, JSON.stringify({
                acceptedAt: new Date().toISOString(),
                version: POLICY_VERSION
            }));
        } catch (_error) {
            showError('We could not save your agreement. Please enable session storage and try again.');
            return;
        }
        const span = button ? button.querySelector('span') : null;
        const originalText = span ? span.textContent : '';

        if (button) {
            button.disabled = true;
            button.style.opacity = '0.7';
            if (span) span.textContent = 'Connecting to Google...';
        }

        // Immediately open our default rolling loader on Google auth click
        if (window.ThinkRightLoader?.show) {
            window.ThinkRightLoader.show('Connecting to Google...');
        } else {
            setAuthenticatingState(true);
        }

        try {
            const nextUrl = urlParams.get('next');
            localStorage.setItem('thinkright_auth_role', currentRole);
            const result = await signInWithGoogle(currentRole, nextUrl, mode);
            if (!result.success) {
                if (window.ThinkRightLoader?.done) {
                    window.ThinkRightLoader.done();
                }
                setAuthenticatingState(false);
                showError(result.error || 'Could not connect to Google.');
                if (button) {
                    button.disabled = false;
                    button.style.opacity = '1';
                    if (span) span.textContent = originalText;
                }
            }
        } catch (err) {
            console.error('Google auth error:', err);
            if (window.ThinkRightLoader?.done) {
                window.ThinkRightLoader.done();
            }
            setAuthenticatingState(false);
            showError('Unable to start Google sign-in. Please try again.');
            if (button) {
                button.disabled = false;
                button.style.opacity = '1';
                if (span) span.textContent = originalText;
            }
        }
    }

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleGoogleAuth(googleLoginBtn, 'login');
        });
    }

    if (googleSignupBtn) {
        googleSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleGoogleAuth(googleSignupBtn, 'signup');
        });
    }

    // --- LOGIN FORM LOGIC ---
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginBtnSpinner = document.getElementById('loginBtnSpinner');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearMessages();

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                showError('Please enter your email and password.');
                return;
            }

            loginBtn.disabled = true;
            if (loginBtnText) loginBtnText.style.display = 'none';
            if (loginBtnSpinner) loginBtnSpinner.style.display = 'inline-block';

            try {
                const result = await login(email, password);

                if (!result.success) {
                    showError(result.error || 'Failed to login');
                    loginBtn.disabled = false;
                    if (loginBtnText) loginBtnText.style.display = 'inline';
                    if (loginBtnSpinner) loginBtnSpinner.style.display = 'none';
                    return;
                }

                const signedInUser = result.user || await getCurrentUser();
                await handleSuccessfulAuth(signedInUser);
            } catch (error) {
                console.error('Login error:', error);
                showError(error.message || 'An error occurred during login');
                loginBtn.disabled = false;
                if (loginBtnText) loginBtnText.style.display = 'inline';
                if (loginBtnSpinner) loginBtnSpinner.style.display = 'none';
            }
        });
    }

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (event) => {
            event.preventDefault();
            showForgotPasswordModal();
        });
    }

    // --- SIGNUP FORM LOGIC & OTP MODAL ---
    const signupForm = document.getElementById('signupForm');
    const otpVerifyModal = document.getElementById('otpVerifyModal');
    const closeOtpModalBtn = document.getElementById('closeOtpModalBtn');

    const signupEmailInput = document.getElementById('signupEmail');
    // signupUsernameInput already declared above
    const signupPasswordInput = document.getElementById('signupPassword');
    const signupConfirmPasswordInput = document.getElementById('signupConfirmPassword');
    const signupPasswordHint = document.getElementById('signupPasswordHint');

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

    const OTP_COOLDOWN_SECONDS = 30;
    const DEV_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let pendingEmail = '';
    let resendSeconds = 0;
    let resendTimer = null;

    function setSignupLoading(isLoading) {
        if (!signupBtn) return;
        signupBtn.disabled = isLoading;
        if (signupBtnText) signupBtnText.style.display = isLoading ? 'none' : 'inline';
        if (signupBtnSpinner) signupBtnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    function setVerifyLoading(isLoading) {
        if (!verifyCodeBtn) return;
        verifyCodeBtn.disabled = isLoading;
        if (verifyCodeBtnText) verifyCodeBtnText.style.display = isLoading ? 'none' : 'inline';
        if (verifyCodeBtnSpinner) verifyCodeBtnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    function stopResendCooldown() {
        if (resendTimer) {
            clearInterval(resendTimer);
            resendTimer = null;
        }
    }

    function updateResendButton() {
        if (!resendCodeBtn) return;
        if (resendSeconds > 0) {
            resendCodeBtn.disabled = true;
            resendCodeBtn.innerHTML = `Resend in <span id="resendCountdown">${resendSeconds}</span>s`;
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

    // Modern 6-digit segmented inputs logic
    const otpDigitInputs = Array.from(document.querySelectorAll('#otpInputsGrid .otp-digit'));

    function getOtpCode() {
        return otpDigitInputs.map((input) => input.value).join('');
    }

    function clearOtpDigits() {
        otpDigitInputs.forEach((input) => {
            input.value = '';
            input.classList.remove('is-filled');
        });
        if (otpCodeInput) otpCodeInput.value = '';
    }

    function fillOtpDigits(codeString) {
        const digits = (codeString || '').replace(/\D/g, '').slice(0, 6).split('');
        otpDigitInputs.forEach((input, i) => {
            input.value = digits[i] || '';
            input.classList.toggle('is-filled', Boolean(digits[i]));
        });
        if (otpCodeInput) otpCodeInput.value = getOtpCode();
        const nextIndex = Math.min(digits.length, otpDigitInputs.length - 1);
        if (otpDigitInputs[nextIndex]) {
            otpDigitInputs[nextIndex].focus();
        }
    }

    otpDigitInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const rawVal = e.target.value.replace(/\D/g, '');
            if (rawVal.length > 1) {
                fillOtpDigits(rawVal);
                return;
            }
            input.value = rawVal;
            input.classList.toggle('is-filled', Boolean(rawVal));
            if (otpCodeInput) otpCodeInput.value = getOtpCode();

            if (rawVal && index < otpDigitInputs.length - 1) {
                otpDigitInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (!input.value && index > 0) {
                    otpDigitInputs[index - 1].value = '';
                    otpDigitInputs[index - 1].classList.remove('is-filled');
                    otpDigitInputs[index - 1].focus();
                    if (otpCodeInput) otpCodeInput.value = getOtpCode();
                } else {
                    input.value = '';
                    input.classList.remove('is-filled');
                    if (otpCodeInput) otpCodeInput.value = getOtpCode();
                }
            } else if (e.key === 'ArrowLeft' && index > 0) {
                otpDigitInputs[index - 1].focus();
            } else if (e.key === 'ArrowRight' && index < otpDigitInputs.length - 1) {
                otpDigitInputs[index + 1].focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (verifyCodeBtn) verifyCodeBtn.click();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = e.clipboardData?.getData('text') || '';
            fillOtpDigits(pastedText);
        });

        input.addEventListener('focus', () => {
            input.select();
        });
    });

    function openOtpModal(email) {
        pendingEmail = email;
        if (otpTargetEmail) otpTargetEmail.textContent = pendingEmail;
        clearOtpDigits();
        if (otpVerifyModal) {
            otpVerifyModal.style.display = 'flex';
            // Trigger reflow for smooth CSS slide-in transition
            void otpVerifyModal.offsetWidth;
            otpVerifyModal.classList.add('is-visible');
            otpVerifyModal.setAttribute('aria-hidden', 'false');
            // mark document as having a modal open so we can override unwanted blur
            document.body.classList.add('modal-open');
        }
        if (otpDigitInputs[0]) {
            setTimeout(() => otpDigitInputs[0].focus(), 150);
        }
        startResendCooldown(OTP_COOLDOWN_SECONDS);
    }

    function closeOtpModal() {
        if (!otpVerifyModal) return;
        otpVerifyModal.classList.remove('is-visible');
        otpVerifyModal.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (!otpVerifyModal.classList.contains('is-visible')) {
                // remove modal-open marker and hide
                document.body.classList.remove('modal-open');
                otpVerifyModal.style.display = 'none';
            }
        }, 250);
        stopResendCooldown();
    }

    if (closeOtpModalBtn) {
        closeOtpModalBtn.addEventListener('click', () => {
            closeOtpModal();
        });
    }

    async function sendOtpForSignup(isResend = false) {
        if (!pendingEmail) {
            showError('No email pending verification. Please create your account again.');
            closeOtpModal();
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

    if (signupForm) {
        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const email = signupEmailInput ? signupEmailInput.value.trim().toLowerCase() : '';
            const username = signupUsernameInput ? signupUsernameInput.value.trim() : '';
            const password = signupPasswordInput ? signupPasswordInput.value : '';
            const confirmPassword = signupConfirmPasswordInput ? signupConfirmPasswordInput.value : '';

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
            if (!policyAgreement?.checked) {
                showError('Please agree to the Terms of Use and confirm you have read the Privacy Notice to create an account.');
                policyAgreement?.focus();
                return;
            }

            setSignupLoading(true);
            try {
                localStorage.setItem('thinkright_signup_role', currentRole);
                const acceptedAt = new Date().toISOString();
                const signupResult = await signUp(email, password, username, currentRole, {
                    acceptedAt,
                    version: POLICY_VERSION
                });
                if (!signupResult.success) {
                    showError(signupResult.error || 'Failed to create account.');
                    return;
                }
                localStorage.setItem('thinkright_policy_version', POLICY_VERSION);

                // Slide in OTP modal and send OTP code
                openOtpModal(email);
                await sendOtpForSignup(false);
            } catch (error) {
                console.error('Signup submit error:', error);
                showError(error.message || 'An error occurred during signup.');
            } finally {
                setSignupLoading(false);
            }
        });
    }

    if (verifyCodeBtn) {
        verifyCodeBtn.addEventListener('click', async () => {
            const code = getOtpCode();
            if (otpCodeInput) otpCodeInput.value = code;
            clearMessages();

            if (!pendingEmail) {
                showError('Verification session expired. Please create your account again.');
                closeOtpModal();
                return;
            }
            if (code.length !== 6) {
                showError('Enter the full 6-digit verification code.');
                const firstEmpty = otpDigitInputs.find((input) => !input.value) || otpDigitInputs[0];
                if (firstEmpty) firstEmpty.focus();
                return;
            }

            setVerifyLoading(true);
            try {
                const verifyResult = await verifyEmailOtp(pendingEmail, code);
                if (!verifyResult.success) {
                    showError(verifyResult.error || 'Invalid or expired code.');
                    return;
                }

                const isTeacherSignup = currentRole === 'teacher' || localStorage.getItem('thinkright_signup_role') === 'teacher';

                if (isTeacherSignup) {
                    showSuccess('Email verified! Redirecting to tutor onboarding...');
                    closeOtpModal();
                    authRedirectHandled = true;
                    window.location.replace('tutor-onboarding.html');
                } else {
                    showSuccess('Email verified successfully! You can now sign in.');
                    closeOtpModal();

                    await logout();

                    setTimeout(() => {
                        switchMode('login');
                        if (emailInput) {
                            emailInput.value = pendingEmail;
                            if (passwordInput) passwordInput.focus();
                        }
                    }, 1200);
                }
            } catch (error) {
                console.error('Verify OTP error:', error);
                showError(error.message || 'Unable to verify code right now.');
            } finally {
                setVerifyLoading(false);
            }
        });
    }

    if (resendCodeBtn) {
        resendCodeBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (resendSeconds > 0 || !pendingEmail) return;
            await sendOtpForSignup(true);
        });
    }

    if (signupPasswordInput && signupPasswordHint) {
        signupPasswordInput.addEventListener('input', () => {
            if (signupPasswordInput.value.length < 6) {
                signupPasswordHint.textContent = 'Minimum 6 characters.';
                return;
            }
            signupPasswordHint.textContent = 'Password looks good.';
        });
    }

    if (otpCodeInput) {
        otpCodeInput.addEventListener('input', () => {
            otpCodeInput.value = otpCodeInput.value.replace(/\D/g, '').slice(0, 6);
        });

        otpCodeInput.addEventListener('paste', (event) => {
            event.preventDefault();
            const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
            otpCodeInput.value = pasted;
        });
    }

    // --- SETUP PASSWORD VISIBILITY TOGGLES (SVG EYE) ---
    function setupEyeToggle(toggleBtnId, inputId) {
        const toggleBtn = document.getElementById(toggleBtnId);
        const input = document.getElementById(inputId);
        if (!toggleBtn || !input) return;

        toggleBtn.setAttribute('aria-pressed', 'false');
        toggleBtn.setAttribute('aria-label', 'Show password');
        toggleBtn.setAttribute('title', 'Show password');

        toggleBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            toggleBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
            toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            toggleBtn.setAttribute('title', isHidden ? 'Hide password' : 'Show password');

            const eyeOpen = toggleBtn.querySelector('.icon-eye-open');
            const eyeOff = toggleBtn.querySelector('.icon-eye-off');
            if (eyeOpen && eyeOff) {
                eyeOpen.style.display = isHidden ? 'none' : 'block';
                eyeOff.style.display = isHidden ? 'block' : 'none';
            }
        });
    }

    setupEyeToggle('passwordToggle', 'password');
    setupEyeToggle('signupPasswordToggle', 'signupPassword');
    setupEyeToggle('signupConfirmPasswordToggle', 'signupConfirmPassword');

    // Theme toggles
    const themeToggle = document.getElementById('themeToggle');
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

    // (google sign-in handlers removed)
});

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
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div class="modal-content" style="
            background: var(--surface-bg, white);
            border-radius: var(--radius-lg, 12px);
            padding: 30px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        ">
            <h3 style="margin-top: 0; margin-bottom: 10px; color: var(--text-primary, #111827);">Reset Password</h3>
            <p style="color: var(--text-secondary, #6b7280); font-size: 14px; margin-bottom: 20px;">
                Enter your email address and we will send you a link to reset your password.
            </p>
            
            <div id="resetError" style="
                display: none;
                background: #fee2e2;
                color: #991b1b;
                padding: 10px;
                border-radius: 6px;
                margin-bottom: 15px;
                font-size: 14px;
            "></div>

            <div id="resetSuccess" style="
                display: none;
                background: #dcfce7;
                color: #166534;
                padding: 10px;
                border-radius: 6px;
                margin-bottom: 15px;
                font-size: 14px;
            "></div>

            <form id="forgotPasswordForm">
                <div class="form-group" style="margin-bottom: 20px;">
                    <label for="resetEmail" style="
                        display: block;
                        margin-bottom: 6px;
                        font-weight: 500;
                        color: var(--text-primary, #111827);
                    ">Email Address</label>
                    <input
                        type="email"
                        id="resetEmail"
                        required
                        class="form-input"
                        placeholder="you@example.com"
                        style="width: 100%; box-sizing: border-box;"
                    >
                </div>

                <div style="display: flex; gap: 10px;">
                    <button
                        type="button"
                        id="closeResetModal"
                        class="auth-button auth-button-secondary"
                        style="flex: 1;"
                    >Cancel</button>
                    <button
                        type="submit"
                        id="sendResetBtn"
                        class="auth-button"
                        style="flex: 1;"
                    >Send Link</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('closeResetModal');
    const form = document.getElementById('forgotPasswordForm');
    const resetEmail = document.getElementById('resetEmail');
    const resetError = document.getElementById('resetError');
    const resetSuccess = document.getElementById('resetSuccess');
    const sendResetBtn = document.getElementById('sendResetBtn');

    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = resetEmail.value.trim();

        resetError.style.display = 'none';
        resetSuccess.style.display = 'none';
        sendResetBtn.disabled = true;
        sendResetBtn.textContent = 'Sending...';

        try {
            const result = await resetPassword(email);
            if (!result.success) {
                resetError.textContent = result.error || 'Failed to send reset link';
                resetError.style.display = 'block';
                sendResetBtn.disabled = false;
                sendResetBtn.textContent = 'Send Link';
                return;
            }

            resetSuccess.textContent = 'Password reset link sent! Check your inbox.';
            resetSuccess.style.display = 'block';
            resetEmail.value = '';
            
            setTimeout(() => {
                modal.remove();
            }, 3000);
        } catch (error) {
            console.error('Reset error:', error);
            resetError.textContent = error.message || 'An error occurred';
            resetError.style.display = 'block';
            sendResetBtn.disabled = false;
            sendResetBtn.textContent = 'Send Link';
        }
    });
}

function setupInstallAppCard() {
    const card = document.getElementById('installAppCard');
    const toggle = document.getElementById('installAppToggle');
    const button = document.getElementById('loginInstallBtn');
    if (!card || !toggle || !button) return;
    const install = window.ThinkRightInstall;
    const subtitle = card.querySelector('.install-app-toggle-subtitle');
    const steps = card.querySelector('.install-app-steps');
    const message = document.createElement('p');
    message.className = 'install-app-description';
    message.setAttribute('role', 'status');
    card.querySelector('.install-app-panel-inner').prepend(message);
    let busy = false;
    function sync() {
        card.hidden = !!install?.installed;
        button.style.display = install?.installed ? 'none' : 'inline-flex';
        button.textContent = install?.ready ? 'Install App' : 'How to install';
        button.setAttribute('aria-hidden', String(!!install?.installed));
        steps.hidden = false;
        subtitle.textContent = install?.ready ? 'Tap to install. No app store needed.' : 'Your study space, one tap away.';
        if (install?.ready) message.textContent = '';
    }
    async function promptInstall() {
        if (busy) return;
        if (!install?.ready) {
            card.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
            steps.hidden = false;
            card.querySelector('.install-app-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        busy = true;
        button.disabled = true;
        try {
            const outcome = await install.prompt();
            message.textContent = outcome === 'accepted' ? 'Installation requested. Follow your device to finish.' : 'Installation cancelled. You can keep using ThinkRight here.';
        } catch {
            message.textContent = 'The install prompt could not open. You can use the instructions below.';
        } finally {
            busy = false;
            button.disabled = false;
            sync();
        }
    }
    toggle.addEventListener('click', () => {
        const open = card.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    button.addEventListener('click', promptInstall);
    window.addEventListener('thinkright-install-change', sync);
    sync();
}


