/**
 * THINKRIGHT - SUBSCRIPTION & PREMIUM SYSTEM
 * 
 * Database-backed subscription system with fallback to metadata.
 * Supports Flutterwave payments for monthly/quarterly plans.
 * 
 * Tables:
 * - subscriptions: stores plan, status, expiry, payment details
 * - user_profiles: stores is_premium flag
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUBSCRIPTION_CONFIG = {
    FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK-8aa1f34cf4d02ddbf59500727bfbd82d-X',
    PLANS: {
        monthly: {
            name: '1 Month',
            price: 1499,
            days: 30,
            key: 'monthly'
        },
        quarterly: {
            name: '3 Months',
            price: 3999,
            days: 90,
            key: 'quarterly'
        }
    }
};

function closestFromTarget(target, selector) {
    // Improved version with better browser compatibility
    if (!target) return null;
    
    // Normalize to Element
    let el = target.nodeType === 1 ? target : target.parentElement;
    if (!el) return null;
    
    // Try native closest first
    if (el.closest) {
        return el.closest(selector);
    }
    
    // Fallback for older browsers
    while (el) {
        if (el.matches && el.matches(selector)) return el;
        if (el.msMatchesSelector && el.msMatchesSelector(selector)) return el;
        el = el.parentElement;
    }
    return null;
}

function getFlutterwavePublicKey() {
    // Allow deployment-time override without rebuilding bundle.
    // IMPORTANT: This must be the Flutterwave PUBLIC key (usually starts with FLWPUBK-).
    const override = (typeof window !== 'undefined' && window.THINKRIGHT_FLUTTERWAVE_PUBLIC_KEY)
        ? String(window.THINKRIGHT_FLUTTERWAVE_PUBLIC_KEY).trim()
        : '';
    return override || SUBSCRIPTION_CONFIG.FLUTTERWAVE_PUBLIC_KEY;
}

function assertValidFlutterwavePublicKey(publicKey) {
    const pk = String(publicKey || '').trim();
    // Flutterwave public keys are typically like: FLWPUBK-xxxx-X (test/live).
    if (!/^FLWPUBK-[A-Za-z0-9\\-_.]+-X$/.test(pk)) {
        console.error('Invalid Flutterwave PUBLIC key configured:', pk);
        alert('Payment is not configured correctly. Please set your Flutterwave PUBLIC key (starts with FLWPUBK-) in js/subscription.js or window.THINKRIGHT_FLUTTERWAVE_PUBLIC_KEY.');
        return false;
    }
    return true;
}

// Flutterwave script warm-up (helps mobile browsers keep the checkout opening reliable).
let flutterwaveScriptLoading = null;
function warmFlutterwaveScript() {
    if (window.FlutterwaveCheckout) return Promise.resolve(true);
    if (flutterwaveScriptLoading) return flutterwaveScriptLoading;

    flutterwaveScriptLoading = new Promise((resolve) => {
        try {
            const existing = document.querySelector('script[src="https://checkout.flutterwave.com/v3.js"]');
            if (existing) {
                // If the script tag exists but load/error already happened, avoid hanging forever.
                // Use a short timeout fallback and a marker attribute.
                if (existing.getAttribute('data-tr-fw-loaded') === '1') {
                    resolve(true);
                    return;
                }
                if (existing.getAttribute('data-tr-fw-error') === '1') {
                    resolve(false);
                    return;
                }

                const timer = setTimeout(() => resolve(!!window.FlutterwaveCheckout), 4000);
                existing.addEventListener('load', () => {
                    clearTimeout(timer);
                    existing.setAttribute('data-tr-fw-loaded', '1');
                    resolve(true);
                }, { once: true });
                existing.addEventListener('error', () => {
                    clearTimeout(timer);
                    existing.setAttribute('data-tr-fw-error', '1');
                    resolve(false);
                }, { once: true });
                // If it already loaded between checks, resolve quickly.
                setTimeout(() => {
                    if (window.FlutterwaveCheckout) {
                        existing.setAttribute('data-tr-fw-loaded', '1');
                        resolve(true);
                    }
                }, 0);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://checkout.flutterwave.com/v3.js';
            script.async = true;
            const timer = setTimeout(() => resolve(!!window.FlutterwaveCheckout), 6000);
            script.onload = () => {
                clearTimeout(timer);
                script.setAttribute('data-tr-fw-loaded', '1');
                resolve(true);
            };
            script.onerror = () => {
                clearTimeout(timer);
                script.setAttribute('data-tr-fw-error', '1');
                console.error('[payment] Failed to load Flutterwave script: https://checkout.flutterwave.com/v3.js');
                resolve(false);
            };
            document.head.appendChild(script);
        } catch (e) {
            console.error('[payment] warmFlutterwaveScript exception:', e);
            resolve(false);
        }
    });

    return flutterwaveScriptLoading;
}

function isFileProtocol() {
    try {
        return typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    } catch (e) {
        return false;
    }
}

function explainWhyPaymentsDontWorkOnFileProtocol() {
    return [
        'Payments cannot open from file:// pages.',
        'Run ThinkRight from http://localhost (or your deployed https domain) so Supabase auth + Flutterwave checkout can work.',
        '',
        'Quick fix:',
        '1) Open a terminal in the project folder',
        '2) Run:  python -m http.server 5500',
        '3) Open: http://localhost:5500/index.html'
    ].join('\\n');
}

// Start loading early so plan CTA clicks don't need to await network before opening the checkout.
try { warmFlutterwaveScript(); } catch (e) { /* non-fatal */ }

