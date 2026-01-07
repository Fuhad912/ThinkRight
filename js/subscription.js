/**
 * THINKRIGHT - SUBSCRIPTION & TRIAL SYSTEM
 * 
 * Handles:
 * - Trial eligibility (24-hour automatic trial on signup)
 * - Subscription status checking
 * - Access control for dashboard, tests, syllabus
 * - Paywall logic and modal display
 * - Admin bypass
 * - Flutterwave payment integration
 * 
 * Integration Points:
 * - app.js: Check before showing dashboard/tests
 * - test.js: Check before test loads
 * - syllabus.js: Block syllabus access
 * - signup.js: Auto-create trial on signup
 */

// ============================================================================
// SUBSCRIPTION CONFIGURATION
// ============================================================================

const SUBSCRIPTION_CONFIG = {
    TRIAL_DURATION_HOURS: 24,
    FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK-6983428fd6bffcb59ff0ca0ebd8c2d67-X',
    PLANS: {
        '1_month': {
            name: '1 Month',
            price: 1499,
            duration_days: 30,
            currency: '₦'
        },
        '3_month': {
            name: '3 Months',
            price: 3999,
            duration_days: 90,
            currency: '₦',
            discount: '10%'
        }
    },
    CACHE_DURATION_MS: 60000 // 1 minute cache
};

// ============================================================================
// SUBSCRIPTION STATE MANAGEMENT
// ============================================================================

const subscriptionState = {
    user: null,
    subscriptionData: null,
    lastChecked: null,
    isAdmin: false,
    initialized: false
};

// Timer handle to auto-refresh subscription when trial expires
subscriptionState._expiryTimer = null;

// Periodic refresh interval handle (every 60 seconds)
subscriptionState._periodicRefreshInterval = null;
const SUBSCRIPTION_REFRESH_INTERVAL_MS = 60000; // 1 minute

/**
 * Initialize subscription system
 * Called on app startup
 */
