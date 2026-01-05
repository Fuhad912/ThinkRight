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

/**
 * Initialize subscription system
 * Called on app startup
 */
async function initSubscription() {
    try {
        // Return if already initialized
        if (subscriptionState.initialized) {
            return true;
        }

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
        const subData = await fetchSubscriptionData(user.id);
        subscriptionState.subscriptionData = subData;
        subscriptionState.lastChecked = Date.now();
        
        // Check if user is admin
        subscriptionState.isAdmin = subData?.is_admin === true;
        subscriptionState.initialized = true;
        
        console.log('✓ Subscription system initialized');
        console.log('  Admin:', subscriptionState.isAdmin);
        console.log('  Trial Active:', isTrialActive());
        console.log('  Subscription Active:', isSubscriptionActive());
        
        return true;
    } catch (error) {
        console.error('Error initializing subscription:', error);
        return false;
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

        const { data, error } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            // No record found is OK - user hasn't been set up yet
            if (error.code === 'PGRST116') {
                console.log('No subscription record found for user');
                return null;
            }
            console.error('Error fetching subscription:', error);
            return null;
        }

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
 * @returns {boolean} True if trial is active
 */
function isTrialActive() {
    const subData = subscriptionState.subscriptionData;
    
    if (!subData || !subData.trial_ends_at) {
        return false;
    }

    const now = new Date();
    const trialEnds = new Date(subData.trial_ends_at);
    
    return now < trialEnds;
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
    
    if (!subData) {
        return false;
    }

    if (!subData.is_active) {
        return false;
    }

    if (subData.subscription_ends_at) {
        const now = new Date();
        const subEnds = new Date(subData.subscription_ends_at);
        return now < subEnds;
    }

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
    if (isAdmin()) return true;
    if (isTrialActive()) return true;
    if (isSubscriptionActive()) return true;
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
    if (isAdmin()) return true;
    if (isTrialActive()) return true;
    if (isSubscriptionActive()) return true;
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
            console.error('Missing supabase or userId');
            return false;
        }

        // Calculate trial end time (24 hours from now)
        const now = new Date();
        const trialEnds = new Date(now.getTime() + SUBSCRIPTION_CONFIG.TRIAL_DURATION_HOURS * 60 * 60 * 1000);

        console.log('Creating trial for user:', userId);
        console.log('Trial ends at:', trialEnds.toISOString());

        // Insert into user_subscriptions table
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
            console.error('Error creating trial:', error);
            return false;
        }

        console.log('✓ Trial created for user:', userId);
        console.log('Trial data:', data);
        
        // Reset subscription state so it reloads
        subscriptionState.initialized = false;
        subscriptionState.subscriptionData = null;
        
        // Refresh subscription data
        const refreshed = await initSubscription();
        
        return refreshed;
    } catch (error) {
        console.error('Error creating trial:', error);
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
