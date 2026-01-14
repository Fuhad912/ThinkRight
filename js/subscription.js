/**
 * THINKRIGHT - SUBSCRIPTION & PREMIUM SYSTEM (MVP)
 * 
 * Metadata-based premium access using Flutterwave redirect flow.
 * No database queries - all subscription data stored in auth metadata.
 * 
 * Metadata Fields:
 * - is_premium: boolean (true = has active subscription)
 * - subscription_plan: 'monthly' | 'quarterly'
 * - subscription_expires_at: ISO string (expiry timestamp)
 * - subscription_started_at: ISO string (start timestamp)
 * - tx_ref: Flutterwave transaction reference
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUBSCRIPTION_CONFIG = {
    FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK-6983428fd6bffcb59ff0ca0ebd8c2d67-X',
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

// ============================================================================
// STATE
// ============================================================================

const subscriptionState = {
    user: null,
    metadata: null,
    initialized: false
};

/**
 * Initialize subscription system
 * Loads user metadata from Supabase auth
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
        subscriptionState.initialized = true;
        
        console.log('✅ Subscription initialized for user:', user.id);
        console.log('  Is Premium:', isPremium());
        console.log('  Plan:', subscriptionState.metadata.subscription_plan);
        console.log('  Expires:', subscriptionState.metadata.subscription_expires_at);
        
        return true;
    } catch (error) {
        console.error('Error initializing subscription:', error);
        subscriptionState.initialized = false;
        return false;
    }
}

// ============================================================================
// METADATA GETTERS
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
 * Check if user is premium and subscription hasn't expired
 */
function isPremium() {
    const status = getPremiumStatus();
    
    // Only treat as full premium if explicitly marked and plan is monthly/quarterly
    if (!status.is_premium) return false;

    if (status.subscription_plan !== 'monthly' && status.subscription_plan !== 'quarterly') {
        // Not a paid plan
        return false;
    }

    // Check expiry
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
        // Ensure user is loaded
        if (!subscriptionState.user) {
            console.log('User not in state, loading...');
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('User not authenticated. Please log in first.');
            }
            subscriptionState.user = user;
        }

        const plan = SUBSCRIPTION_CONFIG.PLANS[planKey];
        if (!plan) {
            throw new Error('Invalid plan');
        }

        // Generate unique transaction reference
        const txRef = `thinkright_${subscriptionState.user.id}_${planKey}_${Date.now()}`;
        
        console.log('💳 Initiating payment...');
        console.log('  Plan:', planKey);
        console.log('  Amount: ₦' + plan.price);
        console.log('  Email:', subscriptionState.user.email);
        console.log('  Tx Ref:', txRef);

        // Prepare checkout payload
        const checkoutPayload = {
            public_key: SUBSCRIPTION_CONFIG.FLUTTERWAVE_PUBLIC_KEY,
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
            redirect_url: window.location.origin + '/payment-callback.html'
        };

        // Load Flutterwave script if not present
        if (!window.FlutterwaveCheckout) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://checkout.flutterwave.com/v3.js';
                script.async = true;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load Flutterwave script'));
                document.head.appendChild(script);
            });
        }

        // Open Flutterwave checkout
        window.FlutterwaveCheckout({
            public_key: checkoutPayload.public_key,
            tx_ref: checkoutPayload.tx_ref,
            amount: checkoutPayload.amount,
            currency: checkoutPayload.currency,
            payment_options: checkoutPayload.payment_options,
            customer: checkoutPayload.customer,
            customizations: checkoutPayload.customizations,
            redirect_url: checkoutPayload.redirect_url,
            onclose: function() {
                console.log('Flutterwave checkout closed by user');
            }
        });

    } catch (error) {
        console.error('Error initiating payment:', error);
        alert('Payment error: ' + error.message);
    }
}

// ============================================================================
// PAYWALL MODALS
// ============================================================================

/**
 * Show paywall modal for blocked access
 */