async function initSubscription() {
    try {
        // Always refresh subscription data, even if initialized (allow cache refresh)
        // This ensures trial data is always current
        
        // Wait for auth to be initialized
        let retries = 0;
        while (!window.authInitialized && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        const user = await getCurrentUser();
        if (!user) {
            console.log('⚠️ No authenticated user for subscription check');
            return false;
        }

        subscriptionState.user = user;
        
        // Fetch subscription status from Supabase
        console.log('🔄 Fetching subscription data for user:', user.id);
        const subData = await fetchSubscriptionData(user.id);
        
        if (!subData) {
            console.error('❌ Failed to fetch subscription data');
            subscriptionState.subscriptionData = null;
            subscriptionState.initialized = false;
            return false;
        }
        
        subscriptionState.subscriptionData = subData;
        subscriptionState.lastChecked = Date.now();
        
        // Check if user is admin
        subscriptionState.isAdmin = subData?.is_admin === true;
        subscriptionState.initialized = true;
        
        console.log('✓ Subscription system initialized');
        console.log('  User ID:', user.id);
        console.log('  Admin:', subscriptionState.isAdmin);
        console.log('  Subscription Tier:', subData?.subscription_tier);
        console.log('  Trial Ends At:', subData?.trial_ends_at);
        console.log('  Trial Active:', isTrialActive());
        console.log('  Subscription Active:', isSubscriptionActive());
        
        // Schedule a refresh when the trial ends so client state stays accurate
        scheduleTrialExpiryRefresh();

        // Schedule periodic refresh to catch expiry even if page stays open
        schedulePeriodicSubscriptionRefresh();

        return true;
    } catch (error) {
        console.error('Error initializing subscription:', error);
        subscriptionState.initialized = false;
        return false;
    }
}

/**
 * Schedule a refresh of subscription data when the trial ends.
 * This ensures that a client with an open page will re-check state
 * immediately after the trial period and revoke access appropriately.
 */
function scheduleTrialExpiryRefresh() {
    try {
        // Clear existing timer if any
        if (subscriptionState._expiryTimer) {
            clearTimeout(subscriptionState._expiryTimer);
            subscriptionState._expiryTimer = null;
        }

        const subData = subscriptionState.subscriptionData;
        if (!subData || !subData.trial_ends_at) return;

        const now = new Date();
        const trialEnds = new Date(subData.trial_ends_at);
        const msRemaining = trialEnds - now;

        console.log('Scheduling trial expiry refresh. Remaining ms:', msRemaining);

        if (msRemaining <= 0) {
            // Already expired - force immediate refresh
            subscriptionState.initialized = false;
            initSubscription();
            return;
        }

        // Schedule a refresh a little after expiry to account for clock drift
        const refreshIn = msRemaining + 2000; // 2s buffer
        subscriptionState._expiryTimer = setTimeout(async () => {
            console.log('Trial expiry reached - refreshing subscription state');
            subscriptionState.initialized = false;
            await initSubscription();
        }, refreshIn);
    } catch (err) {
        console.error('Error scheduling trial refresh:', err);
    }
}

/**
 * Schedule periodic subscription refresh (every 60 seconds).
 * This ensures that trial expiry is detected promptly even if:
 * - The page stays open for hours
 * - The browser is closed and reopened
 * - The user navigates between pages
 * 
 * Each refresh checks if trial has expired and revokes access immediately.
 */
function schedulePeriodicSubscriptionRefresh() {
    try {
        // Clear existing interval if any
        if (subscriptionState._periodicRefreshInterval) {
            clearInterval(subscriptionState._periodicRefreshInterval);
            subscriptionState._periodicRefreshInterval = null;
        }

        console.log('Starting periodic subscription refresh every', SUBSCRIPTION_REFRESH_INTERVAL_MS / 1000, 'seconds');
        
        subscriptionState._periodicRefreshInterval = setInterval(async () => {
            if (!subscriptionState.initialized) {
                console.log('Subscription not initialized, skipping periodic refresh');
                return;
            }

            console.log('🔄 Periodic subscription refresh check...');
            const wasTrialActive = isTrialActive();
            const wasSubActive = isSubscriptionActive();
            
            // Re-fetch subscription data from server
            if (subscriptionState.user) {
                const freshData = await fetchSubscriptionData(subscriptionState.user.id);
                if (freshData) {
                    subscriptionState.subscriptionData = freshData;
                    subscriptionState.lastChecked = Date.now();
                    
                    const isNowTrialActive = isTrialActive();
                    const isNowSubActive = isSubscriptionActive();
                    
                    // Log status change if trial expired
                    if (wasTrialActive && !isNowTrialActive) {
                        console.log('⚠️ TRIAL EXPIRED! Access revoked.');
                    }
                    if (wasSubActive && !isNowSubActive) {
                        console.log('⚠️ SUBSCRIPTION EXPIRED! Access revoked.');
                    }
                }
            }
        }, SUBSCRIPTION_REFRESH_INTERVAL_MS);
    } catch (err) {
        console.error('Error scheduling periodic refresh:', err);
    }
}

/**
 * Fetch subscription data from Supabase
 * @param {string} userId - User's Supabase ID
 * @returns {Promise<Object|null>} Subscription object or null
 */
async function fetchSubscriptionData(userId) {
    try {
        if (!supabase) {
            console.warn('Supabase not initialized');
            return null;
        }

        if (!userId) {
            console.warn('No user ID provided to fetchSubscriptionData');
            return null;
        }

        console.log('📊 Fetching subscription data for user:', userId);
        
        const { data, error } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            // No record found - automatically create trial for new user
            if (error.code === 'PGRST116' || error.message.includes('no rows')) {
                console.log('⚠️ No subscription record found for user, creating trial...');
                const trialCreated = await createTrialForNewUser(userId);
                if (trialCreated) {
                    // Fetch the newly created trial record
                    console.log('↻ Fetching newly created trial...');
                    const { data: newData, error: newError } = await supabase
                        .from('user_subscriptions')
                        .select('*')
                        .eq('user_id', userId)
                        .single();
                    
                    if (!newError && newData) {
                        console.log('✓ Trial record retrieved after creation:', newData);
                        return newData;
                    } else if (newError) {
                        console.error('❌ Failed to fetch newly created trial:', newError);
                    }
                }
                return null;
            }
            
            // Other errors
            console.error('❌ Error fetching subscription:', error);
            console.error('  Code:', error.code);
            console.error('  Message:', error.message);
            return null;
        }

        console.log('✓ Subscription data found:', data);
        return data;
    } catch (error) {
        console.error('Error fetching subscription data:', error);
        return null;
    }
}