// ============================================================================
// STATE
// ============================================================================

const subscriptionState = {
    user: null,
    metadata: null,
    subscription: null,
    profile: null,
    initialized: false
};

/**
 * Initialize subscription system
 * Loads subscription from database + user profile
 */
async function initSubscription() {
    try {
        // Wait for auth initialization
        let retries = 0;
        while (!window.authInitialized && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        const user = await getCurrentUser();
        if (!user) {
            console.log('⚠️ No authenticated user');
            subscriptionState.initialized = false;
            return false;
        }

        subscriptionState.user = user;
        subscriptionState.metadata = user.user_metadata || {};

        // Load subscription from database
        if (window.supabase) {
            try {
                // Fetch latest subscription row for the user
                const { data: subData, error: subError } = await window.supabase
                    .from('subscriptions')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (subError && subError.code !== 'PGRST116') { // PGRST116 = no rows
                    console.warn('⚠️ Error fetching subscription:', subError);
                } else if (subData) {
                    subscriptionState.subscription = subData;
                    console.log('✅ Subscription loaded from DB:', subData.plan);
                } else {
                    // Ensure every authenticated user has at least one row
                    await ensureFreeSubscriptionRow(user.id);
                }

                // Fetch user profile
                const { data: profData, error: profError } = await window.supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profError && profError.code !== 'PGRST116') {
                    console.warn('⚠️ Error fetching profile:', profError);
                } else if (profData) {
                    subscriptionState.profile = profData;
                }
            } catch (dbError) {
                console.warn('⚠️ Database access error:', dbError);
            }
        }

        subscriptionState.initialized = true;
        
        console.log('✅ Subscription initialized for user:', user.id);
        console.log('  Is Premium:', isPremium());
        console.log('  Plan:', subscriptionState.subscription?.plan || 'free');
        console.log('  Expires:', subscriptionState.subscription?.expires_at || 'N/A');
        
        return true;
    } catch (error) {
        console.error('Error initializing subscription:', error);
        subscriptionState.initialized = false;
        return false;
    }
}

// ============================================================================
// DATABASE GETTERS
// ============================================================================

/**
 * Get active subscription from database (if available)
 */
function getSubscription() {
    return subscriptionState.subscription || null;
}

/**
 * Get user profile from database (if available)
 */
function getUserProfile() {
    return subscriptionState.profile || null;
}

// ============================================================================
// METADATA GETTERS (FALLBACK)
// ============================================================================

/**
 * Get premium status from user metadata
 */
function getPremiumStatus() {
    const metadata = subscriptionState.metadata || {};
    return {
        is_premium: metadata.is_premium === true || metadata.is_premium === 'true',
        subscription_plan: metadata.subscription_plan || null,
        subscription_started_at: metadata.subscription_started_at || null,
        subscription_expires_at: metadata.subscription_expires_at || null,
        tx_ref: metadata.tx_ref || null,
        last_payment_date: metadata.last_payment_date || null
    };
}

/**
 * Ensure a default free subscription row exists for the user (does not overwrite existing rows).
 */