function showPaywallModal(page = 'premium content') {
    closePaywallModal();

    const modal = document.createElement('div');
    modal.id = 'paywallModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 40px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        text-align: center;
    `;
    
    content.innerHTML = `
        <h2 style="color: #333; margin-bottom: 15px;">You've Used All Free Tests</h2>
        <p style="color: #666; margin-bottom: 30px; line-height: 1.6;">
            You've completed your 6 free practice tests. Upgrade to premium to continue taking tests and access full platform features.
        </p>
        
        <div style="background: #f0f7ff; border-left: 4px solid #667eea; padding: 15px; margin-bottom: 25px; border-radius: 4px; text-align: left;">
            <p style="color: #333; margin: 0 0 8px 0; font-weight: bold;">✓ Premium Benefits:</p>
            <p style="color: #666; margin: 5px 0; font-size: 14px;">• Unlimited practice tests</p>
            <p style="color: #666; margin: 5px 0; font-size: 14px;">• Dashboard analytics & progress tracking</p>
            <p style="color: #666; margin: 5px 0; font-size: 14px;">• Syllabus PDFs for all subjects</p>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <button onclick="window.Subscription.initiatePremiumPayment('monthly')" style="
                background: #667eea;
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
                transition: background 0.3s;
            " onmouseover="this.style.background='#5568d3'" onmouseout="this.style.background='#667eea'">1 Month - ₦1,499</button>
            
            <button onclick="window.Subscription.initiatePremiumPayment('quarterly')" style="
                background: #764ba2;
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
                transition: background 0.3s;
            " onmouseover="this.style.background='#63408a'" onmouseout="this.style.background='#764ba2'">3 Months - ₦3,999 (BEST VALUE)</button>
        </div>
        
        <button onclick="window.Subscription.closePaywallModal()" style="
            background: #f0f0f0;
            color: #333;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            width: 100%;
        ">Cancel</button>
        
        <p style="color: #999; font-size: 12px; margin-top: 15px;">
            Need help with payment or access? <br>
            📧 thinkright912@gmail.com | 💬 WhatsApp: +234 816 027 1964
        </p>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
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
    closePricingModal();
    
    const modal = document.createElement('div');
    modal.id = 'pricingModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        overflow-y: auto;
        padding: 20px;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        border-radius: 12px;
        max-width: 900px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        margin: auto;
    `;

    const userEmail = subscriptionState.user?.email || 'user@example.com';

    content.innerHTML = `
        <div style="padding: 40px; border-bottom: 1px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; color: #333;">Our Plans & Pricing</h2>
                <button onclick="window.Subscription.closePricingModal()" style="
                    background: none;
                    border: none;
                    font-size: 28px;
                    cursor: pointer;
                    color: #999;
                ">×</button>
            </div>
            <p style="color: #666; margin: 10px 0 0 0;">Choose the plan that works best for you</p>
        </div>

        <div style="padding: 40px;">
            <!-- Pricing Cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px; margin-bottom: 40px;">
                <!-- Free Plan -->
                <div style="
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 30px;
                    text-align: center;
                    background: #f9f9f9;
                ">
                    <h3 style="margin: 0 0 10px 0; color: #333; font-size: 24px;">Free</h3>
                    <div style="color: #667eea; font-size: 32px; font-weight: bold; margin: 10px 0;">₦0</div>
                    <div style="color: #999; font-size: 14px; margin-bottom: 20px;">6 Practice Tests</div>
                    <ul style="list-style: none; padding: 0; margin: 20px 0; text-align: left;">
                        <li style="padding: 8px 0; color: #333;">✓ 6 free practice tests</li>
                        <li style="padding: 8px 0; color: #333;">✓ View test results</li>
                        <li style="padding: 8px 0; color: #999; text-decoration: line-through;">✗ No dashboard analytics</li>
                        <li style="padding: 8px 0; color: #999; text-decoration: line-through;">✗ No syllabus PDFs</li>
                    </ul>
                    <button style="
                        width: 100%;
                        padding: 12px;
                        background: #e0e0e0;
                        color: #666;
                        border: none;
                        border-radius: 6px;
                        cursor: default;
                        font-weight: bold;
                        margin-top: 20px;
                    " disabled>Try Free</button>
                </div>

                <!-- 1 Month Plan -->
                <div style="
                    border: 2px solid #667eea;
                    border-radius: 8px;
                    padding: 30px;
                    text-align: center;
                    background: #f5f7ff;
                    position: relative;
                ">
                    <h3 style="margin: 0 0 10px 0; color: #333; font-size: 24px;">1 Month</h3>
                    <div style="color: #667eea; font-size: 36px; font-weight: bold; margin: 10px 0;">₦1,499</div>
                    <div style="color: #999; font-size: 14px; margin-bottom: 20px;">30 days access</div>
                    <ul style="list-style: none; padding: 0; margin: 20px 0; text-align: left;">
                        <li style="padding: 8px 0; color: #333;">✓ Unlimited tests</li>
                        <li style="padding: 8px 0; color: #333;">✓ Full test access</li>
                        <li style="padding: 8px 0; color: #333;">✓ Dashboard analytics</li>
                        <li style="padding: 8px 0; color: #333;">✓ Syllabus PDFs</li>
                    </ul>
                    <button onclick="window.Subscription.initiatePremiumPayment('monthly')" style="
                        width: 100%;
                        padding: 12px;
                        background: #667eea;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: bold;
                        margin-top: 20px;
                        transition: background 0.3s;
                    " onmouseover="this.style.background='#5568d3'" onmouseout="this.style.background='#667eea'">Get Started</button>
                </div>

                <!-- 3 Month Plan (Popular) -->
                <div style="
                    border: 2px solid #764ba2;
                    border-radius: 8px;
                    padding: 30px;
                    text-align: center;
                    background: #f8f5ff;
                    position: relative;
                    transform: scale(1.05);
                ">
                    <div style="
                        background: #764ba2;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: bold;
                        display: inline-block;
                        margin-bottom: 15px;
                    ">BEST VALUE - Save 10%</div>
                    <h3 style="margin: 0 0 10px 0; color: #333; font-size: 24px;">3 Months</h3>
                    <div style="color: #764ba2; font-size: 36px; font-weight: bold; margin: 10px 0;">₦3,999</div>
                    <div style="color: #999; font-size: 14px; margin-bottom: 20px;">90 days access</div>
                    <ul style="list-style: none; padding: 0; margin: 20px 0; text-align: left;">
                        <li style="padding: 8px 0; color: #333;">✓ Unlimited tests</li>
                        <li style="padding: 8px 0; color: #333;">✓ Full test access</li>
                        <li style="padding: 8px 0; color: #333;">✓ Dashboard analytics</li>
                        <li style="padding: 8px 0; color: #333;">✓ Syllabus PDFs</li>
                    </ul>
                    <button onclick="window.Subscription.initiatePremiumPayment('quarterly')" style="
                        width: 100%;
                        padding: 12px;
                        background: #764ba2;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: bold;
                        margin-top: 20px;
                        transition: background 0.3s;
                    " onmouseover="this.style.background='#63408a'" onmouseout="this.style.background='#764ba2'">Get Started</button>
                </div>
            </div>

            <!-- Comparison Table -->
            <div style="margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 40px;">
                <h3 style="color: #333; margin-bottom: 20px;">What's Included</h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: bold;">Feature</th>
                                <th style="padding: 12px; text-align: center; color: #333; font-weight: bold;">Free</th>
                                <th style="padding: 12px; text-align: center; color: #667eea; font-weight: bold;">1 Month</th>
                                <th style="padding: 12px; text-align: center; color: #764ba2; font-weight: bold;">3 Months</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #e0e0e0;">
                                <td style="padding: 12px; color: #333;">Test Limit</td>
                                <td style="padding: 12px; text-align: center; color: #333;">6 tests</td>
                                <td style="padding: 12px; text-align: center; color: #333;">Unlimited</td>
                                <td style="padding: 12px; text-align: center; color: #333;">Unlimited</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                                <td style="padding: 12px; color: #333;">Duration</td>
                                <td style="padding: 12px; text-align: center; color: #666;">No expiry</td>
                                <td style="padding: 12px; text-align: center; color: #333;">30 days</td>
                                <td style="padding: 12px; text-align: center; color: #333;">90 days</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #e0e0e0;">
                                <td style="padding: 12px; color: #333;">Test Results</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                                <td style="padding: 12px; color: #333;">Dashboard</td>
                                <td style="padding: 12px; text-align: center; color: #999;">✗</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #e0e0e0;">
                                <td style="padding: 12px; color: #333;">Syllabus PDFs</td>
                                <td style="padding: 12px; text-align: center; color: #999;">✗</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                            </tr>
                            <tr style="background: #fafafa;">
                                <td style="padding: 12px; color: #333;">Analytics</td>
                                <td style="padding: 12px; text-align: center; color: #999;">✗</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                                <td style="padding: 12px; text-align: center; color: #333;">✓</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Support Info -->
            <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                <p style="color: #666; margin: 0 0 10px 0;">Need help choosing a plan?</p>
                <p style="color: #999; font-size: 14px; margin: 0;">
                    📧 Email: thinkright912@gmail.com<br>
                    💬 WhatsApp: +234 816 027 1964
                </p>
            </div>
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
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

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

window.Subscription = {
    init: initSubscription,
    isPremium,
    canAccessDashboard,
    canAccessTests,
    canAccessSyllabus,
    getAccessStatus,
    getPremiumStatus,
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
    tryStartTest
};