// ============================================================================
// TRIAL & SUBSCRIPTION CHECKING
// ============================================================================

/**
 * Check if user's trial is still active
 * Handles timezone-aware ISO strings from Supabase
 * @returns {boolean} True if trial is active
 */
function isTrialActive() {
    const subData = subscriptionState.subscriptionData;
    
    if (!subData || !subData.trial_ends_at) {
        console.log('⚠️ No trial data found');
        return false;
    }

    try {
        const now = new Date();
        const trialEnds = new Date(subData.trial_ends_at);
        
        console.log('📊 Trial Check:');
        console.log('  Now:', now.toISOString());
        console.log('  Trial Ends:', trialEnds.toISOString());
        console.log('  Is Active:', now < trialEnds);
        
        return now < trialEnds;
    } catch (error) {
        console.error('Error checking trial status:', error);
        return false;
    }
}

/**
 * Get trial time remaining in milliseconds
 * @returns {number} Milliseconds remaining, or 0 if expired
 */
function getTrialTimeRemaining() {
    const subData = subscriptionState.subscriptionData;
    
    if (!subData || !subData.trial_ends_at) {
        return 0;
    }

    const now = new Date();
    const trialEnds = new Date(subData.trial_ends_at);
    const remaining = trialEnds - now;
    
    return remaining > 0 ? remaining : 0;
}

/**
 * Get trial time remaining formatted as readable string
 * @returns {string} Time remaining (e.g., "12 hours 30 minutes")
 */