async function ensureFreeSubscriptionRow(userId) {
    try {
        if (!window.supabase || !userId) return null;

        const nowIso = new Date().toISOString();
        const { error: insertError } = await window.supabase
            .from('subscriptions')
            .insert({
                user_id: userId,
                plan: 'free',
                status: 'active',
                started_at: nowIso,
                expires_at: null
            });

        // Ignore duplicates if row already exists
        if (insertError && insertError.code !== '23505') {
            console.warn('⚠️ subscriptions default insert failed:', insertError);
        }

        const { data, error } = await window.supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('⚠️ subscriptions read after insert failed:', error);
        }

        if (data) {
            subscriptionState.subscription = data;
        }

        return data || null;
    } catch (err) {
        console.warn('⚠️ ensureFreeSubscriptionRow error:', err);
        return null;
    }
}

/**
 * Check if user is premium based on database subscription or metadata
 */
function isPremium() {
    const PLAN_MAP = {
        monthly: 'monthly',
        quarter: '3-month',
        quarterly: '3-month',
        '3-month': '3-month',
        '3-months': '3-month',
        '3 months': '3-month',
        '3months': '3-month',
        '3month': '3-month',
        admin: 'admin',
        trial: 'trial',
        free: 'free',
    };
    const normalizePlan = (plan) => {
        const raw = (plan || '').toString().trim().toLowerCase();
        if (PLAN_MAP[raw]) return PLAN_MAP[raw];
        const compact = raw.replace(/\s+/g, '').replace(/_/g, '-');
        return PLAN_MAP[compact] || raw;
    };
    const isPaidPlan = (plan) => {
        const key = normalizePlan(plan);
        return key === 'monthly' || key === '3-month' || key === 'admin';
    };

    // Check database subscription first (primary source of truth)
    const subscription = subscriptionState.subscription;
    if (subscription && ((subscription.status || 'active').toString().toLowerCase() === 'active')) {
        if (!isPaidPlan(subscription.plan)) {
            return false;
        }

        // Check if subscription hasn't expired
        if (subscription.expires_at) {
            const now = new Date();
            const expiresAt = new Date(subscription.expires_at);
            if (now >= expiresAt) {
                console.log('⚠️ Premium subscription expired at:', expiresAt.toISOString());
                return false;
            }
        }
        
        // Subscription is active and valid
        console.log('✅ Premium: DB subscription active (' + subscription.plan + ')');
        return true;
    }

    // Fallback to metadata for backward compatibility
    const status = getPremiumStatus();
    
    if (!status.is_premium) return false;
    if (!isPaidPlan(status.subscription_plan)) {
        return false;
    }

    // Check metadata expiry
    if (status.subscription_expires_at) {
        const now = new Date();
        const expiresAt = new Date(status.subscription_expires_at);
        if (now >= expiresAt) {
            console.log('⚠️ Premium subscription expired at:', expiresAt.toISOString());
            return false;
        }
    }

    return true;
}

/**
 * Check if a trial (24h) is active
 */
function isTrialActive() {
    const status = getPremiumStatus();
    if (status.subscription_plan !== 'trial') return false;
    if (!status.subscription_expires_at) return false;
    const now = new Date();
    const expiresAt = new Date(status.subscription_expires_at);
    return now < expiresAt;
}

/**
 * Get time remaining on subscription in milliseconds
 */
function getSubscriptionTimeRemaining() {
    const status = getPremiumStatus();
    
    if (!status.subscription_expires_at) {
        return 0;
    }
    
    const now = new Date();
    const expiresAt = new Date(status.subscription_expires_at);
    const remaining = expiresAt - now;
    
    return remaining > 0 ? remaining : 0;
}

/**
 * Get subscription time remaining as readable string
 */
function getSubscriptionTimeReadable() {
    const ms = getSubscriptionTimeRemaining();
    if (ms <= 0) return 'Expired';
    
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (hours === 0) return `${days} day${days !== 1 ? 's' : ''}`;
    return `${days} day${days !== 1 ? 's' : ''} ${hours}h`;
}

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Check if user can access dashboard (requires premium)
 */
function canAccessDashboard() {
    if (window.Subscription && typeof window.Subscription.isPremium === 'function') {
        return window.Subscription.isPremium();
    }
    return isPremium();
}

