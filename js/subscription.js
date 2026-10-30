/**
 * THINKRIGHT - SUBSCRIPTION & ACCESS SYSTEM (100% FREE TIER)
 * 
 * All features, tests, syllabi, and dashboard analytics are free and
 * unrestricted for all registered users. Payment gateways have been removed.
 */

(function () {
    'use strict';

    const subscriptionState = {
        user: null,
        metadata: null,
        subscription: {
            plan: 'free',
            status: 'active',
            is_premium: true,
            expires_at: null
        },
        profile: null,
        initialized: true
    };

    async function getCurrentUser() {
        if (window.supabase && window.supabase.auth) {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                return user || null;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    async function init() {
        try {
            const user = await getCurrentUser();
            if (user) {
                subscriptionState.user = user;
                subscriptionState.metadata = user.user_metadata || {};
            }
        } catch (e) {
            // non-fatal
        }
        subscriptionState.initialized = true;
        return true;
    }

    function isPremium() {
        return true;
    }

    function canAccessDashboard() {
        return true;
    }

    function canAccessTests() {
        return true;
    }

    function canAccessSyllabus() {
        return true;
    }

    function getFreeTestsUsed() {
        return 0;
    }

    function getRemainingFreeTests() {
        return Infinity;
    }

    async function tryStartTest() {
        return {
            allowed: true,
            premium: true,
            free_tests_used: 0
        };
    }

    async function consumeFreeTest() {
        return {
            allowed: true,
            premium: true,
            free_tests_used: 0
        };
    }

    function getPremiumStatus() {
        return {
            is_premium: true,
            subscription_plan: 'free',
            subscription_status: 'active',
            subscription_started_at: null,
            subscription_expires_at: null
        };
    }

    function getSubscription() {
        return {
            plan: 'free',
            status: 'active',
            is_premium: true,
            expires_at: null
        };
    }

    async function ensureSubscriptionValid() {
        return true;
    }

    async function refreshMetadata() {
        return true;
    }

    function showPricingModal() {
        // No-op: Platform is 100% free
    }

    function closePricingModal() {
        // No-op
    }

    function showPaywallModal() {
        // No-op: Platform is 100% free
    }

    function closePaywallModal() {
        // No-op
    }

    function initiatePremiumPayment() {
        // No-op: Payment gateway removed
    }

    async function cancelSubscription() {
        return { success: true };
    }

    async function updateSubscriptionAfterPayment() {
        return { success: true };
    }

    window.Subscription = {
        init,
        isPremium,
        canAccessDashboard,
        canAccessTests,
        canAccessSyllabus,
        getFreeTestsUsed,
        getRemainingFreeTests,
        tryStartTest,
        consumeFreeTest,
        getPremiumStatus,
        getSubscription,
        ensureSubscriptionValid,
        refreshMetadata,
        showPricingModal,
        closePricingModal,
        showPaywallModal,
        closePaywallModal,
        initiatePremiumPayment,
        cancelSubscription,
        updateSubscriptionAfterPayment
    };

    window.showPricingModal = showPricingModal;
    window.closePricingModal = closePricingModal;

    document.addEventListener('DOMContentLoaded', () => {
        init().catch(() => null);
    });
})();