function getTrialTimeReadable() {
    const ms = getTrialTimeRemaining();
    if (ms <= 0) return 'Expired';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/**
 * Check if user has active subscription (non-trial)
 * @returns {boolean} True if subscription is active and not expired
 */
function isSubscriptionActive() {
    const subData = subscriptionState.subscriptionData;
    
    console.log('💳 Checking subscription status...');
    console.log('  Has subscription data:', !!subData);
    
    if (!subData) {
        console.log('  → No subscription data');
        return false;
    }

    console.log('  Subscription tier:', subData.subscription_tier);
    console.log('  Is active:', subData.is_active);

    if (!subData.is_active) {
        console.log('  → Subscription not active (is_active = false)');
        return false;
    }

    if (subData.subscription_ends_at) {
        const now = new Date();
        const subEnds = new Date(subData.subscription_ends_at);
        console.log('  Subscription ends:', subEnds.toISOString());
        console.log('  Expired:', now >= subEnds);
        return now < subEnds;
    }

    console.log('  → Subscription is active');
    return true;
}

/**
 * Check if user is admin (bypasses all paywalls)
 * @returns {boolean} True if user is admin
 */
function isAdmin() {
    return subscriptionState.isAdmin === true;
}

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Check if user has access to dashboard
 * Admin: Always
 * Trial: Yes (if active)
 * Paid: Yes (if subscription active)
 * Free: No
 */
function canAccessDashboard() {
    console.log('🔍 Checking dashboard access...');
    console.log('  Admin:', isAdmin());
    console.log('  Subscription Active:', isSubscriptionActive());
    
    // Dashboard: Admin only OR Paid subscription only (NOT trial)
    if (isAdmin()) {
        console.log('✓ Dashboard access granted: User is admin');
        return true;
    }
    if (isSubscriptionActive()) {
        console.log('✓ Dashboard access granted: User has paid subscription');
        return true;
    }
    
    console.log('❌ Dashboard access denied: User must have paid subscription');
    return false;
}

/**
 * Check if user has access to tests
 * Admin: Always
 * Trial: Yes (if active)
 * Paid: Yes (if subscription active)
 * Free: No
 */
function canAccessTests() {
    console.log('🔍 Checking test access...');
    console.log('  Admin:', isAdmin());
    console.log('  Trial Active:', isTrialActive());
    console.log('  Subscription Active:', isSubscriptionActive());
    
    if (isAdmin()) {
        console.log('✓ Access granted: User is admin');
        return true;
    }
    if (isTrialActive()) {
        console.log('✓ Access granted: User has active trial');
        return true;
    }
    if (isSubscriptionActive()) {
        console.log('✓ Access granted: User has active subscription');
        return true;
    }
    
    console.log('❌ Access denied: No active trial or subscription');
    console.log('Subscription State:', subscriptionState);
    return false;
}

/**
 * Check if user has access to syllabus
 * Admin: Always
 * Trial: No
 * Paid: Yes (3-month only)
 * Free: No
 */
function canAccessSyllabus() {
    if (isAdmin()) return true;
    // Trial users cannot access syllabus
    if (isTrialActive()) return false;
    // Paid users can access syllabus with any paid subscription (1-month or 3-month)
    if (isSubscriptionActive()) {
        const subData = subscriptionState.subscriptionData;
        return subData?.subscription_tier === '1_month' || subData?.subscription_tier === '3_month';
    }
    return false;
}

/**
 * Get access status for all features
 * @returns {Object} Status object
 */
function getAccessStatus() {
    return {
        admin: isAdmin(),
        trialActive: isTrialActive(),
        trialTimeRemaining: getTrialTimeReadable(),
        subscriptionActive: isSubscriptionActive(),
        subscriptionTier: subscriptionState.subscriptionData?.subscription_tier || null,
        canAccessDashboard: canAccessDashboard(),
        canAccessTests: canAccessTests(),
        canAccessSyllabus: canAccessSyllabus(),
        trialEndsAt: subscriptionState.subscriptionData?.trial_ends_at || null,
        subscriptionEndsAt: subscriptionState.subscriptionData?.subscription_ends_at || null
    };
}

// ============================================================================
// CREATE TRIAL ON SIGNUP
// ============================================================================

/**
 * Create trial entry for new user after successful signup
 * Called after user confirms email
 * 
 * @param {string} userId - User's Supabase ID
 * @returns {Promise<boolean>} True if successful
 */
async function createTrialForNewUser(userId) {
    try {
        if (!supabase || !userId) {
            console.error('❌ Missing supabase or userId');
            return false;
        }

        // Calculate trial end time (24 hours from now)
        const now = new Date();
        const trialEnds = new Date(now.getTime() + SUBSCRIPTION_CONFIG.TRIAL_DURATION_HOURS * 60 * 60 * 1000);

        console.log('🎯 Creating 24-hour trial for user:', userId);
        console.log('  Current Time:', now.toISOString());
        console.log('  Trial Duration:', SUBSCRIPTION_CONFIG.TRIAL_DURATION_HOURS, 'hours');
        console.log('  Trial Ends At:', trialEnds.toISOString());

        // Check if user already has a trial
        const { data: existingData, error: checkError } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (existingData) {
            console.log('✓ Subscription record already exists for user:', userId);
            return true;
        }

        // Proceed with insert even if checkError (expected for new users)
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('❌ Unexpected error checking existing subscription:', checkError);
            console.error('  Code:', checkError.code);
            console.error('  Message:', checkError.message);
            // Don't return, continue with insert attempt
        }

        // Insert into user_subscriptions table
        console.log('📝 Inserting new subscription record...');
        const { data, error } = await supabase
            .from('user_subscriptions')
            .insert([{
                user_id: userId,
                subscription_tier: 'free',
                is_active: false,
                trial_ends_at: trialEnds.toISOString(),
                subscription_ends_at: null,
                is_admin: false,
                created_at: now.toISOString()
            }])
            .select();

        if (error) {
            console.error('❌ Error creating trial:', error);
            console.error('  Code:', error.code);
            console.error('  Message:', error.message);
            console.error('  Details:', error.details);
            console.error('  Hint:', error.hint);
            
            // Check if it's a permission error
            if (error.message.includes('permission') || error.code === '42501') {
                console.error('🚨 PERMISSION ERROR - Check RLS policies on user_subscriptions table');
                console.error('    You need a "Service role" policy that allows INSERT');
            }
            
            return false;
        }

        if (!data || data.length === 0) {
            console.error('❌ No trial data returned after insert');
            return false;
        }

        console.log('✅ Trial successfully created for user:', userId);
        console.log('  Trial Record:', data[0]);
        
        // Reset subscription state so it reloads
        subscriptionState.initialized = false;
        subscriptionState.subscriptionData = null;
        
        // Refresh subscription data
        const refreshed = await initSubscription();
        
        return refreshed;
    } catch (error) {
        console.error('Error creating trial:', error);
        console.error('Full error object:', JSON.stringify(error, null, 2));
        return false;
    }
}