/**
 * Get free tests used count from user metadata (STRICT FREEMIUM)
 */
function getFreeTestsUsed() {
    const meta = subscriptionState.metadata || {};
    const v = meta.free_tests_used;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && !isNaN(n) ? n : 0;
}

/**
 * Check if user can access tests (requires premium OR free tests remaining)
 */
function canAccessTests() {
    // Tests available: premium users OR free users with tests remaining
    return isPremium() || getFreeTestsUsed() < 6;
}

/**
 * Check if user can access syllabus (requires premium)
 */
function canAccessSyllabus() {
    return isPremium();
}

/**
 * Refresh user metadata from Supabase
 */
async function refreshMetadata() {
    try {
        const user = await getCurrentUser();
        if (!user) return false;
        subscriptionState.user = user;
        subscriptionState.metadata = user.user_metadata || {};
        return true;
    } catch (err) {
        console.error('refreshMetadata error:', err);
        return false;
    }
}

/**
 * Ensure subscription validity — clear premium if expired
 */
async function ensureSubscriptionValid() {
    try {
        if (!subscriptionState.metadata) await refreshMetadata();
        const meta = subscriptionState.metadata || {};
        const isPremiumFlag = meta.is_premium === true || meta.is_premium === 'true';
        const expiresAt = meta.subscription_expires_at ? new Date(meta.subscription_expires_at) : null;
        
        if (isPremiumFlag && expiresAt && new Date() >= expiresAt) {
            // Subscription expired — clear premium fields
            if (typeof supabase !== 'undefined' && supabase) {
                const { data, error } = await supabase.auth.updateUser({
                    data: {
                        is_premium: false,
                        subscription_plan: null,
                        subscription_started_at: null,
                        subscription_expires_at: null
                    }
                });
                if (error) {
                    console.error('ensureSubscriptionValid update error:', error);
                } else if (data && data.user) {
                    subscriptionState.metadata = data.user.user_metadata || {};
                } else {
                    await refreshMetadata();
                }
            } else {
                await refreshMetadata();
            }
        }
    } catch (err) {
        console.error('ensureSubscriptionValid error:', err);
    }
}

/**
 * Attempt to start a test (STRICT FREEMIUM LOGIC)
 * - Premium users: always allowed, never increments free_tests_used
 * - Free users with < 6 tests: allowed, increments free_tests_used
 * - Free users with >= 6 tests: blocked
 */
async function tryStartTest() {
    try {
        // Ensure subscription state loaded
        if (typeof initSubscription === 'function') await initSubscription();
        
        // Check and clear expired subscriptions
        await ensureSubscriptionValid();

        // Premium users always allowed (no counting)
        if (isPremium()) {
            console.log('✅ Test allowed (premium user)');
            return { allowed: true, premium: true };
        }

        // Free user — check free test limit (max 6)
        let used = getFreeTestsUsed();
        console.log(`📊 Free tests used: ${used}/6`);
        
        if (used < 6) {
            const newVal = used + 1;
            try {
                // Atomically increment counter in Supabase
                if (typeof supabase !== 'undefined' && supabase) {
                    const { data, error } = await supabase.auth.updateUser({
                        data: {
                            free_tests_used: newVal
                        }
                    });
                    if (error) {
                        console.error('tryStartTest update error:', error);
                        return { allowed: false, reason: 'error' };
                    }
                    if (data && data.user) {
                        subscriptionState.metadata = data.user.user_metadata || {};
                    } else {
                        await refreshMetadata();
                    }
                } else {
                    // Fallback: local only
                    subscriptionState.metadata = subscriptionState.metadata || {};
                    subscriptionState.metadata.free_tests_used = newVal;
                }
            } catch (e) {
                console.error('Error incrementing free tests:', e);
                return { allowed: false, reason: 'error' };
            }
            console.log(`✅ Test allowed (free user, now ${newVal}/6 tests used)`);
            return { allowed: true, premium: false, free_tests_used: newVal };
        }

        // Free test limit exhausted (6 tests done)
        console.log('🔒 Test blocked (6 free tests exhausted)');
        return { allowed: false, reason: 'limit' };
    } catch (err) {
        console.error('tryStartTest error:', err);
        return { allowed: false, reason: 'error' };
    }
}

/**
 * Get access status for all features
 */
