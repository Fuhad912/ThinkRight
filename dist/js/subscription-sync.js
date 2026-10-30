/**
 * THINKRIGHT - SUBSCRIPTION SYNC (100% FREE ACCESS)
 * 
 * Ensures all components have unrestricted access to all features.
 */

(function () {
  'use strict';

  function installOverrides() {
    if (!window.Subscription) return;

    window.Subscription.isPremium = function () {
      return true;
    };

    window.Subscription.canAccessDashboard = function () {
      return true;
    };

    window.Subscription.canAccessSyllabus = function () {
      return true;
    };

    window.Subscription.canAccessTests = function () {
      return true;
    };

    window.Subscription.tryStartTest = async function () {
      return {
        allowed: true,
        premium: true,
        free_tests_used: 0
      };
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installOverrides);
  } else {
    installOverrides();
  }
})();