// ============================================================================
// FLUTTERWAVE INTEGRATION
// ============================================================================

/**
 * Initialize Flutterwave payment
 * @param {string} planKey - '1_month' or '3_month'
 * @param {string} email - User email
 * @returns {Promise<void>}
 */
async function initiateFlutterwavePayment(planKey, email) {
    try {
        const plan = SUBSCRIPTION_CONFIG.PLANS[planKey];
        if (!plan) {
            throw new Error('Invalid plan');
        }

        // Load Flutterwave script if not loaded
        if (!window.FlutterwaveCheckout) {
            const script = document.createElement('script');
            script.src = 'https://checkout.flutterwave.com/v3.js';
            script.async = true;
            script.onload = function() {
                executeFlutterwavePayment(planKey, email, plan);
            };
            document.body.appendChild(script);
        } else {
            executeFlutterwavePayment(planKey, email, plan);
        }
    } catch (error) {
        console.error('Error initiating Flutterwave payment:', error);
        showPaywallMessage('Payment error: ' + error.message);
    }
}

/**
 * Execute Flutterwave payment
 */
function executeFlutterwavePayment(planKey, email, plan) {
    window.FlutterwaveCheckout({
        public_key: SUBSCRIPTION_CONFIG.FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: 'TR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        amount: plan.price,
        currency: 'NGN',
        payment_options: 'card,mobilemoney,ussd',
        customer: {
            email: email
        },
        customizations: {
            title: 'ThinkRight Subscription',
            description: 'Subscribe to ' + plan.name + ' plan',
            logo: 'https://thinkright.com/logo.png'
        },
        onclose: function() {
            console.log('Payment window closed');
            showPaywallMessage('Payment cancelled. Please try again.');
        },
        callback: function(data) {
            console.log('✓ Payment response:', data);
            // Don't trust frontend - verify with Flutterwave API
            if (data.status === 'successful') {
                verifyFlutterwavePayment(data.transaction_id, planKey);
            } else {
                showPaywallMessage('Payment failed. Please try again.');
            }
        }
    });
}

/**
 * Verify Flutterwave payment using backend
 * This will call a Supabase Edge Function to securely verify with Flutterwave
 * 
 * @param {string} transactionId - Flutterwave transaction ID
 * @param {string} planKey - '1_month' or '3_month'
 * @returns {Promise<void>}
 */