function getAccessStatus() {
    const premiumStatus = getPremiumStatus();
    return {
        is_premium: isPremium(),
        subscription_plan: premiumStatus.subscription_plan,
        time_remaining: getSubscriptionTimeReadable(),
        expires_at: premiumStatus.subscription_expires_at,
        can_access_dashboard: canAccessDashboard(),
        can_access_tests: canAccessTests(),
        can_access_syllabus: canAccessSyllabus(),
        free_tests_used: getFreeTestsUsed()
    };
}

// ============================================================================
// FLUTTERWAVE PAYMENT INTEGRATION
// ============================================================================

/**
 * Initiate Flutterwave payment flow using Flutterwave Checkout JS
 * Loads v3.js if necessary and opens the hosted checkout.
 */
async function initiatePremiumPayment(planKey) {
    try {
        console.log('[payment] initiatePremiumPayment called with plan:', planKey);

        if (isFileProtocol()) {
            console.error('[payment] Blocked: cannot open Flutterwave checkout from file:// origin.');
            alert(explainWhyPaymentsDontWorkOnFileProtocol());
            return;
        }

        // If init hasn't populated the user yet, pull it on-demand before redirecting.
        if (!subscriptionState.user && typeof getCurrentUser === 'function') {
            try {
                let retries = 0;
                while (!window.authInitialized && retries < 30) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    retries++;
                }
                const u = await getCurrentUser();
                if (u) {
                    subscriptionState.user = u;
                    subscriptionState.metadata = u.user_metadata || {};
                }
            } catch (e) { /* ignore */ }
        }

        // Check if user is logged in
        if (!subscriptionState.user) {
            console.error('[payment] No user session found. Redirecting to login.');
            const nextUrl = encodeURIComponent(window.location.href);
            window.location.href = `login.html?next=${nextUrl}`;
            return;
        }

const plan = SUBSCRIPTION_CONFIG.PLANS[planKey];
        if (!plan) {
            console.error('[payment] Invalid plan key:', planKey);
            throw new Error('Invalid plan: ' + planKey);
        }

        const publicKey = getFlutterwavePublicKey();
        if (!assertValidFlutterwavePublicKey(publicKey)) {
            console.error('[payment] Missing/invalid Flutterwave public key.');
            return;
        }

        // Ensure Flutterwave script is loaded
        console.log('⏳ Checking Flutterwave script...');
        if (!window.FlutterwaveCheckout) {
            console.log('📦 Loading Flutterwave script...');
            const loaded = await warmFlutterwaveScript();
            if (!loaded || !window.FlutterwaveCheckout) {
                console.error('[payment] FlutterwaveCheckout missing after script load attempt. Script may be blocked by CSP/adblock/network.');
                alert('Unable to load payment system. Please check your internet connection and try again.');
                return;
            }
        }

        // Generate unique transaction reference
        const txRef = `thinkright_${subscriptionState.user.id}_${planKey}_${Date.now()}`;
        
        console.log('💳 Opening Flutterwave checkout...');
        console.log('  Plan:', planKey);
        console.log('  Amount: ₦' + plan.price);
        console.log('  Email:', subscriptionState.user.email);
        console.log('  Tx Ref:', txRef);

        // Open Flutterwave checkout
        if (typeof window.FlutterwaveCheckout !== 'function') {
            console.error('[payment] window.FlutterwaveCheckout is not a function:', window.FlutterwaveCheckout);
            alert('Payment system is not ready. Please refresh and try again.');
            return;
        }
        window.FlutterwaveCheckout({
            public_key: publicKey,
            tx_ref: txRef,
            amount: plan.price,
            currency: 'NGN',
            payment_options: 'card,account,ussd',
            customer: {
                email: subscriptionState.user.email,
                name: subscriptionState.user.user_metadata?.full_name || 'ThinkRight User'
            },
            customizations: {
                title: 'ThinkRight Subscription',
                description: plan.name + ' plan',
                logo: window.location.origin + '/assets/logo.png'
            },
            redirect_url: window.location.origin + '/payment-callback.html',
            onclose: function() {
                console.log('Flutterwave checkout closed by user');
            }
        });

    } catch (error) {
        console.error('Error initiating payment:', error);
        alert('Payment error: ' + (error && error.message ? error.message : 'Unknown error'));
    }
}

// ============================================================================
// PAYWALL MODALS
// ============================================================================

/**
 * Show paywall modal for blocked access
 */
function showPaywallModal(page = 'premium content') {
    // Use the premium paywall renderer (CSP-safe, consistent styling).
    return renderPremiumPaywallModal(page);
}

/**
 * Close paywall modal
 */
function closePaywallModal() {
    const modal = document.getElementById('paywallModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Show comprehensive pricing modal with all plans
 */
function showPricingModal() {
    // Ensure user is available before showing pricing so "Get Started" can open checkout on first click.
    try {
        if (window.Subscription && typeof window.Subscription.init === 'function') {
            window.Subscription.init().catch(() => null);
        }
    } catch (e) { /* non-fatal */ }
    return renderPremiumPricingModal();
}

/**
 * Close pricing modal
 */
function closePricingModal() {
    const modal = document.getElementById('pricingModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Redirect to login while preserving intent to start checkout for a plan.
 * After login, Subscription will auto-start checkout on the destination page.
 */
// redirectToLoginForCheckout removed: initiatePremiumPayment now redirects to login directly.

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

window.Subscription = {
    init: initSubscription,
    isPremium,
    isTrialActive,
    canAccessDashboard,
    canAccessTests,
    canAccessSyllabus,
    getAccessStatus,
    getPremiumStatus,
    getSubscription,
    getUserProfile,
    getSubscriptionTimeRemaining,
    getSubscriptionTimeReadable,
    initiatePremiumPayment,
    showPaywallModal,
    closePaywallModal,
    showPricingModal,
    closePricingModal,
    refreshMetadata,
    ensureSubscriptionValid,
    getFreeTestsUsed,
    tryStartTest,
    updateSubscriptionAfterPayment,
    cancelSubscription,
    grantPremium
};

// ============================================================================
// PREMIUM UI MODAL OVERRIDES
// ============================================================================

function closePremiumModalById(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.remove();
    }
}

function closePremiumPaywallModal() {
    closePremiumModalById('paywallModal');
}

function closePremiumPricingModal() {
    closePremiumModalById('pricingModal');
}

function renderPremiumPaywallModal(page = 'premium content') {
    closePremiumPaywallModal();
    warmFlutterwaveScript();

    const modal = document.createElement('div');
    modal.id = 'paywallModal';
    modal.className = 'tr-paywall-modal';

    const content = document.createElement('div');
    content.className = 'tr-paywall-dialog';
    content.innerHTML = `
        <h2>You've Used All Free Tests</h2>
        <p class="tr-paywall-message">
            You've completed your 6 free practice tests. Upgrade to premium to continue accessing ${page} and full platform features.
        </p>
        <div class="tr-paywall-benefits">
            <p class="tr-paywall-benefits-title">Premium Benefits</p>
            <p>Unlimited practice tests</p>
            <p>Dashboard analytics and progress tracking</p>
            <p>Syllabus PDFs for all subjects</p>
        </div>
        <div class="tr-paywall-actions">
            <button class="tr-btn tr-btn-primary tr-plan-btn" type="button" data-tr-plan="monthly">1 Month - &#8358;1,499</button>
            <button class="tr-btn tr-btn-strong tr-plan-btn" type="button" data-tr-plan="quarterly">3 Months - &#8358;3,999</button>
        </div>
        <button class="tr-btn tr-btn-secondary tr-btn-full" type="button" data-tr-action="paywall-cancel">Cancel</button>
        <p class="tr-paywall-support">
            Need help with payment or access?<br>
            thinkright912@gmail.com | WhatsApp: +234 816 027 1964
        </p>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // If opened from file://, disable payment CTAs with clear explanation.
    if (isFileProtocol()) {
        const planBtns = Array.from(content.querySelectorAll('[data-tr-plan]'));
        planBtns.forEach((btn) => {
            btn.disabled = true;
            btn.classList.add('tr-btn-disabled');
            btn.textContent = 'Run on localhost to pay';
            btn.title = explainWhyPaymentsDontWorkOnFileProtocol();
        });
    }

    // Warm up in background (user + checkout script).
    try {
        Promise.allSettled([
            typeof window.Subscription?.init === 'function' ? window.Subscription.init() : Promise.resolve(),
            warmFlutterwaveScript()
        ]).catch(() => null);
    } catch (e) { /* non-fatal */ }

    // Delegated handlers so clicks always work even if content is re-rendered.
    content.addEventListener('click', (e) => {
        const planBtn = e.target && e.target.closest ? e.target.closest('[data-tr-plan]') : null;
        if (planBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (e.__trPaymentHandled) return;
            e.__trPaymentHandled = true;

            const planKey = planBtn.getAttribute('data-tr-plan');
            console.log('[paywall] Get Started clicked:', planKey);
            try {
                initiatePremiumPayment(planKey);
            } catch (err) {
                console.error('[paywall] initiatePremiumPayment failed:', err);
                alert('Unable to open payment. Please refresh and try again.');
            }
            return;
        }

        const cancelBtn = e.target && e.target.closest ? e.target.closest('[data-tr-action="paywall-cancel"]') : null;
        if (cancelBtn) {
            e.preventDefault();
            e.stopPropagation();
            closePremiumPaywallModal();
            if (typeof window.showTestLockedMessage === 'function') {
                window.showTestLockedMessage();
            }
        }
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closePremiumPaywallModal();
    });
}

function renderPremiumPricingModal() {
    closePremiumPricingModal();
    warmFlutterwaveScript();

    const modal = document.createElement('div');
    modal.id = 'pricingModal';
    modal.className = 'tr-pricing-modal';

    const content = document.createElement('div');
    content.className = 'tr-pricing-dialog';
    const userEmail = subscriptionState.user?.email || '';

    content.innerHTML = `
        <div class="tr-pricing-header">
            <div class="tr-pricing-title-row">
                <h2>Our Plans and Pricing</h2>
                <button class="tr-pricing-close" type="button" data-tr-action="pricing-close" aria-label="Close pricing">x</button>
            </div>
            <p>Choose the plan that works best for you.</p>
        </div>

        <div class="tr-pricing-body">
            <div class="tr-pricing-grid">
                <article class="tr-pricing-card tr-pricing-card-free">
                    <h3>Free</h3>
                    <div class="tr-pricing-price">&#8358;0</div>
                    <div class="tr-pricing-meta">6 practice tests</div>
                    <ul class="tr-pricing-list">
                        <li>6 free practice tests</li>
                        <li>View test results</li>
                        <li class="muted">No dashboard analytics</li>
                        <li class="muted">No syllabus PDFs</li>
                    </ul>
                    <button class="tr-btn tr-btn-disabled tr-btn-full" disabled>Current Free Access</button>
                </article>
                
                 <article class="tr-pricing-card tr-pricing-card-monthly">
                     <h3>1 Month</h3>
                    <div class="tr-pricing-price">&#8358;1,499</div>
                    <div class="tr-pricing-meta">30 days access</div>
                     <ul class="tr-pricing-list">
                        <li>Unlimited tests</li>
                        <li>Full test access</li>
                        <li>Dashboard analytics</li>
                        <li>Syllabus PDFs</li>
                     </ul>
                    <button class="tr-btn tr-btn-primary tr-btn-full tr-plan-btn" type="button" data-tr-plan="monthly">Get Started</button>
                 </article>

                 <article class="tr-pricing-card tr-pricing-card-quarterly">
                     <div class="tr-pricing-badge">Best Value - Save 10%</div>
                    <h3>3 Months</h3>
                    <div class="tr-pricing-price">&#8358;3,999</div>
                    <div class="tr-pricing-meta">90 days access</div>
                     <ul class="tr-pricing-list">
                        <li>Unlimited tests</li>
                        <li>Full test access</li>
                        <li>Dashboard analytics</li>
                        <li>Syllabus PDFs</li>
                     </ul>
                    <button class="tr-btn tr-btn-strong tr-btn-full tr-plan-btn" type="button" data-tr-plan="quarterly">Get Started</button>
                 </article>
             </div>

            <div class="tr-pricing-compare">
                <h3>What Is Included</h3>
                <div class="tr-pricing-table-wrap">
                    <table class="tr-pricing-table">
                        <thead>
                            <tr>
                                <th>Feature</th>
                                <th>Free</th>
                                <th>1 Month</th>
                                <th>3 Months</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Test Limit</td>
                                <td>6 tests</td>
                                <td>Unlimited</td>
                                <td>Unlimited</td>
                            </tr>
                            <tr>
                                <td>Duration</td>
                                <td>No expiry</td>
                                <td>30 days</td>
                                <td>90 days</td>
                            </tr>
                            <tr>
                                <td>Test Results</td>
                                <td>Yes</td>
                                <td>Yes</td>
                                <td>Yes</td>
                            </tr>
                            <tr>
                                <td>Dashboard</td>
                                <td>No</td>
                                <td>Yes</td>
                                <td>Yes</td>
                            </tr>
                            <tr>
                                <td>Syllabus PDFs</td>
                                <td>No</td>
                                <td>Yes</td>
                                <td>Yes</td>
                            </tr>
                            <tr>
                                <td>Analytics</td>
                                <td>No</td>
                                <td>Yes</td>
                                <td>Yes</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="tr-pricing-support">
                <p>Need help choosing a plan?</p>
                <p>Email: thinkright912@gmail.com<br>WhatsApp: +234 816 027 1964</p>
                ${userEmail ? `<p class="tr-pricing-user">Signed in as ${userEmail}</p>` : ''}
            </div>
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // If opened from file://, disable payment CTAs with clear explanation.
    if (isFileProtocol()) {
        const planBtns = Array.from(content.querySelectorAll('[data-tr-plan]'));
        planBtns.forEach((btn) => {
            btn.disabled = true;
            btn.classList.add('tr-btn-disabled');
            btn.textContent = 'Run on localhost to pay';
            btn.title = explainWhyPaymentsDontWorkOnFileProtocol();
        });
    }

    // Warm up in background (user + checkout script).
    try {
        Promise.allSettled([
            typeof window.Subscription?.init === 'function' ? window.Subscription.init() : Promise.resolve(),
            warmFlutterwaveScript()
        ]).catch(() => null);
    } catch (e) { /* non-fatal */ }

    // Delegated handlers so clicks always work even if content is re-rendered.
    content.addEventListener('click', (e) => {
        const closeBtn = e.target && e.target.closest ? e.target.closest('[data-tr-action="pricing-close"]') : null;
        if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            closePremiumPricingModal();
            return;
        }

        const planBtn = e.target && e.target.closest ? e.target.closest('[data-tr-plan]') : null;
        if (planBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (e.__trPaymentHandled) return;
            e.__trPaymentHandled = true;

            const planKey = planBtn.getAttribute('data-tr-plan');
            console.log('[pricing] Get Started clicked:', planKey);
            try {
                initiatePremiumPayment(planKey);
            } catch (err) {
                console.error('[pricing] initiatePremiumPayment failed:', err);
                alert('Unable to open payment. Please refresh and try again.');
            }
        }
    });

    const pricingBody = content.querySelector('.tr-pricing-body');
    if (pricingBody) {
        pricingBody.scrollTop = 0;
    }
    modal.scrollTop = 0;
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closePremiumPricingModal();
    });
}