async function verifyFlutterwavePayment(transactionId, planKey) {
    try {
        if (!supabase || !subscriptionState.user) {
            throw new Error('Supabase or user not initialized');
        }

        // Show loading state
        showPaywallMessage('Verifying payment, please wait...');

        // Call Supabase Edge Function to verify payment securely
        const { data, error } = await supabase.functions.invoke('verify-flutterwave-payment', {
            body: {
                transactionId: transactionId,
                userId: subscriptionState.user.id,
                planKey: planKey
            }
        });

        if (error) {
            console.error('Error calling verification function:', error);
            showPaywallMessage('Payment verification error. Please try again.');
            return;
        }

        if (data && data.success) {
            console.log('✓ Payment verified and subscription activated');
            
            // Refresh subscription data
            subscriptionState.initialized = false;
            await initSubscription();
            
            // Show success message and redirect
            showPaymentSuccessModal(planKey);
            
            // Redirect to dashboard after 3 seconds
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 3000);
        } else {
            console.error('Payment verification returned false:', data?.error);
            showPaywallMessage('Payment verification failed: ' + (data?.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error verifying Flutterwave payment:', error);
        showPaywallMessage('Error verifying payment: ' + error.message);
    }
}

// ============================================================================
// PAYWALL & MODAL DISPLAY
// ============================================================================

/**
 * Show paywall modal blocking access
 * @param {string} page - 'dashboard', 'tests', or 'syllabus'
 */
function showPaywallModal(page = 'tests') {
    // Close any existing paywall modal
    closePaywallModal();

    const modal = document.createElement('div');
    modal.id = 'paywallModal';
    modal.className = 'paywall-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'paywall-modal-content';
    
    const pageLabel = page === 'syllabus' ? 'syllabuses' : page;
    const userEmail = subscriptionState.user?.email || 'user@example.com';

    const html = `
        <div class="paywall-header">
            <h2>Premium Access Required</h2>
            <button class="paywall-close-btn" onclick="window.Subscription.closePaywallModal()">×</button>
        </div>
        
        <div class="paywall-body">
            <p class="paywall-message">
                Your trial has expired. Subscribe to continue accessing ${pageLabel}.
            </p>
            
            <div class="subscription-plans">
                <div class="plan-card">
                    <h3>1 Month</h3>
                    <div class="plan-price">₦1,499</div>
                    <ul class="plan-benefits">
                        <li>✓ Full test access</li>
                        <li>✓ Dashboard analytics</li>
                        <li>✓ Syllabus PDFs</li>
                    </ul>
                    <button class="plan-btn" onclick="window.Subscription.initiateFlutterwavePayment('1_month', '${userEmail}')">
                        Subscribe Now
                    </button>
                </div>
                
                <div class="plan-card featured">
                    <div class="featured-badge">POPULAR</div>
                    <h3>3 Months</h3>
                    <div class="plan-price">₦3,999 <span class="discount">-10%</span></div>
                    <ul class="plan-benefits">
                        <li>✓ Full test access</li>
                        <li>✓ Dashboard analytics</li>
                        <li>✓ Syllabus PDFs</li>
                    </ul>
                    <button class="plan-btn featured-btn" onclick="window.Subscription.initiateFlutterwavePayment('3_month', '${userEmail}')">
                        Subscribe Now
                    </button>
                </div>
            </div>
        </div>
        
        <div class="paywall-footer">
            <button class="close-paywall-btn" onclick="window.location.href = 'index.html'">Back to Home</button>
        </div>
    `;
    
    modalContent.innerHTML = html;
    modal.appendChild(modalContent);
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

/**
 * Show pricing modal with subscription details
 */
function showPricingModal() {
    // Close any existing modals
    closePricingModal();
    
    const modal = document.createElement('div');
    modal.id = 'pricingModal';
    modal.className = 'pricing-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'pricing-modal-content';
    
    const html = `
        <div class="pricing-header">
            <h2>Our Plans & Pricing</h2>
            <button class="pricing-close-btn" onclick="window.Subscription.closePricingModal()">×</button>
        </div>
        
        <div class="pricing-body">
            <p class="pricing-intro">Choose the plan that works best for you</p>
            
            <div class="pricing-plans">
                <div class="pricing-card free-card">
                    <h3>Free</h3>
                    <div class="pricing-price">₦0 <span class="per-period">/24 hours</span></div>
                    <p class="plan-description">Limited trial access</p>
                    <ul class="pricing-benefits">
                        <li>✓ Full test access for 24 hours</li>
                        <li>✓ View test results</li>
                        <li>✓ Dashboard analytics (limited)</li>
                        <li>✗ No syllabus access</li>
                        <li><strong>Expires after 24 hours</strong></li>
                    </ul>
                    <button class="pricing-btn disabled" disabled>Current Plan</button>
                </div>
                
                <div class="pricing-card standard-card">
                    <h3>1 Month</h3>
                    <div class="pricing-price">₦1,499 <span class="per-period">/month</span></div>
                    <p class="plan-description">Full month access</p>
                    <ul class="pricing-benefits">
                        <li>✓ Unlimited tests</li>
                        <li>✓ Full test access</li>
                        <li>✓ Dashboard analytics</li>
                        <li>✓ Syllabus PDFs</li>
                        <li><strong>30 days access</strong></li>
                    </ul>
                    <button class="pricing-btn primary-btn" onclick="window.Subscription.initiateFlutterwavePayment('1_month', '${subscriptionState.user?.email || 'user@example.com'}');">Get Started</button>
                </div>
                
                <div class="pricing-card premium-card featured">
                    <div class="pricing-badge">BEST VALUE</div>
                    <h3>3 Months</h3>
                    <div class="pricing-price">₦3,999 <span class="per-period">/3 months</span></div>
                    <p class="plan-description">Best savings</p>
                    <ul class="pricing-benefits">
                        <li>✓ Unlimited tests</li>
                        <li>✓ Full test access</li>
                        <li>✓ Dashboard analytics</li>
                        <li>✓ Syllabus PDFs</li>
                        <li><strong>90 days access</strong></li>
                        <li><strong style="color: #4CAF50;">Save 10% vs 1-month</strong></li>
                    </ul>
                    <button class="pricing-btn featured-btn" onclick="window.Subscription.initiateFlutterwavePayment('3_month', '${subscriptionState.user?.email || 'user@example.com'}');">Get Started</button>
                </div>
            </div>
            
            <div class="pricing-comparison">
                <h3>What's Included</h3>
                <table class="pricing-table">
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
                            <td>Duration</td>
                            <td>24 hours</td>
                            <td>30 days</td>
                            <td>90 days</td>
                        </tr>
                        <tr>
                            <td>Test Access</td>
                            <td>Full for 24hrs</td>
                            <td>Unlimited</td>
                            <td>Unlimited</td>
                        </tr>
                        <tr>
                            <td>Test Results</td>
                            <td>✓</td>
                            <td>✓</td>
                            <td>✓</td>
                        </tr>
                        <tr>
                            <td>Dashboard</td>
                            <td>✗</td>
                            <td>✓</td>
                            <td>✓</td>
                        </tr>
                        <tr>
                            <td>Syllabus PDFs</td>
                            <td>✗</td>
                            <td>✓</td>
                            <td>✓</td>
                        </tr>
                        <tr>
                            <td>Performance Analytics</td>
                            <td>✗</td>
                            <td>✓</td>
                            <td>✓</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="pricing-footer">
            <p class="pricing-note">All prices in Nigerian Naira (₦). Subscriptions renew automatically.</p>
        </div>
    `;
    
    modalContent.innerHTML = html;
    modal.appendChild(modalContent);
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
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
 * Close paywall modal
 */
function closePaywallModal() {
    const modal = document.getElementById('paywallModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Show simple message in paywall modal
 */
function showPaywallMessage(message) {
    // Close existing
    closePaywallModal();

    const modal = document.createElement('div');
    modal.id = 'paywallModal';
    modal.className = 'paywall-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'paywall-modal-content';
    
    const html = `
        <div class="paywall-header">
            <h2>Payment</h2>
            <button class="paywall-close-btn" onclick="window.Subscription.closePaywallModal()">×</button>
        </div>
        <div class="paywall-body">
            <p class="paywall-message">${message}</p>
        </div>
    `;
    
    modalContent.innerHTML = html;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

/**
 * Show payment success modal
 */
function showPaymentSuccessModal(planKey) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planKey];
    
    closePaywallModal();

    const modal = document.createElement('div');
    modal.id = 'paymentSuccessModal';
    modal.className = 'paywall-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'paywall-modal-content';
    
    const html = `
        <div class="paywall-header">
            <h2>✓ Payment Successful!</h2>
        </div>
        
        <div class="paywall-body">
            <p class="paywall-message" style="color: var(--color-success); font-size: 1.2rem;">
                You've successfully subscribed to the <strong>${plan.name}</strong> plan!
            </p>
            <p style="text-align: center; color: var(--color-text-secondary);">
                Redirecting to dashboard in 3 seconds...
            </p>
        </div>
    `;
    
    modalContent.innerHTML = html;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export functions for global use
window.Subscription = {
    init: initSubscription,
    isTrialActive,
    isSubscriptionActive,
    isAdmin,
    canAccessDashboard,
    canAccessTests,
    canAccessSyllabus,
    getAccessStatus,
    getTrialTimeReadable,
    createTrialForNewUser,
    initiateFlutterwavePayment,
    verifyFlutterwavePayment,
    showPaywallModal,
    closePaywallModal,
    showPaywallMessage,
    showPaymentSuccessModal,
    showPricingModal,
    closePricingModal
};