window.Subscription.showPaywallModal = renderPremiumPaywallModal;
window.Subscription.closePaywallModal = closePremiumPaywallModal;
window.Subscription.showPricingModal = renderPremiumPricingModal;
window.Subscription.closePricingModal = closePremiumPricingModal;
window.showPricingModal = renderPremiumPricingModal;

// Extra safety: capture-phase delegate so plan clicks are handled even if modal markup is re-rendered.
if (!window.__trPricingPlanDelegateAttached) {
    window.__trPricingPlanDelegateAttached = true;
    document.addEventListener('click', (e) => {
        const planBtn = e.target && e.target.closest ? e.target.closest('#pricingModal [data-tr-plan], #paywallModal [data-tr-plan]') : null;
        if (!planBtn) return;
        if (e.__trPaymentHandled) return;
        e.__trPaymentHandled = true;

        const planKey = planBtn.getAttribute('data-tr-plan');
        console.log('[pricing:delegate] plan click:', planKey);

        try {
            initiatePremiumPayment(planKey);
        } catch (err) {
            console.error('[pricing:delegate] initiatePremiumPayment failed:', err);
        }
    }, true);
}

// Proactively initialize subscription state so the first tap can open checkout.
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (window.Subscription && typeof window.Subscription.init === 'function') {
            window.Subscription.init().catch(() => null);
        }
    } catch (e) { /* non-fatal */ }
});
